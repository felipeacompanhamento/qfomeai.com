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

async function setupTestDatabase() {
  console.log('--- Setting up Test Data in Firestore ---');

  // 1. Create a valid driver
  const validDriverId = 'test_driver_valid';
  await db.collection('users').doc(validDriverId).set({
    uid: validDriverId,
    email: 'valid_driver@test.com',
    nome: 'Driver Válido',
    role: 'DRIVER',
    tipo_usuario: 'DRIVER',
    restaurantId: 'restaurant_test_1',
    active: true,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  });

  await db.collection('restaurants').doc('restaurant_test_1').collection('staffProfiles').doc(validDriverId).set({
    uid: validDriverId,
    email: 'valid_driver@test.com',
    nome: 'Driver Válido',
    role: 'DRIVER',
    operationalStatus: 'ACTIVE',
    active: true,
    roleSpecificData: {
      availability: 'OFFLINE'
    }
  });

  await db.collection('restaurants').doc('restaurant_test_1').collection('drivers').doc(validDriverId).set({
    id: validDriverId,
    name: 'Driver Válido',
    operationalStatus: 'ACTIVE',
    availabilityStatus: 'OFFLINE',
    createdAt: new Date().toISOString()
  });

  // 2. Create an inactive driver
  const inactiveDriverId = 'test_driver_inactive';
  await db.collection('users').doc(inactiveDriverId).set({
    uid: inactiveDriverId,
    email: 'inactive_driver@test.com',
    nome: 'Driver Inativo',
    role: 'DRIVER',
    tipo_usuario: 'DRIVER',
    restaurantId: 'restaurant_test_1',
    active: false,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  });

  await db.collection('restaurants').doc('restaurant_test_1').collection('staffProfiles').doc(inactiveDriverId).set({
    uid: inactiveDriverId,
    email: 'inactive_driver@test.com',
    nome: 'Driver Inativo',
    role: 'DRIVER',
    operationalStatus: 'INACTIVE',
    active: false
  });

  // 3. Create user with waiter role trying to act as driver
  const waiterId = 'test_waiter_role';
  await db.collection('users').doc(waiterId).set({
    uid: waiterId,
    email: 'waiter@test.com',
    nome: 'Garçom Teste',
    role: 'WAITER',
    tipo_usuario: 'WAITER',
    restaurantId: 'restaurant_test_1',
    active: true,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  });

  await db.collection('restaurants').doc('restaurant_test_1').collection('staffProfiles').doc(waiterId).set({
    uid: waiterId,
    email: 'waiter@test.com',
    nome: 'Garçom Teste',
    role: 'WAITER',
    operationalStatus: 'ACTIVE',
    active: true
  });

  // 4. Create driver in another restaurant
  const otherDriverId = 'test_driver_other_restaurant';
  await db.collection('users').doc(otherDriverId).set({
    uid: otherDriverId,
    email: 'other_driver@test.com',
    nome: 'Driver Outro Restaurante',
    role: 'DRIVER',
    tipo_usuario: 'DRIVER',
    restaurantId: 'restaurant_test_2',
    active: true,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  });

  await db.collection('restaurants').doc('restaurant_test_2').collection('staffProfiles').doc(otherDriverId).set({
    uid: otherDriverId,
    email: 'other_driver@test.com',
    nome: 'Driver Outro Restaurante',
    role: 'DRIVER',
    operationalStatus: 'ACTIVE',
    active: true,
    roleSpecificData: {
      availability: 'OFFLINE'
    }
  });

  // 5. Create valid order in restaurant 1, assigned to valid driver
  const validOrderId = 'test_order_assigned_to_driver_1';
  await db.collection('restaurants').doc('restaurant_test_1').collection('orders').doc(validOrderId).set({
    id: validOrderId,
    restaurantId: 'restaurant_test_1',
    assignedDriverId: validDriverId,
    driverId: validDriverId,
    status: 'pronto',
    status_entrega: 'waiting',
    deliveryStatus: 'ASSIGNED',
    valor_total: 1500,
    cliente_id: 'test_client_uid',
    createdAt: new Date().toISOString()
  });

  // 6. Create order in restaurant 2, assigned to other driver
  const otherRestaurantOrderId = 'test_order_restaurant_2';
  await db.collection('restaurants').doc('restaurant_test_2').collection('orders').doc(otherRestaurantOrderId).set({
    id: otherRestaurantOrderId,
    restaurantId: 'restaurant_test_2',
    assignedDriverId: otherDriverId,
    driverId: otherDriverId,
    status: 'pronto',
    status_entrega: 'waiting',
    deliveryStatus: 'ASSIGNED',
    valor_total: 2000,
    createdAt: new Date().toISOString()
  });

  // 7. Create order in restaurant 1 assigned to someone else
  const wrongDriverOrderId = 'test_order_assigned_to_someone_else';
  await db.collection('restaurants').doc('restaurant_test_1').collection('orders').doc(wrongDriverOrderId).set({
    id: wrongDriverOrderId,
    restaurantId: 'restaurant_test_1',
    assignedDriverId: 'someone_else_uid',
    driverId: 'someone_else_uid',
    status: 'pronto',
    status_entrega: 'waiting',
    deliveryStatus: 'ASSIGNED',
    valor_total: 1000,
    createdAt: new Date().toISOString()
  });

  console.log('Test setup database populated successfully.\n');
}

