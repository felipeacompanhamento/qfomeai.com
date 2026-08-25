import { cache } from '../utils/cache';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';
import { db } from '../firebase';
import { staticDataCacheService, TTL } from './staticDataCacheService';

export const invalidateRestaurantCache = (restaurantId: string) => {
  cache.remove(`restaurant_categories_${restaurantId}`);
  cache.remove(`restaurant_products_${restaurantId}`);
  cache.remove(`restaurant_extras_${restaurantId}`);
  cache.remove(`restaurant_sizes_${restaurantId}`);
  cache.remove(`products_${restaurantId}`);
  cache.remove(`categories_${restaurantId}`);

  staticDataCacheService.invalidateRestaurant(restaurantId);
  staticDataCacheService.invalidateCategories(restaurantId);
  staticDataCacheService.invalidateDeliveryAreas(restaurantId);
};

export const restaurantService = {
  async getRestaurantBySlug(slug: string) {
    if (!slug) return null;
    return staticDataCacheService.getOrFetch(
      `restaurant_public_slug_${slug}`,
      async () => {
        const q = query(collection(db, 'restaurants'), where('slug', '==', slug), limit(1));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) return null;
        const docSnap = querySnapshot.docs[0];
        return { id: docSnap.id, ...docSnap.data() };
      },
      TTL.RESTAURANT_PUBLIC
    );
  },

  async getRestaurantById(id: string) {
    if (!id) return null;
    return staticDataCacheService.getOrFetch(
      `restaurant_public_id_${id}`,
      async () => {
        try {
          const docRef = doc(db, 'restaurants', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
          }
          return null;
        } catch (error) {
          console.error("Error fetching restaurant by id:", error);
          return null;
        }
      },
      TTL.RESTAURANT_PUBLIC
    );
  },

  async getRestaurantByOwnerId(ownerId: string) {
    if (!ownerId) return null;
    return staticDataCacheService.getOrFetch(
      `restaurant_public_owner_${ownerId}`,
      async () => {
        try {
          const docRef = doc(db, 'restaurants', ownerId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
          }
          
          const q = query(collection(db, 'restaurants'), where('ownerId', '==', ownerId), limit(1));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) return null;
          const fallbackDoc = querySnapshot.docs[0];
          return { id: fallbackDoc.id, ...fallbackDoc.data() };
        } catch (error) {
          console.error("Error fetching restaurant:", error);
          return null;
        }
      },
      TTL.RESTAURANT_PUBLIC
    );
  },

  async getRestaurantCategories(restaurantId: string) {
    if (!restaurantId) return [];
    return staticDataCacheService.getRestaurantCategories(restaurantId);
  },

  async getRestaurantProducts(restaurantId: string) {
    if (!restaurantId) return [];
    return staticDataCacheService.getOrFetch(
      `restaurant_products_${restaurantId}`,
      async () => {
        const q = query(
          collection(db, 'restaurants', restaurantId, 'products'),
          where('status', '==', 'ativo')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      TTL.CATEGORIES
    );
  },

  async getRestaurantExtras(restaurantId: string) {
    if (!restaurantId) return [];
    return staticDataCacheService.getOrFetch(
      `restaurant_extras_${restaurantId}`,
      async () => {
        const q = query(
          collection(db, 'restaurants', restaurantId, 'extras'),
          where('status', '==', 'ativo')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      TTL.CATEGORIES
    );
  },

  async getRestaurantSizes(restaurantId: string) {
    if (!restaurantId) return [];
    return staticDataCacheService.getOrFetch(
      `restaurant_sizes_${restaurantId}`,
      async () => {
        const q = query(
          collection(db, 'restaurants', restaurantId, 'sizes'),
          orderBy('ordem', 'asc')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      TTL.CATEGORIES
    );
  },

  async getRestaurantDeliveryAreas(restaurantId: string) {
    if (!restaurantId) return [];
    return staticDataCacheService.getDeliveryAreas(restaurantId);
  },

  async getAllRestaurants() {
    return staticDataCacheService.getOrFetch(
      'all_restaurants',
      async () => {
        const q = query(
          collection(db, 'restaurants'), 
          where('status', '==', 'ativo'),
          limit(50)
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      TTL.RESTAURANT_PUBLIC
    );
  },

  async getApprovedRestaurants() {
    return staticDataCacheService.getOrFetch(
      'approved_restaurants',
      async () => {
        const q = query(
          collection(db, 'restaurants'), 
          where('status_aprovacao', '==', 'aprovado'),
          limit(250)
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      TTL.RESTAURANT_PUBLIC
    );
  },

  async getApprovedRestaurantsByLocation(estado: string, cidade: string) {
    const key = `approved_restaurants_${estado || 'any'}_${cidade}`;
    return staticDataCacheService.getOrFetch(
      key,
      async () => {
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
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      TTL.RESTAURANT_PUBLIC
    );
  },

  async getCategories() {
    return staticDataCacheService.getGlobalCategories();
  },

  async getBanners() {
    return staticDataCacheService.getOrFetch(
      'global_banners',
      async () => {
        const querySnapshot = await getDocs(collection(db, 'banners'));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      },
      TTL.CATEGORIES
    );
  },

  async getRestaurantClients(restaurantId: string) {
    if (!restaurantId) return [];
    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'orders'),
        orderBy('data_criacao', 'desc'),
        limit(200)
      );
      const snapshot = await getDocs(q);
      const clientsMap: Record<string, any> = {};

      snapshot.docs.forEach(docSnap => {
        const order = docSnap.data();
        const clientId = order.cliente_id || order.cliente_telefone || order.cliente_nome || docSnap.id;
        
        if (!clientsMap[clientId]) {
          clientsMap[clientId] = {
            id: clientId,
            nome: order.cliente_nome || 'Cliente',
            telefone: order.cliente_telefone || order.telefone || '',
            totalPedidos: 1,
            valorTotal: Number(order.valor_total || 0),
            ultimoPedido: order.data_criacao
          };
        } else {
          clientsMap[clientId].totalPedidos += 1;
          clientsMap[clientId].valorTotal += Number(order.valor_total || 0);
        }
      });

      return Object.values(clientsMap).sort((a, b) => b.totalPedidos - a.totalPedidos);
    } catch (error) {
      console.error("Error in getRestaurantClients:", error);
      return [];
    }
  },

  async getRestaurantClientsPaginated(restaurantId: string, page: number = 1, pageSize: number = 30) {
    if (!restaurantId) return { clients: [], hasMore: false, totalClients: 0, totalPages: 0, currentPage: 1 };
    try {
      const allClients = await staticDataCacheService.getOrFetch(
        `clients_aggregated_${restaurantId}`,
        async () => {
          const q = query(
            collection(db, 'restaurants', restaurantId, 'orders'),
            orderBy('data_criacao', 'desc'),
            limit(1000)
          );
          const snapshot = await getDocs(q);
          const clientsMap: Record<string, any> = {};

          snapshot.docs.forEach(docSnap => {
            const order = docSnap.data();
            const clientId = order.cliente_id || order.cliente_telefone || order.cliente_nome || docSnap.id;
            
            if (!clientsMap[clientId]) {
              clientsMap[clientId] = {
                id: clientId,
                nome: order.cliente_nome || 'Cliente',
                telefone: order.cliente_telefone || order.telefone || '',
                totalPedidos: 1,
                valorTotal: Number(order.valor_total || 0),
                ultimoPedido: order.data_criacao
              };
            } else {
              clientsMap[clientId].totalPedidos += 1;
              clientsMap[clientId].valorTotal += Number(order.valor_total || 0);
              if (order.data_criacao && new Date(order.data_criacao) > new Date(clientsMap[clientId].ultimoPedido || 0)) {
                clientsMap[clientId].ultimoPedido = order.data_criacao;
              }
            }
          });

          return Object.values(clientsMap).sort((a, b) => {
            const timeA = a.ultimoPedido ? new Date(a.ultimoPedido).getTime() : 0;
            const timeB = b.ultimoPedido ? new Date(b.ultimoPedido).getTime() : 0;
            return timeB - timeA;
          });
        },
        3 * 60 * 1000 // 3 min cache TTL
      );

      const totalClients = allClients.length;
      const totalPages = Math.max(1, Math.ceil(totalClients / pageSize));
      const currentPage = Math.min(Math.max(1, page), totalPages);
      const startIndex = (currentPage - 1) * pageSize;
      const paginatedClients = allClients.slice(startIndex, startIndex + pageSize);
      const hasMore = currentPage < totalPages;

      return {
        clients: paginatedClients,
        hasMore,
        totalClients,
        totalPages,
        currentPage,
        totalLoaded: paginatedClients.length
      };
    } catch (error) {
      console.error("Error in getRestaurantClientsPaginated:", error);
      return { clients: [], hasMore: false, totalClients: 0, totalPages: 1, currentPage: 1, totalLoaded: 0 };
    }
  }
};

