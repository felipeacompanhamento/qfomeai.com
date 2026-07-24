import { AssignedOrder, OfflineActionItem } from '../types';

const DB_NAME = 'qfomeai_driver_db';
const DB_VERSION = 1;

export const initDriverDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('orders')) {
        db.createObjectStore('orders', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('route_order')) {
        db.createObjectStore('route_order', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('offline_actions')) {
        db.createObjectStore('offline_actions', { keyPath: 'id' });
      }
    };
  });
};

// Cached Orders Operations
export const saveCachedOrders = async (orders: AssignedOrder[]): Promise<void> => {
  try {
    const db = await initDriverDb();
    const tx = db.transaction('orders', 'readwrite');
    const store = tx.objectStore('orders');
    store.clear();
    for (const order of orders) {
      store.put(order);
    }
  } catch (err) {
    console.warn('[DriverOfflineDb] Error saving cached orders:', err);
  }
};

export const getCachedOrders = async (): Promise<AssignedOrder[]> => {
  try {
    const db = await initDriverDb();
    return new Promise((resolve) => {
      const tx = db.transaction('orders', 'readonly');
      const store = tx.objectStore('orders');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn('[DriverOfflineDb] Error getting cached orders:', err);
    return [];
  }
};

// Manual Route Order Persistence
export const saveSavedRouteOrderIds = async (key: string, orderIds: string[]): Promise<void> => {
  try {
    const db = await initDriverDb();
    const tx = db.transaction('route_order', 'readwrite');
    const store = tx.objectStore('route_order');
    store.put({ key, orderIds, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('[DriverOfflineDb] Error saving route order:', err);
    try {
      localStorage.setItem(`route_order_${key}`, JSON.stringify(orderIds));
    } catch {
      // ignore
    }
  }
};

export const getSavedRouteOrderIds = async (key: string): Promise<string[]> => {
  try {
    const db = await initDriverDb();
    return new Promise((resolve) => {
      const tx = db.transaction('route_order', 'readonly');
      const store = tx.objectStore('route_order');
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result.orderIds)) {
          resolve(req.result.orderIds);
        } else {
          try {
            const raw = localStorage.getItem(`route_order_${key}`);
            resolve(raw ? JSON.parse(raw) : []);
          } catch {
            resolve([]);
          }
        }
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    try {
      const raw = localStorage.getItem(`route_order_${key}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
};

// Offline Queue Operations
export const addOfflineAction = async (action: OfflineActionItem): Promise<void> => {
  try {
    const db = await initDriverDb();
    const tx = db.transaction('offline_actions', 'readwrite');
    const store = tx.objectStore('offline_actions');
    store.put(action);
  } catch (err) {
    console.warn('[DriverOfflineDb] Error adding offline action:', err);
    try {
      const queue = JSON.parse(localStorage.getItem('qfomeai_driver_pending_queue') || '[]');
      queue.push(action);
      localStorage.setItem('qfomeai_driver_pending_queue', JSON.stringify(queue));
    } catch {
      // ignore
    }
  }
};

export const getOfflineActions = async (): Promise<OfflineActionItem[]> => {
  try {
    const db = await initDriverDb();
    return new Promise((resolve) => {
      const tx = db.transaction('offline_actions', 'readonly');
      const store = tx.objectStore('offline_actions');
      const req = store.getAll();
      req.onsuccess = () => {
        const idbItems = req.result || [];
        let lsItems: OfflineActionItem[] = [];
        try {
          lsItems = JSON.parse(localStorage.getItem('qfomeai_driver_pending_queue') || '[]');
        } catch {
          lsItems = [];
        }
        // Deduplicate by clientActionId or id
        const mergedMap = new Map<string, OfflineActionItem>();
        [...lsItems, ...idbItems].forEach(item => {
          mergedMap.set(item.clientActionId || item.id, item);
        });
        resolve(Array.from(mergedMap.values()));
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    try {
      return JSON.parse(localStorage.getItem('qfomeai_driver_pending_queue') || '[]');
    } catch {
      return [];
    }
  }
};

export const removeOfflineAction = async (id: string): Promise<void> => {
  try {
    const db = await initDriverDb();
    const tx = db.transaction('offline_actions', 'readwrite');
    const store = tx.objectStore('offline_actions');
    store.delete(id);
  } catch (err) {
    console.warn('[DriverOfflineDb] Error removing offline action:', err);
  } finally {
    try {
      const lsItems: OfflineActionItem[] = JSON.parse(localStorage.getItem('qfomeai_driver_pending_queue') || '[]');
      const filtered = lsItems.filter(i => i.id !== id && i.clientActionId !== id);
      localStorage.setItem('qfomeai_driver_pending_queue', JSON.stringify(filtered));
    } catch {
      // ignore
    }
  }
};

export const clearOfflineActions = async (): Promise<void> => {
  try {
    const db = await initDriverDb();
    const tx = db.transaction('offline_actions', 'readwrite');
    const store = tx.objectStore('offline_actions');
    store.clear();
  } catch {
    // ignore
  } finally {
    try {
      localStorage.removeItem('qfomeai_driver_pending_queue');
    } catch {
      // ignore
    }
  }
};
