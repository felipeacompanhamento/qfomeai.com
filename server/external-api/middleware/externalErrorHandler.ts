import { Request, Response, NextFunction } from 'express';
import { sendApiError } from '../utils/apiResponse.js';
import { logExternalApiAudit } from '../services/externalAuditService.js';

/**
 * Global error handler middleware for external API routes.
 */
export function externalErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';

  console.error(`[ExternalApiError] Request ${requestId} failed:`, err);

  logExternalApiAudit({
    requestId,
    action: 'INTERNAL_SERVER_ERROR',
    appId: req.externalIdentity?.appId,
    externalDriverId: req.externalIdentity?.externalDriverId,
    route: req.originalUrl || req.path,
    method: req.method,
    result: 'ERROR',
    errorCode: 'INTERNAL_ERROR',
    ip: clientIp,
    userAgent: req.headers['user-agent'],
    metadata: { statusCode: 500 },
  }).catch(() => {});

  sendApiError(
    res,
    'INTERNAL_ERROR',
    'Ocorreu um erro interno ao processar a requisição.',
    500,
    requestId
  );
}
