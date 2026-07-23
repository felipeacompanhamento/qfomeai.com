import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../utils/getAdminDb.js';
import {
  DeliveryClaimTokenDoc,
  CreateDeliveryClaimTokenInput,
  CreateDeliveryClaimTokenResult,
  ValidateDeliveryClaimTokenResult,
  DeliveryClaimRevocationReason,
} from '../types/claimTokenTypes.js';
import {
  isOrderEligibleForDeliveryClaim,
  resolvePublicOrderNumber,
  getClaimTokenTTLSeconds,
} from '../utils/claimTokenHelpers.js';
import { logExternalApiAudit } from './externalAuditService.js';

/**
 * Creates a cryptographically secure delivery claim token for an order.
 * Ensures strict atomicity using a Firestore transaction: revokes any previous active token,
 * increments the version number, creates the new hashed token document, and updates the order summary.
 *
 * CRITICAL SECURITY GUARANTEE:
 * The raw unhashed token is returned ONCE to the caller and NEVER persisted or logged.
 */
export async function createClaimToken(
  input: CreateDeliveryClaimTokenInput,
  requestId: string = 'internal'
): Promise<CreateDeliveryClaimTokenResult> {
  const db = getAdminDb();
  const orderRef = db
    .collection('restaurants')
    .doc(input.restaurantId)
    .collection('orders')
    .doc(input.orderId);

  // Generate cryptographic token (256 bits entropy)
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const ttlSeconds = input.expiresInSeconds || getClaimTokenTTLSeconds();
  const expiresAtMillis = Date.now() + ttlSeconds * 1000;
  const expiresAt = Timestamp.fromMillis(expiresAtMillis);

  let newVersion = 1;
  let publicOrderNumber = '';

  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) {
      throw new Error('ORDER_NOT_FOUND');
    }

    const orderData = orderSnap.data();
    const eligibility = isOrderEligibleForDeliveryClaim(orderData);
    if (!eligibility.eligible) {
      throw new Error(eligibility.reason || 'ORDER_NOT_ELIGIBLE');
    }

    publicOrderNumber = resolvePublicOrderNumber(input.orderId, orderData);

    const activeSummary = orderData?.deliveryClaim;
    const previousTokenHash = activeSummary?.activeTokenHash;

    if (previousTokenHash && activeSummary?.status === 'ACTIVE') {
      const prevTokenRef = db.collection('deliveryClaimTokens').doc(previousTokenHash);
      const prevTokenSnap = await transaction.get(prevTokenRef);

      if (prevTokenSnap.exists) {
        const prevData = prevTokenSnap.data() as DeliveryClaimTokenDoc;
        newVersion = (prevData.version || 1) + 1;

        if (prevData.status === 'ACTIVE') {
          transaction.update(prevTokenRef, {
            status: 'REVOKED',
            revokedAt: FieldValue.serverTimestamp(),
            revokedByUserId: input.createdByUserId,
            revocationReason: 'REPRINT',
          });
        }
      } else if (activeSummary?.activeTokenVersion) {
        newVersion = activeSummary.activeTokenVersion + 1;
      }
    } else if (activeSummary?.activeTokenVersion) {
      newVersion = activeSummary.activeTokenVersion + 1;
    }

    const newTokenRef = db.collection('deliveryClaimTokens').doc(tokenHash);

    const tokenDocContent: DeliveryClaimTokenDoc = {
      tokenHash,
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      publicOrderNumber,
      purpose: 'DELIVERY_CLAIM',
      status: 'ACTIVE',
      version: newVersion,
      createdAt: Timestamp.now(),
      expiresAt,
      createdByUserId: input.createdByUserId,
      metadata: {
        source: input.source || 'RESTAURANT_PANEL',
      },
    };

    transaction.set(newTokenRef, tokenDocContent);

    // Update order summary (and persist publicOrderNumber if not present)
    const orderUpdates: Record<string, any> = {
      deliveryClaim: {
        status: 'ACTIVE',
        activeTokenHash: tokenHash,
        activeTokenVersion: newVersion,
        tokenExpiresAt: expiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
    };

    if (!orderData?.publicOrderNumber) {
      orderUpdates.publicOrderNumber = publicOrderNumber;
    }

    transaction.update(orderRef, orderUpdates);
  });

  // Log audit event asynchronously
  logExternalApiAudit({
    requestId,
    action: 'DELIVERY_CLAIM_TOKEN_CREATED',
    route: `/api/v1/restaurants/${input.restaurantId}/orders/${input.orderId}/delivery-claim-token`,
    method: 'POST',
    result: 'SUCCESS',
    metadata: {
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      publicOrderNumber,
      tokenVersion: newVersion,
      source: input.source || 'RESTAURANT_PANEL',
    },
  });

  return {
    rawToken,
    tokenHash,
    version: newVersion,
    expiresAt,
    publicOrderNumber,
  };
}

