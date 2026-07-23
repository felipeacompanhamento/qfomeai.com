import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { isValidRequestId } from '../utils/externalValidation.js';

/**
 * Middleware to ensure every request has a valid X-Request-Id header and attaches it to req.requestId.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const headerValue = req.headers['x-request-id'];
  let requestId: string;

  if (typeof headerValue === 'string' && isValidRequestId(headerValue)) {
    requestId = headerValue;
  } else {
    requestId = crypto.randomUUID();
  }

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
