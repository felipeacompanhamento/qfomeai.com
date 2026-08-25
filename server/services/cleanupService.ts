import type { Firestore } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';

// Helper function to count safely using firestore count aggregation
export const countCollectionSafe = async (collectionRef: any) => {
  try {
    const snap = await collectionRef.count().get();
    return snap.data().count;
  } catch (err: any) {
    logger.error('Error counting collection:', { error: err.message });
    try {
      const snap = await collectionRef.select().get();
      return snap.size;
    } catch (err2) {
      return 0;
    }
  }
};

// Helper function for real data cleanup operations
export async function savePaginatedBackup(
  db: any,
  rId: string,
  cleanupReqId: string,
  backupName: string,
  modalidade: string,
  items: Array<{ id: string; collection: string; data: any }>
): Promise<{ success: boolean; chunkCount: number; totalRecords: number; error?: string }> {
  const backupRef = db.collection('restaurants')
    .doc(rId)
    .collection('dataCleanupRequests')
    .doc(cleanupReqId)
    .collection('backup')
    .doc(backupName);

  try {
    const totalRecords = items.length;
    const CHUNK_SIZE = 150;
    const totalChunks = Math.ceil(totalRecords / CHUNK_SIZE) || 1;
    const chunkReferences: string[] = [];

    // Clean old chunks if any
    const existingChunks = await backupRef.collection('chunks').get();
    for (const doc of existingChunks.docs) {
      await doc.ref.delete();
    }

    for (let i = 0; i < totalChunks; i++) {
      const chunkItems = items.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkRef = backupRef.collection('chunks').doc(`chunk_${i}`);
      await chunkRef.set({
        chunkIndex: i,
        recordCount: chunkItems.length,
        items: JSON.stringify(chunkItems),
        createdAt: new Date().toISOString()
      });
      chunkReferences.push(`chunks/chunk_${i}`);
    }

    const nowIso = new Date().toISOString();
    await backupRef.set({
      requestId: cleanupReqId,
      restaurantId: rId,
      modalidade,
      backupName,
      data: nowIso,
      createdAt: nowIso,
      quantidadeDeRegistros: totalRecords,
      totalRecords,
      referenciaDosArquivosOuPaginas: chunkReferences,
      chunkReferences,
      chunkCount: totalChunks,
      statusDoBackup: 'SUCCESS',
      status: 'SUCCESS'
    });

    return { success: true, chunkCount: totalChunks, totalRecords };
  } catch (err: any) {
    logger.error(`[CLEANUP BACKUP ERROR] Backup failed`, { error: err.message });
    await backupRef.set({
      requestId: cleanupReqId,
      restaurantId: rId,
      modalidade,
      backupName,
      data: new Date().toISOString(),
      quantidadeDeRegistros: items.length,
      referenciaDosArquivosOuPaginas: [],
      statusDoBackup: 'FAILED',
      status: 'FAILED',
      error: err.message || 'Falha na gravação do backup.'
    }).catch(() => {});

    return { success: false, chunkCount: 0, totalRecords: items.length, error: err.message || 'Falha na gravação do backup.' };
  }
}

export const deleteDocAndSubcollectionsRecursively = async (db: any, docRef: any) => {
  if (typeof db.recursiveDelete === 'function') {
    await db.recursiveDelete(docRef);
  } else {
    try {
      const collections = await docRef.listCollections();
      for (const col of collections) {
        while (true) {
          const subSnap = await col.limit(100).get();
          if (subSnap.empty) break;
          for (const subDoc of subSnap.docs) {
            await deleteDocAndSubcollectionsRecursively(db, subDoc.ref);
          }
        }
      }
    } catch (e) {}
    await docRef.delete();
  }
};

export const deleteQueryRecursively = async (db: any, query: any) => {
  let count = 0;
  while (true) {
    const snap = await query.limit(50).get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      await deleteDocAndSubcollectionsRecursively(db, doc.ref);
      count++;
    }
  }
  return count;
};

