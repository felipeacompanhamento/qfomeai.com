import jwt from 'jsonwebtoken';
import crypto from 'crypto';

function hashSecret(secret: string): string {
  const salt = process.env.EXTERNAL_API_SECRET_SALT || 'qfomeai_default_secret_salt_2026';
  return crypto.createHmac('sha256', salt).update(secret).digest('hex');
}

async function runTests() {
  const portsToTry = [3000, 8080];
  let baseUrl = '';

  for (const p of portsToTry) {
    try {
      const testRes = await fetch(`http://127.0.0.1:${p}/api/v1/external/health`);
      const text = await testRes.text();
      if (text.startsWith('{')) {
        baseUrl = `http://127.0.0.1:${p}/api/v1/external`;
        console.log(`Connected to API server on port ${p}`);
        break;
      }
    } catch (e) {}
  }

  if (!baseUrl) {
    console.error('Could not connect to API server on port 3000 or 8080');
    return;
  }
  console.log('--------------------------------------------------');
  console.log(' RUNNING AUTOMATED SECURITY TESTS FOR EXTERNAL API');
  console.log('--------------------------------------------------');

  // Test 1: No Authorization Header
  const res1 = await fetch(`${baseUrl}/health`);
  const json1 = await res1.json();
  console.log('\n[Test 1] Missing Authorization header:');
  console.log(`Status: ${res1.status} (Expected: 401)`);
  console.log(`Code:   ${json1.error?.code} (Expected: UNAUTHENTICATED)`);

  // Test 2: Invalid JWT structure
  const res2 = await fetch(`${baseUrl}/health`, {
    headers: { Authorization: 'Bearer invalid.jwt.string' },
  });
  const json2 = await res2.json();
  console.log('\n[Test 2] Malformed JWT:');
  console.log(`Status: ${res2.status} (Expected: 401)`);
  console.log(`Code:   ${json2.error?.code} (Expected: INVALID_EXTERNAL_TOKEN)`);

  // Secret derived from previous step or salt
  const plainSecret = 'ea1e8d2b8c094146fddcbb3135a44773c314da6b5b8d43016a0aa3b661dc9ad5';
  const secretHash = hashSecret(plainSecret);

  // Test 3: Valid JWT with correct secret and scope
  const validPayload = {
    iss: 'https://auth.demodelivery.com',
    aud: 'qfomeai-external-delivery-api',
    sub: 'driver_test_123',
    appId: 'demo_delivery',
    externalDriverId: 'driver_test_123',
    driverDisplayName: 'Entregador Teste',
    scopes: ['delivery:read'],
    credentialVersion: 1,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    jti: 'jti_test_valid_1',
  };

  const validToken = jwt.sign(validPayload, secretHash, { algorithm: 'HS256' });

  const res3 = await fetch(`${baseUrl}/health`, {
    headers: {
      Authorization: `Bearer ${validToken}`,
      'X-Request-Id': 'custom-req-id-12345678',
    },
  });
  const json3 = await res3.json();
  console.log('\n[Test 3] Valid JWT Authenticated Health Check:');
  console.log(`Status: ${res3.status} (Expected: 200)`);
  console.log(`Data:   ${JSON.stringify(json3.data)}`);
  console.log(`Req ID: ${res3.headers.get('x-request-id')} (Expected: custom-req-id-12345678)`);

  // Test 4: Expired JWT
  const expiredPayload = {
    ...validPayload,
    exp: Math.floor(Date.now() / 1000) - 100,
    iat: Math.floor(Date.now() / 1000) - 500,
  };
  const expiredToken = jwt.sign(expiredPayload, secretHash, { algorithm: 'HS256' });

  const res4 = await fetch(`${baseUrl}/health`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  const json4 = await res4.json();
  console.log('\n[Test 4] Expired JWT:');
  console.log(`Status: ${res4.status} (Expected: 401)`);
  console.log(`Code:   ${json4.error?.code} (Expected: TOKEN_EXPIRED)`);

  // Test 5: Insufficient Scope
  const noScopePayload = {
    ...validPayload,
    scopes: ['delivery:preview'], // Missing delivery:read
  };
  const noScopeToken = jwt.sign(noScopePayload, secretHash, { algorithm: 'HS256' });

  const res5 = await fetch(`${baseUrl}/health`, {
    headers: { Authorization: `Bearer ${noScopeToken}` },
  });
  const json5 = await res5.json();
  console.log('\n[Test 5] Insufficient Scope:');
  console.log(`Status: ${res5.status} (Expected: 403)`);
  console.log(`Code:   ${json5.error?.code} (Expected: INSUFFICIENT_SCOPE)`);

  console.log('\n--------------------------------------------------');
  console.log(' ALL AUTOMATED TESTS COMPLETED');
  console.log('--------------------------------------------------');
}

runTests().catch(console.error);
