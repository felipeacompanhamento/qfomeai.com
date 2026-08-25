/**
 * Definição e utilitários para origem do pedido (Delivery, Balcão, Garçom, Mesa, Retirada)
 * Preparado para futuras expansões do Qfomeai
 */

import { OrderSource, OrderOrigem, normalizeOrderOrigem, isGarcomOrder } from '../../../../domain/order/orderSource';

export type { OrderSource, OrderOrigem };
export { normalizeOrderOrigem, isGarcomOrder };


export interface OrderSourceDetails {
  source: OrderSource;
  label: string;
  shortLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  iconName: string;
}

/**
 * Mapeia e normaliza a origem do pedido a partir dos campos do Firestore
 */
export function getOrderSourceDetails(order: any): OrderSourceDetails {
  const orig = String(
    order.origem || 
    order.origin || 
    order.source || 
    order.tipo_pedido || 
    order.orderType || 
    ''
  ).toLowerCase().trim();

  const isTotem = orig.includes('totem') || orig.includes('kiosk') || orig.includes('autoatendimento');
  const isTable = Boolean(order.mesa || order.tableNumber || order.num_mesa);
  const isCounter = orig.includes('balcao') || orig.includes('counter') || orig === 'balcão';
  const isWaiter = orig.includes('garcom') || orig.includes('waiter') || orig === 'garçom';
  const isTakeaway = orig.includes('retirada') || orig.includes('takeaway') || orig.includes('pickup');

  if (isTotem) {
    return {
      source: 'TOTEM',
      label: 'Totem',
      shortLabel: 'Totem',
      badgeBg: 'bg-purple-50',
      badgeText: 'text-purple-700',
      badgeBorder: 'border-purple-200',
      iconName: 'Tablet'
    };
  }

  if (isTable || orig.includes('mesa')) {
    const tableNum = order.mesa || order.tableNumber || order.num_mesa || '';
    return {
      source: 'TABLE',
      label: tableNum ? `Mesa ${tableNum}` : 'Mesa',
      shortLabel: tableNum ? `Mesa ${tableNum}` : 'Mesa',
      badgeBg: 'bg-stone-100',
      badgeText: 'text-stone-700',
      badgeBorder: 'border-stone-200',
      iconName: 'UtensilsCrossed'
    };
  }

  if (isWaiter) {
    return {
      source: 'WAITER',
      label: 'Garçom',
      shortLabel: 'Garçom',
      badgeBg: 'bg-stone-100',
      badgeText: 'text-stone-700',
      badgeBorder: 'border-stone-200',
      iconName: 'UserCheck'
    };
  }

  if (isCounter) {
    return {
      source: 'COUNTER',
      label: 'Balcão',
      shortLabel: 'Balcão',
      badgeBg: 'bg-stone-100',
      badgeText: 'text-stone-700',
      badgeBorder: 'border-stone-200',
      iconName: 'Store'
    };
  }

  if (isTakeaway) {
    return {
      source: 'TAKEAWAY',
      label: 'Para Retirada',
      shortLabel: 'Retirada',
      badgeBg: 'bg-blue-50',
      badgeText: 'text-blue-700',
      badgeBorder: 'border-blue-200',
      iconName: 'ShoppingBag'
    };
  }

  // Padrão: Delivery do App do Cliente
  return {
    source: 'DELIVERY',
    label: 'Delivery (App)',
    shortLabel: 'Delivery',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
    iconName: 'Truck'
  };
}
