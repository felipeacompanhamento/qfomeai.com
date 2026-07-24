import React from 'react';
import { RestaurantOrderCard } from './RestaurantOrderCard';

export interface ColumnConfig {
  id: string;
  title: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}

interface OrdersKanbanColumnProps {
  config: ColumnConfig;
  orders: any[];
  nowMs: number;
  selectedOrder: any;
  updatingOrderId: string | null;
  onOrderClick: (order: any) => void;
  onUpdateStatus?: (orderId: string, status: string) => void;
  onPrintOrder?: (order: any) => void;
}

export const OrdersKanbanColumn: React.FC<OrdersKanbanColumnProps> = ({
  config,
  orders,
  nowMs,
  selectedOrder,
  updatingOrderId,
  onOrderClick,
  onUpdateStatus,
  onPrintOrder
}) => {
  return (
    <div className="flex flex-col bg-stone-100/70 rounded-2xl border border-stone-200/80 overflow-hidden h-full w-full min-w-0 max-w-full">
      {/* Column Top Header Accent Bar */}
      <div className={`h-1.5 w-full shrink-0 ${config.accentColor}`} />

      {/* Column Header */}
      <div className="p-2 sm:p-2.5 bg-white/90 border-b border-stone-200 flex items-center justify-between shrink-0 min-w-0 overflow-hidden">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-xs sm:text-sm font-black text-stone-900 tracking-tight truncate">
              {config.title}
            </h2>
            <span className={`text-[10px] sm:text-xs font-black px-1.5 py-0.5 rounded-full shrink-0 ${config.badgeBg} ${config.badgeText}`}>
              {orders.length}
            </span>
          </div>
          <p className="text-[10px] text-stone-500 font-medium mt-0.5 truncate hidden sm:block">
            {config.description}
          </p>
        </div>
      </div>

      {/* Scrollable Card Container */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2.5 custom-scrollbar">
        {orders.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-stone-200 bg-white/40">
            <span className="text-xs font-semibold text-stone-400">
              Nenhum pedido nesta etapa
            </span>
          </div>
        ) : (
          orders.map((order) => (
            <RestaurantOrderCard
              key={order.id}
              order={order}
              nowMs={nowMs}
              isSelected={selectedOrder?.id === order.id}
              isUpdating={updatingOrderId === order.id}
              onOrderClick={onOrderClick}
              onUpdateStatus={onUpdateStatus}
              onPrintOrder={onPrintOrder}
            />
          ))
        )}
      </div>
    </div>
  );
};
