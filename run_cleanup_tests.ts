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

// --------------------------------------------------------------------------
// HELPER CLEANUP FUNCTIONS (Mirrors backend logic in server.ts)
// --------------------------------------------------------------------------

async function savePaginatedBackup(
  backupRef: admin.firestore.DocumentReference,
  backupData: Record<string, any[]>
): Promise<{ success: boolean; totalRecords: number; error?: string }> {
  try {
    let allRecords: Array<{ collectionName: string; documentId: string; data: any }> = [];
    for (const [colName, docs] of Object.entries(backupData)) {
      if (Array.isArray(docs)) {
        for (const doc of docs) {
          allRecords.push({
            collectionName: colName,
            documentId: doc.id || doc.docId || 'unknown',
            data: doc
          });
        }
      }
    }

    const totalRecords = allRecords.length;
    const CHUNK_SIZE = 150;
    const chunkCount = Math.ceil(totalRecords / CHUNK_SIZE) || 1;

    await backupRef.set({
      quantidadeDeRegistros: totalRecords,
      chunkCount,
      statusDoBackup: 'IN_PROGRESS',
      createdAt: new Date().toISOString()
    });

    for (let i = 0; i < chunkCount; i++) {
      const chunkRecords = allRecords.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await backupRef.collection('chunks').doc(`chunk_${i + 1}`).set({
        pageIndex: i + 1,
        records: chunkRecords,
        createdAt: new Date().toISOString()
      });
    }

    await backupRef.update({
      statusDoBackup: 'SUCCESS',
      completedAt: new Date().toISOString()
    });

    return { success: true, totalRecords };
  } catch (err: any) {
    await backupRef.set({
      statusDoBackup: 'FAILED',
      error: err.message || 'Erro ao gerar backup',
      failedAt: new Date().toISOString()
    }, { merge: true });
    return { success: false, totalRecords: 0, error: err.message };
  }
}

async function deleteDocAndSubcollectionsRecursively(docRef: admin.firestore.DocumentReference): Promise<number> {
  let count = 0;
  try {
    const subcols = await docRef.listCollections();
    for (const subcol of subcols) {
      while (true) {
        const snap = await subcol.limit(100).get();
        if (snap.empty) break;
        for (const childDoc of snap.docs) {
          count += await deleteDocAndSubcollectionsRecursively(childDoc.ref);
        }
      }
    }
    await docRef.delete();
    count++;
  } catch (e) {
    await docRef.delete();
    count++;
  }
  return count;
}

async function deleteQueryRecursively(query: admin.firestore.Query): Promise<number> {
  let count = 0;
  while (true) {
    const snap = await query.limit(100).get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      count += await deleteDocAndSubcollectionsRecursively(doc.ref);
    }
  }
  return count;
}

async function verifyOrdersCleanupComplete(rId: string): Promise<{ isClean: boolean; remainingCollections: string[] }> {
  const collectionsToCheck = [
    { name: 'orders', query: db.collection('restaurants').doc(rId).collection('orders') },
    { name: 'deliveries', query: db.collection('restaurants').doc(rId).collection('deliveries') },
    { name: 'caixas', query: db.collection('restaurants').doc(rId).collection('caixas') },
    { name: 'contasReceber', query: db.collection('restaurants').doc(rId).collection('contasReceber') },
    { name: 'contasPagar', query: db.collection('restaurants').doc(rId).collection('contasPagar') },
    { name: 'nestedTabs', query: db.collection('restaurants').doc(rId).collection('tabs') },
    { name: 'rootTabs', query: db.collection('tabs').where('restaurantId', '==', rId) },
    { name: 'integration_logs', query: db.collection('restaurants').doc(rId).collection('integration_logs') },
    { name: 'processedActions', query: db.collection('restaurants').doc(rId).collection('processedActions') }
  ];

  const remainingCollections: string[] = [];
  for (const item of collectionsToCheck) {
    const snap = await item.query.limit(1).get();
    if (!snap.empty) {
      remainingCollections.push(item.name);
    }
  }

  return {
    isClean: remainingCollections.length === 0,
    remainingCollections
  };
}

