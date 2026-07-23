import { Router, Response } from 'express';
import { verifyRestaurantAuth, AuthenticatedRestaurantRequest } from '../middleware/verifyRestaurantAuth.js';
import { claimTokenRateLimiter } from '../middleware/claimTokenRateLimiter.js';
import {
  createClaimToken,
  getActiveTokenStatus,
  revokeActiveTokensForOrder,
} from '../services/deliveryClaimTokenService.js';
import { sendApiSuccess, sendApiError } from '../utils/apiResponse.js';
import { DeliveryClaimRevocationReason, DeliveryClaimTokenSource } from '../types/claimTokenTypes.js';

const router = Router({ mergeParams: true });

function setNoCacheHeaders(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/**
 * POST /api/v1/restaurants/:restaurantId/orders/:orderId/delivery-claim-token
 * Generates or reissues a delivery claim token for an order.
 */
router.post(
  '/:restaurantId/orders/:orderId/delivery-claim-token',
  verifyRestaurantAuth,
  claimTokenRateLimiter,
  async (req: AuthenticatedRestaurantRequest, res: Response) => {
    setNoCacheHeaders(res);
    const requestId = (req as any).requestId || 'internal';
    const { restaurantId, orderId } = req.params;
    const userId = req.userId || 'system';

    const source: DeliveryClaimTokenSource = req.body?.source || 'RESTAURANT_PANEL';

    try {
      const result = await createClaimToken(
        {
          restaurantId,
          orderId,
          createdByUserId: userId,
          source,
        },
        requestId
      );

      return sendApiSuccess(
        res,
        {
          claimToken: result.rawToken,
          publicOrderNumber: result.publicOrderNumber,
          version: result.version,
          expiresAt: new Date(result.expiresAt.toMillis()).toISOString(),
        },
        201,
        requestId
      );
    } catch (error: any) {
      const errMessage = error?.message || '';

      if (errMessage === 'ORDER_NOT_FOUND') {
        return sendApiError(res, 'ORDER_NOT_FOUND', 'Pedido informado não foi encontrado.', 404, requestId);
      }
      if (errMessage === 'ORDER_NOT_DELIVERY') {
        return sendApiError(
          res,
          'ORDER_NOT_DELIVERY',
          'Não é possível gerar token de captura para pedidos de retirada/balcão.',
          400,
          requestId
        );
      }
      if (errMessage === 'ORDER_NOT_ELIGIBLE') {
        return sendApiError(
          res,
          'ORDER_NOT_ELIGIBLE',
          'O pedido não está em um status elegível para geração de token de entrega.',
          400,
          requestId
        );
      }
      if (errMessage === 'ORDER_ALREADY_ASSIGNED') {
        return sendApiError(
          res,
          'ORDER_ALREADY_ASSIGNED',
          'Este pedido já possui um entregador atribuído.',
          409,
          requestId
        );
      }

      console.error('[InternalClaimTokenRoutes] Error generating claim token:', error);
      return sendApiError(
        res,
        'CLAIM_TOKEN_GENERATION_FAILED',
        'Falha interna ao gerar token de captura de entrega.',
        500,
        requestId
      );
    }
  }
);

/**
 * GET /api/v1/restaurants/:restaurantId/orders/:orderId/delivery-claim-token/status
 * Fetches current claim token status for an order without exposing raw tokens or hashes.
 */
router.get(
  '/:restaurantId/orders/:orderId/delivery-claim-token/status',
  verifyRestaurantAuth,
  claimTokenRateLimiter,
  async (req: AuthenticatedRestaurantRequest, res: Response) => {
    setNoCacheHeaders(res);
    const requestId = (req as any).requestId || 'internal';
    const { restaurantId, orderId } = req.params;

    try {
      const statusData = await getActiveTokenStatus(restaurantId, orderId, requestId);

      return sendApiSuccess(res, statusData, 200, requestId);
    } catch (error: any) {
      if (error?.message === 'ORDER_NOT_FOUND') {
        return sendApiError(res, 'ORDER_NOT_FOUND', 'Pedido informado não foi encontrado.', 404, requestId);
      }

      console.error('[InternalClaimTokenRoutes] Error reading token status:', error);
      return sendApiError(
        res,
        'INTERNAL_ERROR',
        'Falha ao consultar estado do token de entrega.',
        500,
        requestId
      );
    }
  }
);

/**
 * POST /api/v1/restaurants/:restaurantId/orders/:orderId/delivery-claim-token/revoke
 * Manually revokes active claim tokens for an order.
 */
router.post(
  '/:restaurantId/orders/:orderId/delivery-claim-token/revoke',
  verifyRestaurantAuth,
  claimTokenRateLimiter,
  async (req: AuthenticatedRestaurantRequest, res: Response) => {
    setNoCacheHeaders(res);
    const requestId = (req as any).requestId || 'internal';
    const { restaurantId, orderId } = req.params;
    const userId = req.userId || 'system';

    const validReasons: DeliveryClaimRevocationReason[] = [
      'REPRINT',
      'ORDER_CHANGED',
      'RESTAURANT_REQUEST',
      'SECURITY',
      'OTHER',
    ];

    const rawReason = req.body?.reason;
    const reason: DeliveryClaimRevocationReason = validReasons.includes(rawReason)
      ? rawReason
      : 'RESTAURANT_REQUEST';

    const customNote = req.body?.note ? String(req.body.note).substring(0, 200) : undefined;

    try {
      const result = await revokeActiveTokensForOrder(
        restaurantId,
        orderId,
        userId,
        reason,
        customNote,
        requestId
      );

      return sendApiSuccess(
        res,
        {
          revoked: result.revoked,
          publicOrderNumber: result.publicOrderNumber,
        },
        200,
        requestId
      );
    } catch (error: any) {
      if (error?.message === 'ORDER_NOT_FOUND') {
        return sendApiError(res, 'ORDER_NOT_FOUND', 'Pedido informado não foi encontrado.', 404, requestId);
      }

      console.error('[InternalClaimTokenRoutes] Error revoking token:', error);
      return sendApiError(
        res,
        'INTERNAL_ERROR',
        'Falha ao revogar token de captura.',
        500,
        requestId
      );
    }
  }
);

export default router;
