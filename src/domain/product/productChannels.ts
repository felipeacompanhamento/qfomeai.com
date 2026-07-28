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

export function resolveChannelUnitPriceCents(
  product: any,
  variant?: any,
  channel: ProductSalesChannel = 'counter'
): number {
  if (!product) return 0;

  const getValidNumericPrice = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    const num = typeof val === 'number' ? val : (typeof val === 'string' ? Number(val) : NaN);
    if (typeof num === 'number' && Number.isFinite(num) && num >= 0) {
      return num;
    }
    return null;
  };

  // 1 & 2: Variant pricing
  if (variant) {
    const varChannelKey = channel === 'counter' ? 'counter' : channel;
    const varChannel = getValidNumericPrice(
      variant.channelPricing?.[varChannelKey] ?? variant[`preco_${varChannelKey}`] ?? variant[`preco${varChannelKey.charAt(0).toUpperCase() + varChannelKey.slice(1)}`]
    );
    if (varChannel !== null) {
      return Math.round(varChannel * 100);
    }

    const varStd = getValidNumericPrice(variant.preco ?? variant.price ?? variant.valor);
    if (varStd !== null) {
      return Math.round(varStd * 100);
    }
  }

  // 3 & 4: Product pricing
  const prodChannelKey = channel === 'counter' ? 'counter' : channel;
  const prodChannel = getValidNumericPrice(
    product.channelPricing?.[prodChannelKey] ?? product[`preco_${prodChannelKey}`] ?? product[`preco${prodChannelKey.charAt(0).toUpperCase() + prodChannelKey.slice(1)}`]
  );
  if (prodChannel !== null) {
    return Math.round(prodChannel * 100);
  }

  const prodStd = getValidNumericPrice(product.preco ?? product.price ?? product.valor);
  if (prodStd !== null) {
    return Math.round(prodStd * 100);
  }

  return 0;
}

export function resolveCounterUnitPriceCents(product: any, variant?: any): number {
  return resolveChannelUnitPriceCents(product, variant, 'counter');
}

export function getProductPriceForChannel(
  product: any,
  channel: ProductSalesChannel
): number {
  if (!product) return 0;
  return resolveChannelUnitPriceCents(product, undefined, channel) / 100;
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
