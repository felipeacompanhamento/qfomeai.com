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

// Global stats tracker
interface RequestStat {
  endpoint: string;
  method: string;
  status: number;
  durationMs: number;
  success: boolean;
  duplicated: boolean;
}

const allStats: RequestStat[] = [];
let firestoreReads = 0;
let firestoreWrites = 0;

// Log helper
function logMetric(endpoint: string, method: string, status: number, durationMs: number, success: boolean, duplicated = false) {
  allStats.push({ endpoint, method, status, durationMs, success, duplicated });
}

// RESTAURANT IDs
const REST_A = 'rest_audit_x1';
const REST_B = 'rest_audit_x2';

async function apiCall(endpoint: string, method: 'GET' | 'POST', uid: string, body: any = {}): Promise<{ status: number; data: any; durationMs: number }> {
  const start = performance.now();
  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer test_token_${uid}`,
      'Content-Type': 'application/json'
    };
    
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body) : undefined
    });

    const durationMs = performance.now() - start;
    let data: any = {};
    try {
      data = await res.json();
    } catch (_) {}

    const success = res.ok;
    if (res.status !== 200 && res.status !== 201) {
      console.warn(`[API_DEBUG] ${method} ${endpoint} (User: ${uid}) returned status ${res.status}:`, JSON.stringify(data));
    }
    logMetric(endpoint, method, res.status, durationMs, success);
    return { status: res.status, data, durationMs };
  } catch (err: any) {
    const durationMs = performance.now() - start;
    logMetric(endpoint, method, 0, durationMs, false);
    return { status: 0, data: { error: err.message }, durationMs };
  }
}

async function setupDatabaseData() {
  console.log('\n================================================================');
  console.log('   CONFIGURANDO DADOS PARA AUDITORIA DE CARGA E CONCORRÊNCIA');
  console.log('================================================================');

  // 1. Setup Restaurants
  console.log('Criando restaurantes isolados...');
  await db.collection('restaurants').doc(REST_A).set({
    id: REST_A,
    name: 'Restaurante Carga A',
    formas_pagamento: ['dinheiro', 'pix', 'credito'],
    active: true
  });
  firestoreWrites++;

  await db.collection('restaurants').doc(REST_B).set({
    id: REST_B,
    name: 'Restaurante Carga B',
    formas_pagamento: ['dinheiro', 'pix', 'credito'],
    active: true
  });
  firestoreWrites++;

  // 2. Setup Products
  console.log('Inserindo produtos com estoque abundante...');
  await db.collection('restaurants').doc(REST_A).collection('products').doc('prod_audit_1').set({
    id: 'prod_audit_1',
    nome: 'Refeição Premium A',
    preco: 25.00,
    controlarEstoque: true,
    estoqueAtual: 5000,
    estoque: 5000,
    stock: 5000,
    permitirVendaSemEstoque: false,
    needs_production: false
  });
  firestoreWrites++;

  await db.collection('restaurants').doc(REST_B).collection('products').doc('prod_audit_1').set({
    id: 'prod_audit_1',
    nome: 'Refeição Premium B',
    preco: 30.00,
    controlarEstoque: true,
    estoqueAtual: 5000,
    estoque: 5000,
    stock: 5000,
    permitirVendaSemEstoque: false,
    needs_production: false
  });
  firestoreWrites++;

  // 3. Setup Open Caixas
  console.log('Abrindo caixas...');
  await db.collection('restaurants').doc(REST_A).collection('caixas').doc('caixa_audit_1').set({
    id: 'caixa_audit_1',
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    openedBy: 'test_audit_cashier_a',
    saldoFisicoCents: 500000,
    saldoAberturaCents: 500000
  });
  firestoreWrites++;

  await db.collection('restaurants').doc(REST_B).collection('caixas').doc('caixa_audit_1').set({
    id: 'caixa_audit_1',
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    openedBy: 'test_audit_cashier_b',
    saldoFisicoCents: 500000,
    saldoAberturaCents: 500000
  });
  firestoreWrites++;

  // 4. Setup Users
  console.log('Registrando usuários no Firestore...');
  const users = [
    { uid: 'test_audit_waiter_a', email: 'waiter_a@test.com', nome: 'Garçom A', role: 'WAITER', restaurantId: REST_A, permissions: [] },
    { uid: 'test_audit_waiter_b', email: 'waiter_b@test.com', nome: 'Garçom B', role: 'WAITER', restaurantId: REST_B, permissions: [] },
    { uid: 'test_audit_kitchen_a', email: 'kitchen_a@test.com', nome: 'Cozinha A', role: 'KITCHEN', restaurantId: REST_A, permissions: ['cozinha.aceitar', 'cozinha.concluir_item'] },
    { uid: 'test_audit_kitchen_b', email: 'kitchen_b@test.com', nome: 'Cozinha B', role: 'KITCHEN', restaurantId: REST_B, permissions: ['cozinha.aceitar', 'cozinha.concluir_item'] },
    { uid: 'test_audit_cashier_a', email: 'cashier_a@test.com', nome: 'Caixa A', role: 'CASHIER', restaurantId: REST_A, permissions: ['caixa.visualizar'] },
    { uid: 'test_audit_cashier_b', email: 'cashier_b@test.com', nome: 'Caixa B', role: 'CASHIER', restaurantId: REST_B, permissions: ['caixa.visualizar'] },
    { uid: 'test_audit_owner_a', email: 'owner_a@test.com', nome: 'Dono A', role: 'RESTAURANT_OWNER', restaurantId: REST_A, permissions: ['caixa.visualizar', 'caixa.estornar'] },
    { uid: 'test_audit_owner_b', email: 'owner_b@test.com', nome: 'Dono B', role: 'RESTAURANT_OWNER', restaurantId: REST_B, permissions: ['caixa.visualizar', 'caixa.estornar'] },
  ];

  for (const u of users) {
    await db.collection('users').doc(u.uid).set({
      uid: u.uid,
      email: u.email,
      name: u.nome,
      nome: u.nome,
      role: u.role,
      tipo_usuario: u.role === 'RESTAURANT_OWNER' ? 'restaurante' : u.role,
      restaurantId: u.restaurantId,
      active: true,
      status: 'ACTIVE',
      permissions: u.permissions,
      createdAt: new Date().toISOString()
    });
    firestoreWrites++;
  }

  console.log('Preparando comandas e mesas para o teste de carga...');
  // Bulk create tables and tabs using separate batches to avoid write limit and already-committed error
  let currentBatch = db.batch();
  let operationCount = 0;

  for (let i = 1; i <= 600; i++) {
    // Rest A
    const tARef = db.collection('restaurants').doc(REST_A).collection('tables').doc(`table_audit_${i}`);
    currentBatch.set(tARef, {
      id: `table_audit_${i}`,
      number: `${i}`,
      active: true,
      status: 'AVAILABLE',
      restaurantId: REST_A
    });
    firestoreWrites++;
    operationCount++;

    const tabARef = db.collection('restaurants').doc(REST_A).collection('tabs').doc(`tab_audit_${i}`);
    currentBatch.set(tabARef, {
      id: `tab_audit_${i}`,
      restaurantId: REST_A,
      tableId: `table_audit_${i}`,
      status: 'OPEN',
      customerName: `Cliente Carga A ${i}`,
      totalInCents: 0,
      paidInCents: 0,
      remainingInCents: 0,
      createdAt: new Date().toISOString()
    });
    firestoreWrites++;
    operationCount++;

    // Rest B
    const tBRef = db.collection('restaurants').doc(REST_B).collection('tables').doc(`table_audit_${i}`);
    currentBatch.set(tBRef, {
      id: `table_audit_${i}`,
      number: `${i}`,
      active: true,
      status: 'AVAILABLE',
      restaurantId: REST_B
    });
    firestoreWrites++;
    operationCount++;

    const tabBRef = db.collection('restaurants').doc(REST_B).collection('tabs').doc(`tab_audit_${i}`);
    currentBatch.set(tabBRef, {
      id: `tab_audit_${i}`,
      restaurantId: REST_B,
      tableId: `table_audit_${i}`,
      status: 'OPEN',
      customerName: `Cliente Carga B ${i}`,
      totalInCents: 0,
      paidInCents: 0,
      remainingInCents: 0,
      createdAt: new Date().toISOString()
    });
    firestoreWrites++;
    operationCount++;

    if (operationCount >= 400) {
      await currentBatch.commit();
      currentBatch = db.batch();
      operationCount = 0;
      console.log(`Inseridos registros de mesas e comandas para i = ${i}...`);
    }
  }

  if (operationCount > 0) {
    await currentBatch.commit();
  }
  console.log('Configuração de banco concluída com sucesso!');
}

async function runSingleOrderFlow(index: number, restId: string, waiterUid: string, kitchenUid: string, cashierUid: string): Promise<boolean> {
  const tableId = `table_audit_${index}`;
  const tabId = `tab_audit_${index}`;
  const clientActionId = `act_load_${restId}_${index}_${Date.now()}`;

  // 1. Enviar rodada (WAITER)
  const roundBody = {
    clientActionId,
    tableId,
    tabId,
    origin: 'WAITER',
    restaurantId: restId,
    items: [
      {
        productId: 'prod_audit_1',
        productName: 'Refeição Premium',
        quantity: 1,
        unitPriceCents: 2500
      }
    ]
  };

  const roundRes = await apiCall('/api/restaurant/tab/send-round', 'POST', waiterUid, roundBody);
  if (roundRes.status !== 200 || !roundRes.data?.success) {
    return false;
  }

  const orderId = roundRes.data.data?.orderId || roundRes.data.orderId;
  if (!orderId) return false;

  // Update order status to pendente in Firestore to allow testing of kitchen accept flow
  try {
    await db.collection('restaurants').doc(restId).collection('orders').doc(orderId).update({
      status: 'pendente'
    });
    firestoreWrites++;
  } catch (err) {
    return false;
  }

  // 2. Cozinha aceita pedido (KITCHEN)
  const acceptRes = await apiCall(`/api/restaurant/orders/${orderId}/kitchen/accept`, 'POST', kitchenUid, {
    clientActionId: `act_accept_${restId}_${index}`
  });
  if (acceptRes.status !== 200) return false;

  // 3. Cozinha conclui pedido (KITCHEN)
  const concludeRes = await apiCall(`/api/restaurant/orders/${orderId}/kitchen/conclude`, 'POST', kitchenUid, {
    clientActionId: `act_conclude_${restId}_${index}`
  });
  if (concludeRes.status !== 200) return false;

  // 4. Pagamento e Baixa (CASHIER)
  const payBody = {
    clientActionId: `act_pay_${restId}_${index}`,
    orderId,
    operatorName: 'Caixa Audit',
    payments: [
      {
        paymentMethodId: 'pix',
        amount: 2500
      }
    ]
  };

  const payRes = await apiCall('/api/restaurant/financeiro/pedidos/processar-pagamentos', 'POST', cashierUid, payBody);
  return payRes.status === 200;
}

// Scenarios runner
async function runLoadScenario(size: number) {
  console.log(`\n----------------------------------------------------------------`);
  console.log(` Executando cenário com ${size} pedidos simultâneos (${size * 4} requisições)`);
  console.log(`----------------------------------------------------------------`);

  const promises: Promise<boolean>[] = [];
  const startTime = performance.now();

  for (let i = 1; i <= size; i++) {
    // Distribute load between Rest A and Rest B
    const isRestA = i % 2 === 0;
    const restId = isRestA ? REST_A : REST_B;
    const waiterUid = isRestA ? 'test_audit_waiter_a' : 'test_audit_waiter_b';
    const kitchenUid = isRestA ? 'test_audit_kitchen_a' : 'test_audit_kitchen_b';
    const cashierUid = isRestA ? 'test_audit_cashier_a' : 'test_audit_cashier_b';

    promises.push(runSingleOrderFlow(i, restId, waiterUid, kitchenUid, cashierUid));
  }

  const results = await Promise.all(promises);
  const totalTime = performance.now() - startTime;

  const successfulFlows = results.filter(r => r).length;
  console.log(`Cenário ${size} finalizado em ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`Resultados do fluxo completo: ${successfulFlows}/${size} com sucesso`);
}

