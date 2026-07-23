import React, { useEffect } from 'react';
import { useAppLoading } from '../contexts/AppLoadingContext';
import { restaurantService } from '../services/restaurantService';
import SplashScreen from './SplashScreen';

export default function AppInitializer({ children }: { children: React.ReactNode }) {
  const { isAppReady, setAppReady, triggerSplash } = useAppLoading();

  useEffect(() => {
    async function initializeApp() {
      try {
        // Fetch essential data in parallel
        await Promise.all([
          restaurantService.getApprovedRestaurants(),
          restaurantService.getCategories(),
          restaurantService.getBanners()
        ]);
        
        setAppReady(true);
        setTimeout(() => triggerSplash(), 100);
      } catch (error) {
        console.error('Error initializing app:', error);
        setAppReady(true);
        triggerSplash();
      }
    }

    initializeApp();
  }, [setAppReady, triggerSplash]);

  return <>{children}</>;
}
