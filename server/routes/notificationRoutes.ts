import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore, QuerySnapshot, WriteBatch } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { createVerifyAdmin, createVerifyRestaurant } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { sendStatusUpdateEmail } from '../utils/email';

export interface NotificationTargetOptions {
  restaurantId?: string;
  userId?: string;
  role?: string;
}

export function createNotificationRouter(authAdmin: Auth, db: Firestore, messaging: Messaging): Router {
  const router = Router();
  const verifyAdmin = createVerifyAdmin(authAdmin, db);
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  async function sendPushNotification(
    title: string, 
    body: string, 
    link?: string, 
    options?: NotificationTargetOptions
  ) {
    let usersConsulted = 0;
    let validTokens = 0;
    let successCount = 0;
    let failureCount = 0;
    let removedTokensCount = 0;

    const BATCH_SIZE = 100;

    // 1. Direct targeted user lookup (Individual Notification)
    if (options?.userId) {
      usersConsulted++;
      const userDoc = await db.collection('users').doc(options.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData?.fcmToken && typeof userData.fcmToken === 'string' && userData.fcmToken.trim().length > 0) {
          validTokens++;
          const token = userData.fcmToken;
          try {
            await messaging.send({
              token,
              notification: { title, body },
              data: { url: link || '/' },
              webpush: {
                fcmOptions: { link: link || '/' },
                notification: {
                  title,
                  body,
                  icon: '/logo.png',
                  badge: '/logo.png'
                }
              }
            });
            successCount++;
          } catch (err: any) {
            failureCount++;
            const errorCode = err?.code || err?.errorInfo?.code || '';
            const errStr = err?.message || String(err);
            if (
              errorCode === 'messaging/registration-token-not-registered' ||
              errorCode === 'messaging/invalid-registration-token' ||
              errStr.includes('NotRegistered')
            ) {
              await db.collection('users').doc(options.userId).update({
                fcmToken: FieldValue.delete()
              });
              removedTokensCount++;
            }
          }
        }
      }
      return {
        usersConsulted,
        validTokens,
        successCount,
        failureCount,
        removedTokensCount
      };
    }

    // 2. Paginated cursor query for Restaurant Team or Platform Broadcast
    let lastDoc: any = null;

    while (true) {
      let queryRef: any = db.collection('users');

      if (options?.restaurantId) {
        queryRef = queryRef.where('restaurantId', '==', options.restaurantId);
      }

      if (options?.role) {
        queryRef = queryRef.where('role', '==', options.role);
      }

      queryRef = queryRef.orderBy(FieldPath.documentId()).limit(BATCH_SIZE);

      if (lastDoc) {
        queryRef = queryRef.startAfter(lastDoc);
      }

      let snap: QuerySnapshot;
      try {
        snap = await queryRef.get();
      } catch (err) {
        console.warn('[Push Notification] Index fallback for FCM query:', err);
        let fallbackQuery: any = db.collection('users');
        if (options?.restaurantId) {
          fallbackQuery = fallbackQuery.where('restaurantId', '==', options.restaurantId);
        }
        if (options?.role) {
          fallbackQuery = fallbackQuery.where('role', '==', options.role);
        }
        if (lastDoc) {
          fallbackQuery = fallbackQuery.startAfter(lastDoc);
        }
        fallbackQuery = fallbackQuery.limit(BATCH_SIZE);
        snap = await fallbackQuery.get();
      }

      if (snap.empty) {
        break;
      }

      usersConsulted += snap.docs.length;

      const batchTokens: string[] = [];
      const tokenToUid: { [token: string]: string } = {};

      snap.docs.forEach(doc => {
        const data = doc.data();
        if (data.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.trim().length > 0) {
          batchTokens.push(data.fcmToken);
          tokenToUid[data.fcmToken] = doc.id;
        }
      });

      validTokens += batchTokens.length;

      if (batchTokens.length > 0) {
        const response = await messaging.sendEachForMulticast({
          tokens: batchTokens,
          data: { url: link || '/' },
          webpush: {
            fcmOptions: {
              link: link || '/'
            },
            notification: {
              title,
              body,
              icon: '/logo.png',
              badge: '/logo.png',
            }
          }
        });

        successCount += response.successCount;
        failureCount += response.failureCount;

        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code || '';
            const errStr = resp.error?.message || '';
            if (
              errorCode === 'messaging/registration-token-not-registered' || 
              errorCode === 'messaging/invalid-registration-token' ||
              errStr.includes('NotRegistered')
            ) {
              invalidTokens.push(batchTokens[idx]);
            }
          }
        });

        if (invalidTokens.length > 0) {
          const batchWrite: WriteBatch = db.batch();
          invalidTokens.forEach(tok => {
            const uid = tokenToUid[tok];
            if (uid) {
              batchWrite.update(db.collection('users').doc(uid), {
                fcmToken: FieldValue.delete()
              });
            }
          });
          await batchWrite.commit();
          removedTokensCount += invalidTokens.length;
        }
      }

      if (snap.docs.length < BATCH_SIZE) {
        break;
      }

      lastDoc = snap.docs[snap.docs.length - 1];
    }

    return {
      usersConsulted,
      validTokens,
      successCount,
      failureCount,
      removedTokensCount
    };
  }

  // WhatsApp Webhook Verification (GET)
  router.get('/whatsapp/webhook', (req: any, res: any) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WhatsApp] Webhook verificado com sucesso.');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    } else {
      console.warn('[WhatsApp] Falha na verificação do webhook: Token incorreto ou modo inválido.');
      return res.status(403).send('Forbidden');
    }
  });

  // WhatsApp Webhook Message Handler (POST)
  router.post('/whatsapp/webhook', (req: any, res: any) => {
    console.log('[WhatsApp] Webhook POST recebido:', JSON.stringify(req.body, null, 2));

    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const changeValue = body.entry[0].changes[0].value;
      const message = changeValue.messages[0];
      const metadata = changeValue.metadata;
      const from = message.from;
      const phoneNumberId = metadata?.phone_number_id;

      if (!phoneNumberId) return;

      (async () => {
        try {
          const restaurantsSnapshot = await db.collection('restaurants')
            .where('whatsapp_phone_number_id', '==', phoneNumberId)
            .where('whatsapp_enabled', '==', true)
            .limit(1)
            .get();
          
          if (restaurantsSnapshot.empty) return;

          const restDoc = restaurantsSnapshot.docs[0];
          const restaurant = restDoc.data();
          const restaurantId = restDoc.id;

          if (restaurant.status_operacao_config !== 'aberto') return;

          const token = restaurant.whatsapp_token;
          if (!token) return;

          await db.collection('restaurants').doc(restaurantId).collection('whatsapp_conversations').doc(from).set({
            phone: from,
            lastMessageAt: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { merge: true });

          const welcomeMsg = `Olá! 👋 Seja bem-vindo ao *${restaurant.nome_fantasia || restaurant.nome}*\n\nConfira nosso cardápio completo e realize seu pedido através do nosso catálogo:\n👉 https://qfomeai.com/${restaurant.slug}\n\nAguardamos você! ✨`;
          
          await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: from,
              type: 'text',
              text: { body: welcomeMsg },
            }),
          });
        } catch (err) {
          console.error('[WhatsApp] Erro ao processar mensagem em background:', err);
        }
      })();
    }
  });

  const notificationLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 push notification requests per minute per IP
    message: 'Muitas notificações enviadas. Por favor, aguarde antes de tentar novamente.'
  });

  // API route to send push notifications
  router.post('/notifications/send', verifyRestaurant, notificationLimiter, async (req: any, res: any) => {
    const { token, title, body, orderId, type, userId } = req.body;
    // Force restaurantId to caller's authenticated restaurantId unless admin
    const restaurantId = req.user.tipo_usuario === 'admin' ? (req.body.restaurantId || req.user.restaurantId) : req.user.restaurantId;

    if (!token && !userId && !restaurantId) {
      return res.status(400).json({ error: 'Token, userId or restaurantId required' });
    }

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    try {
      if (!token && (userId || restaurantId)) {
        const link = type === 'new_order' ? `/restaurant/dashboard?orderId=${orderId}` : (type === 'status_update' ? '/orders' : '/');
        const targetedResult = await sendPushNotification(title, body, link, {
          userId,
          restaurantId
        });
        return res.json({ success: true, ...targetedResult });
      }

      const message: any = {
        token,
        notification: { title, body },
        data: { 
          orderId: orderId || '',
          url: type === 'new_order' ? `/restaurant/dashboard?orderId=${orderId}` : (type === 'status_update' ? '/orders' : '/'),
          type: type || 'general',
          title: title,
          body: body
        },
        android: {
          priority: 'high',
          notification: {
            priority: 'max',
            channelId: 'qfomeai-updates',
            defaultSound: true,
            icon: 'stock_ticker_update',
            color: '#059669'
          }
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              sound: 'default'
            }
          },
          headers: {
            'apns-priority': '10'
          }
        },
        webpush: {
          headers: {
            Urgency: 'high'
          },
          notification: {
            title,
            body,
            icon: '/logo.png',
            badge: '/logo.png',
            tag: orderId || 'general-notification',
            renotify: true,
            silent: false
          },
          fcmOptions: {
            link: type === 'new_order' ? `/restaurant/dashboard?orderId=${orderId}` : (type === 'status_update' ? '/orders' : '/')
          }
        }
      };

      const pushResult = await messaging.send(message);

      if (restaurantId && orderId && type === 'status_update') {
        try {
          const orderDoc = await db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId).get();
          const order = orderDoc.data();
          if (order && order.cliente_id) {
            const userDoc = await db.collection('users').doc(order.cliente_id).get();
            const user = userDoc.data();
            if (user && user.email) {
              await sendStatusUpdateEmail(user.email, title, body);
            }
          }
        } catch (emailErr) {
          console.error('[Email] Erro ao processar envio automático de email de notificação:', emailErr);
        }
      }

      res.json({ success: true, messageId: pushResult ? pushResult : 'unknown' });
    } catch (error: any) {
      console.error('Error sending push notification:', error);
      res.status(500).json({ error: 'Erro ao enviar notificação.' });
    }
  });

  // API route to send push notifications to all users or targeted group
  router.post('/admin/send-notifications', verifyAdmin, notificationLimiter, async (req: any, res: any) => {
    const { title, body, link, restaurantId, userId, role } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    try {
      const result = await sendPushNotification(title, body, link, { restaurantId, userId, role });
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Error sending push notifications:', error);
      res.status(500).json({ error: 'Erro ao enviar notificações em massa.' });
    }
  });

  return router;
}