export async function verifyOrdersCleanupComplete(db: any, rId: string): Promise<{ isClean: boolean; remainingCollections: string[] }> {
  const remainingCollections: string[] = [];

  const checks = [
    { name: 'orders', query: db.collection('restaurants').doc(rId).collection('orders').limit(1) },
    { name: 'deliveries', query: db.collection('restaurants').doc(rId).collection('deliveries').limit(1) },
    { name: 'caixas', query: db.collection('restaurants').doc(rId).collection('caixas').limit(1) },
    { name: 'contasReceber', query: db.collection('restaurants').doc(rId).collection('contasReceber').limit(1) },
    { name: 'contasPagar', query: db.collection('restaurants').doc(rId).collection('contasPagar').limit(1) },
    { name: 'tabs (restaurante)', query: db.collection('restaurants').doc(rId).collection('tabs').limit(1) },
    { name: 'tabs (global)', query: db.collection('tabs').where('restaurantId', '==', rId).limit(1) },
    { name: 'rounds (restaurante)', query: db.collection('restaurants').doc(rId).collection('rounds').limit(1) },
    { name: 'rounds (global)', query: db.collection('rounds').where('restaurantId', '==', rId).limit(1) },
    { name: 'integration_logs', query: db.collection('restaurants').doc(rId).collection('integration_logs').limit(1) },
    { name: 'processedActions', query: db.collection('restaurants').doc(rId).collection('processedActions').limit(1) }
  ];

  for (const check of checks) {
    const snap = await check.query.get();
    if (!snap.empty) {
      remainingCollections.push(check.name);
    }
  }

  return {
    isClean: remainingCollections.length === 0,
    remainingCollections
  };
}

export async function verifyCommercialCleanupComplete(db: any, rId: string): Promise<{ isClean: boolean; remainingCollections: string[] }> {
  const remainingCollections: string[] = [];
  const subcollectionsToDelete = [
    'products', 'categories', 'sizes', 'extras', 'optionGroups', 'optionItems',
    'option_groups', 'option_items', 'combos', 'stock', 'stock_movements',
    'schedules', 'delivery_areas', 'neighborhoods', 'bairros', 'promotions',
    'promocoes', 'coupons', 'cupons', 'tables', 'mesas', 'environments',
    'ambientes', 'halls', 'kitchenSettings', 'kitchen_settings', 'printers',
    'print_jobs', 'notifications'
  ];

  for (const subName of subcollectionsToDelete) {
    const snap = await db.collection('restaurants').doc(rId).collection(subName).limit(1).get();
    if (!snap.empty) remainingCollections.push(subName);
  }

  const topLevelCollections = [
    'products', 'categories', 'combos', 'promotions', 'coupons',
    'tables', 'halls', 'environments', 'stock_movements', 'invoices'
  ];

  for (const colName of topLevelCollections) {
    const snap1 = await db.collection(colName).where('restaurantId', '==', rId).limit(1).get();
    if (!snap1.empty) remainingCollections.push(`${colName} (global restaurantId)`);
    const snap2 = await db.collection(colName).where('restaurante_id', '==', rId).limit(1).get();
    if (!snap2.empty) remainingCollections.push(`${colName} (global restaurante_id)`);
  }

  return {
    isClean: remainingCollections.length === 0,
    remainingCollections
  };
}

