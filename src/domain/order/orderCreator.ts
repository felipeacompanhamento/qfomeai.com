export type OrderCreatorType =
  | 'CUSTOMER'
  | 'RESTAURANT'
  | 'WAITER'
  | 'SYSTEM';

export interface OrderCreatedBy {
  type: OrderCreatorType;
  userId?: string;
  name?: string;
}

export function normalizeOrderCreatedBy(order: any): OrderCreatedBy {
  if (!order) {
    return { type: 'SYSTEM' };
  }

  if (order.createdBy && typeof order.createdBy === 'object') {
    return {
      type: order.createdBy.type || 'SYSTEM',
      userId: order.createdBy.userId,
      name: order.createdBy.name
    };
  }

  // Fallback for older orders
  if (order.cliente_id || order.clientId || order.customerId) {
    return {
      type: 'CUSTOMER',
      userId: order.cliente_id || order.clientId || order.customerId,
      name: order.cliente_nome || order.customerName || order.nome_cliente
    };
  }

  // Check if it was created by restaurant admin
  if (order.created_by_restaurant === true || order.createdByRestaurant === true || order.restaurantUserId) {
    return {
      type: 'RESTAURANT',
      userId: order.restaurantUserId,
      name: order.restaurantUserName || 'Administração'
    };
  }

  return { type: 'SYSTEM' };
}