/**
 * Gets the status of the active claim token for a specific order.
 * NEVER returns raw tokens or full hashes.
 */
export async function getActiveTokenStatus(
  restaurantId: string,
  orderId: string,
  requestId: string = 'internal'
): Promise<{
  hasActiveToken: boolean;
  status?: string;
  version?: number;
  expiresAt?: string;
  publicOrderNumber?: string;
}> {
  const db = getAdminDb();
  const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    throw new Error('ORDER_NOT_FOUND');
  }

  const orderData = orderSnap.data();
  const publicOrderNumber = resolvePublicOrderNumber(orderId, orderData);
  const claimSummary = orderData?.deliveryClaim;

  if (!claimSummary || !claimSummary.activeTokenHash) {
    return {
      hasActiveToken: false,
      publicOrderNumber,
    };
  }

  const tokenRef = db.collection('deliveryClaimTokens').doc(claimSummary.activeTokenHash);
  const tokenSnap = await tokenRef.get();

  if (!tokenSnap.exists) {
    return {
      hasActiveToken: false,
      publicOrderNumber,
    };
  }

  const tokenData = tokenSnap.data() as DeliveryClaimTokenDoc;

  // Lazy expiration check
  if (tokenData.status === 'ACTIVE' && tokenData.expiresAt.toMillis() <= Date.now()) {
    await tokenRef.update({ status: 'EXPIRED' });
    await orderRef.update({
      'deliveryClaim.status': 'EXPIRED',
      'deliveryClaim.updatedAt': FieldValue.serverTimestamp(),
    });

    logExternalApiAudit({
      requestId,
      action: 'DELIVERY_CLAIM_TOKEN_EXPIRED',
      route: `/api/v1/restaurants/${restaurantId}/orders/${orderId}/delivery-claim-token/status`,
      method: 'GET',
      result: 'SUCCESS',
      metadata: {
        restaurantId,
        orderId,
        publicOrderNumber,
        tokenVersion: tokenData.version,
      },
    });

    return {
      hasActiveToken: false,
      status: 'EXPIRED',
      version: tokenData.version,
      publicOrderNumber,
    };
  }

  const isActive = tokenData.status === 'ACTIVE';

  logExternalApiAudit({
    requestId,
    action: 'DELIVERY_CLAIM_TOKEN_STATUS_READ',
    route: `/api/v1/restaurants/${restaurantId}/orders/${orderId}/delivery-claim-token/status`,
    method: 'GET',
    result: 'SUCCESS',
    metadata: {
      restaurantId,
      orderId,
      publicOrderNumber,
      tokenVersion: tokenData.version,
    },
  });

  return {
    hasActiveToken: isActive,
    status: tokenData.status,
    version: tokenData.version,
    expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt.toMillis()).toISOString() : undefined,
    publicOrderNumber,
  };
}

/**
 * Revokes any active claim tokens for a given order.
 * Operates idempotently: if no active token exists, returns success indicating no changes were made.
 */
export async function revokeActiveTokensForOrder(
  restaurantId: string,
  orderId: string,
  revokedByUserId: string,
  reason: DeliveryClaimRevocationReason = 'RESTAURANT_REQUEST',
  customNote?: string,
  requestId: string = 'internal'
): Promise<{ revoked: boolean; publicOrderNumber: string }> {
  const db = getAdminDb();
  const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);

  let publicOrderNumber = '';
  let didRevoke = false;

  await db.runTransaction(async (transaction) => {
    const orderSnap = await transaction.get(orderRef);
    if (!orderSnap.exists) {
      throw new Error('ORDER_NOT_FOUND');
    }

    const orderData = orderSnap.data();
    publicOrderNumber = resolvePublicOrderNumber(orderId, orderData);
    const claimSummary = orderData?.deliveryClaim;

    if (!claimSummary || !claimSummary.activeTokenHash || claimSummary.status !== 'ACTIVE') {
      didRevoke = false;
      return;
    }

    const tokenRef = db.collection('deliveryClaimTokens').doc(claimSummary.activeTokenHash);
    const tokenSnap = await transaction.get(tokenRef);

    if (tokenSnap.exists && tokenSnap.data()?.status === 'ACTIVE') {
      transaction.update(tokenRef, {
        status: 'REVOKED',
        revokedAt: FieldValue.serverTimestamp(),
        revokedByUserId,
        revocationReason: reason,
        ...(customNote ? { 'metadata.customNote': customNote } : {}),
      });

      transaction.update(orderRef, {
        'deliveryClaim.status': 'REVOKED',
        'deliveryClaim.updatedAt': FieldValue.serverTimestamp(),
      });

      didRevoke = true;
    }
  });

  if (didRevoke) {
    logExternalApiAudit({
      requestId,
      action: 'DELIVERY_CLAIM_TOKEN_REVOKED',
      route: `/api/v1/restaurants/${restaurantId}/orders/${orderId}/delivery-claim-token/revoke`,
      method: 'POST',
      result: 'SUCCESS',
      metadata: {
        restaurantId,
        orderId,
        publicOrderNumber,
        reason,
      },
    });
  }

  return { revoked: didRevoke, publicOrderNumber };
}

