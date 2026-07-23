# Firebase Cloud Functions - Pedidos

Copie e cole este código no seu arquivo `functions/src/index.ts` (ou equivalente) do seu projeto de Firebase Cloud Functions.

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Função auxiliar para remover tokens inválidos do Firestore
 */
async function removeInvalidToken(userId: string) {
  try {
    await db.collection('users').doc(userId).update({
      fcmToken: admin.firestore.FieldValue.delete(),
      fcmTokenUpdatedAt: admin.firestore.FieldValue.delete()
    });
    console.log(`Token inválido removido para o usuário: ${userId}`);
  } catch (error) {
    console.error(`Erro ao remover token inválido para o usuário ${userId}:`, error);
  }
}

/**
 * Notifica o RESTAURANTE sobre um NOVO PEDIDO
 * Gatilho: onCreate em restaurants/{restaurantId}/orders/{orderId}
 */
export const onOrderCreated = functions.firestore
  .document('restaurants/{restaurantId}/orders/{orderId}')
  .onCreate(async (snapshot, context) => {
    const { restaurantId, orderId } = context.params;
    const orderData = snapshot.data();

    if (!orderData) {
      console.error(`Dados do pedido ${orderId} não encontrados.`);
      return null;
    }

    // Padronização de campos (cliente_id ou userId, cliente_nome ou name)
    const clienteNome = orderData.cliente_nome || orderData.name || 'um cliente';

    try {
      // Busca o perfil do restaurante (que é o dono da coleção pai)
      const restaurantDoc = await db.collection('users').doc(restaurantId).get();
      const restaurantData = restaurantDoc.data();

      if (restaurantData && restaurantData.fcmToken) {
        const message: admin.messaging.Message = {
          token: restaurantData.fcmToken,
          notification: {
            title: 'Novo Pedido Recebido! 🍔',
            body: `Você recebeu um novo pedido de ${clienteNome}.`
          },
          data: {
            orderId: orderId,
            url: `/restaurant/dashboard?orderId=${orderId}`,
            type: 'new_order'
          },
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              clickAction: 'FLUTTER_NOTIFICATION_CLICK'
            }
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1
              }
            }
          },
          webpush: {
            notification: {
              icon: '/logo.png',
              badge: '/logo.png',
              requireInteraction: true
            },
            fcmOptions: {
              link: `/restaurant/dashboard?orderId=${orderId}`
            }
          }
        };

        await messaging.send(message);
        console.log(`Notificação de novo pedido enviada para o restaurante ${restaurantId} (Pedido: ${orderId})`);
      } else {
        console.log(`Restaurante ${restaurantId} não possui fcmToken cadastrado.`);
      }
    } catch (error: any) {
      console.error(`Erro ao enviar notificação para o restaurante ${restaurantId}:`, error);
      
      // Tratamento de token inválido
      if (error.code === 'messaging/registration-token-not-registered' || 
          error.code === 'messaging/invalid-registration-token') {
        await removeInvalidToken(restaurantId);
      }
    }
    return null;
  });

/**
 * Notifica o CLIENTE sobre MUDANÇA DE STATUS
 * Gatilho: onUpdate em restaurants/{restaurantId}/orders/{orderId}
 */
export const onOrderStatusUpdated = functions.firestore
  .document('restaurants/{restaurantId}/orders/{orderId}')
  .onUpdate(async (change, context) => {
    const { orderId } = context.params;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (!beforeData || !afterData) return null;

    // Só envia se o status mudou
    if (beforeData.status === afterData.status) {
      return null;
    }

    const newStatus = afterData.status;
    const clienteId = afterData.cliente_id || afterData.userId;
    const restaurantNome = afterData.restaurant_nome || 'Restaurante';

    if (!clienteId) {
      console.error(`Pedido ${orderId} não possui cliente_id ou userId.`);
      return null;
    }

    try {
      // Busca o perfil do cliente para encontrar o fcmToken
      const userDoc = await db.collection('users').doc(clienteId).get();
      const userData = userDoc.data();

      if (userData && userData.fcmToken) {
        const statusMessages: { [key: string]: string } = {
          'recebido': 'Seu pedido foi recebido e está aguardando confirmação.',
          'aceito': 'Seu pedido foi confirmado pelo restaurante!',
          'preparando': 'Seu pedido está sendo preparado 🍔',
          'pronto': 'Seu pedido está pronto e aguardando o entregador!',
          'saiu_entrega': 'Seu pedido já saiu para entrega 🚴',
          'entregue': 'Pedido entregue! Bom apetite 😋',
          'finalizado': 'Pedido finalizado! Esperamos que tenha gostado.',
          'cancelado': 'Seu pedido foi cancelado. Sentimos muito pelo inconveniente.',
          'rejeitado': 'Seu pedido não pôde ser aceito pelo restaurante.'
        };

        const notificationBody = statusMessages[newStatus] || `Seu pedido no ${restaurantNome} foi atualizado para: ${newStatus}`;

        const message: admin.messaging.Message = {
          token: userData.fcmToken,
          notification: {
            title: 'Atualização do seu pedido',
            body: notificationBody
          },
          data: {
            orderId: orderId,
            url: `/orders?orderId=${orderId}`,
            type: 'status_update'
          },
          android: {
            priority: 'high',
            notification: {
              sound: 'default'
            }
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
                badge: 1
              }
            }
          },
          webpush: {
            notification: {
              icon: '/logo.png',
              badge: '/logo.png'
            },
            fcmOptions: {
              link: `/orders?orderId=${orderId}`
            }
          }
        };

        await messaging.send(message);
        console.log(`Notificação de status (${newStatus}) enviada para o cliente ${clienteId} (Pedido: ${orderId})`);
      } else {
        console.log(`Cliente ${clienteId} não possui fcmToken cadastrado.`);
      }
    } catch (error: any) {
      console.error(`Erro ao enviar notificação para o cliente ${clienteId}:`, error);
      
      // Tratamento de token inválido
      if (error.code === 'messaging/registration-token-not-registered' || 
          error.code === 'messaging/invalid-registration-token') {
        await removeInvalidToken(clienteId);
      }
    }
    return null;
  });
```
