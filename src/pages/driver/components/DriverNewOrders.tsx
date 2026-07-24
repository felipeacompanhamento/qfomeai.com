import React from 'react';
import { Package } from 'lucide-react';
import { AssignedOrder, LatLng } from '../types';
import { DriverOrderCard } from './DriverOrderCard';

interface DriverNewOrdersProps {
  orders: AssignedOrder[];
  currentLocation?: LatLng | null;
  isLoadingId?: string | null;
  onAccept: (order: AssignedOrder) => void;
  onReject: (order: AssignedOrder) => void;
}

export const DriverNewOrders: React.FC<DriverNewOrdersProps> = ({
  orders,
  currentLocation,
  isLoadingId,
  onAccept,
  onReject
}) => {
  if (!orders || orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-stone-200 mt-4 space-y-3">
        <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
          <Package className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-stone-800">Nenhum pedido novo</h3>
        <p className="text-xs text-stone-500 max-w-xs">
          Novos pedidos atribuídos pelo restaurante aparecerão aqui em tempo real.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
          Novos Pedidos ({orders.length})
        </span>
      </div>

      {orders.map((order) => (
        <DriverOrderCard
          key={order.id}
          order={order}
          canonicalStatus="ASSIGNED"
          currentLocation={currentLocation}
          isLoading={isLoadingId === order.id}
          onAccept={onAccept}
          onReject={onReject}
        />
      ))}
    </div>
  );
};
