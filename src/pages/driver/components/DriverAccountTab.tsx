import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, LogOut, Info, RefreshCw, Smartphone, AlertCircle, CheckCircle2, Volume2, VolumeX, SmartphoneCharging, BellRing } from 'lucide-react';
import { DriverInfo, OfflineActionItem } from '../types';
import { alertSoundService } from '../../../services/alertSoundService';

interface DriverAccountTabProps {
  driverDoc: DriverInfo | null;
  userEmail?: string | null;
  pendingActions: OfflineActionItem[];
  isSyncing: boolean;
  isOnline: boolean;
  onSyncNow: () => void;
  onLogout: () => void;
}

export const DriverAccountTab: React.FC<DriverAccountTabProps> = ({
  driverDoc,
  userEmail,
  pendingActions,
  isSyncing,
  isOnline,
  onSyncNow,
  onLogout
}) => {
  const name = driverDoc?.name || driverDoc?.nome || 'Entregador';
  const phone = driverDoc?.phone || driverDoc?.telefone || 'Não informado';
  const email = userEmail || driverDoc?.email || 'Não informado';
  const driverId = driverDoc?.id || 'default_driver';

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  useEffect(() => {
    const settings = alertSoundService.getDriverSettings(driverId);
    setSoundEnabled(settings.soundEnabled);
    setVibrationEnabled(settings.vibrationEnabled);
  }, [driverId]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    alertSoundService.saveDriverSettings(driverId, {
      soundEnabled: next,
      vibrationEnabled
    });
  };

  const handleToggleVibration = () => {
    const next = !vibrationEnabled;
    setVibrationEnabled(next);
    alertSoundService.saveDriverSettings(driverId, {
      soundEnabled,
      vibrationEnabled: next
    });
  };

  const handleTestAlert = () => {
    alertSoundService.playTestAlert();
  };

  return (
    <div className="space-y-4">
      {/* Profile Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-stone-900 text-white font-black text-lg flex items-center justify-center">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900">{name}</h2>
            <span className="text-xs text-stone-500 font-medium">Entregador do restaurante</span>
          </div>
        </div>

        <div className="space-y-2 pt-3 border-t border-stone-100 text-xs">
          <div className="flex items-center gap-2 text-stone-700">
            <Phone className="w-4 h-4 text-stone-400" />
            <span>{phone}</span>
          </div>
          <div className="flex items-center gap-2 text-stone-700">
            <Mail className="w-4 h-4 text-stone-400" />
            <span>{email}</span>
          </div>
        </div>
      </div>

      {/* Alert Sound & Vibration Settings Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Alertas de Novas Entregas
            </h3>
          </div>
        </div>

        <div className="space-y-3 divide-y divide-stone-100">
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 text-xs font-medium text-stone-800">
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-600" /> : <VolumeX className="w-4 h-4 text-stone-400" />}
              <span>Som de Alerta</span>
            </div>
            <button
              type="button"
              onClick={handleToggleSound}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                soundEnabled ? 'bg-emerald-500 justify-end' : 'bg-stone-300 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </button>
          </div>

          <div className="flex items-center justify-between pt-3">
            <div className="flex items-center gap-2 text-xs font-medium text-stone-800">
              <SmartphoneCharging className="w-4 h-4 text-emerald-600" />
              <span>Vibração Tátil</span>
            </div>
            <button
              type="button"
              onClick={handleToggleVibration}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${
                vibrationEnabled ? 'bg-emerald-500 justify-end' : 'bg-stone-300 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-xs" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTestAlert}
          className="w-full min-h-[42px] py-2 px-3 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
        >
          <BellRing className="w-4 h-4 text-stone-600" />
          <span>Testar Som de Alerta</span>
        </button>
      </div>

      {/* Offline Pending Actions Card */}
      <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : 'text-stone-500'}`} />
            <h3 className="text-xs font-bold text-stone-900 uppercase tracking-wider">
              Sincronização Offline
            </h3>
          </div>
          {pendingActions.length > 0 ? (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-300">
              {pendingActions.length} pendentes
            </span>
          ) : (
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Atualizado
            </span>
          )}
        </div>

        <p className="text-xs text-stone-600 leading-relaxed">
          As ações realizadas sem internet ficam salvas no seu aparelho e são enviadas automaticamente ao reconectar.
        </p>

        {pendingActions.length > 0 && (
          <button
            type="button"
            onClick={onSyncNow}
            disabled={isSyncing || !isOnline}
            className="w-full min-h-[44px] py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-stone-950 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Agora'}</span>
          </button>
        )}
      </div>

      {/* PWA Background Location Note (Requirement #9) */}
      <div className="bg-stone-50 rounded-2xl border border-stone-200 p-4 text-xs text-stone-600 flex items-start gap-3">
        <Smartphone className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-stone-800">Dica para rastreamento de entrega</p>
          <p className="leading-relaxed">
            Para compartilhar sua localização em tempo real durante a entrega, mantenha o aplicativo aberto ou em primeiro plano no seu navegador/celular.
          </p>
        </div>
      </div>

      {/* Logout Button */}
      <button
        type="button"
        onClick={onLogout}
        className="w-full min-h-[48px] py-3 px-4 rounded-2xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4 text-red-600" />
        <span>Sair da Conta</span>
      </button>
    </div>
  );
};
