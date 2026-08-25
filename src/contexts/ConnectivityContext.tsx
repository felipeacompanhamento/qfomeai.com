import React, { createContext, useContext, useState, useEffect } from 'react';

interface ConnectivityContextType {
  isOnline: boolean;
  isReconnecting: boolean;
  justReconnected: boolean;
  checkConnection: () => Promise<boolean>;
}

const ConnectivityContext = createContext<ConnectivityContextType>({
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isReconnecting: false,
  justReconnected: false,
  checkConnection: async () => true
});

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [justReconnected, setJustReconnected] = useState<boolean>(false);

  useEffect(() => {
    let reconnectedTimer: NodeJS.Timeout;

    const handleOnline = () => {
      setIsOnline(true);
      setIsReconnecting(false);
      setJustReconnected(true);

      if (reconnectedTimer) clearTimeout(reconnectedTimer);
      reconnectedTimer = setTimeout(() => {
        setJustReconnected(false);
      }, 4000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsReconnecting(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (reconnectedTimer) clearTimeout(reconnectedTimer);
    };
  }, []);

  const checkConnection = async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      return false;
    }
    try {
      // Lightweight check to verify server reachability
      const res = await fetch('/api/restaurant/tab/health', { method: 'HEAD', cache: 'no-store' });
      const online = res.ok;
      setIsOnline(online);
      return online;
    } catch {
      // If health endpoint fails, fallback to navigator.onLine or assume offline
      const online = typeof navigator !== 'undefined' ? navigator.onLine : false;
      setIsOnline(online);
      return online;
    }
  };

  return (
    <ConnectivityContext.Provider
      value={{
        isOnline,
        isReconnecting,
        justReconnected,
        checkConnection
      }}
    >
      {children}
    </ConnectivityContext.Provider>
  );
};

export const useConnectivity = () => useContext(ConnectivityContext);
