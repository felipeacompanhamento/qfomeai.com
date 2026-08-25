export function normalizePaymentMethodId(value: any): 'dinheiro' | 'pix' | 'credito' | 'debito' | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase();
  if (clean === 'dinheiro' || clean === 'cash') return 'dinheiro';
  if (clean === 'pix') return 'pix';
  if (clean === 'credito' || clean === 'credit' || clean === 'cartao_credito' || clean === 'cartão_credito' || clean === 'cartao de credito') return 'credito';
  if (clean === 'debito' || clean === 'debit' || clean === 'cartao_debito' || clean === 'cartão_debito' || clean === 'cartao de debito') return 'debito';
  return null;
}

export function extractConfiguredPaymentMethods(restaurantData: any): Set<string> {
  const validMethods = new Set<string>();
  if (!restaurantData) return validMethods;

  const fp = restaurantData.formas_pagamento || restaurantData.payment_methods;
  if (!fp) return validMethods;

  if (Array.isArray(fp)) {
    fp.forEach((item: any) => {
      if (typeof item === 'string' && item.trim()) {
        validMethods.add(item.trim());
      } else if (item && typeof item === 'object' && item.id) {
        if (item.active !== false) {
          validMethods.add(String(item.id).trim());
        }
      }
    });
  } else if (typeof fp === 'object') {
    Object.entries(fp).forEach(([key, conf]: [string, any]) => {
      if (typeof conf === 'boolean') {
        if (conf) validMethods.add(key);
      } else if (conf && typeof conf === 'object') {
        const isActive = conf.active !== false && (
          conf.entrega || conf.retirada || conf.balcao || conf.consumoLocal || conf.active || Object.keys(conf).length === 0
        );
        if (isActive) {
          validMethods.add(key);
        }
      }
    });
  }

  return validMethods;
}
