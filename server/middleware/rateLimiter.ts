import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { metricsRegistry } from '../utils/metrics';

export type RateLimitCategory = 'auth' | 'financial' | 'webhook' | 'admin' | 'operation';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  category?: RateLimitCategory;
  keyGenerator?: (req: Request) => string;
}

interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }>;
}

// Local memory store implementation with safe cleanup
class LocalMemoryStore implements RateLimitStore {
  private hits = new Map<string, { count: number; resetTime: number }>();

  constructor() {
    // Cleanup expired keys every 5 minutes
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.hits.entries()) {
        if (now > value.resetTime) {
          this.hits.delete(key);
        }
      }
    }, 5 * 60 * 1000);
    if (timer.unref) {
      timer.unref();
    }
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    const now = Date.now();
    let record = this.hits.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      this.hits.set(key, record);
      return record;
    }

    record.count += 1;
    return record;
  }
}

// Distributed Firestore Store (or fallback) for production
class DistributedRateLimitStore implements RateLimitStore {
  private localFallback = new LocalMemoryStore();

  async increment(key: string, windowMs: number): Promise<{ count: number; resetTime: number }> {
    try {
      const db = (global as any).__firestoreDb || (global as any).db;
      if (!db || typeof db.collection !== 'function') {
        return this.localFallback.increment(key, windowMs);
      }

      const now = Date.now();
      const docRef = db.collection('rate_limits').doc(encodeURIComponent(key));
      
      let count = 1;
      let resetTime = now + windowMs;

      await db.runTransaction(async (transaction: any) => {
        const doc = await transaction.get(docRef);
        if (!doc.exists || doc.data().resetTime < now) {
          count = 1;
          resetTime = now + windowMs;
          transaction.set(docRef, { count, resetTime, updatedAt: now });
        } else {
          const data = doc.data();
          count = (data.count || 0) + 1;
          resetTime = data.resetTime;
          transaction.update(docRef, { count, updatedAt: now });
        }
      });

      return { count, resetTime };
    } catch (err: any) {
      logger.error('Distributed rate limiter storage error, falling back to local memory store', { error: err?.message });
      return this.localFallback.increment(key, windowMs);
    }
  }
}

const isProduction = process.env.NODE_ENV === 'production';
const store: RateLimitStore = isProduction ? new DistributedRateLimitStore() : new LocalMemoryStore();

export function createRateLimiter(options: RateLimitOptions) {
  const category = options.category || 'operation';

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const now = Date.now();
      const requestId = (req as any).requestId || req.headers['x-request-id'] || 'unknown';

      // 1. Strict Bypass check: Only allowed in test environment with internal verified mechanism
      const isTestEnv = process.env.NODE_ENV === 'test';
      const isTestAuditUser = (req as any).user?.uid?.startsWith('test_audit_');
      if (isTestEnv && isTestAuditUser) {
        return next();
      }

      // 2. Extract trusted IP and context securely (No blind trust in client-supplied headers)
      const rawIp = req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
      const ip = rawIp.replace(/^::ffff:/, '');
      const uid = (req as any).user?.uid && typeof (req as any).user.uid === 'string' ? (req as any).user.uid : 'anonymous';
      const restaurantId = (req as any).user?.restaurantId && typeof (req as any).user.restaurantId === 'string' ? (req as any).user.restaurantId : 'global';

      // 3. Build canonical key incorporating IP, uid, restaurantId, and category
      const clientKey = options.keyGenerator
        ? options.keyGenerator(req)
        : `rl:${category}:${ip}:${uid}:${restaurantId}`;

      // 4. Increment and check store
      const { count, resetTime } = await store.increment(clientKey, options.windowMs);
      const retryAfterSeconds = Math.ceil((resetTime - now) / 1000);

      res.setHeader('Retry-After', Math.max(1, retryAfterSeconds));
      res.setHeader('X-RateLimit-Limit', options.max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - count));
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

      if (count > options.max) {
        metricsRegistry.increment('rateLimitExceeded', 1, { restaurantId, requestId });
        logger.warn('Rate limit exceeded', { category, ip, uid, restaurantId, count, max: options.max, requestId });

        return res.status(429).json({
          error: 'RATE_LIMIT_EXCEEDED',
          message: options.message || 'Muitas requisições. Por favor, tente novamente mais tarde.',
          retryAfter: Math.max(1, retryAfterSeconds),
          requestId
        });
      }

      return next();
    } catch (err: any) {
      logger.error('Error in rate limiter middleware', { error: err?.message, stack: err?.stack });
      return next();
    }
  };
}
