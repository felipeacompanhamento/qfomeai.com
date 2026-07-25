export type ProductSalesChannel =
  | 'delivery'
  | 'counter'
  | 'waiter';

export interface ProductSalesChannels {
  delivery: boolean;
  counter: boolean;
  waiter: boolean;
}

export interface ProductChannelPricing {
  delivery?: number;
  counter?: number;
  waiter?: number;
}

export const DEFAULT_PRODUCT_SALES_CHANNELS: ProductSalesChannels = {
  delivery: true,
  counter: true,
  waiter: true
};

export function normalizeProductSalesChannels(
  product: any
): ProductSalesChannels {
  if (!product) return { ...DEFAULT_PRODUCT_SALES_CHANNELS };
  return {
    delivery:
      typeof product.salesChannels?.delivery === 'boolean'
        ? product.salesChannels.delivery
        : true,

    counter:
      typeof product.salesChannels?.counter === 'boolean'
        ? product.salesChannels.counter
        : true,

    waiter:
      typeof product.salesChannels?.waiter === 'boolean'
        ? product.salesChannels.waiter
        : true
  };
}

export function getProductPriceForChannel(
  product: any,
  channel: ProductSalesChannel
): number {
  if (!product) return 0;

  const specificPrice = product.channelPricing?.[channel];
  if (typeof specificPrice === 'number' && Number.isFinite(specificPrice) && specificPrice >= 0) {
    return specificPrice;
  }

  return Number(product.preco || product.price || 0);
}

export function isProductAvailableForChannel(
  product: any,
  channel: ProductSalesChannel
): boolean {
  if (!product) return false;
  if (product.status === 'inativo') return false;
  if (product.ativo === false) return false;
  const channels = normalizeProductSalesChannels(product);
  return channels[channel];
}

export function normalizeProductChannelPricing(product: any): ProductChannelPricing {
  if (!product || !product.channelPricing) return {};
  const pricing: ProductChannelPricing = {};
  const channels: ProductSalesChannel[] = ['delivery', 'counter', 'waiter'];
  for (const ch of channels) {
    const val = product.channelPricing[ch];
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
      pricing[ch] = val;
    }
  }
  return pricing;
}
