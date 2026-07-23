import { getToken, onMessage, isSupported, getMessaging } from 'firebase/messaging';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, messaging as messagingFromFirebase } from './firebase';

// VAPID KEY - Should be set in .env
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Request notification permission and get FCM token
 */
export const requestNotificationPermissionAndRegister = async (userId: string) => {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('Firebase Messaging is not supported in this browser.');
      return false;
    }

    if (!('Notification' in window)) return false;

    // Must be called directly on user interaction
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await registerPushNotifications(userId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

export const registerPushNotifications = async (userId: string) => {
  try {
    const supported = await isSupported();
    if (!supported) return;

    const messaging = getMessaging();

    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      if (!VAPID_KEY) {
        console.warn('VITE_FIREBASE_VAPID_KEY is not set.');
        return;
      }

      console.log('Registrando Service Worker na raiz...');
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
      
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (token) {
        console.log('FCM Token generated:', token);
        
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, {
          fcmToken: token,
          fcmTokenUpdatedAt: serverTimestamp()
        }, { merge: true });

        try {
          const userDoc = await getDoc(userRef);
          if (userDoc.exists() && userDoc.data()?.role === 'restaurant') {
            const restRef = doc(db, 'restaurants', userId);
            await setDoc(restRef, {
              fcmToken: token,
              fcmTokenUpdatedAt: serverTimestamp()
            }, { merge: true });
          }
        } catch (e) {
          console.error('Error saving token to restaurants collection:', e);
        }
        
        return token;
      }
    }
  } catch (error) {
    console.error('An error occurred while retrieving token:', error);
  }
};

/**
 * Listen for foreground messages
 */
let foregroundUnsubscribe: (() => void) | null = null;

export const setupForegroundNotificationListener = async () => {
  try {
    const supported = await isSupported();
    if (!supported) return () => {};

    const messaging = getMessaging();
    
    // Se já houver um listener ativo, desinscreve o anterior antes de criar um novo
    if (foregroundUnsubscribe) {
      console.log('Desinscrevendo listener de notificações anterior...');
      foregroundUnsubscribe();
      foregroundUnsubscribe = null;
    }

    console.log('Configurando listener de notificações em primeiro plano...');
    
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('DEBUG: Notificação recebida em foreground:', payload);

      // Mostrar notificação manualmente
      if (Notification.permission === 'granted') {
        console.log('DEBUG: Exibindo notificação visual');
        const notification = new Notification(payload.notification?.title || 'Nova notificação', {
          body: payload.notification?.body || '',
          icon: '/logo.png',
          badge: '/logo.png',
          tag: payload.data?.orderId || 'general-notification', // Evita duplicatas com a mesma tag
          renotify: true
        } as any);

        notification.onclick = function(event) {
          event.preventDefault();
          const url = payload.data?.url || (payload.data?.type === 'status_update' ? '/orders' : '/');
          window.location.href = url;
          notification.close();
        };
      }

      // Tocar som de notificação dependendo do tipo
      if (payload.data?.type === 'status_update') {
        playChefBell();
      } else {
        playNotificationSound();
      }

      // Atualizar página de pedidos automaticamente
      if (payload.data?.type === 'new_order') {
        console.log('DEBUG: Novo pedido recebido, disparando evento new-order-received...');
        window.dispatchEvent(new CustomEvent('new-order-received'));
      } else {
        console.log('DEBUG: Notificação recebida, mas não é um novo pedido:', payload.data?.type);
      }
    });

    foregroundUnsubscribe = unsubscribe;
    return unsubscribe;
  } catch (error) {
    console.warn('Error setting up foreground listener:', error);
    return () => {};
  }
};

/**
 * Listen for foreground messages (Legacy - consider replacing with setupForegroundNotificationListener)
 */
export const onMessageListener = async (callback: (payload: any) => void) => {
  try {
    const supported = await isSupported();
    if (!supported) return () => {};

    const messaging = getMessaging();

    return onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      
      // Exibir notificação visual no foreground
      if (Notification.permission === 'granted') {
        console.log('Showing foreground notification');
        const title = payload.notification?.title || 'Qfomeai';
        const options = {
          body: payload.notification?.body || 'Você tem uma nova atualização.',
          icon: '/logo.png', // Usando ícone padrão conforme solicitado
          badge: '/logo.png',
          data: payload.data
        };
        
        const notification = new Notification(title, options);
        
        notification.onclick = () => {
          window.location.href = payload.data?.url || '/orders';
        };
      }
      
      callback(payload);
    });
  } catch (error) {
    console.warn('Error setting up onMessageListener:', error);
    return () => {};
  }
};

/**
 * Play chef bell sound (Ding-Ding-Ding) for status updates
 * High-pitched, resonant chef call bell synthesis
 */
export const playChefBell = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const playDing = (startTime: number) => {
      // High frequency for the striking of the bell
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2800, startTime);
      
      // Upper partial for metallic resonance
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(5600, startTime);
      const gain2 = ctx.createGain();

      // Sharp strike envelope
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.7, startTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.6);

      gain2.gain.setValueAtTime(0, startTime);
      gain2.gain.linearRampToValueAtTime(0.3, startTime + 0.005);
      gain2.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);

      osc.connect(gain);
      osc2.connect(gain2);
      gain.connect(ctx.destination);
      gain2.connect(ctx.destination);

      osc.start(startTime);
      osc2.start(startTime);
      osc.stop(startTime + 0.7);
      osc2.stop(startTime + 0.7);
    };

    const now = ctx.currentTime;
    // 3 precise rings: Blim! Blim! Blim!
    // Faster and more precise pattern
    playDing(now);
    playDing(now + 0.22);
    playDing(now + 0.44);
  } catch (err) {
    console.error('Error playing chef bell:', err);
  }
};

/**
 * Play notification sound
 */
export const playNotificationSound = () => {
  const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
  audio.play().catch(err => console.error('Error playing sound:', err));
};
