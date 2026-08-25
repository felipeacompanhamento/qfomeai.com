import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export const TTL = {
  STATES_CITIES: 24 * 60 * 60 * 1000,      // 24 horas (em ms)
  NEIGHBORHOODS_DELIVERY: 10 * 60 * 1000, // 10 minutos (em ms)
  CATEGORIES: 5 * 60 * 1000,               // 5 minutos (em ms)
  RESTAURANT_PUBLIC: 5 * 60 * 1000,        // 5 minutos (em ms)
};

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class StaticDataCacheService {
  private cache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();

  /**
   * Generates or reuses cached data for `key` if valid.
   * If a fetch for `key` is currently in flight, reuses the existing Promise.
   */
  async getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number): Promise<T> {
    const now = Date.now();
    const entry = this.cache.get(key);

    if (entry && entry.expiresAt > now) {
      return entry.data as T;
    }

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key) as Promise<T>;
    }

    const promise = (async () => {
      try {
        const data = await fetcher();
        this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
        return data;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.data as T;
    }
    return null;
  }

  invalidate(keyOrPattern: string): void {
    for (const key of Array.from(this.cache.keys())) {
      if (key === keyOrPattern || key.includes(keyOrPattern)) {
        this.cache.delete(key);
      }
    }
    for (const key of Array.from(this.inFlight.keys())) {
      if (key === keyOrPattern || key.includes(keyOrPattern)) {
        this.inFlight.delete(key);
      }
    }
  }

  invalidateNeighborhoods(): void {
    this.invalidate('neighborhood');
    this.invalidate('bairro');
  }

  invalidateDeliveryAreas(restaurantId?: string): void {
    if (restaurantId) {
      this.invalidate(`delivery_area_${restaurantId}`);
      this.invalidate(`delivery_areas_${restaurantId}`);
    } else {
      this.invalidate('delivery_area');
    }
  }

  invalidateCategories(restaurantId?: string): void {
    this.invalidate('categories_global');
    if (restaurantId) {
      this.invalidate(`categories_${restaurantId}`);
      this.invalidate(`restaurant_categories_${restaurantId}`);
    } else {
      this.invalidate('category');
      this.invalidate('categories');
    }
  }

  invalidateRestaurant(restaurantId: string): void {
    this.invalidate(`restaurant_${restaurantId}`);
    this.invalidate(`restaurant_public_${restaurantId}`);
    this.invalidate(`restaurant_id_${restaurantId}`);
    this.invalidate(`restaurant_slug_`);
    this.invalidate(`restaurant_owner_`);
    this.invalidate(`approved_restaurants`);
    this.invalidate(`all_restaurants`);
  }

  clearAll(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  // --- Canonical Fetching Helpers ---

  /** Estados (TTL: 24h) */
  async getStates(): Promise<any[]> {
    return this.getOrFetch(
      'states_all',
      async () => {
        try {
          const snap = await getDocs(collection(db, 'estados'));
          return snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter((e: any) => e.ativo !== false);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'estados');
          return [];
        }
      },
      TTL.STATES_CITIES
    );
  }

  /** Cidades (TTL: 24h) */
  async getCities(estadoId?: string): Promise<any[]> {
    const key = estadoId ? `cities_state_${estadoId}` : 'cities_all';
    return this.getOrFetch(
      key,
      async () => {
        try {
          let q;
          if (estadoId) {
            q = query(collection(db, 'cidades'), where('estado_id', '==', estadoId));
          } else {
            q = collection(db, 'cidades');
          }
          const snap = await getDocs(q);
          return snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter((c: any) => c.ativo !== false);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'cidades');
          return [];
        }
      },
      TTL.STATES_CITIES
    );
  }

  /** Alias para getCities */
  async getCidades(estadoId?: string): Promise<any[]> {
    return this.getCities(estadoId);
  }

  /** Bairros (TTL: 10 min) */
  async getNeighborhoods(cidadeId?: string): Promise<any[]> {
    const key = cidadeId ? `neighborhoods_city_${cidadeId}` : 'neighborhoods_all';
    return this.getOrFetch(
      key,
      async () => {
        try {
          let q;
          if (cidadeId) {
            q = query(collection(db, 'bairros'), where('cidade_id', '==', cidadeId));
          } else {
            q = query(collection(db, 'bairros'), where('ativo', '==', true));
          }
          const snap = await getDocs(q);
          return snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter((b: any) => b.ativo !== false);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'bairros');
          return [];
        }
      },
      TTL.NEIGHBORHOODS_DELIVERY
    );
  }

  /** Áreas de entrega por restaurante (TTL: 10 min) */
  async getDeliveryAreas(restaurantId: string): Promise<any[]> {
    if (!restaurantId) return [];
    return this.getOrFetch(
      `delivery_areas_${restaurantId}`,
      async () => {
        try {
          const q = query(
            collection(db, 'restaurants', restaurantId, 'delivery_areas'),
            orderBy('created_at', 'desc')
          );
          const snap = await getDocs(q);
          return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/delivery_areas`);
          return [];
        }
      },
      TTL.NEIGHBORHOODS_DELIVERY
    );
  }

  /** Categorias públicas globais (TTL: 5 min) */
  async getGlobalCategories(): Promise<any[]> {
    return this.getOrFetch(
      'categories_global',
      async () => {
        try {
          const snap = await getDocs(collection(db, 'categories'));
          return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, 'categories');
          return [];
        }
      },
      TTL.CATEGORIES
    );
  }

  /** Categorias públicas de um restaurante (TTL: 5 min) */
  async getRestaurantCategories(restaurantId: string): Promise<any[]> {
    if (!restaurantId) return [];
    return this.getOrFetch(
      `categories_${restaurantId}`,
      async () => {
        try {
          let q = query(collection(db, 'restaurants', restaurantId, 'categories'));
          let snap = await getDocs(q);
          let categories = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

          if (categories.length === 0) {
            q = query(
              collection(db, 'categories'),
              where('restaurant_id', '==', doc(db, 'restaurants', restaurantId))
            );
            snap = await getDocs(q);
            categories = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          }
          return categories;
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/categories`);
          return [];
        }
      },
      TTL.CATEGORIES
    );
  }

  /** Configurações públicas / dados do restaurante por ID (TTL: 5 min) */
  async getRestaurantPublicSettings(restaurantId: string): Promise<any | null> {
    if (!restaurantId) return null;
    return this.getOrFetch(
      `restaurant_public_id_${restaurantId}`,
      async () => {
        try {
          const docRef = doc(db, 'restaurants', restaurantId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            return { id: snap.id, ...(snap.data() as any) };
          }
          return null;
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `restaurants/${restaurantId}`);
          return null;
        }
      },
      TTL.RESTAURANT_PUBLIC
    );
  }
}

export const staticDataCacheService = new StaticDataCacheService();
