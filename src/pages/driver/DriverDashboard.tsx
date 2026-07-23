import React, { useEffect, useState, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bike, Check, X, LogOut, Radio, Clock, Phone, MapPin, 
  ShoppingBag, ClipboardList, RefreshCw, Wifi, WifiOff,
  Navigation, CheckCircle2, ChevronRight, AlertCircle, Sparkles, PhoneCall,
  ArrowUp, ArrowDown, Map, ExternalLink, Route as RouteIcon, DollarSign,
  AlertTriangle, UserCheck, ShieldCheck, Wallet, FileText
} from 'lucide-react';
import { db, auth } from '../../firebase';
import { 
  collection, doc, getDoc, updateDoc, setDoc,
  query, where, onSnapshot 
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useDriverTracking } from '../../hooks/useDriverTracking';
import { sortOrdersByNearestNeighbor } from '../../utils/geo';
import { generateGoogleMapsUrl } from '../../utils/mapsUrl';
import { isPaymentOnDelivery, getPaymentStatusInfo } from '../../utils/paymentStatus';

const DeliveryTrackingMap = lazy(() => import('../../components/delivery/DeliveryTrackingMap'));

interface AssignedOrder {
  id: string;
  cliente_nome: string;
  cliente_telefone?: string;
  endereco_entrega?: {
    endereco?: string;
    rua?: string;
    numero?: string;
    bairro?: string;
    referencia?: string;
    latitude?: number;
    longitude?: number;
  } | string;
  status: string;
  status_entrega?: string; // 'accepted', 'out_for_delivery', 'delivered', 'not_delivered', 'rejected'
  valor_total: number;
  data_criacao: string;
  driverId?: string;
  entregador_id?: string;
  driverName?: string;
  horario_saida?: string;
  horario_entrega?: string;
  numero_pedido?: number | string;
  forma_pagamento?: string;
  pago?: boolean;
  paymentStatus?: string;
  troco?: string | number;
  observacoes?: string;
  restaurante_id: string;
  paymentCollectedByDriver?: boolean;
}

interface DriverInfo {
  id: string;
  restaurantId: string;
  userId: string;
  name: string;
  nickname?: string;
  phone: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  availabilityStatus: 'OFFLINE' | 'ONLINE' | 'ON_DELIVERY';
  totalDeliveries: number;
  vehicleInfo?: string;
  vehicleType?: string;
  licensePlate?: string;
  currentOrderId?: string | null;
  lastLocation?: any;
  updatedAt?: string;
  activeRoute?: {
    id: string;
    orderIds: string[];
    currentIndex: number;
    createdAt: string;
    startedAt?: string;
  };
}

const FAILURE_REASONS = [
  { id: 'cliente_ausente', label: 'Cliente não localizado / Não atende' },
  { id: 'endereco_nao_encontrado', label: 'Endereço não localizado' },
  { id: 'cliente_recusou', label: 'Cliente recusou o pedido' },
  { id: 'pagamento_nao_realizado', label: 'Pagamento não realizado pelo cliente' },
  { id: 'estabelecimento_fechado', label: 'Estabelecimento fechado / Problema na retirada' },
  { id: 'problema_veiculo', label: 'Problema técnico com veículo' },
  { id: 'outro', label: 'Outro motivo (Especifique)' },
];

