import { Request, Response, NextFunction } from 'express';
import { sendApiError } from '../utils/apiResponse.js';
import { logExternalApiAudit } from '../services/externalAuditService.js';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

// In-memory rate limiting store (sliding 1-minute window)
const rateLimitStore = new Map<string, RateLimitBucket>();

// Periodic cleanup of expired rate limit buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

const DEFAULT_MAX_REQUESTS = Number(process.env.EXTERNAL_API_DEFAULT_RATE_LIMIT) || 60;
const WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Creates a rate limiting middleware per appId / IP.
 */
export function externalRateLimitMiddleware(customLimit?: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.requestId || 'unknown';
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
    const appId = req.externalIdentity?.appId || 'anonymous';

    const key = `${appId}:${clientIp}`;
    const maxRequests = customLimit || DEFAULT_MAX_REQUESTS;
    const now = Date.now();

    let bucket = rateLimitStore.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 1,
        resetAt: now + WINDOW_MS,
      };
      rateLimitStore.set(key, bucket);
    } else {
      bucket.count += 1;
    }

    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', retryAfterSeconds);

      await logExternalApiAudit({
        requestId,
        action: 'RATE_LIMIT_EXCEEDED',
        appId,
        externalDriverId: req.externalIdentity?.externalDriverId,
        route: req.originalUrl || req.path,
        method: req.method,
        result: 'DENIED',
        errorCode: 'RATE_LIMITED',
        ip: clientIp,
        userAgent: req.headers['user-agent'],
        metadata: {
          statusCode: 429,
        },
      });

      sendApiError(
        res,
        'RATE_LIMITED',
        `Limite de requisições excedido. Tente novamente em ${retryAfterSeconds} segundos.`,
        429,
        requestId
      );
      return;
    }

    next();
  };
}
