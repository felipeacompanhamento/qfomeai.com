import React from 'react';
import { History, CheckCircle, AlertCircle, DollarSign } from 'lucide-react';
import { AssignedOrder, LatLng } from '../types';
import { DriverOrderCard } from './DriverOrderCard';

interface DriverHistoryTabProps {
  historicalOrders: AssignedOrder[];
  currentLocation?: LatLng | null;
  todayDeliveriesCount: number;
  pendingSettlementAmount: number;
}

export const DriverHistoryTab: React.FC<DriverHistoryTabProps> = ({
  historicalOrders,
  currentLocation,
  todayDeliveriesCount,
  pendingSettlementAmount
}) => {
  return (
    <div className="space-y-4">
      {/* Daily Stats Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider block">
              Entregas Hoje
            </span>
            <span className="text-base font-black text-stone-900">
              {todayDeliveriesCount}
            </span>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-stone-200 shadow-xs flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-stone-500 font-semibold uppercase tracking-wider block">
              A Acertar
            </span>
            <span className="text-base font-black text-stone-900">
              R$ {pendingSettlementAmount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Historical List */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-stone-700 uppercase tracking-wider px-1">
          Histórico Recente ({historicalOrders.length})
        </span>

        {historicalOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-stone-200 space-y-3">
            <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
              <History className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-stone-800">Sem histórico recente</h3>
            <p className="text-xs text-stone-500 max-w-xs">
              As entregas concluídas ou não entregues do seu turno serão registradas aqui.
            </p>
          </div>
        ) : (
          historicalOrders.map((order) => {
            const canonicalStatus =
              order.deliveryStatus ||
              (order.status_entrega === 'delivered' ? 'DELIVERED' : 'FAILED');

            return (
              <DriverOrderCard
                key={order.id}
                order={order}
                canonicalStatus={canonicalStatus}
                currentLocation={currentLocation}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
