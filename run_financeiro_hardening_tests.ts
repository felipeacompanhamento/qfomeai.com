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

const TEST_RESTAURANT_ID = 'rest_fin_test_1';
const OTHER_RESTAURANT_ID = 'rest_fin_test_2';

async function setupTestData() {
  console.log('\n--- Setup Test Data in Firestore ---');

  // Clear previous test records in subcollections if any, or just overwrite
  const rRef = db.collection('restaurants').doc(TEST_RESTAURANT_ID);
  await rRef.set({
    id: TEST_RESTAURANT_ID,
    name: 'Restaurante Teste Financeiro',
    formas_pagamento: ['dinheiro', 'pix', 'credito'], // debito is explicitly disabled
    active: true
  });

  const otherRRef = db.collection('restaurants').doc(OTHER_RESTAURANT_ID);
  await otherRRef.set({
    id: OTHER_RESTAURANT_ID,
    name: 'Restaurante Outro',
    formas_pagamento: ['dinheiro', 'pix', 'credito', 'debito'],
    active: true
  });

  // Setup Cash registers for TEST_RESTAURANT_ID
  // We need to set up one open cash register
  const openCaixaRef = rRef.collection('caixas').doc('caixa_aberto_1');
  await openCaixaRef.set({
    id: 'caixa_aberto_1',
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    openedBy: 'test_fin_cashier',
    saldoFisicoCents: 10000,
    saldoAberturaCents: 10000
  });

  // Setup Users
  const users = [
    {
      uid: 'test_fin_owner',
      email: 'owner@test.com',
      nome: 'Dono Financeiro',
      role: 'OWNER',
      tipo_usuario: 'OWNER',
      restaurantId: TEST_RESTAURANT_ID,
      active: true,
      status: 'ACTIVE',
      permissions: []
    },
    {
      uid: 'test_fin_manager',
      email: 'manager@test.com',
      nome: 'Gerente Financeiro',
      role: 'MANAGER',
      tipo_usuario: 'MANAGER',
      restaurantId: TEST_RESTAURANT_ID,
      active: true,
      status: 'ACTIVE',
      permissions: ['caixa.visualizar', 'caixa.estornar']
    },
    {
      uid: 'test_fin_cashier_full',
      email: 'cashier_full@test.com',
      nome: 'Caixa Completo',
      role: 'CASHIER',
      tipo_usuario: 'CASHIER',
      restaurantId: TEST_RESTAURANT_ID,
      active: true,
      status: 'ACTIVE',
      permissions: ['caixa.visualizar', 'caixa.estornar']
    },
    {
      uid: 'test_fin_cashier_no_refund',
      email: 'cashier_no_refund@test.com',
      nome: 'Caixa Sem Estorno',
      role: 'CASHIER',
      tipo_usuario: 'CASHIER',
      restaurantId: TEST_RESTAURANT_ID,
      active: true,
      status: 'ACTIVE',
      permissions: ['caixa.visualizar'] // missing caixa.estornar
    },
    {
      uid: 'test_fin_inactive',
      email: 'inactive@test.com',
      nome: 'Inativo',
      role: 'CASHIER',
      tipo_usuario: 'CASHIER',
      restaurantId: TEST_RESTAURANT_ID,
      active: false,
      status: 'ACTIVE',
      permissions: ['caixa.visualizar']
    },
    {
      uid: 'test_fin_kitchen',
      email: 'kitchen@test.com',
      nome: 'Cozinheiro',
      role: 'KITCHEN',
      tipo_usuario: 'KITCHEN',
      restaurantId: TEST_RESTAURANT_ID,
      active: true,
      status: 'ACTIVE',
      permissions: ['cozinha.visualizar']
    },
    {
      uid: 'test_fin_other_restaurant',
      email: 'other_restaurant@test.com',
      nome: 'Dono Outro',
      role: 'OWNER',
      tipo_usuario: 'OWNER',
      restaurantId: OTHER_RESTAURANT_ID,
      active: true,
      status: 'ACTIVE',
      permissions: []
    }
  ];

  for (const u of users) {
    await db.collection('users').doc(u.uid).set(u);
  }

  // Create standard order
  const orderRef = rRef.collection('orders').doc('order_test_1');
  await orderRef.set({
    id: 'order_test_1',
    restaurantId: TEST_RESTAURANT_ID,
    numero_pedido: 1001,
    valor_total: 150.00, // 15000 cents
    status: 'entregue',
    pago: false,
    payments: [],
    createdAt: new Date().toISOString()
  });

  // Create another order for duplicate payment tests
  const orderRef2 = rRef.collection('orders').doc('order_test_2');
  await orderRef2.set({
    id: 'order_test_2',
    restaurantId: TEST_RESTAURANT_ID,
    numero_pedido: 1002,
    valor_total: 100.00, // 10000 cents total
    status: 'entregue',
    pago: false, // NOT fully paid
    payments: [
      {
        id: 'pay_existing_1',
        paymentMethodId: 'pix',
        amount: 8000, // 8000 cents paid
        status: 'PAID',
        createdAt: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString()
  });

  // Create order under restaurant 1 but belonging/pointing to restaurant 2 (triggers mismatch check)
  const mismatchOrderRef = rRef.collection('orders').doc('order_mismatch_1');
  await mismatchOrderRef.set({
    id: 'order_mismatch_1',
    restaurantId: OTHER_RESTAURANT_ID,
    numero_pedido: 1004,
    valor_total: 60.00,
    status: 'entregue',
    pago: false,
    payments: [],
    createdAt: new Date().toISOString()
  });

  // Create order belonging to other restaurant
  const otherOrderRef = otherRRef.collection('orders').doc('order_other_1');
  await otherOrderRef.set({
    id: 'order_other_1',
    restaurantId: OTHER_RESTAURANT_ID,
    numero_pedido: 2001,
    valor_total: 100.00,
    status: 'entregue',
    pago: false,
    payments: [],
    createdAt: new Date().toISOString()
  });

  // Create cancelled order
  const cancelledOrderRef = rRef.collection('orders').doc('order_cancelled_1');
  await cancelledOrderRef.set({
    id: 'order_cancelled_1',
    restaurantId: TEST_RESTAURANT_ID,
    numero_pedido: 1003,
    valor_total: 50.00,
    status: 'cancelado',
    pago: false,
    payments: [],
    createdAt: new Date().toISOString()
  });

  console.log('--- Test Data Setup Complete ---\n');
}

interface TestResult {
  name: string;
  success: boolean;
  expectedStatus: number;
  actualStatus: number;
  expectedCode?: string;
  actualCode?: string;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  endpoint: string,
  uid: string,
  body: any,
  expectedStatus: number,
  expectedCode?: string
) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer test_token_${uid}`
      },
      body: JSON.stringify(body)
    });

    const status = res.status;
    let data: any = {};
    try {
      data = await res.json();
    } catch (_) {}

    const code = data.code;
    const success = status === expectedStatus && (!expectedCode || code === expectedCode);

    results.push({
      name,
      success,
      expectedStatus,
      actualStatus: status,
      expectedCode,
      actualCode: code,
      error: success ? undefined : data.error || 'Nenhum erro detalhado retornado'
    });

    console.log(`[${success ? 'PASS' : 'FAIL'}] ${name}`);
    if (!success) {
      console.log(`    Expected Status: ${expectedStatus}, Actual: ${status}`);
      if (expectedCode) {
        console.log(`    Expected Code: ${expectedCode}, Actual: ${code}`);
      }
      console.log(`    Response Error Message: ${data.error}`);
    }
  } catch (err: any) {
    results.push({
      name,
      success: false,
      expectedStatus,
      actualStatus: 500,
      error: err.message
    });
    console.log(`[FAIL] ${name} - Exception: ${err.message}`);
  }
}

async function runAllTests() {
  await setupTestData();

  console.log('=== STARTING FINANCE HARDENING TESTS ===\n');

  // --- GROUP A: PROCESSAR PAGAMENTOS ENDPOINT ---

  // 1. Success payment - partial payment (10000 cents of 15000 cents order)
  await runTest(
    '1. Pagamento parcial com sucesso',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_test_1', amount: 10000, paymentMethodId: 'pix', status: 'PAID' }
      ],
      operatorName: 'Caixa Teste'
    },
    200
  );

  // 2. Success payment - final payment (5000 cents of 15000 cents order)
  await runTest(
    '2. Pagamento final totalizando o pedido',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_test_2', amount: 5000, paymentMethodId: 'dinheiro', status: 'PAID' }
      ]
    },
    200
  );

  // 3. Error: Already fully paid order
  await runTest(
    '3. Recusar pagamento de pedido totalmente pago',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_test_3', amount: 1000, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    409,
    'ORDER_ALREADY_PAID'
  );

  // 4. Error: Zero amount in payment
  await runTest(
    '4. Recusar pagamento com valor zero',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_test_4', amount: 0, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    400,
    'INVALID_AMOUNT'
  );

  // 5. Error: Negative amount in payment
  await runTest(
    '5. Recusar pagamento com valor negativo',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_test_5', amount: -1500, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    400,
    'INVALID_AMOUNT'
  );

  // 6. Error: NaN input in payment amount
  await runTest(
    '6. Recusar pagamento com valor NaN',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_test_6', amount: NaN, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    400,
    'INVALID_AMOUNT'
  );

  // 7. Error: Fractional value in payment amount
  await runTest(
    '7. Recusar pagamento com valor fracionário',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_test_7', amount: 12.5, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    400,
    'INVALID_AMOUNT'
  );

  // 8. Error: Invalid payment method
  await runTest(
    '8. Recusar forma de pagamento desconhecida',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_test_8', amount: 1000, paymentMethodId: 'inexistente', status: 'PAID' }
      ]
    },
    400,
    'INVALID_PAYMENT_METHOD'
  );

  // 9. Error: Disabled payment method by restaurant (debito is disabled in configurations)
  await runTest(
    '9. Recusar forma de pagamento desabilitada',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_test_9', amount: 1000, paymentMethodId: 'debito', status: 'PAID' }
      ]
    },
    422,
    'PAYMENT_METHOD_DISABLED'
  );

  // 10. Error: Duplicated payment ID (pay_existing_1 already exists on order_test_2)
  await runTest(
    '10. Recusar pagamento duplicado por ID',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_2',
      payments: [
        { id: 'pay_existing_1', amount: 1000, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    409,
    'DUPLICATE_PAYMENT'
  );

  // 11. Error: Exceeding balance for electronic payment (order_test_2 is 80.00, already paid 80.00. Let's make a new order)
  // Let's create an order first
  await db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('orders').doc('order_test_exceed').set({
    id: 'order_test_exceed',
    restaurantId: TEST_RESTAURANT_ID,
    valor_total: 10.00, // 1000 cents
    pago: false,
    status: 'entregue',
    payments: []
  });

  await runTest(
    '11. Recusar pagamento eletrônico com valor superior ao saldo',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_exceed',
      payments: [
        { id: 'p_exceed_1', amount: 1200, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    422,
    'PAYMENT_EXCEEDS_PENDING'
  );

  // 12. Success: Cash payment exceeding balance allows giving change (troco)
  await runTest(
    '12. Permitir pagamento em dinheiro com valor superior (troco)',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_exceed',
      payments: [
        { id: 'p_cash_change', amount: 2000, paymentMethodId: 'dinheiro', status: 'PAID' }
      ]
    },
    200
  );

  // Verify that troco was written
  const exceedOrderSnap = await db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('orders').doc('order_test_exceed').get();
  const exceedOrderData = exceedOrderSnap.data() || {};
  if (exceedOrderData.troco === 10 || exceedOrderData.changeAmount === 10) {
    console.log('[PASS] Troco de 10.00 verificado no banco.');
  } else {
    console.log(`[FAIL] Troco incorreto ou não gravado: troco=${exceedOrderData.troco}`);
  }

  // 13. Error: Cancelled order
  await runTest(
    '13. Recusar pagamento para pedido cancelado',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_cancelled_1',
      payments: [
        { id: 'p_canc_1', amount: 1000, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    400,
    'ORDER_CANCELLED'
  );

  // 14. Error: Inexistent order
  await runTest(
    '14. Recusar pedido inexistente',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_not_found_1',
      payments: [
        { id: 'p_none_1', amount: 1000, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    404,
    'ORDER_NOT_FOUND'
  );

  // 15. Error: Mismatching restaurant (User belongs to restaurant 1, trying to access order from restaurant 2)
  await runTest(
    '15. Recusar acesso ao pedido de outro restaurante',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_mismatch_1',
      payments: [
        { id: 'p_other_1', amount: 1000, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    403,
    'RESTAURANT_MISMATCH'
  );

  // 16. Error: Role permission bypass (Kitchen staff trying to pay)
  await runTest(
    '16. Recusar operador sem papel de caixa ou financeiro (KITCHEN)',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_kitchen',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_kitchen_1', amount: 1000, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    403,
    'FORBIDDEN'
  );

  // 17. Error: Inactive operator account
  await runTest(
    '17. Recusar conta inativa de operador',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_inactive',
    {
      orderId: 'order_test_1',
      payments: [
        { id: 'p_inact_1', amount: 1000, paymentMethodId: 'pix', status: 'PAID' }
      ]
    },
    403
  );

  // 18. Idempotency test using clientActionId
  const actionId = 'action_id_payment_' + Date.now();
  // First execution (order_test_2 now has pending balance, so this payment succeeds with 200)
  await runTest(
    '18a. Sucesso na primeira execução de ação com ID único',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_2',
      payments: [
        { id: 'p_idemp_first', amount: 100, paymentMethodId: 'pix', status: 'PAID' }
      ],
      clientActionId: 'action_id_payment_unique_first_' + Date.now()
    },
    200
  );

  // Let's create an order for idempotency testing
  await db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('orders').doc('order_test_idemp').set({
    id: 'order_test_idemp',
    restaurantId: TEST_RESTAURANT_ID,
    valor_total: 100.00,
    pago: false,
    status: 'entregue',
    payments: []
  });

  await runTest(
    '18b. Primeira execução com clientActionId',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_idemp',
      payments: [
        { id: 'p_idemp_1', amount: 1000, paymentMethodId: 'pix', status: 'PAID' }
      ],
      clientActionId: actionId
    },
    200
  );

  // Second execution with same actionId
  await runTest(
    '18c. Segunda execução idêntica deve retornar 409 DUPLICATE_ACTION',
    '/api/restaurant/financeiro/pedidos/processar-pagamentos',
    'test_fin_cashier_full',
    {
      orderId: 'order_test_idemp',
      payments: [
        { id: 'p_idemp_1', amount: 1000, paymentMethodId: 'pix', status: 'PAID' }
      ],
      clientActionId: actionId
    },
    409,
    'DUPLICATE_ACTION'
  );


  // --- GROUP B: PROCESSAR ESTORNO ENDPOINT ---

  // Create order with paid payment for estorno tests
  await db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('orders').doc('order_to_refund').set({
    id: 'order_to_refund',
    restaurantId: TEST_RESTAURANT_ID,
    valor_total: 100.00,
    pago: true,
    status: 'entregue',
    payments: [
      {
        id: 'pay_ref_1',
        paymentMethodId: 'pix',
        amount: 10000,
        status: 'PAID',
        createdAt: new Date().toISOString()
      }
    ]
  });

  // 19. Success: Refund processed by OWNER
  await runTest(
    '19. Estorno processado com sucesso pelo OWNER',
    '/api/restaurant/financeiro/pedidos/processar-estorno',
    'test_fin_owner',
    {
      orderId: 'order_to_refund',
      paymentId: 'pay_ref_1',
      reason: 'Cliente desistiu do pedido'
    },
    200
  );

  // 20. Error: Attempting to refund already refunded payment
  await runTest(
    '20. Recusar estorno de pagamento já estornado',
    '/api/restaurant/financeiro/pedidos/processar-estorno',
    'test_fin_owner',
    {
      orderId: 'order_to_refund',
      paymentId: 'pay_ref_1',
      reason: 'Tentativa redundante'
    },
    409,
    'PAYMENT_ALREADY_REFUNDED'
  );

  // 21. Error: Refund without specifying a reason
  // Let's create another order with a paid payment
  await db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('orders').doc('order_to_refund_2').set({
    id: 'order_to_refund_2',
    restaurantId: TEST_RESTAURANT_ID,
    valor_total: 50.00,
    pago: true,
    status: 'entregue',
    payments: [
      {
        id: 'pay_ref_2',
        paymentMethodId: 'pix',
        amount: 5000,
        status: 'PAID',
        createdAt: new Date().toISOString()
      }
    ]
  });

  await runTest(
    '21. Recusar estorno sem motivo/razão',
    '/api/restaurant/financeiro/pedidos/processar-estorno',
    'test_fin_owner',
    {
      orderId: 'order_to_refund_2',
      paymentId: 'pay_ref_2',
      reason: '' // empty reason
    },
    400,
    'REFUND_REASON_REQUIRED'
  );

  // 22. Error: CASHIER trying to refund WITHOUT explicit permission
  await runTest(
    '22. Recusar estorno de CASHIER sem permissão explícita',
    '/api/restaurant/financeiro/pedidos/processar-estorno',
    'test_fin_cashier_no_refund',
    {
      orderId: 'order_to_refund_2',
      paymentId: 'pay_ref_2',
      reason: 'Erro de cobrança'
    },
    403,
    'FORBIDDEN'
  );

  // 23. Success: CASHIER WITH explicit permission performs refund successfully
  await runTest(
    '23. Permitir estorno de CASHIER com permissão explícita',
    '/api/restaurant/financeiro/pedidos/processar-estorno',
    'test_fin_cashier_full',
    {
      orderId: 'order_to_refund_2',
      paymentId: 'pay_ref_2',
      reason: 'Erro de cobrança'
    },
    200
  );


  // --- SUMMARY ---
  console.log('\n=========================================');
  console.log('         TEST SUITE SUMMARY              ');
  console.log('=========================================');
  const passed = results.filter(r => r.success).length;
  const total = results.length;
  console.log(`Passed: ${passed} / ${total}`);

  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! Hardening of financial endpoints is 100% complete.');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED. Please review output above.');
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Unhandled test runner exception:', err);
  process.exit(1);
});