export const performRealOrdersCleanup = async (
  db: any,
  admin: any,
  rId: string,
  reqRef: any,
  cleanupReqId: string,
  progressRange: { start: number; end: number } = { start: 15, end: 90 }
) => {
  // STEP 1: Backup
  await reqRef.update({
    status: 'BACKUP_IN_PROGRESS',
    progress: progressRange.start,
    currentStep: 'Criando backup paginado de segurança dos registros operacionais...',
    updatedAt: new Date().toISOString()
  });

  // Read data to backup
  const ordersSnap = await db.collection('restaurants').doc(rId).collection('orders').get();
  const deliveriesSnap = await db.collection('restaurants').doc(rId).collection('deliveries').get();
  const caixasSnap = await db.collection('restaurants').doc(rId).collection('caixas').get();
  const contasReceberSnap = await db.collection('restaurants').doc(rId).collection('contasReceber').get();
  const contasPagarSnap = await db.collection('restaurants').doc(rId).collection('contasPagar').get();
  const nestedTabsSnap = await db.collection('restaurants').doc(rId).collection('tabs').get();
  const rootTabsSnap = await db.collection('tabs').where('restaurantId', '==', rId).get();
  const nestedRoundsSnap = await db.collection('restaurants').doc(rId).collection('rounds').get();
  const rootRoundsSnap = await db.collection('rounds').where('restaurantId', '==', rId).get();
  const integrationLogsSnap = await db.collection('restaurants').doc(rId).collection('integration_logs').get();
  const processedActionsSnap = await db.collection('restaurants').doc(rId).collection('processedActions').get();

  const itemsToBackup: Array<{ id: string; collection: string; data: any }> = [];
  ordersSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'orders', data: d.data() }));
  deliveriesSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'deliveries', data: d.data() }));
  caixasSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'caixas', data: d.data() }));
  contasReceberSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'contasReceber', data: d.data() }));
  contasPagarSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'contasPagar', data: d.data() }));
  nestedTabsSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'nestedTabs', data: d.data() }));
  rootTabsSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'rootTabs', data: d.data() }));
  nestedRoundsSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'nestedRounds', data: d.data() }));
  rootRoundsSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'rootRounds', data: d.data() }));
  integrationLogsSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'integration_logs', data: d.data() }));
  processedActionsSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'processedActions', data: d.data() }));

  const backupRes = await savePaginatedBackup(db, rId, cleanupReqId, 'operational_data', 'ORDERS_ONLY', itemsToBackup);
  if (!backupRes.success) {
    return {
      success: false,
      deletedCount: 0,
      error: `Falha no backup de registros operacionais: ${backupRes.error || 'Não foi possível salvar o backup paginado.'}`
    };
  }

  const midProgress = Math.round(progressRange.start + (progressRange.end - progressRange.start) * 0.2);
  await reqRef.update({
    status: 'RUNNING',
    progress: midProgress,
    currentStep: 'Excluindo histórico de pedidos e entregas...',
    updatedAt: new Date().toISOString()
  });

  let deletedCount = 0;
  deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection('orders'));
  deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection('deliveries'));
  deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection('caixas'));
  deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection('contasReceber'));
  deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection('contasPagar'));
  deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection('tabs'));
  deletedCount += await deleteQueryRecursively(db, db.collection('tabs').where('restaurantId', '==', rId));
  deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection('rounds'));
  deletedCount += await deleteQueryRecursively(db, db.collection('rounds').where('restaurantId', '==', rId));
  deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection('integration_logs'));
  deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection('processedActions'));

  // Storage files deletion
  try {
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `restaurants/${rId}/orders/` });
    await bucket.deleteFiles({ prefix: `restaurants/${rId}/deliveries/` });
  } catch (storageErr: any) {
    logger.warn(`[CLEANUP] Storage file cleanup warning`, { error: storageErr.message || storageErr });
  }

  // Verification
  const verification = await verifyOrdersCleanupComplete(db, rId);

  if (!verification.isClean) {
    return {
      success: false,
      statusOverride: 'PARTIALLY_COMPLETED',
      deletedCount,
      remainingCollections: verification.remainingCollections,
      error: `Algumas coleções operacionais ainda possuem registros após a limpeza: ${verification.remainingCollections.join(', ')}.`
    };
  }

  return {
    success: true,
    deletedCount
  };
};

