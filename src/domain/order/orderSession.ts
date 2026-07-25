export type TableSessionStatus =
  | 'OPEN'
  | 'AWAITING_PAYMENT'
  | 'CLOSED'
  | 'CANCELLED';

export type TableStatus =
  | 'AVAILABLE'
  | 'OCCUPIED'
  | 'AWAITING_PAYMENT'
  | 'CLEANING'
  | 'BLOCKED';

export type KitchenItemStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PREPARING'
  | 'READY'
  | 'SERVED'
  | 'CANCELLED';

export type OrderRoundStatus =
  | 'DRAFT'
  | 'SENT'
  | 'CANCELLED';