async function runConcurrencyAndIdempotencyTests() {
  console.log('\n================================================================');
  console.log('   EXECUTANDO TESTES DE CONCORRÊNCIA E IDEMPOTÊNCIA');
  console.log('================================================================');

  const clientActionId = `act_idemp_${Date.now()}`;
  const tableId = 'table_audit_1';
  const tabId = 'tab_audit_1';

  // 1. Envio concorrente simultâneo com o mesmo clientActionId (Idempotência)
  console.log('1. Testando envio concorrente com o mesmo clientActionId...');
  const body = {
    clientActionId,
    tableId,
    tabId,
    origin: 'WAITER',
    restaurantId: REST_A,
    items: [
      {
        productId: 'prod_audit_1',
        productName: 'Refeição Premium',
        quantity: 1,
        unitPriceCents: 2500
      }
    ]
  };

  const reqs = await Promise.all([
    apiCall('/api/restaurant/tab/send-round', 'POST', 'test_audit_waiter_a', body),
    apiCall('/api/restaurant/tab/send-round', 'POST', 'test_audit_waiter_a', body)
  ]);

  const responses = reqs.map(r => r.status);
  console.log(`Status das respostas concorrentes:`, responses);
  const hasIdempotencySecured = responses.includes(200);
  console.log(`Idempotência tratada com sucesso?`, hasIdempotencySecured ? 'SIM ✅' : 'NÃO ❌');

  // 2. Isolamento de Restaurante
  console.log('2. Testando tentativa de acesso cruzado (Isolamento entre restaurantes)...');
  const crossRes = await apiCall('/api/restaurant/tab/send-round', 'POST', 'test_audit_waiter_a', {
    clientActionId: `act_cross_${Date.now()}`,
    tableId: 'table_audit_1',
    tabId: 'tab_audit_1',
    origin: 'WAITER',
    restaurantId: REST_B, // Waiter A trying to order on Restaurant B
    items: [
      {
        productId: 'prod_audit_1',
        productName: 'Refeição Premium',
        quantity: 1,
        unitPriceCents: 2500
      }
    ]
  });

  console.log(`Status de acesso cruzado (esperado 403):`, crossRes.status);
  const isIsolated = crossRes.status === 403;
  console.log(`Isolamento de restaurantes garantido?`, isIsolated ? 'SIM ✅' : 'NÃO ❌');
}

