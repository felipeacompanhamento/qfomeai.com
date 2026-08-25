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
const RUN_ID = Math.random().toString(36).substring(2, 7) + Date.now().toString(36).substring(5);
const TEST_RESTAURANT_ID = 'rest_rep_' + RUN_ID;
const TEST_OWNER_UID = 'owner_rep_' + RUN_ID;

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

async function setupTestData() {
  console.log(`\n--- Seeding Reports Test Data for Restaurant ID: ${TEST_RESTAURANT_ID} ---`);

  // Setup Restaurant
  await db.collection('restaurants').doc(TEST_RESTAURANT_ID).set({
    id: TEST_RESTAURANT_ID,
    name: 'Restaurante Relatorios',
    formas_pagamento: ['dinheiro', 'pix', 'credito'],
    active: true
  });

  // Setup User
  await db.collection('users').doc(TEST_OWNER_UID).set({
    uid: TEST_OWNER_UID,
    email: `owner_${RUN_ID}@test.com`,
    name: 'Dono de Relatorios',
    nome: 'Dono de Relatorios',
    role: 'OWNER',
    tipo_usuario: 'restaurante',
    restaurantId: TEST_RESTAURANT_ID,
    active: true,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  });

  // Setup Orders
  const ordersRef = db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('orders');
  
  // Order 1: Delivered
  await ordersRef.doc('order_rep_1').set({
    id: 'order_rep_1',
    restaurantId: TEST_RESTAURANT_ID,
    status: 'entregue',
    valor_total: 45.50,
    forma_pagamento: 'pix',
    pago: true,
    data_criacao: new Date(Date.now() - 2 * 3600000).toISOString(), // 2 hours ago
    items: [
      { id: 'p1', nome: 'Hamburguer Duplo', quantidade: 2, preco: 15.00 },
      { id: 'p2', nome: 'Batata Frita', quantidade: 1, preco: 15.50 }
    ],
    deliveryTimeMinutes: 25,
    rating: 5
  });

  // Order 2: Delivered
  await ordersRef.doc('order_rep_2').set({
    id: 'order_rep_2',
    restaurantId: TEST_RESTAURANT_ID,
    status: 'finalizado',
    valor_total: 30.00,
    forma_pagamento: 'dinheiro',
    pago: true,
    data_criacao: new Date(Date.now() - 24 * 3600000).toISOString(), // 1 day ago
    items: [
      { id: 'p3', nome: 'Refrigerante Cola', quantidade: 3, preco: 10.00 }
    ],
    deliveryTimeMinutes: 35,
    rating: 4
  });

  // Order 3: Cancelled
  await ordersRef.doc('order_rep_3').set({
    id: 'order_rep_3',
    restaurantId: TEST_RESTAURANT_ID,
    status: 'cancelado',
    valor_total: 100.00,
    forma_pagamento: 'credito',
    pago: false,
    data_criacao: new Date(Date.now() - 48 * 3600000).toISOString(), // 2 days ago
    items: [
      { id: 'p1', nome: 'Hamburguer Duplo', quantidade: 5, preco: 20.00 }
    ]
  });

  // Setup Contas Receber & Pagar
  await db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('contasReceber').doc('cr_1').set({
    id: 'cr_1',
    restaurantId: TEST_RESTAURANT_ID,
    description: 'Venda de produtos',
    remainingAmount: 500.00,
    paidAmount: 200.00,
    status: 'PARTIALLY_PAID'
  });

  await db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('contasPagar').doc('cp_1').set({
    id: 'cp_1',
    restaurantId: TEST_RESTAURANT_ID,
    description: 'Fornecedor de carnes',
    remainingAmount: 300.00,
    paidAmount: 100.00,
    status: 'PARTIALLY_PAID'
  });

  // Setup Caixa
  await db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('caixas').doc('cx_1').set({
    id: 'cx_1',
    restaurantId: TEST_RESTAURANT_ID,
    status: 'CLOSED',
    openedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    closedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    openingBalance: 10000
  });

  console.log('Seeding completed successfully.');
}

async function runTests() {
  await setupTestData();

  console.log('\n=== RUNNING REPORT AND DASHBOARD API ENDPOINT TESTS ===');
  const reportsToTest = [
    { name: '1. Dashboard Summary', url: '/api/restaurant/reports/dashboard' },
    { name: '2. Metrics Report', url: '/api/restaurant/reports/metrics' },
    { name: '3. KPIs Report', url: '/api/restaurant/reports/kpis' },
    { name: '4. Sales by Period', url: '/api/restaurant/reports/sales-by-period' },
    { name: '5. Payment Methods', url: '/api/restaurant/reports/payment-methods' },
    { name: '6. Sold Products Ranking', url: '/api/restaurant/reports/sold-products' },
    { name: '7. Cash Movements', url: '/api/restaurant/reports/cash-movements' },
    { name: '8. Financial Indicators', url: '/api/restaurant/reports/financial-indicators' },
    { name: '9. Operational Indicators', url: '/api/restaurant/reports/operational-indicators' },
    { name: '10. Chart Data Series', url: '/api/restaurant/reports/charts' },
    { name: '11. Statistical Queries', url: '/api/restaurant/reports/stats' }
  ];

  let successCount = 0;

  for (const rep of reportsToTest) {
    console.log(`\nTesting Endpoints: ${rep.name} (${rep.url})`);
    try {
      const res = await apiGet(rep.url, TEST_OWNER_UID);
      if (res.status === 200 && res.data.success === true) {
        console.log(`✅ [SUCCESS] Status: ${res.status}`);
        console.log(`Response keys: ${Object.keys(res.data).join(', ')}`);
        successCount++;
      } else {
        console.log(`❌ [FAILURE] Status: ${res.status}, Body:`, JSON.stringify(res.data));
      }
    } catch (e: any) {
      console.log(`❌ [ERROR] Request failed:`, e.message);
    }
  }

  // Cleanup Test Data
  console.log(`\n--- Cleaning Up Reports Test Data ---`);
  const batch = db.batch();
  batch.delete(db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('orders').doc('order_rep_1'));
  batch.delete(db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('orders').doc('order_rep_2'));
  batch.delete(db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('orders').doc('order_rep_3'));
  batch.delete(db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('contasReceber').doc('cr_1'));
  batch.delete(db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('contasPagar').doc('cp_1'));
  batch.delete(db.collection('restaurants').doc(TEST_RESTAURANT_ID).collection('caixas').doc('cx_1'));
  batch.delete(db.collection('restaurants').doc(TEST_RESTAURANT_ID));
  batch.delete(db.collection('users').doc(TEST_OWNER_UID));
  await batch.commit();

  console.log('\n=== SUMMARY ===');
  console.log(`Passed: ${successCount} / ${reportsToTest.length}`);
  
  if (successCount === reportsToTest.length) {
    console.log('🎉 ALL REPORT AND DASHBOARD TESTS PASSED SUCCESSFULLY! 🎉\n');
    process.exit(0);
  } else {
    console.log('🚨 SOME REPORT OR DASHBOARD TESTS FAILED! 🚨\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
