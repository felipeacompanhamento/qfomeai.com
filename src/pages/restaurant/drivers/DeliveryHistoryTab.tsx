import React, { useState, useEffect } from 'react';
import { 
  Calendar, Search, Filter, Clock, MapPin, User, Bike, 
  CheckCircle2, XCircle, Loader2, ChevronRight, DollarSign, X
} from 'lucide-react';
import { db, auth } from '../../../firebase';
import { collection, query, where, getDocs, orderBy, limit, startAfter } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { Card, StatCard, Badge, Button, IconButton, SearchInput, Select, LoadingState, EmptyState } from '../../../components/ui';

interface DeliveryHistoryOrder {
  id: string;
  numero_pedido?: number | string;
  cliente_nome?: string;
  cliente_telefone?: string;
  endereco_entrega?: any;
  status?: string;
  deliveryStatus?: string;
  driverId?: string;
  driverName?: string;
  assignedDriverId?: string;
  assignedDriverName?: string;
  valor_total?: number;
  data_criacao?: string;
  createdAt?: string;
  items?: any[];
  forma_pagamento?: string;
  cancelReason?: string;
}

interface DriverOption {
  id: string;
  name: string;
}

export default function DeliveryHistoryTab() {
  const { profile, user } = useAuth();
  const [orders, setOrders] = useState<DeliveryHistoryOrder[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);
  
  // Selected detail modal order
  const [selectedOrder, setSelectedOrder] = useState<DeliveryHistoryOrder | null>(null);

  // Filters
  const [period, setPeriod] = useState<'today' | 'yesterday' | '7days' | '30days' | 'all'>('today');
  const [driverFilter, setDriverFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DELIVERED' | 'CANCELLED'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const restaurantId = profile?.restaurantId || profile?.uid || user?.uid || null;

  // Load drivers list for filter
  useEffect(() => {
    if (!restaurantId) return;
    const fetchDrivers = async () => {
      try {
        const profilesRef = collection(db, 'restaurants', restaurantId, 'staffProfiles');
        const q = query(profilesRef, where('role', '==', 'DRIVER'));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => {
          const d = doc.data();
          return {
            id: d.uid || doc.id,
            name: d.roleSpecificData?.nickname || d.commonOperationalData?.jobTitle || 'Entregador'
          };
        });
        setDrivers(list);
      } catch (err) {
        console.warn('Error fetching driver filter options:', err);
      }
    };
    fetchDrivers();
  }, [restaurantId]);

  // Fetch historical delivery orders
  const fetchHistoryOrders = async (reset = true) => {
    if (!restaurantId) return;

    if (reset) {
      setLoading(true);
      setLastDoc(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const ordersRef = collection(db, 'restaurants', restaurantId, 'orders');
      const PAGE_SIZE = 30;
      let accumulatedDeliveries: DeliveryHistoryOrder[] = [];
      let currentCursorDoc = reset ? null : lastDoc;
      let reachedEnd = false;
      const closedStatuses = ['entregue', 'finalizado', 'cancelado', 'FINALIZED', 'CANCELLED'];

      // Accumulate up to PAGE_SIZE (30) closed delivery orders from Firestore
      while (accumulatedDeliveries.length < PAGE_SIZE && !reachedEnd) {
        let qConstraints: any[] = [
          where('status', 'in', closedStatuses),
          orderBy('data_criacao', 'desc'),
          limit(PAGE_SIZE)
        ];

        if (currentCursorDoc) {
          qConstraints.push(startAfter(currentCursorDoc));
        }

        const q = query(ordersRef, ...qConstraints);
        const snap = await getDocs(q);

        if (snap.empty) {
          reachedEnd = true;
          break;
        }

        currentCursorDoc = snap.docs[snap.docs.length - 1];

        const batchClosedDeliveries = snap.docs
          .map(d => ({ id: d.id, ...d.data() }) as DeliveryHistoryOrder)
          .filter(o => {
            const tipo = (o.status || '').toLowerCase();
            const orderTipo = ((o as any).tipo || (o as any).tipo_entrega || '').toLowerCase();
            const isDelivery = orderTipo === 'delivery' || orderTipo === 'entrega' || !!o.endereco_entrega;
            return isDelivery;
          });

        accumulatedDeliveries.push(...batchClosedDeliveries);

        if (snap.docs.length < PAGE_SIZE) {
          reachedEnd = true;
        }
      }

      setHasMore(!reachedEnd);
      setLastDoc(currentCursorDoc);

      if (reset) {
        setOrders(accumulatedDeliveries);
      } else {
        setOrders(prev => {
          const map = new Map<string, DeliveryHistoryOrder>();
          [...prev, ...accumulatedDeliveries].forEach(item => map.set(item.id, item));
          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.error('Erro ao buscar histórico de entregas:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchHistoryOrders(true);
  }, [restaurantId]);

  // Client-side filtering logic
  const filteredOrders = orders.filter(o => {
    const status = String(o.status || '').toLowerCase();
    const canonical = String(o.deliveryStatus || '').toUpperCase();
    const isCancelled = status === 'cancelado' || canonical === 'CANCELLED';

    if (statusFilter === 'DELIVERED' && isCancelled) return false;
    if (statusFilter === 'CANCELLED' && !isCancelled) return false;

    // Driver filter
    if (driverFilter !== 'ALL') {
      const dId = o.driverId || o.assignedDriverId;
      if (dId !== driverFilter) return false;
    }

    // Period filter
    if (period !== 'all') {
      const created = new Date(o.data_criacao || o.createdAt || Date.now());
      const now = new Date();
      if (period === 'today') {
        if (created.toDateString() !== now.toDateString()) return false;
      } else if (period === 'yesterday') {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        if (created.toDateString() !== y.toDateString()) return false;
      } else if (period === '7days') {
        const d7 = new Date();
        d7.setDate(d7.getDate() - 7);
        if (created < d7) return false;
      } else if (period === '30days') {
        const d30 = new Date();
        d30.setDate(d30.getDate() - 30);
        if (created < d30) return false;
      }
    }

    // Search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const code = String(o.numero_pedido || o.id).toLowerCase();
      const customer = String(o.cliente_nome || '').toLowerCase();
      const phone = String(o.cliente_telefone || '').toLowerCase();
      return code.includes(term) || customer.includes(term) || phone.includes(term);
    }

    return true;
  });

  // Calculate metrics
  const totalCount = filteredOrders.length;
  const deliveredCount = filteredOrders.filter(o => {
    const st = String(o.status || '').toLowerCase();
    return st !== 'cancelado';
  }).length;
  const cancelledCount = totalCount - deliveredCount;
  const totalRevenue = filteredOrders.reduce((acc, o) => {
    if (String(o.status || '').toLowerCase() === 'cancelado') return acc;
    return acc + Number(o.valor_total || 0);
  }, 0);

  const renderAddress = (addr: any) => {
    if (!addr) return 'Endereço não informado';
    if (typeof addr === 'string') return addr;
    const { endereco, rua, numero, bairro, referencia } = addr;
    const street = endereco || rua || '';
    return `${street}${numero ? `, nº ${numero}` : ''}${bairro ? ` - ${bairro}` : ''}${referencia ? ` (${referencia})` : ''}`;
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total de Corridas"
          value={totalCount}
          icon={Bike}
          iconBgColor="bg-stone-50"
          iconTextColor="text-stone-500"
        />
        <StatCard
          title="Entregas Concluídas"
          value={deliveredCount}
          icon={CheckCircle2}
          iconBgColor="bg-emerald-50"
          iconTextColor="text-emerald-600"
        />
        <StatCard
          title="Entregas Canceladas"
          value={cancelledCount}
          icon={XCircle}
          iconBgColor="bg-rose-50"
          iconTextColor="text-rose-600"
        />
        <StatCard
          title="Total Entregue"
          value={totalRevenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          icon={DollarSign}
          iconBgColor="bg-amber-50"
          iconTextColor="text-amber-600"
        />
      </div>

      {/* Filter and Search Bar */}
      <Card padding="sm" className="flex flex-col lg:flex-row gap-4 items-center justify-between">
        <SearchInput
          placeholder="Buscar por cliente, pedido, tel..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full lg:w-80"
        />

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Period select */}
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="w-full sm:w-auto min-w-[150px]"
          >
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="7days">Últimos 7 dias</option>
            <option value="30days">Últimos 30 dias</option>
            <option value="all">Todo o histórico</option>
          </Select>

          {/* Driver Filter */}
          <Select
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            className="w-full sm:w-auto min-w-[180px]"
          >
            <option value="ALL">Todos os Entregadores</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full sm:w-auto min-w-[160px]"
          >
            <option value="ALL">Todos os Status</option>
            <option value="DELIVERED">Somente Concluídos</option>
            <option value="CANCELLED">Somente Cancelados</option>
          </Select>
        </div>
      </Card>

      {/* Orders List */}
      {loading ? (
        <LoadingState message="Carregando histórico de entregas..." />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="Nenhuma entrega encontrada no histórico"
          description="Nenhum registro de entrega corresponde aos filtros e período selecionados."
          icon={Clock}
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isCancelled = String(order.status || '').toLowerCase() === 'cancelado';
            const driverName = order.driverName || order.assignedDriverName || 'Próprio / Balcão';

            return (
              <Card
                key={order.id}
                padding="sm"
                hoverable
                onClick={() => setSelectedOrder(order)}
                className="hover:border-emerald-300 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-2xl shrink-0 ${isCancelled ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {isCancelled ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-stone-850 text-sm">
                        #{order.numero_pedido || String(order?.id || '').slice(-6).toUpperCase() || '------'}
                      </span>
                      <Badge 
                        variant={isCancelled ? 'danger' : 'success'} 
                        size="sm"
                      >
                        {isCancelled ? 'Cancelado' : 'Entregue'}
                      </Badge>
                      <span className="text-xs text-stone-400 font-semibold ml-1">
                        {order.data_criacao ? new Date(order.data_criacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                      </span>
                    </div>

                    <p className="font-bold text-stone-800 text-xs">{order.cliente_nome || 'Cliente'}</p>
                    <p className="text-xs text-stone-500 line-clamp-1">{renderAddress(order.endereco_entrega)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-stone-100">
                  <div className="text-left md:text-right">
                    <p className="text-xs font-bold text-stone-500">Entregador</p>
                    <p className="font-bold text-stone-850 text-xs">{driverName}</p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-bold text-stone-500">Valor total</p>
                    <p className="font-black text-stone-900 text-base">
                      {Number(order.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>

                  <ChevronRight className="w-5 h-5 text-stone-300 shrink-0 hidden md:block" />
                </div>
              </Card>
            );
          })}

          {hasMore && (
            <div className="pt-4 text-center">
              <Button
                onClick={() => fetchHistoryOrders(false)}
                disabled={loadingMore}
                loading={loadingMore}
                variant="secondary"
                size="sm"
              >
                Carregar mais entregas
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card padding="lg" className="max-w-lg w-full space-y-6 shadow-xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div>
                <h3 className="font-black text-stone-850 text-lg">
                  Pedido #{selectedOrder.numero_pedido || String(selectedOrder?.id || '').slice(-6).toUpperCase() || '------'}
                </h3>
                <p className="text-xs text-stone-400">
                  {selectedOrder.data_criacao ? new Date(selectedOrder.data_criacao).toLocaleString('pt-BR') : ''}
                </p>
              </div>

              <IconButton
                onClick={() => setSelectedOrder(null)}
                variant="ghost"
                size="sm"
                aria-label="Fechar detalhes"
              >
                <X className="w-5 h-5" />
              </IconButton>
            </div>

            <div className="space-y-4 text-xs text-stone-700 font-semibold">
              <div className="bg-stone-50 p-4 rounded-2xl space-y-2 border border-stone-100/80">
                <p className="font-extrabold text-stone-850 text-sm">{selectedOrder.cliente_nome || 'Cliente'}</p>
                {selectedOrder.cliente_telefone && <p className="text-stone-500">{selectedOrder.cliente_telefone}</p>}
                <p className="text-stone-600 font-semibold">{renderAddress(selectedOrder.endereco_entrega)}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-100/80">
                <div>
                  <p className="text-xs font-bold text-stone-500">Entregador</p>
                  <p className="font-bold text-stone-850 text-sm mt-0.5">
                    {selectedOrder.driverName || selectedOrder.assignedDriverName || 'Próprio / Balcão'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-500">Pagamento</p>
                  <p className="font-bold text-stone-850 text-sm mt-0.5">{selectedOrder.forma_pagamento || 'Dinheiro / PIX'}</p>
                </div>
              </div>

              {selectedOrder.items && selectedOrder.items.length > 0 && (
                <div className="space-y-2.5">
                  <p className="font-bold text-stone-500 text-xs">Itens do pedido</p>
                  <div className="divide-y divide-stone-100 max-h-40 overflow-y-auto pr-1">
                    {selectedOrder.items.map((item: any, idx: number) => (
                      <div key={idx} className="py-2.5 flex items-center justify-between font-semibold">
                        <span className="text-stone-700">{item.quantidade || 1}x {item.nome || item.product_name}</span>
                        <span className="font-bold text-stone-900">
                          {Number(item.preco || item.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-stone-100 text-sm font-bold">
                <span className="text-stone-700">Total do Pedido:</span>
                <span className="text-stone-900 text-base font-black">
                  {Number(selectedOrder.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                onClick={() => setSelectedOrder(null)}
                variant="primary"
                size="md"
                className="w-full"
              >
                Fechar Detalhes
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
