import { Request, Response, NextFunction } from 'express';
import { isValidIdempotencyKey } from '../utils/externalValidation.js';
import { processIdempotency, saveIdempotencyResponse } from '../services/externalIdempotencyService.js';
import { sendApiError } from '../utils/apiResponse.js';

/**
 * Middleware handling Idempotency-Key headers for state-changing endpoints.
 */
export async function externalIdempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const idempotencyKey = req.headers['idempotency-key'];
  const requestId = req.requestId || 'unknown';

  if (!idempotencyKey || typeof idempotencyKey !== 'string') {
    // If no Idempotency-Key header provided, proceed without caching
    next();
    return;
  }

  if (!isValidIdempotencyKey(idempotencyKey)) {
    sendApiError(
      res,
      'VALIDATION_ERROR',
      'Idempotency-Key inválida. Deve conter de 8 a 64 caracteres alfanuméricos, traços ou underscores.',
      400,
      requestId
    );
    return;
  }

  const identity = req.externalIdentity;
  if (!identity) {
    next();
    return;
  }

  const routeKey = `${req.method}:${req.originalUrl || req.path}`;

  try {
    const result = await processIdempotency(
      identity.appId,
      identity.externalDriverId,
      routeKey,
      idempotencyKey,
      req.body
    );

    if (result.isConflict) {
      sendApiError(
        res,
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key reutilizada com payload ou rota diferente.',
        409,
        requestId
      );
      return;
    }

    if (result.isProcessing) {
      sendApiError(
        res,
        'IDEMPOTENCY_CONFLICT',
        'Uma requisição simultânea com esta Idempotency-Key ainda está em processamento.',
        409,
        requestId
      );
      return;
    }

    if (result.isDuplicate && result.cachedResponse) {
      res.status(result.cachedResponse.statusCode).json(result.cachedResponse.body);
      return;
    }

    // Intercept res.json to capture response body for idempotency store
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      const statusCode = res.statusCode;
      const status = statusCode >= 200 && statusCode < 300 ? 'COMPLETED' : 'FAILED';
      saveIdempotencyResponse(idempotencyKey, identity.appId, status, statusCode, body).catch(() => {});
      return originalJson(body);
    };

    next();
  } catch (err) {
    console.error('[ExternalIdempotencyMiddleware] Error:', err);
    next();
  }
}
