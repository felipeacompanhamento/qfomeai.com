import type { Firestore } from 'firebase-admin/firestore';
import { logger } from './logger';

export async function logDriverAudit(
  db: Firestore,
  params: {
    requestId: string;
    uid: string;
    driverId: string;
    restaurantId: string;
    endpoint: string;
    orderId?: string;
    action: string;
    result: string;
    httpStatus: number;
  }
) {
  const timestamp = new Date().toISOString();
  logger.info(`[DRIVER_AUDIT] RequestId: ${params.requestId} | UID: ${params.uid} | DriverID: ${params.driverId} | RestaurantID: ${params.restaurantId} | Endpoint: ${params.endpoint} | OrderId: ${params.orderId || 'N/A'} | Action: ${params.action} | Result: ${params.result} | HttpStatus: ${params.httpStatus}`);
  try {
    await db.collection('restaurants').doc(params.restaurantId).collection('driverAuditLogs').add({
      ...params,
      timestamp
    });
  } catch (err: any) {
    logger.warn('[DRIVER_AUDIT] Failed to persist log to Firestore:', { error: err.message });
  }
}

export async function logDriverResolutionAudit(
  db: Firestore,
  params: {
    requestId: string;
    uid: string;
    perfisEncontrados: number;
    restaurantIdsEncontrados: string[];
    resultadoValidacao: string;
    httpStatus: number;
    restaurantId?: string;
  }
) {
  const timestamp = new Date().toISOString();
  logger.info(`[DRIVER_RESOLUTION_AUDIT] RequestId: ${params.requestId} | UID: ${params.uid} | PerfisEncontrados: ${params.perfisEncontrados} | RestaurantIDs: [${params.restaurantIdsEncontrados.join(', ')}] | Resultado: ${params.resultadoValidacao} | HttpStatus: ${params.httpStatus}`);
  try {
    const targetRestaurantId = params.restaurantId || (params.restaurantIdsEncontrados[0] || 'SYSTEM');
    if (targetRestaurantId !== 'SYSTEM') {
      await db.collection('restaurants').doc(targetRestaurantId).collection('driverResolutionAuditLogs').add({
        ...params,
        timestamp
      });
    } else {
      await db.collection('systemDriverResolutionAuditLogs').add({
        ...params,
        timestamp
      });
    }
  } catch (err: any) {
    logger.warn('[DRIVER_RESOLUTION_AUDIT] Failed to persist log to Firestore:', { error: err.message });
  }
}
