import type { TabDraftItem } from '../components/tables/TabCatalogModal';

const STORAGE_PREFIX = 'tab_round_cart_v1_';

export function getRoundCartKey(tableId?: string | null, tabId?: string | null, restaurantId?: string | null): string {
  const rest = restaurantId ? `${restaurantId.trim()}_` : '';
  if (tabId && tabId.trim()) {
    return `${STORAGE_PREFIX}${rest}tab_${tabId.trim()}`;
  }
  if (tableId && tableId.trim()) {
    return `${STORAGE_PREFIX}${rest}table_${tableId.trim()}`;
  }
  return `${STORAGE_PREFIX}${rest}default`;
}

export const tabRoundCartService = {
  getCart(tableId?: string | null, tabId?: string | null, restaurantId?: string | null): TabDraftItem[] {
    const key = getRoundCartKey(tableId, tabId, restaurantId);
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
      // Fallback for key without restaurantId for backwards compatibility
      if (restaurantId) {
        const fallbackKey = getRoundCartKey(tableId, tabId);
        const fbData = localStorage.getItem(fallbackKey);
        if (fbData) {
          const parsed = JSON.parse(fbData);
          if (Array.isArray(parsed)) return parsed;
        }
      }
      return [];
    } catch (e) {
      console.warn('Erro ao carregar carrinho temporário da rodada:', e);
      return [];
    }
  },

  saveCart(items: TabDraftItem[], tableId?: string | null, tabId?: string | null, restaurantId?: string | null): void {
    const key = getRoundCartKey(tableId, tabId, restaurantId);
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch (e) {
      console.warn('Erro ao salvar carrinho temporário da rodada:', e);
    }
  },

  clearCart(tableId?: string | null, tabId?: string | null, restaurantId?: string | null): void {
    const key = getRoundCartKey(tableId, tabId, restaurantId);
    try {
      localStorage.removeItem(key);
      if (restaurantId) {
        const fallbackKey = getRoundCartKey(tableId, tabId);
        localStorage.removeItem(fallbackKey);
      }
    } catch (e) {
      console.warn('Erro ao limpar carrinho temporário da rodada:', e);
    }
  },

  addItem(item: TabDraftItem, tableId?: string | null, tabId?: string | null, restaurantId?: string | null): TabDraftItem[] {
    const current = this.getCart(tableId, tabId, restaurantId);
    // Check if an identical item exists (same product, same size, same options, same observation) to increment quantity
    const existingIndex = current.findIndex(existing => {
      if (existing.productId !== item.productId) return false;
      const sameSize = (existing.size?.nome || '') === (item.size?.nome || '');
      const sameObs = (existing.observation || '') === (item.observation || '');
      const opts1 = (existing.options || []).map(o => o.itemId).sort().join(',');
      const opts2 = (item.options || []).map(o => o.itemId).sort().join(',');
      return sameSize && sameObs && opts1 === opts2;
    });

    let updated: TabDraftItem[];
    if (existingIndex >= 0) {
      updated = [...current];
      const found = updated[existingIndex];
      const newQty = found.quantity + item.quantity;
      updated[existingIndex] = {
        ...found,
        quantity: newQty,
        totalPriceCents: found.unitPriceCents * newQty
      };
    } else {
      updated = [...current, item];
    }

    this.saveCart(updated, tableId, tabId, restaurantId);
    return updated;
  },

  updateQuantity(itemId: string, newQty: number, tableId?: string | null, tabId?: string | null, restaurantId?: string | null): TabDraftItem[] {
    const current = this.getCart(tableId, tabId, restaurantId);
    if (newQty <= 0) {
      return this.removeItem(itemId, tableId, tabId, restaurantId);
    }
    const updated = current.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          quantity: newQty,
          totalPriceCents: item.unitPriceCents * newQty
        };
      }
      return item;
    });
    this.saveCart(updated, tableId, tabId, restaurantId);
    return updated;
  },

  updateObservation(itemId: string, observation: string, tableId?: string | null, tabId?: string | null, restaurantId?: string | null): TabDraftItem[] {
    const current = this.getCart(tableId, tabId, restaurantId);
    const updated = current.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          observation: observation.trim() ? observation.trim() : undefined
        };
      }
      return item;
    });
    this.saveCart(updated, tableId, tabId, restaurantId);
    return updated;
  },

  removeItem(itemId: string, tableId?: string | null, tabId?: string | null, restaurantId?: string | null): TabDraftItem[] {
    const current = this.getCart(tableId, tabId, restaurantId);
    const updated = current.filter(item => item.id !== itemId);
    this.saveCart(updated, tableId, tabId, restaurantId);
    return updated;
  }
};
