import { Request, Response, NextFunction } from 'express';
import { verifyExternalToken } from '../services/externalTokenService.js';
import { updateAppLastUsed } from '../services/externalAppService.js';
import { sendApiError } from '../utils/apiResponse.js';
import { hasRequiredScope } from '../utils/externalValidation.js';
import { logExternalApiAudit } from '../services/externalAuditService.js';

/**
 * Creates authentication middleware demanding valid external JWT token and required scope.
 */
export function authenticateExternalToken(requiredScope?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.requestId || 'unknown';
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
    const authHeader = req.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      await logExternalApiAudit({
        requestId,
        action: 'AUTHENTICATION_FAILED',
        route: req.originalUrl || req.path,
        method: req.method,
        result: 'DENIED',
        errorCode: 'UNAUTHENTICATED',
        ip: clientIp,
        userAgent: req.headers['user-agent'],
        metadata: { statusCode: 401 },
      });

      sendApiError(
        res,
        'UNAUTHENTICATED',
        'Cabeçalho Authorization ausente ou formato Bearer inválido.',
        401,
        requestId
      );
      return;
    }

    const rawToken = authHeader.substring(7).trim();

    const verification = await verifyExternalToken(rawToken);

    if (!verification.valid || !verification.identity || !verification.app) {
      const code = verification.errorCode || 'INVALID_EXTERNAL_TOKEN';
      const msg = verification.errorMessage || 'Token externo inválido ou não autorizado.';
      const statusCode = code === 'UNAUTHENTICATED' || code === 'TOKEN_EXPIRED' || code === 'INVALID_EXTERNAL_TOKEN' ? 401 : 403;

      await logExternalApiAudit({
        requestId,
        action: 'TOKEN_VERIFICATION_FAILED',
        appId: verification.app?.appId,
        route: req.originalUrl || req.path,
        method: req.method,
        result: 'DENIED',
        errorCode: code,
        ip: clientIp,
        userAgent: req.headers['user-agent'],
        metadata: { statusCode },
      });

      sendApiError(res, code, msg, statusCode, requestId);
      return;
    }

    // Check required scope
    if (requiredScope) {
      const appAllowed = hasRequiredScope(verification.app.allowedScopes, requiredScope);
      const tokenGranted = hasRequiredScope(verification.identity.scopes, requiredScope);

      if (!appAllowed || !tokenGranted) {
        await logExternalApiAudit({
          requestId,
          action: 'SCOPE_DENIED',
          appId: verification.identity.appId,
          externalDriverId: verification.identity.externalDriverId,
          route: req.originalUrl || req.path,
          method: req.method,
          result: 'DENIED',
          errorCode: 'INSUFFICIENT_SCOPE',
          ip: clientIp,
          userAgent: req.headers['user-agent'],
          metadata: {
            scopeRequired: requiredScope,
            statusCode: 403,
          },
        });

        sendApiError(
          res,
          'INSUFFICIENT_SCOPE',
          `Escopo insuficiente para realizar esta ação. Escopo necessário: ${requiredScope}`,
          403,
          requestId
        );
        return;
      }
    }

    // Attach identity to Express Request
    req.externalIdentity = verification.identity;

    // Asynchronously update last used timestamp
    updateAppLastUsed(verification.identity.appId).catch(() => {});

    next();
  };
}
