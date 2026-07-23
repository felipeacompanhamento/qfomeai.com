import { Timestamp } from 'firebase-admin/firestore';

export type DeliveryClaimStatus = 'ACTIVE' | 'CLAIMED' | 'EXPIRED' | 'REVOKED';

export type DeliveryClaimPurpose = 'DELIVERY_CLAIM';

export type DeliveryClaimTokenSource = 'RESTAURANT_PRINT' | 'RESTAURANT_PANEL' | 'SYSTEM';

export type DeliveryClaimRevocationReason =
  | 'REPRINT'
  | 'ORDER_CHANGED'
  | 'RESTAURANT_REQUEST'
  | 'SECURITY'
  | 'OTHER';

export interface DeliveryClaimTokenDoc {
  tokenHash: string;
  restaurantId: string;
  orderId: string;
  publicOrderNumber: string;
  purpose: DeliveryClaimPurpose;
  status: DeliveryClaimStatus;
  version: number;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  createdByUserId: string;

  revokedAt?: Timestamp;
  revokedByUserId?: string;
  revocationReason?: DeliveryClaimRevocationReason | string;

  claimedAt?: Timestamp;
  claimedByAppId?: string;
  claimedByExternalDriverId?: string;

  lastValidatedAt?: Timestamp;

  metadata?: {
    source: DeliveryClaimTokenSource;
    customNote?: string;
  };
}

export interface CreateDeliveryClaimTokenInput {
  restaurantId: string;
  orderId: string;
  createdByUserId: string;
  source?: DeliveryClaimTokenSource;
  expiresInSeconds?: number;
}

export interface CreateDeliveryClaimTokenResult {
  rawToken: string;
  tokenHash: string;
  version: number;
  expiresAt: Timestamp;
  publicOrderNumber: string;
}

export interface ValidateDeliveryClaimTokenResult {
  valid: boolean;
  tokenHash?: string;
  restaurantId?: string;
  orderId?: string;
  publicOrderNumber?: string;
  version?: number;
  expiresAt?: Timestamp;
  errorCode?: string;
  errorMessage?: string;
}

export interface OrderDeliveryClaimSummary {
  status: DeliveryClaimStatus;
  activeTokenHash?: string;
  activeTokenVersion?: number;
  tokenExpiresAt?: Timestamp;
  updatedAt: Timestamp;
}
