import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bike, Check, X, LogOut, Radio, Clock, Phone, MapPin, 
  ShoppingBag, ClipboardList, RefreshCw, Wifi, WifiOff,
  Navigation, CheckCircle2, ChevronRight, AlertCircle, Sparkles, PhoneCall
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { 
  collection, doc, getDoc, updateDoc, setDoc,
  query, where, onSnapshot, writeBatch, arrayUnion, getDocs 
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';

interface AssignedOrder {
  id: string;
  cliente_nome: string;
  cliente_telefone?: string;
  endereco_entrega?: {
    endereco: string;
    numero: string;
    bairro: string;
    referencia?: string;
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
  observacoes?: string;
  restaurante_id: string;
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
  currentOrderId?: string | null;
  lastLocation?: any;
  updatedAt?: string;
}

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

  // Active UI tab
  const [activeTab, setActiveTab] = useState<'novas' | 'andamento' | 'finalizadas'>('novas');
  
  // Action state loader
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Geo positioning tracking flag
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef<number | null>(null);

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
        if (item.type === 'order_status') {
          const orderRef = doc(db, 'orders', item.orderId);
          await updateDoc(orderRef, item.data);
        } else if (item.type === 'driver_status') {
          const driverRef = doc(db, 'restaurants', item.restaurantId, 'drivers', item.driverId);
          await updateDoc(driverRef, item.data);
        }
        processedCount++;
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

  // 5. Dynamic GPS Geolocation handler
  useEffect(() => {
    // Geolocation triggering
    const driverState = driverDoc?.availabilityStatus;
    const isOnlineOrDelivering = driverState === 'ONLINE' || driverState === 'ON_DELIVERY';

    if (isOnlineOrDelivering && isOnline) {
      startLocationTracking();
    } else {
      stopLocationTracking();
    }

    return () => stopLocationTracking();
  }, [driverDoc?.availabilityStatus, isOnline]);

  const startLocationTracking = () => {
    if (watchIdRef.current !== null) return;
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser.');
      return;
    }

    setIsTracking(true);

    const updateLocation = async (position: GeolocationPosition) => {
      if (!user || !profile?.restaurantId) return;
      const { latitude, longitude, accuracy } = position.coords;

      const locationData = {
        latitude,
        longitude,
        accuracy,
        timestamp: new Date().toISOString()
      };

      try {
        const driverRef = doc(db, 'restaurants', profile.restaurantId, 'drivers', user.uid);
        await updateDoc(driverRef, {
          lastLocation: locationData,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('Error saving driver location to Firebase:', err);
      }
    };

    // Safe watching intervals
    watchIdRef.current = navigator.geolocation.watchPosition(
      updateLocation,
      (err) => console.warn('Geolocation permission or accuracy error:', err),
      {
        enableHighAccuracy: true,
        maximumAge: 45000, // Wait at least 45 seconds to fetch fresh coordinates
        timeout: 40000
      }
    );
  };

  const stopLocationTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  };

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
  const handleUpdateStatus = async (order: AssignedOrder, action: 'accept' | 'reject' | 'deliver' | 'complete' | 'failed') => {
    if (!user || !profile?.restaurantId) return;
    
    setActionLoadingId(order.id);
    setError(null);
    setSuccess(null);

    const orderRef = doc(db, 'restaurants', profile.restaurantId, 'orders', order.id);
    const driverRef = doc(db, 'restaurants', profile.restaurantId, 'drivers', user.uid);

    let orderUpdates: Partial<AssignedOrder> & { [key: string]: any } = {};
    let driverUpdates: Partial<DriverInfo> = {};

    const now = new Date().toISOString();
    const driverName = profile.nome || user.displayName || 'Entregador';

    let deliveryStatusVal = '';
    let deliveryLabel = '';

    switch (action) {
      case 'accept':
        orderUpdates = {
          driverId: user.uid,
          entregador_id: user.uid,
          driverName: driverName,
          status_entrega: 'accepted',
          deliveryStatus: 'ACCEPTED',
          historico_entrega: arrayUnion({
            status: 'accepted',
            data: now,
            descricao: 'Entrega aceita pelo entregador ' + driverName
          })
        };
        deliveryStatusVal = 'ACCEPTED';
        deliveryLabel = 'Entregador aceitou a entrega';
        break;

      case 'reject':
        orderUpdates = {
          driverId: '',
          entregador_id: '',
          driverName: '',
          status_entrega: 'rejected',
          deliveryStatus: 'REFUSED',
          historico_entrega: arrayUnion({
            status: 'rejected',
            data: now,
            descricao: 'Entrega recusada pelo entregador ' + driverName
          })
        };
        deliveryStatusVal = 'REFUSED';
        deliveryLabel = 'Entregador recusou a entrega';
        break;

      case 'deliver':
        orderUpdates = {
          status: 'delivering',
          status_entrega: 'out_for_delivery',
          deliveryStatus: 'PICKED_UP',
          horario_saida: now,
          historico_entrega: arrayUnion({
            status: 'out_for_delivery',
            data: now,
            descricao: 'Saiu para entrega com o entregador ' + driverName
          })
        };
        driverUpdates = {
          availabilityStatus: 'ON_DELIVERY',
          currentOrderId: order.id,
          updatedAt: now
        };
        deliveryStatusVal = 'PICKED_UP';
        deliveryLabel = 'Entregador saiu para entrega';
        break;

      case 'complete':
        orderUpdates = {
          status: 'completed',
          status_entrega: 'delivered',
          deliveryStatus: 'DELIVERED',
          horario_entrega: now,
          data_finalizado: now,
          historico_entrega: arrayUnion({
            status: 'delivered',
            data: now,
            descricao: 'Pedido entregue com sucesso!'
          })
        };
        driverUpdates = {
          availabilityStatus: 'ONLINE',
          currentOrderId: null,
          totalDeliveries: (driverDoc?.totalDeliveries || 0) + 1,
          updatedAt: now
        };
        deliveryStatusVal = 'DELIVERED';
        deliveryLabel = 'Pedido entregue com sucesso!';
        break;

      case 'failed':
        orderUpdates = {
          status: 'cancelled',
          status_entrega: 'not_delivered',
          deliveryStatus: 'FAILED',
          horario_entrega: now,
          historico_entrega: arrayUnion({
            status: 'not_delivered',
            data: now,
            descricao: 'Falha na entrega realizada pelo entregador'
          })
        };
        driverUpdates = {
          availabilityStatus: 'ONLINE',
          currentOrderId: null,
          updatedAt: now
        };
        deliveryStatusVal = 'FAILED';
        deliveryLabel = 'Falha na entrega';
        break;
    }

    if (isOnline) {
      try {
        // Execute real-time updates directly to Firebase
        await updateDoc(orderRef, orderUpdates);
        if (Object.keys(driverUpdates).length > 0) {
          await updateDoc(driverRef, driverUpdates);
        }

        // Update restaurant-wide deliveries log and records
        if (deliveryStatusVal) {
          const deliveryDocRef = doc(db, 'restaurants', profile.restaurantId, 'deliveries', order.id);
          const updateObj: any = {
            status: deliveryStatusVal,
            updatedAt: now
          };
          if (deliveryStatusVal === 'ACCEPTED') updateObj.acceptedAt = now;
          if (deliveryStatusVal === 'PICKED_UP') updateObj.pickedUpAt = now;
          if (deliveryStatusVal === 'DELIVERED') updateObj.deliveredAt = now;
          if (deliveryStatusVal === 'REFUSED' || deliveryStatusVal === 'FAILED') updateObj.failedAt = now;

          await updateDoc(deliveryDocRef, updateObj).catch(err => {
            console.warn("Delivery record might not exist or rule issue, non-blocking silent failure:", err);
          });

          // Insert Delivery Audit Log
          const logRef = doc(collection(db, 'restaurants', profile.restaurantId, 'deliveryLogs'));
          await setDoc(logRef, {
            orderId: order.id,
            deliveryId: order.id,
            driverId: user.uid,
            action: deliveryStatusVal,
            message: deliveryLabel,
            createdAt: now,
            createdBy: 'driver'
          }).catch(err => {
            console.warn("Delivery audit log insertion silent fallback:", err);
          });
        }

        setSuccess('Pedido atualizado com sucesso!');
        setTimeout(() => setSuccess(null), 3000);
      } catch (err: any) {
        console.error('Error updating delivery status:', err);
        setError('Erro ao salvar atualização no servidor. Tente novamente.');
      } finally {
        setActionLoadingId(null);
      }
    } else {
      // Offline Flow optimization! App remains completely responsive
      savePendingQueue({
        type: 'order_status',
        orderId: order.id,
        data: orderUpdates
      });

      if (Object.keys(driverUpdates).length > 0) {
        savePendingQueue({
          type: 'driver_status',
          restaurantId: profile.restaurantId,
          driverId: user.uid,
          data: driverUpdates
        });
      }

      // Optimistic update client-side to reflect in offline UI instantly
      setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...orderUpdates } : o));
      if (Object.keys(driverUpdates).length > 0) {
        setDriverDoc(prev => prev ? { ...prev, ...driverUpdates } : null);
      }

      setSuccess('Modo Offline: Atualização agendada para sincronia!');
      setTimeout(() => setSuccess(null), 4000);
      setActionLoadingId(null);
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

  // Render Address detail string beautifully
  const renderAddress = (addrObj: any) => {
    if (!addrObj) return 'Endereço não disponível';
    if (typeof addrObj === 'string') return addrObj;
    
    const { endereco, numero, bairro, referencia } = addrObj;
    return `${endereco}, nº ${numero || "S/N"} - ${bairro}${referencia ? ` (Ref: ${referencia})` : ''}`;
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

  // Active delivery panel tracker
  const activeDelivery = useMemo(() => {
    return orders.find(o => o.status_entrega === 'out_for_delivery');
  }, [orders]);

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

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-stone-100">
            <div className="bg-stone-50 rounded-2xl p-3.5 text-center border border-stone-100">
              <span className="text-stone-400 font-extrabold text-[10px] tracking-widest uppercase">Entregas do Dia</span>
              <p className="text-2xl font-black text-rose-500 mt-1">{driverDoc?.totalDeliveries || 0}</p>
            </div>
            
            <div className="bg-stone-50 rounded-2xl p-3.5 text-center border border-stone-100 flex flex-col justify-center items-center">
              <span className="text-stone-400 font-extrabold text-[10px] tracking-widest uppercase">Rastreador GPS</span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold mt-2.5 px-3 py-1.5 rounded-full ${
                isTracking ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 animate-pulse' : 'bg-stone-100 text-stone-400 border border-stone-200/60'
              }`}>
                <Navigation className="w-3.5 h-3.5 rotate-45" />
                <span>{isTracking ? 'Transmitindo' : 'Pausado'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 4. Highlighted Active Delivery Panel */}
        {activeDelivery && (
          <div className="bg-emerald-650 bg-stone-900 border border-stone-800 rounded-[2.2rem] p-6 text-white space-y-4 shadow-xl">
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

              <div className="flex justify-between items-center bg-white/5 border border-white/10 rounded-2xl p-3 text-sm">
                <div>
                  <p className="text-stone-450 text-[10px] uppercase font-bold text-stone-400">Pagamento</p>
                  <p className="font-bold text-stone-100">{activeDelivery.forma_pagamento || 'PIX/Cartão Online'}</p>
                </div>
                <div className="text-right">
                  <p className="text-stone-450 text-[10px] uppercase font-bold text-stone-400">Total</p>
                  <p className="font-black text-rose-450 text-[17px] text-rose-400">
                    {activeDelivery.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
              </div>

              {activeDelivery.observacoes && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 p-3 rounded-2xl text-xs">
                  <strong>Obs:</strong> {activeDelivery.observacoes}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => handleUpdateStatus(activeDelivery, 'failed')}
                disabled={actionLoadingId === activeDelivery.id}
                className="py-4 border border-white/15 bg-white/5 hover:bg-red-650 hover:bg-rose-500/15 hover:border-rose-500/30 font-bold rounded-2xl text-xs uppercase tracking-wider text-white transition-all active:scale-[0.98]"
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
          <div className="flex border border-stone-200/85 bg-white p-1 rounded-2xl shadow-xs">
            <button
              onClick={() => setActiveTab('novas')}
              className={`flex-1 py-3 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'novas' ? 'bg-stone-900 text-white font-extrabold shadow-sm' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Novas
            </button>
            <button
              onClick={() => setActiveTab('andamento')}
              className={`flex-1 py-3 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'andamento' ? 'bg-stone-900 text-white font-extrabold shadow-sm' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Andamento
            </button>
            <button
              onClick={() => setActiveTab('finalizadas')}
              className={`flex-1 py-3 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                activeTab === 'finalizadas' ? 'bg-stone-900 text-white font-extrabold shadow-sm' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Histórico
            </button>
          </div>

          {/* 6. Tabs content items */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white rounded-[2.2rem] border border-stone-200/80 shadow-xs">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-3" />
              <p className="text-stone-405 text-stone-500 font-bold text-xs">Atualizando pedidos em tempo real...</p>
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
          )}
        </div>
      </main>
    </div>
  );
}
