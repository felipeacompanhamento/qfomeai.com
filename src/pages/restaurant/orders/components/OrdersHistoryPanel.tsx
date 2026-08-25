import React, { useEffect } from 'react';
import { X, Calendar, Filter, Clock, ShoppingBag, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { useOrdersHistory } from '../hooks/useOrdersHistory';
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
            className="text-stone-400 hover:text-white hover:bg-stone-800"
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
            <span className="text-xs font-semibold text-stone-500 block">Entregues</span>
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
            placeholder="Buscar #código, cliente ou telefone..."
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Period Selector */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(['today', 'yesterday', '7days', '30days', 'all'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, period: p }))}
                  className={`px-2.5 py-1 rounded-xl font-bold transition-all shrink-0 cursor-pointer border ${
                    filters.period === p
                      ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
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
                  className={`px-2.5 py-1 rounded-xl font-bold transition-all shrink-0 cursor-pointer border ${
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
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar bg-stone-50/50">
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
                const orderCode = (order.id || '').slice(-6).toUpperCase();
                const fullCustomer = order.cliente_nome || order.nome_cliente || order.customerName || 'Cliente';
                const customer = fullCustomer.trim().split(' ')[0] || 'Cliente';
                const total = Number(order.total || order.valor_total || 0);
                const dateStr = order.data_criacao || order.createdAt || '';
                const formattedDate = dateStr ? new Date(dateStr).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data n/d';

                return (
                  <div
                    key={order.id}
                    onClick={() => {
                      onSelectOrder(order);
                      onClose();
                    }}
                    className="bg-white p-3.5 rounded-2xl border border-stone-200/80 hover:border-emerald-500 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-stone-900">
                          #{orderCode}
                        </span>
                        <Badge variant={isCancelled ? 'danger' : 'success'} size="sm">
                          {isCancelled ? 'Cancelado' : 'Concluído'}
                        </Badge>
                        <span className="text-xs text-stone-400">
                          {formattedDate}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-stone-800 truncate">
                        {customer}
                      </p>
                      <p className="text-xs text-stone-500">
                        {order.forma_pagamento || order.paymentMethod || 'Pagamento na entrega'} • R$ {total.toFixed(2)}
                      </p>
                    </div>

                    <div className="p-2 bg-stone-50 rounded-xl text-stone-400 hover:text-stone-700 shrink-0">
                      <ArrowRight className="w-4 h-4" />
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
                  className="w-full mt-2"
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

