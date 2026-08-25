import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
} else {
  credential = admin.credential.applicationDefault();
}

admin.initializeApp({
  credential,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'flutterflow-buscando-sheets'
});

const dbId = process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-62098aac-79bb-45ec-a026-48c52eebeb00';
const db = getFirestore(admin.app(), dbId);

async function disableLegacy() {
  console.log('=== DESATIVANDO COMPATIBILIDADE LEGADA (REMOÇÃO CONTROLADA) ===\n');

  // 1. Run quick pre-check
  const usersSnap = await db.collection('users').get();
  let criticalCount = 0;

  usersSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    if (!data.accountType || !data.role) {
      console.error(`Erro crítico: Usuário ${docSnap.id} não possui accountType/role canônicos.`);
      criticalCount++;
    }
  });

  if (criticalCount > 0) {
    console.error(`ABORTANDO: ${criticalCount} usuário(s) não estão migrados para o modelo canônico.`);
    process.exit(1);
  }

  // 2. Set system_config/legacy_compatibility
  const now = new Date().toISOString();
  await db.collection('system_config').doc('legacy_compatibility').set({
    legacyUserCompatibilityEnabled: false,
    legacyUserCompatibilityByRestaurant: {},
    updatedAt: now,
    updatedBy: 'system_admin_prompt_4.8.16'
  }, { merge: true });

  // 3. Record Audit Log
  await db.collection('audit_logs').add({
    changedBy: 'system_admin_prompt_4.8.16',
    changedAt: now,
    action: 'DISABLE_LEGACY_COMPATIBILITY',
    newValue: false,
    scope: 'GLOBAL',
    details: 'Compatibilidade legada de usuários desativada com sucesso após validação de 100% de usuários migrados.'
  });

  console.log('Compatibilidade legada desativada com sucesso!');
  console.log('Configuração salva em system_config/legacy_compatibility { legacyUserCompatibilityEnabled: false }');
  console.log('Log registrado em audit_logs.');
}

disableLegacy().catch(console.error);
