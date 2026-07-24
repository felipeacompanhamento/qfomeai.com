import React, { useEffect } from 'react';
import { 
  X, Search, Calendar, Filter, CheckCircle2, XCircle, DollarSign, 
  ShoppingBag, ArrowRight, Loader2, RefreshCw 
} from 'lucide-react';
import { useOrdersHistory, HistoryFilterOptions } from '../hooks/useOrdersHistory';

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
            <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
              <span>Histórico de Pedidos</span>
            </h2>
            <p className="text-xs text-stone-400">
              Consulte pedidos concluídos, entregues e cancelados
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Metrics Summary Row */}
        <div className="bg-stone-50 border-b border-stone-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center shrink-0">
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-bold text-stone-400 uppercase block">Total Pedidos</span>
            <span className="text-base font-black text-stone-900">{historyMetrics.totalCount}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-bold text-stone-400 uppercase block">Faturamento</span>
            <span className="text-base font-black text-emerald-700">R$ {historyMetrics.totalSales.toFixed(2)}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-bold text-stone-400 uppercase block">Entregues</span>
            <span className="text-base font-black text-stone-900">{historyMetrics.deliveredCount}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-bold text-stone-400 uppercase block">Cancelados</span>
            <span className="text-base font-black text-red-600">{historyMetrics.cancelledCount}</span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 bg-white border-b border-stone-200 space-y-3 shrink-0">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={filters.searchTerm}
              onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
              placeholder="Buscar #código, cliente ou telefone..."
              className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* Period Selector */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(['today', 'yesterday', '7days', '30days', 'all'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, period: p }))}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
                    filters.period === p
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
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
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
                    filters.status === s
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
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
            <div className="p-12 text-center text-stone-400 bg-white rounded-2xl border border-stone-200 space-y-2">
              <ShoppingBag className="w-8 h-8 mx-auto text-stone-300" />
              <p className="text-xs font-bold text-stone-700">Nenhum pedido encontrado no histórico</p>
              <p className="text-[11px] text-stone-500">Tente alterar os filtros acima para expandir a busca.</p>
            </div>
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
                    className="bg-white p-3.5 rounded-2xl border border-stone-200 hover:border-emerald-500 transition-all cursor-pointer shadow-2xs hover:shadow-xs flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-stone-900">
                          #{orderCode}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isCancelled
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {isCancelled ? 'Cancelado' : 'Concluído'}
                        </span>
                        <span className="text-[11px] text-stone-400">
                          {formattedDate}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-stone-800 truncate">
                        {customer}
                      </p>
                      <p className="text-[11px] text-stone-500">
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
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-xs font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin text-emerald-600" /> : <RefreshCw className="w-4 h-4 text-stone-500" />}
                  <span>Carregar mais histórico</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