interface TestResult {
  category: string;
  testName: string;
  passed: boolean;
  expectedStatus: number;
  actualStatus: number;
  message?: string;
}

const results: TestResult[] = [];

function recordTest(category: string, testName: string, passed: boolean, expectedStatus: number, actualStatus: number, message?: string) {
  results.push({ category, testName, passed, expectedStatus, actualStatus, message });
  const statusIndicator = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${statusIndicator}] ${category} - ${testName} (Expected: ${expectedStatus}, Actual: ${actualStatus})`);
  if (message) console.log(`   └─ Message: ${message}`);
}

async function runTests() {
  console.log('=== DRIVER HARDENING ENDPOINTS TEST SUITE ===');
  await setupTestDatabase();

  const runId = '_' + Math.random().toString(36).substring(2, 7) + Date.now().toString(36);
  const validToken = 'test_token_test_driver_valid';
  const inactiveToken = 'test_token_test_driver_inactive';
  const waiterToken = 'test_token_test_waiter_role';
  const otherToken = 'test_token_test_driver_other_restaurant';

  // ----------------------------------------------------
  // CATEGORY 1: AUTHENTICATION AND AUTHORIZATION
  // ----------------------------------------------------
  console.log('\n--- Category 1: Authentication & Authorization ---');

  // Test 1.1: Missing token
  try {
    const res = await fetch(`${BASE_URL}/api/driver/availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availabilityStatus: 'ONLINE', clientActionId: 'act_auth_1' + runId })
    });
    recordTest('Auth', 'Missing Token', res.status === 401, 401, res.status);
  } catch (err: any) {
    recordTest('Auth', 'Missing Token', false, 401, 500, err.message);
  }

  // Test 1.2: Inactive User account
  try {
    const res = await fetch(`${BASE_URL}/api/driver/availability`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${inactiveToken}`
      },
      body: JSON.stringify({ availabilityStatus: 'ONLINE', clientActionId: 'act_auth_2' + runId })
    });
    recordTest('Auth', 'Inactive User Account', res.status === 403, 403, res.status);
  } catch (err: any) {
    recordTest('Auth', 'Inactive User Account', false, 403, 500, err.message);
  }

  // Test 1.3: Waiter trying to access driver endpoint
  try {
    const res = await fetch(`${BASE_URL}/api/driver/availability`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${waiterToken}`
      },
      body: JSON.stringify({ availabilityStatus: 'ONLINE', clientActionId: 'act_auth_3' + runId })
    });
    recordTest('Auth', 'Non-driver Waiter Access', res.status === 403, 403, res.status);
  } catch (err: any) {
    recordTest('Auth', 'Non-driver Waiter Access', false, 403, 500, err.message);
  }


  // ----------------------------------------------------
  // CATEGORY 2: AVAILABILITY UPDATES
  // ----------------------------------------------------
  console.log('\n--- Category 2: Driver Availability ---');

  // Test 2.1: Valid ONLINE update
  try {
    const clientActionId = 'act_avail_1' + runId;
    const res = await fetch(`${BASE_URL}/api/driver/availability`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({ availabilityStatus: 'ONLINE', clientActionId })
    });
    const body = await res.json();
    recordTest('Availability', 'Valid ONLINE status', res.status === 200 && body.success === true, 200, res.status);
  } catch (err: any) {
    recordTest('Availability', 'Valid ONLINE status', false, 200, 500, err.message);
  }

  // Test 2.2: Duplicate clientActionId (idempotency check)
  try {
    const clientActionId = 'act_avail_1' + runId; // already used in 2.1
    const res = await fetch(`${BASE_URL}/api/driver/availability`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({ availabilityStatus: 'ONLINE', clientActionId })
    });
    recordTest('Availability', 'Idempotency clientActionId rejection', res.status === 409, 409, res.status);
  } catch (err: any) {
    recordTest('Availability', 'Idempotency clientActionId rejection', false, 409, 500, err.message);
  }

  // Test 2.3: Invalid availability status
  try {
    const res = await fetch(`${BASE_URL}/api/driver/availability`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({ availabilityStatus: 'BUSY', clientActionId: 'act_avail_3' + runId })
    });
    recordTest('Availability', 'Invalid Status Rejection', res.status === 400, 400, res.status);
  } catch (err: any) {
    recordTest('Availability', 'Invalid Status Rejection', false, 400, 500, err.message);
  }

  // Test 2.4: Missing clientActionId
  try {
    const res = await fetch(`${BASE_URL}/api/driver/availability`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({ availabilityStatus: 'OFFLINE' })
    });
    recordTest('Availability', 'Missing clientActionId Rejection', res.status === 400, 400, res.status);
  } catch (err: any) {
    recordTest('Availability', 'Missing clientActionId Rejection', false, 400, 500, err.message);
  }


  // ----------------------------------------------------
  // CATEGORY 3: LOCATION UPDATES
  // ----------------------------------------------------
  console.log('\n--- Category 3: Driver GPS Location ---');

  // Test 3.1: Valid Location Update
  try {
    const res = await fetch(`${BASE_URL}/api/driver/location`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({
        latitude: -23.55052,
        longitude: -46.633308,
        accuracy: 15,
        timestamp: new Date().toISOString()
      })
    });
    recordTest('Location', 'Valid coordinates', res.status === 200, 200, res.status);
  } catch (err: any) {
    recordTest('Location', 'Valid coordinates', false, 200, 500, err.message);
  }

  // Test 3.2: Rejection of non-numeric string coordinate
  try {
    const res = await fetch(`${BASE_URL}/api/driver/location`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({
        latitude: 'string-not-number',
        longitude: -46.633308,
        accuracy: 15
      })
    });
    recordTest('Location', 'Non-numeric coordinates rejection', res.status === 400, 400, res.status);
  } catch (err: any) {
    recordTest('Location', 'Non-numeric coordinates rejection', false, 400, 500, err.message);
  }

  // Test 3.3: Rejection of NaN coordinate
  try {
    const res = await fetch(`${BASE_URL}/api/driver/location`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({
        latitude: NaN,
        longitude: -46.633308,
        accuracy: 15
      })
    });
    recordTest('Location', 'NaN coordinates rejection', res.status === 400, 400, res.status);
  } catch (err: any) {
    recordTest('Location', 'NaN coordinates rejection', false, 400, 500, err.message);
  }

  // Test 3.4: Rejection of Infinite coordinate
  try {
    const res = await fetch(`${BASE_URL}/api/driver/location`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({
        latitude: -23.55052,
        longitude: Infinity,
        accuracy: 15
      })
    });
    recordTest('Location', 'Infinity coordinates rejection', res.status === 400, 400, res.status);
  } catch (err: any) {
    recordTest('Location', 'Infinity coordinates rejection', false, 400, 500, err.message);
  }

  // Test 3.5: Coordinates out of bounds (latitude > 90)
  try {
    const res = await fetch(`${BASE_URL}/api/driver/location`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({
        latitude: 120,
        longitude: -46.633308,
        accuracy: 15
      })
    });
    recordTest('Location', 'Out of bounds latitude rejection', res.status === 400, 400, res.status);
  } catch (err: any) {
    recordTest('Location', 'Out of bounds latitude rejection', false, 400, 500, err.message);
  }


  // ----------------------------------------------------
  // CATEGORY 4: ORDER ACTIONS
  // ----------------------------------------------------
  console.log('\n--- Category 4: Driver Order Actions ---');

  const orderIdValid = 'test_order_assigned_to_driver_1';
  const orderIdOtherRestaurant = 'test_order_restaurant_2';
  const orderIdWrongDriver = 'test_order_assigned_to_someone_else';

  // Test 4.1: Non-existent order
  try {
    const res = await fetch(`${BASE_URL}/api/driver/orders/non_existent_order_id/action`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({ action: 'ACCEPT', clientActionId: 'act_ord_1' + runId })
    });
    recordTest('Order Action', 'Non-existent order response', res.status === 404, 404, res.status);
  } catch (err: any) {
    recordTest('Order Action', 'Non-existent order response', false, 404, 500, err.message);
  }

  // Test 4.2: Order belonging to another restaurant
  try {
    const res = await fetch(`${BASE_URL}/api/driver/orders/${orderIdOtherRestaurant}/action`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}` // Driver 1 belongs to restaurant 1
      },
      body: JSON.stringify({ action: 'ACCEPT', clientActionId: 'act_ord_2' + runId })
    });
    recordTest('Order Action', 'Other restaurant order access block', res.status === 403, 403, res.status);
  } catch (err: any) {
    recordTest('Order Action', 'Other restaurant order access block', false, 403, 500, err.message);
  }

  // Test 4.3: Order assigned to a different driver
  try {
    const res = await fetch(`${BASE_URL}/api/driver/orders/${orderIdWrongDriver}/action`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}` // Driver 1 belongs to restaurant 1 but order assigned to someone_else
      },
      body: JSON.stringify({ action: 'ACCEPT', clientActionId: 'act_ord_3' + runId })
    });
    recordTest('Order Action', 'Wrong driver assignment block', res.status === 403, 403, res.status);
  } catch (err: any) {
    recordTest('Order Action', 'Wrong driver assignment block', false, 403, 500, err.message);
  }

  // Test 4.4: Valid action: ACCEPT
  try {
    const res = await fetch(`${BASE_URL}/api/driver/orders/${orderIdValid}/action`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({ action: 'ACCEPT', clientActionId: 'act_ord_4' + runId })
    });
    recordTest('Order Action', 'Valid ACCEPT action', res.status === 200, 200, res.status);
  } catch (err: any) {
    recordTest('Order Action', 'Valid ACCEPT action', false, 200, 500, err.message);
  }

  // Test 4.5: Invalid transition: ACCEPTing again when status is already ACCEPTED
  try {
    const res = await fetch(`${BASE_URL}/api/driver/orders/${orderIdValid}/action`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({ action: 'ACCEPT', clientActionId: 'act_ord_5' + runId })
    });
    recordTest('Order Action', 'Invalid transition block', res.status === 409, 409, res.status);
  } catch (err: any) {
    recordTest('Order Action', 'Invalid transition block', false, 409, 500, err.message);
  }

  // Test 4.6: Idempotency clientActionId duplication check
  try {
    const res = await fetch(`${BASE_URL}/api/driver/orders/${orderIdValid}/action`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validToken}`
      },
      body: JSON.stringify({ action: 'ACCEPT', clientActionId: 'act_ord_4' + runId }) // act_ord_4 was processed in 4.4
    });
    recordTest('Order Action', 'Idempotency clientActionId rejection', res.status === 409, 409, res.status);
  } catch (err: any) {
    recordTest('Order Action', 'Idempotency clientActionId rejection', false, 409, 500, err.message);
  }


  // ----------------------------------------------------
  // REPORT AND SUMMARY
  // ----------------------------------------------------
  console.log('\n=== DRIVER HARDENING TESTS SUMMARY ===');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log(`Total Tests Run: ${total}`);
  console.log(`Passed: ${passed} 🟢`);
  console.log(`Failed: ${failed} ${failed === 0 ? '🟢' : '🔴'}`);

  // ----------------------------------------------------
  // AUDIT LOG VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- Verifying Driver Audit Logs in Firestore ---');
  try {
    const logsSnap = await db.collection('restaurants').doc('restaurant_test_1')
      .collection('driverAuditLogs')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();
    
    if (logsSnap.empty) {
      console.log('⚠️ No audit logs found in Firestore.');
    } else {
      console.log(`Found ${logsSnap.size} recent audit logs:`);
      logsSnap.forEach(doc => {
        const data = doc.data();
        console.log(`- [${data.timestamp}] Driver: ${data.driverId} | Endpoint: ${data.endpoint} | Status: ${data.httpStatus} | Action: ${data.action || 'N/A'}`);
      });
    }
  } catch (auditErr: any) {
    console.error('Error fetching audit logs:', auditErr.message);
  }

  if (failed > 0) {
    console.log('\n❌ some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All driver hardening validation checks passed successfully!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled test execution error:', err);
  process.exit(1);
});
