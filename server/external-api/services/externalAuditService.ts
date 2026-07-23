import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../utils/getAdminDb.js';
import { hashIpAddress, summarizeUserAgent } from '../utils/cryptoUtils.js';

export interface AuditLogOptions {
  requestId: string;
  action: string;
  appId?: string;
  externalDriverId?: string;
  route: string;
  method: string;
  result: 'SUCCESS' | 'DENIED' | 'ERROR';
  errorCode?: string;
  ip?: string;
  userAgent?: string;
  metadata?: {
    scopeRequired?: string;
    statusCode?: number;
    durationMs?: number;
    restaurantId?: string;
    orderId?: string;
    publicOrderNumber?: string;
    tokenVersion?: number;
    source?: string;
    reason?: string;
  };
}

/**
 * Writes a sanitized audit log entry to deliveryApiAuditLogs collection in Firestore.
 * This function never throws errors synchronously and runs asynchronously to avoid blocking API flows.
 */
export async function logExternalApiAudit(options: AuditLogOptions): Promise<void> {
  try {
    const db = getAdminDb();
    const logRef = db.collection('deliveryApiAuditLogs').doc();

    const entry = {
      requestId: options.requestId,
      action: options.action,
      ...(options.appId ? { appId: options.appId } : {}),
      ...(options.externalDriverId ? { externalDriverId: options.externalDriverId } : {}),
      route: options.route,
      method: options.method,
      result: options.result,
      ...(options.errorCode ? { errorCode: options.errorCode } : {}),
      ...(options.ip ? { ipHash: hashIpAddress(options.ip) } : {}),
      ...(options.userAgent ? { userAgentSummary: summarizeUserAgent(options.userAgent) } : {}),
      occurredAt: FieldValue.serverTimestamp(),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    };

    await logRef.set(entry);
  } catch (error) {
    // Non-blocking catch to ensure logging never crashes main request pipeline
    console.error('[ExternalAuditService] Failed to write audit log:', error);
  }
}
