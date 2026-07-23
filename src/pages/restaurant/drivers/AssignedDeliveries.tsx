import React, { useState, useEffect, lazy, Suspense } from 'react';
import { 
  Clock, ShoppingBag, MapPin, Phone, User, Bike, Check,
  ExternalLink, Calendar, Loader2, ClipboardList, Map, Navigation, AlertCircle
} from 'lucide-react';
import { db, auth } from '../../../firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

const DeliveryTrackingMap = lazy(() => import('../../../components/delivery/DeliveryTrackingMap'));

interface DriverItem {
  id: string;
  name: string;
  phone?: string;
  availabilityStatus: 'OFFLINE' | 'ONLINE' | 'ON_DELIVERY';
  lastLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    recordedAt?: string;
  };
  activeRoute?: {
    id: string;
    orderIds: string[];
    currentIndex: number;
    startedAt?: string;
  };
  currentOrderId?: string;
  totalDeliveries?: number;
  updatedAt?: string;
}

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
  status_entrega?: string; // 'waiting', 'out_for_delivery', 'delivered'
  valor_total: number;
  data_criacao: string;
  driverId?: string;
  driverName?: string;
  horario_saida?: string;
  horario_entrega?: string;
  numero_pedido?: number | string;
  currentLocation?: any;
  paymentStatus?: string;
  forma_pagamento?: string;
}

