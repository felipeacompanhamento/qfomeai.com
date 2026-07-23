import crypto from 'crypto';
import { createClaimToken, validateClaimToken, getActiveTokenStatus, revokeActiveTokensForOrder } from '../server/external-api/services/deliveryClaimTokenService.js';
import { getAdminDb } from '../server/external-api/utils/getAdminDb.js';

async function runClaimTokenTests() {
  console.log('====================================================');
  console.log(' RUNNING AUTOMATED UNIT & INTEGRATION TESTS FOR PHASE 2');
  console.log(' DELIVERY CLAIM TOKENS SYSTEM');
  console.log('====================================================');

  const db = getAdminDb();
  const testRestaurantId = `test_rest_${Date.now()}`;
  const testOrderId = `test_order_${Date.now()}`;
  const testUserId = `test_user_${Date.now()}`;

  try {
    // Setup Mock Order Document
    const orderRef = db.collection('restaurants').doc(testRestaurantId).collection('orders').doc(testOrderId);
    await orderRef.set({
      tipo_entrega: 'entrega',
      status: 'em preparo',
      numero_pedido: '42',
      createdAt: new Date(),
    });

    console.log(`\n[Setup] Created mock test order: ${testOrderId} for restaurant: ${testRestaurantId}`);

    // TEST 1: Token Generation
    console.log('\n--- TEST 1: Generate Initial Claim Token ---');
    const token1 = await createClaimToken({
      restaurantId: testRestaurantId,
      orderId: testOrderId,
      createdByUserId: testUserId,
      source: 'RESTAURANT_PRINT',
    });

    console.log('Raw token generated length:', token1.rawToken.length);
    console.log('Token Hash length:', token1.tokenHash.length);
    console.log('Public order number:', token1.publicOrderNumber);
    console.log('Token Version:', token1.version);

    if (token1.version !== 1) throw new Error(`Expected version 1, got ${token1.version}`);
    if (token1.publicOrderNumber !== '42') throw new Error(`Expected public order number '42', got ${token1.publicOrderNumber}`);
    if (token1.tokenHash.length !== 64) throw new Error(`Expected SHA-256 hash length 64, got ${token1.tokenHash.length}`);

    // Verify token doc exists by hash in Firestore
    const tokenDocSnap = await db.collection('deliveryClaimTokens').doc(token1.tokenHash).get();
    if (!tokenDocSnap.exists) throw new Error('Token document was not found in deliveryClaimTokens collection');
    const tokenDocData = tokenDocSnap.data();
    if (tokenDocData?.status !== 'ACTIVE') throw new Error(`Expected status ACTIVE, got ${tokenDocData?.status}`);
    console.log('✓ Token stored correctly with hash ID and status ACTIVE.');

    // TEST 2: Validate Active Token
    console.log('\n--- TEST 2: Validate Active Token ---');
    const valResult1 = await validateClaimToken(token1.rawToken);
    console.log('Validation Result:', valResult1.valid ? 'VALID' : 'INVALID');
    if (!valResult1.valid) throw new Error(`Validation failed: ${valResult1.errorMessage}`);
    if (valResult1.restaurantId !== testRestaurantId) throw new Error('Mismatch restaurantId');
    if (valResult1.orderId !== testOrderId) throw new Error('Mismatch orderId');
    console.log('✓ Validated raw token successfully.');

    // TEST 3: Check Active Token Status
    console.log('\n--- TEST 3: Query Active Token Status ---');
    const status1 = await getActiveTokenStatus(testRestaurantId, testOrderId);
    console.log('Active Status:', status1);
    if (!status1.hasActiveToken || status1.status !== 'ACTIVE' || status1.version !== 1) {
      throw new Error('Status check failed for active token');
    }
    console.log('✓ Active token status returned correctly.');

    // TEST 4: Token Reissuance / Rotation (Increment Version & Revoke Previous)
    console.log('\n--- TEST 4: Reissue Token (Reprint) ---');
    const token2 = await createClaimToken({
      restaurantId: testRestaurantId,
      orderId: testOrderId,
      createdByUserId: testUserId,
      source: 'RESTAURANT_PRINT',
    });

    console.log('New Token Version:', token2.version);
    if (token2.version !== 2) throw new Error(`Expected version 2 upon reissuance, got ${token2.version}`);

    // Verify old token is now REVOKED
    const valOldToken = await validateClaimToken(token1.rawToken);
    console.log('Old Token Validation (should be REVOKED):', valOldToken);
    if (valOldToken.valid !== false || valOldToken.errorCode !== 'CLAIM_TOKEN_REVOKED') {
      throw new Error('Previous token was not revoked upon reissuance!');
    }
    console.log('✓ Previous token correctly revoked upon reissuance.');

    // Verify new token is ACTIVE
    const valNewToken = await validateClaimToken(token2.rawToken);
    if (!valNewToken.valid) throw new Error(`New reissued token validation failed: ${valNewToken.errorMessage}`);
    console.log('✓ Reissued token version 2 is ACTIVE.');

    // TEST 5: Manual Revocation
    console.log('\n--- TEST 5: Revoke Active Token ---');
    const revokeRes = await revokeActiveTokensForOrder(testRestaurantId, testOrderId, testUserId, 'ORDER_CHANGED');
    console.log('Revocation Result:', revokeRes);
    if (!revokeRes.revoked) throw new Error('Expected revocation to succeed.');

    const valRevokedToken2 = await validateClaimToken(token2.rawToken);
    if (valRevokedToken2.valid !== false || valRevokedToken2.errorCode !== 'CLAIM_TOKEN_REVOKED') {
      throw new Error('Token 2 was not revoked properly!');
    }
    console.log('✓ Token 2 successfully marked REVOKED.');

    // TEST 6: Invalid Token Inputs
    console.log('\n--- TEST 6: Test Invalid Token Inputs ---');
    const invalidRes = await validateClaimToken('invalid_short_token');
    if (invalidRes.valid !== false || invalidRes.errorCode !== 'INVALID_CLAIM_TOKEN') {
      throw new Error('Short token did not fail properly');
    }

    const nonExistentToken = crypto.randomBytes(32).toString('base64url');
    const nonExistRes = await validateClaimToken(nonExistentToken);
    if (nonExistRes.valid !== false || nonExistRes.errorCode !== 'CLAIM_TOKEN_NOT_FOUND') {
      throw new Error('Non-existent token did not return CLAIM_TOKEN_NOT_FOUND');
    }
    console.log('✓ Invalid token validations passed.');

    // Cleanup
    await orderRef.delete();
    await db.collection('deliveryClaimTokens').doc(token1.tokenHash).delete();
    await db.collection('deliveryClaimTokens').doc(token2.tokenHash).delete();
    await db.collection('restaurants').doc(testRestaurantId).delete();

    console.log('\n====================================================');
    console.log(' ALL PHASE 2 CLAIM TOKEN TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('\n❌ TEST FAILURE:', err?.message || err);
    process.exit(1);
  }
}

runClaimTokenTests();
