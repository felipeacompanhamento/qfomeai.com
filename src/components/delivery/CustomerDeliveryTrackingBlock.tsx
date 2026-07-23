import React, { useEffect, useState, lazy, Suspense } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Bike, Clock, MapPin, Navigation, AlertTriangle, ExternalLink } from 'lucide-react';

const DeliveryTrackingMap = lazy(() => import('./DeliveryTrackingMap'));

interface CustomerDeliveryTrackingBlockProps {
  restaurantId: string;
  orderId: string;
  customerAddress?: any;
}

export default function CustomerDeliveryTrackingBlock({
  restaurantId,
  orderId,
  customerAddress
}: CustomerDeliveryTrackingBlockProps) {
  const [deliveryData, setDeliveryData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isMapExpanded, setIsMapExpanded] = useState(true);

  useEffect(() => {
    if (!restaurantId || !orderId) return;

    const deliveryRef = doc(db, 'restaurants', restaurantId, 'deliveries', orderId);
    const unsubscribe = onSnapshot(deliveryRef, (snapshot) => {
      if (snapshot.exists()) {
        setDeliveryData(snapshot.data());
      }
      setLoading(false);
    }, (error) => {
      console.warn('Silent listener error on customer delivery tracking:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [restaurantId, orderId]);

  if (loading || !deliveryData) {
    return null;
  }

  const isOutForDelivery = 
    deliveryData.status === 'delivering' ||
    deliveryData.deliveryStatus === 'IN_TRANSIT' ||
    deliveryData.status_entrega === 'out_for_delivery';

  if (!isOutForDelivery) {
    return null;
  }

  const currentLocation = deliveryData.currentLocation;
  const recordedAt = currentLocation?.recordedAt ? new Date(currentLocation.recordedAt).getTime() : 0;
  const now = Date.now();
  const isOutdated = recordedAt > 0 && (now - recordedAt > 120000); // > 2 minutes

  const driverName = deliveryData.driverName || 'Entregador';
  const vehicle = deliveryData.vehicleInfo || deliveryData.veiculo;
  const departureTime = deliveryData.startedAt || deliveryData.horario_saida;

  const customerLat = typeof customerAddress === 'object' ? customerAddress?.latitude : null;
  const customerLng = typeof customerAddress === 'object' ? customerAddress?.longitude : null;

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 text-white space-y-4 my-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-stone-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
            <Bike className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">ENTREGA EM ANDAMENTO</span>
            <h4 className="text-sm font-extrabold text-stone-100">Acompanhar Entregador</h4>
          </div>
        </div>

        <button
          onClick={() => setIsMapExpanded(!isMapExpanded)}
          className="text-xs font-bold text-emerald-400 hover:underline px-2.5 py-1 bg-white/5 rounded-lg border border-white/10"
        >
          {isMapExpanded ? 'Ocultar Mapa' : 'Ver Mapa'}
        </button>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between text-stone-300">
          <span>Entregador:</span>
          <strong className="text-white font-bold">{driverName}</strong>
        </div>

        {vehicle && (
          <div className="flex items-center justify-between text-stone-300">
            <span>Veículo / Placa:</span>
            <strong className="text-white font-bold">{vehicle}</strong>
          </div>
        )}

        {departureTime && (
          <div className="flex items-center justify-between text-stone-300">
            <span>Horário de Saída:</span>
            <span className="text-stone-300 font-bold">
              {new Date(departureTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        )}

        {isOutdated ? (
          <div className="bg-amber-500/15 border border-amber-500/30 text-amber-200 p-3 rounded-2xl flex items-start gap-2.5 mt-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Localização temporariamente indisponível. O entregador continua com seu pedido.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            <span>Rastreamento ao vivo ativo</span>
          </div>
        )}
      </div>

      {isMapExpanded && (
        <div className="pt-1">
          <Suspense fallback={<div className="h-48 bg-stone-800 rounded-2xl animate-pulse flex items-center justify-center text-xs text-stone-400">Carregando mapa ao vivo...</div>}>
            <DeliveryTrackingMap
              driverLocation={currentLocation?.latitude ? {
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                label: `Entregador: ${driverName}`
              } : null}
              customerLocation={customerLat && customerLng ? {
                latitude: customerLat,
                longitude: customerLng,
                label: 'Seu Endereço'
              } : null}
              height="240px"
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
