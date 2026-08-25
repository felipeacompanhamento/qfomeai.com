import type { Firestore } from 'firebase-admin/firestore';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { logger } from './logger';

export async function checkOrdersTimeoutForRestaurant(
  db: Firestore,
  sendPushFn: (token: string, title: string, body: string, orderId?: string, type?: string) => Promise<void>,
  restaurantId: string
): Promise<{ checkedOrders: number; processedOrders: number }> {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    logger.debug(`[Order Timeout] Checking orders for restaurant`);
    
    const restDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restDoc.exists) {
      logger.warn(`[Order Timeout] Restaurant not found.`);
      return { checkedOrders: 0, processedOrders: 0 };
    }
    
    const restaurantData = restDoc.data() || {};
    const pendingOrdersSnapshot = await restDoc.ref.collection('orders')
      .where('status', '==', 'pendente')
      .where('forma_pagamento', '==', 'pix')
      .where('pago', '==', false)
      .get();
      
    logger.debug(`[Order Timeout] Found pending orders count: ${pendingOrdersSnapshot.size}`);
    
    if (pendingOrdersSnapshot.empty) {
      return { checkedOrders: 0, processedOrders: 0 };
    }
    
    let processedCount = 0;
    for (const orderDoc of pendingOrdersSnapshot.docs) {
      const orderData = orderDoc.data();
      
      if (orderData.mercadopago_payment_id && orderData.data_criacao && orderData.data_criacao <= fiveMinutesAgo) {
        logger.info(`[Auto-Cancel] Cancelando pedido por inatividade no pagamento PIX.`);
        
        if (restaurantData.mercadopago_access_token) {
          try {
            const client = new MercadoPagoConfig({ accessToken: restaurantData.mercadopago_access_token });
            const payment = new Payment(client);
            
            const mpPayment = await payment.get({ id: orderData.mercadopago_payment_id });
            if (mpPayment.status === 'pending') {
              await payment.cancel({ id: orderData.mercadopago_payment_id });
              logger.info(`[Auto-Cancel] Pagamento MP anulado.`);
            } else if (mpPayment.status === 'approved') {
              logger.info(`[Auto-Cancel] Pagamento MP já aprovado, pulando.`);
              continue;
            }
          } catch (mpErr: any) {
            logger.error(`[Auto-Cancel] Erro ao anular PIX MP:`, { error: mpErr.message });
          }
        }

        await orderDoc.ref.update({
          status: 'cancelado',
          motivo_cancelamento: 'Cancelado automaticamente por inatividade no pagamento (5 min)',
          data_cancelamento: now.toISOString(),
          updated_at: now.toISOString()
        });

        if (orderData.cliente_id) {
          const userDoc = await db.collection('users').doc(orderData.cliente_id).get();
          const userData = userDoc.data();
          if (userData?.fcmToken) {
            await sendPushFn(
              userData.fcmToken,
              "Pagamento Expirado ⏰",
              `Seu pedido foi cancelado porque o pagamento PIX não foi identificado em 5 minutos.`,
              orderDoc.id,
              "order_cancelled_timeout"
            );
          }
        }
        processedCount++;
      }
    }
    
    return { checkedOrders: pendingOrdersSnapshot.size, processedOrders: processedCount };
  } catch (error: any) {
    logger.error(`[Order Timeout] Error checking order timeouts:`, { error: error.message });
    throw error;
  }
}
