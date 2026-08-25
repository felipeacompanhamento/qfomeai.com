import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { metricsRegistry } from './metrics';
import { logger } from './logger';

export async function sendPush(
  messaging: Messaging,
  db: Firestore,
  token: string,
  title: string,
  body: string,
  orderId?: string,
  type?: string,
  targetUrl?: string
) {
  if (!token) return;
  try {
    const message: any = {
      notification: { title, body },
      token: token,
      data: {
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
        status: 'done',
      }
    };
    if (orderId) message.data.orderId = orderId;
    if (type) message.data.type = type;
    if (targetUrl) {
      message.data.url = targetUrl;
      message.data.click_action = targetUrl;
      message.webpush = {
        fcmOptions: {
          link: targetUrl
        }
      };
    }

    await messaging.send(message);
    metricsRegistry.increment('fcmSuccess');
    logger.debug(`[Push] Notificação enviada com sucesso`);
  } catch (error: any) {
    metricsRegistry.increment('fcmFailure');
    const errCode = error?.code || error?.errorInfo?.code || '';
    const errStr = error?.message || String(error);

    if (
      errCode === 'messaging/registration-token-not-registered' || 
      errCode === 'messaging/invalid-registration-token' || 
      errStr.includes('NotRegistered') || 
      errStr.includes('registration-token-not-registered')
    ) {
      logger.warn(`[Push] Token FCM expirado ou não registrado. Limpando token do Firestore.`);
      try {
        const userSnap = await db.collection('users').where('fcmToken', '==', token).get();
        if (!userSnap.empty) {
          const batch = db.batch();
          userSnap.forEach((doc: any) => {
            batch.update(doc.ref, { fcmToken: null, updatedAt: new Date().toISOString() });
          });
          await batch.commit();
        }
      } catch (cleanErr: any) {
        logger.warn('[Push] Erro ao limpar token expirado:', { error: cleanErr.message });
      }
    } else {
      logger.error('[Push] Erro ao enviar notificação:', { error: errStr });
    }
  }
}
