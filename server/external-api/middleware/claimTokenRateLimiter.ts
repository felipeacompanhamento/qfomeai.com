import { Response, NextFunction } from 'express';
import { AuthenticatedRestaurantRequest } from './verifyRestaurantAuth.js';
import { sendApiError } from '../utils/apiResponse.js';

interface MemoryRateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, MemoryRateLimitRecord>();
const CLEANUP_INTERVAL_MS = 60 * 1000;
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 20;

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Memory rate limiter ensuring max 20 requests per minute per user/restaurant for claim token endpoints.
 */
export function claimTokenRateLimiter(
  req: AuthenticatedRestaurantRequest,
  res: Response,
  next: NextFunction
) {
  const identifier = req.userId || req.ip || 'anonymous';
  const restaurantId = req.params.restaurantId || 'global';
  const key = `${identifier}:${restaurantId}:${req.path}`;

  const now = Date.now();
  let record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    record = {
      count: 1,
      resetAt: now + WINDOW_MS,
    };
    rateLimitMap.set(key, record);
    return next();
  }

  if (record.count >= MAX_REQUESTS) {
    res.setHeader('Retry-After', Math.ceil((record.resetAt - now) / 1000));
    const requestId = (req as any).requestId || 'internal';
    return sendApiError(
      res,
      'RATE_LIMIT_EXCEEDED',
      'Muitas solicitações de token de captura. Por favor, aguarde um minuto.',
      429,
      requestId
    );
  }

  record.count += 1;
  next();
}
