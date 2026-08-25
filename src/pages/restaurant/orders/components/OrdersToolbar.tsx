import React from 'react';
import { AlertCircle } from 'lucide-react';
import { SearchInput } from '../../../../components/ui';

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
  const totalCount = statusCounts.novo + statusCounts.confirmado + statusCounts.cozinha + statusCounts.entrega;

  return (
    <div className="bg-white border-b border-stone-200/80 p-2.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 w-full max-w-full min-w-0 shrink-0">
      {/* Search Input */}
      <div className="w-full md:w-64 lg:w-72 shrink-0">
        <SearchInput
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar #pedido, cliente..."
        />
      </div>

      {/* Quick Status Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-full min-w-0 touch-pan-x">
        <button
          type="button"
          onClick={() => onSelectFilterColumn(null)}
          className={`px-3 py-1.5 min-h-[34px] rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border ${
            activeFilterColumn === null
              ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
              : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          Todos ({totalCount})
        </button>

        <button
          type="button"
          onClick={() => onSelectFilterColumn(activeFilterColumn === 'novo' ? null : 'novo')}
          className={`px-3 py-1.5 min-h-[34px] rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border ${
            activeFilterColumn === 'novo'
              ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
              : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          <span>Novos</span>
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-extrabold ${activeFilterColumn === 'novo' ? 'bg-white/20 text-white' : 'bg-stone-200/80 text-stone-700'}`}>
            {statusCounts.novo}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectFilterColumn(activeFilterColumn === 'confirmado' ? null : 'confirmado')}
          className={`px-3 py-1.5 min-h-[34px] rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border ${
            activeFilterColumn === 'confirmado'
              ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
              : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          <span>Confirmados</span>
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-extrabold ${activeFilterColumn === 'confirmado' ? 'bg-white/20 text-white' : 'bg-stone-200/80 text-stone-700'}`}>
            {statusCounts.confirmado}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectFilterColumn(activeFilterColumn === 'cozinha' ? null : 'cozinha')}
          className={`px-3 py-1.5 min-h-[34px] rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border ${
            activeFilterColumn === 'cozinha'
              ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
              : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          <span>Cozinha</span>
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-extrabold ${activeFilterColumn === 'cozinha' ? 'bg-white/20 text-white' : 'bg-stone-200/80 text-stone-700'}`}>
            {statusCounts.cozinha}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectFilterColumn(activeFilterColumn === 'entrega' ? null : 'entrega')}
          className={`px-3 py-1.5 min-h-[34px] rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border ${
            activeFilterColumn === 'entrega'
              ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
              : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
          }`}
        >
          <span>Entrega</span>
          <span className={`px-1.5 py-0.5 rounded-full text-xs font-extrabold ${activeFilterColumn === 'entrega' ? 'bg-white/20 text-white' : 'bg-stone-200/80 text-stone-700'}`}>
            {statusCounts.entrega}
          </span>
        </button>

        {statusCounts.pendingSettlement > 0 && (
          <button
            type="button"
            onClick={() => onSelectFilterColumn(activeFilterColumn === 'entrega' ? null : 'entrega')}
            className="px-3 py-1.5 min-h-[34px] rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 border border-amber-600 shadow-2xs animate-pulse cursor-pointer"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Conf. Recebimento ({statusCounts.pendingSettlement})</span>
          </button>
        )}
      </div>
    </div>
  );
};

