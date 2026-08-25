import React, { useEffect } from 'react';
import { useAppLoading } from '../contexts/AppLoadingContext';
import { restaurantService } from '../services/restaurantService';

export default function AppInitializer({ children }: { children: React.ReactNode }) {
  const { setAppReady } = useAppLoading();

  useEffect(() => {
    // Libera a inicialização imediatamente para não bloquear Login, Admin, Restaurante ou Garçom
    setAppReady(true);

    // Pré-carregamento em background não-bloqueante
    Promise.allSettled([
      restaurantService.getApprovedRestaurants().catch(err => console.warn('Background getApprovedRestaurants error:', err)),
      restaurantService.getCategories().catch(err => console.warn('Background getCategories error:', err)),
      restaurantService.getBanners().catch(err => console.warn('Background getBanners error:', err))
    ]).catch(err => {
      console.warn('Background prefetch error:', err);
    });
  }, [setAppReady]);

  return <>{children}</>;
}
