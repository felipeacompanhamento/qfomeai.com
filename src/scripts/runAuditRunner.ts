import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

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

const VALID_ACCOUNT_TYPES = ['CLIENT', 'RESTAURANT', 'DRIVER', 'ADMIN'];
const VALID_ROLES = [
  'OWNER',
  'RESTAURANT_ADMIN',
  'MANAGER',
  'WAITER',
  'DRIVER',
  'CASHIER',
  'KITCHEN',
  'CLIENT',
  'ADMIN'
];
const INTERNAL_ROLES = [
  'OWNER',
  'RESTAURANT_ADMIN',
  'MANAGER',
  'WAITER',
  'CASHIER',
  'KITCHEN'
];

async function runAudit() {
  console.log('=== INICIANDO AUDITORIA AUTOMÁTICA DE USUÁRIOS E COMPATIBILIDADE LEGADA ===\n');

  const usersSnap = await db.collection('users').get();
  const restaurantsSnap = await db.collection('restaurants').get();

  const restaurantIds = new Set(restaurantsSnap.docs.map(d => d.id));
  const userMap = new Map<string, any>();
  const emailMap = new Map<string, string[]>();
  const phoneMap = new Map<string, string[]>();
  const restaurantOwnersMap = new Map<string, string[]>();

  const warnings: string[] = [];
  const criticalErrors: string[] = [];
  const conflicts: string[] = [];
  const legacyUsers: string[] = [];
  const blockedRestaurantsSet = new Set<string>();

  let totalAnalyzed = usersSnap.size;
  let totalValid = 0;

  for (const docSnap of usersSnap.docs) {
    const uid = docSnap.id;
    const data = docSnap.data();
    userMap.set(uid, data);

    let userHasCritical = false;

    // Check 1: Usuários canônicos sem uid válido
    if (!data.uid && !data.id) {
      criticalErrors.push(`[UID Inválido] Usuário ${uid}: Sem campo uid/id no documento.`);
      userHasCritical = true;
    } else if (data.uid && data.uid !== uid) {
      criticalErrors.push(`[UID Divergente] Usuário ${uid}: ID do doc (${uid}) diferente do uid (${data.uid}).`);
      userHasCritical = true;
    }

    // Check 6: Duplicados por email ou telefone
    const email = (data.email || data.email_address || '').toLowerCase().trim();
    const phone = (data.phone || data.telefone || data.phone_number || '').replace(/\D/g, '');

    if (email) {
      if (!emailMap.has(email)) emailMap.set(email, []);
      emailMap.get(email)!.push(uid);
    }
    if (phone && phone.length >= 8) {
      if (!phoneMap.has(phone)) phoneMap.set(phone, []);
      phoneMap.get(phone)!.push(uid);
    }

    // Check 7: Usuários legados ainda não migrados
    const isExplicitCanonical = Boolean(data.accountType && data.role && data._migratedAt);
    if (!isExplicitCanonical) {
      legacyUsers.push(uid);
      warnings.push(`[Legado Pendente] Usuário ${uid} (${email || 'sem e-mail'}): Depende da estrutura/inferência legada.`);
    }

    const accountType = data.accountType;
    const role = data.role;
    const legacyTipo = data.tipo_usuario || '';
    const restaurantId = data.restaurantId || data.restaurante_id || data.restaurant_id;

    // Check 4: Perfis inválidos
    if (accountType && !VALID_ACCOUNT_TYPES.includes(accountType)) {
      criticalErrors.push(`[Perfil Inválido] Usuário ${uid}: accountType '${accountType}' não reconhecido.`);
      userHasCritical = true;
    }
    if (role && !VALID_ROLES.includes(role)) {
      criticalErrors.push(`[Role Inválida] Usuário ${uid}: role '${role}' não reconhecida.`);
      userHasCritical = true;
    }

    const isInternal = accountType === 'RESTAURANT' || 
                       INTERNAL_ROLES.includes(role) || 
                       ['restaurant', 'restaurante', 'gerente', 'garcom', 'caixa', 'cozinha'].includes(legacyTipo);

    // Check 2: Usuários internos sem restaurantId
    if (isInternal && role !== 'ADMIN' && legacyTipo !== 'admin') {
      if (!restaurantId) {
        criticalErrors.push(`[Sem Restaurante] Usuário interno ${uid} (${data.name || email}): Ausência de 'restaurantId'.`);
        userHasCritical = true;
      } else if (typeof restaurantId === 'string' && !restaurantIds.has(restaurantId)) {
        criticalErrors.push(`[Restaurante Inexistente] Usuário interno ${uid}: Refere-se ao restaurantId inexistente '${restaurantId}'.`);
        userHasCritical = true;
      }
    }

    // Check 3: Usuários internos vinculados a mais de um restaurante
    if (Array.isArray(restaurantId)) {
      conflicts.push(`[Múltiplos Vínculos] Usuário ${uid}: Possui múltiplos restaurantIds [${restaurantId.join(', ')}].`);
      criticalErrors.push(`[Múltiplos Vínculos] Usuário ${uid}: Vínculo em formato de array com múltiplos restaurantes.`);
      userHasCritical = true;
    }

    // Check 14: PLATFORM_ADMIN com restaurantId
    if ((accountType === 'ADMIN' || role === 'ADMIN' || legacyTipo === 'admin') && restaurantId) {
      warnings.push(`[Vínculo Admin] PLATFORM_ADMIN ${uid} possui 'restaurantId' (${restaurantId}).`);
    }

    // Check 15: CLIENT com perfil interno
    if (accountType === 'CLIENT' && INTERNAL_ROLES.includes(role)) {
      criticalErrors.push(`[Conflito Perfil] ${uid}: accountType CLIENT com role interna '${role}'.`);
      userHasCritical = true;
    }

    // Check 16: WAITER, DRIVER, CASHIER ou KITCHEN sem vínculo operacional válido
    if (['WAITER', 'CASHIER', 'KITCHEN'].includes(role) && !restaurantId) {
      criticalErrors.push(`[Operacional Orfão] Perfil ${role} ${uid} sem restaurantId.`);
      userHasCritical = true;
    }

    // Check 9: Status inconsistente
    if (data.status === 'INACTIVE' && data.active === true) {
      warnings.push(`[Status Inconsistente] Usuário ${uid}: status=INACTIVE porém active=true.`);
    }

    // Check 8: createdBy para usuário inexistente
    if (data.createdBy && !userMap.has(data.createdBy)) {
      warnings.push(`[Referência Quebrada] Usuário ${uid}: createdBy aponta para '${data.createdBy}' inexistente.`);
    }

    // Map Owners
    if (restaurantId && typeof restaurantId === 'string' && (role === 'OWNER' || legacyTipo === 'restaurant' || legacyTipo === 'restaurante')) {
      if (data.status !== 'INACTIVE' && data.active !== false) {
        if (!restaurantOwnersMap.has(restaurantId)) restaurantOwnersMap.set(restaurantId, []);
        restaurantOwnersMap.get(restaurantId)!.push(uid);
      }
    }

    if (!userHasCritical && isExplicitCanonical) {
      totalValid++;
    }
  }

  // Duplicados
  emailMap.forEach((uids, emailStr) => {
    if (uids.length > 1) {
      conflicts.push(`[Email Duplicado] '${emailStr}' presente em UIDs: ${uids.join(', ')}`);
    }
  });
  phoneMap.forEach((uids, phoneStr) => {
    if (uids.length > 1) {
      conflicts.push(`[Telefone Duplicado] '${phoneStr}' presente em UIDs: ${uids.join(', ')}`);
    }
  });

  // Check 12 & 13: Restaurantes sem OWNER ou com múltiplos
  for (const restDoc of restaurantsSnap.docs) {
    const rId = restDoc.id;
    const owners = restaurantOwnersMap.get(rId) || [];

    if (owners.length === 0) {
      warnings.push(`[Sem Owner] Restaurante '${rId}' (${restDoc.data().name || 'Sem nome'}): Nenhum OWNER ativo.`);
      blockedRestaurantsSet.add(rId);
    } else if (owners.length > 1) {
      warnings.push(`[Múltiplos Owners] Restaurante '${rId}': ${owners.length} OWNERs ativos (${owners.join(', ')}).`);
    }
  }

  usersSnap.docs.forEach(d => {
    const rId = d.data().restaurantId || d.data().restaurante_id;
    if (rId && typeof rId === 'string' && (!d.data().accountType || !d.data().role)) {
      blockedRestaurantsSet.add(rId);
    }
  });

  const recommendations: string[] = [];
  if (criticalErrors.length > 0) {
    recommendations.push(`Corrigir os ${criticalErrors.length} erros críticos antes de desativar a compatibilidade legada.`);
  }

  if (legacyUsers.length > 0) {
    recommendations.push(`Executar a migração canônica para os ${legacyUsers.length} usuários legados.`);
  }

  if (blockedRestaurantsSet.size > 0) {
    recommendations.push(`${blockedRestaurantsSet.size} restaurante(s) bloqueado(s) para remoção do legado devido a pendências de migração.`);
  }

  const systemAptoForDisableLegacy = criticalErrors.length === 0;

  const result = {
    totalAnalyzed,
    totalValid,
    criticalErrorsCount: criticalErrors.length,
    warningsCount: warnings.length,
    conflictsCount: conflicts.length,
    legacyUsersCount: legacyUsers.length,
    blockedRestaurantsCount: blockedRestaurantsSet.size,
    systemAptoForDisableLegacy,
    criticalErrors,
    conflicts,
    warnings,
    blockedRestaurants: Array.from(blockedRestaurantsSet),
    recommendations
  };

  console.log('=== RESULTADO DA AUDITORIA ===');
  console.log(`Total Analisado: ${totalAnalyzed}`);
  console.log(`Total Válido Canônico: ${totalValid}`);
  console.log(`Avisos: ${warnings.length}`);
  console.log(`Erros Críticos: ${criticalErrors.length}`);
  console.log(`Conflitos: ${conflicts.length}`);
  console.log(`Usuários com dependência legada: ${legacyUsers.length}`);
  console.log(`Restaurantes bloqueados para remoção do legado: ${blockedRestaurantsSet.size}`);
  console.log(`SISTEMA APTO PARA DESATIVAR COMPATIBILIDADE LEGADA: ${systemAptoForDisableLegacy ? 'SIM (APROVADO)' : 'NÃO (BLOQUEADO)'}\n`);

  if (criticalErrors.length > 0) {
    console.log('--- ERROS CRÍTICOS DETALHADOS ---');
    criticalErrors.forEach(e => console.log(' ❌ ' + e));
  }

  if (conflicts.length > 0) {
    console.log('\n--- CONFLITOS DETALHADOS ---');
    conflicts.forEach(c => console.log(' ⚠️ ' + c));
  }

  if (warnings.length > 0) {
    console.log('\n--- AVISOS DETALHADOS ---');
    warnings.slice(0, 20).forEach(w => console.log(' ℹ️ ' + w));
    if (warnings.length > 20) console.log(` ... e mais ${warnings.length - 20} avisos.`);
  }

  console.log('\n--- RECOMENDAÇÕES ---');
  recommendations.forEach(r => console.log(' 📌 ' + r));

  return result;
}

runAudit().catch(console.error);
