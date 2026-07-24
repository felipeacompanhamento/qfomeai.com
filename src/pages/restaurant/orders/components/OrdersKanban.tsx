import React from 'react';
import { OrdersKanbanColumn, ColumnConfig } from './OrdersKanbanColumn';
import { getOrderKanbanColumn } from '../../../../domain/order/orderLifecycle';

interface OrdersKanbanProps {
  orders: any[];
  nowMs: number;
  selectedOrder: any;
  updatingOrderId: string | null;
  onOrderClick: (order: any) => void;
  onUpdateStatus?: (orderId: string, status: string) => void;
  onPrintOrder?: (order: any) => void;
}

const KANBAN_COLUMNS: ColumnConfig[] = [
  {
    id: 'novo',
    title: 'Novo',
    accentColor: 'bg-blue-500',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    description: 'Aguardando aceite do restaurante'
  },
  {
    id: 'confirmado',
    title: 'Confirmado',
    accentColor: 'bg-indigo-500',
    badgeBg: 'bg-indigo-100',
    badgeText: 'text-indigo-800',
    description: 'Aceitos, aguardando início do preparo'
  },
  {
    id: 'cozinha',
    title: 'Cozinha',
    accentColor: 'bg-amber-500',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-900',
    description: 'Em preparo ou prontos para expedição'
  },
  {
    id: 'entrega',
    title: 'Entrega',
    accentColor: 'bg-emerald-500',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    description: 'Em rota ou entregue (pendente conferência)'
  }
];

export const OrdersKanban: React.FC<OrdersKanbanProps> = ({
  orders,
  nowMs,
  selectedOrder,
  updatingOrderId,
  onOrderClick,
  onUpdateStatus,
  onPrintOrder
}) => {
  // Group orders into the 4 operational columns using canonical state rules
  const groupedOrders: Record<string, any[]> = {
    novo: [],
    confirmado: [],
    cozinha: [],
    entrega: []
  };

  orders.forEach((order) => {
    const colId = getOrderKanbanColumn(order);
    if (groupedOrders[colId]) {
      groupedOrders[colId].push(order);
    }
  });

  return (
    <div className="w-full max-w-full min-w-0 flex-1 grid grid-cols-4 gap-2 lg:gap-3 p-2 sm:p-3 h-full overflow-hidden">
      {KANBAN_COLUMNS.map((config) => (
        <OrdersKanbanColumn
          key={config.id}
          config={config}
          orders={groupedOrders[config.id] || []}
          nowMs={nowMs}
          selectedOrder={selectedOrder}
          updatingOrderId={updatingOrderId}
          onOrderClick={onOrderClick}
          onUpdateStatus={onUpdateStatus}
          onPrintOrder={onPrintOrder}
        />
      ))}
    </div>
  );
};
