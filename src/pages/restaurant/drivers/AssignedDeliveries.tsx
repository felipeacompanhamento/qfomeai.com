import React, { useState, useEffect, Suspense } from 'react';
import { 
  Clock, ShoppingBag, MapPin, Phone, User, Bike, Check,
  ExternalLink, Calendar, ClipboardList, Map, Navigation, AlertCircle
} from 'lucide-react';
import { db } from '../../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { Card, Badge, Button, EmptyState, LoadingState } from '../../../components/ui';
import { lazyWithRetry } from '../../../utils/lazyWithRetry';

const DeliveryTrackingMap = lazyWithRetry(() => import('../../../components/delivery/DeliveryTrackingMap'), 'DeliveryTrackingMap');

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
  const { profile, user } = useAuth();
  const [deliveries, setDeliveries] = useState<AssignedOrder[]>([]);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriverMap, setSelectedDriverMap] = useState<string | null>(null);

  const restaurantId = profile?.restaurantId || profile?.uid || user?.uid || null;

  // Set up real-time observers
  useEffect(() => {
    if (!restaurantId) return;

    setLoading(true);

    // Listen to drivers via consolidated staffProfiles subcollection
    const profilesRef = collection(db, 'restaurants', restaurantId, 'staffProfiles');
    const q = query(profilesRef, where('role', '==', 'DRIVER'));
    const unsubDrivers = onSnapshot(q, (snapshot) => {
      const driverList = snapshot.docs.map(doc => {
        const d = doc.data();
        const roleData = d.roleSpecificData || {};
        const commonData = d.commonOperationalData || {};
        return {
          id: d.uid || doc.id,
          name: roleData.nickname || commonData.jobTitle || 'Entregador',
          phone: commonData.emergencyContact || '',
          availabilityStatus: roleData.availability || 'OFFLINE',
          lastLocation: roleData.lastLocation,
          activeRoute: roleData.activeRoute,
          currentOrderId: roleData.currentOrderId,
          totalDeliveries: roleData.totalDeliveries || 0,
          updatedAt: d.updatedAt
        };
      }) as DriverItem[];
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

  const getStatusLabel = (status: string, entregaStatus?: string) => {
    if (status === 'completed' || entregaStatus === 'delivered') return 'Entregue';
    if (status === 'delivering' || entregaStatus === 'out_for_delivery') return 'Saiu para Entrega';
    return 'Pendente';
  };

  const activeDrivers = drivers.filter(d => d.availabilityStatus !== 'OFFLINE');

  return (
    <div className="space-y-6 font-sans">
      {/* Online Drivers Fleet Section */}
      {drivers.length > 0 && (
        <Card padding="md" className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-stone-100">
            <Bike className="w-5 h-5 text-emerald-600" />
            <h3 className="font-extrabold text-stone-800 text-sm">
              Entregadores ({activeDrivers.length} Online)
            </h3>
          </div>

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
                  className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-stone-850 text-sm truncate">{driver.name}</h4>
                      {driver.phone && <p className="text-xs text-stone-500 font-semibold truncate">{driver.phone}</p>}
                    </div>

                    <Badge 
                      variant={isDelivering ? 'info' : isOnline ? 'success' : 'neutral'}
                      size="sm"
                      className={isDelivering ? 'animate-pulse' : ''}
                    >
                      {isDelivering ? 'Em Rota' : isOnline ? 'Online' : 'Offline'}
                    </Badge>
                  </div>

                  {driver.lastLocation && (
                    <div className="text-xs text-stone-600 space-y-1 bg-white p-2.5 rounded-xl border border-stone-100">
                      <div className="flex items-center justify-between text-stone-500 font-medium">
                        <span>Última localização:</span>
                        <span className="font-bold text-stone-700">{lastUpdate || 'Recente'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-700 font-semibold">
                        <Navigation className="w-3.5 h-3.5 rotate-45" />
                        <span>GPS Ativo</span>
                      </div>
                    </div>
                  )}

                  {driver.lastLocation?.latitude && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedDriverMap(selectedDriverMap === driver.id ? null : driver.id)}
                      icon={<Map className="w-4 h-4" />}
                      className="w-full text-xs font-bold"
                    >
                      {selectedDriverMap === driver.id ? 'Ocultar Mapa' : 'Ver no Mapa'}
                    </Button>
                  )}

                  {selectedDriverMap === driver.id && driver.lastLocation?.latitude && (
                    <div className="mt-2 overflow-hidden rounded-xl border border-stone-200">
                      <Suspense fallback={<div className="h-36 bg-stone-100 rounded-xl animate-pulse flex items-center justify-center text-xs text-stone-400 font-bold">Carregando mapa...</div>}>
                        <DeliveryTrackingMap
                          driverLocation={{
                            latitude: driver.lastLocation.latitude,
                            longitude: driver.lastLocation.longitude,
                            label: driver.name
                          }}
                          height="180px"
                        />
                      </Suspense>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Deliveries List */}
      {loading ? (
        <LoadingState message="Carregando entregas ativas e frota..." />
      ) : deliveries.length === 0 ? (
        <EmptyState
          title="Nenhuma entrega ativa no momento"
          description="Nenhum pedido está em rota de entrega no momento. Monitore novos pedidos na subaba Atribuição para despachar."
          icon={ClipboardList}
        />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {deliveries.map((delivery) => (
            <Card 
              key={delivery.id}
              hoverable
              className="space-y-4"
            >
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" size="md" className="font-extrabold text-stone-800">
                    #{delivery.numero_pedido || delivery.id.substring(0, 6).toUpperCase()}
                  </Badge>
                  <span className="text-xs text-stone-400 font-bold flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-stone-400" />
                    {delivery.data_criacao ? new Date(delivery.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <Badge variant={
                  delivery.status === 'completed' || delivery.status_entrega === 'delivered' ? 'success' :
                  delivery.status === 'delivering' || delivery.status_entrega === 'out_for_delivery' ? 'info' :
                  'neutral'
                }>
                  {getStatusLabel(delivery.status, delivery.status_entrega)}
                </Badge>
              </div>

              {/* Order content detail */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <User className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-stone-500 text-xs font-bold">Cliente</p>
                      <p className="font-extrabold text-stone-800 text-sm truncate">{delivery.cliente_nome}</p>
                      {delivery.cliente_telefone && (
                        <p className="text-emerald-600 text-xs font-semibold flex items-center gap-1 mt-0.5">
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          {delivery.cliente_telefone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-stone-500 text-xs font-bold">Endereço de entrega</p>
                      <p className="text-stone-600 font-semibold leading-relaxed">
                        {renderAddress(delivery.endereco_entrega)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 sm:border-l sm:border-stone-100 sm:pl-4">
                  <div className="flex items-start gap-2.5">
                    <Bike className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-stone-500 text-xs font-bold">Entregador responsável</p>
                      <p className="font-extrabold text-stone-850 truncate">{delivery.driverName || 'Administração / Próprio'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs text-stone-500">
                    <Clock className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="font-extrabold text-stone-450 mr-1">Saída:</span>
                        <span className="font-semibold text-stone-700">
                          {delivery.horario_saida ? new Date(delivery.horario_saida).toLocaleTimeString('pt-BR') : 'Aguardando saída'}
                        </span>
                      </div>
                      <div>
                        <span className="font-extrabold text-stone-450 mr-1">Entrega:</span>
                        <span className="font-semibold text-stone-700">
                          {delivery.horario_entrega ? new Date(delivery.horario_entrega).toLocaleTimeString('pt-BR') : 'Aguardando finalização'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-stone-50 rounded-2xl p-3 flex sm:items-center justify-between gap-2 flex-col sm:flex-row border border-stone-150/60">
                <div>
                  <span className="text-xs font-bold text-stone-500 block">Forma de pagamento</span>
                  <span className="text-xs font-bold text-stone-700">{delivery.forma_pagamento || 'PIX/Cartão'}</span>
                </div>
                <span className="font-extrabold text-stone-800 text-base">
                  {delivery.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
