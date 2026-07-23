export type OperationalDeliveryStatus = 
  | 'UNASSIGNED' 
  | 'ASSIGNED' 
  | 'ACCEPTED' 
  | 'REJECTED' 
  | 'IN_TRANSIT' 
  | 'DELIVERED' 
  | 'FAILED' 
  | 'CANCELLED';

export type CanonicalDeliveryStatus = 
  | 'UNASSIGNED' 
  | 'ASSIGNED' 
  | 'IN_TRANSIT' 
  | 'DELIVERED' 
  | 'FAILED';

export type FinancialDeliveryStatus = 
  | 'PENDING' 
  | 'PAID' 
  | 'COLLECTED_BY_DRIVER'
  | 'AWAITING_DRIVER_SETTLEMENT'
  | 'SETTLED' 
  | 'REFUNDED'
  | 'PAYMENT_NOT_COLLECTED';

export type LegacyStatusEntrega = 
  | 'waiting' 
  | 'out_for_delivery' 
  | 'delivered' 
  | 'failed';

export type LegacyOrderStatus = 
  | 'pendente' 
  | 'aceito' 
  | 'em preparo'
  | 'pronto' 
  | 'saiu_entrega' 
  | 'delivering' 
  | 'entregue' 
  | 'completed' 
  | 'cancelado';

export interface DeliveryAddress {
  rua?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  complemento?: string;
  referencia?: string;
  endereco?: string; // String fallback or concatenated address
}

export interface DeliverySnapshot {
  id: string; // Order ID
  orderId: string;
  restaurantId: string;
  driverId: string | null;
  assignedDriverId: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone?: string;
  endereco_entrega: DeliveryAddress | string;
  deliveryStatus: OperationalDeliveryStatus;
  canonicalStatus: CanonicalDeliveryStatus;
  paymentStatus: FinancialDeliveryStatus;
  status_entrega: LegacyStatusEntrega;
  status: LegacyOrderStatus;
  valor_total: number;
  valor_produtos: number;
  taxa_entrega: number;
  forma_pagamento: string;
  troco?: string | null;
  data_criacao: string;
  assignedAt?: string | null;
  acceptedAt?: string | null;
  startedAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  numero_pedido?: number | string;
}
