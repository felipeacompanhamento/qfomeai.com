import React from 'react';
import { Power, Wifi, WifiOff, MapPin, RefreshCw, AlertCircle } from 'lucide-react';
import { GpsState } from '../types';

interface DriverHeaderProps {
  driverName?: string;
  availabilityStatus: 'ONLINE' | 'OFFLINE';
  toggleAvailability: () => void;
  toggleLoading: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  gpsState: GpsState;
  gpsError: string | null;
  onSyncClick: () => void;
}

export const DriverHeader: React.FC<DriverHeaderProps> = ({
  driverName = 'Entregador',
  availabilityStatus,
  toggleAvailability,
  toggleLoading,
  isOnline,
  isSyncing,
  pendingCount,
  gpsState,
  gpsError,
  onSyncClick
}) => {
  const isDriverOnline = availabilityStatus === 'ONLINE';

  const getGpsBadge = () => {
    switch (gpsState) {
      case 'ACTIVE':
        return { label: 'GPS Ativo', bg: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
      case 'REQUESTING_PERMISSION':
        return { label: 'GPS Solicitando', bg: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };
      case 'PAUSED':
        return { label: 'GPS Pausado', bg: 'bg-stone-500/10 text-stone-500 border-stone-500/20' };
      case 'DENIED':
        return { label: 'GPS Negado', bg: 'bg-red-500/10 text-red-600 border-red-500/20' };
      case 'UNAVAILABLE':
      case 'ERROR':
        return { label: 'GPS Erro', bg: 'bg-red-500/10 text-red-600 border-red-500/20' };
      default:
        return { label: 'GPS Indisponível', bg: 'bg-stone-500/10 text-stone-500 border-stone-500/20' };
    }
  };

  const gpsBadge = getGpsBadge();

  return (
    <header className="bg-stone-900 text-white px-4 py-3 shrink-0 shadow-md">
      <div className="flex items-center justify-between gap-2">
        {/* Driver greeting & status pills */}
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium">
            Entregador Qfomeai
          </span>
          <h1 className="text-base font-bold text-white truncate max-w-[170px] sm:max-w-[220px]">
            {driverName}
          </h1>

          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* Connection status */}
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                !isOnline
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : isSyncing
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {!isOnline ? (
                <>
                  <WifiOff className="w-2.5 h-2.5" /> Offline
                </>
              ) : isSyncing ? (
                <>
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Sincronizando
                </>
              ) : (
                <>
                  <Wifi className="w-2.5 h-2.5" /> Online
                </>
              )}
            </span>

            {/* GPS status */}
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${gpsBadge.bg}`}
              title={gpsError || ''}
            >
              <MapPin className="w-2.5 h-2.5" />
              {gpsBadge.label}
            </span>

            {/* Pending actions counter button */}
            {pendingCount > 0 && (
              <button
                type="button"
                onClick={onSyncClick}
                disabled={isSyncing || !isOnline}
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-stone-950 border border-amber-400 active:scale-95 transition-all"
              >
                <AlertCircle className="w-2.5 h-2.5" />
                {pendingCount} {pendingCount === 1 ? 'pendência' : 'pendências'}
              </button>
            )}
          </div>
        </div>

        {/* Online / Offline switch */}
        <button
          type="button"
          onClick={toggleAvailability}
          disabled={toggleLoading}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-xs ${
            isDriverOnline
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700'
          }`}
        >
          {toggleLoading ? (
            <RefreshCw className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Power className={`w-4 h-4 ${isDriverOnline ? 'text-white' : 'text-stone-400'}`} />
          )}
          <span>{isDriverOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </button>
      </div>
    </header>
  );
};
