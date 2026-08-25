import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { MercadoPagoConfig, Payment, PaymentRefund } from 'mercadopago';
import { createVerifyRestaurant } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  registerServerOrderPaymentMovement as registerServerOrderPaymentMovementUtil,
  registerServerOrderRefundMovement as registerServerOrderRefundMovementUtil
} from '../utils/cashRegister';
import { sendPush as sendPushUtil } from '../utils/push';

export function createMercadoPagoRouter(authAdmin: Auth, db: Firestore, messaging: Messaging): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  const registerServerOrderPaymentMovement = (restaurantId: string, orderId: string, orderData: any, createdBy: string) =>
    registerServerOrderPaymentMovementUtil(db, restaurantId, orderId, orderData, createdBy);

  const registerServerOrderRefundMovement = (restaurantId: string, orderId: string, orderData: any, createdBy: string, targetPaymentId?: string) =>
    registerServerOrderRefundMovementUtil(db, restaurantId, orderId, orderData, createdBy, targetPaymentId);

  const sendPush = (token: string, title: string, body: string, orderId?: string, type?: string, targetUrl?: string) =>
    sendPushUtil(messaging, db, token, title, body, orderId, type, targetUrl);

  // Mercado Pago PIX Creation
  router.post('/create', async (req: any, res: any) => {
    const { orderId, restaurantId } = req.body;

    if (!orderId || !restaurantId) {
      return res.status(400).json({ error: 'orderId e restaurantId são obrigatórios' });
    }

    try {
      // 1. Fetch restaurant settings
      const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
      if (!restaurantDoc.exists) {
        return res.status(404).json({ error: 'Restaurante não encontrado' });
      }
      const restaurantData = restaurantDoc.data()!;

      if (!restaurantData.mercadopago_enabled || !restaurantData.mercadopago_access_token) {
        return res.status(400).json({ error: 'Integração Mercado Pago não configurada ou desativada' });
      }

      // 2. Fetch order details
      const orderDoc = await db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId).get();
      if (!orderDoc.exists) {
        return res.status(404).json({ error: 'Pedido não encontrado' });
      }
      const orderData = orderDoc.data()!;

      // Se já tiver um PIX gerado, retorna ele
      if (orderData.mercadopago_payment_id && orderData.pix_copia_cola) {
        return res.json({
          payment_id: orderData.mercadopago_payment_id,
          qr_code: orderData.pix_copia_cola,
          qr_code_base64: orderData.pix_qr_code_base64
        });
      }

      // 3. Initialize Mercado Pago
      const client = new MercadoPagoConfig({ accessToken: restaurantData.mercadopago_access_token });
      const payment = new Payment(client);

      // 4. Create PIX Payment
      const host = req.headers['x-forwarded-host'] || req.get('host');
      
      const items = (orderData.items || orderData.itens)?.map((item: any) => ({
        id: item.id || 'item',
        title: item.nome || 'Produto',
        description: item.observacao || item.nome || 'Produto do pedido',
        category_id: 'food',
        quantity: item.quantidade || 1,
        unit_price: Number(Number(item.preco).toFixed(2))
      })) || [];

      const paymentData = {
        body: {
          transaction_amount: Number(Number(orderData.valor_total).toFixed(2)),
          description: `Pedido #${orderId.slice(-6)} - Qfomeai`,
          statement_descriptor: (restaurantData.nome_fantasia || restaurantData.nome || 'Qfomeai').substring(0, 16),
          payment_method_id: 'pix',
          payer: {
            email: orderData.cliente_email || 'cliente@qfomeai.com',
            first_name: orderData.cliente_nome?.split(' ')[0] || 'Cliente',
            last_name: orderData.cliente_nome?.split(' ').slice(1).join(' ') || 'Qfomeai',
          },
          additional_info: {
            items: items
          },
          notification_url: `https://${host}/api/payments/mercadopago/webhook?restaurantId=${restaurantId}`,
          external_reference: orderId,
        }
      };

      const result = await payment.create(paymentData);

      const pixInfo = result.point_of_interaction?.transaction_data;

      if (!pixInfo) {
        throw new Error('Falha ao obter dados do PIX do Mercado Pago');
      }

      // 5. Save payment info to order
      await orderDoc.ref.update({
        mercadopago_payment_id: result.id,
        pix_copia_cola: pixInfo.qr_code,
        pix_qr_code_base64: pixInfo.qr_code_base64,
        mercadopago_status: result.status,
        updated_at: new Date().toISOString()
      });

      // Log the creation
      await db.collection('restaurants').doc(restaurantId).collection('integration_logs').add({
        type: 'create_payment',
        provider: 'mercadopago',
        orderId: orderId,
        paymentId: result.id,
        status: result.status,
        created_at: new Date().toISOString()
      });

      res.json({
        payment_id: result.id,
        qr_code: pixInfo.qr_code,
        qr_code_base64: pixInfo.qr_code_base64
      });

    } catch (error: any) {
      console.error('Erro ao criar pagamento Mercado Pago:', error.message || error);
      if (error.cause) console.error('Causa do erro:', error.cause);
      if (error.response) console.error('Resposta do MP:', error.response);
      res.status(500).json({ 
        error: 'Erro interno ao criar pagamento com Mercado Pago.'
      });
    }
  });

  const mpLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    message: 'Muitas requisições de pagamento. Por favor, aguarde.'
  });

  const webhookLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Limite de webhooks excedido.'
  });

  // Mercado Pago Refund
  router.post('/refund', verifyRestaurant, mpLimiter, async (req: any, res: any) => {
    const restaurantId = req.user.restaurantId;
    const { orderId, amount } = req.body;

    if (!restaurantId || !orderId) {
      return res.status(400).json({ error: 'restaurantId e orderId são obrigatórios' });
    }

    try {
      // 1. Fetch restaurant settings
      const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
      if (!restaurantDoc.exists) {
        return res.status(404).json({ error: 'Restaurante não encontrado' });
      }
      const restaurantData = restaurantDoc.data()!;

      if (!restaurantData.mercadopago_enabled || !restaurantData.mercadopago_access_token) {
        return res.status(400).json({ error: 'Integração Mercado Pago não configurada ou desativada' });
      }

      // 2. Fetch order details
      const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
      const orderDoc = await orderRef.get();
      
      if (!orderDoc.exists) {
        return res.status(404).json({ error: 'Pedido não encontrado' });
      }
      
      const orderData = orderDoc.data()!;

      if (!orderData.mercadopago_payment_id) {
        return res.status(400).json({ error: 'Este pedido não possui um pagamento do Mercado Pago associado' });
      }

      // 3. Initialize Mercado Pago
      const client = new MercadoPagoConfig({ accessToken: restaurantData.mercadopago_access_token });
      const refund = new PaymentRefund(client);

      // 4. Create Refund
      const refundData: any = {
        payment_id: orderData.mercadopago_payment_id
      };

      if (amount && amount < orderData.valor_total) {
        refundData.body = { amount: Number(Number(amount).toFixed(2)) };
      }

      const result = await refund.create(refundData);

      // 5. Update order in Firestore
      const refundedAmount = result.amount || amount || orderData.valor_total;
      
      await orderRef.update({
        estornado: true,
        valor_estornado: refundedAmount,
        mercadopago_refund_id: result.id,
        updated_at: new Date().toISOString()
      });

      res.json({
        success: true,
        message: amount ? 'Estorno parcial realizado com sucesso' : 'Estorno total realizado com sucesso',
        refunded_amount: refundedAmount
      });

    } catch (error: any) {
      console.error('Erro ao estornar pagamento Mercado Pago:', error.message || error);
      if (error.cause) console.error('Causa do erro:', error.cause);
      if (error.response) console.error('Resposta do MP:', error.response);
      res.status(500).json({ 
        error: 'Erro interno ao estornar pagamento com Mercado Pago.'
      });
    }
  });

  // Mercado Pago Webhook
  router.post('/webhook', webhookLimiter, async (req: any, res: any) => {
    const { restaurantId } = req.query;
    const { action, data, type } = req.body;

    console.log(`[Webhook MP] Recebido: action=${action}, type=${type}, restaurantId=${restaurantId}`);

    if (type === 'payment' || action === 'payment.updated' || action === 'payment.created') {
      const paymentId = data?.id || req.body.id;

      if (!paymentId || !restaurantId) {
        return res.status(400).send();
      }

      try {
        const restaurantDoc = await db.collection('restaurants').doc(restaurantId as string).get();
        if (!restaurantDoc.exists) return res.status(404).send();
        const restaurantData = restaurantDoc.data()!;

        const client = new MercadoPagoConfig({ accessToken: restaurantData.mercadopago_access_token });
        const payment = new Payment(client);
        const mpPayment = await payment.get({ id: paymentId });

        const orderId = mpPayment.external_reference;
        const status = mpPayment.status;

        await db.collection('restaurants').doc(restaurantId as string).collection('integration_logs').add({
          type: 'webhook',
          provider: 'mercadopago',
          action: action || type || 'unknown',
          paymentId: paymentId || null,
          orderId: orderId || null,
          status: status || null,
          payload: req.body,
          created_at: new Date().toISOString()
        });

        if (orderId) {
          const orderRef = db.collection('restaurants').doc(restaurantId as string).collection('orders').doc(orderId);
          const orderDoc = await orderRef.get();
          
          if (orderDoc.exists) {
            const orderData = orderDoc.data()!;
            
            if (orderData.pago && status !== 'approved' && status !== 'refunded' && status !== 'charged_back') {
              console.log(`[Webhook MP] Pedido ${orderId} já está pago. Ignorando status ${status} do pagamento ${paymentId}.`);
              return res.status(200).send();
            }

            if (status === 'approved' && !orderData.pago) {
              await orderRef.update({
                pago: true,
                mercadopago_status: 'approved',
                mercadopago_payment_id: paymentId,
                data_pagamento: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
              console.log(`[Webhook MP] Pedido ${orderId} marcado como PAGO.`);

              await registerServerOrderPaymentMovement(
                restaurantId as string,
                orderId,
                { ...orderData, pago: true },
                'Mercado Pago Webhook'
              ).catch(err => console.error('[Webhook Finance Integration Error]:', err));

              if (orderData.cliente_id) {
                const userDoc = await db.collection('users').doc(orderData.cliente_id).get();
                const userData = userDoc.data();
                if (userData?.fcmToken) {
                  await sendPush(
                    userData.fcmToken,
                    "Pagamento Aprovado! ✅",
                    `Seu pagamento do pedido #${orderId.slice(-6).toUpperCase()} foi aprovado. O restaurante já está preparando seu pedido!`,
                    orderId,
                    "payment_approved"
                  );
                }
              }
            } else if (['cancelled', 'rejected', 'refunded', 'charged_back'].includes(status)) {
              await orderRef.update({
                pago: false,
                mercadopago_status: status,
                updated_at: new Date().toISOString()
              });
              console.log(`[Webhook MP] Pedido ${orderId} DESMARCADO como pago (status: ${status}).`);

              if (['refunded', 'charged_back'].includes(status)) {
                await registerServerOrderRefundMovement(
                  restaurantId as string,
                  orderId,
                  orderData,
                  'Mercado Pago Webhook'
                ).catch(err => console.error('[Webhook Refund Finance Integration Error]:', err));
              }

              if (orderData.cliente_id) {
                const userDoc = await db.collection('users').doc(orderData.cliente_id).get();
                const userData = userDoc.data();
                if (userData?.fcmToken) {
                  let title = "Status do Pagamento";
                  let body = `Houve uma atualização no pagamento do seu pedido #${orderId.slice(-6).toUpperCase()}.`;
                  
                  if (status === 'rejected') {
                    title = "Pagamento Rejeitado ❌";
                    body = `O pagamento do seu pedido #${orderId.slice(-6).toUpperCase()} foi rejeitado. Tente novamente ou use outra forma de pagamento.`;
                  } else if (status === 'cancelled') {
                    title = "Pagamento Cancelado ⚠️";
                    body = `O pagamento do seu pedido #${orderId.slice(-6).toUpperCase()} foi cancelado.`;
                  } else if (status === 'refunded') {
                    title = "Pagamento Estornado 💸";
                    body = `O pagamento do seu pedido #${orderId.slice(-6).toUpperCase()} foi estornado com sucesso.`;
                  }

                  await sendPush(userData.fcmToken, title, body, orderId, `payment_${status}`);
                }
              }
            } else {
              await orderRef.update({
                mercadopago_status: status,
                updated_at: new Date().toISOString()
              });
              console.log(`[Webhook MP] Pedido ${orderId} status atualizado para ${status}.`);
            }
          }
        }
      } catch (error) {
        console.error('[Webhook MP] Erro ao processar webhook:', error);
      }
    }

    res.status(200).send('OK');
  });

  // Mercado Pago Credentials Validation
  router.post('/validate', async (req: any, res: any) => {
    const { accessToken, publicKey } = req.body;

    if (!accessToken || !publicKey) {
      return res.status(400).json({ error: 'Access Token e Public Key são obrigatórios para validação' });
    }

    try {
      const client = new MercadoPagoConfig({ accessToken });
      const payment = new Payment(client);
      
      try {
        await payment.search({ options: { limit: 1 } });
      } catch (tokenError: any) {
        console.error('Erro ao validar Access Token:', tokenError);
        return res.status(400).json({ 
          error: 'Access Token inválido. Verifique se copiou corretamente das configurações do Mercado Pago.' 
        });
      }

      if (!publicKey.startsWith('APP_USR-') && !publicKey.startsWith('TEST-')) {
        return res.status(400).json({ 
          error: 'Public Key inválida. Verifique se copiou a chave corretamente (deve começar com APP_USR- ou TEST-).' 
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Erro na validação do Mercado Pago:', error);
      res.status(500).json({ error: 'Erro interno ao validar credenciais.' });
    }
  });

  return router;
}
