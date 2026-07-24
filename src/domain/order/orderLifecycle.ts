export type OrderStatus =
  | 'NEW'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FINALIZED'
  | 'CANCELLED';

export type DeliveryStatus =
  | 'UNASSIGNED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';

export type FinancialSettlementStatus =
  | 'NOT_REQUIRED'
  | 'PENDING_COLLECTION'
  | 'PENDING_RESTAURANT_CONFIRMATION'
  | 'SETTLED'
  | 'CANCELLED';

export type OrderActor = 'CUSTOMER' | 'RESTAURANT' | 'DRIVER' | 'SYSTEM';

export type SettlementResponsibility = 'DRIVER' | 'RESTAURANT' | 'ONLINE_GATEWAY';

export interface CanonicalOrderState {
  orderStatus: OrderStatus;
  deliveryStatus: DeliveryStatus;
  financialSettlementStatus: FinancialSettlementStatus;
}

export type OrderAction =
  | 'ACCEPT_DELIVERY'
  | 'REJECT_DELIVERY'
  | 'START_DELIVERY'
  | 'CONFIRM_DELIVERY'
  | 'REPORT_FAILED_DELIVERY'
  | 'CONFIRM_ORDER'
  | 'START_PREPARATION'
  | 'MARK_READY'
  | 'ASSIGN_DRIVER'
  | 'REVIEW_DRIVER_PAYMENT'
  | 'CONFIRM_FINANCIAL_SETTLEMENT'
  | 'FINALIZE_ORDER'
  | 'CANCEL_ORDER';

const LEGACY_ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  novo: 'NEW',
  new: 'NEW',
  pending: 'NEW',
  pendente: 'NEW',
  waiting: 'NEW',
  confirmed: 'CONFIRMED',
  confirmado: 'CONFIRMED',
  aceito: 'CONFIRMED',
  preparing: 'PREPARING',
  cozinha: 'PREPARING',
  preparo: 'PREPARING',
  in_preparation: 'PREPARING',
  ready: 'READY',
  pronto: 'READY',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  em_entrega: 'OUT_FOR_DELIVERY',
  despachado: 'OUT_FOR_DELIVERY',
  entrega: 'OUT_FOR_DELIVERY',
  delivering: 'OUT_FOR_DELIVERY',
  em_transito: 'OUT_FOR_DELIVERY',
  em_trânsito: 'OUT_FOR_DELIVERY',
  saiu_para_entrega: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  entregue: 'DELIVERED',
  delivered_pending_settlement: 'DELIVERED',
  completed: 'FINALIZED',
  finalized: 'FINALIZED',
  finalizado: 'FINALIZED',
  finished: 'FINALIZED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  cancelado: 'CANCELLED',
  rejeitado: 'CANCELLED'
};

const LEGACY_DELIVERY_STATUS_MAP: Record<string, DeliveryStatus> = {
  unassigned: 'UNASSIGNED',
  sem_entregador: 'UNASSIGNED',
  waiting: 'ASSIGNED',
  pending: 'ASSIGNED',
  assigned: 'ASSIGNED',
  atribuido: 'ASSIGNED',
  pendente_aceite: 'ASSIGNED',
  accepted: 'ACCEPTED',
  aceito: 'ACCEPTED',
  picked_up: 'IN_TRANSIT',
  out_for_delivery: 'IN_TRANSIT',
  delivering: 'IN_TRANSIT',
  in_transit: 'IN_TRANSIT',
  em_transito: 'IN_TRANSIT',
  em_trânsito: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  entregue: 'DELIVERED',
  failed: 'FAILED',
  falhou: 'FAILED',
  nao_entregue: 'FAILED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
  cancelado: 'CANCELLED'
};

