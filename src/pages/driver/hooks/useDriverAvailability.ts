import { useState, useCallback } from 'react';
import { User } from 'firebase/auth';
import { DriverInfo, OfflineActionItem } from '../types';
import { addOfflineAction } from '../services/driverOfflineDb';

interface UseDriverAvailabilityOptions {
  user: User | null;
  driverDoc: DriverInfo | null;
  setDriverDoc: React.Dispatch<React.SetStateAction<DriverInfo | null>>;
  isOnline: boolean;
  generateUUID: () => string;
}

export const useDriverAvailability = ({
  user,
  driverDoc,
  setDriverDoc,
  isOnline,
  generateUUID
}: UseDriverAvailabilityOptions) => {
  const [toggleLoading, setToggleLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilitySuccess, setAvailabilitySuccess] = useState<string | null>(null);

  const toggleAvailability = useCallback(async () => {
    if (!user || toggleLoading) return;

    const currentStatus = driverDoc?.availabilityStatus || 'OFFLINE';
    const nextStatus = currentStatus === 'OFFLINE' ? 'ONLINE' : 'OFFLINE';

    setToggleLoading(true);
    setAvailabilityError(null);
    setAvailabilitySuccess(null);

    const clientActionId = generateUUID();

    // Optimistic update
    setDriverDoc(prev => prev ? { ...prev, availabilityStatus: nextStatus } : null);

    if (isOnline) {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/driver/availability', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            availabilityStatus: nextStatus,
            clientActionId
          })
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || 'Erro ao atualizar status de disponibilidade');
        }

        setAvailabilitySuccess(`Status alterado para ${nextStatus === 'ONLINE' ? 'Online' : 'Offline'}`);
        setTimeout(() => setAvailabilitySuccess(null), 3000);
      } catch (err: any) {
        // Rollback on failure
        setDriverDoc(prev => prev ? { ...prev, availabilityStatus: currentStatus } : null);
        setAvailabilityError(`Erro na atualização: ${err.message || 'Falha de comunicação'}`);
        setTimeout(() => setAvailabilityError(null), 4000);
      } finally {
        setToggleLoading(false);
      }
    } else {
      // Offline mode: Queue action & keep optimistic state
      const actionItem: OfflineActionItem = {
        id: clientActionId,
        clientActionId,
        type: 'DRIVER_AVAILABILITY',
        availabilityStatus: nextStatus,
        createdAt: new Date().toISOString()
      };

      await addOfflineAction(actionItem);

      setAvailabilitySuccess(`Status alterado offline para ${nextStatus === 'ONLINE' ? 'Online' : 'Offline'}`);
      setTimeout(() => setAvailabilitySuccess(null), 3000);
      setToggleLoading(false);
    }
  }, [user, driverDoc, toggleLoading, setDriverDoc, isOnline, generateUUID]);

  return {
    toggleAvailability,
    toggleLoading,
    availabilityError,
    availabilitySuccess
  };
};
