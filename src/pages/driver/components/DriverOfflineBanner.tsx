import React from 'react';
import { WifiOff, RefreshCw, AlertCircle } from 'lucide-react';

interface DriverOfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  syncError: string | null;
  onSyncClick: () => void;
}

export const DriverOfflineBanner: React.FC<DriverOfflineBannerProps> = ({
  isOnline,
  pendingCount,
  isSyncing,
  syncError,
  onSyncClick
}) => {
  if (isOnline && pendingCount === 0 && !syncError) {
    return null;
  }

  return (
    <div className="shrink-0">
      {!isOnline && (
        <div className="bg-stone-900 text-amber-400 px-4 py-2 text-xs font-semibold flex items-center justify-between border-b border-stone-800">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Sem conexão com a internet. Trabalhando no modo offline.</span>
          </div>
        </div>
      )}

      {isOnline && pendingCount > 0 && (
        <div className="bg-amber-500 text-stone-950 px-4 py-2 text-xs font-bold flex items-center justify-between border-b border-amber-600 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{pendingCount} {pendingCount === 1 ? 'ação pendente para sincronizar' : 'ações pendentes para sincronizar'}</span>
          </div>
          <button
            type="button"
            onClick={onSyncClick}
            disabled={isSyncing}
            className="px-2.5 py-1 bg-stone-950 text-white rounded-lg text-[10px] uppercase font-black hover:bg-stone-900 active:scale-95 transition-all flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando' : 'Sincronizar'}
          </button>
        </div>
      )}

      {syncError && (
        <div className="bg-red-600 text-white px-4 py-2 text-xs font-semibold flex items-center justify-between border-b border-red-700">
          <span>{syncError}</span>
        </div>
      )}
    </div>
  );
};