export const performRealStaffCleanup = async (
  db: any,
  authAdmin: any,
  rId: string,
  reqRef: any,
  cleanupReqId: string,
  primaryOwnerId: string,
  progressRange: { start: number; end: number } = { start: 15, end: 90 }
) => {
  // STEP 1: Backup
  await reqRef.update({
    status: 'BACKUP_IN_PROGRESS',
    progress: progressRange.start,
    currentStep: 'Criando backup paginado de segurança dos registros da equipe...',
    updatedAt: new Date().toISOString()
  });

  const usersSnap = await db.collection('users').where('restaurantId', '==', rId).get();
  const staffProfilesSnap = await db.collection('restaurants').doc(rId).collection('staffProfiles').get();

  const itemsToBackup: Array<{ id: string; collection: string; data: any }> = [];
  usersSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'users', data: d.data() }));
  staffProfilesSnap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: 'staffProfiles', data: d.data() }));

  const backupRes = await savePaginatedBackup(db, rId, cleanupReqId, 'users_and_staff', 'INTERNAL_USERS_ONLY', itemsToBackup);
  if (!backupRes.success) {
    return {
      success: false,
      processedCount: 0,
      removedCount: 0,
      anonimizedCount: 0,
      preservedCount: 1,
      error: `Falha no backup da equipe: ${backupRes.error || 'Não foi possível salvar o backup paginado.'}`
    };
  }

  const midProgress = Math.round(progressRange.start + (progressRange.end - progressRange.start) * 0.2);
  await reqRef.update({
    status: 'RUNNING',
    progress: midProgress,
    currentStep: 'Iniciando processamento da equipe...',
    updatedAt: new Date().toISOString()
  });

  const internalUserIds = new Set<string>();

  usersSnap.forEach((doc: any) => {
    const u = doc.data();
    const uid = doc.id;
    if (uid === primaryOwnerId) return;

    const role = (u.role || '').toUpperCase();
    const tipo = (u.tipo_usuario || '').toUpperCase();
    const accType = (u.accountType || '').toUpperCase();
    if (role === 'CLIENT' || role === 'CLIENTE' || tipo === 'CLIENT' || tipo === 'CLIENTE' || accType === 'CLIENT' || accType === 'CLIENTE') return;
    if (role === 'PLATFORM_ADMIN' || role === 'ADMIN' || tipo === 'ADMIN' || tipo === 'PLATFORM_ADMIN' || accType === 'PLATFORM_ADMIN' || accType === 'ADMIN') return;

    internalUserIds.add(uid);
  });

  staffProfilesSnap.forEach((doc: any) => {
    const p = doc.data();
    const uid = doc.id;
    if (uid === primaryOwnerId) return;

    const role = (p.role || '').toUpperCase();
    if (role === 'CLIENT' || role === 'CLIENTE' || role === 'PLATFORM_ADMIN' || role === 'ADMIN') return;

    internalUserIds.add(uid);
  });

  const processedUserIds = Array.from(internalUserIds);
  let removedCount = 0;
  let anonimizedCount = 0;
  const preservedCount = 1;

  const checkUserHistory = async (restId: string, uId: string): Promise<boolean> => {
    const ordersRef = db.collection('restaurants').doc(restId).collection('orders');
    const deliveriesRef = db.collection('restaurants').doc(restId).collection('deliveries');
    const caixasRef = db.collection('restaurants').doc(restId).collection('caixas');

    const fieldsToCheck = [
      'driverId', 'assignedDriverId', 'responsibleDriverId', 
      'entregador_id', 'waiterId', 'cashierId', 'operatorId', 
      'createdBy', 'userId'
    ];

    for (const field of fieldsToCheck) {
      const snap = await ordersRef.where(field, '==', uId).limit(1).get();
      if (!snap.empty) return true;
    }

    const deliveryFields = ['driverId', 'assignedDriverId', 'entregador_id'];
    for (const field of deliveryFields) {
      const snap = await deliveriesRef.where(field, '==', uId).limit(1).get();
      if (!snap.empty) return true;
    }

    const caixaFields = ['openedById', 'closedById', 'operatorId'];
    for (const field of caixaFields) {
      const snap = await caixasRef.where(field, '==', uId).limit(1).get();
      if (!snap.empty) return true;
    }

    return false;
  };

  for (const userId of processedUserIds) {
    const hasHistory = await checkUserHistory(rId, userId);

    if (!hasHistory) {
      await deleteDocAndSubcollectionsRecursively(db, db.collection('restaurants').doc(rId).collection('staffProfiles').doc(userId));
      await deleteDocAndSubcollectionsRecursively(db, db.collection('users').doc(userId));
      try {
        await authAdmin.deleteUser(userId);
      } catch (authErr: any) {
        logger.warn(`[CLEANUP] Auth user deletion warning`, { error: authErr.message });
      }
      removedCount++;
    } else {
      try {
        await authAdmin.updateUser(userId, { disabled: true });
      } catch (authErr: any) {
        logger.warn(`[CLEANUP] Auth user disable warning`, { error: authErr.message });
      }

      await db.collection('users').doc(userId).update({
        nome: 'Funcionário Anonimizado',
        name: 'Funcionário Anonimizado',
        displayName: 'Funcionário Anonimizado',
        email: `anonimo_${userId}@qfomeai.com`,
        emailVerified: false,
        telefone: '',
        phone: '',
        celular: '',
        cpf: '',
        documento: '',
        avatar: '',
        photoUrl: '',
        endereco: null,
        address: null,
        active: false,
        status: 'INACTIVE',
        role: 'INACTIVE_STAFF',
        tipo_usuario: 'INACTIVE_STAFF',
        updatedAt: new Date().toISOString()
      });

      const staffProfileRef = db.collection('restaurants').doc(rId).collection('staffProfiles').doc(userId);
      const staffProfileSnap = await staffProfileRef.get();
      if (staffProfileSnap.exists) {
        await staffProfileRef.update({
          name: 'Funcionário Anonimizado',
          email: `anonimo_${userId}@qfomeai.com`,
          phone: '',
          operationalStatus: 'INACTIVE',
          updatedAt: new Date().toISOString()
        });
      }

      anonimizedCount++;
    }

    const currentProgress = Math.min(
      progressRange.end,
      Math.round(midProgress + ((removedCount + anonimizedCount) / Math.max(1, processedUserIds.length)) * (progressRange.end - midProgress))
    );
    await reqRef.update({
      progress: currentProgress,
      currentStep: `Limpando equipe... [Processados: ${removedCount + anonimizedCount}/${processedUserIds.length}]`,
      updatedAt: new Date().toISOString()
    });
  }

  // Verification step
  const postUsersSnap = await db.collection('users').where('restaurantId', '==', rId).get();
  const postStaffSnap = await db.collection('restaurants').doc(rId).collection('staffProfiles').get();

  let failedVerificationCount = 0;
  const verificationErrors: string[] = [];
  const remainingCollectionsSet = new Set<string>();

  for (const doc of postUsersSnap.docs) {
    const uid = doc.id;
    if (uid === primaryOwnerId) continue;
    if (!internalUserIds.has(uid)) continue;

    const isDeletedExpected = !(await checkUserHistory(rId, uid));
    if (isDeletedExpected) {
      failedVerificationCount++;
      remainingCollectionsSet.add('users');
      verificationErrors.push(`Usuário ${uid} deveria ter sido excluído de 'users', mas ainda existe.`);
    } else {
      const u = doc.data();
      if (u.active !== false || u.status !== 'INACTIVE') {
        failedVerificationCount++;
        remainingCollectionsSet.add('users (ativos)');
        verificationErrors.push(`Usuário ${uid} com histórico deveria estar desativado inativo, mas continua ativo.`);
      }
    }
  }

  for (const doc of postStaffSnap.docs) {
    const uid = doc.id;
    if (uid === primaryOwnerId) continue;
    if (!internalUserIds.has(uid)) continue;

    const isDeletedExpected = !(await checkUserHistory(rId, uid));
    if (isDeletedExpected) {
      failedVerificationCount++;
      remainingCollectionsSet.add('staffProfiles');
      verificationErrors.push(`Perfil ${uid} deveria ter sido excluído de 'staffProfiles', mas ainda existe.`);
    } else {
      const p = doc.data();
      if (p.operationalStatus !== 'INACTIVE') {
        failedVerificationCount++;
        remainingCollectionsSet.add('staffProfiles (ativos)');
        verificationErrors.push(`Perfil ${uid} com histórico deveria estar INACTIVE, mas continua ativo.`);
      }
    }
  }

  for (const uid of processedUserIds) {
    const isDeletedExpected = !(await checkUserHistory(rId, uid));
    try {
      const authUser = await authAdmin.getUser(uid);
      if (isDeletedExpected) {
        failedVerificationCount++;
        remainingCollectionsSet.add('Firebase Auth');
        verificationErrors.push(`Conta Firebase Auth para ${uid} deveria ter sido excluída, mas ainda existe.`);
      } else {
        if (!authUser.disabled) {
          failedVerificationCount++;
          remainingCollectionsSet.add('Firebase Auth (ativa)');
          verificationErrors.push(`Conta Firebase Auth para ${uid} deveria estar inativa/disabled, mas está ativa.`);
        }
      }
    } catch (authErr: any) {
      if (isDeletedExpected && authErr.code === 'auth/user-not-found') {
        // Perfect
      } else if (!isDeletedExpected) {
        failedVerificationCount++;
        remainingCollectionsSet.add('Firebase Auth');
        verificationErrors.push(`Conta Firebase Auth para ${uid} não pôde ser verificada.`);
      }
    }
  }

  if (failedVerificationCount > 0) {
    return {
      success: false,
      statusOverride: 'PARTIALLY_COMPLETED',
      processedCount: processedUserIds.length,
      removedCount,
      anonimizedCount,
      preservedCount: 1,
      remainingUsersCount: failedVerificationCount,
      remainingCollections: Array.from(remainingCollectionsSet),
      error: `Verificação falhou: ${failedVerificationCount} usuário(s) indevidamente ativo(s). Coleções afetadas: ${Array.from(remainingCollectionsSet).join(', ')}. Detalhes: ${verificationErrors.slice(0, 3).join('; ')}`
    };
  }

  return {
    success: true,
    processedCount: processedUserIds.length,
    removedCount,
    anonimizedCount,
    preservedCount: 1
  };
};

