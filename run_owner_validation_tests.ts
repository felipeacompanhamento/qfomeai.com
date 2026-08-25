import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase Admin
let adminApp: admin.app.App;
try {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim() !== '' 
        ? process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
        : '{}';
      let serviceAccount = serviceAccountJson.startsWith('{') 
        ? JSON.parse(serviceAccountJson) 
        : JSON.parse(Buffer.from(serviceAccountJson, 'base64').toString('utf8'));
      credential = admin.credential.cert(serviceAccount);
    } catch (parseError: any) {
      credential = admin.credential.applicationDefault();
    }
  } else {
    credential = admin.credential.applicationDefault();
  }

  if (admin.apps.length === 0) {
    adminApp = admin.initializeApp({ credential, projectId });
  } else {
    adminApp = admin.app();
  }
} catch (error: any) {
  if (admin.apps.length === 0) {
    adminApp = admin.initializeApp({ projectId: firebaseConfig.projectId });
  } else {
    adminApp = admin.app();
  }
}

const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
  ? firebaseConfig.firestoreDatabaseId 
  : undefined;

const db = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
const authAdmin = getAuth(adminApp);

async function createTestUser(uid: string, email: string, name: string, role: string, restaurantId: string) {
  try {
    await authAdmin.deleteUser(uid);
  } catch (e: any) {}

  await authAdmin.createUser({
    uid,
    email,
    displayName: name,
    password: 'Password123!'
  });

  await db.collection('users').doc(uid).set({
    uid,
    email,
    nome: name,
    role,
    tipo_usuario: role,
    restaurantId,
    active: true,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  });

  await db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(uid).set({
    uid,
    email,
    nome: name,
    role,
    active: true,
    primaryOwner: role === 'OWNER' || role === 'RESTAURANT_OWNER'
  });
}

/**
 * Backend logic simulation for getPrimaryOwnerUidForRestaurant and validatePrimaryOwnerRequest
 */
async function getPrimaryOwnerUidForRestaurant(restaurantId: string): Promise<string | null> {
  if (!restaurantId) return null;

  try {
    const restSnap = await db.collection('restaurants').doc(restaurantId).get();
    if (!restSnap.exists) return null;

    const rData = restSnap.data() || {};

    // 1. Check canonical fields on the restaurant document
    const canonicalUid = rData.primaryOwnerUid || rData.ownerUid || rData.owner_uid || rData.ownerId || rData.created_by || rData.createdBy;

    if (canonicalUid && typeof canonicalUid === 'string') {
      const userDoc = await db.collection('users').doc(canonicalUid).get();
      if (userDoc.exists) {
        const uData = userDoc.data() || {};
        const uRole = (uData.role || uData.tipo_usuario || '').toUpperCase();
        if ((uRole === 'OWNER' || uRole === 'RESTAURANT' || uRole === 'RESTAURANTE' || uRole === 'RESTAURANT_OWNER') && (uData.restaurantId === restaurantId || canonicalUid === restaurantId)) {
          return canonicalUid;
        }
      }
    }

    // 2. Fallback check: document ID itself if users/{restaurantId} exists as an OWNER for this restaurant
    const defaultUserSnap = await db.collection('users').doc(restaurantId).get();
    if (defaultUserSnap.exists) {
      const uData = defaultUserSnap.data() || {};
      const uRole = (uData.role || uData.tipo_usuario || '').toUpperCase();
      if ((uRole === 'OWNER' || uRole === 'RESTAURANT' || uRole === 'RESTAURANTE' || uRole === 'RESTAURANT_OWNER' || uData.accountType === 'RESTAURANT') && (uData.restaurantId === restaurantId || defaultUserSnap.id === restaurantId)) {
        return restaurantId;
      }
    }

    // 3. Search staffProfiles for a profile explicitly flagged as primaryOwner/isMainOwner
    const staffSnap = await db.collection('restaurants').doc(restaurantId).collection('staffProfiles')
      .where('role', '==', 'OWNER')
      .get();

    for (const doc of staffSnap.docs) {
      const sp = doc.data();
      if (sp.primaryOwner === true || sp.isMainOwner === true) {
        const userDoc = await db.collection('users').doc(doc.id).get();
        if (userDoc.exists) {
          const uData = userDoc.data() || {};
          const uRole = (uData.role || uData.tipo_usuario || '').toUpperCase();
          if ((uRole === 'OWNER' || uRole === 'RESTAURANT' || uRole === 'RESTAURANTE' || uRole === 'RESTAURANT_OWNER') && uData.restaurantId === restaurantId) {
            return doc.id;
          }
        }
      }
    }
  } catch (err) {
    console.error('Error fetching Primary Owner UID:', err);
  }

  return null;
}