export default function DriverDashboard() {
  const { user, profile, isDriver, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Driver core state
  const [driverDoc, setDriverDoc] = useState<DriverInfo | null>(null);
  const [orders, setOrders] = useState<AssignedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Connection state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // Active UI tab: novas | andamento | finalizadas | conta
  const [activeTab, setActiveTab] = useState<'novas' | 'andamento' | 'finalizadas' | 'conta'>('novas');
  
  // Action state loader
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modals state
  const [confirmPaymentModalOrder, setConfirmPaymentModalOrder] = useState<AssignedOrder | null>(null);
  const [paymentNotCollectedReason, setPaymentNotCollectedReason] = useState<string>('');
  const [isSubmittingPaymentAction, setIsSubmittingPaymentAction] = useState(false);

  const [failureModalOrder, setFailureModalOrder] = useState<AssignedOrder | null>(null);
  const [selectedFailureReason, setSelectedFailureReason] = useState<string>('cliente_ausente');
  const [customFailureText, setCustomFailureText] = useState<string>('');
  const [isSubmittingFailure, setIsSubmittingFailure] = useState(false);

  // Route builder state
  const [routeOrderIds, setRouteOrderIds] = useState<string[]>([]);
  const [showMapPreview, setShowMapPreview] = useState(false);

  // Active route tracking
  const activeDelivery = useMemo(() => {
    return orders.find(o => o.status_entrega === 'out_for_delivery' || o.status === 'delivering');
  }, [orders]);

  const activeRouteIds = useMemo(() => {
    if (driverDoc?.activeRoute?.orderIds) {
      return driverDoc.activeRoute.orderIds;
    }
    return activeDelivery ? [activeDelivery.id] : [];
  }, [driverDoc?.activeRoute, activeDelivery]);

  const isOnDelivery = driverDoc?.availabilityStatus === 'ON_DELIVERY';

  const { gpsStatus, isTracking } = useDriverTracking(
    isOnDelivery,
    () => activeRouteIds,
    async () => user?.getIdToken() || null
  );

  // Metrics computation
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const deliveriesToday = useMemo(() => {
    return orders.filter(o => {
      const isDone = o.status_entrega === 'delivered' || o.status === 'completed' || o.status === 'finalizado';
      if (!isDone) return false;
      const createdDate = o.data_criacao ? o.data_criacao.split('T')[0] : '';
      return createdDate === todayStr;
    }).length;
  }, [orders, todayStr]);

  const pendingSettlementAmount = useMemo(() => {
    return orders.reduce((sum, o) => {
      const isDelivered = o.status_entrega === 'delivered' || o.status === 'completed' || o.status === 'finalizado' || o.status === 'entregue';
      const isAwaitingSettlement = o.paymentStatus === 'AWAITING_DRIVER_SETTLEMENT' || (o.paymentCollectedByDriver && !o.pago);
      if (isDelivered && isAwaitingSettlement) {
        return sum + Number(o.valor_total || 0);
      }
      return sum;
    }, 0);
  }, [orders]);

  const inRouteCount = useMemo(() => {
    return orders.filter(o => o.status_entrega === 'out_for_delivery' || o.status === 'delivering').length;
  }, [orders]);

  // 1. Monitor network state
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setError(null);
      triggerOfflineSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. Offline sync check
  const triggerOfflineSync = async () => {
    const queue = getPendingQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    setSuccess('Sincronizando atualizações offline...');
    
    let processedCount = 0;
    const remaining: any[] = [];

    for (const item of queue) {
      try {
        if (item.type === 'driver_action') {
          const token = await user?.getIdToken();
          const res = await fetch(`/api/driver/orders/${item.orderId}/action`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              action: item.action,
              failureReason: item.failureReason
            })
          });
          if (!res.ok) {
            const errJson = await res.json();
            throw new Error(errJson.error || 'Erro na sincronização offline');
          }
          processedCount++;
        } else if (item.type === 'order_status') {
          const orderRef = doc(db, 'orders', item.orderId);
          await updateDoc(orderRef, item.data);
          processedCount++;
        } else if (item.type === 'driver_status') {
          const driverRef = doc(db, 'restaurants', item.restaurantId, 'drivers', item.driverId);
          await updateDoc(driverRef, item.data);
          processedCount++;
        }
      } catch (err) {
        console.error('Failed to sync offline item:', item, err);
        remaining.push(item);
      }
    }

    localStorage.setItem('@qfomeai:offline_delivery_queue', JSON.stringify(remaining));
    setIsSyncing(false);
    
    if (processedCount > 0) {
      setSuccess(`${processedCount} atualização(ões) sincronizada(s) com sucesso!`);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setSuccess(null);
    }
  };

  const getPendingQueue = (): any[] => {
    try {
      const q = localStorage.getItem('@qfomeai:offline_delivery_queue');
      return q ? JSON.parse(q) : [];
    } catch {
      return [];
    }
  };

  const savePendingQueue = (item: any) => {
    const currentQueue = getPendingQueue();
    currentQueue.push({ ...item, timestamp: new Date().toISOString() });
    localStorage.setItem('@qfomeai:offline_delivery_queue', JSON.stringify(currentQueue));
  };

  // 3. Driver role enforcement & basic validation
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    // Block clients/restaurants from here
    if (!isDriver) {
      navigate('/');
    }
  }, [user, isDriver, authLoading, navigate]);

  // Loading indicator for authorization phase
  const isDriverProfileActive = profile?.active !== false && profile?.status_conta !== 'bloqueado';

  // 4. Fetch Driver Profile & Subscribed Orders from real-time database
  useEffect(() => {
    if (!user || !profile || !isDriverProfileActive) return;

    const restaurantId = profile.restaurantId;
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    // Subscribe to driver subcollection under restaurants
    const driverRef = doc(db, 'restaurants', restaurantId, 'drivers', user.uid);
    setLoading(true);

    const unsubDriver = onSnapshot(driverRef, (snap) => {
      if (snap.exists()) {
        const dData = snap.data() as DriverInfo;
        setDriverDoc(dData);
        // Save to cache
        localStorage.setItem(`@qfomeai:cached_driver_doc_${user.uid}`, JSON.stringify(dData));
      } else {
        // Fallback or create if missing? If it does not exist, let's gracefully handle or default
        const defaultDriver: DriverInfo = {
          id: user.uid,
          restaurantId,
          userId: user.uid,
          name: profile.nome || user.displayName || 'Entregador',
          phone: profile.telefone || '',
          email: user.email || '',
          status: 'ACTIVE',
          availabilityStatus: 'OFFLINE',
          totalDeliveries: 0
        };
        setDriverDoc(defaultDriver);
      }
    }, (error) => {
      console.warn('Silent fallback for driver doc listener:', error);
      // Try local storage cache
      try {
        const cached = localStorage.getItem(`@qfomeai:cached_driver_doc_${user.uid}`);
        if (cached) setDriverDoc(JSON.parse(cached));
      } catch {}
    });

    // Subscribe to orders assigned or assignable for this driver
    // Fast query setup: we listen to restaurant orders or active global orders filter
    // Let's use orders subcollection or active query on orders
    const ordersRef = collection(db, 'restaurants', restaurantId, 'orders');
    const q = query(ordersRef);

    const unsubOrders = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AssignedOrder[];

      // Drivers can only see:
      // 1. Orders assigned with their driverId (or code entregador_id)
      const filteredOrders = allOrders.filter(order => 
        order.driverId === user.uid || 
        order.entregador_id === user.uid
      );

      setOrders(filteredOrders);
      setLoading(false);
      // Cache orders
      localStorage.setItem(`@qfomeai:cached_orders_${user.uid}`, JSON.stringify(filteredOrders));
    }, (err) => {
      console.error('Error listening to delivery orders:', err);
      // Fallback cache loading
      try {
        const cachedO = localStorage.getItem(`@qfomeai:cached_orders_${user.uid}`);
        if (cachedO) {
          setOrders(JSON.parse(cachedO));
        }
      } catch {}
      setLoading(false);
    });

    return () => {
      unsubDriver();
      unsubOrders();
    };
  }, [user, profile, isDriverProfileActive]);

  // 6. Partition orders into tabs
  const tabOrders = useMemo(() => {
    return orders.filter(order => {
      const statusEntrega = order.status_entrega || 'pending';
      const statusPedido = order.status;

      if (activeTab === 'novas') {
        // Assigned but not out for delivery yet
        return statusEntrega === 'accepted' || statusEntrega === 'pending';
      } else if (activeTab === 'andamento') {
        // Out for delivery
        return statusEntrega === 'out_for_delivery';
      } else {
        // Completed/Failed
        return statusEntrega === 'delivered' || statusEntrega === 'not_delivered' || statusEntrega === 'rejected' || statusPedido === 'completed' || statusPedido === 'finalizado';
      }
    });
  }, [orders, activeTab]);

  // 7. Status change actions
  const handleUpdateStatus = async (order: AssignedOrder, actionType: 'accept' | 'reject' | 'deliver' | 'complete' | 'failed', reason?: string) => {
    if (!user) return;

    // Check if finalizing delivery needs payment confirmation modal
    if (actionType === 'complete') {
      const needsPaymentModal = isPaymentOnDelivery(order.forma_pagamento, order.pago);
      if (needsPaymentModal) {
        setConfirmPaymentModalOrder(order);
        setPaymentNotCollectedReason('');
        return;
      }
    }

    // Check if failure needs reason selection modal
    if (actionType === 'failed' && !reason) {
      setFailureModalOrder(order);
      setSelectedFailureReason('cliente_ausente');
      setCustomFailureText('');
      return;
    }
    
    setActionLoadingId(order.id);
    setError(null);
    setSuccess(null);

    const actionMap: Record<string, 'ACCEPT' | 'REJECT' | 'START' | 'DELIVER' | 'FAIL'> = {
      accept: 'ACCEPT',
      reject: 'REJECT',
      deliver: 'START',
      complete: 'DELIVER',
      failed: 'FAIL'
    };

    const serverAction = actionMap[actionType];

    if (isOnline) {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/driver/orders/${order.id}/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: serverAction,
            failureReason: reason
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Erro ao atualizar entrega');
        }

        setSuccess('Status atualizado com sucesso!');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err: any) {
        console.error('Error updating delivery status via server:', err);
        setError(err.message || 'Erro ao atualizar no servidor.');
      } finally {
        setActionLoadingId(null);
      }
    } else {
      // Offline Flow
      savePendingQueue({
        type: 'driver_action',
        orderId: order.id,
        action: serverAction,
        failureReason: reason
      });

      setSuccess('Modo Offline: Atualização agendada para sincronia!');
      setTimeout(() => setSuccess(null), 4000);
      setActionLoadingId(null);
    }
  };

  const handleConfirmPaymentAndDeliver = async (collected: boolean) => {
    if (!confirmPaymentModalOrder || !user) return;

    const order = confirmPaymentModalOrder;
    setIsSubmittingPaymentAction(true);
    setError(null);
    setSuccess(null);

    try {
      if (isOnline) {
        const token = await user.getIdToken();
        const res = await fetch(`/api/driver/orders/${order.id}/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'DELIVER',
            paymentCollectedByDriver: collected,
            paymentNotCollectedReason: collected ? '' : paymentNotCollectedReason
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao finalizar entrega');
        }

        setSuccess(collected ? 'Entrega e recebimento confirmados!' : 'Entrega finalizada. Pagamento não recebido registrado.');
        setTimeout(() => setSuccess(null), 3500);
      } else {
        savePendingQueue({
          type: 'driver_action',
          orderId: order.id,
          action: 'DELIVER',
          paymentCollectedByDriver: collected,
          paymentNotCollectedReason: collected ? '' : paymentNotCollectedReason
        });
        setSuccess('Offline: Entrega registrada e aguardando sincronia!');
        setTimeout(() => setSuccess(null), 3500);
      }

      setConfirmPaymentModalOrder(null);
    } catch (err: any) {
      console.error('Error confirming delivery payment:', err);
      setError(err.message || 'Erro ao confirmar entrega.');
    } finally {
      setIsSubmittingPaymentAction(false);
    }
  };

  const handleConfirmFailure = async () => {
    if (!failureModalOrder || !user) return;

    const order = failureModalOrder;
    const finalReason = selectedFailureReason === 'outro' 
      ? (customFailureText.trim() || 'Outro motivo não especificado')
      : (FAILURE_REASONS.find(r => r.id === selectedFailureReason)?.label || selectedFailureReason);

    setIsSubmittingFailure(true);
    setError(null);

    try {
      if (isOnline) {
        const token = await user.getIdToken();
        const res = await fetch(`/api/driver/orders/${order.id}/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'FAIL',
            failureReason: finalReason
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erro ao registrar não entrega');
        }

        setSuccess('Não entrega registrada com sucesso.');
        setTimeout(() => setSuccess(null), 3500);
      } else {
        savePendingQueue({
          type: 'driver_action',
          orderId: order.id,
          action: 'FAIL',
          failureReason: finalReason
        });
        setSuccess('Offline: Motivo de falha salvo e aguardando conexão.');
        setTimeout(() => setSuccess(null), 3500);
      }

      setFailureModalOrder(null);
    } catch (err: any) {
      console.error('Error recording delivery failure:', err);
      setError(err.message || 'Erro ao registrar motivo de falha.');
    } finally {
      setIsSubmittingFailure(false);
    }
  };

  // 8. Availability check toggler
  const handleToggleOnline = async () => {
    if (!user || !profile?.restaurantId || !driverDoc) return;

    const nextStatus = driverDoc.availabilityStatus === 'OFFLINE' ? 'ONLINE' : 'OFFLINE';
    setLoading(true);

    if (isOnline) {
      try {
        const driverRef = doc(db, 'restaurants', profile.restaurantId, 'drivers', user.uid);
        await updateDoc(driverRef, {
          availabilityStatus: nextStatus,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error toggling online state:', err);
        setError('Não foi possível atualizar o status de disponibilidade.');
      } finally {
        setLoading(false);
      }
    } else {
      // Offline queue availability
      savePendingQueue({
        type: 'driver_status',
        restaurantId: profile.restaurantId,
        driverId: user.uid,
        data: {
          availabilityStatus: nextStatus,
          updatedAt: new Date().toISOString()
        }
      });

      // Optimistic state update
      setDriverDoc(prev => prev ? { ...prev, availabilityStatus: nextStatus } : null);
      setSuccess('Status de disponibilidade salvo offline!');
      setTimeout(() => setSuccess(null), 3500);
      setLoading(false);
    }
  };

  // 9. Standard Logout function
  const handleSignOut = async () => {
    try {
      await auth.signOut();
      navigate('/login');
    } catch (err) {
      console.error(err);
    }
  };

  const renderAddress = (addrObj: any) => {
    if (!addrObj) return 'Endereço não disponível';
    if (typeof addrObj === 'string') return addrObj;
    
    const { endereco, numero, bairro, referencia, rua } = addrObj;
    const street = endereco || rua || '';
    return `${street}, nº ${numero || "S/N"} - ${bairro || ''}${referencia ? ` (Ref: ${referencia})` : ''}`;
  };

  const acceptedOrders = useMemo(() => {
    return orders.filter(o => o.status_entrega === 'accepted' || (o.driverId === user?.uid && o.status_entrega === 'pending'));
  }, [orders, user?.uid]);

  useEffect(() => {
    const acceptedIds = acceptedOrders.map(o => o.id);
    setRouteOrderIds(prev => {
      const validPrev = prev.filter(id => acceptedIds.includes(id));
      const newIds = acceptedIds.filter(id => !validPrev.includes(id));
      return [...validPrev, ...newIds];
    });
  }, [acceptedOrders]);

  const moveRouteOrder = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= routeOrderIds.length) return;
    const next = [...routeOrderIds];
    const temp = next[index];
    next[index] = next[targetIdx];
    next[targetIdx] = temp;
    setRouteOrderIds(next);
  };

  const handleOptimizeRoute = () => {
    const driverLat = driverDoc?.lastLocation?.latitude || -23.55052;
    const driverLng = driverDoc?.lastLocation?.longitude || -46.633308;

    const points = acceptedOrders.map(o => {
      const addr = typeof o.endereco_entrega === 'object' ? (o.endereco_entrega as any) : null;
      return {
        id: o.id,
        latitude: addr?.latitude || driverLat + (Math.random() - 0.5) * 0.02,
        longitude: addr?.longitude || driverLng + (Math.random() - 0.5) * 0.02
      };
    });

    const sortedPoints = sortOrdersByNearestNeighbor(driverLat, driverLng, points);
    setRouteOrderIds(sortedPoints.map(p => p.id));
    setSuccess('Rota otimizada com a menor distância!');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleStartRoute = async () => {
    if (!user || routeOrderIds.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/driver/routes/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          orderedOrderIds: routeOrderIds,
          clientActionId: `route_${Date.now()}`
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao iniciar rota');
      }

      setSuccess('Rota iniciada com sucesso! Navegação ativada.');
      setActiveTab('andamento');
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      console.error('Error starting route:', err);
      setError(err.message || 'Erro ao iniciar rota.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenGoogleMaps = (targetOrders: AssignedOrder[]) => {
    if (!targetOrders || targetOrders.length === 0) return;

    const driverPt = driverDoc?.lastLocation?.latitude ? {
      latitude: driverDoc.lastLocation.latitude,
      longitude: driverDoc.lastLocation.longitude
    } : null;

    const destinations = targetOrders.map(o => {
      const addrStr = renderAddress(o.endereco_entrega);
      const addrObj = typeof o.endereco_entrega === 'object' ? (o.endereco_entrega as any) : null;
      return {
        latitude: addrObj?.latitude || 0,
        longitude: addrObj?.longitude || 0,
        address: addrStr
      };
    });

    const urls = generateGoogleMapsUrl(driverPt, destinations);
    if (urls.length > 0) {
      window.open(urls[0], '_blank');
    }
  };

  // Check if driver block overlay screen is needed
  if (!authLoading && user && !isDriverProfileActive) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl border border-stone-200 p-8 text-center shadow-lg">
          <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-200 animate-bounce">
            <X className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-stone-900 leading-snug">Acesso Bloqueado</h2>
          <p className="text-stone-500 mt-3 text-sm leading-relaxed font-semibold">
            Seu acesso está inativo. Fale com o restaurante.
          </p>
          <button
            onClick={handleSignOut}
            className="mt-8 w-full py-4 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-[20px] transition-all flex items-center justify-center gap-2"
          >
            <LogOut className="w-4.5 h-4.5" />
            <span>Fazer Logout</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20 select-none font-sans flex flex-col">
      {/* 1. Header/Toolbar */}
      <header className="bg-white border-b border-stone-200/80 sticky top-0 z-30 px-4 py-3.5 shadow-xs">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-2xl border border-emerald-200/50">
              <Bike className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold tracking-widest text-stone-400">Entregador</p>
              <h1 className="text-base font-black text-stone-800 leading-none">
                {profile?.nome || 'Minha Conta'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Connection badge status */}
            <div className={`p-1.5 rounded-lg border ${isOnline ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`} title={isOnline ? 'Online' : 'Trabalhando Offline'}>
              {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            </div>
            
            <button
              onClick={handleSignOut}
              className="p-2.5 bg-stone-50 hover:bg-red-50 hover:text-red-600 rounded-xl border border-stone-200 text-stone-600 transition-all active:scale-95"
              title="Desconectar"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main content container, constraint mobile-first */}
      <main className="max-w-md w-full mx-auto px-4 pt-6 space-y-6 flex-grow ">
        {/* Status Messaging feedback */}
        {error && (
          <div className="bg-red-50 border border-red-100/60 text-red-600 p-4 rounded-2xl flex items-start gap-2.5 text-xs font-bold leading-normal">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="bg-emerald-50 border border-emerald-100/60 text-emerald-700 p-4 rounded-2xl flex items-start gap-2.5 text-xs font-bold leading-normal">
            <Check className="w-5 h-5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* 3. Availability Control Dashboard Card */}
        <div className="bg-white border border-stone-200 rounded-[2rem] p-5 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-stone-400 font-bold text-[10px] tracking-wider uppercase">Disponibilidade</span>
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${
                  driverDoc?.availabilityStatus === 'ONLINE' ? 'bg-emerald-500 animate-ping' :
                  driverDoc?.availabilityStatus === 'ON_DELIVERY' ? 'bg-blue-500 animate-pulse' :
                  'bg-stone-300'
                }`} />
                <h3 className="font-extrabold text-stone-850 text-lg">
                  {driverDoc?.availabilityStatus === 'ONLINE' ? 'Disponível / Online' :
                   driverDoc?.availabilityStatus === 'ON_DELIVERY' ? 'Em Rota de Entrega' :
                   'Desconectado'
                  }
                </h3>
              </div>
            </div>

            <button
              onClick={handleToggleOnline}
              disabled={driverDoc?.availabilityStatus === 'ON_DELIVERY'}
              className={`px-5 py-3.5 rounded-2xl text-xs font-bold font-black uppercase tracking-wider transition-all border active:scale-95 disabled:opacity-50 ${
                driverDoc?.availabilityStatus === 'OFFLINE' 
                  ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700 shadow-md shadow-emerald-50' 
                  : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              {driverDoc?.availabilityStatus === 'OFFLINE' ? 'Ficar Online' : 'Ficar Offline'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-stone-100">
            <div className="bg-stone-50 rounded-2xl p-3 text-center border border-stone-100">
              <span className="text-stone-400 font-bold text-[9px] tracking-widest uppercase block">Hoje</span>
              <p className="text-xl font-black text-stone-800 mt-0.5">{deliveriesToday}</p>
            </div>

            <div className="bg-stone-50 rounded-2xl p-3 text-center border border-stone-100">
              <span className="text-stone-400 font-bold text-[9px] tracking-widest uppercase block">Em Rota</span>
              <p className="text-xl font-black text-blue-600 mt-0.5">{inRouteCount}</p>
            </div>

            <div className="bg-emerald-50/60 rounded-2xl p-3 text-center border border-emerald-100">
              <span className="text-emerald-600 font-bold text-[9px] tracking-widest uppercase block">A Repassar</span>
              <p className="text-sm font-black text-emerald-800 mt-0.5 truncate">
                {pendingSettlementAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>

            <div className="bg-stone-50 rounded-2xl p-3 text-center border border-stone-100 flex flex-col justify-center items-center">
              <span className="text-stone-400 font-bold text-[9px] tracking-widest uppercase">GPS</span>
              <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold mt-1 px-2 py-0.5 rounded-full ${
                isTracking ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 animate-pulse' : 'bg-stone-100 text-stone-400 border border-stone-200/60'
              }`}>
                <Navigation className="w-2.5 h-2.5 rotate-45" />
                <span>{isTracking ? 'Ativo' : 'Pausado'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 4. Highlighted Active Delivery Panel */}
        {activeDelivery && (
          <div className="bg-stone-900 border border-stone-800 rounded-[2.2rem] p-6 text-white space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-emerald-600 text-[10px] font-black px-2.5 py-1 rounded-lg tracking-widest uppercase">EM ANDAMENTO</span>
              </div>
              <span className="text-xs font-bold text-stone-400">
                #{activeDelivery.numero_pedido || activeDelivery.id.substring(0, 6).toUpperCase()}
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Cliente</p>
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-extrabold text-white">{activeDelivery.cliente_nome}</h4>
                  {activeDelivery.cliente_telefone && (
                    <a 
                      href={`tel:${activeDelivery.cliente_telefone}`}
                      className="inline-flex items-center gap-1 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-400 transition-colors"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-white" />
                      <span>Ligar</span>
                    </a>
                  )}
                </div>
              </div>

              <div>
                <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Endereço de Entrega</p>
                <p className="text-sm text-stone-200 font-medium leading-relaxed mt-0.5">
                  {renderAddress(activeDelivery.endereco_entrega)}
                </p>
              </div>

              {/* Payment Instruction Banner */}
              {(() => {
                const needsCollection = isPaymentOnDelivery(activeDelivery.forma_pagamento, activeDelivery.pago);
                if (!needsCollection) {
                  return (
                    <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 p-3.5 rounded-2xl space-y-1">
                      <div className="flex items-center gap-1.5 font-extrabold text-emerald-300 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>PAGAMENTO JÁ CONFIRMADO ONLINE</span>
                      </div>
                      <p className="text-[11px] text-emerald-100/90 font-medium">
                        Não cobrar nenhum valor do cliente. O pedido já foi pago via gateway/PIX.
                      </p>
                    </div>
                  );
                }

                const isDinheiro = (activeDelivery.forma_pagamento || '').toLowerCase().includes('dinheiro');
                const trocoVal = activeDelivery.troco;

                return (
                  <div className="bg-amber-500/15 border border-amber-500/30 text-amber-200 p-3.5 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-extrabold text-amber-300 text-xs">
                        <DollarSign className="w-4 h-4 text-amber-400" />
                        <span>COBRANÇA NA ENTREGA</span>
                      </div>
                      <span className="font-black text-rose-400 text-base">
                        {activeDelivery.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>

                    <p className="text-xs text-amber-100 font-bold">
                      Forma: <span className="uppercase text-white">{activeDelivery.forma_pagamento || 'Dinheiro / Cartão'}</span>
                    </p>

                    {isDinheiro && trocoVal && (
                      <div className="bg-amber-950/50 p-2.5 rounded-xl border border-amber-500/20 text-xs text-amber-200 space-y-0.5">
                        <p className="font-bold">Troco informado pelo cliente: <span className="text-white">R$ {trocoVal}</span></p>
                        {typeof trocoVal === 'string' && !isNaN(parseFloat(trocoVal.replace(',', '.'))) && (
                          <p className="text-[11px] text-amber-300">
                            Troco a levar: <strong className="text-emerald-300 font-extrabold">R$ {(parseFloat(trocoVal.replace(',', '.')) - activeDelivery.valor_total).toFixed(2)}</strong>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeDelivery.observacoes && (
                <div className="bg-stone-800 border border-stone-700 text-stone-200 p-3 rounded-2xl text-xs">
                  <strong>Obs:</strong> {activeDelivery.observacoes}
                </div>
              )}

              {/* Navigation & Map controls */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={() => handleOpenGoogleMaps([activeDelivery])}
                  className="py-3 px-4 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir Google Maps</span>
                </button>

                <button
                  onClick={() => setShowMapPreview(!showMapPreview)}
                  className="py-3 px-4 bg-white/10 hover:bg-white/20 border border-white/15 text-stone-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  <Map className="w-3.5 h-3.5" />
                  <span>{showMapPreview ? 'Ocultar Mapa' : 'Ver Mapa'}</span>
                </button>
              </div>

              {showMapPreview && (
                <div className="pt-2">
                  <Suspense fallback={<div className="h-48 bg-stone-800 rounded-2xl animate-pulse flex items-center justify-center text-xs text-stone-400">Carregando mapa...</div>}>
                    <DeliveryTrackingMap
                      driverLocation={driverDoc?.lastLocation ? {
                        latitude: driverDoc.lastLocation.latitude,
                        longitude: driverDoc.lastLocation.longitude,
                        label: 'Sua Posição'
                      } : null}
                      customerLocation={typeof activeDelivery.endereco_entrega === 'object' && (activeDelivery.endereco_entrega as any)?.latitude ? {
                        latitude: (activeDelivery.endereco_entrega as any).latitude,
                        longitude: (activeDelivery.endereco_entrega as any).longitude,
                        label: activeDelivery.cliente_nome
                      } : null}
                      height="220px"
                    />
                  </Suspense>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => handleUpdateStatus(activeDelivery, 'failed')}
                disabled={actionLoadingId === activeDelivery.id}
                className="py-4 border border-white/15 bg-white/5 hover:bg-rose-500/15 hover:border-rose-500/30 font-bold rounded-2xl text-xs uppercase tracking-wider text-white transition-all active:scale-[0.98]"
              >
                Não Entregue
              </button>

              <button
                onClick={() => handleUpdateStatus(activeDelivery, 'complete')}
                disabled={actionLoadingId === activeDelivery.id}
                className="py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/20"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Finalizar Entrega
              </button>
            </div>
          </div>
        )}

        {/* 5. General tab list header */}
        <div className="space-y-4">
          <div className="grid grid-cols-4 border border-stone-200/85 bg-white p-1 rounded-2xl shadow-xs text-center">
            <button
              onClick={() => setActiveTab('novas')}
              className={`py-3 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'novas' ? 'bg-stone-900 text-white font-extrabold shadow-sm' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Novas
            </button>
            <button
              onClick={() => setActiveTab('andamento')}
              className={`py-3 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'andamento' ? 'bg-stone-900 text-white font-extrabold shadow-sm' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Rota
            </button>
            <button
              onClick={() => setActiveTab('finalizadas')}
              className={`py-3 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'finalizadas' ? 'bg-stone-900 text-white font-extrabold shadow-sm' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Histórico
            </button>
            <button
              onClick={() => setActiveTab('conta')}
              className={`py-3 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'conta' ? 'bg-stone-900 text-white font-extrabold shadow-sm' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Conta
            </button>
          </div>

          {/* Account Tab Content */}
          {activeTab === 'conta' && (
            <div className="bg-white border border-stone-200 rounded-[2rem] p-6 space-y-6 shadow-sm">
              <div className="flex items-center gap-4 border-b border-stone-100 pb-5">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-black text-2xl border border-emerald-200">
                  {driverDoc?.name?.charAt(0) || 'E'}
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-850 text-lg">{driverDoc?.name || profile?.nome}</h3>
                  <p className="text-xs text-stone-500 font-semibold">{driverDoc?.phone || profile?.telefone}</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">{driverDoc?.email || user?.email}</p>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-100 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">Dados do Veículo</span>
                  <p className="font-extrabold text-stone-800">
                    {driverDoc?.vehicleType || 'Motocicleta'} {driverDoc?.vehicleInfo ? `- ${driverDoc.vehicleInfo}` : ''}
                  </p>
                  {driverDoc?.licensePlate && (
                    <p className="text-stone-600 font-bold bg-white px-2.5 py-1 rounded-lg border border-stone-200 inline-block">
                      Placa: {driverDoc.licensePlate}
                    </p>
                  )}
                </div>

                <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-100 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">Resumo do Perfil</span>
                  <div className="flex justify-between items-center text-stone-700">
                    <span>Total Histórico de Entregas:</span>
                    <strong className="text-stone-900 font-extrabold">{driverDoc?.totalDeliveries || 0}</strong>
                  </div>
                  <div className="flex justify-between items-center text-stone-700">
                    <span>Concluídas Hoje:</span>
                    <strong className="text-emerald-700 font-extrabold">{deliveriesToday}</strong>
                  </div>
                  <div className="flex justify-between items-center text-stone-700">
                    <span>Valores a Repassar:</span>
                    <strong className="text-rose-600 font-extrabold">
                      {pendingSettlementAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="w-full py-4 bg-stone-100 hover:bg-red-50 hover:text-red-600 text-stone-700 font-extrabold rounded-2xl border border-stone-200 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
              >
                <LogOut className="w-4 h-4" />
                <span>Encerrar Sessão</span>
              </button>
            </div>
          )}

          {/* Montar Rota Section when in 'novas' tab and there are accepted orders */}
          {activeTab === 'novas' && acceptedOrders.length > 0 && (
            <div className="bg-white border-2 border-emerald-500/30 rounded-[2rem] p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RouteIcon className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-extrabold text-stone-900 text-sm">
                    Montar Rota ({routeOrderIds.length} {routeOrderIds.length === 1 ? 'pedido' : 'pedidos'})
                  </h3>
                </div>

                <button
                  onClick={handleOptimizeRoute}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-extrabold rounded-xl border border-emerald-200 transition-all flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Otimizar Sequência</span>
                </button>
              </div>

              <div className="space-y-2">
                {routeOrderIds.map((id, index) => {
                  const order = acceptedOrders.find(o => o.id === id);
                  if (!order) return null;

                  return (
                    <div 
                      key={id}
                      className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200/80 rounded-xl text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center font-black text-[11px] shrink-0">
                          {index + 1}
                        </span>
                        <div className="truncate">
                          <p className="font-extrabold text-stone-800 truncate">
                            #{order.numero_pedido || order.id.slice(-6).toUpperCase()} - {order.cliente_nome}
                          </p>
                          <p className="text-[10px] text-stone-500 truncate">
                            {renderAddress(order.endereco_entrega)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={() => moveRouteOrder(index, 'up')}
                          disabled={index === 0}
                          className="p-1.5 bg-white border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30"
                          title="Mover para cima"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveRouteOrder(index, 'down')}
                          disabled={index === routeOrderIds.length - 1}
                          className="p-1.5 bg-white border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30"
                          title="Mover para baixo"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-stone-100">
                <button
                  onClick={() => handleOpenGoogleMaps(acceptedOrders)}
                  className="py-3.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Abrir Rota Externa</span>
                </button>

                <button
                  onClick={handleStartRoute}
                  disabled={routeOrderIds.length === 0}
                  className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-100 disabled:opacity-50"
                >
                  <Navigation className="w-4 h-4 rotate-45 stroke-[2.5]" />
                  <span>Iniciar Rota</span>
                </button>
              </div>
            </div>
          )}

          {/* 6. Tabs content items */}
          {activeTab !== 'conta' && (
            loading ? (
              <div className="flex flex-col items-center justify-center py-12 bg-white rounded-[2.2rem] border border-stone-200/80 shadow-xs">
                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
                <p className="text-stone-500 font-bold text-xs">Atualizando pedidos em tempo real...</p>
              </div>
            ) : tabOrders.length === 0 ? (
              <div className="p-10 bg-white rounded-[2.2rem] border border-stone-200/80 text-center shadow-xs">
                <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-stone-100">
                  <ClipboardList className="w-7 h-7 text-stone-300" />
                </div>
                <h3 className="text-sm font-bold text-stone-800">Nenhum pedido nesta aba</h3>
                <p className="text-stone-500/80 mt-1 max-w-xs mx-auto leading-normal text-[11px] font-semibold">
                  Sempre que novas entregas forem vinculadas a você, elas aparecerão aqui!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {tabOrders.map((order) => {
                  const statusEntrega = order.status_entrega || 'pending';
                  const isItemActionLoading = actionLoadingId === order.id;

                  return (
                    <div 
                      key={order.id}
                      className="bg-white border border-stone-200 rounded-[2rem] p-5 space-y-4 shadow-sm hover:shadow-md transition-all animate-in fade-in duration-200"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                        <div className="flex items-center gap-2">
                          <span className="bg-stone-100 text-stone-800 text-[10px] font-black px-2.5 py-1 rounded-lg">
                            #{order.numero_pedido || order.id.substring(0, 6).toUpperCase()}
                          </span>
                          <span className="text-[10px] text-stone-400 font-bold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {order.data_criacao ? new Date(order.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>

                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                          statusEntrega === 'delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                          statusEntrega === 'out_for_delivery' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                          statusEntrega === 'accepted' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                          statusEntrega === 'not_delivered' ? 'bg-red-50 text-red-700 border-red-100' :
                          'bg-stone-50 text-stone-600 border-stone-150'
                        }`}>
                          {statusEntrega === 'delivered' ? 'Entregue' :
                           statusEntrega === 'out_for_delivery' ? 'Em Entrega' :
                           statusEntrega === 'accepted' ? 'Aceito' :
                           statusEntrega === 'not_delivered' ? 'Falhado' :
                           statusEntrega === 'rejected' ? 'Rejeitado_E' :
                           'Aguardando'
                          }
                        </span>
                      </div>

                      <div className="space-y-2.5 text-xs text-stone-600">
                        <div>
                          <p className="text-stone-400 text-[9px] font-bold uppercase tracking-wider">Cliente / Contato</p>
                          <h4 className="font-extrabold text-stone-800 text-sm mt-0.5">{order.cliente_nome}</h4>
                          {order.cliente_telefone && (
                            <a 
                              href={`tel:${order.cliente_telefone}`}
                              className="text-emerald-600 font-bold flex items-center gap-1 mt-1 hover:underline"
                            >
                              <Phone className="w-3.5 h-3.5 text-emerald-650" />
                              <span>{order.cliente_telefone}</span>
                            </a>
                          )}
                        </div>

                        <div>
                          <p className="text-stone-400 text-[9px] font-bold uppercase tracking-wider">Endereço Completo</p>
                          <p className="font-semibold text-stone-700 mt-0.5 leading-relaxed">
                            {renderAddress(order.endereco_entrega)}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-stone-50 border border-stone-100 p-2.5 rounded-2xl">
                          <div>
                            <p className="text-[9px] text-stone-400 font-bold uppercase">Forma de pagamento</p>
                            <p className="font-bold text-stone-700 mt-0.5">{order.forma_pagamento || 'Pago Online'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-stone-400 font-bold uppercase">Valor total</p>
                            <p className="font-extrabold text-rose-500 mt-0.5 text-sm">
                              {order.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                          </div>
                        </div>

                        {order.observacoes && (
                          <div className="bg-amber-500/5 border border-amber-500/10 text-amber-800 p-2.5 rounded-xl text-[11px] font-medium leading-relaxed">
                            <strong>Observações:</strong> {order.observacoes}
                          </div>
                        )}
                      </div>

                      {/* Action buttons depending on state */}
                      {activeTab === 'novas' && statusEntrega === 'pending' && (
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-stone-100">
                          <button
                            onClick={() => handleUpdateStatus(order, 'reject')}
                            disabled={isItemActionLoading}
                            className="py-3.5 bg-stone-50 hover:bg-stone-100 border border-stone-250 text-stone-700 text-xs font-bold rounded-2xl active:scale-95 transition-all text-center"
                          >
                            Recusar
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(order, 'accept')}
                            disabled={isItemActionLoading}
                            className="py-3.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold rounded-2xl active:scale-95 transition-all text-center flex items-center justify-center gap-1.5"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>Aceitar</span>
                          </button>
                        </div>
                      )}

                      {activeTab === 'novas' && statusEntrega === 'accepted' && (
                        <div className="pt-3 border-t border-stone-100">
                          <button
                            onClick={() => handleUpdateStatus(order, 'deliver')}
                            disabled={isItemActionLoading}
                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-2xl active:scale-95 transition-all text-center uppercase tracking-widest flex items-center justify-center gap-2 shadow-xs"
                          >
                            <Navigation className="w-4 h-4 rotate-45 stroke-[2.5]" />
                            <span>Iniciar Entrega</span>
                          </button>
                        </div>
                      )}

                      {activeTab === 'andamento' && (
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-stone-100">
                          <button
                            onClick={() => handleUpdateStatus(order, 'failed')}
                            disabled={isItemActionLoading}
                            className="py-3.5 bg-stone-100 hover:bg-red-50 text-stone-600 font-bold rounded-2xl text-xs active:scale-[0.98] transition-all"
                          >
                            Não Entregue
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(order, 'complete')}
                            disabled={isItemActionLoading}
                            className="py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-xs active:scale-[0.98] transition-all flex items-center justify-center gap-1 shadow-xs"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>Entregue</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </main>

      {/* Confirmation Modal for Payment Collection */}
      {confirmPaymentModalOrder && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 space-y-5 shadow-2xl border border-stone-100">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-amber-100 text-amber-700 rounded-2xl">
                  <DollarSign className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-stone-900">Cobrança na Entrega</h3>
                  <p className="text-xs text-stone-500 font-semibold">
                    Pedido #{confirmPaymentModalOrder.numero_pedido || confirmPaymentModalOrder.id.slice(-6).toUpperCase()}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setConfirmPaymentModalOrder(null)}
                className="p-2 hover:bg-stone-100 text-stone-400 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="font-bold">Valor do Pedido:</span>
                <strong className="text-rose-600 font-extrabold text-base">
                  {confirmPaymentModalOrder.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </strong>
              </div>
              <p className="font-semibold">
                Forma Solicitada: <strong className="uppercase">{confirmPaymentModalOrder.forma_pagamento || 'Dinheiro / Cartão'}</strong>
              </p>
              {confirmPaymentModalOrder.troco && (
                <p className="text-amber-800 font-medium">Troco informado: R$ {confirmPaymentModalOrder.troco}</p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-stone-800 font-extrabold text-sm text-center">
                Você recebeu o pagamento referente a este pedido?
              </p>

              <button
                onClick={() => handleConfirmPaymentAndDeliver(true)}
                disabled={isSubmittingPaymentAction}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-emerald-100 disabled:opacity-50"
              >
                <Check className="w-5 h-5 stroke-[3]" />
                <span>Sim, Recebi o Pagamento</span>
              </button>

              <div className="space-y-2 pt-2 border-t border-stone-100">
                <p className="text-stone-500 text-xs font-semibold">Caso o pagamento NÃO tenha sido realizado:</p>
                <input
                  type="text"
                  placeholder="Motivo (ex: cliente sem saldo, prometeu Pix)"
                  value={paymentNotCollectedReason}
                  onChange={e => setPaymentNotCollectedReason(e.target.value)}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800"
                />
                <button
                  onClick={() => handleConfirmPaymentAndDeliver(false)}
                  disabled={isSubmittingPaymentAction}
                  className="w-full py-3 bg-stone-100 hover:bg-rose-50 hover:text-rose-700 text-stone-700 font-bold text-xs rounded-2xl transition-all"
                >
                  Finalizar SEM Receber Pagamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Failure Reason Modal */}
      {failureModalOrder && (
        <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 space-y-5 shadow-2xl border border-stone-100">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-red-100 text-red-600 rounded-2xl">
                  <AlertTriangle className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-stone-900">Motivo de Não Entrega</h3>
                  <p className="text-xs text-stone-500 font-semibold">
                    Pedido #{failureModalOrder.numero_pedido || failureModalOrder.id.slice(-6).toUpperCase()}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setFailureModalOrder(null)}
                className="p-2 hover:bg-stone-100 text-stone-400 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs font-bold text-stone-700">Selecione o motivo pelo qual a entrega não foi concluída:</p>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {FAILURE_REASONS.map(reason => (
                <label 
                  key={reason.id}
                  className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all text-xs font-semibold ${
                    selectedFailureReason === reason.id 
                      ? 'bg-rose-50 border-rose-300 text-rose-900 font-extrabold' 
                      : 'bg-stone-50 border-stone-200/80 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <input
                    type="radio"
                    name="failureReason"
                    checked={selectedFailureReason === reason.id}
                    onChange={() => setSelectedFailureReason(reason.id)}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span>{reason.label}</span>
                </label>
              ))}

              {selectedFailureReason === 'outro' && (
                <textarea
                  placeholder="Escreva detalhes sobre o motivo da falha..."
                  value={customFailureText}
                  onChange={e => setCustomFailureText(e.target.value)}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 h-20"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-stone-100">
              <button
                onClick={() => setFailureModalOrder(null)}
                disabled={isSubmittingFailure}
                className="py-3.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-2xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmFailure}
                disabled={isSubmittingFailure}
                className="py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-rose-100"
              >
                Confirmar Falha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
