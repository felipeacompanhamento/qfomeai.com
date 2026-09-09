/**
 * Definição e utilitários para origem e modalidade do pedido (Delivery, Balcão, Garçom, Mesa, Retirada, Totem)
 */

import { OrderSource, OrderOrigem, OrderModality, normalizeOrderOrigem, isGarcomOrder, getOrderModality } from '../../../../domain/order/orderSource';

export type { OrderSource, OrderOrigem, OrderModality };
export { normalizeOrderOrigem, isGarcomOrder, getOrderModality };

export interface OrderModalityDetails {
  modality: OrderModality;
  label: string;
  shortLabel: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  iconName: 'Utensils' | 'Store' | 'Bike' | 'Monitor';
  isDeliveryFlow: boolean;
  isTableModality: boolean;
  hasIndividualPayment: boolean;
}

/**
 * Retorna as configurações visuais e comportamentais da modalidade do pedido
 */
export function getOrderModalityDetails(order: any): OrderModalityDetails {
  const modality = getOrderModality(order);

  switch (modality) {
    case 'GARCOM_MESA':
      return {
        modality,
        label: 'GARÇOM • MESA',
        shortLabel: 'Garçom • Mesa',
        badgeBg: 'bg-emerald-700 text-white',
        badgeText: 'text-white',
        badgeBorder: 'border-emerald-700',
        iconName: 'Utensils',
        isDeliveryFlow: false,
        isTableModality: true,
        hasIndividualPayment: false
      };
    case 'BALCAO_RETIRADA':
      return {
        modality,
        label: 'BALCÃO • RETIRADA',
        shortLabel: 'Balcão • Retirada',
        badgeBg: 'bg-amber-600 text-white',
        badgeText: 'text-white',
        badgeBorder: 'border-amber-600',
        iconName: 'Store',
        isDeliveryFlow: false,
        isTableModality: false,
        hasIndividualPayment: true
      };
    case 'BALCAO_ENTREGA':
      return {
        modality,
        label: 'BALCÃO • ENTREGA',
        shortLabel: 'Balcão • Entrega',
        badgeBg: 'bg-blue-600 text-white',
        badgeText: 'text-white',
        badgeBorder: 'border-blue-600',
        iconName: 'Bike',
        isDeliveryFlow: true,
        isTableModality: false,
        hasIndividualPayment: true
      };
    case 'BALCAO_MESA':
      return {
        modality,
        label: 'BALCÃO • MESA',
        shortLabel: 'Balcão • Mesa',
        badgeBg: 'bg-teal-700 text-white',
        badgeText: 'text-white',
        badgeBorder: 'border-teal-700',
        iconName: 'Utensils',
        isDeliveryFlow: false,
        isTableModality: true,
        hasIndividualPayment: false
      };
    case 'TOTEM':
      return {
        modality,
        label: 'TOTEM',
        shortLabel: 'Totem',
        badgeBg: 'bg-stone-800 text-white',
        badgeText: 'text-white',
        badgeBorder: 'border-stone-800',
        iconName: 'Monitor',
        isDeliveryFlow: false,
        isTableModality: false,
        hasIndividualPayment: true
      };
    case 'DELIVERY':
    default:
      return {
        modality: 'DELIVERY',
        label: 'DELIVERY',
        shortLabel: 'Delivery',
        badgeBg: 'bg-sky-600 text-white',
        badgeText: 'text-white',
        badgeBorder: 'border-sky-600',
        iconName: 'Bike',
        isDeliveryFlow: true,
        isTableModality: false,
        hasIndividualPayment: true
      };
  }
}

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
 * Mapeia a origem do pedido garantindo retrocompatibilidade
 */
export function getOrderSourceDetails(order: any): OrderSourceDetails {
  const modDetails = getOrderModalityDetails(order);

  let source: OrderSource = 'DELIVERY';
  if (modDetails.modality === 'GARCOM_MESA') source = 'WAITER';
  else if (modDetails.modality === 'BALCAO_RETIRADA') source = 'TAKEAWAY';
  else if (modDetails.modality === 'BALCAO_ENTREGA') source = 'COUNTER';
  else if (modDetails.modality === 'BALCAO_MESA') source = 'TABLE';
  else if (modDetails.modality === 'TOTEM') source = 'TOTEM';

  return {
    source,
    label: modDetails.label,
    shortLabel: modDetails.label,
    badgeBg: modDetails.badgeBg,
    badgeText: modDetails.badgeText,
    badgeBorder: modDetails.badgeBorder,
    iconName: modDetails.iconName
  };
}
