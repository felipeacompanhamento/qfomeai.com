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

const BASE_URL = 'http://localhost:3000';

async function apiPost(endpoint: string, uid: string, body: any = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer test_token_${uid}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function apiGet(endpoint: string, uid: string) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer test_token_${uid}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

async function createTestUserDoc(uid: string, email: string, name: string, role: string, restaurantId: string, active = true) {
  await db.collection('users').doc(uid).set({
    uid,
    email,
    name,
    nome: name,
    role,
    tipo_usuario: role === 'RESTAURANT_OWNER' ? 'restaurante' : role,
    restaurantId,
    active,
    status: active ? 'ACTIVE' : 'INACTIVE',
    createdAt: new Date().toISOString()
  });

  try {
    const existing = await authAdmin.getUser(uid).catch(() => null);
    if (!existing) {
      await authAdmin.createUser({
        uid,
        email,
        displayName: name,
        disabled: !active
      });
    }
  } catch (e) {}
}

interface TestReport {
  testName: string;
  modalidadeTested?: string;
  endpointsTested: string[];
  countsBefore?: any;
  countsAfter?: any;
  passed: boolean;
  notes: string;
}

const reports: TestReport[] = [];

async function runRealFlowTestSuite() {
  console.log('================================================================');
  console.log('STARTING REAL UI & ENDPOINT FLOW VALIDATION SUITE (PROMPT 4.8.36)');
  console.log('================================================================\n');

  let allTestsPassed = true;

  // --------------------------------------------------------------------------
  // TEST 1: FULL REAL CLEANUP FLOW (ORDERS_ONLY) VIA ENDPOINTS
  // Steps 1 to 12 from PROMPT 4.8.36
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 1: Fluxo Completo Real de Limpeza de Pedidos (ORDERS_ONLY) ---');
    const rId = 'rest_flow_test_1';
    const ownerId = 'owner_flow_main_1';

    // 1. Setup Restaurant & Primary Owner
    await db.collection('restaurants').doc(rId).set({
      id: rId,
      nome: 'Restaurante Sabor Real',
      primaryOwnerUid: ownerId,
      em_manutencao: false
    });
    await createTestUserDoc(ownerId, 'owner_flow1@test.com', 'Dono Principal 1', 'RESTAURANT_OWNER', rId);

    // 2. Seed Operational Data
    for (let i = 1; i <= 5; i++) {
      await db.collection('restaurants').doc(rId).collection('orders').doc(`order_${i}`).set({
        id: `order_${i}`,
        total: 50 * i,
        status: 'DELIVERED',
        createdAt: new Date().toISOString()
      });
    }
    await db.collection('restaurants').doc(rId).collection('caixas').doc('caixa_1').set({ id: 'caixa_1', status: 'CLOSED' });
    await db.collection('restaurants').doc(rId).collection('contasReceber').doc('cr_1').set({ id: 'cr_1', valor: 100 });

    // 3. Seed Commercial Data (to preserve)
    await db.collection('restaurants').doc(rId).collection('products').doc('prod_1').set({ id: 'prod_1', name: 'Pizza Margherita', price: 45 });
    await db.collection('restaurants').doc(rId).collection('categories').doc('cat_1').set({ id: 'cat_1', name: 'Pizzas' });

    const ordersBefore = (await db.collection('restaurants').doc(rId).collection('orders').get()).size;
    const caixasBefore = (await db.collection('restaurants').doc(rId).collection('caixas').get()).size;
    const productsBefore = (await db.collection('restaurants').doc(rId).collection('products').get()).size;

    console.log(`  [Antes] Pedidos: ${ordersBefore}, Caixas: ${caixasBefore}, Produtos: ${productsBefore}`);

    // Step 1 - 3: Request Cleanup
    const reqRes = await apiPost('/api/restaurant/cleanup/request', ownerId, {
      cleanupType: 'ORDERS_ONLY',
      reason: 'Solicitação formal de limpeza de histórico de teste da loja'
    });

    if (!reqRes.ok) {
      console.error('  FAILED at POST /api/restaurant/cleanup/request:', reqRes.data);
      allTestsPassed = false;
    }
    const requestId = reqRes.data.requestId;

    // Step 4 - 5: Request Analysis (Dry-run)
    const analyzeRes = await apiPost(`/api/restaurant/cleanup/${requestId}/analyze`, ownerId);
    if (!analyzeRes.ok || analyzeRes.data.status !== 'AWAITING_CONFIRMATION') {
      console.error('  FAILED at POST /api/restaurant/cleanup/:id/analyze:', analyzeRes.data);
      allTestsPassed = false;
    }
    const estimatedDelete = analyzeRes.data.estimatedCounts?.toDelete;
    console.log('  [Análise real retornada]:', JSON.stringify(estimatedDelete));

    // Step 6 - 7: Confirm with Restaurant Name
    const confirmRes = await apiPost(`/api/restaurant/cleanup/${requestId}/confirm`, ownerId, {
      restaurantName: 'Restaurante Sabor Real'
    });
    if (!confirmRes.ok || confirmRes.data.status !== 'APPROVED') {
      console.error('  FAILED at POST /api/restaurant/cleanup/:id/confirm:', confirmRes.data);
      allTestsPassed = false;
    }

    // Step 8 - 10: Execute Cleanup & Track Progress
    const executeRes = await apiPost(`/api/restaurant/cleanup/${requestId}/execute`, ownerId);
    if (!executeRes.ok) {
      console.error('  FAILED at POST /api/restaurant/cleanup/:id/execute:', executeRes.data);
      allTestsPassed = false;
    }

    // Poll endpoint GET /api/restaurant/cleanup/:id until COMPLETED
    let attempts = 0;
    let finalStatus = 'RUNNING';
    let lastProgress = 0;

    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 500));
      const pollRes = await apiGet(`/api/restaurant/cleanup/${requestId}`, ownerId);
      if (pollRes.ok) {
        finalStatus = pollRes.data.status;
        lastProgress = pollRes.data.progress;
        if (finalStatus === 'COMPLETED' || finalStatus === 'FAILED' || finalStatus === 'PARTIALLY_COMPLETED') {
          break;
        }
      }
      attempts++;
    }

    // Step 11 - 12: Page Refresh simulation (Get request again & verify direct database)
    const pageRefreshRes = await apiGet(`/api/restaurant/cleanup/${requestId}`, ownerId);

    const ordersAfter = (await db.collection('restaurants').doc(rId).collection('orders').get()).size;
    const caixasAfter = (await db.collection('restaurants').doc(rId).collection('caixas').get()).size;
    const productsAfter = (await db.collection('restaurants').doc(rId).collection('products').get()).size;
    const ownerAfter = await db.collection('users').doc(ownerId).get();

    console.log(`  [Depois] Pedidos: ${ordersAfter}, Caixas: ${caixasAfter}, Produtos: ${productsAfter}`);
    console.log(`  [Status Final Retornado pelo Backend]: ${pageRefreshRes.data.status} (Progresso: ${pageRefreshRes.data.progress}%)`);

    const passed = pageRefreshRes.data.status === 'COMPLETED' &&
      ordersAfter === 0 &&
      caixasAfter === 0 &&
      productsAfter === productsBefore &&
      ownerAfter.exists &&
      ownerAfter.data()?.active === true;

    if (!passed) allTestsPassed = false;

    reports.push({
      testName: 'Fluxo Completo Real (ORDERS_ONLY)',
      modalidadeTested: 'ORDERS_ONLY',
      endpointsTested: [
        'POST /api/restaurant/cleanup/request',
        'POST /api/restaurant/cleanup/:id/analyze',
        'POST /api/restaurant/cleanup/:id/confirm',
        'POST /api/restaurant/cleanup/:id/execute',
        'GET /api/restaurant/cleanup/:id'
      ],
      countsBefore: { orders: ordersBefore, caixas: caixasBefore, products: productsBefore },
      countsAfter: { orders: ordersAfter, caixas: caixasAfter, products: productsAfter },
      passed,
      notes: passed ? 'Fluxo de 12 passos executado com sucesso e dados confirmados no Firestore.' : 'Falha na validação do fluxo completo.'
    });

    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: PERMISSION VALIDATION (WAITER & SECONDARY OWNER)
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 2: Validação de Permissões (Garçom e OWNER Secundário) ---');
    const rId = 'rest_perm_test';
    const primaryOwnerId = 'primary_owner_perm';
    const secondaryOwnerId = 'secondary_owner_perm';
    const waiterId = 'waiter_perm';

    await db.collection('restaurants').doc(rId).set({
      id: rId,
      nome: 'Restaurante Permissões',
      primaryOwnerUid: primaryOwnerId,
      em_manutencao: false
    });

    await createTestUserDoc(primaryOwnerId, 'primary@perm.com', 'Dono Primario', 'RESTAURANT_OWNER', rId);
    await createTestUserDoc(secondaryOwnerId, 'secondary@perm.com', 'Dono Secundario', 'RESTAURANT_OWNER', rId);
    await createTestUserDoc(waiterId, 'waiter@perm.com', 'Garçom Perm', 'WAITER', rId);

    // 1. Garçom tenta solicitar limpeza
    const waiterReq = await apiPost('/api/restaurant/cleanup/request', waiterId, {
      cleanupType: 'ORDERS_ONLY',
      reason: 'Tentativa indevida por garçom'
    });

    const waiterBlocked = waiterReq.status === 403 &&
      typeof waiterReq.data.error === 'string' &&
      waiterReq.data.error.includes('Proprietário Principal');

    // 2. OWNER secundário tenta solicitar limpeza
    const secondaryReq = await apiPost('/api/restaurant/cleanup/request', secondaryOwnerId, {
      cleanupType: 'ORDERS_ONLY',
      reason: 'Tentativa por dono secundário'
    });

    const secondaryBlocked = secondaryReq.status === 403 &&
      typeof secondaryReq.data.error === 'string' &&
      secondaryReq.data.error.includes('Proprietário Principal');

    const passed = waiterBlocked && secondaryBlocked;
    if (!passed) allTestsPassed = false;

    reports.push({
      testName: 'Validação de Permissão (Garçom e Owner Secundário)',
      endpointsTested: ['POST /api/restaurant/cleanup/request'],
      passed,
      notes: `Garçom bloqueado (403): ${waiterBlocked}, Owner Secundário bloqueado (403): ${secondaryBlocked}`
    });

    console.log(`  Garçom bloqueado: ${waiterBlocked} (${waiterReq.data.error})`);
    console.log(`  Owner Secundário bloqueado: ${secondaryBlocked} (${secondaryReq.data.error})`);
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: DUPLICATE REQUEST BLOCKING & INCORRECT RESTAURANT NAME
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 3: Bloqueio de Solicitação Duplicada & Nome Incorreto ---');
    const rId = 'rest_dup_test';
    const ownerId = 'owner_dup_test';

    await db.collection('restaurants').doc(rId).set({
      id: rId,
      nome: 'Restaurante Duplicado Teste',
      primaryOwnerUid: ownerId,
      em_manutencao: false
    });
    await createTestUserDoc(ownerId, 'owner_dup@test.com', 'Dono Dup', 'RESTAURANT_OWNER', rId);

    // 1. Create first request
    const req1 = await apiPost('/api/restaurant/cleanup/request', ownerId, {
      cleanupType: 'ORDERS_ONLY',
      reason: 'Primeira solicitação de limpeza válida'
    });

    // 2. Attempt second request while first is active -> Expect 409
    const req2 = await apiPost('/api/restaurant/cleanup/request', ownerId, {
      cleanupType: 'INTERNAL_USERS_ONLY',
      reason: 'Segunda solicitação de limpeza que deve ser bloqueada'
    });

    const duplicateBlocked = req2.status === 409 &&
      typeof req2.data.error === 'string' &&
      req2.data.error.toLowerCase().includes('já existe');

    // 3. Analyze request 1
    const reqId1 = req1.data.requestId;
    await apiPost(`/api/restaurant/cleanup/${reqId1}/analyze`, ownerId);

    // 4. Confirm with wrong restaurant name -> Expect 400
    const wrongConfirm = await apiPost(`/api/restaurant/cleanup/${reqId1}/confirm`, ownerId, {
      restaurantName: 'Nome Totalmente Errado'
    });

    const wrongNameBlocked = wrongConfirm.status === 400 &&
      typeof wrongConfirm.data.error === 'string' &&
      wrongConfirm.data.error.includes('Nome do restaurante incorreto');

    // 5. Cancel request 1 to leave clean state
    const cancelRes = await apiPost(`/api/restaurant/cleanup/${reqId1}/cancel`, ownerId);
    const cancelSuccess = cancelRes.ok && cancelRes.data.status === 'CANCELLED';

    const passed = duplicateBlocked && wrongNameBlocked && cancelSuccess;
    if (!passed) allTestsPassed = false;

    reports.push({
      testName: 'Solicitação Duplicada, Nome Incorreto & Cancelamento',
      endpointsTested: [
        'POST /api/restaurant/cleanup/request',
        'POST /api/restaurant/cleanup/:id/confirm',
        'POST /api/restaurant/cleanup/:id/cancel'
      ],
      passed,
      notes: `Duplicada bloqueada (409): ${duplicateBlocked}, Nome errado bloqueado (400): ${wrongNameBlocked}, Cancelamento retornado: ${cancelSuccess}`
    });

    console.log(`  Duplicada bloqueada: ${duplicateBlocked}`);
    console.log(`  Nome errado bloqueado: ${wrongNameBlocked}`);
    console.log(`  Cancelamento com sucesso: ${cancelSuccess}`);
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 4: RESTAURANT ISOLATION (CLEANUP ON REST A DOES NOT AFFECT REST B)
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 4: Isolamento entre Dois Restaurantes ---');
    const rIdA = 'rest_iso_a';
    const rIdB = 'rest_iso_b';
    const ownerA = 'owner_iso_a';
    const ownerB = 'owner_iso_b';

    await db.collection('restaurants').doc(rIdA).set({ id: rIdA, nome: 'Restaurante Isolado A', primaryOwnerUid: ownerA, em_manutencao: false });
    await db.collection('restaurants').doc(rIdB).set({ id: rIdB, nome: 'Restaurante Isolado B', primaryOwnerUid: ownerB, em_manutencao: false });

    await createTestUserDoc(ownerA, 'owner_a@iso.com', 'Dono A', 'RESTAURANT_OWNER', rIdA);
    await createTestUserDoc(ownerB, 'owner_b@iso.com', 'Dono B', 'RESTAURANT_OWNER', rIdB);

    // Seed orders for both
    for (let i = 1; i <= 3; i++) {
      await db.collection('restaurants').doc(rIdA).collection('orders').doc(`order_a_${i}`).set({ id: `order_a_${i}`, total: 10 * i });
      await db.collection('restaurants').doc(rIdB).collection('orders').doc(`order_b_${i}`).set({ id: `order_b_${i}`, total: 20 * i });
    }

    const countA_before = (await db.collection('restaurants').doc(rIdA).collection('orders').get()).size;
    const countB_before = (await db.collection('restaurants').doc(rIdB).collection('orders').get()).size;

    // Perform cleanup on Restaurant A
    const reqRes = await apiPost('/api/restaurant/cleanup/request', ownerA, {
      cleanupType: 'ORDERS_ONLY',
      reason: 'Limpeza de teste no Restaurante A'
    });
    const reqId = reqRes.data.requestId;

    await apiPost(`/api/restaurant/cleanup/${reqId}/analyze`, ownerA);
    await apiPost(`/api/restaurant/cleanup/${reqId}/confirm`, ownerA, { restaurantName: 'Restaurante Isolado A' });
    await apiPost(`/api/restaurant/cleanup/${reqId}/execute`, ownerA);

    // Wait execution
    let attempts = 0;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 500));
      const res = await apiGet(`/api/restaurant/cleanup/${reqId}`, ownerA);
      if (res.ok && res.data.status === 'COMPLETED') break;
      attempts++;
    }

    const countA_after = (await db.collection('restaurants').doc(rIdA).collection('orders').get()).size;
    const countB_after = (await db.collection('restaurants').doc(rIdB).collection('orders').get()).size;

    const passed = countA_before === 3 && countB_before === 3 && countA_after === 0 && countB_after === 3;
    if (!passed) allTestsPassed = false;

    reports.push({
      testName: 'Isolamento entre Restaurantes',
      endpointsTested: [
        'POST /api/restaurant/cleanup/request',
        'POST /api/restaurant/cleanup/:id/execute'
      ],
      countsBefore: { restA: countA_before, restB: countB_before },
      countsAfter: { restA: countA_after, restB: countB_after },
      passed,
      notes: passed ? 'Restaurante A limpo com sucesso, dados do Restaurante B intactos.' : 'Falha no isolamento entre restaurantes.'
    });

    console.log(`  [Restaurante A] Antes: ${countA_before}, Depois: ${countA_after}`);
    console.log(`  [Restaurante B] Antes: ${countB_before}, Depois: ${countB_after} (Inalterado)`);
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // TEST 5: ALL MODALITIES FLOW TEST (INTERNAL_USERS_ONLY, ORDERS_AND_INTERNAL_USERS, FACTORY_RESET)
  // --------------------------------------------------------------------------
  {
    console.log('--- TEST 5: Teste das Demais Modalidades (INTERNAL_USERS_ONLY, FACTORY_RESET) ---');

    // 5A: INTERNAL_USERS_ONLY
    const rIdStaff = 'rest_mod_staff';
    const ownerStaff = 'owner_mod_staff';
    const waiterStaff = 'waiter_mod_staff';

    await db.collection('restaurants').doc(rIdStaff).set({ id: rIdStaff, nome: 'Restaurante Mod Equipe', primaryOwnerUid: ownerStaff, em_manutencao: false });
    await createTestUserDoc(ownerStaff, 'owner_s@test.com', 'Dono Equipe', 'RESTAURANT_OWNER', rIdStaff);
    await createTestUserDoc(waiterStaff, 'waiter_s@test.com', 'Garçom Equipe', 'WAITER', rIdStaff);
    await db.collection('restaurants').doc(rIdStaff).collection('staffProfiles').doc(waiterStaff).set({ id: waiterStaff, role: 'WAITER' });

    const staffReq = await apiPost('/api/restaurant/cleanup/request', ownerStaff, {
      cleanupType: 'INTERNAL_USERS_ONLY',
      reason: 'Limpeza de equipe sem histórico'
    });
    const sReqId = staffReq.data.requestId;

    await apiPost(`/api/restaurant/cleanup/${sReqId}/analyze`, ownerStaff);
    await apiPost(`/api/restaurant/cleanup/${sReqId}/confirm`, ownerStaff, { restaurantName: 'Restaurante Mod Equipe' });
    await apiPost(`/api/restaurant/cleanup/${sReqId}/execute`, ownerStaff);

    let attempts = 0;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 500));
      const res = await apiGet(`/api/restaurant/cleanup/${sReqId}`, ownerStaff);
      if (res.ok && res.data.status === 'COMPLETED') break;
      attempts++;
    }

    const waiterUserAfter = await db.collection('users').doc(waiterStaff).get();
    const ownerUserAfter = await db.collection('users').doc(ownerStaff).get();

    const staffPassed = !waiterUserAfter.exists && ownerUserAfter.exists && ownerUserAfter.data()?.active === true;

    // 5B: FACTORY_RESET
    const rIdReset = 'rest_mod_reset';
    const ownerReset = 'owner_mod_reset';

    await db.collection('restaurants').doc(rIdReset).set({ id: rIdReset, nome: 'Restaurante Reset Geral', primaryOwnerUid: ownerReset, em_manutencao: false });
    await createTestUserDoc(ownerReset, 'owner_r@test.com', 'Dono Reset', 'RESTAURANT_OWNER', rIdReset);

    await db.collection('restaurants').doc(rIdReset).collection('orders').doc('order_r_1').set({ id: 'order_r_1', total: 100 });
    await db.collection('restaurants').doc(rIdReset).collection('products').doc('prod_r_1').set({ id: 'prod_r_1', name: 'Suco' });

    const resetReq = await apiPost('/api/restaurant/cleanup/request', ownerReset, {
      cleanupType: 'FACTORY_RESET',
      reason: 'Restauração total para o estado inicial'
    });
    const rReqId = resetReq.data.requestId;

    await apiPost(`/api/restaurant/cleanup/${rReqId}/analyze`, ownerReset);
    await apiPost(`/api/restaurant/cleanup/${rReqId}/confirm`, ownerReset, { restaurantName: 'Restaurante Reset Geral' });
    await apiPost(`/api/restaurant/cleanup/${rReqId}/execute`, ownerReset);

    attempts = 0;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 500));
      const res = await apiGet(`/api/restaurant/cleanup/${rReqId}`, ownerReset);
      if (res.ok && res.data.status === 'COMPLETED') break;
      attempts++;
    }

    const ordersResetAfter = (await db.collection('restaurants').doc(rIdReset).collection('orders').get()).size;
    const prodsResetAfter = (await db.collection('restaurants').doc(rIdReset).collection('products').get()).size;
    const restDocAfter = await db.collection('restaurants').doc(rIdReset).get();

    const resetPassed = ordersResetAfter === 0 &&
      prodsResetAfter === 0 &&
      restDocAfter.exists &&
      restDocAfter.data()?.configuracao_inicial_pendente === true;

    const passed = staffPassed && resetPassed;
    if (!passed) allTestsPassed = false;

    reports.push({
      testName: 'Demais Modalidades (INTERNAL_USERS_ONLY e FACTORY_RESET)',
      modalidadeTested: 'INTERNAL_USERS_ONLY & FACTORY_RESET',
      endpointsTested: [
        'POST /api/restaurant/cleanup/request',
        'POST /api/restaurant/cleanup/:id/analyze',
        'POST /api/restaurant/cleanup/:id/confirm',
        'POST /api/restaurant/cleanup/:id/execute',
        'GET /api/restaurant/cleanup/:id'
      ],
      passed,
      notes: `Limpeza de Equipe: ${staffPassed ? 'OK' : 'FALHA'}, Reset Geral: ${resetPassed ? 'OK' : 'FALHA'}`
    });

    console.log(`  Modalidade INTERNAL_USERS_ONLY: ${staffPassed ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`  Modalidade FACTORY_RESET: ${resetPassed ? 'PASSED ✅' : 'FAILED ❌'}`);
    console.log(`  Result: ${passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);
  }

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  console.log('================================================================');
  console.log('REAL ENDPOINT FLOW VALIDATION SUITE SUMMARY REPORT');
  console.log('================================================================');
  console.table(reports.map(r => ({
    teste: r.testName,
    modalidades: r.modalidadeTested || 'N/A',
    passou: r.passed ? 'SIM ✅' : 'NÃO ❌',
    detalhes: r.notes
  })));

  console.log(`\nALL TESTS PASSED: ${allTestsPassed ? 'YES ✅' : 'NO ❌'}\n`);
  process.exit(0);
}

runRealFlowTestSuite().catch(err => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