export const performRealCommercialDataCleanup = async (
  db: any,
  admin: any,
  rId: string,
  reqRef: any,
  cleanupReqId: string,
  progressRange: { start: number; end: number } = { start: 65, end: 85 }
) => {
  // STEP 1: Backup
  await reqRef.update({
    status: 'BACKUP_IN_PROGRESS',
    progress: progressRange.start,
    currentStep: 'Criando backup paginado de segurança dos dados comerciais e produtos...',
    updatedAt: new Date().toISOString()
  });

  const subcollectionsToBackup = [
    'products', 'categories', 'sizes', 'extras', 'optionGroups', 'optionItems', 
    'combos', 'stock', 'stock_movements', 'schedules', 'delivery_areas', 
    'neighborhoods', 'promotions', 'coupons', 'tables', 'environments', 'halls',
    'kitchenSettings', 'printers', 'notifications'
  ];

  const itemsToBackup: Array<{ id: string; collection: string; data: any }> = [];
  for (const subName of subcollectionsToBackup) {
    const snap = await db.collection('restaurants').doc(rId).collection(subName).get();
    snap.docs.forEach((d: any) => itemsToBackup.push({ id: d.id, collection: subName, data: d.data() }));
  }

  const backupRes = await savePaginatedBackup(db, rId, cleanupReqId, 'commercial_data', 'FACTORY_RESET', itemsToBackup);
  if (!backupRes.success) {
    return {
      success: false,
      deletedCount: 0,
      error: `Falha no backup de dados comerciais: ${backupRes.error || 'Não foi possível salvar o backup paginado.'}`
    };
  }

  const midProgress = Math.round(progressRange.start + (progressRange.end - progressRange.start) * 0.2);
  await reqRef.update({
    status: 'RUNNING',
    progress: midProgress,
    currentStep: 'Iniciando remoção de produtos, cardápios e configurações...',
    updatedAt: new Date().toISOString()
  });

  let deletedCount = 0;

  const subcollectionsToDelete = [
    'products', 'categories', 'sizes', 'extras', 'optionGroups', 'optionItems',
    'option_groups', 'option_items', 'combos', 'stock', 'stock_movements',
    'schedules', 'delivery_areas', 'neighborhoods', 'bairros', 'promotions',
    'promocoes', 'coupons', 'cupons', 'tables', 'mesas', 'environments',
    'ambientes', 'halls', 'kitchenSettings', 'kitchen_settings', 'printers',
    'print_jobs', 'notifications'
  ];

  for (const subName of subcollectionsToDelete) {
    deletedCount += await deleteQueryRecursively(db, db.collection('restaurants').doc(rId).collection(subName));
  }

  const topLevelCollections = [
    'products', 'categories', 'combos', 'promotions', 'coupons',
    'tables', 'halls', 'environments', 'stock_movements', 'invoices'
  ];

  for (const colName of topLevelCollections) {
    deletedCount += await deleteQueryRecursively(db, db.collection(colName).where('restaurantId', '==', rId));
    deletedCount += await deleteQueryRecursively(db, db.collection(colName).where('restaurante_id', '==', rId));
  }

  // Storage files deletion
  try {
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `restaurants/${rId}/` });
    logger.debug(`[CLEANUP] Deleted Storage files for restaurant prefix`);
  } catch (storageErr: any) {
    logger.warn(`[CLEANUP] Storage file cleanup warning`, { error: storageErr.message || storageErr });
  }

  // Verification step
  const verification = await verifyCommercialCleanupComplete(db, rId);

  if (!verification.isClean) {
    return {
      success: false,
      statusOverride: 'PARTIALLY_COMPLETED',
      deletedCount,
      remainingCollections: verification.remainingCollections,
      error: `Alguns recursos comerciais ainda possuem registros: ${verification.remainingCollections.join(', ')}.`
    };
  }

  return {
    success: true,
    deletedCount
  };
};
