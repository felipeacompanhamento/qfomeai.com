import React, { useEffect } from 'react';
import { 
  X, 
  Clock, 
  ShoppingBag, 
  ArrowRight, 
  Loader2, 
  RefreshCw, 
  Utensils, 
  Bike, 
  Monitor, 
  Store, 
  User, 
  Phone,
  CheckCircle2,
  XCircle,
  Hash
} from 'lucide-react';
import { useOrdersHistory, HistoryOriginFilter, HistoryBalcaoSubFilter } from '../hooks/useOrdersHistory';
import { getOrderModality, OrderModality } from '../../../../domain/order/orderSource';
import { 
  extractOrderTableDisplay, 
  extractOrderComandaDisplay, 
  extractOrderWaiterDisplay 
} from '../utils/orderPresentation';
import { getCanonicalOrderState } from '../../../../domain/order/orderLifecycle';
import { SearchInput, Button, IconButton, Badge, EmptyState } from '../../../../components/ui';

interface OrdersHistoryPanelProps {
  isOpen: boolean;
  restaurantId: string | undefined | null;
  onClose: () => void;
  onSelectOrder: (order: any) => void;
}

export const OrdersHistoryPanel: React.FC<OrdersHistoryPanelProps> = ({
  isOpen,
  restaurantId,
  onClose,
  onSelectOrder
}) => {
  const {
    historyOrders,
    historyMetrics,
    loading,
    hasMore,
    filters,
    setFilters,
    fetchHistory,
    loadMore
  } = useOrdersHistory(restaurantId);

  useEffect(() => {
    if (isOpen && restaurantId) {
      fetchHistory(true);
    }
  }, [isOpen, restaurantId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl overflow-hidden border-l border-stone-200">
        {/* Header */}
        <div className="bg-stone-900 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              <span>Histórico de Pedidos</span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Consulte pedidos concluídos, entregues e cancelados
            </p>
          </div>
          <IconButton
            variant="ghost"
            aria-label="Fechar histórico"
            onClick={onClose}
            className="text-stone-400 hover:text-white hover:bg-stone-800 min-h-[44px] min-w-[44px]"
          >
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Metrics Summary Row */}
        <div className="bg-stone-50 border-b border-stone-200/80 p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center shrink-0">
          <div className="bg-white p-3 rounded-2xl border border-stone-200/80 shadow-2xs">
            <span className="text-xs font-semibold text-stone-500 block">Total Pedidos</span>
            <span className="text-base font-black text-stone-900 mt-0.5 block">{historyMetrics.totalCount}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-stone-200/80 shadow-2xs">
            <span className="text-xs font-semibold text-stone-500 block">Faturamento</span>
            <span className="text-base font-black text-emerald-700 mt-0.5 block">R$ {historyMetrics.totalSales.toFixed(2)}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-stone-200/80 shadow-2xs">
            <span className="text-xs font-semibold text-stone-500 block">Entregues / Servidos</span>
            <span className="text-base font-black text-stone-900 mt-0.5 block">{historyMetrics.deliveredCount}</span>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-stone-200/80 shadow-2xs">
            <span className="text-xs font-semibold text-stone-500 block">Cancelados</span>
            <span className="text-base font-black text-rose-600 mt-0.5 block">{historyMetrics.cancelledCount}</span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 bg-white border-b border-stone-200/80 space-y-3 shrink-0">
          {/* Search Input */}
          <SearchInput
            value={filters.searchTerm}
            onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
            placeholder="Buscar por #pedido, cliente, mesa, comanda ou garçom..."
          />

          {/* Primary Origin Filters */}
          <div className="space-y-1">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
              Origem da Operação
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
              {[
                { id: 'ALL', label: 'TODOS' },
                { id: 'DELIVERY', label: 'DELIVERY' },
                { id: 'GARCOM', label: 'GARÇOM / MESA' },
                { id: 'BALCAO', label: 'BALCÃO' },
                { id: 'TOTEM', label: 'TOTEM' },
              ].map((item) => {
                const isActive = (filters.originFilter || 'ALL') === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setFilters(prev => ({
                        ...prev,
                        originFilter: item.id as HistoryOriginFilter,
                        balcaoSubFilter: 'ALL'
                      }));
                    }}
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border flex items-center justify-center whitespace-nowrap ${
                      isActive
                        ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
                        : 'bg-stone-50 text-stone-700 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Balcão Subfilters (Visible only when BALCÃO is selected) */}
          {filters.originFilter === 'BALCAO' && (
            <div className="p-2.5 bg-amber-50/80 rounded-2xl border border-amber-200/80 space-y-1 animate-fadeIn">
              <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block">
                Modalidade no Balcão
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {[
                  { id: 'ALL', label: 'TODOS' },
                  { id: 'RETIRADA', label: 'RETIRADA' },
                  { id: 'MESA', label: 'MESA' },
                  { id: 'ENTREGA', label: 'ENTREGA' },
                ].map((sub) => {
                  const isSubActive = (filters.balcaoSubFilter || 'ALL') === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setFilters(prev => ({
                          ...prev,
                          balcaoSubFilter: sub.id as HistoryBalcaoSubFilter
                        }));
                      }}
                      className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border flex items-center justify-center whitespace-nowrap ${
                        isSubActive
                          ? 'bg-amber-700 text-white border-amber-700 shadow-2xs'
                          : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100/70'
                      }`}
                    >
                      {sub.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Period & Status Selectors */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {/* Period Selector */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(['today', 'yesterday', '7days', '30days', 'all'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, period: p }))}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border flex items-center justify-center whitespace-nowrap ${
                    filters.period === p
                      ? 'bg-stone-800 text-white border-stone-800 shadow-2xs'
                      : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  {p === 'today' ? 'Hoje' : p === 'yesterday' ? 'Ontem' : p === '7days' ? '7 dias' : p === '30days' ? '30 dias' : 'Todos'}
                </button>
              ))}
            </div>

            {/* Status Selector */}
            <div className="flex items-center gap-1">
              {(['ALL', 'FINALIZED', 'CANCELLED'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, status: s }))}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border flex items-center justify-center whitespace-nowrap ${
                    filters.status === s
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
                  }`}
                >
                  {s === 'ALL' ? 'Todos' : s === 'FINALIZED' ? 'Concluídos' : 'Cancelados'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Orders List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-stone-50/50">
          {loading && historyOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-stone-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <span className="text-xs font-semibold">Carregando histórico...</span>
            </div>
          ) : historyOrders.length === 0 ? (
            <EmptyState
              title="Nenhum pedido no histórico"
              description="Tente alterar os filtros acima para expandir a busca."
              icon={ShoppingBag}
            />
          ) : (
            <>
              {historyOrders.map((order) => {
                const isCancelled = order.orderStatus === 'CANCELLED' || order.status === 'cancelado';
                const modality: OrderModality = getOrderModality(order);
                const orderNum = order.numero_pedido || order.numeroPedido || (order.id || '').slice(-6).toUpperCase();
                
                const fullCustomer = order.cliente_nome || order.nome_cliente || order.customerName || order.cliente?.nome || '';
                const customerPhone = order.cliente_telefone || order.telefone_cliente || order.customerPhone || order.cliente?.telefone || order.telefone || '';
                
                const tableDisplay = extractOrderTableDisplay(order);
                const comandaDisplay = extractOrderComandaDisplay(order);
                const waiterDisplay = extractOrderWaiterDisplay(order);
                const totemSenha = order.senha || order.password || order.pickupNumber || order.retiradaNumero || '';

                const total = Number(order.total || order.valor_total || 0);
                const dateStr = order.data_criacao || order.createdAt || '';
                const formattedDate = dateStr ? new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data n/d';

                const { deliveryStatus } = getCanonicalOrderState(order);
                const rawStatus = String(order.status || '').toLowerCase();

                // Build Modality-Specific Details
                return (
                  <div
                    key={order.id}
                    onClick={() => {
                      onSelectOrder(order);
                      onClose();
                    }}
                    className="bg-white p-3.5 sm:p-4 rounded-2xl border border-stone-200/90 hover:border-emerald-500 transition-all cursor-pointer shadow-2xs hover:shadow-xs space-y-2.5"
                  >
                    {/* Top Row: Modality Badge + Order Number + Status + Date */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Specific Modality Badge */}
                        {modality === 'GARCOM_MESA' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                            <Utensils className="w-3 h-3" />
                            <span>GARÇOM • MESA</span>
                          </span>
                        ) : modality === 'BALCAO_RETIRADA' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                            <Store className="w-3 h-3" />
                            <span>BALCÃO • RETIRADA</span>
                          </span>
                        ) : modality === 'BALCAO_MESA' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase bg-orange-50 text-orange-800 border border-orange-200 shrink-0">
                            <Store className="w-3 h-3" />
                            <span>BALCÃO • MESA</span>
                          </span>
                        ) : modality === 'BALCAO_ENTREGA' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase bg-sky-50 text-sky-800 border border-sky-200 shrink-0">
                            <Bike className="w-3 h-3" />
                            <span>BALCÃO • ENTREGA</span>
                          </span>
                        ) : modality === 'TOTEM' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase bg-violet-50 text-violet-800 border border-violet-200 shrink-0">
                            <Monitor className="w-3 h-3" />
                            <span>TOTEM</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black tracking-wider uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                            <Bike className="w-3 h-3" />
                            <span>DELIVERY</span>
                          </span>
                        )}

                        <span className="text-xs sm:text-sm font-black text-stone-900 font-mono">
                          Pedido #{orderNum}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Modality Status Badges */}
                        {isCancelled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3" />
                            <span>Cancelado</span>
                          </span>
                        ) : modality === 'GARCOM_MESA' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Servido</span>
                          </span>
                        ) : modality === 'BALCAO_RETIRADA' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Retirado</span>
                          </span>
                        ) : modality === 'BALCAO_MESA' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Finalizado</span>
                          </span>
                        ) : modality === 'BALCAO_ENTREGA' || modality === 'DELIVERY' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>
                              {deliveryStatus === 'DELIVERED' || rawStatus === 'entregue' || rawStatus === 'finalizado'
                                ? 'Entregue'
                                : deliveryStatus === 'IN_TRANSIT' || ['despachado', 'entrega', 'saiu para entrega'].includes(rawStatus)
                                ? 'Em Rota'
                                : 'Concluído'}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Finalizado</span>
                          </span>
                        )}

                        <span className="text-xs text-stone-400">
                          {formattedDate}
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Modality-Specific Content */}
                    {modality === 'GARCOM_MESA' ? (
                      /* GARÇOM: Mesa, Comanda, Garçom */
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-stone-700 bg-stone-50/80 p-2.5 rounded-xl border border-stone-100">
                        <span className="font-extrabold text-stone-900 flex items-center gap-1">
                          <span className="text-stone-400 font-normal">Mesa:</span>
                          <span className="bg-indigo-100/70 text-indigo-900 px-1.5 py-0.5 rounded font-bold">
                            {tableDisplay !== '--' ? tableDisplay : 'Balcão/Salão'}
                          </span>
                        </span>

                        <span className="font-extrabold text-stone-900 flex items-center gap-1">
                          <span className="text-stone-400 font-normal">Comanda:</span>
                          <span className="bg-stone-200/80 text-stone-800 px-1.5 py-0.5 rounded font-bold">
                            {comandaDisplay !== '--' ? comandaDisplay : '--'}
                          </span>
                        </span>

                        <span className="font-bold text-stone-800 flex items-center gap-1">
                          <span className="text-stone-400 font-normal">Garçom:</span>
                          <span>{waiterDisplay !== '--' ? waiterDisplay : 'Lançamento Mesa'}</span>
                        </span>
                      </div>
                    ) : modality === 'BALCAO_RETIRADA' ? (
                      /* BALCÃO RETIRADA: Cliente, se existir */
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-stone-700 bg-stone-50/80 p-2.5 rounded-xl border border-stone-100">
                        <span className="font-bold text-stone-900 flex items-center gap-1 truncate">
                          <span className="text-stone-400 font-normal">Cliente:</span>
                          <span>{fullCustomer || 'Consumo Imediato / Retirada'}</span>
                        </span>
                        {customerPhone && (
                          <span className="text-stone-500 flex items-center gap-1 shrink-0">
                            <Phone className="w-3 h-3 text-stone-400" />
                            <span>{customerPhone}</span>
                          </span>
                        )}
                      </div>
                    ) : modality === 'BALCAO_MESA' ? (
                      /* BALCÃO MESA: Mesa, Comanda, Cliente se houver */
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-stone-700 bg-stone-50/80 p-2.5 rounded-xl border border-stone-100">
                        <span className="font-extrabold text-stone-900 flex items-center gap-1">
                          <span className="text-stone-400 font-normal">Mesa:</span>
                          <span className="bg-orange-100/70 text-orange-900 px-1.5 py-0.5 rounded font-bold">
                            {tableDisplay !== '--' ? tableDisplay : 'Mesa Salão'}
                          </span>
                        </span>
                        {comandaDisplay !== '--' && (
                          <span className="font-extrabold text-stone-900 flex items-center gap-1">
                            <span className="text-stone-400 font-normal">Comanda:</span>
                            <span className="bg-stone-200/80 text-stone-800 px-1.5 py-0.5 rounded font-bold">
                              {comandaDisplay}
                            </span>
                          </span>
                        )}
                        {fullCustomer && (
                          <span className="font-medium text-stone-700 flex items-center gap-1 truncate">
                            <span className="text-stone-400 font-normal">Cliente:</span>
                            <span>{fullCustomer}</span>
                          </span>
                        )}
                      </div>
                    ) : modality === 'BALCAO_ENTREGA' ? (
                      /* BALCÃO ENTREGA: Cliente, Status da entrega */
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-700 bg-stone-50/80 p-2.5 rounded-xl border border-stone-100">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-stone-400 font-normal">Cliente:</span>
                          <span className="font-extrabold text-stone-900 truncate">
                            {fullCustomer || 'Cliente'}
                          </span>
                          {customerPhone && (
                            <span className="text-stone-400 text-[11px] shrink-0 ml-1">
                              ({customerPhone})
                            </span>
                          )}
                        </div>
                        <div className="text-stone-500 font-medium shrink-0 flex items-center gap-1">
                          <span className="text-stone-400">Entrega:</span>
                          <span className="font-bold text-sky-800">
                            {order.driverName || order.entregador_nome 
                              ? `Entregador: ${order.driverName || order.entregador_nome}`
                              : 'Entrega Própria / Despacho'}
                          </span>
                        </div>
                      </div>
                    ) : modality === 'TOTEM' ? (
                      /* TOTEM: Número de retirada se existir */
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-stone-700 bg-stone-50/80 p-2.5 rounded-xl border border-stone-100">
                        {totemSenha && (
                          <span className="font-extrabold text-violet-900 flex items-center gap-1 bg-violet-100/70 px-2 py-0.5 rounded">
                            <Hash className="w-3 h-3 text-violet-600" />
                            <span>Retirada: #{totemSenha}</span>
                          </span>
                        )}
                        <span className="font-medium text-stone-700 flex items-center gap-1 truncate">
                          <span className="text-stone-400 font-normal">Terminal:</span>
                          <span>{fullCustomer || 'Autoatendimento'}</span>
                        </span>
                      </div>
                    ) : (
                      /* DELIVERY: Cliente, Status da entrega */
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-700 bg-stone-50/80 p-2.5 rounded-xl border border-stone-100">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-stone-400 font-normal">Cliente:</span>
                          <span className="font-extrabold text-stone-900 truncate">
                            {fullCustomer || 'Cliente'}
                          </span>
                          {customerPhone && (
                            <span className="text-stone-400 text-[11px] shrink-0 ml-1">
                              ({customerPhone})
                            </span>
                          )}
                        </div>
                        <div className="text-stone-500 font-medium shrink-0 flex items-center gap-1">
                          <span className="text-stone-400">Entrega:</span>
                          <span className="font-bold text-emerald-800">
                            {order.driverName || order.entregador_nome 
                              ? `Entregador: ${order.driverName || order.entregador_nome}`
                              : 'Delivery Padrão'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Bottom Row: Payment Method, Total and Open details arrow */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-100">
                      <span className="text-stone-500 truncate">
                        {order.forma_pagamento || order.paymentMethod || 'Pagamento registrado'}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-extrabold text-stone-900 text-sm">
                          R$ {total.toFixed(2)}
                        </span>
                        <div className="p-1 bg-stone-100 rounded-lg text-stone-500 hover:text-stone-900">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={loadMore}
                  loading={loading}
                  icon={<RefreshCw className="w-4 h-4 text-stone-500" />}
                  className="w-full mt-2 min-h-[44px]"
                >
                  Carregar mais histórico
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};


