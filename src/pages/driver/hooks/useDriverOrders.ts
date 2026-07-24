import { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { AssignedOrder } from '../types';
import {
  saveCachedOrders,
  getCachedOrders,
  getSavedRouteOrderIds,
  saveSavedRouteOrderIds,
  addOfflineAction
} from '../services/driverOfflineDb';

const normalizeLegacyDeliveryStatus = (statusEntrega?: string, status?: string): string => {
  const se = statusEntrega ? statusEntrega.toLowerCase() : '';
  const sp = status ? status.toLowerCase() : '';

  if (se === 'waiting' || se === 'pending') return 'ASSIGNED';
  if (se === 'accepted') return 'ACCEPTED';
  if (se === 'out_for_delivery' || se === 'delivering' || se === 'picked_up' || sp === 'delivering') return 'IN_TRANSIT';
  if (se === 'delivered' || sp === 'completed' || sp === 'finalizado' || sp === 'entregue') return 'DELIVERED';
  if (se === 'rejected' || se === 'refused' || se === 'not_delivered' || se === 'failed') return 'FAILED';
  if (sp === 'cancelled' || sp === 'cancelado' || se === 'cancelled') return 'CANCELLED';
  return 'ASSIGNED';
};

export const getOrderDeliveryStatus = (order: AssignedOrder): string => {
  return (
    order.deliveryStatus ||
    normalizeLegacyDeliveryStatus(order.status_entrega, order.status)
  );
};

interface UseDriverOrdersOptions {
  user: User | null;
  restaurantId?: string | null;
  isOnline: boolean;
  generateUUID: () => string;
}

export const useDriverOrders = ({
  user,
  restaurantId,
  isOnline,
  generateUUID
}: UseDriverOrdersOptions) => {
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [historicalDeliveries, setHistoricalDeliveries] = useState<AssignedOrder[]>([]);
  const [routeOrderIds, setRouteOrderIds] = useState<string[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const routeKey = useMemo(() => {
    return `${restaurantId || 'rest'}_${user?.uid || 'user'}`;
  }, [restaurantId, user?.uid]);

  // Load persisted route order IDs
  useEffect(() => {
    if (routeKey) {
      getSavedRouteOrderIds(routeKey).then(savedIds => {
        if (savedIds && savedIds.length > 0) {
          setRouteOrderIds(savedIds);
        }
      });
    }
  }, [routeKey]);

  // Firestore real-time listener for assigned orders
  useEffect(() => {
    if (!user || !restaurantId) {
      setOrdersLoading(false);
      return;
    }

    setOrdersLoading(true);

    const ordersRef = collection(db, 'restaurants', restaurantId, 'orders');

    // Query assigned orders by driver UID fields
    const q1 = query(ordersRef, where('assignedDriverId', '==', user.uid));
    const q2 = query(ordersRef, where('driverId', '==', user.uid));
    const q3 = query(ordersRef, where('entregador_id', '==', user.uid));

    // History query from deliveries collection
    const deliveriesRef = collection(db, 'restaurants', restaurantId, 'deliveries');
    const qHistory = query(deliveriesRef, where('responsibleDriverId', '==', user.uid));

    let list1: AssignedOrder[] = [];
    let list2: AssignedOrder[] = [];
    let list3: AssignedOrder[] = [];

    const mergeActiveOrders = () => {
      const mergedObj: Record<string, AssignedOrder> = {};
      [...list1, ...list2, ...list3].forEach(o => {
        if (o && o.id) mergedObj[o.id] = o;
      });
      const merged = Object.values(mergedObj);
      setOrders(merged);
      setOrdersLoading(false);
      saveCachedOrders(merged);
    };

    const unsub1 = onSnapshot(q1, (snap) => {
      list1 = snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedOrder));
      mergeActiveOrders();
    }, (err) => {
      console.warn('[useDriverOrders] Query 1 listener fallback:', err);
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      list2 = snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedOrder));
      mergeActiveOrders();
    }, (err) => {
      console.warn('[useDriverOrders] Query 2 listener fallback:', err);
    });

    const unsub3 = onSnapshot(q3, (snap) => {
      list3 = snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedOrder));
      mergeActiveOrders();
    }, (err) => {
      console.warn('[useDriverOrders] Query 3 listener fallback:', err);
    });

    const unsubHistory = onSnapshot(qHistory, (snap) => {
      const hist = snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedOrder));
      setHistoricalDeliveries(hist);
    }, (err) => {
      console.warn('[useDriverOrders] History listener fallback:', err);
    });

    // Fallback load from cache if offline or listener delay
    if (!isOnline) {
      getCachedOrders().then(cached => {
        if (cached && cached.length > 0) {
          setOrders(cached);
          setOrdersLoading(false);
        }
      });
    }

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsubHistory();
    };
  }, [user, restaurantId, isOnline]);

  // Categorized orders
  const newOrders = useMemo(() => {
    return orders.filter(o => getOrderDeliveryStatus(o) === 'ASSIGNED');
  }, [orders]);

  const routeOrders = useMemo(() => {
    const activeRouteList = orders.filter(o => {
      const s = getOrderDeliveryStatus(o);
      return s === 'ACCEPTED' || s === 'IN_TRANSIT';
    });

    // Sort according to manual routeOrderIds
    if (routeOrderIds.length > 0) {
      activeRouteList.sort((a, b) => {
        const idxA = routeOrderIds.indexOf(a.id);
        const idxB = routeOrderIds.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });
    }

    return activeRouteList;
  }, [orders, routeOrderIds]);

  const historicalOrders = useMemo(() => {
    const activeFinished = orders.filter(o => {
      const s = getOrderDeliveryStatus(o);
      return s === 'DELIVERED' || s === 'FAILED' || s === 'CANCELLED';
    });

    const combinedMap = new Map<string, AssignedOrder>();
    [...historicalDeliveries, ...activeFinished].forEach(o => {
      if (o && o.id) combinedMap.set(o.id, o);
    });

    return Array.from(combinedMap.values()).sort((a, b) => {
      const dateA = a.data_criacao || a.createdAt || '';
      const dateB = b.data_criacao || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });
  }, [orders, historicalDeliveries]);

  // Reordering handler
  const handleMoveOrder = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= routeOrders.length || toIndex < 0 || toIndex >= routeOrders.length) {
      return;
    }

    const newRouteList = [...routeOrders];
    const [moved] = newRouteList.splice(fromIndex, 1);
    newRouteList.splice(toIndex, 0, moved);

    const newIds = newRouteList.map(o => o.id);
    setRouteOrderIds(newIds);
    saveSavedRouteOrderIds(routeKey, newIds);
  }, [routeOrders, routeKey]);

  // Execute order status action
  const executeOrderAction = useCallback(async (
    order: AssignedOrder,
    actionType: 'ACCEPT' | 'REJECT' | 'START' | 'DELIVER' | 'FAIL',
    reason?: string
  ) => {
    if (!user || actionLoadingId) return;

    setActionLoadingId(order.id);
    setActionError(null);
    setActionSuccess(null);

    const clientActionId = generateUUID();

    // Optimistic state update in memory
    const statusMap: Record<string, string> = {
      ACCEPT: 'ACCEPTED',
      REJECT: 'FAILED',
      START: 'IN_TRANSIT',
      DELIVER: 'DELIVERED',
      FAIL: 'FAILED'
    };

    const nextDeliveryStatus = statusMap[actionType];

    setOrders(prev => prev.map(o => {
      if (o.id === order.id) {
        return {
          ...o,
          deliveryStatus: nextDeliveryStatus,
          failureReason: reason || o.failureReason
        };
      }
      return o;
    }));

    if (isOnline) {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/driver/orders/${order.id}/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: actionType,
            reason,
            clientActionId
          })
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || 'Erro ao processar ação no servidor');
        }

        setActionSuccess('Ação realizada com sucesso!');
        setTimeout(() => setActionSuccess(null), 3000);
      } catch (err: any) {
        setActionError(err.message || 'Erro de comunicação com o servidor.');
        setTimeout(() => setActionError(null), 4000);
      } finally {
        setActionLoadingId(null);
      }
    } else {
      // Offline mode: Add to IndexedDB action queue
      await addOfflineAction({
        id: clientActionId,
        clientActionId,
        type: actionType,
        orderId: order.id,
        restaurantId: order.restaurantId || order.restaurante_id,
        driverId: user.uid,
        reason,
        createdAt: new Date().toISOString()
      });

      setActionSuccess('Ação gravada offline! Será enviada ao reconectar.');
      setTimeout(() => setActionSuccess(null), 3000);
      setActionLoadingId(null);
    }
  }, [user, actionLoadingId, isOnline, generateUUID]);

  return {
    orders,
    newOrders,
    routeOrders,
    historicalOrders,
    ordersLoading,
    actionLoadingId,
    actionError,
    actionSuccess,
    handleMoveOrder,
    executeOrderAction
  };
};