const LEGACY_FINANCIAL_STATUS_MAP: Record<string, FinancialSettlementStatus> = {
  not_required: 'NOT_REQUIRED',
  pago_online: 'NOT_REQUIRED',
  online: 'NOT_REQUIRED',
  pending_collection: 'PENDING_COLLECTION',
  pending: 'PENDING_COLLECTION',
  pendente: 'PENDING_COLLECTION',
  cobrança_na_entrega: 'PENDING_COLLECTION',
  cobranca_na_entrega: 'PENDING_COLLECTION',
  pending_restaurant_confirmation: 'PENDING_RESTAURANT_CONFIRMATION',
  awaiting_driver_settlement: 'PENDING_RESTAURANT_CONFIRMATION',
  delivered_pending_settlement: 'PENDING_RESTAURANT_CONFIRMATION',
  aguardando_conferencia: 'PENDING_RESTAURANT_CONFIRMATION',
  settled: 'SETTLED',
  finalizado: 'SETTLED',
  pago: 'SETTLED',
  conferido: 'SETTLED',
  cancelled: 'CANCELLED',
  cancelado: 'CANCELLED'
};

/**
  Normalizes raw order status across legacy fields and new canonical field
 */
export function normalizeOrderStatus(order: any): OrderStatus {
  if (!order) return 'NEW';

  const rawCanonical = order.orderStatus || order.canonicalStatus;
  if (rawCanonical && ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FINALIZED', 'CANCELLED'].includes(rawCanonical)) {
    return rawCanonical as OrderStatus;
  }

  // Explicit settlement finished check
  if (
    order.financialSettlementStatus === 'SETTLED' ||
    order.paymentStatus === 'SETTLED' ||
    order.status === 'finalizado' ||
    order.status === 'completed' ||
    order.status === 'finalized'
  ) {
    return 'FINALIZED';
  }

  // Explicit delivered check
  if (
    order.status === 'delivered_pending_settlement' ||
    order.status === 'entregue' ||
    order.status === 'delivered' ||
    order.deliveryStatus === 'DELIVERED' ||
    Boolean(order.driverPaymentReport) ||
    Boolean(order.deliveredAt)
  ) {
    if (order.financialSettlementStatus === 'SETTLED' || order.pago === true) {
      return 'FINALIZED';
    }
    return 'DELIVERED';
  }

  const legacyStr = String(order.status || order.status_pedido || 'novo').toLowerCase().trim();
  const mappedStatus = LEGACY_ORDER_STATUS_MAP[legacyStr];
  if (mappedStatus) {
    return mappedStatus;
  }

  // Active delivery check as fallback: never return 'NEW' if there is evidence of delivery activity
  const hasDriver = Boolean(order.driverId || order.assignedDriverId || order.entregador_id);
  const activeDeliveryStatus = ['ASSIGNED', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED'].includes(order.deliveryStatus || '');
  const activeLegacyDeliveryStatus = ['assigned', 'accepted', 'out_for_delivery', 'delivering', 'delivered'].includes(String(order.status_entrega || '').toLowerCase());
  
  if (hasDriver || activeDeliveryStatus || activeLegacyDeliveryStatus) {
    console.warn(`[Order Lifecycle] Unknown order status '${order.status}' but active delivery detected. Mapping to OUT_FOR_DELIVERY.`);
    return 'OUT_FOR_DELIVERY';
  }

  return 'NEW';
}

/**
  Normalizes delivery status across legacy fields and new canonical field
  GUARANTEE: If delivered evidence exists (driverPaymentReport, deliveredAt, status === 'entregue'),
  deliveryStatus MUST be 'DELIVERED'. It will NEVER revert to ASSIGNED or ACCEPTED.
 */
export function normalizeDeliveryStatus(order: any): DeliveryStatus {
  if (!order) return 'UNASSIGNED';

  const rawCanonical = order.deliveryStatus || order.status_entrega_canonical;
  
  // Hard evidence check: delivered
  if (
    rawCanonical === 'DELIVERED' ||
    order.status === 'delivered_pending_settlement' ||
    order.status === 'entregue' ||
    order.status === 'delivered' ||
    Boolean(order.driverPaymentReport) ||
    Boolean(order.deliveredAt)
  ) {
    return 'DELIVERED';
  }

  if (rawCanonical && ['UNASSIGNED', 'ASSIGNED', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'].includes(rawCanonical)) {
    return rawCanonical as DeliveryStatus;
  }

  const legacyStr = String(order.status_entrega || order.driverStatus || '').toLowerCase().trim();
  if (legacyStr && LEGACY_DELIVERY_STATUS_MAP[legacyStr]) {
    return LEGACY_DELIVERY_STATUS_MAP[legacyStr];
  }

  // Fallback based on driver assignment
  const hasDriver = Boolean(order.assignedDriverId || order.driverId || order.entregador_id);
  if (!hasDriver) return 'UNASSIGNED';

  if (order.status === 'despachado' || order.status === 'entrega' || order.status === 'out_for_delivery') {
    return 'IN_TRANSIT';
  }

  return 'ASSIGNED';
}

/**
  Normalizes financial settlement status across legacy fields and new canonical field
 */
export function normalizeFinancialSettlementStatus(order: any): FinancialSettlementStatus {
  if (!order) return 'PENDING_COLLECTION';

  const rawCanonical = order.financialSettlementStatus || order.paymentStatus;
  if (rawCanonical && ['NOT_REQUIRED', 'PENDING_COLLECTION', 'PENDING_RESTAURANT_CONFIRMATION', 'SETTLED', 'CANCELLED'].includes(rawCanonical)) {
    return rawCanonical as FinancialSettlementStatus;
  }

  // Already settled check
  if (order.pago === true && (order.status === 'finalizado' || order.status === 'completed' || order.financialSettlementStatus === 'SETTLED')) {
    return 'SETTLED';
  }

  const orderStatus = normalizeOrderStatus(order);
  const deliveryStatus = normalizeDeliveryStatus(order);

  // Is online payment where collection isn't required on delivery?
  const isOnlinePayment =
    order.forma_pagamento === 'pix_app' ||
    order.pagoOnline === true ||
    (order.pago === true && orderStatus !== 'DELIVERED' && !order.driverPaymentReport);

  if (isOnlinePayment && deliveryStatus !== 'DELIVERED') {
    return 'NOT_REQUIRED';
  }

  // Order delivered, pending restaurant confirmation
  if (
    deliveryStatus === 'DELIVERED' ||
    orderStatus === 'DELIVERED' ||
    Boolean(order.driverPaymentReport)
  ) {
    if (order.settledAt || order.restaurantPaymentConfirmation || (order.pago === true && orderStatus === 'FINALIZED')) {
      return 'SETTLED';
    }
    return 'PENDING_RESTAURANT_CONFIRMATION';
  }

  const legacyStr = String(order.status_financeiro || '').toLowerCase().trim();
  return LEGACY_FINANCIAL_STATUS_MAP[legacyStr] || 'PENDING_COLLECTION';
}

/**
  Returns full canonical tuple for an order
 */
export function getCanonicalOrderState(order: any): CanonicalOrderState {
  return {
    orderStatus: normalizeOrderStatus(order),
    deliveryStatus: normalizeDeliveryStatus(order),
    financialSettlementStatus: normalizeFinancialSettlementStatus(order)
  };
}

/**
  Determines the correct Kanban column ID for the restaurant view
 */
export function getOrderKanbanColumn(order: any): string {
  const { orderStatus, deliveryStatus, financialSettlementStatus } = getCanonicalOrderState(order);

  // Histórico/Finalizado: 'FINALIZED', 'entregue', 'cancelado' (also settled)
  if (
    orderStatus === 'FINALIZED' || 
    orderStatus === 'CANCELLED' || 
    financialSettlementStatus === 'SETTLED' ||
    String(order?.status || '').toLowerCase() === 'finalizado' ||
    String(order?.status || '').toLowerCase() === 'cancelado'
  ) {
    return 'finalizado';
  }

  // Entrega: 'OUT_FOR_DELIVERY', 'saiu_para_entrega', status de entregador ativo (como 'ASSIGNED', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED' com confirmação pendente do restaurante, etc.)
  const hasActiveDelivery = 
    orderStatus === 'OUT_FOR_DELIVERY' ||
    ['ASSIGNED', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED'].includes(deliveryStatus) ||
    ['assigned', 'accepted', 'out_for_delivery', 'delivering', 'delivered'].includes(String(order?.status_entrega || '').toLowerCase()) ||
    String(order?.status || '').toLowerCase() === 'delivering' ||
    String(order?.status || '').toLowerCase() === 'entregue' ||
    String(order?.status || '').toLowerCase() === 'delivered' ||
    Boolean(order?.driverId || order?.assignedDriverId || order?.entregador_id);

  if (hasActiveDelivery) {
    return 'entrega';
  }

  // Cozinha: 'PREPARING', 'em_preparo', 'READY', 'pronto'
  if (
    orderStatus === 'PREPARING' || 
    orderStatus === 'READY' ||
    ['preparing', 'cozinha', 'preparo', 'in_preparation', 'ready', 'pronto'].includes(String(order?.status || '').toLowerCase())
  ) {
    return 'cozinha';
  }

  // Confirmado: 'CONFIRMED', 'confirmado', 'aceito'
  if (
    orderStatus === 'CONFIRMED' ||
    ['confirmed', 'confirmado', 'aceito'].includes(String(order?.status || '').toLowerCase())
  ) {
    return 'confirmado';
  }

  // Novo: 'NEW', 'novo', 'pendente' (sem entrega ativa)
  if (
    orderStatus === 'NEW' ||
    ['new', 'novo', 'pending', 'pendente', 'waiting'].includes(String(order?.status || '').toLowerCase())
  ) {
    return 'novo';
  }

  // Fallback to "entrega" if there is any doubt or unknown status, never default to "Novo"
  console.warn(`[Kanban] Unknown order state for order ${order?.id}, placing in 'entrega' rather than 'novo'`, order);
  return 'entrega';
}

/**
  Helper checking if driver can confirm delivery
 */
export function canDriverConfirmDelivery(order: any): boolean {
  const { deliveryStatus, orderStatus } = getCanonicalOrderState(order);
  return (
    (deliveryStatus === 'IN_TRANSIT' || deliveryStatus === 'ACCEPTED' || deliveryStatus === 'ASSIGNED') &&
    orderStatus !== 'FINALIZED' &&
    orderStatus !== 'CANCELLED'
  );
}

/**
  Helper checking if restaurant can perform financial settlement
 */
export function canRestaurantSettleOrder(order: any): boolean {
  const { orderStatus, deliveryStatus, financialSettlementStatus } = getCanonicalOrderState(order);
  return (
    (orderStatus === 'DELIVERED' || deliveryStatus === 'DELIVERED' || Boolean(order?.driverPaymentReport)) &&
    financialSettlementStatus === 'PENDING_RESTAURANT_CONFIRMATION'
  );
}

/**
  Helper checking if restaurant can finalize order directly
 */
export function canRestaurantFinalizeOrder(order: any): boolean {
  const { financialSettlementStatus } = getCanonicalOrderState(order);
  return financialSettlementStatus === 'SETTLED' || canRestaurantSettleOrder(order);
}

/**
  Returns available actions for a specific actor
 */
export function getAvailableOrderActions(order: any, actor: OrderActor): OrderAction[] {
  const state = getCanonicalOrderState(order);
  const actions: OrderAction[] = [];

  if (actor === 'DRIVER') {
    if (state.deliveryStatus === 'ASSIGNED') {
      actions.push('ACCEPT_DELIVERY', 'REJECT_DELIVERY');
    }
    if (state.deliveryStatus === 'ACCEPTED') {
      actions.push('START_DELIVERY');
    }
    if (state.deliveryStatus === 'IN_TRANSIT') {
      actions.push('CONFIRM_DELIVERY', 'REPORT_FAILED_DELIVERY');
    }
  }

  if (actor === 'RESTAURANT') {
    if (state.orderStatus === 'NEW') {
      actions.push('CONFIRM_ORDER', 'CANCEL_ORDER');
    }
    if (state.orderStatus === 'CONFIRMED') {
      actions.push('START_PREPARATION', 'ASSIGN_DRIVER', 'CANCEL_ORDER');
    }
    if (state.orderStatus === 'PREPARING') {
      actions.push('MARK_READY', 'ASSIGN_DRIVER', 'CANCEL_ORDER');
    }
    if (state.orderStatus === 'READY') {
      actions.push('ASSIGN_DRIVER', 'CANCEL_ORDER');
    }
    if (state.financialSettlementStatus === 'PENDING_RESTAURANT_CONFIRMATION') {
      actions.push('REVIEW_DRIVER_PAYMENT', 'CONFIRM_FINANCIAL_SETTLEMENT');
    }
    if (canRestaurantFinalizeOrder(order)) {
      actions.push('FINALIZE_ORDER');
    }
  }

  return actions;
}

/**
  Human-readable labels
 */
export function getOrderStatusLabel(order: any): string {
  const status = normalizeOrderStatus(order);
  const labels: Record<OrderStatus, string> = {
    NEW: 'Novo Pedido',
    CONFIRMED: 'Confirmado',
    PREPARING: 'Em Preparo',
    READY: 'Pronto para Retirada/Entrega',
    OUT_FOR_DELIVERY: 'Em Rota de Entrega',
    DELIVERED: 'Entregue',
    FINALIZED: 'Finalizado',
    CANCELLED: 'Cancelado'
  };
  return labels[status] || status;
}

export function getDeliveryStatusLabel(order: any): string {
  const status = normalizeDeliveryStatus(order);
  const labels: Record<DeliveryStatus, string> = {
    UNASSIGNED: 'Sem Entregador',
    ASSIGNED: 'Entregador Atribuído',
    ACCEPTED: 'Aceito pelo Entregador',
    IN_TRANSIT: 'Em Trânsito',
    DELIVERED: 'Entregue',
    FAILED: 'Entrega Não Realizada',
    CANCELLED: 'Entrega Cancelada'
  };
  return labels[status] || status;
}

export function getFinancialStatusLabel(order: any): string {
  const status = normalizeFinancialSettlementStatus(order);
  const labels: Record<FinancialSettlementStatus, string> = {
    NOT_REQUIRED: 'Pago Online / Sem Cobrança na Entrega',
    PENDING_COLLECTION: 'Cobrança Pendente na Entrega',
    PENDING_RESTAURANT_CONFIRMATION: 'Aguardando Conferência Financeira',
    SETTLED: 'Conferido e Baixado',
    CANCELLED: 'Cancelado'
  };
  return labels[status] || status;
}

/**
  Validates if a transition is permitted
 */
export function validateOrderTransition(
  currentState: CanonicalOrderState,
  targetOrderStatus: OrderStatus,
  actor: OrderActor
): { valid: boolean; reason?: string } {
  if (actor === 'DRIVER') {
    if (targetOrderStatus === 'FINALIZED') {
      return { valid: false, reason: 'O entregador não possui permissão para finalizar o pedido. O restaurante deve realizar a conferência.' };
    }
  }
  return { valid: true };
}

/**
  Determines settlement responsibility for a payment method ID
 */
export function getSettlementResponsibility(methodId: string): SettlementResponsibility {
  const normalized = String(methodId || '').toLowerCase();

  if (normalized.includes('pix_app') || normalized.includes('online') || normalized.includes('cartao_app')) {
    return 'ONLINE_GATEWAY';
  }
  if (normalized.includes('pix_restaurante') || normalized.includes('pix_direto')) {
    return 'RESTAURANT';
  }
  // Cash or Card Machine held by Driver
  return 'DRIVER';
}

/**
  Calculates driver cash accountability (physical money/cards to hand over to restaurant)
 */
export function getDriverCashAccountability(order: any): {
  driverAccountableAmount: number;
  restaurantDirectAmount: number;
  onlineGatewayAmount: number;
  totalReported: number;
  netAmountReceived: number;
  changeAmount: number;
} {
  const report = order?.driverPaymentReport;
  const orderTotal = Number(order?.valor_total || order?.total || 0);

  if (!report) {
    return {
      driverAccountableAmount: orderTotal,
      restaurantDirectAmount: 0,
      onlineGatewayAmount: 0,
      totalReported: orderTotal,
      netAmountReceived: orderTotal,
      changeAmount: 0
    };
  }

  let driverAccountableAmount = 0;
  let restaurantDirectAmount = 0;
  let onlineGatewayAmount = 0;

  const methods = report.paymentMethods || [];
  if (methods.length > 0) {
    for (const pm of methods) {
      const amt = Number(pm.amount || 0);
      const resp = pm.settlementResponsibility || getSettlementResponsibility(pm.methodId);

      if (resp === 'DRIVER') {
        driverAccountableAmount += amt;
      } else if (resp === 'RESTAURANT') {
        restaurantDirectAmount += amt;
      } else {
        onlineGatewayAmount += amt;
      }
    }
  } else {
    driverAccountableAmount = Number(report.netAmountReceived || report.amountDue || orderTotal);
  }

  const changeAmount = Number(report.changeAmount || 0);
  // Subtract change given from cash accountable
  const netDriverCashAccountable = Math.max(0, driverAccountableAmount - changeAmount);

  return {
    driverAccountableAmount: netDriverCashAccountable,
    restaurantDirectAmount,
    onlineGatewayAmount,
    totalReported: Number(report.totalReported || orderTotal),
    netAmountReceived: Number(report.netAmountReceived || orderTotal),
    changeAmount
  };
}

/**
  Calculates the exact pending settlement amount for a driver for a single order
 */
export function getDriverPendingSettlementAmount(order: any): number {
  const financialStatus = normalizeFinancialSettlementStatus(order);
  const deliveryStatus = normalizeDeliveryStatus(order);

  if (deliveryStatus !== 'DELIVERED' || financialStatus !== 'PENDING_RESTAURANT_CONFIRMATION') {
    return 0;
  }

  const accountability = getDriverCashAccountability(order);
  return accountability.driverAccountableAmount;
}

/**
  Aggregates driver pending settlement summary across a set of orders for restaurant view
 */
export function getRestaurantPendingDriverSettlementSummary(orders: any[]): {
  totalAmount: number;
  orderCount: number;
  driverCount: number;
  byDriver: Array<{
    driverId: string;
    driverName: string;
    amount: number;
    orderCount: number;
  }>;
} {
  const driverMap = new Map<string, { driverId: string; driverName: string; amount: number; orderCount: number }>();
  let totalAmount = 0;
  let orderCount = 0;

  // Deduplicate orders by ID first
  const uniqueOrders = new Map<string, any>();
  for (const ord of orders || []) {
    if (ord && ord.id) {
      uniqueOrders.set(ord.id, ord);
    }
  }

  for (const order of uniqueOrders.values()) {
    const pendingAmount = getDriverPendingSettlementAmount(order);
    if (pendingAmount > 0) {
      totalAmount += pendingAmount;
      orderCount += 1;

      const driverId = order.assignedDriverId || order.driverId || order.entregador_id || 'unassigned';
      const driverName = order.assignedDriverName || order.driverName || order.entregador_nome || 'Entregador';

      const existing = driverMap.get(driverId) || {
        driverId,
        driverName,
        amount: 0,
        orderCount: 0
      };

      existing.amount += pendingAmount;
      existing.orderCount += 1;
      driverMap.set(driverId, existing);
    }
  }

  return {
    totalAmount,
    orderCount,
    driverCount: driverMap.size,
    byDriver: Array.from(driverMap.values())
  };
}
