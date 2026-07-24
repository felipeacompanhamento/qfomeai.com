import React from 'react';
import { Search, Filter, AlertCircle, CheckCircle2 } from 'lucide-react';

interface OrdersToolbarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  statusCounts: {
    novo: number;
    confirmado: number;
    cozinha: number;
    entrega: number;
    pendingSettlement: number;
  };
  activeFilterColumn: string | null;
  onSelectFilterColumn: (columnId: string | null) => void;
}

export const OrdersToolbar: React.FC<OrdersToolbarProps> = ({
  searchTerm,
  onSearchChange,
  statusCounts,
  activeFilterColumn,
  onSelectFilterColumn
}) => {
  return (
    <div className="bg-stone-50 border-b border-stone-200 px-3 py-2 sm:px-4 flex flex-col md:flex-row md:items-center justify-between gap-2 w-full max-w-full min-w-0 overflow-hidden shrink-0">
      {/* Search Input */}
      <div className="relative w-full md:w-64 shrink-0">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar #pedido, cliente..."
          className="w-full pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
        />
      </div>

      {/* Quick Metrics / Status Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full min-w-0">
        <button
          type="button"
          onClick={() => onSelectFilterColumn(null)}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 border ${
            activeFilterColumn === null
              ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
              : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
          }`}
        >
          Todos ({statusCounts.novo + statusCounts.confirmado + statusCounts.cozinha + statusCounts.entrega})
        </button>

        <button
          type="button"
          onClick={() => onSelectFilterColumn(activeFilterColumn === 'novo' ? null : 'novo')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
            activeFilterColumn === 'novo'
              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
              : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
          }`}
        >
          <span>Novos</span>
          <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">
            {statusCounts.novo}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectFilterColumn(activeFilterColumn === 'confirmado' ? null : 'confirmado')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
            activeFilterColumn === 'confirmado'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
          }`}
        >
          <span>Confirmados</span>
          <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">
            {statusCounts.confirmado}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectFilterColumn(activeFilterColumn === 'cozinha' ? null : 'cozinha')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
            activeFilterColumn === 'cozinha'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
          }`}
        >
          <span>Cozinha</span>
          <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">
            {statusCounts.cozinha}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectFilterColumn(activeFilterColumn === 'entrega' ? null : 'entrega')}
          className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
            activeFilterColumn === 'entrega'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          <span>Entrega</span>
          <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px]">
            {statusCounts.entrega}
          </span>
        </button>

        {statusCounts.pendingSettlement > 0 && (
          <button
            type="button"
            onClick={() => onSelectFilterColumn(activeFilterColumn === 'entrega' ? null : 'entrega')}
            className="px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 bg-amber-500 text-stone-950 border border-amber-600 animate-pulse"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Conf. Recebimento ({statusCounts.pendingSettlement})</span>
          </button>
        )}
      </div>
    </div>
  );
};
