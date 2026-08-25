import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface LogContext {
  requestId: string;
  restaurantId?: string;
  uid?: string;
  perfil?: string;
}

export const loggerStorage = new AsyncLocalStorage<LogContext>();

const baseLogger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: {
    env: process.env.NODE_ENV || 'development'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

const SENSITIVE_KEYS = new Set([
  'token', 'senha', 'password', 'cpf', 'cpfcompleto', 'cpf_completo',
  'telefone', 'phone', 'celular', 'chavepix', 'pixkey', 'pix_key', 'chave_pix',
  'cookie', 'cookies', 'authorization', 'auth', 'bearer', 'secret', 'client_secret',
  'clientsecret', 'accesstoken', 'access_token', 'senha_hash', 'passwordhash',
  'password_hash', 'latitude', 'longitude', 'lat', 'lng', 'coordinates', 'coords',
  'geolocation', 'payload_completo', 'user_completo', 'credit_card', 'cartao',
  'cvv', 'card_number', 'cardnumber', 'security_code'
]);

export function sanitizeLogData(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item));
  }

  if (data instanceof Error) {
    return {
      message: data.message,
      code: (data as any).code,
      status: (data as any).status,
      stack: data.stack // Preserve stack trace only for internal log of error
    };
  }

  if (typeof data === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      
      let isSensitive = false;
      for (const sensitiveKey of SENSITIVE_KEYS) {
        if (lowerKey === sensitiveKey || lowerKey.includes(sensitiveKey)) {
          isSensitive = true;
          break;
        }
      }

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (lowerKey === 'user' || lowerKey === 'usuario') {
        if (value && typeof value === 'object') {
          const u: any = value;
          sanitized[key] = {
            uid: u.uid || u.id,
            email: u.email,
            tipo_usuario: u.tipo_usuario || u.role
          };
        } else {
          sanitized[key] = '[REDACTED]';
        }
      } else if (lowerKey === 'payment' || lowerKey === 'pagamento' || lowerKey === 'payments' || lowerKey === 'pagamentos') {
        if (Array.isArray(value)) {
          sanitized[key] = value.map((p: any) => ({
            id: p.id,
            amount: p.amount,
            status: p.status,
            paymentMethodId: p.paymentMethodId
          }));
        } else if (value && typeof value === 'object') {
          const p: any = value;
          sanitized[key] = {
            id: p.id,
            amount: p.amount,
            status: p.status,
            paymentMethodId: p.paymentMethodId
          };
        } else {
          sanitized[key] = '[REDACTED]';
        }
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }
    return sanitized;
  }

  return data;
}

export const logger = {
  debug(message: string, context?: any) {
    const store = loggerStorage.getStore() || {};
    const sanitizedContext = sanitizeLogData(context);
    baseLogger.debug({ ...store, ...sanitizedContext }, message);
  },
  info(message: string, context?: any) {
    const store = loggerStorage.getStore() || {};
    const sanitizedContext = sanitizeLogData(context);
    baseLogger.info({ ...store, ...sanitizedContext }, message);
  },
  warn(message: string, context?: any) {
    const store = loggerStorage.getStore() || {};
    const sanitizedContext = sanitizeLogData(context);
    baseLogger.warn({ ...store, ...sanitizedContext }, message);
  },
  error(message: string, context?: any) {
    const store = loggerStorage.getStore() || {};
    const sanitizedContext = sanitizeLogData(context);
    baseLogger.error({ ...store, ...sanitizedContext }, message);
  },
  fatal(message: string, context?: any) {
    const store = loggerStorage.getStore() || {};
    const sanitizedContext = sanitizeLogData(context);
    baseLogger.fatal({ ...store, ...sanitizedContext }, message);
  }
};

export function updateLogContext(updates: Partial<LogContext>) {
  const store = loggerStorage.getStore();
  if (store) {
    Object.assign(store, updates);
  }
}

export function requestIDMiddleware(req: Request, res: Response, next: NextFunction) {
  let requestId = req.get('X-Request-ID');
  
  const isValid = requestId && 
                  typeof requestId === 'string' && 
                  /^[a-zA-Z0-9_\-]+$/.test(requestId) && 
                  requestId.length >= 8 && 
                  requestId.length <= 64;
  
  if (!isValid) {
    requestId = 'req_' + crypto.randomBytes(8).toString('hex');
  }

  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId!);

  const context: LogContext = {
    requestId: requestId!
  };

  loggerStorage.run(context, () => {
    next();
  });
}

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const url = req.originalUrl || req.url;
  // Only log API endpoints to avoid logging static assets, Vite internal files, or development modules
  if (!url.startsWith('/api/')) {
    return next();
  }

  const start = process.hrtime();
  
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationMs = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
    
    logger.info(`Request completed: ${req.method} ${url}`, {
      metodo: req.method,
      rota: req.route?.path || url,
      codigoHTTP: res.statusCode,
      duracao: parseFloat(durationMs),
      ambiente: process.env.NODE_ENV || 'development'
    });
  });

  next();
}
