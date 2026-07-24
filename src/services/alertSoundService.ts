/**
 * Service central para alertas sonoros e táteis (vibração) intermitentes
 * Utilizado para notificar entregadores sobre novas atribuições de pedidos
 */

export interface DriverAlertSettings {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

class AlertSoundService {
  private activeAlerts: Map<string, { intervalId: any; audioNode?: HTMLAudioElement }> = new Map();
  private audioContext: AudioContext | null = null;
  private isAudioUnlocked = false;
  private isAudioBlocked = false;
  private unlockListenersAttached = false;
  private statusSubscribers: Set<(blocked: boolean) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.attachUnlockListeners();
    }
  }

  /**
   * Obtém as configurações do entregador do localStorage
   */
  public getDriverSettings(driverId: string): DriverAlertSettings {
    if (typeof window === 'undefined') return { soundEnabled: true, vibrationEnabled: true };
    try {
      const stored = localStorage.getItem(`@qfomeai:driver_alerts_${driverId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Erro ao ler configurações de alerta do entregador:', e);
    }
    return { soundEnabled: true, vibrationEnabled: true };
  }

  /**
   * Salva as configurações do entregador no localStorage
   */
  public saveDriverSettings(driverId: string, settings: DriverAlertSettings): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`@qfomeai:driver_alerts_${driverId}`, JSON.stringify(settings));
    } catch (e) {
      console.warn('Erro ao salvar configurações de alerta do entregador:', e);
    }
  }

  /**
   * Inscreve um callback para ser notificado quando o áudio estiver bloqueado pelo navegador
   */
  public subscribeBlockedStatus(callback: (blocked: boolean) => void): () => void {
    this.statusSubscribers.add(callback);
    callback(this.isAudioBlocked);
    return () => {
      this.statusSubscribers.delete(callback);
    };
  }

  private notifyBlockedSubscribers(blocked: boolean) {
    this.isAudioBlocked = blocked;
    this.statusSubscribers.forEach((cb) => cb(blocked));
  }

  /**
   * Anexa ouvintes para desbloquear o AudioContext na primeira interação do usuário
   */
  public attachUnlockListeners() {
    if (this.unlockListenersAttached || typeof window === 'undefined') return;
    this.unlockListenersAttached = true;

    const handleUnlock = () => {
      this.unlockAudio().then((success) => {
        if (success) {
          window.removeEventListener('pointerdown', handleUnlock);
          window.removeEventListener('touchstart', handleUnlock);
          window.removeEventListener('click', handleUnlock);
          this.unlockListenersAttached = false;
        }
      });
    };

    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('touchstart', handleUnlock, { passive: true });
    window.addEventListener('click', handleUnlock, { passive: true });
  }

  /**
   * Tenta desbloquear o AudioContext
   */
  public async unlockAudio(): Promise<boolean> {
    try {
      if (!this.audioContext) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          this.audioContext = new AudioCtxClass();
        }
      }

      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Tenta reproduzir uma nota inaudível para confirmar autorização
      if (this.audioContext) {
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        gain.gain.setValueAtTime(0.0001, this.audioContext.currentTime);
        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start();
        osc.stop(this.audioContext.currentTime + 0.01);
      }

      this.isAudioUnlocked = true;
      this.notifyBlockedSubscribers(false);
      return true;
    } catch (e) {
      console.warn('Falha ao desbloquear áudio automaticamente:', e);
      this.notifyBlockedSubscribers(true);
      return false;
    }
  }

  /**
   * Reproduz um toque sonoro de alerta sintetizado com synth duplo
   */
  public playChimeTone(): boolean {
    try {
      if (!this.audioContext) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          this.audioContext = new AudioCtxClass();
        }
      }

      if (!this.audioContext) return false;

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {
          this.notifyBlockedSubscribers(true);
        });
      }

      const ctx = this.audioContext;
      const now = ctx.currentTime;

      const playNote = (freq: number, duration: number, startTime: number, volume = 0.3) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      // Padrão melódico leve e chamativo ("Trim-Trim!")
      playNote(880, 0.18, now, 0.35);         // A5
      playNote(1174.66, 0.22, now + 0.12, 0.4); // D6
      playNote(1318.51, 0.35, now + 0.28, 0.4); // E6

      this.notifyBlockedSubscribers(false);
      return true;
    } catch (err) {
      console.warn('Erro ao tocar alerta sintetizado:', err);
      this.notifyBlockedSubscribers(true);
      return false;
    }
  }

  /**
   * Executa vibração tátil moderada [300ms som, 200ms pausa, 300ms som]
   */
  public triggerVibration() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([300, 200, 300]);
      } catch (e) {
        // Ignora em navegadores sem suporte
      }
    }
  }

  /**
   * Inicia um alerta intermitente para uma chave específica (ex: "driver-assignment:ORDER_ID")
   */
  public startIntermittentAlert(
    key: string,
    options: { vibration?: boolean; intervalMs?: number } = {}
  ) {
    if (this.activeAlerts.has(key)) {
      return; // Já está tocando para esta chave
    }

    const intervalMs = options.intervalMs || 3000;

    // Toca imediatamente na primeira vez
    this.playChimeTone();
    if (options.vibration !== false) {
      this.triggerVibration();
    }

    // Configura o ciclo intermitente
    const intervalId = setInterval(() => {
      this.playChimeTone();
      if (options.vibration !== false) {
        this.triggerVibration();
      }
    }, intervalMs);

    this.activeAlerts.set(key, { intervalId });
  }

  /**
   * Para o alerta intermitente de uma chave específica
   */
  public stopIntermittentAlert(key: string) {
    const alert = this.activeAlerts.get(key);
    if (alert) {
      if (alert.intervalId) {
        clearInterval(alert.intervalId);
      }
      if (alert.audioNode) {
        try {
          alert.audioNode.pause();
          alert.audioNode.currentTime = 0;
        } catch (e) {}
      }
      this.activeAlerts.delete(key);
    }
  }

  /**
   * Para todos os alertas intermitentes ativos
   */
  public stopAllAlerts() {
    this.activeAlerts.forEach((alert) => {
      if (alert.intervalId) {
        clearInterval(alert.intervalId);
      }
      if (alert.audioNode) {
        try {
          alert.audioNode.pause();
          alert.audioNode.currentTime = 0;
        } catch (e) {}
      }
    });
    this.activeAlerts.clear();
  }

  /**
   * Verifica se o alerta está ativo para determinada chave
   */
  public isAlertActive(key: string): boolean {
    return this.activeAlerts.has(key);
  }

  /**
   * Toca um teste curto de alerta (1 único ciclo) para validar o som nas configurações
   */
  public playTestAlert() {
    this.unlockAudio();
    this.playChimeTone();
    this.triggerVibration();
  }
}

export const alertSoundService = new AlertSoundService();
