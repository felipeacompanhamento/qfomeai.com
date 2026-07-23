
export const cache = {
  set: (key: string, data: any, ttlSeconds: number) => {
    const item = {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
    };
    localStorage.setItem(key, JSON.stringify(item));
  },
  get: (key: string) => {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;
    const item = JSON.parse(itemStr);
    if (Date.now() > item.expiry) {
      localStorage.removeItem(key);
      return null;
    }
    return item.data;
  },
  remove: (key: string) => {
    localStorage.removeItem(key);
  },
  clearUserCache: (userId: string) => {
    Object.keys(localStorage).forEach(key => {
      if (key.includes(userId) || key === 'restaurants' || key.startsWith('products_')) {
        localStorage.removeItem(key);
      }
    });
  }
};
