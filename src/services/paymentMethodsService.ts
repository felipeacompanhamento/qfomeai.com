import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type PaymentChannel =
  | 'BALCAO'
  | 'COUNTER'
  | 'DELIVERY'
  | 'ENTREGA'
  | 'PICKUP'
  | 'RETIRADA'
  | 'DINE_IN'
  | 'CONSUMO_LOCAL'
  | 'ORDERS'
  | 'CAIXA'
  | 'CONTAS_PAGAR'
  | 'CONTAS_RECEBER'
  | 'MESA'
  | 'GARCOM'
  | 'ALL';

export type PaymentMethodType = 'CASH' | 'PIX' | 'CREDIT' | 'DEBIT' | 'OTHER';

export interface PaymentMethod {
  id: string;
  name: string;
  active: boolean;
  type: PaymentMethodType;
  availableChannels: {
    entrega: boolean;
    retirada: boolean;
    balcao: boolean;
    consumoLocal: boolean;
  };
  requiresCashReceived: boolean;
  sortOrder: number;
  isDefault?: boolean;
}

export type RestaurantPaymentMethod = PaymentMethod;

const STANDARD_METADATA: Record<string, { name: string; type: PaymentMethodType; requiresCash: boolean; sortOrder: number }> = {
  dinheiro: { name: 'Dinheiro', type: 'CASH', requiresCash: true, sortOrder: 1 },
  cash: { name: 'Dinheiro', type: 'CASH', requiresCash: true, sortOrder: 1 },
  pix: { name: 'Pix', type: 'PIX', requiresCash: false, sortOrder: 2 },
  credito: { name: 'Cartão de Crédito', type: 'CREDIT', requiresCash: false, sortOrder: 3 },
  cartao_credito: { name: 'Cartão de Crédito', type: 'CREDIT', requiresCash: false, sortOrder: 3 },
  debito: { name: 'Cartão de Débito', type: 'DEBIT', requiresCash: false, sortOrder: 4 },
  cartao_debito: { name: 'Cartão de Débito', type: 'DEBIT', requiresCash: false, sortOrder: 4 },
  voucher: { name: 'Voucher / Vale', type: 'OTHER', requiresCash: false, sortOrder: 5 }
};

/**
 * Normalizes payment methods object or array from restaurant document
 */
