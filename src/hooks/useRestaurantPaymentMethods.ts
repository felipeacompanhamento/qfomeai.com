import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { restaurantService } from '../services/restaurantService';
import {
  getAvailablePaymentMethods,
  PaymentChannel,
  PaymentMethod,
  RestaurantPaymentMethod
} from '../services/paymentMethodsService';

export interface MethodOption {
  id: string;
  name: string;
}

export interface UseRestaurantPaymentMethodsReturn {
  loading: boolean;
  error: string | null;
  paymentMethods: PaymentMethod[];
  methodsOptions: MethodOption[];
  defaultMethodId: string | null;
  refetch: () => void;
}

export function useRestaurantPaymentMethods(
  restaurantIdProp?: string,
  initialConfiguredData?: any,
  channel: PaymentChannel = 'ORDERS'
): UseRestaurantPaymentMethodsReturn {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState<boolean>(() => {
    if (initialConfiguredData && (Array.isArray(initialConfiguredData) ? initialConfiguredData.length > 0 : Object.keys(initialConfiguredData).length > 0)) {
      return false;
    }
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [configuredData, setConfiguredData] = useState<any>(initialConfiguredData || null);
  const [tick, setTick] = useState<number>(0);

  // Sync initialConfiguredData if provided
  useEffect(() => {
    if (initialConfiguredData && Object.keys(initialConfiguredData).length > 0) {
      setConfiguredData(initialConfiguredData);
      setLoading(false);
      setError(null);
    }
  }, [initialConfiguredData]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let isCancelled = false;
    const startTime = Date.now();

    async function setupListener() {
      let targetId = restaurantIdProp || profile?.restaurantId;

      if (!targetId && user?.uid) {
        try {
          const rest = await restaurantService.getRestaurantByOwnerId(user.uid);
          if (rest?.id) {
            targetId = rest.id;
          }
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[useRestaurantPaymentMethods] Error finding restaurant by owner:', err);
          }
        }
      }

      if (isCancelled) return;

      if (!targetId) {
        if (!configuredData) {
          setLoading(false);
          setError('Restaurante não identificado.');
          if (process.env.NODE_ENV !== 'production') {
            console.log('[useRestaurantPaymentMethods] Empty/Error reason: Target restaurantId not identified.');
          }
        }
        return;
      }

      try {
        const docRef = doc(db, 'restaurants', targetId);
        unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            if (isCancelled) return;
            const loadDuration = Date.now() - startTime;

            if (snapshot.exists()) {
              const data = snapshot.data();
              const methodsConfig = data?.formas_pagamento || data?.payment_methods || null;
              setConfiguredData(methodsConfig);
              setError(null);

              if (process.env.NODE_ENV !== 'production') {
                const parsed = getAvailablePaymentMethods(methodsConfig, channel);
                const maskedTarget = targetId ? `${targetId.slice(0, 4)}***` : 'none';
                console.log(
                  `[useRestaurantPaymentMethods] Loaded ${parsed.length} payment methods for restaurant '${maskedTarget}' (channel: '${channel}') in ${loadDuration}ms`
                );
                if (parsed.length === 0) {
                  console.log(`[useRestaurantPaymentMethods] Reason for empty list: No active payment methods configured for channel '${channel}'`);
                }
              }
            } else {
              setConfiguredData(null);
              if (process.env.NODE_ENV !== 'production') {
                const maskedTarget = targetId ? `${targetId.slice(0, 4)}***` : 'none';
                console.log(`[useRestaurantPaymentMethods] Reason for empty list: Restaurant document '${maskedTarget}' does not exist.`);
              }
            }
            setLoading(false);
          },
          (err: any) => {
            if (isCancelled) return;
            console.error('[useRestaurantPaymentMethods] Snapshot error:', err);
            
            if (err?.code === 'permission-denied') {
              setError('Permissão negada ao consultar as formas de pagamento.');
            } else if (err?.code === 'unavailable') {
              setError('Conexão indisponível. Verifique sua rede e tente novamente.');
            } else {
              setError('Erro ao carregar formas de pagamento do servidor.');
            }
            setLoading(false);
          }
        );
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[useRestaurantPaymentMethods] Setup error:', err);
          setError('Falha ao inicializar consulta de formas de pagamento.');
          setLoading(false);
        }
      }
    }

    setupListener();

    return () => {
      isCancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [restaurantIdProp, profile?.restaurantId, user?.uid, tick, channel]);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    setTick(prev => prev + 1);
  }, []);

  const paymentMethods = useMemo(() => {
    if (!configuredData) return [];
    return getAvailablePaymentMethods(configuredData, channel);
  }, [configuredData, channel]);

  const methodsOptions = useMemo(() => {
    return paymentMethods.map(m => ({
      id: m.id,
      name: m.name
    }));
  }, [paymentMethods]);

  const defaultMethodId = useMemo(() => {
    if (paymentMethods.length === 0) return null;
    const explicitDefault = paymentMethods.find(m => m.isDefault);
    if (explicitDefault) return explicitDefault.id;
    return paymentMethods[0].id;
  }, [paymentMethods]);

  return {
    loading,
    error,
    paymentMethods,
    methodsOptions,
    defaultMethodId,
    refetch
  };
}
