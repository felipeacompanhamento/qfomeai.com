
interface CacheItem {
  data: any[];
  lastFetch: number;
}

const ordersCache: Record<string, CacheItem> = {};

export const cacheOrders = {
  /**
   * Salva os pedidos no cache em memória
   */
  set: (key: string, data: any[]) => {
    ordersCache[key] = {
      data,
      lastFetch: Date.now(),
    };
  },

  /**
   * Recupera os pedidos do cache se ainda forem válidos
   * @param key ID do restaurante ou do usuário
   * @param ttlSeconds Tempo de vida do cache em segundos (padrão 30s)
   */
  get: (key: string, ttlSeconds: number = 30) => {
    const cached = ordersCache[key];
    if (!cached) return null;
    
    const now = Date.now();
    if (now - cached.lastFetch > ttlSeconds * 1000) {
      delete ordersCache[key];
      return null;
    }
    
    return cached.data;
  },

  /**
   * Invalida o cache para uma chave específica
   */
  invalidate: (key: string) => {
    delete ordersCache[key];
  },

  /**
   * Limpa todo o cache de pedidos
   */
  clear: () => {
    Object.keys(ordersCache).forEach(key => delete ordersCache[key]);
  }
};
