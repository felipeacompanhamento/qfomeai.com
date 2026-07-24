import { useState, useEffect, useRef, useCallback } from 'react';
import { GpsState, LatLng } from '../types';

interface UseDriverLocationOptions {
  isOnline: boolean;
  isDriverOnline: boolean;
  userToken?: string | null;
  restaurantId?: string | null;
}

export const useDriverLocation = ({
  isOnline,
  isDriverOnline,
  userToken
}: UseDriverLocationOptions) => {
  const [gpsState, setGpsState] = useState<GpsState>('UNKNOWN');
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  const stopGps = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const sendLocationToServer = useCallback(async (location: LatLng) => {
    if (!isOnline || !isDriverOnline || !userToken) return;

    const now = Date.now();
    const last = lastSentRef.current;

    // Throttle: only send if moved > 10 meters or > 30 seconds elapsed
    if (last) {
      const timeDiff = (now - last.time) / 1000;
      const latDiff = Math.abs(location.latitude - last.lat);
      const lngDiff = Math.abs(location.longitude - last.lng);
      // rough approximation: 0.0001 deg is ~ 11 meters
      const moved = latDiff > 0.0001 || lngDiff > 0.0001;

      if (!moved && timeDiff < 30) {
        return;
      }
    }

    try {
      lastSentRef.current = { lat: location.latitude, lng: location.longitude, time: now };
      await fetch('/api/driver/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          updatedAt: new Date().toISOString()
        })
      });
    } catch (err) {
      console.warn('[useDriverLocation] Error sending location to backend:', err);
    }
  }, [isOnline, isDriverOnline, userToken]);

  const startGps = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsState('UNAVAILABLE');
      setErrorMessage('Geolocalização não é suportada por este dispositivo.');
      return;
    }

    stopGps();
    setGpsState('REQUESTING_PERMISSION');
    setErrorMessage(null);

    const handleSuccess = (position: GeolocationPosition) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const loc: LatLng = { latitude: lat, longitude: lng };
        setCurrentLocation(loc);
        setGpsState('ACTIVE');
        setErrorMessage(null);
        sendLocationToServer(loc);
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      stopGps();
      switch (error.code) {
        case error.PERMISSION_DENIED:
          setGpsState('DENIED');
          setErrorMessage('Permita a localização nas configurações do navegador.');
          break;
        case error.POSITION_UNAVAILABLE:
          setGpsState('UNAVAILABLE');
          setErrorMessage('Não foi possível localizar o aparelho. Verifique se o GPS está ligado.');
          break;
        case error.TIMEOUT:
          setGpsState('ERROR');
          setErrorMessage('O GPS demorou para responder. Tente novamente.');
          break;
        default:
          setGpsState('ERROR');
          setErrorMessage('Erro ao obter sinal do GPS.');
          break;
      }
    };

    try {
      const id = navigator.geolocation.watchPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        maximumAge: 15000,
        timeout: 20000
      });
      watchIdRef.current = id;
    } catch (err: any) {
      setGpsState('ERROR');
      setErrorMessage(err.message || 'Erro ao ativar geolocalização');
    }
  }, [stopGps, sendLocationToServer]);

  // Effect to manage GPS watching based on Driver Online availability
  useEffect(() => {
    if (isDriverOnline) {
      startGps();
    } else {
      stopGps();
      setGpsState('PAUSED');
      setErrorMessage('GPS pausado enquanto estiver Offline.');
    }

    return () => {
      stopGps();
    };
  }, [isDriverOnline, startGps, stopGps]);

  return {
    gpsState,
    currentLocation,
    errorMessage,
    startGps,
    stopGps
  };
};
