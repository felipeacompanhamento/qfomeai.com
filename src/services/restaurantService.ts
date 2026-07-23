import { cache } from '../utils/cache';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';

export const invalidateRestaurantCache = (restaurantId: string) => {
  cache.remove(`restaurant_categories_${restaurantId}`);
  cache.remove(`restaurant_products_${restaurantId}`);
  cache.remove(`restaurant_extras_${restaurantId}`);
  cache.remove(`restaurant_sizes_${restaurantId}`);
};

export const restaurantService = {
  async getRestaurantBySlug(slug: string) {
    const cacheKey = `restaurant_slug_${slug}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`[Cache] Restaurante ${slug} carregado do cache.`);
      return cached;
    }
    
    console.log(`[Firestore] getRestaurantBySlug - Buscando restaurante pelo slug ${slug} - ${new Date().toISOString()}`);
    const q = query(collection(db, 'restaurants'), where('slug', '==', slug), limit(1));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const docSnap = querySnapshot.docs[0];
    const restaurant = { id: docSnap.id, ...docSnap.data() };
    
    cache.set(cacheKey, restaurant, 300); // 5 minutes
    return restaurant;
  },

  async getRestaurantByOwnerId(ownerId: string) {
    const cacheKey = `restaurant_owner_${ownerId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    console.log("Fetching restaurant for owner:", ownerId);
    try {
      const docRef = doc(db, 'restaurants', ownerId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const restaurant = { id: docSnap.id, ...docSnap.data() };
        cache.set(cacheKey, restaurant, 300); // 5 minutes
        return restaurant;
      }
      
      // Fallback to query if not found by ID
      const q = query(collection(db, 'restaurants'), where('ownerId', '==', ownerId), limit(1));
      const querySnapshot = await getDocs(q);
      console.log("Restaurant query result size:", querySnapshot.size);
      if (querySnapshot.empty) return null;
      const fallbackDoc = querySnapshot.docs[0];
      const restaurant = { id: fallbackDoc.id, ...fallbackDoc.data() };
      cache.set(cacheKey, restaurant, 300); // 5 minutes
      return restaurant;
    } catch (error) {
      console.error("Error fetching restaurant:", error);
      return null;
    }
  },

  async getRestaurantCategories(restaurantId: string) {
    const cacheKey = `restaurant_categories_${restaurantId}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      console.log(`[Cache] Categorias do restaurante ${restaurantId} carregadas do cache.`);
      return cached;
    }

    console.log(`[Firestore] getRestaurantCategories - Buscando categorias para o restaurante ${restaurantId} - ${new Date().toISOString()}`);
    
    // Try subcollection first
    let q = query(collection(db, 'restaurants', restaurantId, 'categories'));
    let querySnapshot = await getDocs(q);
    let categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (categories.length === 0) {
      console.log(`[Firestore] Nenhuma categoria na subcoleção, tentando coleção raiz para o restaurante ${restaurantId}`);
      q = query(
        collection(db, 'categories'),
        where('restaurant_id', '==', doc(db, 'restaurants', restaurantId))
      );
      querySnapshot = await getDocs(q);
      categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    console.log(`[Firestore] Categorias encontradas para ${restaurantId}:`, categories.length);
    cache.set(cacheKey, categories, 600); // 10 minutes
    return categories;
  },

  async getRestaurantProducts(restaurantId: string) {
    const cacheKey = `restaurant_products_${restaurantId}`;
    const cached = cache.get(cacheKey);

    if (cached) {
      console.log(`[Cache] Produtos do restaurante ${restaurantId} carregados do cache.`);
      return cached;
    }

    console.log(`[Firestore] getRestaurantProducts - Buscando produtos para o restaurante ${restaurantId} - ${new Date().toISOString()}`);
    const q = query(
      collection(db, 'restaurants', restaurantId, 'products'),
      where('status', '==', 'ativo')
    );
    const querySnapshot = await getDocs(q);
    const products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`[Firestore] Produtos encontrados para ${restaurantId}:`, products.length);
    cache.set(cacheKey, products, 300); // 5 minutes
    return products;
  },

  async getRestaurantExtras(restaurantId: string) {
    const cacheKey = `restaurant_extras_${restaurantId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const q = query(
      collection(db, 'restaurants', restaurantId, 'extras'),
      where('status', '==', 'ativo')
    );
    const querySnapshot = await getDocs(q);
    const extras = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cache.set(cacheKey, extras, 300); // 5 minutes
    return extras;
  },

  async getRestaurantSizes(restaurantId: string) {
    const cacheKey = `restaurant_sizes_${restaurantId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const q = query(
      collection(db, 'restaurants', restaurantId, 'sizes'),
      orderBy('ordem', 'asc')
    );
    const querySnapshot = await getDocs(q);
    const sizes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cache.set(cacheKey, sizes, 300); // 5 minutes
    return sizes;
  },

  async getRestaurantDeliveryAreas(restaurantId: string) {
    const cacheKey = `restaurant_delivery_areas_${restaurantId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const q = query(collection(db, 'restaurants', restaurantId, 'delivery_areas'));
    const querySnapshot = await getDocs(q);
    const deliveryAreas = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cache.set(cacheKey, deliveryAreas, 300); // 5 minutes
    return deliveryAreas;
  },

  async getAllRestaurants() {
    const cacheKey = `all_restaurants`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const q = query(
      collection(db, 'restaurants'), 
      where('status', '==', 'ativo'),
      limit(50)
    );
    const querySnapshot = await getDocs(q);
    const restaurants = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cache.set(cacheKey, restaurants, 300); // 5 minutes
    return restaurants;
  },

  async getApprovedRestaurants() {
    const cacheKey = `approved_restaurants`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const q = query(
      collection(db, 'restaurants'), 
      where('status_aprovacao', '==', 'aprovado'),
      limit(250)
    );
    const querySnapshot = await getDocs(q);
    const restaurants = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cache.set(cacheKey, restaurants, 300); // 5 minutes
    return restaurants;
  },

  async getApprovedRestaurantsByLocation(estado: string, cidade: string) {
    const cacheKey = `approved_restaurants_${estado || 'any'}_${cidade}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    console.log(`[Firestore] getApprovedRestaurantsByLocation - Buscando restaurantes em ${cidade}/${estado || 'Qualquer Estado'}`);
    
    const constraints: any[] = [
      where('status_aprovacao', '==', 'aprovado'),
      where('endereco.cidade', '==', cidade),
      limit(50)
    ];

    if (estado) {
      constraints.push(where('endereco.estado', '==', estado));
    }

    const q = query(
      collection(db, 'restaurants'), 
      ...constraints
    );
    const querySnapshot = await getDocs(q);
    console.log(`[Firestore] Restaurantes encontrados: ${querySnapshot.size}`);
    const restaurants = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cache.set(cacheKey, restaurants, 300); // 5 minutes
    return restaurants;
  },

  async getCategories() {
    const cacheKey = `global_categories`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const querySnapshot = await getDocs(collection(db, 'categories'));
    const categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cache.set(cacheKey, categories, 3600); // 1 hour
    return categories;
  },

  async getBanners() {
    const cacheKey = `global_banners`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const querySnapshot = await getDocs(collection(db, 'banners'));
    const banners = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cache.set(cacheKey, banners, 3600); // 1 hour
    return banners;
  }
};
