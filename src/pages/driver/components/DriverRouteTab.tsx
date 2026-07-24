import React, { useState } from 'react';
import { Navigation, Layers, Route as RouteIcon, Info } from 'lucide-react';
import { AssignedOrder, LatLng } from '../types';
import { DriverOrderCard } from './DriverOrderCard';
import { buildRouteBatches, openRouteInMaps } from '../services/driverMaps';

interface DriverRouteTabProps {
  orders: AssignedOrder[];
  currentLocation?: LatLng | null;
  isLoadingId?: string | null;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onStartDelivery: (order: AssignedOrder) => void;
  onCompleteDelivery: (order: AssignedOrder, paymentReport?: any) => void;
  onFailDelivery: (order: AssignedOrder, reason: string) => void;
}

export const DriverRouteTab: React.FC<DriverRouteTabProps> = ({
  orders,
  currentLocation,
  isLoadingId,
  onMoveUp,
  onMoveDown,
  onStartDelivery,
  onCompleteDelivery,
  onFailDelivery
}) => {
  const [selectedBatchIndex, setSelectedBatchIndex] = useState(0);

  if (!orders || orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-stone-200 mt-4 space-y-3">
        <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
          <RouteIcon className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-stone-800">Nenhum pedido na rota</h3>
        <p className="text-xs text-stone-500 max-w-xs">
          Aceite pedidos na aba "Novas" para organizá-los e iniciar sua rota no Google Maps.
        </p>
      </div>
    );
  }

  const batches = buildRouteBatches(orders, currentLocation);
  const activeBatch = batches[selectedBatchIndex] || batches[0];

  return (
    <div className="space-y-4">
      {/* Route Control Panel */}
      <div className="bg-stone-900 text-white rounded-2xl p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RouteIcon className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-bold tracking-tight">Rota de Entrega</span>
          </div>
          <span className="text-xs bg-stone-800 text-stone-300 px-2.5 py-1 rounded-full font-semibold border border-stone-700">
            {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}
          </span>
        </div>

        {/* Multi-batch selectors if > 4 orders */}
        {batches.length > 1 && (
          <div className="space-y-2 pt-1 border-t border-stone-800">
            <div className="flex items-center justify-between text-xs text-stone-300">
              <span className="font-medium flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Divide em trechos para o Google Maps:
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {batches.map((batch, idx) => (
                <button
                  key={batch.batchIndex}
                  type="button"
                  onClick={() => setSelectedBatchIndex(idx)}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all text-center border ${
                    selectedBatchIndex === idx
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                      : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-750'
                  }`}
                >
                  Trecho {batch.batchIndex} de {batch.totalBatches}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Big "IR / Iniciar rota no Maps" Button */}
        <button
          type="button"
          onClick={() => openRouteInMaps(orders, currentLocation, selectedBatchIndex)}
          className="w-full min-h-[48px] py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-stone-950 font-black text-sm tracking-wider uppercase flex items-center justify-center gap-2 shadow-md transition-all"
        >
          <Navigation className="w-5 h-5 fill-stone-950" />
          <span>
            {batches.length > 1
              ? `IR - Abrir Trecho ${activeBatch?.batchIndex || 1} no Maps`
              : 'IR - Iniciar Rota no Maps'}
          </span>
        </button>

        <p className="text-[11px] text-stone-400 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          Reordene as entregas abaixo ajustando a sequência ideal.
        </p>
      </div>

      {/* Orders List with Reordering */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-stone-700 uppercase tracking-wider px-1">
          Sequência de Entregas ({orders.length})
        </span>

        {orders.map((order, index) => {
          const canonicalStatus = order.deliveryStatus === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'ACCEPTED';

          return (
            <DriverOrderCard
              key={order.id}
              order={order}
              canonicalStatus={canonicalStatus}
              currentLocation={currentLocation}
              isLoading={isLoadingId === order.id}
              isRouteTab={true}
              onMoveUp={() => onMoveUp(index)}
              onMoveDown={() => onMoveDown(index)}
              canMoveUp={index > 0}
              canMoveDown={index < orders.length - 1}
              onStartDelivery={onStartDelivery}
              onCompleteDelivery={onCompleteDelivery}
              onFailDelivery={onFailDelivery}
            />
          );
        })}
      </div>
    </div>
  );
};
