import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { getAdminDb } from '../utils/getAdminDb.js';
import { sendApiError } from '../utils/apiResponse.js';
import { logExternalApiAudit } from '../services/externalAuditService.js';

export interface AuthenticatedRestaurantRequest extends Request {
  userId?: string;
  userEmail?: string;
  restaurantId?: string;
  isSystemAdmin?: boolean;
}

/**
 * Middleware that verifies QFomeAI internal Firebase Auth ID Tokens and enforces
 * restaurant authorization boundaries.
 */
export async function verifyRestaurantAuth(
  req: AuthenticatedRestaurantRequest,
  res: Response,
  next: NextFunction
) {
  const requestId = (req as any).requestId || 'internal';
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendApiError(
      res,
      'UNAUTHENTICATED',
      'Cabeçalho de autorização Firebase ausente ou inválido.',
      401,
      requestId
    );
  }

  const idToken = authHeader.substring(7).trim();

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.userId = decodedToken.uid;
    req.userEmail = decodedToken.email;

    const targetRestaurantId = req.params.restaurantId || req.body.restaurantId;

    if (!targetRestaurantId) {
      return sendApiError(
        res,
        'INVALID_RESTAURANT',
        'ID do restaurante não especificado.',
        400,
        requestId
      );
    }

    req.restaurantId = targetRestaurantId;

    // Check custom claim admin
    if (decodedToken.admin === true || decodedToken.role === 'admin') {
      req.isSystemAdmin = true;
      return next();
    }

    const db = getAdminDb();

    // Check user profile document
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();

    if (userData?.role === 'admin' || userData?.isAdmin === true) {
      req.isSystemAdmin = true;
      return next();
    }

    // Direct match on user profile
    if (userData?.restaurantId === targetRestaurantId) {
      return next();
    }

    // Check restaurant document ownership or member list
    const restDoc = await db.collection('restaurants').doc(targetRestaurantId).get();
    if (restDoc.exists) {
      const restData = restDoc.data();
      const isOwner =
        restData?.ownerId === decodedToken.uid ||
        restData?.userId === decodedToken.uid ||
        restData?.email === decodedToken.email ||
        (Array.isArray(restData?.allowedUsers) && restData.allowedUsers.includes(decodedToken.uid));

      if (isOwner) {
        return next();
      }
    }

    // Access Denied - user does not belong to target restaurant
    logExternalApiAudit({
      requestId,
      action: 'DELIVERY_CLAIM_TOKEN_GENERATION_DENIED',
      route: req.originalUrl,
      method: req.method,
      result: 'DENIED',
      errorCode: 'FORBIDDEN',
      ip: req.ip,
      metadata: {
        restaurantId: targetRestaurantId,
        statusCode: 403,
      },
    });

    return sendApiError(
      res,
      'FORBIDDEN',
      'Você não possui permissão para acessar os dados deste restaurante.',
      403,
      requestId
    );
  } catch (error: any) {
    console.error('[VerifyRestaurantAuth] Firebase Token Verification Error:', error?.message);
    return sendApiError(
      res,
      'UNAUTHENTICATED',
      'Token de autenticação do usuário inválido ou expirado.',
      401,
      requestId
    );
  }
}