export default function AssignedDeliveries() {
  const [deliveries, setDeliveries] = useState<AssignedOrder[]>([]);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [selectedDriverMap, setSelectedDriverMap] = useState<string | null>(null);

  // 1. Get restaurant ID of logged-in user
  useEffect(() => {
    const fetchRestaurantId = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        
        const idToken = await user.getIdToken();
        const userDocRes = await fetch('/api/restaurant/delivery-settings', {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (userDocRes.ok) {
          const profileDocSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
          if (!profileDocSnap.empty) {
            const pData = profileDocSnap.docs[0].data();
            setRestaurantId(pData.restaurantId || user.uid);
          } else {
            setRestaurantId(user.uid);
          }
        }
      } catch (err) {
        console.error('Error identifying signed-in restaurant:', err);
      }
    };
    fetchRestaurantId();
  }, []);

  // 2. Set up real-time observers
  useEffect(() => {
    if (!restaurantId) return;

    setLoading(true);

    // Listen to drivers
    const driversRef = collection(db, 'restaurants', restaurantId, 'drivers');
    const unsubDrivers = onSnapshot(driversRef, (snapshot) => {
      const driverList = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as DriverItem[];
      setDrivers(driverList);
    }, (err) => console.warn('Driver subscription warning:', err));

    // Listen to deliveries
    const deliveriesRef = collection(db, 'restaurants', restaurantId, 'deliveries');
    const unsubDeliveries = onSnapshot(deliveriesRef, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          cliente_nome: d.cliente_nome || d.customerName || 'Cliente',
          cliente_telefone: d.cliente_telefone || d.customerPhone || '',
          endereco_entrega: d.endereco_entrega || d.deliveryAddress || '',
          status: d.status || d.deliveryStatus || 'ASSIGNED',
          status_entrega: d.status_entrega || 'waiting',
          valor_total: d.valor_total || d.totalAmount || 0,
          data_criacao: d.data_criacao || d.createdAt || new Date().toISOString(),
          driverId: d.driverId || d.assignedDriverId,
          driverName: d.driverName || 'Entregador',
          horario_saida: d.startedAt || d.horario_saida,
          horario_entrega: d.deliveredAt || d.horario_entrega,
          numero_pedido: d.numero_pedido || doc.id.slice(-6).toUpperCase(),
          currentLocation: d.currentLocation,
          paymentStatus: d.paymentStatus || 'PENDING',
          forma_pagamento: d.forma_pagamento || 'Dinheiro/PIX'
        } as AssignedOrder;
      });

      setDeliveries(list);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to assigned deliveries:', error);
      setLoading(false);
    });

    return () => {
      unsubDrivers();
      unsubDeliveries();
    };
  }, [restaurantId]);

  const renderAddress = (enderecoObj: any) => {
    if (!enderecoObj) return 'Endereço não disponível';
    if (typeof enderecoObj === 'string') return enderecoObj;
    
    const { endereco, rua, numero, bairro, referencia } = enderecoObj;
    const street = endereco || rua || '';
    return `${street}, nº ${numero || "S/N"} - ${bairro || ''}${referencia ? ` (Ref: ${referencia})` : ''}`;
  };

  const getStatusStyle = (status: string, entregaStatus?: string) => {
    if (status === 'completed' || entregaStatus === 'delivered') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (status === 'delivering' || entregaStatus === 'out_for_delivery') {
      return 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse';
    }
    return 'bg-stone-50 text-stone-600 border-stone-200';
  };

  const getStatusLabel = (status: string, entregaStatus?: string) => {
    if (status === 'completed' || entregaStatus === 'delivered') return 'Entregue';
    if (status === 'delivering' || entregaStatus === 'out_for_delivery') return 'Saiu para Entrega';
    return 'Pendente';
  };

  const activeDrivers = drivers.filter(d => d.availabilityStatus !== 'OFFLINE');

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h2 className="text-2xl font-bold text-stone-800">Frota & Rastreamento em Tempo Real</h2>
        <p className="text-stone-500 text-sm">Acompanhe seus entregadores online, rotas ativas e o status das entregas.</p>
      </div>

      {/* Online Drivers Fleet Section */}
      {drivers.length > 0 && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4">
          <h3 className="font-extrabold text-stone-800 text-base flex items-center gap-2">
            <Bike className="w-5 h-5 text-emerald-600" />
            <span>Entregadores ({activeDrivers.length} Online)</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drivers.map(driver => {
              const isDelivering = driver.availabilityStatus === 'ON_DELIVERY';
              const isOnline = driver.availabilityStatus === 'ONLINE';
              const lastUpdate = driver.lastLocation?.recordedAt 
                ? new Date(driver.lastLocation.recordedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : null;

              return (
                <div 
                  key={driver.id} 
                  className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-stone-850 text-sm">{driver.name}</h4>
                      {driver.phone && <p className="text-xs text-stone-500">{driver.phone}</p>}
                    </div>

                    <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                      isDelivering ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse' :
                      isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-stone-100 text-stone-400 border-stone-200'
                    }`}>
                      {isDelivering ? 'Em Rota' : isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  {driver.lastLocation && (
                    <div className="text-[11px] text-stone-600 space-y-1 bg-white p-2.5 rounded-xl border border-stone-100">
                      <div className="flex items-center justify-between text-stone-500">
                        <span>Última localização:</span>
                        <span className="font-bold">{lastUpdate || 'Recente'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-700 font-medium">
                        <Navigation className="w-3 h-3 rotate-45" />
                        <span>GPS Sincronizado</span>
                      </div>
                    </div>
                  )}

                  {driver.lastLocation?.latitude && (
                    <button
                      onClick={() => setSelectedDriverMap(selectedDriverMap === driver.id ? null : driver.id)}
                      className="w-full py-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Map className="w-3.5 h-3.5" />
                      <span>{selectedDriverMap === driver.id ? 'Ocultar Mapa' : 'Ver no Mapa'}</span>
                    </button>
                  )}

                  {selectedDriverMap === driver.id && driver.lastLocation?.latitude && (
                    <Suspense fallback={<div className="h-36 bg-stone-200 rounded-xl animate-pulse flex items-center justify-center text-xs text-stone-500">Carregando mapa...</div>}>
                      <DeliveryTrackingMap
                        driverLocation={{
                          latitude: driver.lastLocation.latitude,
                          longitude: driver.lastLocation.longitude,
                          label: driver.name
                        }}
                        height="180px"
                      />
                    </Suspense>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Deliveries List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-stone-200">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
          <p className="text-stone-500 text-sm font-medium">Buscando entregas atribuídas...</p>
        </div>
      ) : deliveries.length === 0 ? (
        <div className="p-12 bg-white rounded-[2rem] border border-stone-200 text-center">
          <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-stone-100">
            <ClipboardList className="w-8 h-8 text-stone-300" />
          </div>
          <h3 className="text-lg font-bold text-stone-800 mb-1">Nenhuma entrega atribuída ainda</h3>
          <p className="text-stone-500 text-sm max-w-sm mx-auto leading-relaxed">
            Nenhuma mercadoria saiu para rota com entregador no momento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {deliveries.map((delivery) => (
            <div 
              key={delivery.id}
              className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 hover:shadow-lg transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="bg-stone-100 text-stone-800 text-xs font-black px-2.5 py-1 rounded-lg">
                    #{delivery.numero_pedido || delivery.id.substring(0, 6).toUpperCase()}
                  </span>
                  <span className="text-xs text-stone-400 font-bold flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {delivery.data_criacao ? new Date(delivery.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getStatusStyle(delivery.status, delivery.status_entrega)}`}>
                  {getStatusLabel(delivery.status, delivery.status_entrega)}
                </span>
              </div>

              {/* Order content detail */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <User className="w-4.5 h-4.5 text-stone-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Cliente</p>
                      <p className="font-bold text-stone-850 hover:text-emerald-600 transition-colors cursor-pointer">{delivery.cliente_nome}</p>
                      {delivery.cliente_telefone && (
                        <p className="text-emerald-600 text-xs font-medium flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {delivery.cliente_telefone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4.5 h-4.5 text-stone-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Endereço de Entrega</p>
                      <p className="text-stone-600 font-medium leading-relaxed text-xs">
                        {renderAddress(delivery.endereco_entrega)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 sm:border-l sm:border-stone-105 sm:pl-4">
                  <div className="flex items-start gap-2.5">
                    <Bike className="w-4.5 h-4.5 text-stone-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Entregador Responsável</p>
                      <p className="font-bold text-stone-850">{delivery.driverName || 'Administração / Próprio'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs text-stone-500">
                    <Clock className="w-4.5 h-4.5 text-stone-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div>
                        <span className="font-bold text-stone-450 mr-1">Saída:</span>
                        <span className="font-medium text-stone-700">
                          {delivery.horario_saida ? new Date(delivery.horario_saida).toLocaleTimeString('pt-BR') : 'Aguardando saída'}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-stone-450 mr-1">Entrega:</span>
                        <span className="font-medium text-stone-700">
                          {delivery.horario_entrega ? new Date(delivery.horario_entrega).toLocaleTimeString('pt-BR') : 'Aguardando finalização'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-stone-50 rounded-2xl p-3 flex sm:items-center justify-between gap-2 flex-col sm:flex-row border border-stone-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-400 block">Status Financeiro</span>
                  <span className="text-xs font-bold text-stone-700">{delivery.forma_pagamento || 'PIX/Cartão'}</span>
                </div>
                <span className="font-black text-stone-850 text-base">
                  {delivery.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
