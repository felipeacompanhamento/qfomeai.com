import React from 'react';
import { Clock, LayoutGrid, List, RefreshCw, ShoppingBag } from 'lucide-react';
import { PageHeader, Button, Badge } from '../../../../components/ui';

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
    <div className="w-full shrink-0">
      <PageHeader
        title="Pedidos"
        description="Acompanhe e gerencie os pedidos em tempo real."
        icon={ShoppingBag}
        className="p-3.5 sm:p-5"
        action={
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap justify-end w-full sm:w-auto">
            {isLive ? (
              <Badge variant="success" size="sm" icon={<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}>
                <span className="text-[11px] sm:text-xs">Ao Vivo</span>
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                <span className="text-[11px] sm:text-xs">Manual</span>
              </Badge>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              loading={isRefreshing}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />}
              title="Atualizar pedidos"
              className="min-h-[36px] px-2.5 sm:px-3 text-xs"
            >
              <span className="inline">Atualizar</span>
            </Button>

            <div className="hidden md:flex bg-stone-100 p-1 rounded-xl border border-stone-200/80 shrink-0">
              <button
                type="button"
                onClick={() => onToggleViewMode('kanban')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
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
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Lista</span>
              </button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={onOpenHistory}
              icon={<Clock className="w-3.5 h-3.5 text-emerald-600" />}
              className="min-h-[36px] px-2.5 sm:px-3 text-xs"
            >
              <span>Histórico</span>
            </Button>
          </div>
        }
      />
    </div>
  );
};

