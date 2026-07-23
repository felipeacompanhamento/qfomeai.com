import { Request } from 'express';

export type ExternalAppStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type ExternalAuthMode = 'JWT_HMAC' | 'JWT_PUBLIC_KEY';

export interface ExternalDeliveryApp {
  appId: string;
  name: string;
  status: ExternalAppStatus;
  authenticationMode: ExternalAuthMode;
  secretHash?: string;
  publicKeyPem?: string;
  keyId?: string;
  issuer: string;
  audience: string;
  allowedScopes: string[];
  rateLimitPerMinute: number;
  createdAt: any; // Firestore Timestamp / Date
  updatedAt: any;
  lastUsedAt?: any;
  suspendedAt?: any;
  revokedAt?: any;
  credentialVersion: number;
}

export interface ExternalDriverJwtPayload {
  iss: string;
  aud: string | string[];
  sub: string; // Driver identity subject
  appId: string;
  externalDriverId: string;
  driverDisplayName?: string;
  scopes: string[];
  iat: number;
  exp: number;
  jti: string;
  credentialVersion: number;
}

export interface ExternalAuthenticatedIdentity {
  appId: string;
  externalDriverId: string;
  subject: string;
  driverDisplayName?: string;
  scopes: string[];
  tokenId: string;
  credentialVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      externalIdentity?: ExternalAuthenticatedIdentity;
    }
  }
}

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  requestId: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  requestId: string;
}

export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_EXTERNAL_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'INVALID_ISSUER'
  | 'INVALID_AUDIENCE'
  | 'INVALID_APP'
  | 'APP_SUSPENDED'
  | 'APP_REVOKED'
  | 'CREDENTIAL_VERSION_MISMATCH'
  | 'INSUFFICIENT_SCOPE'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'INVALID_RESTAURANT'
  | 'FORBIDDEN'
  | 'RATE_LIMIT_EXCEEDED'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_DELIVERY'
  | 'ORDER_NOT_ELIGIBLE'
  | 'ORDER_ALREADY_ASSIGNED'
  | 'CLAIM_TOKEN_GENERATION_FAILED'
  | 'CLAIM_TOKEN_REVOKED'
  | 'CLAIM_TOKEN_EXPIRED'
  | 'CLAIM_TOKEN_NOT_FOUND'
  | 'INVALID_CLAIM_TOKEN';
