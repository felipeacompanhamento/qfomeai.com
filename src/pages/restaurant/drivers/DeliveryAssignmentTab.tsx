import React, { useState, useEffect } from 'react';
import { 
  Bike, User, MapPin, Search, CheckCircle2, 
  Loader2, AlertCircle, RefreshCw, ChevronRight, UserCheck, Phone
} from 'lucide-react';
import { db, auth } from '../../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { Card, Badge, Button, SearchInput, InlineFeedback, EmptyState, LoadingState } from '../../../components/ui';

interface ActiveDeliveryOrder {
  id: string;
  numero_pedido?: number | string;
  cliente_nome?: string;
  cliente_telefone?: string;
  endereco_entrega?: any;
  status?: string;
  deliveryStatus?: string;
  tipo?: string;
  tipo_entrega?: string;
  driverId?: string;
  driverName?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  valor_total?: number;
  data_criacao?: string;
  createdAt?: string;
}

interface AvailableDriver {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  availabilityStatus: 'ONLINE' | 'OFFLINE' | 'ON_DELIVERY';
  totalDeliveries?: number;
}

export default function DeliveryAssignmentTab() {
  const { profile, user } = useAuth();
  const [orders, setOrders] = useState<ActiveDeliveryOrder[]>([]);
  const [drivers, setDrivers] = useState<AvailableDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'UNASSIGNED' | 'ASSIGNED'>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const restaurantId = profile?.restaurantId || profile?.uid || user?.uid || null;

  useEffect(() => {
    if (!restaurantId) return;

    setLoading(true);

    // 1. Real-time subscription to active delivery orders
    const ordersRef = collection(db, 'restaurants', restaurantId, 'orders');
    
    // Query active order statuses to avoid full collection listener
    const activeStatuses = ['recebido', 'aceito', 'em_preparo', 'pronto', 'saiu_para_entrega', 'pendente', 'em preparo', 'saiu para entrega'];
    const qActiveOrders = query(
      ordersRef,
      where('status', 'in', activeStatuses)
    );

    const unsubOrders = onSnapshot(qActiveOrders, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ActiveDeliveryOrder[];

      // Filter for active delivery orders (delivery type, not finalized/cancelled)
      const deliveryOrders = list.filter(o => {
        const tipo = (o.tipo || o.tipo_entrega || '').toLowerCase();
        const status = (o.status || '').toLowerCase();
        const canonical = (o.deliveryStatus || '').toUpperCase();
        
        const isDelivery = tipo === 'delivery' || tipo === 'entrega' || !!o.endereco_entrega;
        const isFinished = status === 'entregue' || status === 'finalizado' || status === 'cancelado' || canonical === 'FINALIZED' || canonical === 'CANCELLED';

        return isDelivery && !isFinished;
      });

      setOrders(deliveryOrders);
      setLoading(false);
    }, (err) => {
      console.warn('Orders listener error:', err);
      setLoading(false);
    });

    // 2. Real-time subscription to active drivers
    const profilesRef = collection(db, 'restaurants', restaurantId, 'staffProfiles');
    const qDrivers = query(profilesRef, where('role', '==', 'DRIVER'));
    const unsubDrivers = onSnapshot(qDrivers, (snapshot) => {
      const driverList = snapshot.docs.map(doc => {
        const d = doc.data();
        const roleData = d.roleSpecificData || {};
        const commonData = d.commonOperationalData || {};
        return {
          id: doc.id,
          userId: d.uid || doc.id,
          name: roleData.nickname || commonData.jobTitle || 'Entregador',
          phone: commonData.emergencyContact || '',
          availabilityStatus: roleData.availability || 'OFFLINE',
          totalDeliveries: roleData.totalDeliveries || 0
        } as AvailableDriver;
      });

      setDrivers(driverList);
    }, (err) => console.warn('Drivers listener error:', err));

    return () => {
      unsubOrders();
      unsubDrivers();
    };
  }, [restaurantId]);

  const handleAssignDriver = async (orderId: string, driver: AvailableDriver) => {
    setAssigningOrderId(orderId);
    setAssigningDriverId(driver.userId);
    setError(null);
    setSuccessMsg(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Autenticação expirada. Por favor, faça login novamente.');

      const response = await fetch(`/api/restaurant/orders/${orderId}/assign-driver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          driverId: driver.userId
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao atribuir entregador.');
      }

      setSuccessMsg(`Pedido atribuído com sucesso para ${driver.name}!`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao atribuir entregador.');
    } finally {
      setAssigningOrderId(null);
      setAssigningDriverId(null);
    }
  };

  const renderAddress = (addr: any) => {
    if (!addr) return 'Endereço não informado';
    if (typeof addr === 'string') return addr;
    const { endereco, rua, numero, bairro, referencia } = addr;
    const street = endereco || rua || '';
    return `${street}${numero ? `, nº ${numero}` : ''}${bairro ? ` - ${bairro}` : ''}${referencia ? ` (${referencia})` : ''}`;
  };

  const filteredOrders = orders.filter(o => {
    const isAssigned = !!(o.driverId || o.assignedDriverId);
    if (filterType === 'UNASSIGNED' && isAssigned) return false;
    if (filterType === 'ASSIGNED' && !isAssigned) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const idStr = String(o.numero_pedido || o.id).toLowerCase();
    const nameStr = (o.cliente_nome || '').toLowerCase();
    const phoneStr = (o.cliente_telefone || '').toLowerCase();
    return idStr.includes(term) || nameStr.includes(term) || phoneStr.includes(term);
  });

  return (
    <div className="space-y-6 font-sans">
      {error && (
        <InlineFeedback type="error" message={error} />
      )}

      {successMsg && (
        <InlineFeedback type="success" message={successMsg} />
      )}

      {/* Filter and Search controls */}
      <Card padding="sm" className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <SearchInput
          placeholder="Buscar por nº, cliente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:w-72"
        />

        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl text-xs font-bold w-full sm:w-auto">
          <button
            onClick={() => setFilterType('ALL')}
            className={`min-h-[36px] flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all cursor-pointer ${filterType === 'ALL' ? 'bg-white text-stone-850 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
          >
            Todos ({orders.length})
          </button>
          <button
            onClick={() => setFilterType('UNASSIGNED')}
            className={`min-h-[36px] flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all cursor-pointer ${filterType === 'UNASSIGNED' ? 'bg-white text-amber-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
          >
            Sem Entregador ({orders.filter(o => !(o.driverId || o.assignedDriverId)).length})
          </button>
          <button
            onClick={() => setFilterType('ASSIGNED')}
            className={`min-h-[36px] flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all cursor-pointer ${filterType === 'ASSIGNED' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`}
          >
            Atribuídos ({orders.filter(o => !!(o.driverId || o.assignedDriverId)).length})
          </button>
        </div>
      </Card>

      {loading ? (
        <LoadingState message="Buscando pedidos para atribuição..." />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="Nenhum pedido de entrega no momento"
          description="Não há pedidos pendentes aguardando atribuição com os filtros selecionados."
          icon={Bike}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredOrders.map((order) => {
            const currentDriverId = order.driverId || order.assignedDriverId;
            const currentDriverName = order.driverName || order.assignedDriverName;

            return (
              <Card 
                key={order.id}
                hoverable
                className="space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100 flex-wrap gap-2">
                    <Badge variant="neutral" size="md" className="font-extrabold text-stone-800">
                      #{order.numero_pedido || String(order?.id || '').slice(-6).toUpperCase() || '------'}
                    </Badge>
                    <Badge 
                      variant={currentDriverId ? 'success' : 'warning'} 
                      className={!currentDriverId ? 'animate-pulse' : ''}
                    >
                      {currentDriverId ? `Atribuído: ${currentDriverName || 'Entregador'}` : 'Aguardando Entregador'}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-xs text-stone-600">
                    <div className="flex items-start gap-2.5">
                      <User className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-extrabold text-stone-850">{order.cliente_nome || 'Cliente sem nome'}</p>
                        {order.cliente_telefone && (
                          <p className="text-stone-500 font-semibold flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-stone-400" />
                            {order.cliente_telefone}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <MapPin className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
                      <p className="text-stone-600 font-semibold leading-relaxed">{renderAddress(order.endereco_entrega)}</p>
                    </div>
                  </div>
                </div>

                {/* Driver assignment choices */}
                <div className="pt-3 border-t border-stone-100 space-y-2">
                  <p className="text-xs font-bold text-stone-500">
                    Atribuir entregador
                  </p>
                  
                  {drivers.length === 0 ? (
                    <p className="text-xs text-stone-400 italic">Nenhum entregador cadastrado na equipe.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {drivers.map((drv) => {
                        const isAssigned = currentDriverId === drv.userId;
                        const isOnline = drv.availabilityStatus === 'ONLINE';
                        const isOnDelivery = drv.availabilityStatus === 'ON_DELIVERY';
                        const isBusy = assigningOrderId === order.id && assigningDriverId === drv.userId;

                        return (
                          <button
                            key={drv.id}
                            disabled={isAssigned || isBusy}
                            onClick={() => handleAssignDriver(order.id, drv)}
                            className={`min-h-[32px] px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                              isAssigned
                                ? 'bg-emerald-600 text-white border-emerald-600 cursor-default'
                                : 'bg-stone-50 hover:bg-emerald-50 text-stone-700 hover:text-emerald-700 border-stone-200 hover:border-emerald-200'
                            }`}
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                            ) : (
                              <span className={`w-2 h-2 rounded-full ${
                                isOnDelivery ? 'bg-blue-500' : isOnline ? 'bg-emerald-500' : 'bg-stone-300'
                              }`} />
                            )}
                            <span>{drv.name}</span>
                            {isAssigned && <UserCheck className="w-3.5 h-3.5 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