/**
 * Internal validation function for raw claim tokens.
 * Computes SHA-256 hash, verifies token state, expiration, purpose, and order eligibility.
 */
export async function validateClaimToken(rawToken: string): Promise<ValidateDeliveryClaimTokenResult> {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.trim().length < 20 || rawToken.length > 250) {
    return {
      valid: false,
      errorCode: 'INVALID_CLAIM_TOKEN',
      errorMessage: 'Formato de token de captura inválido.',
    };
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  const db = getAdminDb();
  const tokenRef = db.collection('deliveryClaimTokens').doc(tokenHash);
  const tokenSnap = await tokenRef.get();

  if (!tokenSnap.exists) {
    return {
      valid: false,
      errorCode: 'CLAIM_TOKEN_NOT_FOUND',
      errorMessage: 'Token de captura não encontrado.',
    };
  }

  const tokenData = tokenSnap.data() as DeliveryClaimTokenDoc;

  if (tokenData.purpose !== 'DELIVERY_CLAIM') {
    return {
      valid: false,
      errorCode: 'INVALID_CLAIM_TOKEN',
      errorMessage: 'Finalidade do token de captura inválida.',
    };
  }

  if (tokenData.status === 'REVOKED') {
    return {
      valid: false,
      errorCode: 'CLAIM_TOKEN_REVOKED',
      errorMessage: 'Token de captura foi revogado.',
    };
  }

  if (tokenData.status === 'CLAIMED') {
    return {
      valid: false,
      errorCode: 'CLAIM_TOKEN_ALREADY_USED',
      errorMessage: 'Token de captura já foi utilizado.',
    };
  }

  if (tokenData.status === 'EXPIRED' || tokenData.expiresAt.toMillis() <= Date.now()) {
    // Lazy update if active but past timestamp
    if (tokenData.status === 'ACTIVE') {
      await tokenRef.update({ status: 'EXPIRED' });
      await db
        .collection('restaurants')
        .doc(tokenData.restaurantId)
        .collection('orders')
        .doc(tokenData.orderId)
        .update({
          'deliveryClaim.status': 'EXPIRED',
          'deliveryClaim.updatedAt': FieldValue.serverTimestamp(),
        })
        .catch(() => {});
    }

    return {
      valid: false,
      errorCode: 'CLAIM_TOKEN_EXPIRED',
      errorMessage: 'Token de captura expirado.',
    };
  }

  if (tokenData.status !== 'ACTIVE') {
    return {
      valid: false,
      errorCode: 'INVALID_CLAIM_TOKEN',
      errorMessage: 'Token de captura não está ativo.',
    };
  }

  // Validate underlying order status and eligibility
  const orderRef = db
    .collection('restaurants')
    .doc(tokenData.restaurantId)
    .collection('orders')
    .doc(tokenData.orderId);
  const orderSnap = await orderRef.get();

  if (!orderSnap.exists) {
    return {
      valid: false,
      errorCode: 'ORDER_NOT_FOUND',
      errorMessage: 'Pedido associado ao token não existe mais.',
    };
  }

  const orderData = orderSnap.data();
  const eligibility = isOrderEligibleForDeliveryClaim(orderData);

  if (!eligibility.eligible) {
    return {
      valid: false,
      errorCode: eligibility.reason || 'ORDER_NOT_ELIGIBLE',
      errorMessage: 'Pedido não está mais elegível para captura.',
    };
  }

  return {
    valid: true,
    tokenHash,
    restaurantId: tokenData.restaurantId,
    orderId: tokenData.orderId,
    publicOrderNumber: tokenData.publicOrderNumber,
    version: tokenData.version,
    expiresAt: tokenData.expiresAt,
  };
}
