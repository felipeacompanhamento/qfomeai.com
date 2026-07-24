import { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { OfflineActionItem } from '../types';
import { getOfflineActions, removeOfflineAction } from '../services/driverOfflineDb';

interface UseDriverOfflineQueueOptions {
  user: User | null;
  isOnline: boolean;
  onSyncCompleted?: () => void;
}

export const useDriverOfflineQueue = ({
  user,
  isOnline,
  onSyncCompleted
}: UseDriverOfflineQueueOptions) => {
  const [pendingActions, setPendingActions] = useState<OfflineActionItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadPendingActions = useCallback(async () => {
    const actions = await getOfflineActions();
    setPendingActions(actions);
  }, []);

  const processOfflineQueue = useCallback(async () => {
    if (!isOnline || !user || isSyncing) return;

    const currentQueue = await getOfflineActions();
    if (currentQueue.length === 0) {
      setPendingActions([]);
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    let processedCount = 0;
    try {
      const token = await user.getIdToken();

      for (const item of currentQueue) {
        try {
          if (item.type === 'DRIVER_AVAILABILITY') {
            const res = await fetch('/api/driver/availability', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                availabilityStatus: item.availabilityStatus,
                clientActionId: item.clientActionId
              })
            });

            if (res.ok) {
              await removeOfflineAction(item.id);
              processedCount++;
            }
          } else if (item.orderId && item.type) {
            // Order action: ACCEPT, REJECT, START, DELIVER, FAIL
            const res = await fetch(`/api/driver/orders/${item.orderId}/action`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                action: item.type,
                type: item.type,
                reason: item.reason,
                paymentReport: item.paymentReport,
                clientActionId: item.clientActionId
              })
            });

            if (res.ok) {
              await removeOfflineAction(item.id);
              processedCount++;
            } else {
              const errJson = await res.json().catch(() => ({}));
              console.warn('[useDriverOfflineQueue] Error syncing item:', item.id, errJson.error);
              // Remove if already processed / conflict
              if (res.status === 400 || res.status === 404 || res.status === 409) {
                await removeOfflineAction(item.id);
              }
            }
          }
        } catch (itemErr) {
          console.error('[useDriverOfflineQueue] Failed item sync:', itemErr);
        }
      }
    } catch (err: any) {
      console.error('[useDriverOfflineQueue] Queue sync failed:', err);
      setSyncError('Não foi possível sincronizar todas as pendências.');
    } finally {
      setIsSyncing(false);
      await loadPendingActions();
      if (processedCount > 0 && onSyncCompleted) {
        onSyncCompleted();
      }
    }
  }, [isOnline, user, isSyncing, loadPendingActions, onSyncCompleted]);

  // Initial load
  useEffect(() => {
    loadPendingActions();
  }, [loadPendingActions]);

  // Auto trigger sync on becoming online
  useEffect(() => {
    if (isOnline && pendingActions.length > 0) {
      processOfflineQueue();
    }
  }, [isOnline, pendingActions.length, processOfflineQueue]);

  return {
    pendingActions,
    isSyncing,
    syncError,
    loadPendingActions,
    processOfflineQueue
  };
};