async function performRealOrdersCleanup(
  rId: string,
  cleanupReqId: string
) {
  const ordersSnap = await db.collection('restaurants').doc(rId).collection('orders').get();
  const deliveriesSnap = await db.collection('restaurants').doc(rId).collection('deliveries').get();
  const caixasSnap = await db.collection('restaurants').doc(rId).collection('caixas').get();
  const contasReceberSnap = await db.collection('restaurants').doc(rId).collection('contasReceber').get();
  const contasPagarSnap = await db.collection('restaurants').doc(rId).collection('contasPagar').get();
  const nestedTabsSnap = await db.collection('restaurants').doc(rId).collection('tabs').get();
  const rootTabsSnap = await db.collection('tabs').where('restaurantId', '==', rId).get();

  const backupPayload = {
    orders: ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    deliveries: deliveriesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    caixas: caixasSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    contasReceber: contasReceberSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    contasPagar: contasPagarSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    nestedTabs: nestedTabsSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    rootTabs: rootTabsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  };

  const backupDocRef = db.collection('restaurants')
    .doc(rId)
    .collection('dataCleanupRequests')
    .doc(cleanupReqId)
    .collection('backup')
    .doc('operational_data');

  const backupRes = await savePaginatedBackup(backupDocRef, backupPayload);
  if (!backupRes.success) {
    return { success: false, deletedCount: 0, error: `Falha crítica ao realizar backup operacional: ${backupRes.error}` };
  }

  let deletedCount = 0;
  deletedCount += await deleteQueryRecursively(db.collection('restaurants').doc(rId).collection('orders'));
  deletedCount += await deleteQueryRecursively(db.collection('restaurants').doc(rId).collection('deliveries'));
  deletedCount += await deleteQueryRecursively(db.collection('restaurants').doc(rId).collection('caixas'));
  deletedCount += await deleteQueryRecursively(db.collection('restaurants').doc(rId).collection('contasReceber'));
  deletedCount += await deleteQueryRecursively(db.collection('restaurants').doc(rId).collection('contasPagar'));
  deletedCount += await deleteQueryRecursively(db.collection('restaurants').doc(rId).collection('tabs'));
  deletedCount += await deleteQueryRecursively(db.collection('tabs').where('restaurantId', '==', rId));
  deletedCount += await deleteQueryRecursively(db.collection('restaurants').doc(rId).collection('integration_logs'));
  deletedCount += await deleteQueryRecursively(db.collection('restaurants').doc(rId).collection('processedActions'));

  // Verification
  const verifyRes = await verifyOrdersCleanupComplete(rId);

  if (!verifyRes.isClean) {
    return {
      success: false,
      statusOverride: 'PARTIALLY_COMPLETED',
      remainingCollections: verifyRes.remainingCollections,
      deletedCount,
      error: `Limpeza operacional incompleta. Coleções com registros restantes: ${verifyRes.remainingCollections.join(', ')}.`
    };
  }

  return { success: true, deletedCount };
}

