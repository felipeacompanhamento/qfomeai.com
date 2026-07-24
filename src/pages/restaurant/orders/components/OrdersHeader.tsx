import React from 'react';
import { Clock, LayoutGrid, List, RefreshCw, Radio, Plus } from 'lucide-react';

interface OrdersHeaderProps {
  restaurantName?: string;
  isOpen?: boolean;
  isLive?: boolean;
  viewMode: 'kanban' | 'list';
  onToggleViewMode: (mode: 'kanban' | 'list') => void;
  onOpenHistory: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const OrdersHeader: React.FC<OrdersHeaderProps> = ({
  restaurantName,
  isOpen = true,
  isLive = true,
  viewMode,
  onToggleViewMode,
  onOpenHistory,
  onRefresh,
  isRefreshing = false
}) => {
  return (
    <div className="bg-white border-b border-stone-200 px-3 py-2 sm:px-4 sm:py-2.5 flex flex-row items-center justify-between gap-2 shadow-2xs w-full max-w-full min-w-0 shrink-0">
      {/* Title & Live Status Indicator */}
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-base sm:text-lg font-black text-stone-900 tracking-tight shrink-0">
          Pedidos
        </h1>
        {isLive ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Ao Vivo
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200 shrink-0">
            Manual
          </span>
        )}
        {restaurantName && (
          <span className="hidden sm:inline text-xs text-stone-500 font-medium truncate max-w-[180px]">
            • {restaurantName}
          </span>
        )}
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600 text-xs font-semibold transition-all active:scale-95 flex items-center justify-center gap-1.5 shrink-0"
          title="Atualizar pedidos"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          <span className="hidden sm:inline">Atualizar</span>
        </button>

        {/* View Mode Toggle (Desktop) */}
        <div className="hidden md:flex bg-stone-100 p-1 rounded-xl border border-stone-200 shrink-0">
          <button
            type="button"
            onClick={() => onToggleViewMode('kanban')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'kanban'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Kanban</span>
          </button>
          <button
            type="button"
            onClick={() => onToggleViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'list'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Lista</span>
          </button>
        </div>

        {/* History Button */}
        <button
          type="button"
          onClick={onOpenHistory}
          className="flex-1 sm:flex-none min-h-[38px] px-3.5 py-1.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xs shrink-0"
        >
          <Clock className="w-4 h-4 text-emerald-600" />
          <span>Histórico</span>
        </button>
      </div>
    </div>
  );
};
