import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, limit, getDocs, startAfter } from 'firebase/firestore';
import { db } from '../../../../firebase';

export interface HistoryFilterOptions {
  period: 'today' | 'yesterday' | '7days' | '30days' | 'all';
  status: 'ALL' | 'FINALIZED' | 'CANCELLED';
  searchTerm: string;
}

export function useOrdersHistory(restaurantId: string | undefined | null) {
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [filters, setFilters] = useState<HistoryFilterOptions>({
    period: 'today',
    status: 'ALL',
    searchTerm: ''
  });

  const fetchHistory = useCallback(async (reset = true) => {
    if (!restaurantId) return;

    setLoading(true);
    try {
      const ordersRef = collection(db, 'restaurants', restaurantId, 'orders');

      // Firestore query for operational closed states or data_criacao order
      let q = query(
        ordersRef,
        orderBy('data_criacao', 'desc'),
        limit(30)
      );

      if (!reset && lastDoc) {
        q = query(
          ordersRef,
          orderBy('data_criacao', 'desc'),
          startAfter(lastDoc),
          limit(30)
        );
      }

      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (snap.docs.length < 30) {
        setHasMore(false);
      } else {
        setHasMore(true);
        setLastDoc(snap.docs[snap.docs.length - 1]);
      }

      if (reset) {
        setHistoryOrders(docs);
      } else {
        setHistoryOrders(prev => {
          const map = new Map<string, any>();
          [...prev, ...docs].forEach(item => map.set(item.id, item));
          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.error('Erro ao buscar histórico de pedidos:', err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, lastDoc]);

  // Client-side filtering for fast interactive search & period selection
  const filteredHistory = historyOrders.filter(order => {
    const status = String(order.status || '').toLowerCase();
    const orderStatus = String(order.orderStatus || '').toUpperCase();
    const isFinished = 
      orderStatus === 'FINALIZED' || 
      orderStatus === 'CANCELLED' || 
      status === 'finalizado' || 
      status === 'cancelado' || 
      status === 'entregue' || 
      order.pago === true;

    if (!isFinished) return false;

    if (filters.status === 'FINALIZED' && (orderStatus === 'CANCELLED' || status === 'cancelado')) {
      return false;
    }
    if (filters.status === 'CANCELLED' && (orderStatus !== 'CANCELLED' && status !== 'cancelado')) {
      return false;
    }

    // Period filter
    if (filters.period !== 'all') {
      const created = new Date(order.data_criacao || order.createdAt || Date.now());
      const now = new Date();
      if (filters.period === 'today') {
        if (created.toDateString() !== now.toDateString()) return false;
      } else if (filters.period === 'yesterday') {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        if (created.toDateString() !== y.toDateString()) return false;
      } else if (filters.period === '7days') {
        const d7 = new Date();
        d7.setDate(d7.getDate() - 7);
        if (created < d7) return false;
      } else if (filters.period === '30days') {
        const d30 = new Date();
        d30.setDate(d30.getDate() - 30);
        if (created < d30) return false;
      }
    }

    // Search term
    if (filters.searchTerm.trim()) {
      const term = filters.searchTerm.toLowerCase().trim();
      const code = (order.id || '').toLowerCase();
      const customer = (order.nome_cliente || order.customerName || '').toLowerCase();
      const phone = (order.telefone_cliente || order.customerPhone || '').toLowerCase();
      return code.includes(term) || customer.includes(term) || phone.includes(term);
    }

    return true;
  });

  // Calculate summary metrics
  const historyMetrics = {
    totalCount: filteredHistory.length,
    totalSales: filteredHistory.reduce((acc, o) => {
      const isCancelled = o.orderStatus === 'CANCELLED' || o.status === 'cancelado';
      if (isCancelled) return acc;
      return acc + Number(o.total || o.valor_total || 0);
    }, 0),
    deliveredCount: filteredHistory.filter(o => o.orderStatus !== 'CANCELLED' && o.status !== 'cancelado').length,
    cancelledCount: filteredHistory.filter(o => o.orderStatus === 'CANCELLED' || o.status === 'cancelado').length
  };

  return {
    historyOrders: filteredHistory,
    historyMetrics,
    loading,
    hasMore,
    filters,
    setFilters,
    fetchHistory,
    loadMore: () => fetchHistory(false)
  };
}
