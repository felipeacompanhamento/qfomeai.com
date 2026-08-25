import { collection, query, where, getDocs, orderBy, limit, getAggregateFromServer, count, sum, average } from 'firebase/firestore';
import { db } from '../firebase';
import { cache } from '../utils/cache';

const reviewsCache: Record<string, any> = {};

export const invalidateReviewsCache = (restaurantId: string) => {
  delete reviewsCache[restaurantId];
};

export const dashboardService = {
  async getOrdersByDateRange(restaurantId: string, startDate: Date, endDate: Date, forceRefresh = false) {
    const cacheKey = `orders_${restaurantId}_${startDate.getTime()}_${endDate.getTime()}`;
    
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached) return cached;
    }

    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'orders'),
        where('data_criacao', '>=', startDate.toISOString()),
        where('data_criacao', '<=', endDate.toISOString()),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      cache.set(cacheKey, orders, 30); // 30 seconds cache
      return orders;
    } catch (error) {
      console.error("Error fetching orders:", error);
      return [];
    }
  },

  async getAggregateOrderStats(restaurantId: string, startDate: Date, endDate: Date) {
    const cacheKey = `orders_agg_${restaurantId}_${startDate.getTime()}_${endDate.getTime()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'orders'),
        where('data_criacao', '>=', startDate.toISOString()),
        where('data_criacao', '<=', endDate.toISOString())
      );

      const aggSnap = await getAggregateFromServer(q, {
        totalOrders: count(),
        totalFaturamento: sum('valor_total'),
        ticketMedio: average('valor_total')
      });

      const res = {
        totalOrders: aggSnap.data().totalOrders || 0,
        totalFaturamento: aggSnap.data().totalFaturamento || 0,
        ticketMedio: aggSnap.data().ticketMedio || 0
      };

      cache.set(cacheKey, res, 60);
      return res;
    } catch (error) {
      console.error("Error fetching aggregate order stats:", error);
      return { totalOrders: 0, totalFaturamento: 0, ticketMedio: 0 };
    }
  },

  async getReviewsByRestaurantId(restaurantId: string) {
    if (reviewsCache[restaurantId]) {
      return reviewsCache[restaurantId];
    }

    const cacheKey = `reviews_${restaurantId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'avaliacoes'),
        orderBy('data', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      reviewsCache[restaurantId] = reviews;
      cache.set(cacheKey, reviews, 300); // 5 minutes cache
      return reviews;
    } catch (error) {
      console.error("Error fetching reviews for restaurant:", restaurantId, error);
      return [];
    }
  }
};