async function performRealStaffCleanup(
  rId: string,
  cleanupReqId: string,
  primaryOwnerId: string
) {
  const usersSnap = await db.collection('users').where('restaurantId', '==', rId).get();
  const staffProfilesSnap = await db.collection('restaurants').doc(rId).collection('staffProfiles').get();

  const usersBackup = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const staffProfilesBackup = staffProfilesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  await db.collection('restaurants')
    .doc(rId)
    .collection('dataCleanupRequests')
    .doc(cleanupReqId)
    .collection('backup')
    .doc('users_and_staff')
    .set({
      payload: JSON.stringify({ users: usersBackup, staffProfiles: staffProfilesBackup }),
      createdAt: new Date().toISOString()
    });

  const internalUserIds = new Set<string>();

  usersSnap.forEach(doc => {
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

  staffProfilesSnap.forEach(doc => {
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
      await db.collection('restaurants').doc(rId).collection('staffProfiles').doc(userId).delete();
      await db.collection('users').doc(userId).delete();
      try {
        await authAdmin.deleteUser(userId);
      } catch (authErr: any) {}
      removedCount++;
    } else {
      try {
        await authAdmin.updateUser(userId, { disabled: true });
      } catch (authErr: any) {}

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
  }

  // Verification step
  const postUsersSnap = await db.collection('users').where('restaurantId', '==', rId).get();
  const postStaffSnap = await db.collection('restaurants').doc(rId).collection('staffProfiles').get();

  let failedVerificationCount = 0;

  for (const doc of postUsersSnap.docs) {
    const uid = doc.id;
    if (uid === primaryOwnerId) continue;
    if (!internalUserIds.has(uid)) continue;

    const isDeletedExpected = !(await checkUserHistory(rId, uid));
    if (isDeletedExpected) {
      failedVerificationCount++;
    } else {
      const u = doc.data();
      if (u.active !== false || u.status !== 'INACTIVE') {
        failedVerificationCount++;
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
    } else {
      const p = doc.data();
      if (p.operationalStatus !== 'INACTIVE') {
        failedVerificationCount++;
      }
    }
  }

  for (const uid of processedUserIds) {
    const isDeletedExpected = !(await checkUserHistory(rId, uid));
    try {
      const authUser = await authAdmin.getUser(uid);
      if (isDeletedExpected) {
        failedVerificationCount++;
      } else {
        if (!authUser.disabled) {
          failedVerificationCount++;
        }
      }
    } catch (authErr: any) {
      if (isDeletedExpected && authErr.code === 'auth/user-not-found') {
        // Correct
      } else if (!isDeletedExpected) {
        failedVerificationCount++;
      }
    }
  }

  if (failedVerificationCount > 0) {
    return {
      success: false,
      processedCount: processedUserIds.length,
      removedCount,
      anonimizedCount,
      preservedCount: 1,
      error: `Verificação de equipe falhou: ${failedVerificationCount} usuário(s) indevidamente ativo(s).`
    };
  }

  return {
    success: true,
    processedCount: processedUserIds.length,
    removedCount,
    anonimizedCount,
    preservedCount: 1
  };
}

async function performRealCommercialDataCleanup(
  rId: string,
  cleanupReqId: string
) {
  const subcollectionsToBackup = [
    'products', 'categories', 'sizes', 'extras', 'optionGroups', 'optionItems', 
    'combos', 'stock', 'stock_movements', 'schedules', 'delivery_areas', 
    'neighborhoods', 'promotions', 'coupons', 'tables', 'environments', 'halls',
    'kitchenSettings', 'printers', 'notifications'
  ];

  const backupData: Record<string, any[]> = {};
  for (const subName of subcollectionsToBackup) {
    const snap = await db.collection('restaurants').doc(rId).collection(subName).get();
    if (!snap.empty) {
      backupData[subName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  }

  await db.collection('restaurants')
    .doc(rId)
    .collection('dataCleanupRequests')
    .doc(cleanupReqId)
    .collection('backup')
    .doc('commercial_data')
    .set({
      payload: JSON.stringify(backupData),
      createdAt: new Date().toISOString()
    });

  let deletedCount = 0;

  const deleteQueryInBatches = async (query: any) => {
    while (true) {
      const snap = await query.limit(100).get();
      if (snap.empty) break;

      const batch = db.batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        deletedCount++;
      }
      await batch.commit();
    }
  };

  const subcollectionsToDelete = [
    'products', 'categories', 'sizes', 'extras', 'optionGroups', 'optionItems',
    'option_groups', 'option_items', 'combos', 'stock', 'stock_movements',
    'schedules', 'delivery_areas', 'neighborhoods', 'bairros', 'promotions',
    'promocoes', 'coupons', 'cupons', 'tables', 'mesas', 'environments',
    'ambientes', 'halls', 'kitchenSettings', 'kitchen_settings', 'printers',
    'print_jobs', 'notifications'
  ];

  for (const subName of subcollectionsToDelete) {
    await deleteQueryInBatches(db.collection('restaurants').doc(rId).collection(subName));
  }

  const topLevelCollections = [
    'products', 'categories', 'combos', 'promotions', 'coupons',
    'tables', 'halls', 'environments', 'stock_movements', 'invoices'
  ];

  for (const colName of topLevelCollections) {
    await deleteQueryInBatches(db.collection(colName).where('restaurantId', '==', rId));
    await deleteQueryInBatches(db.collection(colName).where('restaurante_id', '==', rId));
  }

  // Storage files deletion
  try {
    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({ prefix: `restaurants/${rId}/` });
  } catch (storageErr: any) {}

  // Verification step
  let remainingCommercialCount = 0;
  for (const subName of subcollectionsToDelete) {
    const snap = await db.collection('restaurants').doc(rId).collection(subName).limit(1).get();
    if (!snap.empty) remainingCommercialCount++;
  }

  for (const colName of topLevelCollections) {
    const snap1 = await db.collection(colName).where('restaurantId', '==', rId).limit(1).get();
    if (!snap1.empty) remainingCommercialCount++;
    const snap2 = await db.collection(colName).where('restaurante_id', '==', rId).limit(1).get();
    if (!snap2.empty) remainingCommercialCount++;
  }

  if (remainingCommercialCount > 0) {
    return {
      success: false,
      deletedCount,
      error: `Alguns recursos comerciais não puderam ser excluídos (${remainingCommercialCount} coleção(ões) contêm registros).`
    };
  }

  return { success: true, deletedCount };
}

// Helper to create test user in Auth & Firestore
async function createTestUser(uid: string, email: string, name: string, role: string, rId: string) {
  try {
    await authAdmin.deleteUser(uid);
  } catch (e) {}

  await authAdmin.createUser({
    uid,
    email,
    displayName: name,
    emailVerified: true
  });

  await db.collection('users').doc(uid).set({
    uid,
    email,
    nome: name,
    displayName: name,
    role,
    tipo_usuario: role,
    restaurantId: rId,
    active: true,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  });

  if (role !== 'RESTAURANT_OWNER' && role !== 'ADMIN' && role !== 'CLIENT') {
    await db.collection('restaurants').doc(rId).collection('staffProfiles').doc(uid).set({
      uid,
      name,
      email,
      role,
      operationalStatus: 'ACTIVE',
      createdAt: new Date().toISOString()
    });
  }
}

// --------------------------------------------------------------------------
// TEST RUNNER
// --------------------------------------------------------------------------

async function runAllCleanupTests() {
  console.log('================================================================');
  console.log('STARTING REAL CLEANUP VALIDATION SUITE (PROMPTS 4.8.32 - 4.8.35)');
  console.log('================================================================\n');

  let allTestsPassed = true;
  const reports: any[] = [];

  // --------------------------------------------------------------------------
  // TEST 1: ORDERS_ONLY
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 1: Limpar somente pedidos (ORDERS_ONLY) ---');
    const rId = 'test_rest_orders_only';
    const neighborId = 'test_rest_neighbor_iso_1';
    const ownerId = 'owner_orders_only';

    // Seed restaurant docs
    await db.collection('restaurants').doc(rId).set({ id: rId, nome: 'Restaurante Pedidos Teste', primaryOwnerUid: ownerId, em_manutencao: false });
    await db.collection('restaurants').doc(neighborId).set({ id: neighborId, nome: 'Restaurante Vizinho 1', primaryOwnerUid: 'neighbor_owner_1', em_manutencao: false });

    // Seed owner & staff
    await createTestUser(ownerId, 'owner1@test.com', 'Dono Pedidos', 'RESTAURANT_OWNER', rId);
    await createTestUser('staff_orders_1', 'garcom1@test.com', 'Garçom 1', 'WAITER', rId);

    // Seed orders, deliveries, caixas, tabs, products in target
    for (let i = 1; i <= 5; i++) {
      await db.collection('restaurants').doc(rId).collection('orders').doc(`order_${i}`).set({
        id: `order_${i}`,
        status: 'ENTREGUE',
        total: 50.0,
        createdAt: new Date().toISOString()
      });
      await db.collection('restaurants').doc(rId).collection('orders').doc(`order_${i}`).collection('auditEvents').doc(`audit_${i}`).set({ action: 'CREATED' });
    }
    await db.collection('restaurants').doc(rId).collection('deliveries').doc('deliv_1').set({ id: 'deliv_1', driverId: 'staff_orders_1' });
    await db.collection('restaurants').doc(rId).collection('caixas').doc('caixa_1').set({ id: 'caixa_1', status: 'CLOSED' });
    await db.collection('restaurants').doc(rId).collection('caixas').doc('caixa_1').collection('movimentacoes').doc('mov_1').set({ valor: 100 });
    await db.collection('restaurants').doc(rId).collection('contasReceber').doc('cr_1').set({ id: 'cr_1', amount: 50 });
    await db.collection('restaurants').doc(rId).collection('contasPagar').doc('cp_1').set({ id: 'cp_1', amount: 30 });
    await db.collection('restaurants').doc(rId).collection('tabs').doc('tab_1').set({ id: 'tab_1', name: 'Mesa 1' });
    await db.collection('tabs').doc('root_tab_1').set({ id: 'root_tab_1', restaurantId: rId });

    // Commercial data in target (should be preserved!)
    await db.collection('restaurants').doc(rId).collection('products').doc('prod_1').set({ id: 'prod_1', name: 'Pizza Calabrês' });
    await db.collection('restaurants').doc(rId).collection('categories').doc('cat_1').set({ id: 'cat_1', name: 'Pizzas' });

    // Seed neighbor data (should be preserved!)
    await db.collection('restaurants').doc(neighborId).collection('orders').doc('neighbor_order_1').set({ id: 'neighbor_order_1', total: 100 });
    await db.collection('restaurants').doc(neighborId).collection('caixas').doc('neighbor_caixa_1').set({ id: 'neighbor_caixa_1' });

    // CONTAGEM ANTES
    const countOrdersBefore = (await db.collection('restaurants').doc(rId).collection('orders').get()).size;
    const countDeliveriesBefore = (await db.collection('restaurants').doc(rId).collection('deliveries').get()).size;
    const countCaixasBefore = (await db.collection('restaurants').doc(rId).collection('caixas').get()).size;
    const countProductsBefore = (await db.collection('restaurants').doc(rId).collection('products').get()).size;
    const countStaffBefore = (await db.collection('users').where('restaurantId', '==', rId).get()).size;
    const countNeighborOrdersBefore = (await db.collection('restaurants').doc(neighborId).collection('orders').get()).size;

    const totalOperationalBefore = countOrdersBefore + countDeliveriesBefore + countCaixasBefore;

    // EXECUÇÃO REAL
    const result = await performRealOrdersCleanup(rId, 'req_orders_only_test');

    // CONTAGEM DEPOIS
    const countOrdersAfter = (await db.collection('restaurants').doc(rId).collection('orders').get()).size;
    const countDeliveriesAfter = (await db.collection('restaurants').doc(rId).collection('deliveries').get()).size;
    const countCaixasAfter = (await db.collection('restaurants').doc(rId).collection('caixas').get()).size;
    const countProductsAfter = (await db.collection('restaurants').doc(rId).collection('products').get()).size;
    const countStaffAfter = (await db.collection('users').where('restaurantId', '==', rId).get()).size;
    const countNeighborOrdersAfter = (await db.collection('restaurants').doc(neighborId).collection('orders').get()).size;

    const totalOperationalAfter = countOrdersAfter + countDeliveriesAfter + countCaixasAfter;
    const totalRemoved = totalOperationalBefore - totalOperationalAfter;

    // VERIFICAÇÕES OBRIGATÓRIAS
    const isOrdersClean = totalOperationalAfter === 0;
    const isCommercialPreserved = countProductsAfter === countProductsBefore;
    const isStaffPreserved = countStaffAfter === countStaffBefore;
    const isNeighborIsolated = countNeighborOrdersAfter === countNeighborOrdersBefore;
    const ownerDoc = await db.collection('users').doc(ownerId).get();
    const isOwnerActive = ownerDoc.exists && ownerDoc.data()?.active === true;

    const testPassed = result.success && isOrdersClean && isCommercialPreserved && isStaffPreserved && isNeighborIsolated && isOwnerActive;
    if (!testPassed) allTestsPassed = false;

    reports.push({
      modalidade: 'Limpar somente pedidos',
      quantidadeAntes: totalOperationalBefore,
      quantidadeRemovida: totalRemoved,
      quantidadeRestante: totalOperationalAfter,
      quantidadePreservada: countProductsAfter + countStaffAfter,
      vizinhoIsolado: isNeighborIsolated,
      proprietarioPreservado: isOwnerActive,
      statusFinalReal: testPassed ? 'SUCESSO' : 'FALHA'
    });
    console.log(`  Result: ${testPassed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: INTERNAL_USERS_ONLY
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 2: Limpar somente a equipe (INTERNAL_USERS_ONLY) ---');
    const rId = 'test_rest_staff_only';
    const neighborId = 'test_rest_neighbor_iso_2';
    const ownerId = 'owner_staff_only';
    const noHistId = 'staff_no_history_test';
    const withHistId = 'staff_with_history_test';

    await db.collection('restaurants').doc(rId).set({ id: rId, nome: 'Restaurante Equipe Teste', primaryOwnerUid: ownerId, em_manutencao: false });
    await db.collection('restaurants').doc(neighborId).set({ id: neighborId, nome: 'Restaurante Vizinho 2', primaryOwnerUid: 'neighbor_owner_2', em_manutencao: false });

    await createTestUser(ownerId, 'owner2@test.com', 'Dono Equipe', 'RESTAURANT_OWNER', rId);
    await createTestUser(noHistId, 'nohist@test.com', 'Sem Histórico', 'WAITER', rId);
    await createTestUser(withHistId, 'withhist@test.com', 'Com Histórico', 'DRIVER', rId);

    // Create order history referencing withHistId
    await db.collection('restaurants').doc(rId).collection('orders').doc('hist_order_1').set({
      id: 'hist_order_1',
      driverId: withHistId,
      total: 80
    });

    // Neighbor staff
    await createTestUser('neighbor_staff_1', 'nstaff1@test.com', 'Garçom Vizinho', 'WAITER', neighborId);

    // CONTAGEM ANTES
    const usersBeforeSnap = await db.collection('users').where('restaurantId', '==', rId).get();
    const countUsersBefore = usersBeforeSnap.size;
    const countNeighborUsersBefore = (await db.collection('users').where('restaurantId', '==', neighborId).get()).size;
    const countOrdersBefore = (await db.collection('restaurants').doc(rId).collection('orders').get()).size;

    // EXECUÇÃO REAL
    const result = await performRealStaffCleanup(rId, 'req_staff_only_test', ownerId);

    // CONTAGEM DEPOIS
    const usersAfterSnap = await db.collection('users').where('restaurantId', '==', rId).get();
    const countUsersAfter = usersAfterSnap.size;
    const countNeighborUsersAfter = (await db.collection('users').where('restaurantId', '==', neighborId).get()).size;
    const countOrdersAfter = (await db.collection('restaurants').doc(rId).collection('orders').get()).size;

    // VERIFICAÇÃO DETALHADA DOS USUÁRIOS
    const noHistDoc = await db.collection('users').doc(noHistId).get();
    const isNoHistDeleted = !noHistDoc.exists;

    const withHistDoc = await db.collection('users').doc(withHistId).get();
    const isWithHistAnonymized = withHistDoc.exists && withHistDoc.data()?.nome === 'Funcionário Anonimizado' && withHistDoc.data()?.status === 'INACTIVE';

    const ownerDoc = await db.collection('users').doc(ownerId).get();
    const isOwnerActive = ownerDoc.exists && ownerDoc.data()?.active === true;

    let isAuthDisabledCorrectly = true;
    try {
      await authAdmin.getUser(noHistId);
      isAuthDisabledCorrectly = false; // should have been deleted!
    } catch (e: any) {
      if (e.code !== 'auth/user-not-found') isAuthDisabledCorrectly = false;
    }

    try {
      const uAuth = await authAdmin.getUser(withHistId);
      if (!uAuth.disabled) isAuthDisabledCorrectly = false; // should be disabled!
    } catch (e: any) {
      isAuthDisabledCorrectly = false;
    }

    const isNeighborIsolated = countNeighborUsersAfter === countNeighborUsersBefore;
    const isOrdersPreserved = countOrdersAfter === countOrdersBefore;

    const testPassed = result.success && isNoHistDeleted && isWithHistAnonymized && isOwnerActive && isAuthDisabledCorrectly && isNeighborIsolated && isOrdersPreserved;
    if (!testPassed) allTestsPassed = false;

    reports.push({
      modalidade: 'Limpar somente a equipe',
      quantidadeAntes: countUsersBefore - 1, // Exclude owner
      quantidadeRemovida: result.removedCount,
      quantidadeAnonimizada: result.anonimizedCount,
      quantidadeRestante: countUsersAfter,
      quantidadePreservada: 1, // Owner
      vizinhoIsolado: isNeighborIsolated,
      proprietarioPreservado: isOwnerActive,
      statusFinalReal: testPassed ? 'SUCESSO' : 'FALHA'
    });
    console.log(`  Result: ${testPassed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: SUBCOLLECTIONS WITH >100 RECORDS
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 3: Subcoleções com mais de 100 registros (>100 auditEvents/movimentacoes) ---');
    const rId = 'test_rest_large_subcol';
    const ownerId = 'owner_large_subcol';

    await db.collection('restaurants').doc(rId).set({ id: rId, nome: 'Restaurante Subcoleção Grande', primaryOwnerUid: ownerId, em_manutencao: false });
    await createTestUser(ownerId, 'owner_sub@test.com', 'Dono Subcoleção', 'RESTAURANT_OWNER', rId);

    // Create 1 order with 120 auditEvents
    const orderRef = db.collection('restaurants').doc(rId).collection('orders').doc('order_with_120_audits');
    await orderRef.set({ id: 'order_with_120_audits', total: 150 });

    const auditBatch = db.batch();
    for (let i = 1; i <= 120; i++) {
      const auditRef = orderRef.collection('auditEvents').doc(`audit_${i}`);
      auditBatch.set(auditRef, { action: `EVENT_${i}`, timestamp: new Date().toISOString() });
    }
    await auditBatch.commit();

    // Verify 120 audits exist
    const auditCountBefore = (await orderRef.collection('auditEvents').get()).size;
    console.log(`  Criados ${auditCountBefore} auditEvents dentro da ordem.`);

    // Perform cleanup
    const result = await performRealOrdersCleanup(rId, 'req_large_subcol');

    // Verify audits after deletion
    const auditCountAfter = (await orderRef.collection('auditEvents').get()).size;
    const orderDocAfter = await orderRef.get();

    const testPassed = result.success && auditCountBefore === 120 && auditCountAfter === 0 && !orderDocAfter.exists;
    if (!testPassed) allTestsPassed = false;

    reports.push({
      modalidade: 'Subcoleções com >100 registros',
      quantidadeAntes: auditCountBefore,
      quantidadeRestante: auditCountAfter,
      statusFinalReal: testPassed ? 'SUCESSO' : 'FALHA'
    });
    console.log(`  Subcoleção >100 zerada com sucesso: ${testPassed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 4: LARGE BACKUP VOLUME (PAGINATED CHUNKS)
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 4: Backup em grande volume paginado (Chunks em subcoleção) ---');
    const rId = 'test_rest_large_backup';
    const ownerId = 'owner_large_backup';
    const cleanupReqId = 'req_large_backup_chunks';

    await db.collection('restaurants').doc(rId).set({ id: rId, nome: 'Restaurante Backup Grande', primaryOwnerUid: ownerId, em_manutencao: false });
    await createTestUser(ownerId, 'owner_bk@test.com', 'Dono Backup', 'RESTAURANT_OWNER', rId);

    // Seed 250 orders in batches to test multi-chunk backup (CHUNK_SIZE = 150 -> 2 chunks)
    for (let batchIdx = 0; batchIdx < 5; batchIdx++) {
      const b = db.batch();
      for (let i = 1; i <= 50; i++) {
        const orderNum = batchIdx * 50 + i;
        const ref = db.collection('restaurants').doc(rId).collection('orders').doc(`order_bk_${orderNum}`);
        b.set(ref, {
          id: `order_bk_${orderNum}`,
          total: orderNum * 10,
          customerName: `Cliente ${orderNum}`
        });
      }
      await b.commit();
    }

    // Execute real orders cleanup
    const result = await performRealOrdersCleanup(rId, cleanupReqId);

    // Verify backup metadata and chunks
    const backupDocRef = db.collection('restaurants').doc(rId).collection('dataCleanupRequests').doc(cleanupReqId).collection('backup').doc('operational_data');
    const backupDoc = await backupDocRef.get();

    const chunksSnap = await backupDocRef.collection('chunks').get();

    const backupData = backupDoc.data();
    const totalRecordsInBk = backupData?.quantidadeDeRegistros || 0;
    const chunkCount = backupData?.chunkCount || 0;
    const statusDoBackup = backupData?.statusDoBackup;

    const testPassed = result.success &&
      backupDoc.exists &&
      statusDoBackup === 'SUCCESS' &&
      totalRecordsInBk === 250 &&
      chunkCount === 2 &&
      chunksSnap.size === 2;

    if (!testPassed) allTestsPassed = false;

    reports.push({
      modalidade: 'Backup paginado em grande volume',
      registrosNoBackup: totalRecordsInBk,
      chunksGerados: chunksSnap.size,
      statusDoBackup,
      statusFinalReal: testPassed ? 'SUCESSO' : 'FALHA'
    });
    console.log(`  Backup paginado (250 docs -> 2 chunks): ${testPassed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 5: REMAINING RECORDS & PARTIALLY_COMPLETED STATUS
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 5: Verificação final com registros restantes (PARTIALLY_COMPLETED) ---');
    const rId = 'test_rest_partial_check';
    const ownerId = 'owner_partial_check';

    await db.collection('restaurants').doc(rId).set({ id: rId, nome: 'Restaurante Parcial Teste', primaryOwnerUid: ownerId, em_manutencao: false });
    await createTestUser(ownerId, 'owner_part@test.com', 'Dono Parcial', 'RESTAURANT_OWNER', rId);

    // Test verification helper with leftover order
    await db.collection('restaurants').doc(rId).collection('orders').doc('order_leftover').set({ id: 'order_leftover', total: 99 });

    // Call verifyOrdersCleanupComplete
    const verifyRes = await verifyOrdersCleanupComplete(rId);

    const testPassed = !verifyRes.isClean && verifyRes.remainingCollections.includes('orders');
    if (!testPassed) allTestsPassed = false;

    // Clean up test leftover doc
    await db.collection('restaurants').doc(rId).collection('orders').doc('order_leftover').delete();

    reports.push({
      modalidade: 'Detecção de registros restantes e status parcial',
      isCleanIdentified: verifyRes.isClean,
      colecoesComRegistros: verifyRes.remainingCollections.join(', '),
      statusFinalReal: testPassed ? 'SUCESSO' : 'FALHA'
    });
    console.log(`  Status parcial e relatório de coleção restante: ${testPassed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('================================================================');
  console.log('CLEANUP VALIDATION SUITE SUMMARY REPORT');
  console.log('================================================================');
  console.table(reports);

  console.log(`\nALL TESTS PASSED: ${allTestsPassed ? 'YES ✅' : 'NO ❌'}`);

  if (!allTestsPassed) {
    process.exit(1);
  }
}

runAllCleanupTests().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
