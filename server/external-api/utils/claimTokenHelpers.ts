/**
 * Utility functions for Delivery Claim Tokens logic.
 */

/**
 * Validates if an order is a delivery order based on various legacy/current fields.
 */
export function isDeliveryOrder(orderData: any): boolean {
  if (!orderData) return false;

  // Explicit pickup indicators
  if (orderData.retirada === true) return false;
  if (
    orderData.tipo_entrega === 'retirada' ||
    orderData.deliveryType === 'pickup' ||
    orderData.delivery_method === 'pickup' ||
    orderData.tipoPedido === 'retirada' ||
    orderData.tipo === 'retirada'
  ) {
    return false;
  }

  // Delivery indicators
  if (
    orderData.tipo_entrega === 'entrega' ||
    orderData.tipo_entrega === 'delivery' ||
    orderData.deliveryType === 'delivery' ||
    orderData.delivery_method === 'delivery' ||
    orderData.tipoPedido === 'delivery' ||
    orderData.tipoPedido === 'entrega' ||
    orderData.tipo === 'entrega' ||
    orderData.endereco // Has a delivery address
  ) {
    return true;
  }

  // Default assumption if not explicitly marked pickup and has address/entrega field
  return !orderData.retirada;
}

/**
 * Checks whether an order is currently eligible for generating or holding a claim token.
 */
export function isOrderEligibleForDeliveryClaim(orderData: any): { eligible: boolean; reason?: string } {
  if (!orderData) {
    return { eligible: false, reason: 'ORDER_NOT_FOUND' };
  }

  if (!isDeliveryOrder(orderData)) {
    return { eligible: false, reason: 'ORDER_NOT_DELIVERY' };
  }

  const normalizedStatus = String(orderData.status || '').toLowerCase().trim();
  const ineligibleStatuses = ['cancelado', 'rejeitado', 'entregue', 'finalizado', 'cancelled', 'rejected', 'delivered', 'finished'];

  if (ineligibleStatuses.includes(normalizedStatus)) {
    return { eligible: false, reason: 'ORDER_NOT_ELIGIBLE' };
  }

  // Check if driver is already assigned
  const hasAssignedDriver = !!(
    orderData.assignedDriverId ||
    orderData.driverId ||
    orderData.entregador_id ||
    orderData.external_delivery_assignment ||
    orderData.external_driver_id
  );

  if (hasAssignedDriver) {
    return { eligible: false, reason: 'ORDER_ALREADY_ASSIGNED' };
  }

  return { eligible: true };
}

/**
 * Resolves or builds the public order number according to specified priority rules.
 */
export function resolvePublicOrderNumber(orderId: string, orderData: any): string {
  if (!orderData) {
    return orderId.slice(-6).toUpperCase();
  }

  const candidate =
    orderData.publicOrderNumber ||
    orderData.numero_pedido ||
    orderData.orderNumber ||
    orderData.numero;

  if (candidate && typeof candidate === 'string' && candidate.trim().length > 0) {
    return String(candidate).trim();
  }

  if (typeof candidate === 'number') {
    return String(candidate);
  }

  return orderId.slice(-6).toUpperCase();
}

/**
 * Returns the configured Delivery Claim Token TTL in seconds.
 * Bounds: Min 300s (5m), Max 172800s (48h), Default 86400s (24h).
 */
export function getClaimTokenTTLSeconds(): number {
  const envVal = process.env.DELIVERY_CLAIM_TOKEN_TTL_SECONDS;
  if (!envVal) return 86400;

  const parsed = parseInt(envVal, 10);
  if (isNaN(parsed) || parsed < 300 || parsed > 172800) {
    return 86400;
  }

  return parsed;
}
