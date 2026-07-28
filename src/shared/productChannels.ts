import {
  normalizeProductSalesChannels,
  getProductPriceForChannel,
  isProductAvailableForChannel,
  resolveCounterUnitPriceCents,
  resolveChannelUnitPriceCents
} from '../domain/product/productChannels';

export function normalizeProductSalesChannelsData(rawProduct: any) {
  return normalizeProductSalesChannels(rawProduct);
}

export function isProductAvailableForChannelData(rawProduct: any, channel: 'counter' | 'delivery' | 'waiter' = 'counter'): boolean {
  return isProductAvailableForChannel(rawProduct, channel);
}

export function getProductPriceForChannelData(rawProduct: any, channel: 'counter' | 'delivery' | 'waiter' = 'counter'): number {
  return getProductPriceForChannel(rawProduct, channel);
}

export { resolveCounterUnitPriceCents, resolveChannelUnitPriceCents };
