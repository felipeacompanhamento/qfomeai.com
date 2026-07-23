import { Router, Request, Response } from 'express';
import { authenticateExternalToken } from '../middleware/authenticateExternalToken.js';
import { externalRateLimitMiddleware } from '../middleware/externalRateLimit.js';
import { sendApiSuccess } from '../utils/apiResponse.js';
import { logExternalApiAudit } from '../services/externalAuditService.js';

const router = Router();

/**
 * GET /api/v1/external/health
 * Authenticated health check endpoint for external delivery integration.
 * Requires valid JWT and scope 'delivery:read'.
 */
router.get(
  '/health',
  authenticateExternalToken('delivery:read'),
  externalRateLimitMiddleware(),
  async (req: Request, res: Response) => {
    const requestId = req.requestId || 'unknown';
    const identity = req.externalIdentity!;
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';

    await logExternalApiAudit({
      requestId,
      action: 'HEALTH_CHECK_SUCCESS',
      appId: identity.appId,
      externalDriverId: identity.externalDriverId,
      route: '/api/v1/external/health',
      method: 'GET',
      result: 'SUCCESS',
      ip: clientIp,
      userAgent: req.headers['user-agent'],
      metadata: { statusCode: 200 },
    });

    sendApiSuccess(
      res,
      {
        status: 'ok',
        authenticated: true,
        appId: identity.appId,
        externalDriverId: identity.externalDriverId,
        serverTime: new Date().toISOString(),
      },
      200,
      requestId
    );
  }
);

export default router;