async function validatePrimaryOwnerRequest(requesterUid: string, requesterRole: string, requesterRestaurantId: string, targetRestaurantId: string): Promise<{ success: boolean; status: number; error?: string; primaryOwnerUid?: string }> {
  if (!targetRestaurantId || requesterRestaurantId !== targetRestaurantId) {
    return { success: false, status: 403, error: 'Apenas o Proprietário Principal do restaurante pode solicitar ou executar a limpeza de dados.' };
  }

  const primaryOwnerUid = await getPrimaryOwnerUidForRestaurant(targetRestaurantId);

  if (!primaryOwnerUid) {
    return { success: false, status: 400, error: 'Configuração do Proprietário Principal inválida ou não encontrada para este restaurante.' };
  }

  const opRole = (requesterRole || '').toUpperCase();
  const isOwnerRole = opRole === 'OWNER' || opRole === 'RESTAURANT' || opRole === 'RESTAURANTE' || opRole === 'RESTAURANT_OWNER';

  if (!isOwnerRole || requesterUid !== primaryOwnerUid) {
    return { success: false, status: 403, error: 'Apenas o Proprietário Principal do restaurante pode solicitar ou executar a limpeza de dados.' };
  }

  return { success: true, status: 200, primaryOwnerUid };
}

async function runOwnerValidationTestSuite() {
  console.log('=== TESTES DE VALIDAÇÃO E PROTEÇÃO DO PROPRIETÁRIO PRINCIPAL ===\n');

  let allPassed = true;
  const restId = 'test_owner_validation_rest';
  const primaryOwnerUid = 'primary_owner_valid_uid';
  const secondaryOwnerUid = 'secondary_owner_uid';
  const adminUid = 'admin_uid';
  const foreignOwnerUid = 'foreign_owner_uid';
  const foreignRestId = 'test_foreign_rest';

  // Seed data
  await db.collection('restaurants').doc(restId).set({
    id: restId,
    nome: 'Restaurante Validação Dono',
    primaryOwnerUid: primaryOwnerUid,
    em_manutencao: false
  });

  await db.collection('restaurants').doc(foreignRestId).set({
    id: foreignRestId,
    nome: 'Restaurante Estrangeiro',
    primaryOwnerUid: foreignOwnerUid,
    em_manutencao: false
  });

  await createTestUser(primaryOwnerUid, 'primary@owner.com', 'Proprietário Principal', 'OWNER', restId);
  await createTestUser(secondaryOwnerUid, 'secondary@owner.com', 'Dono Secundário', 'OWNER', restId);
  await createTestUser(adminUid, 'admin@rest.com', 'Administrador', 'ADMIN', restId);
  await createTestUser(foreignOwnerUid, 'foreign@owner.com', 'Dono Outro Restaurante', 'OWNER', foreignRestId);

  // TEST 1: Primary Owner executing cleanup
  console.log('1. Testando Proprietário Principal verdadeiro executando a limpeza...');
  const res1 = await validatePrimaryOwnerRequest(primaryOwnerUid, 'OWNER', restId, restId);
  const t1Passed = res1.success && res1.primaryOwnerUid === primaryOwnerUid;
  console.log(`   Resultado: ${t1Passed ? 'PASSED ✅' : 'FAILED ❌'} (Status: ${res1.status})\n`);
  if (!t1Passed) allPassed = false;

  // TEST 2: Secondary OWNER attempting cleanup
  console.log('2. Testando OWNER secundário tentando executar a limpeza...');
  const res2 = await validatePrimaryOwnerRequest(secondaryOwnerUid, 'OWNER', restId, restId);
  const t2Passed = !res2.success && res2.status === 403 && res2.error?.includes('Proprietário Principal');
  console.log(`   Resultado: ${t2Passed ? 'PASSED ✅' : 'FAILED ❌'} (Erro: "${res2.error}")\n`);
  if (!t2Passed) allPassed = false;

  // TEST 3: Administrator attempting cleanup
  console.log('3. Testando Administrador tentando executar a limpeza...');
  const res3 = await validatePrimaryOwnerRequest(adminUid, 'ADMIN', restId, restId);
  const t3Passed = !res3.success && res3.status === 403 && res3.error?.includes('Proprietário Principal');
  console.log(`   Resultado: ${t3Passed ? 'PASSED ✅' : 'FAILED ❌'} (Erro: "${res3.error}")\n`);
  if (!t3Passed) allPassed = false;

  // TEST 4: User from another restaurant attempting cleanup
  console.log('4. Testando usuário de outro restaurante tentando executar a limpeza...');
  const res4 = await validatePrimaryOwnerRequest(foreignOwnerUid, 'OWNER', foreignRestId, restId);
  const t4Passed = !res4.success && res4.status === 403;
  console.log(`   Resultado: ${t4Passed ? 'PASSED ✅' : 'FAILED ❌'} (Status: ${res4.status})\n`);
  if (!t4Passed) allPassed = false;

  // TEST 5: Restaurant without Primary Owner defined
  console.log('5. Testando restaurante sem Proprietário Principal definido...');
  const orphanRestId = 'test_orphan_rest';
  await db.collection('restaurants').doc(orphanRestId).set({
    id: orphanRestId,
    nome: 'Restaurante Sem Dono',
    em_manutencao: false
  });
  const res5 = await validatePrimaryOwnerRequest('some_user', 'OWNER', orphanRestId, orphanRestId);
  const t5Passed = !res5.success && res5.status === 400 && res5.error?.includes('inválida ou não encontrada');
  console.log(`   Resultado: ${t5Passed ? 'PASSED ✅' : 'FAILED ❌'} (Erro: "${res5.error}")\n`);
  if (!t5Passed) allPassed = false;

  // TEST 6: Preservation of Primary Owner
  console.log('6. Verificando preservação do Proprietário Principal...');
  const pUserDoc = await db.collection('users').doc(primaryOwnerUid).get();
  const pStaffDoc = await db.collection('restaurants').doc(restId).collection('staffProfiles').doc(primaryOwnerUid).get();
  const pAuthUser = await authAdmin.getUser(primaryOwnerUid);

  const t6Passed = pUserDoc.exists && pStaffDoc.exists && pAuthUser.uid === primaryOwnerUid && !pAuthUser.disabled;
  console.log(`   Resultado: ${t6Passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  if (!t6Passed) allPassed = false;

  console.log('=====================================================');
  if (allPassed) {
    console.log('🎉 TODOS OS TESTES DE VALIDAÇÃO DO PROPRIETÁRIO PASSARAM COM SUCESSO! 🎉');
  } else {
    console.error('❌ HOUVE FALHAS NOS TESTES DE VALIDAÇÃO DO PROPRIETÁRIO.');
  }
}

runOwnerValidationTestSuite().catch(err => {
  console.error('Erro na execução da suíte de validação do proprietário:', err);
  process.exit(1);
});