export function parseConfiguredPaymentMethods(configuredData: any): PaymentMethod[] {
  if (!configuredData) return [];

  const methods: PaymentMethod[] = [];

  if (Array.isArray(configuredData)) {
    configuredData.forEach((item, index) => {
      if (typeof item === 'string' && item.trim()) {
        const id = item.trim().toLowerCase();
        const std = STANDARD_METADATA[id] || {
          name: item.trim(),
          type: (id.includes('dinheiro') || id.includes('cash') ? 'CASH' : 'OTHER') as PaymentMethodType,
          requiresCash: id.includes('dinheiro') || id.includes('cash'),
          sortOrder: index + 1
        };
        methods.push({
          id,
          name: std.name,
          active: true,
          type: std.type,
          availableChannels: { entrega: true, retirada: true, balcao: true, consumoLocal: true },
          requiresCashReceived: std.requiresCash,
          sortOrder: std.sortOrder
        });
      } else if (item && typeof item === 'object' && item.id) {
        if (item.deleted === true || item.archived === true || item.inactive === true) {
          return;
        }
        const id = String(item.id).trim().toLowerCase();
        const std = STANDARD_METADATA[id] || {
          name: item.name || id,
          type: (item.type || (id.includes('dinheiro') || id.includes('cash') ? 'CASH' : 'OTHER')) as PaymentMethodType,
          requiresCash: id.includes('dinheiro') || id.includes('cash'),
          sortOrder: index + 1
        };
        const active = item.active !== false && item.enabled !== false && item.isActive !== false;
        if (active) {
          methods.push({
            id,
            name: item.name || std.name,
            active: true,
            type: (item.type || std.type) as PaymentMethodType,
            availableChannels: item.channels || { entrega: true, retirada: true, balcao: true, consumoLocal: true },
            requiresCashReceived: std.requiresCash || item.type === 'CASH',
            sortOrder: item.sortOrder ?? item.order ?? std.sortOrder,
            isDefault: item.isDefault === true || item.default === true
          });
        }
      }
    });
  } else if (typeof configuredData === 'object') {
    Object.entries(configuredData).forEach(([key, val]: [string, any], index) => {
      const id = key.trim().toLowerCase();
      const std = STANDARD_METADATA[id] || {
        name: key,
        type: (id.includes('dinheiro') || id.includes('cash') ? 'CASH' : 'OTHER') as PaymentMethodType,
        requiresCash: id.includes('dinheiro') || id.includes('cash'),
        sortOrder: index + 1
      };

      if (val && typeof val === 'object') {
        if (val.deleted === true || val.archived === true || val.inactive === true) {
          return;
        }
      }

      let active = false;
      let channels = { entrega: false, retirada: false, balcao: false, consumoLocal: false };

      if (typeof val === 'boolean') {
        active = val;
        channels = { entrega: val, retirada: val, balcao: val, consumoLocal: val };
      } else if (val && typeof val === 'object') {
        const activeProp = val.active ?? val.enabled ?? val.isActive;
        const entrega = val.entrega === true || val.delivery === true;
        const retirada = val.retirada === true || val.pickup === true;
        const balcao = val.balcao === true || val.counter === true;
        const consumoLocal = val.consumoLocal === true || val.dine_in === true || val.dineIn === true || val.mesa === true;

        const hasExplicitChannelProps = (
          val.entrega !== undefined || val.retirada !== undefined || val.balcao !== undefined || val.consumoLocal !== undefined ||
          val.delivery !== undefined || val.pickup !== undefined || val.counter !== undefined || val.dine_in !== undefined
        );

        if (activeProp !== undefined) {
          active = !!activeProp;
        } else if (hasExplicitChannelProps) {
          // If channels are specified, it's active if at least one channel is true
          active = entrega || retirada || balcao || consumoLocal;
        } else {
          // Default to true if no negative indicator
          active = true;
        }

        channels = {
          entrega: hasExplicitChannelProps ? entrega : active,
          retirada: hasExplicitChannelProps ? retirada : active,
          balcao: hasExplicitChannelProps ? balcao : active,
          consumoLocal: hasExplicitChannelProps ? consumoLocal : active,
        };
      }

      if (active) {
        methods.push({
          id,
          name: (val && typeof val === 'object' && val.name) ? val.name : std.name,
          active: true,
          type: std.type,
          availableChannels: channels,
          requiresCashReceived: std.requiresCash,
          sortOrder: (val && typeof val === 'object' && (val.sortOrder ?? val.order)) ? (val.sortOrder ?? val.order) : std.sortOrder,
          isDefault: val && typeof val === 'object' ? (val.isDefault === true || val.default === true) : false
        });
      }
    });
  }

  return methods.sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Filter payment methods by channel
 */
export function getAvailablePaymentMethods(
  configuredData: any,
  channel: PaymentChannel = 'ALL'
): PaymentMethod[] {
  const allParsed = parseConfiguredPaymentMethods(configuredData);
  if (allParsed.length === 0) return [];

  // Administrative financial modules & orders management get all active methods
  if (['CAIXA', 'CONTAS_PAGAR', 'CONTAS_RECEBER', 'ORDERS', 'ALL'].includes(channel)) {
    return allParsed.filter(m => m.active);
  }

  return allParsed.filter(m => {
    if (!m.active) return false;
    if (channel === 'BALCAO' || channel === 'COUNTER') {
      return m.availableChannels.balcao;
    }
    if (channel === 'DELIVERY' || channel === 'ENTREGA') {
      return m.availableChannels.entrega;
    }
    if (channel === 'PICKUP' || channel === 'RETIRADA') {
      return m.availableChannels.retirada;
    }
    if (channel === 'DINE_IN' || channel === 'CONSUMO_LOCAL' || channel === 'MESA' || channel === 'GARCOM') {
      return m.availableChannels.consumoLocal;
    }
    return true;
  });
}

/**
 * Checks if a payment method is semantically Cash (Dinheiro)
 */
export function isCashPaymentMethod(methodOrId: PaymentMethod | string | undefined | null): boolean {
  if (!methodOrId) return false;
  if (typeof methodOrId === 'object') {
    return methodOrId.type === 'CASH' || methodOrId.requiresCashReceived === true || methodOrId.id.toLowerCase() === 'dinheiro' || methodOrId.id.toLowerCase() === 'cash';
  }
  const str = String(methodOrId).trim().toLowerCase();
  return str === 'dinheiro' || str === 'cash' || str === 'money' || str.includes('dinheiro');
}

/**
 * Checks if a payment method is semantically PIX
 */
export function isPixPaymentMethod(methodOrId: PaymentMethod | string | undefined | null): boolean {
  if (!methodOrId) return false;
  if (typeof methodOrId === 'object') {
    return methodOrId.type === 'PIX' || methodOrId.id.toLowerCase().includes('pix');
  }
  const str = String(methodOrId).trim().toLowerCase();
  return str === 'pix' || str.includes('pix');
}

/**
 * Checks if a payment method is semantically Credit Card
 */
export function isCreditPaymentMethod(methodOrId: PaymentMethod | string | undefined | null): boolean {
  if (!methodOrId) return false;
  if (typeof methodOrId === 'object') {
    return methodOrId.type === 'CREDIT' || methodOrId.id.toLowerCase().includes('credito');
  }
  const str = String(methodOrId).trim().toLowerCase();
  return str.includes('credito') || str.includes('credit');
}

/**
 * Checks if a payment method is semantically Debit Card
 */
export function isDebitPaymentMethod(methodOrId: PaymentMethod | string | undefined | null): boolean {
  if (!methodOrId) return false;
  if (typeof methodOrId === 'object') {
    return methodOrId.type === 'DEBIT' || methodOrId.id.toLowerCase().includes('debito');
  }
  const str = String(methodOrId).trim().toLowerCase();
  return str.includes('debito') || str.includes('debit');
}

/**
 * Canonical payment record normalizer for orders and financial movements
 */
export function normalizePaymentRecord(
  paymentMethodId: string,
  configuredData?: any,
  amountCents?: number
): {
  paymentMethodId: string;
  paymentMethodName: string;
  amountCents?: number;
  isCash: boolean;
  isPix: boolean;
} {
  const cleanId = String(paymentMethodId || '').trim();
  const name = getPaymentMethodLabel(cleanId, configuredData);
  return {
    paymentMethodId: cleanId,
    paymentMethodName: name,
    amountCents,
    isCash: isCashPaymentMethod(cleanId),
    isPix: isPixPaymentMethod(cleanId)
  };
}

/**
 * Get display label for payment method with legacy compatibility
 */
export function getPaymentMethodLabel(methodId: string | undefined | null, configuredData?: any): string {
  if (!methodId) return '';
  if (configuredData) {
    const parsed = parseConfiguredPaymentMethods(configuredData);
    const found = parsed.find(m => m.id.toLowerCase() === String(methodId).toLowerCase());
    if (found) return found.name;
  }
  const std = STANDARD_METADATA[String(methodId).toLowerCase()];
  if (std) return std.name;
  return String(methodId);
}

/**
 * Fetch restaurant payment methods directly from Firestore for authenticated restaurant
 */
export async function fetchRestaurantPaymentMethods(restaurantId: string): Promise<PaymentMethod[]> {
  if (!restaurantId) return [];
  try {
    const docRef = doc(db, 'restaurants', restaurantId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const configured = data.formas_pagamento || data.payment_methods;
      return parseConfiguredPaymentMethods(configured);
    }
  } catch (error) {
    console.error("Error loading restaurant payment methods:", error);
  }
  return [];
}

/**
 * Validate payment method for a given context
 */
export function validatePaymentMethod(
  methodId: string,
  configuredData: any,
  channel: PaymentChannel = 'ALL'
): { valid: boolean; error?: string } {
  if (!methodId || !methodId.trim()) {
    return { valid: false, error: 'INVALID_PAYMENT_METHOD' };
  }

  const available = getAvailablePaymentMethods(configuredData, channel);
  const exists = available.some(m => m.id.toLowerCase() === methodId.trim().toLowerCase());

  if (!exists) {
    return { valid: false, error: 'INVALID_PAYMENT_METHOD' };
  }

  return { valid: true };
}

export { useRestaurantPaymentMethods } from '../hooks/useRestaurantPaymentMethods';