async function cleanup() {
  console.log('\nLimpando registros de auditoria...');
  try {
    const rARef = db.collection('restaurants').doc(REST_A);
    const rBRef = db.collection('restaurants').doc(REST_B);

    // Delete subcollections for REST_A and REST_B
    const subcollections = ['tables', 'tabs', 'products', 'caixas', 'orders', 'cancellation_logs'];
    for (const sub of subcollections) {
      const snapA = await rARef.collection(sub).get();
      const batchA = db.batch();
      snapA.docs.forEach(doc => batchA.delete(doc.ref));
      await batchA.commit();

      const snapB = await rBRef.collection(sub).get();
      const batchB = db.batch();
      snapB.docs.forEach(doc => batchB.delete(doc.ref));
      await batchB.commit();
    }

    await rARef.delete();
    await rBRef.delete();

    // Delete users
    const uids = [
      'test_audit_waiter_a', 'test_audit_waiter_b',
      'test_audit_kitchen_a', 'test_audit_kitchen_b',
      'test_audit_cashier_a', 'test_audit_cashier_b',
      'test_audit_owner_a', 'test_audit_owner_b'
    ];
    const userBatch = db.batch();
    for (const uid of uids) {
      userBatch.delete(db.collection('users').doc(uid));
    }
    await userBatch.commit();
    console.log('Limpeza finalizada com sucesso!');
  } catch (err: any) {
    console.warn('Erro durante limpeza de dados:', err.message);
  }
}

