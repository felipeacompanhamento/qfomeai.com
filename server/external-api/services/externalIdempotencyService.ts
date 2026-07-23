import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '../utils/getAdminDb.js';
import { hashSha256 } from '../utils/cryptoUtils.js';

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  isConflict: boolean;
  isProcessing: boolean;
  cachedResponse?: {
    statusCode: number;
    body: object;
  };
}

export interface IdempotencyRecord {
  appId: string;
  externalDriverId: string;
  routeKey: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  responseStatus?: number;
  responseBody?: object;
  createdAt: any;
  expiresAt: any;
}

const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Checks or acquires an idempotency lock in externalApiIdempotency collection.
 */
export async function processIdempotency(
  appId: string,
  externalDriverId: string,
  routeKey: string,
  idempotencyKey: string,
  requestPayload: unknown
): Promise<IdempotencyCheckResult> {
  const db = getAdminDb();
  const rawFingerprint = `${routeKey}:${JSON.stringify(requestPayload || {})}`;
  const requestFingerprint = hashSha256(rawFingerprint);
  const idempotencyKeyHash = hashSha256(`${appId}:${idempotencyKey}`);

  const docRef = db.collection('externalApiIdempotency').doc(idempotencyKeyHash);

  return db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(docRef);

    if (docSnap.exists) {
      const existing = docSnap.data() as IdempotencyRecord;

      // Check if same request fingerprint
      if (existing.requestFingerprint !== requestFingerprint) {
        return {
          isDuplicate: true,
          isConflict: true,
          isProcessing: false,
        };
      }

      if (existing.status === 'PROCESSING') {
        return {
          isDuplicate: true,
          isConflict: false,
          isProcessing: true,
        };
      }

      if (existing.status === 'COMPLETED' && existing.responseStatus && existing.responseBody) {
        return {
          isDuplicate: true,
          isConflict: false,
          isProcessing: false,
          cachedResponse: {
            statusCode: existing.responseStatus,
            body: existing.responseBody,
          },
        };
      }
    }

    // New lock record
    const expiresAt = Timestamp.fromMillis(Date.now() + IDEMPOTENCY_TTL_HOURS * 3600 * 1000);

    const newRecord: Partial<IdempotencyRecord> = {
      appId,
      externalDriverId,
      routeKey,
      idempotencyKeyHash,
      requestFingerprint,
      status: 'PROCESSING',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
    };

    transaction.set(docRef, newRecord);

    return {
      isDuplicate: false,
      isConflict: false,
      isProcessing: false,
    };
  });
}

/**
 * Saves completed or failed response for an idempotency lock.
 */
export async function saveIdempotencyResponse(
  idempotencyKey: string,
  appId: string,
  status: 'COMPLETED' | 'FAILED',
  responseStatus: number,
  responseBody: object
): Promise<void> {
  try {
    const db = getAdminDb();
    const idempotencyKeyHash = hashSha256(`${appId}:${idempotencyKey}`);
    const docRef = db.collection('externalApiIdempotency').doc(idempotencyKeyHash);

    await docRef.update({
      status,
      responseStatus,
      responseBody,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('[ExternalIdempotency] Failed to update idempotency response:', err);
  }
}
