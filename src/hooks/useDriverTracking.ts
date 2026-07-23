import { useEffect, useState } from 'react';
import { driverLocationService } from '../services/driverLocationService';

export function useDriverTracking(
  isOnDelivery: boolean,
  getActiveOrderIds: () => string[],
  getIdToken: () => Promise<string | null>
) {
  const [gpsStatus, setGpsStatus] = useState<string>('GPS inativo');
  const [isTracking, setIsTracking] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = driverLocationService.subscribeStatus((status) => {
      setGpsStatus(status);
      setIsTracking(status.includes('Sincronizado') || status.includes('Aguardando') || status.includes('Ativo'));
    });

    if (isOnDelivery) {
      driverLocationService.startTracking(getActiveOrderIds, getIdToken);
    } else {
      driverLocationService.stopTracking();
      setIsTracking(false);
    }

    return () => {
      unsubscribe();
      if (!isOnDelivery) {
        driverLocationService.stopTracking();
      }
    };
  }, [isOnDelivery]);

  return { gpsStatus, isTracking };
}
