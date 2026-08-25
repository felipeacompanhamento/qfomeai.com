export type OrderOrigem = 'DELIVERY' | 'BALCAO' | 'GARCOM' | 'TOTEM';

export enum OrderOrigemEnum {
  DELIVERY = 'DELIVERY',
  BALCAO = 'BALCAO',
  GARCOM = 'GARCOM',
  TOTEM = 'TOTEM'
}

export type OrderSource =
  | 'DELIVERY'
  | 'TAKEAWAY'
  | 'COUNTER'
  | 'WAITER'
  | 'TABLE'
  | 'ONLINE_APP'
  | 'MANUAL'
  | 'BALCAO'
  | 'GARCOM'
  | 'TOTEM';

/**
 * Normaliza e resolve a origem do pedido garantindo compatibilidade com pedidos legados e novos.
 * Valores padronizados: DELIVERY, BALCAO, GARCOM, TOTEM
 */
export function normalizeOrderOrigem(order: any): OrderOrigem {
  if (!order) return 'DELIVERY';

  const rawOrigem = String(
    order.origem || 
    order.origin || 
    order.source || 
    order.tipo_pedido || 
    order.orderType || 
    ''
  ).toUpperCase().trim();

  if (rawOrigem === 'DELIVERY') return 'DELIVERY';
  if (rawOrigem === 'BALCAO' || rawOrigem === 'BALCÃO' || rawOrigem === 'COUNTER') return 'BALCAO';
  if (rawOrigem === 'GARCOM' || rawOrigem === 'GARÇOM' || rawOrigem === 'WAITER' || rawOrigem === 'TABLE' || rawOrigem === 'MESA') return 'GARCOM';
  if (rawOrigem === 'TOTEM' || rawOrigem === 'KIOSK' || rawOrigem === 'AUTOATENDIMENTO') return 'TOTEM';

  // Fallback seguro para pedidos legados sem campo de origem
  if (Boolean(order.mesa || order.tableNumber || order.num_mesa || order.tabId || order.comanda_id)) {
    return 'GARCOM';
  }

  if (order.counterContext || order.tipo_entrega === 'balcao' || order.tipo_entrega === 'consumo_local') {
    return 'BALCAO';
  }

  return 'DELIVERY';
}
