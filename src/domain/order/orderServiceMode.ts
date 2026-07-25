import { OrderSource } from './orderSource';

export type OrderServiceMode =
  | 'DELIVERY'
  | 'PICKUP'
  | 'DINE_IN'
  | 'COUNTER';

export function normalizeOrderServiceMode(order: any): OrderServiceMode {
  if (!order) return 'DELIVERY';

  // Check if it's explicitly table context or table number exists
  const hasTable = Boolean(order.mesa || order.tableNumber || order.num_mesa || order.tableContext?.tableId);
  const source = String(order.source || order.origem || order.tipo_pedido || order.orderType || '').toUpperCase().trim();

  if (hasTable || source === 'TABLE' || source === 'WAITER') {
    return 'DINE_IN';
  }

  if (source === 'TAKEAWAY' || source === 'PICKUP' || order.deliveryType === 'pickup' || order.retirada === true) {
    return 'PICKUP';
  }

  if (source === 'COUNTER') {
    return 'COUNTER';
  }

  return 'DELIVERY';
}
