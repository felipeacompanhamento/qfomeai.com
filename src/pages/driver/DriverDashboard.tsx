import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { DriverInfo, DriverTab } from './types';
import { useDriverLocation } from './hooks/useDriverLocation';
import { useDriverAvailability } from './hooks/useDriverAvailability';
import { useDriverOfflineQueue } from './hooks/useDriverOfflineQueue';
import { useDriverOrders, getOrderDeliveryStatus } from './hooks/useDriverOrders';

import { DriverHeader } from './components/DriverHeader';
import { DriverBottomNavigation } from './components/DriverBottomNavigation';
import { DriverOfflineBanner } from './components/DriverOfflineBanner';
import { DriverNewOrders } from './components/DriverNewOrders';
import { DriverRouteTab } from './components/DriverRouteTab';
import { DriverHistoryTab } from './components/DriverHistoryTab';
import { DriverAccountTab } from './components/DriverAccountTab';

const generateUUID = (): string => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + '-' + Date.now().toString(36);
};

export default function DriverDashboard() {
  const { user, profile, isDriver, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Network State
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Driver Document State
  const [driverDoc, setDriverDoc] = useState<DriverInfo | null>(null);

  // Active Tab State
  const [activeTab, setActiveTab] = useState<DriverTab>('novas');

  // Authorization checks
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    if (!isDriver) {
      navigate('/');
    }
  }, [user, isDriver, authLoading, navigate]);

  const restaurantId = profile?.restaurantId || driverDoc?.restaurantId || null;

  // Real-time Firestore subscription for Driver Doc
  useEffect(() => {
    if (!user || !restaurantId) return;

    const driverRef = doc(db, 'restaurants', restaurantId, 'drivers', user.uid);
    const unsub = onSnapshot(
      driverRef,
      (snap) => {
        if (snap.exists()) {
          setDriverDoc(snap.data() as DriverInfo);
        } else {
          setDriverDoc({
            id: user.uid,
            restaurantId,
            userId: user.uid,
            name: profile?.nome || user.displayName || 'Entregador',
            phone: profile?.telefone || '',
            email: user.email || '',
            availabilityStatus: 'OFFLINE'
          });
        }
      },
      (err) => {
        console.warn('[DriverDashboard] Driver doc listener fallback:', err);
      }
    );

    return () => unsub();
  }, [user, restaurantId, profile?.nome, profile?.telefone]);

  // Hook 1: Availability (Online / Offline status)
  const {
    toggleAvailability,
    toggleLoading,
    availabilityError,
    availabilitySuccess
  } = useDriverAvailability({
    user,
    driverDoc,
    setDriverDoc,
    isOnline,
    generateUUID
  });

  const isDriverOnline = driverDoc?.availabilityStatus === 'ONLINE';

  // Hook 2: GPS Location Tracking
  const {
    gpsState,
    currentLocation,
    errorMessage: gpsErrorMessage,
    stopGps
  } = useDriverLocation({
    isOnline,
    isDriverOnline,
    userToken: null,
    restaurantId
  });

  // Hook 3: Offline Queue & Sync
  const {
    pendingActions,
    isSyncing,
    syncError,
    processOfflineQueue
  } = useDriverOfflineQueue({
    user,
    isOnline
  });

  // Hook 4: Driver Orders Engine
  const {
    newOrders,
    routeOrders,
    historicalOrders,
    actionLoadingId,
    actionError,
    actionSuccess,
    handleMoveOrder,
    executeOrderAction
  } = useDriverOrders({
    user,
    restaurantId,
    isOnline,
    generateUUID
  });

  // Today stats calculations
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const todayDeliveriesCount = useMemo(() => {
    return historicalOrders.filter(o => {
      const isDelivered = getOrderDeliveryStatus(o) === 'DELIVERED';
      if (!isDelivered) return false;
      const createdDate = o.data_criacao || o.createdAt || '';
      return createdDate.startsWith(todayStr);
    }).length;
  }, [historicalOrders, todayStr]);

  const pendingSettlementAmount = useMemo(() => {
    return historicalOrders.reduce((sum, o) => {
      const isDelivered = getOrderDeliveryStatus(o) === 'DELIVERED';
      const isAwaitingSettlement =
        o.paymentStatus === 'AWAITING_DRIVER_SETTLEMENT' ||
        (o.paymentCollectedByDriver && !o.pago);
      if (isDelivered && isAwaitingSettlement) {
        return sum + Number(o.total || o.valor_total || 0);
      }
      return sum;
    }, 0);
  }, [historicalOrders]);

  // Logout Handler
  const handleLogout = useCallback(async () => {
    stopGps();
    await signOut(auth);
    navigate('/login');
  }, [stopGps, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center text-white p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-stone-300">Carregando painel do entregador...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-stone-100 overflow-hidden select-none font-sans">
      {/* Compact Header */}
      <DriverHeader
        driverName={driverDoc?.name || profile?.nome || user?.displayName || 'Entregador'}
        availabilityStatus={driverDoc?.availabilityStatus || 'OFFLINE'}
        toggleAvailability={toggleAvailability}
        toggleLoading={toggleLoading}
        isOnline={isOnline}
        isSyncing={isSyncing}
        pendingCount={pendingActions.length}
        gpsState={gpsState}
        gpsError={gpsErrorMessage}
        onSyncClick={processOfflineQueue}
      />

      {/* Offline Status / Pending Sync Banner */}
      <DriverOfflineBanner
        isOnline={isOnline}
        pendingCount={pendingActions.length}
        isSyncing={isSyncing}
        syncError={syncError}
        onSyncClick={processOfflineQueue}
      />

      {/* Feedback Messages */}
      {(availabilityError || actionError) && (
        <div className="bg-red-600 text-white px-4 py-2 text-xs font-semibold text-center shrink-0">
          {availabilityError || actionError}
        </div>
      )}

      {(availabilitySuccess || actionSuccess) && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-semibold text-center shrink-0">
          {availabilitySuccess || actionSuccess}
        </div>
      )}

      {/* Main Scrollable View Area */}
      <main className="flex-1 overflow-y-auto px-4 pt-3 pb-[calc(88px+env(safe-area-inset-bottom))] max-w-lg mx-auto w-full">
        {activeTab === 'novas' && (
          <DriverNewOrders
            orders={newOrders}
            currentLocation={currentLocation}
            isLoadingId={actionLoadingId}
            onAccept={(order) => executeOrderAction(order, 'ACCEPT')}
            onReject={(order) => executeOrderAction(order, 'REJECT')}
          />
        )}

        {activeTab === 'rota' && (
          <DriverRouteTab
            orders={routeOrders}
            currentLocation={currentLocation}
            isLoadingId={actionLoadingId}
            onMoveUp={(idx) => handleMoveOrder(idx, idx - 1)}
            onMoveDown={(idx) => handleMoveOrder(idx, idx + 1)}
            onStartDelivery={(order) => executeOrderAction(order, 'START')}
            onCompleteDelivery={(order) => executeOrderAction(order, 'DELIVER')}
            onFailDelivery={(order, reason) => executeOrderAction(order, 'FAIL', reason)}
          />
        )}

        {activeTab === 'historico' && (
          <DriverHistoryTab
            historicalOrders={historicalOrders}
            currentLocation={currentLocation}
            todayDeliveriesCount={todayDeliveriesCount}
            pendingSettlementAmount={pendingSettlementAmount}
          />
        )}

        {activeTab === 'conta' && (
          <DriverAccountTab
            driverDoc={driverDoc}
            userEmail={user?.email}
            pendingActions={pendingActions}
            isSyncing={isSyncing}
            isOnline={isOnline}
            onSyncNow={processOfflineQueue}
            onLogout={handleLogout}
          />
        )}
      </main>

      {/* Fixed Bottom App Navigation Bar */}
      <DriverBottomNavigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        newOrdersCount={newOrders.length}
        routeOrdersCount={routeOrders.length}
      />
    </div>
  );
}
