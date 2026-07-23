import { calculateHaversineDistance } from '../utils/geo';

export interface LocationPayload {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: string;
  activeOrderIds: string[];
  clientActionId: string;
}

class DriverLocationService {
  private watchId: number | null = null;
  private lastSentLocation: { lat: number; lng: number; time: number } | null = null;
  private wakeLock: any = null;
  private isTrackingActive: boolean = false;
  private activeOrderIdsGetter: (() => string[]) | null = null;
  private idTokenGetter: (() => Promise<string | null>) | null = null;
  private onStatusChangeCallbacks: Set<(status: string) => void> = new Set();

  public subscribeStatus(callback: (status: string) => void) {
    this.onStatusChangeCallbacks.add(callback);
    return () => this.onStatusChangeCallbacks.delete(callback);
  }

  private notifyStatus(status: string) {
    this.onStatusChangeCallbacks.forEach(cb => cb(status));
  }

  public async startTracking(
    getActiveOrderIds: () => string[],
    getIdToken: () => Promise<string | null>
  ) {
    if (this.isTrackingActive) return;

    this.activeOrderIdsGetter = getActiveOrderIds;
    this.idTokenGetter = getIdToken;
    this.isTrackingActive = true;

    this.notifyStatus('Iniciando GPS...');
    await this.requestWakeLock();

    if (!('geolocation' in navigator)) {
      this.notifyStatus('GPS indisponível no navegador');
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePositionUpdate(position),
      (error) => {
        console.warn('Geolocation watch error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          this.notifyStatus('Permissão de GPS negada');
        } else {
          this.notifyStatus('Sinal de GPS fraco ou indisponível');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    );

    // Re-acquire wake lock on visibility change
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  public async stopTracking() {
    this.isTrackingActive = false;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.releaseWakeLock();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.notifyStatus('GPS desligado');
  }

  private handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible' && this.isTrackingActive) {
      await this.requestWakeLock();
    }
  };

  private async requestWakeLock() {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Wake Lock error or unsupported:', err);
    }
  }

  private releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  private async handlePositionUpdate(position: GeolocationPosition) {
    const { latitude, longitude, accuracy, heading, speed } = position.coords;

    // Ignore very inaccurate readings unless no reading exists
    if (accuracy > 150 && this.lastSentLocation !== null) {
      this.notifyStatus('Sinal de GPS impreciso');
      return;
    }

    const now = Date.now();
    let shouldSend = false;

    if (!this.lastSentLocation) {
      shouldSend = true;
    } else {
      const distInKm = calculateHaversineDistance(
        this.lastSentLocation.lat,
        this.lastSentLocation.lng,
        latitude,
        longitude
      );
      const distInMeters = distInKm * 1000;
      const timeDiffSec = (now - this.lastSentLocation.time) / 1000;

      // Conditions: moved >= 30 meters OR 20s passed OR 60s heartbeat
      if (distInMeters >= 30 || timeDiffSec >= 20) {
        shouldSend = true;
      }
    }

    if (!shouldSend) return;

    this.lastSentLocation = { lat: latitude, lng: longitude, time: now };
    this.notifyStatus('GPS ativo e sincronizado');

    const activeOrderIds = this.activeOrderIdsGetter ? this.activeOrderIdsGetter() : [];
    const clientActionId = `loc_${now}_${Math.random().toString(36).substr(2, 6)}`;

    const payload: LocationPayload = {
      latitude,
      longitude,
      accuracy,
      heading: heading || null,
      speed: speed || null,
      timestamp: new Date().toISOString(),
      activeOrderIds,
      clientActionId
    };

    try {
      const token = this.idTokenGetter ? await this.idTokenGetter() : null;
      if (!token) return;

      await fetch('/api/driver/location', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('Failed to send location payload:', err);
    }
  }
}

export const driverLocationService = new DriverLocationService();