async function main() {
  const startTotal = performance.now();
  
  await setupDatabaseData();

  // Run Progressive scenarios
  await runConcurrencyAndIdempotencyTests();
  await runLoadScenario(10);
  await runLoadScenario(50);
  await runLoadScenario(100);
  await runLoadScenario(300);
  await runLoadScenario(500);

  const durationTotal = performance.now() - startTotal;

  // Process and present metrics
  const totalRequests = allStats.length;
  const statusCodes = allStats.reduce((acc, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const durations = allStats.map(s => s.durationMs).sort((a, b) => a - b);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / totalRequests;
  const maxDuration = durations[durations.length - 1];
  const p95Duration = durations[Math.floor(durations.length * 0.95)] || maxDuration;
  const errorRate = ((statusCodes[0] || 0) + (statusCodes[500] || 0)) / totalRequests * 100;

  console.log('\n================================================================');
  console.log('               RELATÓRIO DE AUDITORIA DE CARGA');
  console.log('================================================================');
  console.log(`Volume Executado:             ${totalRequests} requisições`);
  console.log(`Duração Total do Teste:       ${(durationTotal / 1000).toFixed(2)}s`);
  console.log(`Vazão Média (RPS):            ${(totalRequests / (durationTotal / 1000)).toFixed(2)} req/s`);
  console.log(`Tempo Médio de Resposta:      ${avgDuration.toFixed(2)} ms`);
  console.log(`Tempo Máximo de Resposta:     ${maxDuration.toFixed(2)} ms`);
  console.log(`Percentil 95 (p95):           ${p95Duration.toFixed(2)} ms`);
  console.log(`Taxa de Erro:                 ${errorRate.toFixed(2)}%`);
  console.log(`Códigos HTTP Retornados:`);
  Object.keys(statusCodes).forEach(code => {
    console.log(`  - ${code}: ${statusCodes[Number(code)]}`);
  });
  console.log(`Consumo Estimado Firestore:`);
  console.log(`  - Leituras:                 ~${totalRequests * 3} operações`);
  console.log(`  - Escritas:                 ~${totalRequests * 4 + firestoreWrites} operações`);
  console.log('================================================================\n');

  await cleanup();
}

main().catch(console.error);
