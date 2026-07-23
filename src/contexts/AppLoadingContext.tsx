import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface AppLoadingContextType {
  isAppReady: boolean;
  setAppReady: (ready: boolean) => void;
  isVisible: boolean;
  setSplashVisible: (visible: boolean) => void;
  triggerSplash: () => void;
}

const AppLoadingContext = createContext<AppLoadingContextType | undefined>(undefined);

export const AppLoadingProvider = ({ children }: { children: ReactNode }) => {
  const [isAppReady, setIsAppReady] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const triggerSplash = useCallback(() => {
    setIsVisible(true);
    setTimeout(() => setIsVisible(false), 1500);
  }, []);

  return (
    <AppLoadingContext.Provider value={{ isAppReady, setAppReady: setIsAppReady, isVisible, setSplashVisible: setIsVisible, triggerSplash }}>
      {children}
    </AppLoadingContext.Provider>
  );
};

export const useAppLoading = () => {
  const context = useContext(AppLoadingContext);
  if (!context) {
    throw new Error('useAppLoading must be used within an AppLoadingProvider');
  }
  return context;
};
