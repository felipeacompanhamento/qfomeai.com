import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { promises as fs } from 'fs';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { Firestore, WriteBatch, DocumentSnapshot, QuerySnapshot, DocumentReference, CollectionReference } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import type { Messaging, MulticastMessage, BatchResponse } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import type { Auth, UserRecord, DecodedIdToken } from 'firebase-admin/auth';
import nodemailer from 'nodemailer';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { MercadoPagoConfig, Payment, PaymentRefund } from 'mercadopago';
import { isProductAvailableForChannelData, getProductPriceForChannelData, resolveCounterUnitPriceCents } from './src/shared/productChannels';

function normalizePaymentMethodId(value: any): 'dinheiro' | 'pix' | 'credito' | 'debito' | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase();
  if (clean === 'dinheiro' || clean === 'cash') return 'dinheiro';
  if (clean === 'pix') return 'pix';
  if (clean === 'credito' || clean === 'credit' || clean === 'cartao_credito' || clean === 'cartão_credito' || clean === 'cartao de credito') return 'credito';
  if (clean === 'debito' || clean === 'debit' || clean === 'cartao_debito' || clean === 'cartão_debito' || clean === 'cartao de debito') return 'debito';
  return null;
}

async function registerServerOrderPaymentMovement(
  restaurantId: string,
  orderId: string,
  orderData: any,
  createdBy: string
) {
  try {
    if (!restaurantId || !orderId || !orderData) return;

    // Find if there is an active OPEN caixa
    const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
    const openCaixasQuery = await caixasRef.where('status', '==', 'OPEN').get();
    
    if (openCaixasQuery.empty) {
      console.warn(`[Finance Integration Server] Auditoria: Nenhum Caixa aberto encontrado para o restaurante ${restaurantId} ao quitar o pedido ${orderId}`);
      return;
    }

    const activeCaixa = openCaixasQuery.docs[0];
    const cashRegisterId = activeCaixa.id;

    let payments = Array.isArray(orderData.payments) ? orderData.payments : [];

    if (payments.length === 0) {
      // Compatibilidade com pedidos antigos
      const paymentMethodId = normalizePaymentMethodId(orderData.forma_pagamento || orderData.paymentMethodId || orderData.paymentMethod);
      const isPaid = orderData.pago === true || orderData.paymentStatus === 'PAID';
      
      let totalCents = 0;
      if (typeof orderData.valor_total === 'number') {
        totalCents = Math.round(orderData.valor_total * 100);
      } else if (typeof orderData.total === 'number') {
        totalCents = Math.round(orderData.total * 100);
      } else if (typeof orderData.valor_produtos === 'number') {
        totalCents = Math.round(orderData.valor_produtos * 100);
      }

      if (paymentMethodId && totalCents > 0) {
        payments = [{
          id: 'legacy',
          paymentMethodId,
          amount: totalCents,
          status: isPaid ? 'PAID' : 'PENDING'
        }];
      }
    }

    for (const payment of payments) {
      if (payment.status !== 'PAID') continue;

      const paymentMethodId = normalizePaymentMethodId(payment.paymentMethodId);
      if (!paymentMethodId) continue;

      const amountCents = Math.round(Number(payment.amount));
      if (isNaN(amountCents) || amountCents <= 0) continue;

      const paymentId = payment.id || 'legacy';
      const movementId = `ORDER_PAYMENT:${orderId}:${paymentId}`;
      const movementRef = caixasRef.doc(cashRegisterId).collection('movimentacoes').doc(movementId);

      const orderNum = orderData.numero_pedido || orderData.numero || orderData.orderNumber || orderId.slice(-6).toUpperCase();
      const description = `Pagamento do pedido #${orderNum}`;

      await db.runTransaction(async (transaction) => {
        const existingMovement: any = await transaction.get(movementRef);
        if (existingMovement.exists) {
          console.log(`[Finance Integration Server] Lançamento já existe (idempotência): ${movementId}`);
          return;
        }

        const movementDoc = {
          restaurantId,
          cashRegisterId,
          type: 'INCOME',
          category: 'ORDER_PAYMENT',
          description,
          amount: amountCents,
          paymentMethodId,
          paymentId,
          orderId,
          orderSource: orderData.source || orderData.origem || orderData.channel || 'DELIVERY',
          createdAt: new Date().toISOString(),
          createdBy: createdBy || 'SYSTEM',
          origin: 'ORDER',
          automatic: true,
          idempotencyKey: movementId
        };

        transaction.set(movementRef, movementDoc);
        console.log(`[Finance Integration Server] Lançamento automático de entrada criado com sucesso para o pedido ${orderId} e pagamento ${paymentId}`);
      });
    }
  } catch (error) {
    console.error(`[Finance Integration Server] Erro técnico ao criar lançamento do pedido ${orderId}:`, error);
  }
}

async function registerServerOrderRefundMovement(
  restaurantId: string,
  orderId: string,
  orderData: any,
  createdBy: string,
  targetPaymentId?: string
) {
  try {
    if (!restaurantId || !orderId || !orderData) return;

    // Find if there is an active OPEN caixa
    const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
    const openCaixasQuery = await caixasRef.where('status', '==', 'OPEN').get();
    
    if (openCaixasQuery.empty) {
      console.warn(`[Finance Integration Server] Auditoria: Nenhum Caixa aberto encontrado ao estornar o pedido ${orderId}`);
      return;
    }

    const activeCaixa = openCaixasQuery.docs[0];
    const cashRegisterId = activeCaixa.id;

    let payments = Array.isArray(orderData.payments) ? orderData.payments : [];

    if (payments.length === 0) {
      // Compatibilidade com pedidos antigos
      const paymentMethodId = normalizePaymentMethodId(orderData.forma_pagamento || orderData.paymentMethodId || orderData.paymentMethod);
      let totalCents = 0;
      if (typeof orderData.valor_total === 'number') {
        totalCents = Math.round(orderData.valor_total * 100);
      } else if (typeof orderData.total === 'number') {
        totalCents = Math.round(orderData.total * 100);
      } else if (typeof orderData.valor_produtos === 'number') {
        totalCents = Math.round(orderData.valor_produtos * 100);
      }

      if (paymentMethodId && totalCents > 0) {
        payments = [{
          id: 'legacy',
          paymentMethodId,
          amount: totalCents,
          status: 'REFUNDED'
        }];
      }
    }

    for (const payment of payments) {
      const paymentId = payment.id || 'legacy';

      if (targetPaymentId && paymentId !== targetPaymentId) continue;
      if (payment.status !== 'REFUNDED' && paymentId !== 'legacy' && !targetPaymentId) continue;

      const paymentMethodId = normalizePaymentMethodId(payment.paymentMethodId);
      if (!paymentMethodId) continue;

      const amountCents = Math.round(Number(payment.amount));
      if (isNaN(amountCents) || amountCents <= 0) continue;

      const referenceMovementId = `ORDER_PAYMENT:${orderId}:${paymentId}`;
      const refundMovementId = `ORDER_REFUND:${orderId}:${paymentId}`;
      const refundRef = caixasRef.doc(cashRegisterId).collection('movimentacoes').doc(refundMovementId);

      const orderNum = orderData.numero_pedido || orderData.numero || orderData.orderNumber || orderId.slice(-6).toUpperCase();
      const description = `Estorno do pedido #${orderNum}`;

      await db.runTransaction(async (transaction) => {
        const existingRefund: any = await transaction.get(refundRef);
        if (existingRefund.exists) {
          console.log(`[Finance Integration Server] Estorno já lançado anteriormente (idempotência): ${refundMovementId}`);
          return;
        }

        const refundDoc = {
          restaurantId,
          cashRegisterId,
          type: 'EXPENSE',
          category: 'ORDER_REFUND',
          description,
          amount: amountCents,
          paymentMethodId,
          paymentId,
          orderId,
          referenceMovementId,
          createdAt: new Date().toISOString(),
          createdBy: createdBy || 'SYSTEM',
          origin: 'ORDER_REFUND',
          automatic: true,
          idempotencyKey: refundMovementId
        };

        transaction.set(refundRef, refundDoc);
        console.log(`[Finance Integration Server] Lançamento automático de estorno criado com sucesso para o pedido ${orderId} e pagamento ${paymentId}`);
      });
    }
  } catch (error) {
    console.error(`[Finance Integration Server] Erro técnico ao criar estorno do pedido ${orderId}:`, error);
  }
}

async function loadRestaurantCounterPaymentMethods(restaurantId: string, serviceMode: 'COUNTER' | 'PICKUP' | 'DINE_IN') {
  const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
  const rData = restaurantDoc.exists ? (restaurantDoc.data() || {}) : {};
  const configured = rData.formas_pagamento || rData.payment_methods;

  const validMethods = ['dinheiro', 'pix', 'credito', 'debito'] as const;

  if (!configured || typeof configured !== 'object') {
    return {
      hasExplicitConfiguration: false,
      methods: validMethods.map(id => ({
        id,
        active: true,
        enabledForCurrentServiceMode: true
      }))
    };
  }

  const hasAnyKey = validMethods.some(mId => {
    let v: any = undefined;
    if (mId === 'dinheiro') v = configured.dinheiro;
    else if (mId === 'pix') v = configured.pix;
    else if (mId === 'credito') v = configured.credito ?? configured.cartao_credito;
    else if (mId === 'debito') v = configured.debito ?? configured.cartao_debito;
    return v !== undefined;
  });

  if (!hasAnyKey) {
    return {
      hasExplicitConfiguration: false,
      methods: validMethods.map(id => ({
        id,
        active: true,
        enabledForCurrentServiceMode: true
      }))
    };
  }

  const methods = validMethods.map(mId => {
    let val: any = undefined;
    if (mId === 'dinheiro') val = configured.dinheiro;
    else if (mId === 'pix') val = configured.pix;
    else if (mId === 'credito') val = configured.credito ?? configured.cartao_credito;
    else if (mId === 'debito') val = configured.debito ?? configured.cartao_debito;

    let active = false;
    let enabledForCurrentServiceMode = false;

    if (val !== undefined) {
      if (typeof val === 'boolean') {
        active = val;
        enabledForCurrentServiceMode = val;
      } else if (typeof val === 'object' && val !== null) {
        if (serviceMode === 'COUNTER') {
          enabledForCurrentServiceMode = val.balcao === true || val.counter === true;
        } else if (serviceMode === 'PICKUP') {
          enabledForCurrentServiceMode = val.retirada === true || val.pickup === true;
        } else if (serviceMode === 'DINE_IN') {
          enabledForCurrentServiceMode = val.consumoLocal === true || val.dine_in === true || val.dineIn === true || val.mesa === true;
        }
        active = val.entrega === true || val.retirada === true || val.balcao === true || val.counter === true || val.mesa === true || val.dine_in === true || val.consumoLocal === true;
      }
    }

    return {
      id: mId,
      active,
      enabledForCurrentServiceMode
    };
  });

  return {
    hasExplicitConfiguration: true,
    methods
  };
}

// Catch unhandled rejections to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize Firebase Admin
let adminApp: admin.app.App;
try {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
  
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim() !== '' 
        ? process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
        : '{}';
        
      // Try to parse directly (if it's a JSON string)
      let serviceAccount;
      if (serviceAccountJson.startsWith('{')) {
        serviceAccount = JSON.parse(serviceAccountJson);
      } else {
        // Assume base64
        serviceAccount = JSON.parse(Buffer.from(serviceAccountJson, 'base64').toString('utf8'));
      }
      credential = admin.credential.cert(serviceAccount);
      console.log('Firebase Admin credential loaded from FIREBASE_SERVICE_ACCOUNT_KEY secret.');
    } catch (parseError: any) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', parseError.message);
      console.warn('Falling back to applicationDefault() credentials.');
      credential = admin.credential.applicationDefault();
    }
  } else {
    credential = admin.credential.applicationDefault();
    console.log('No FIREBASE_SERVICE_ACCOUNT_KEY found. Using applicationDefault() credentials.');
  }

  if (admin.apps.length === 0) {
    adminApp = admin.initializeApp({
      credential: credential,
      projectId: projectId
    });
    console.log(`Firebase Admin initialized successfully for project: ${projectId}`);
  } else {
    adminApp = admin.app();
    console.log('Firebase Admin already initialized');
  }
} catch (error: any) {
  console.error('Error initializing Firebase Admin:', error.message);
  if (admin.apps.length === 0) {
    adminApp = admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
  } else {
    adminApp = admin.app();
  }
}

// Initialize Firestore with the named database from config, with fallback to default
let db: Firestore;
try {
  const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
    ? firebaseConfig.firestoreDatabaseId 
    : undefined;
  
  // Use getFirestore with databaseId if provided
  if (databaseId) {
    db = getFirestore(adminApp, databaseId);
    console.log(`Initialized Firestore with named database: ${databaseId}`);
  } else {
    db = getFirestore(adminApp);
    console.log('Initialized Firestore with (default) database');
  }
} catch (e: any) {
  console.warn(`Failed to initialize Firestore with database ${firebaseConfig.firestoreDatabaseId}, falling back to default:`, e.message);
  db = getFirestore(adminApp);
  console.log('Initialized Firestore with (default) database (fallback)');
}

async function requireOpenCashRegister(restaurantId: string, transaction?: any) {
  if (!restaurantId) {
    const error: any = new Error('ID do restaurante inválido.');
    error.code = 'INVALID_RESTAURANT_ID';
    throw error;
  }
  const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
  const query = caixasRef.where('status', '==', 'OPEN');
  
  const snap = transaction ? await transaction.get(query) : await query.get();
  
  if (snap.empty) {
    const error: any = new Error('Abra o caixa para realizar esta operação financeira.');
    error.code = 'CASH_REGISTER_CLOSED';
    throw error;
  }
  
  return {
    id: snap.docs[0].id,
    ...snap.docs[0].data()
  };
}

const messaging: Messaging = getMessaging(adminApp);

// Helper to send push notifications from server
async function sendPush(token: string, title: string, body: string, orderId?: string, type?: string, targetUrl?: string) {
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
    console.log(`[Push] Notificação enviada para ${token}`);
  } catch (error: any) {
    const errCode = error?.code || error?.errorInfo?.code || '';
    const errStr = error?.message || String(error);

    if (
      errCode === 'messaging/registration-token-not-registered' || 
      errCode === 'messaging/invalid-registration-token' || 
      errStr.includes('NotRegistered') || 
      errStr.includes('registration-token-not-registered')
    ) {
      console.warn(`[Push] Token FCM expirado ou não registrado (${token.substring(0, 12)}...). Limpando token do Firestore.`);
      try {
        const userSnap = await db.collection('users').where('fcmToken', '==', token).get();
        if (!userSnap.empty) {
          const batch = db.batch();
          userSnap.forEach((doc: any) => {
            batch.update(doc.ref, { fcmToken: null, updatedAt: new Date().toISOString() });
          });
          await batch.commit();
        }
      } catch (cleanErr) {
        console.warn('[Push] Erro ao limpar token expirado:', cleanErr);
      }
    } else {
      console.error('[Push] Erro ao enviar notificação:', error);
    }
  }
}

// WhatsApp API Helpers
async function sendWhatsAppMessage(phone: string, text: string, restaurantId: string) {
  try {
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    const restaurant = restaurantDoc.data();

    if (!restaurant?.whatsapp_enabled || !restaurant?.whatsapp_token || !restaurant?.whatsapp_phone_number_id) {
      console.warn(`[WhatsApp] Integração não configurada ou desativada para o restaurante ${restaurantId}`);
      return;
    }

    const token = restaurant.whatsapp_token;
    const phoneNumberId = restaurant.whatsapp_phone_number_id;

    // Clean phone number
    const cleanPhone = phone.replace(/\D/g, '');
    const finalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // Check 24h window
    const convDoc = await db.collection('restaurants').doc(restaurantId).collection('whatsapp_conversations').doc(finalPhone).get();
    if (!convDoc.exists) {
      console.log(`[WhatsApp] Nenhuma conversa iniciada pelo cliente ${finalPhone}. Mensagem não enviada.`);
      return;
    }

    const lastMessageAt = new Date(convDoc.data()?.lastMessageAt).getTime();
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    if (now - lastMessageAt > twentyFourHours) {
      console.log(`[WhatsApp] Janela de 24h expirada para ${finalPhone}. Mensagem não enviada.`);
      return;
    }

    const response = await fetch(`https://graph.facebook.com/v17.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: finalPhone,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`[WhatsApp] Erro ao enviar mensagem para ${finalPhone}:`, errorData);
    } else {
      console.log(`[WhatsApp] Mensagem enviada para ${finalPhone} (Restaurante: ${restaurantId})`);
    }
  } catch (error) {
    console.error('[WhatsApp] Erro na função sendWhatsAppMessage:', error);
  }
}
const authAdmin: Auth = admin.auth(adminApp);

// Configure Nodemailer for Gmail SMTP
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "qfomeai.com@gmail.com",
    pass: "cebd xwdd zrxe kdmf"
  }
});

/**
 * Sends a custom verification email using Nodemailer
 */
async function sendActivationEmail(email: string, link: string) {
  // Delay defined to avoid burst sending suspicion (deliverability best practice)
  await new Promise(resolve => setTimeout(resolve, 600));

  const mailOptions = {
    from: '"QFomeai" <qfomeai.com@gmail.com>',
    to: email,
    subject: "Confirme seu cadastro no QFomeai",
    text: `
Confirmação de cadastro

Recebemos seu cadastro no QFomeai.

Acesse o link para ativar sua conta:
${link}

Se não foi você, ignore este e-mail.
    `,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; color: #333; line-height: 1.6;">
        <h2 style="color: #059669; font-size: 24px; margin-bottom: 20px;">Olá!</h2>
        <p style="font-size: 16px;">Tudo bem? Recebemos sua solicitação de cadastro no <strong>QFomeai</strong>.</p>
        <p style="font-size: 16px;">Para confirmar e ativar sua conta com total segurança, clique no botão abaixo:</p>
        
        <div style="text-align: center; margin: 40px 0;">
          <a href="${link}" style="background-color: #059669; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(5, 150, 105, 0.1);">
            Confirmar meu cadastro
          </a>
        </div>
        
        <p style="font-size: 14px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
          Se o botão acima não funcionar, você pode copiar e colar o link abaixo no seu navegador:
        </p>
        <p style="font-size: 12px; color: #059669; word-break: break-all; background-color: #f0fdf4; padding: 10px; border-radius: 6px;">
          ${link}
        </p>
        
        <p style="font-size: 14px; color: #999; margin-top: 30px;">
          Se você não realizou esse cadastro, pode desconsiderar esta mensagem com segurança.
        </p>
        
        <p style="font-size: 16px; margin-top: 40px; font-weight: 500;">
          Atenciosamente,<br>
          <span style="color: #059669;">Equipe QFomeai</span>
        </p>
      </div>
    `,
    headers: {
      "X-Mailer": "QFome AI System",
      "X-Priority": "3",
      "List-Unsubscribe": "mailto:qfomeai.com@gmail.com"
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email enviado para:", email);
    console.log("Message ID:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("Erro ao enviar email:", error);
    throw error;
  }
}

/**
 * Sends a status update email using Nodemailer
 */
async function sendStatusUpdateEmail(email: string, title: string, body: string) {
  const mailOptions = {
    from: '"QFomeai" <qfomeai.com@gmail.com>',
    to: email,
    subject: `Atualização: ${title}`,
    text: body,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; color: #333; line-height: 1.6;">
        <h2 style="color: #059669; font-size: 24px; margin-bottom: 20px;">${title}</h2>
        <p style="font-size: 16px;">${body}</p>
        <p style="font-size: 16px; margin-top: 40px; font-weight: 500;">
          Atenciosamente,<br>
          <span style="color: #059669;">Equipe QFomeai</span>
        </p>
      </div>
    `,
    headers: {
      "X-Mailer": "QFome AI System",
      "X-Priority": "3",
      "List-Unsubscribe": "mailto:qfomeai.com@gmail.com"
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Email de status enviado para:", email);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("Erro ao enviar email de status:", error);
  }
}

// Test Firestore connection on startup
async function testFirestoreConnection() {
  try {
    const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
      ? firebaseConfig.firestoreDatabaseId 
      : '(default)';
      
    console.log(`Testing Firebase Admin connection...`);
    console.log(`Project: ${firebaseConfig.projectId}`);
    console.log(`Database: ${databaseId}`);
    
    // Test Auth first
    try {
      const authTest = await authAdmin.listUsers(1);
      console.log('Successfully connected to Firebase Auth.');
    } catch (authError: any) {
      console.error('Firebase Auth test failed:', authError.message);
      if (authError.code === 'auth/insufficient-permission' || authError.message.includes('permission denied')) {
        console.error('CRITICAL: Firebase Auth PERMISSION_DENIED. Check service account IAM roles.');
      }
    }

    // Test Firestore
    try {
      // Try to get a document from 'users' to verify permissions
      const snapshot = await db.collection('users').limit(1).get();
      console.log(`Successfully connected to Firestore. Found ${snapshot.size} users in 'users' collection.`);
      
      // Also test 'restaurants' collection
      const restSnapshot = await db.collection('restaurants').limit(1).get();
      console.log(`Successfully connected to Firestore. Found ${restSnapshot.size} restaurants in 'restaurants' collection.`);
    } catch (firestoreError: any) {
      console.error('Firestore test failed:', firestoreError.message);
      if (firestoreError.code === 7 || firestoreError.message.includes('permission denied')) {
        console.error('CRITICAL: Firestore PERMISSION_DENIED. Check service account IAM roles.');
        console.error('Ensure the service account has "Cloud Datastore User" or "Firebase Admin" roles.');
        console.error(`Attempted to access project "${firebaseConfig.projectId}" database "${databaseId}"`);
      }
    }
  } catch (error: any) {
    console.error('General Firebase Admin test failed:', error.message);
  }
}

async function checkOrdersTimeoutForRestaurant(restaurantId: string): Promise<{ checkedOrders: number; processedOrders: number }> {
  try {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    console.log(`[Order Timeout] Checking orders for authenticated restaurant ${restaurantId}`);
    
    const restDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restDoc.exists) {
      console.warn(`[Order Timeout] Restaurant ${restaurantId} not found.`);
      return { checkedOrders: 0, processedOrders: 0 };
    }
    
    const restaurantData = restDoc.data() || {};
    const pendingOrdersSnapshot = await restDoc.ref.collection('orders')
      .where('status', '==', 'pendente')
      .where('forma_pagamento', '==', 'pix')
      .where('pago', '==', false)
      .get();
      
    console.log(`[Order Timeout] Found ${pendingOrdersSnapshot.size} pending orders for authenticated restaurant ${restaurantId}`);
    
    if (pendingOrdersSnapshot.empty) {
      return { checkedOrders: 0, processedOrders: 0 };
    }
    
    let processedCount = 0;
    for (const orderDoc of pendingOrdersSnapshot.docs) {
      const orderData = orderDoc.data();
      
      // Check if it's an MP PIX order and if it's expired (5 minutes)
      if (orderData.mercadopago_payment_id && orderData.data_criacao && orderData.data_criacao <= fiveMinutesAgo) {
        console.log(`[Auto-Cancel] Cancelando pedido ${orderDoc.id} por inatividade no pagamento PIX.`);
        
        // 1. Cancel in Mercado Pago if possible
        if (restaurantData.mercadopago_access_token) {
          try {
            const client = new MercadoPagoConfig({ accessToken: restaurantData.mercadopago_access_token });
            const payment = new Payment(client);
            
            // Get current status
            const mpPayment = await payment.get({ id: orderData.mercadopago_payment_id });
            if (mpPayment.status === 'pending') {
              await payment.cancel({ id: orderData.mercadopago_payment_id });
              console.log(`[Auto-Cancel] Pagamento MP ${orderData.mercadopago_payment_id} anulado.`);
            } else if (mpPayment.status === 'approved') {
              console.log(`[Auto-Cancel] Pagamento MP ${orderData.mercadopago_payment_id} já aprovado, pulando.`);
              continue; // Don't cancel if it was just paid
            }
          } catch (mpErr: any) {
            console.error(`[Auto-Cancel] Erro ao anular PIX MP ${orderData.mercadopago_payment_id}:`, mpErr.message);
          }
        }

        // 2. Update order status
        await orderDoc.ref.update({
          status: 'cancelado',
          motivo_cancelamento: 'Cancelado automaticamente por inatividade no pagamento (5 min)',
          data_cancelamento: now.toISOString(),
          updated_at: now.toISOString()
        });

        // 3. Notify customer
        if (orderData.cliente_id) {
          const userDoc = await db.collection('users').doc(orderData.cliente_id).get();
          const userData = userDoc.data();
          if (userData?.fcmToken) {
            await sendPush(
              userData.fcmToken,
              "Pagamento Expirado ⏰",
              `Seu pedido #${orderDoc.id.slice(-6).toUpperCase()} foi cancelado porque o pagamento PIX não foi identificado em 5 minutos.`,
              orderDoc.id,
              "order_cancelled_timeout"
            );
          }
        }
        processedCount++;
      }
    }
    
    return { checkedOrders: pendingOrdersSnapshot.size, processedOrders: processedCount };
  } catch (error) {
    console.error(`[Order Timeout] Error checking order timeouts for restaurant ${restaurantId}:`, error);
    throw error;
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const port = 3000;

  app.use(express.json());

  // Configurar headers para evitar problemas com Cross-Origin-Opener-Policy (COOP)
  // Isso é necessário para que o Firebase Auth Popup funcione corretamente
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  // Diagnostic endpoint for Google Maps integration
  app.get('/api/google-maps-diagnostic', (req, res) => {
    const hasKey = !!(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY);
    res.json({
      googleApiKeyFound: hasKey,
      geocodingStatus: 'OK (Diagnostic Helper active)',
      placesStatus: 'OK (Diagnostic Helper active)',
      placesNewStatus: 'Not implemented',
      errors: []
    });
  });

  // Proxy endpoint for secure Nominatim Reverse Geocoding with fallback options
  app.get('/api/reverse-geocode', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude (lat) and Longitude (lon) are required' });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1&accept-language=pt-BR&email=lojadiscretaboutique@gmail.com`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      console.log(`[Reverse Geocode] Proxy request to Nominatim for lat=${lat}, lon=${lon}`);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'lojadiscretaboutique-applet/1.0 (lojadiscretaboutique@gmail.com)'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const bodyText = await response.text();
        console.error(`[Reverse Geocode] Nominatim response error. Status: ${response.status} ${response.statusText}`, bodyText);
        return res.status(response.status).json({
          error: 'Nominatim response error',
          status: response.status,
          statusText: response.statusText,
          body: bodyText,
          url
        });
      }

      // Read as text first to handle potential malformed or non-JSON responses
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonErr: any) {
        console.error('[Reverse Geocode] Malformed JSON from Nominatim:', responseText);
        return res.status(502).json({
          error: 'Malformed JSON response from Nominatim',
          rawResponse: responseText,
          url
        });
      }

      return res.json(data);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('[Reverse Geocode] Error in reverse geocoding proxy:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });
      return res.status(500).json({
        error: 'Global error in proxy reverse geocoding',
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        url
      });
    }
  });

  // Google Reverse Geocoding Cache & Parsing Helpers
  const googleGeocodingCache = new Map<string, any>();

  function parseGoogleAddressComponents(result: any) {
    if (!result || !result.address_components) {
      return {
        rua: '',
        numero: '',
        bairro: '',
        cidade: '',
        estado: '',
        estadoSigla: '',
        cep: '',
        pais: ''
      };
    }

    const components = result.address_components;

    const findComponent = (types: string[]) => {
      for (const type of types) {
        const comp = components.find((c: any) => c.types.includes(type));
        if (comp) return comp;
      }
      return null;
    };

    // Rua: Priority is route
    const ruaComp = findComponent(['route']);
    const rua = ruaComp ? ruaComp.long_name : '';

    // Número: Priority is street_number
    const numeroComp = findComponent(['street_number']);
    const numero = numeroComp ? numeroComp.long_name : '';

    // Bairro: Try sublocality_level_1, sublocality, neighborhood, administrative_area_level_4, administrative_area_level_3, political
    const bairroComp = findComponent([
      'sublocality_level_1',
      'sublocality',
      'neighborhood',
      'administrative_area_level_4',
      'administrative_area_level_3',
      'political'
    ]);
    const bairro = bairroComp ? bairroComp.long_name : '';

    // Cidade: Priority: administrative_area_level_2, locality
    const cidadeComp = findComponent(['administrative_area_level_2', 'locality']);
    const cidade = cidadeComp ? cidadeComp.long_name : '';

    // Estado: administrative_area_level_1 (use long_name for estado and short_name for estadoSigla)
    const estadoComp = findComponent(['administrative_area_level_1']);
    const estado = estadoComp ? estadoComp.long_name : '';
    const estadoSigla = estadoComp ? estadoComp.short_name : '';

    // CEP: postal_code
    const cepComp = findComponent(['postal_code']);
    const cep = cepComp ? cepComp.long_name : '';

    // País: country
    const paisComp = findComponent(['country']);
    const pais = paisComp ? paisComp.long_name : '';

    return {
      rua,
      numero,
      bairro,
      cidade,
      estado,
      estadoSigla,
      cep,
      pais
    };
  }

  // Mandatory functions
  function normalizeText(value: any): string {
    if (value === null || value === undefined) return '';
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function cleanInvalidAddressValue(value: any): string {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    const lower = str.toLowerCase();
    const invalidValues = [
      's/n', 'sem numero', 'sem número', 'sem bairro', 'não informado', 'nao informado',
      'undefined', 'null', 'n/a', 'na', ''
    ];
    if (invalidValues.includes(lower)) {
      return '';
    }
    return str;
  }

  function getConfidenceLevel(score: number): 'alta' | 'média' | 'baixa' {
    if (score >= 70) return 'alta';
    if (score >= 50) return 'média';
    return 'baixa';
  }

  function buildAddressConfidenceScore(candidate: any, baseAddress: any, originalGps: { lat: number, lng: number }): number {
    let score = 0;
    const base = baseAddress || {};

    const candRua = normalizeText(candidate.rua || '');
    const baseRua = normalizeText(base.rua || '');
    if (candRua && baseRua && (candRua.includes(baseRua) || baseRua.includes(candRua))) {
      score += 30;
    }

    const candCidade = normalizeText(candidate.cidade || '');
    const baseCidade = normalizeText(base.cidade || '');
    if (candCidade && baseCidade && candCidade === baseCidade) {
      score += 25;
    }

    const candEstado = normalizeText(candidate.estado || '');
    const baseEstado = normalizeText(base.estado || '');
    const candEstadoSigla = normalizeText(candidate.estadoSigla || '');
    const baseEstadoSigla = normalizeText(base.estadoSigla || '');
    if (
      (candEstado && baseEstado && candEstado === baseEstado) ||
      (candEstadoSigla && baseEstadoSigla && candEstadoSigla === baseEstadoSigla) ||
      (candEstado && baseEstadoSigla && candEstado === baseEstadoSigla) ||
      (candEstadoSigla && baseEstado && candEstadoSigla === baseEstado)
    ) {
      score += 20;
    }

    if (candidate.latitude !== undefined && candidate.longitude !== undefined) {
      const dist = calculateDistanceMeters(originalGps.lat, originalGps.lng, candidate.latitude, candidate.longitude);
      if (dist <= 80) {
        score += 15;
      }
    }

    if (cleanInvalidAddressValue(candidate.numero)) {
      score += 10;
    }

    if (cleanInvalidAddressValue(candidate.bairro)) {
      score += 10;
    }

    return score;
  }

  function selectBestAddressCandidate(candidates: any[], originalGps: { lat: number, lng: number, baseAddress?: any }) {
    if (!candidates || candidates.length === 0) return null;
    const base = originalGps.baseAddress || {};
    let bestCandidate = null;
    let highestScore = -1;

    for (const cand of candidates) {
      const score = buildAddressConfidenceScore(cand, base, originalGps);
      cand.confidenceScore = score;
      cand.confidenceLevel = getConfidenceLevel(score);
      if (score > highestScore) {
        highestScore = score;
        bestCandidate = cand;
      }
    }
    return bestCandidate;
  }

  app.get('/api/reverse-geocode-google', async (req, res) => {
    const { lat, lng, accuracy } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude (lat) e Longitude (lng) são obrigatórias.' });
    }

    const latNum = parseFloat(lat as string);
    const lngNum = parseFloat(lng as string);
    const accuracyNum = accuracy ? parseFloat(accuracy as string) : null;

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'Valores numéricos de latitude e longitude inválidos.' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'A chave GOOGLE_MAPS_API_KEY não está configurada no backend.' });
    }

    // Simple cache by lat & lng rounded to 4 decimal places
    const cacheKey = `${latNum.toFixed(4)},${lngNum.toFixed(4)}`;
    if (googleGeocodingCache.has(cacheKey)) {
      console.log(`[Google Geocode] Serving cached result for ${cacheKey}`);
      const cachedData = googleGeocodingCache.get(cacheKey);
      return res.json({
        ...cachedData,
        accuracy: accuracyNum
      });
    }

    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&language=pt-BR&region=br&key=${apiKey}`;

    try {
      console.log(`[Google Geocode - Request URL]: ${url.replace(apiKey, 'AIzaSy_MASKED_API_KEY')}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Google Geocoding request failed with status: ${response.status}`);
      }

      const data = await response.json();
      console.log('[Google Geocode - Google Maps Response]:', JSON.stringify(data, null, 2));
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const topResult = data.results[0];
        const parsed = parseGoogleAddressComponents(topResult);

        const payload = {
          provider: 'google',
          formattedAddress: topResult.formatted_address || '',
          rua: parsed.rua,
          numero: parsed.numero,
          bairro: parsed.bairro,
          cidade: parsed.cidade,
          estado: parsed.estado,
          estadoSigla: parsed.estadoSigla,
          cep: parsed.cep,
          pais: parsed.pais,
          latitude: latNum,
          longitude: lngNum,
          placeId: topResult.place_id || '',
          accuracy: accuracyNum
        };

        googleGeocodingCache.set(cacheKey, payload);
        return res.json(payload);
      } else {
        console.warn(`[Google Geocode] Google Geocoding returned non-OK status: ${data.status}`);
        throw new Error(`Google Geocoding returned status: ${data.status}`);
      }
    } catch (err: any) {
      console.error('[Google Geocode] Error, falling back to Nominatim:', err.message);

      // Fallback: Use nominatim
      try {
        const fallbackUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}&addressdetails=1&accept-language=pt-BR&email=lojadiscretaboutique@gmail.com`;
        console.log(`[Google Geocode Fallback] Fetching Nominatim: ${fallbackUrl}`);
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'lojadiscretaboutique-applet/1.0 (lojadiscretaboutique@gmail.com)'
          }
        });

        if (fallbackResponse.ok) {
          const nominatimData = await fallbackResponse.json();
          const address = nominatimData.address || {};

          const payload = {
            provider: 'nominatim_fallback',
            formattedAddress: nominatimData.display_name || '',
            rua: address.road || address.street || '',
            numero: address.house_number || '',
            bairro: address.suburb || address.neighbourhood || address.quarter || '',
            cidade: address.city || address.town || address.village || '',
            estado: address.state || '',
            estadoSigla: '',
            cep: address.postcode || '',
            pais: address.country || '',
            latitude: latNum,
            longitude: lngNum,
            placeId: nominatimData.place_id ? String(nominatimData.place_id) : '',
            accuracy: accuracyNum
          };

          return res.json(payload);
        }
      } catch (nominatimErr: any) {
        console.error('[Google Geocode Fallback] Nominatim fallback failed:', nominatimErr.message);
      }

      // Ultimate fallback preserving lat/lng
      return res.json({
        provider: 'error_fallback',
        formattedAddress: '',
        rua: '',
        numero: '',
        bairro: '',
        cidade: '',
        estado: '',
        estadoSigla: '',
        cep: '',
        pais: '',
        latitude: latNum,
        longitude: lngNum,
        placeId: '',
        accuracy: accuracyNum,
        error: err.message || 'Geocall failed'
      });
    }
  });

  app.post('/api/geocode', async (req, res) => {
    const { rua, numero, bairro, cidade, estado } = req.body;
    
    if (!rua || !cidade || !estado) {
      return res.status(400).json({ error: 'Rua, Cidade e Estado são obrigatórios para geocodificação.' });
    }

    const addressQuery = `${rua}, ${numero ? numero : ''}, ${bairro ? bairro : ''}, ${cidade}, ${estado}, Brasil`;
    
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (apiKey) {
      try {
        const encodedAddress = encodeURIComponent(addressQuery);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&language=pt-BR&region=br&key=${apiKey}`;
        console.log(`[Google Forward Geocode] Address query to Google: ${addressQuery}`);
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'OK' && data.results && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            console.log(`[Google Forward Geocode] Found coords:`, loc);
            return res.json({
              latitude: loc.lat,
              longitude: loc.lng,
              provider: 'google'
            });
          } else {
            console.warn(`[Google Forward Geocode] Status not OK: ${data.status}`);
          }
        }
      } catch (err) {
        console.error(`[Google Forward Geocode] Failed error:`, err);
      }
    }

    // Fallback: OSM Nominatim geocoding (No api key required)
    try {
      const encodedAddress = encodeURIComponent(addressQuery);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&accept-language=pt-BR`;
      console.log(`[OSM Forward Geocode] Address query to Nominatim: ${addressQuery}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'qFomeaiApp/1.0 (lojadiscretaboutique@gmail.com)'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const first = data[0];
          console.log(`[OSM Forward Geocode] Found coords:`, first);
          return res.json({
            latitude: parseFloat(first.lat),
            longitude: parseFloat(first.lon),
            provider: 'nominatim'
          });
        }
      }
    } catch (err) {
      console.error(`[OSM Forward Geocode] Failed too:`, err);
    }

    // Secondary Fallback: simpler broad query "Bairro, Cidade, Estado, Brasil" or "Cidade, Estado, Brasil"
    try {
      const simpleQuery = `${bairro ? bairro + ', ' : ''}${cidade}, ${estado}, Brasil`;
      const encodedSimple = encodeURIComponent(simpleQuery);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedSimple}&limit=1&accept-language=pt-BR`;
      console.log(`[Simple Forward Geocode] Attempting broader search: ${simpleQuery}`);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'qFomeaiApp/1.0 (lojadiscretaboutique@gmail.com)'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const first = data[0];
          console.log(`[Simple Forward Geocode] Found coords:`, first);
          return res.json({
            latitude: parseFloat(first.lat),
            longitude: parseFloat(first.lon),
            provider: 'nominatim-simple'
          });
        }
      }
    } catch (err) {
      console.error(`[Simple Forward Geocode] Broad geocoding query failed:`, err);
    }

    return res.status(404).json({ error: 'Não foi possível obter coordenadas para este endereço.' });
  });

  // Cache for full address from GPS (4 decimal places rounded latitude and longitude)
  const addressFromGpsCache = new Map<string, any>();

  app.post('/api/address-from-gps', async (req, res) => {
    const { latitude, longitude, accuracy } = req.body;
    console.log('[Address GPS API] Received request:', { latitude, longitude, accuracy });

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude e Longitude são obrigatórias.' });
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const accuracyNum = accuracy ? parseFloat(accuracy) : null;

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'Latitude e Longitude devem ser valores numéricos válidos.' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
        console.error('[Address GPS API] GOOGLE_MAPS_API_KEY encontrada: NÃO');
        return res.status(500).json({ error: 'Chave Google Maps não configurada no servidor.' });
    }
    console.log('[Address GPS API] GOOGLE_MAPS_API_KEY encontrada: SIM');
    
    const cacheKey = `${latNum.toFixed(4)},${lngNum.toFixed(4)}`;

    if (addressFromGpsCache.has(cacheKey)) {
      console.log(`[Address GPS API] Serving cached result for coordinate round key: ${cacheKey}`);
      return res.json(addressFromGpsCache.get(cacheKey));
    }

    if (!apiKey) {
      console.warn('[Address GPS API] GOOGLE_MAPS_API_KEY is not configured. Falling back to Nominatim (OpenStreetMap)...');
      try {
        const fallbackUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}&addressdetails=1&accept-language=pt-BR&email=lojadiscretaboutique@gmail.com`;
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'lojadiscretaboutique-applet/1.0 (lojadiscretaboutique@gmail.com)'
          }
        });

        if (fallbackResponse.ok) {
          const nominatimData = await fallbackResponse.json();
          const address = nominatimData.address || {};

          const payload = {
            rua: address.road || address.street || address.pedestrian || '',
            numero: address.house_number || '',
            numeroSugerido: address.house_number ? false : true,
            bairro: address.suburb || address.neighbourhood || address.quarter || address.city_district || address.residential || address.village || address.town || '',
            bairroSugerido: false,
            cidade: address.city || address.town || address.village || address.municipality || '',
            estado: address.state || '',
            estadoSigla: '',
            cep: address.postcode || '',
            pais: address.country || 'Brasil',
            latitude: latNum,
            longitude: lngNum,
            accuracy: accuracyNum,
            provider: 'nominatim_fallback',
            source: 'gps-nominatim',
            placeId: nominatimData.place_id ? String(nominatimData.place_id) : '',
            formattedAddress: nominatimData.display_name || '',
            addressConfidenceScore: 70,
            addressConfidenceLevel: 'AVERAGE'
          };

          addressFromGpsCache.set(cacheKey, payload);
          return res.json(payload);
        }
      } catch (nominatimErr: any) {
        console.error('[Address GPS API Fallback] Nominatim callback failed:', nominatimErr.message);
      }

      // Ultimate fallback
      return res.json({
        rua: '',
        numero: '',
        numeroSugerido: false,
        bairro: '',
        bairroSugerido: false,
        cidade: '',
        estado: '',
        estadoSigla: '',
        cep: '',
        pais: '',
        latitude: latNum,
        longitude: lngNum,
        accuracy: accuracyNum,
        provider: 'ultimate_fallback',
        source: 'gps-none',
        placeId: '',
        formattedAddress: '',
        addressConfidenceScore: 0,
        addressConfidenceLevel: 'LOW'
      });
    }

    try {
      // 1. Google Reverse Geocoding
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latNum},${lngNum}&language=pt-BR&region=br&key=${apiKey}`;
      console.log(`[Address GPS API] Querying Reverse Geocoding`);
      
      const geocodeRes = await fetch(geocodeUrl);
      const geocodeData = await geocodeRes.json();
      
      if (!geocodeRes.ok || geocodeData.status !== 'OK') {
        console.error(`[Address GPS API] Geocoding falhou. Status: ${geocodeData.status}, Message: ${geocodeData.error_message}, Body:`, JSON.stringify(geocodeData));
        throw new Error(`Google Geocoding failed with status: ${geocodeData.status}`);
      }

      // Priority list: street_address, premise, subpremise, route, plus_code, geocode
      const priorityTypes = ['street_address', 'premise', 'subpremise', 'route', 'plus_code', 'geocode'];
      let selectedResult = null;
      for (const type of priorityTypes) {
        selectedResult = geocodeData.results.find((r: any) => r.types.includes(type));
        if (selectedResult) break;
      }
      if (!selectedResult) {
        selectedResult = geocodeData.results[0];
      }

      const baseAddress = parseGoogleAddressComponents(selectedResult);
      // Ensure baseline coordinate properties
      const basePayload = {
        ...baseAddress,
        formattedAddress: selectedResult.formatted_address || '',
        placeId: selectedResult.place_id || '',
        latitude: latNum,
        longitude: lngNum
      };

      const isNumeroMissing = !cleanInvalidAddressValue(basePayload.numero);
      const isBairroMissing = !cleanInvalidAddressValue(basePayload.bairro);

      let nearbyResults: any[] = [];
      let textSearchResults: any[] = [];

      // 2. Google Places Nearby Search (Se faltar bairro ou número)
      if (isNumeroMissing || isBairroMissing) {
        const radii = [80, 150, 300];
        for (const radius of radii) {
          const nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latNum},${lngNum}&radius=${radius}&language=pt-BR&key=${apiKey}`;
          console.log(`[Address GPS API] Nearby Search query: ${nearbyUrl.replace(apiKey, 'AIzaSy_MASKED')}`);
          try {
            const nearbyRes = await fetch(nearbyUrl);
            if (nearbyRes.ok) {
              const ndata = await nearbyRes.json();
              if (ndata.status === 'OK' && ndata.results && ndata.results.length > 0) {
                nearbyResults = ndata.results;
                break;
              }
            }
          } catch (err) {
            console.error(`[Address GPS API] Nearby search error at radius ${radius}:`, err);
          }
        }
      }

      // 3. Google Places Text Search
      if (basePayload.rua || basePayload.cidade || basePayload.estado) {
        const queryText = `${basePayload.rua || ''}, ${basePayload.cidade || ''}, ${basePayload.estado || ''}, Brasil`.trim().replace(/^,\s*/, '').replace(/,\s*$/, '');
        const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(queryText)}&location=${latNum},${lngNum}&radius=300&language=pt-BR&key=${apiKey}`;
        console.log(`[Address GPS API] Text Search query: ${textSearchUrl.replace(apiKey, 'AIzaSy_MASKED')}`);
        try {
          const textRes = await fetch(textSearchUrl);
          if (textRes.ok) {
            const tdata = await textRes.json();
            if (tdata.status === 'OK' && tdata.results) {
              textSearchResults = tdata.results;
            }
          }
        } catch (err) {
          console.error('[Address GPS API] Text Search error:', err);
        }

        const fAddress = basePayload.formattedAddress;
        if (fAddress && fAddress !== queryText) {
          const textSearchUrl2 = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(fAddress)}&location=${latNum},${lngNum}&radius=300&language=pt-BR&key=${apiKey}`;
          try {
            const textRes2 = await fetch(textSearchUrl2);
            if (textRes2.ok) {
              const tdata2 = await textRes2.json();
              if (tdata2.status === 'OK' && tdata2.results) {
                textSearchResults = [...textSearchResults, ...tdata2.results];
              }
            }
          } catch (err) {
            console.error('[Address GPS API] Text Search formattedAddress error:', err);
          }
        }
      }

      // Deduplicate and filter candidates top 3 closest
      const rawCandidates: any[] = [];
      const placeIdsSeen = new Set<string>();

      const addRawCandidate = (p: any) => {
        if (p && p.place_id && !placeIdsSeen.has(p.place_id)) {
          placeIdsSeen.add(p.place_id);
          let dist = Infinity;
          if (p.geometry && p.geometry.location) {
            dist = calculateDistanceMeters(latNum, lngNum, p.geometry.location.lat, p.geometry.location.lng);
          }
          rawCandidates.push({
            place_id: p.place_id,
            distance: dist,
            location: p.geometry?.location
          });
        }
      };

      nearbyResults.forEach(addRawCandidate);
      textSearchResults.forEach(addRawCandidate);

      rawCandidates.sort((a, b) => a.distance - b.distance);
      const topCandidatesToFetch = rawCandidates.slice(0, 3);

      // 4. Place Details
      const detailedCandidates: any[] = [];
      for (const cand of topCandidatesToFetch) {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${cand.place_id}&fields=address_component,formatted_address,geometry&language=pt-BR&key=${apiKey}`;
        try {
          const detailsRes = await fetch(detailsUrl);
          if (detailsRes.ok) {
            const dtData = await detailsRes.json();
            if (dtData.status === 'OK' && dtData.result) {
              const parsedComp = parseGoogleAddressComponents(dtData.result);
              detailedCandidates.push({
                placeId: cand.place_id,
                rua: parsedComp.rua,
                numero: parsedComp.numero,
                bairro: parsedComp.bairro,
                cidade: parsedComp.cidade,
                estado: parsedComp.estado,
                estadoSigla: parsedComp.estadoSigla,
                cep: parsedComp.cep,
                pais: parsedComp.pais,
                formattedAddress: dtData.result.formatted_address || '',
                latitude: dtData.result.geometry?.location?.lat || cand.location?.lat,
                longitude: dtData.result.geometry?.location?.lng || cand.location?.lng,
                distance: cand.distance
              });
            }
          }
        } catch (err) {
          console.error(`[Address GPS API] Details details fetch error for ${cand.place_id}:`, err);
        }
      }

      // Sort detailed candidates by proximity
      detailedCandidates.sort((a, b) => a.distance - b.distance);

      // 5. selectBestAddressCandidate
      const bestCandidate = selectBestAddressCandidate(detailedCandidates, { lat: latNum, lng: lngNum, baseAddress: basePayload });

      // Build best probable address properties
      const finalRua = cleanInvalidAddressValue(basePayload.rua) || cleanInvalidAddressValue(bestCandidate?.rua) || '';
      const finalCidade = cleanInvalidAddressValue(basePayload.cidade) || cleanInvalidAddressValue(bestCandidate?.cidade) || '';
      const finalEstado = cleanInvalidAddressValue(basePayload.estado) || cleanInvalidAddressValue(bestCandidate?.estado) || '';
      const finalEstadoSigla = cleanInvalidAddressValue(basePayload.estadoSigla) || cleanInvalidAddressValue(bestCandidate?.estadoSigla) || '';
      const finalCep = cleanInvalidAddressValue(basePayload.cep) || cleanInvalidAddressValue(bestCandidate?.cep) || '';
      const finalPais = cleanInvalidAddressValue(basePayload.pais) || cleanInvalidAddressValue(bestCandidate?.pais) || 'Brasil';
      const finalPlaceId = basePayload.placeId || bestCandidate?.placeId || '';
      const finalFormatted = basePayload.formattedAddress || bestCandidate?.formattedAddress || '';

      // Determine Número
      let finalNumero = '';
      let numeroSugerido = false;
      if (cleanInvalidAddressValue(basePayload.numero)) {
        finalNumero = cleanInvalidAddressValue(basePayload.numero);
        numeroSugerido = false;
      } else if (bestCandidate && cleanInvalidAddressValue(bestCandidate.numero)) {
        finalNumero = cleanInvalidAddressValue(bestCandidate.numero);
        numeroSugerido = true;
      } else {
        const closestWithNum = detailedCandidates.find(c => cleanInvalidAddressValue(c.numero));
        if (closestWithNum) {
          finalNumero = cleanInvalidAddressValue(closestWithNum.numero);
          numeroSugerido = true;
        }
      }

      // Determine Bairro
      let finalBairro = '';
      let bairroSugerido = false;
      if (cleanInvalidAddressValue(basePayload.bairro)) {
        finalBairro = cleanInvalidAddressValue(basePayload.bairro);
        bairroSugerido = false;
      } else if (bestCandidate && cleanInvalidAddressValue(bestCandidate.bairro)) {
        finalBairro = cleanInvalidAddressValue(bestCandidate.bairro);
        bairroSugerido = true;
      } else {
        const closestWithBairro = detailedCandidates.find(c => cleanInvalidAddressValue(c.bairro));
        if (closestWithBairro) {
          finalBairro = cleanInvalidAddressValue(closestWithBairro.bairro);
          bairroSugerido = true;
        }
      }

      const needsManualNumberConfirmation = !cleanInvalidAddressValue(finalNumero);
      const needsManualNeighborhoodConfirmation = !cleanInvalidAddressValue(finalBairro);

      const assembledAddress = {
        rua: finalRua,
        numero: finalNumero,
        numeroSugerido,
        needsManualNumberConfirmation,
        bairro: finalBairro,
        bairroSugerido,
        needsManualNeighborhoodConfirmation,
        cidade: finalCidade,
        estado: finalEstado,
        estadoSigla: finalEstadoSigla,
        cep: finalCep,
        pais: finalPais,
        latitude: latNum,
        longitude: lngNum,
        accuracy: accuracyNum,
        provider: 'google',
        source: 'gps-google-full',
        placeId: finalPlaceId,
        formattedAddress: finalFormatted
      };

      // Score assembled address against reverse geocoded baseline
      const finalScore = buildAddressConfidenceScore(assembledAddress, basePayload, { lat: latNum, lng: lngNum });
      const finalLevel = getConfidenceLevel(finalScore);

      const responsePayload = {
        ...assembledAddress,
        addressConfidenceScore: finalScore,
        addressConfidenceLevel: finalLevel
      };

      addressFromGpsCache.set(cacheKey, responsePayload);
      return res.json(responsePayload);

    } catch (err: any) {
      console.error('[Address GPS API] Core failure processing coordinates. Falling back to Nominatim (OpenStreetMap)...', err);
      try {
        const fallbackUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latNum}&lon=${lngNum}&addressdetails=1&accept-language=pt-BR&email=lojadiscretaboutique@gmail.com`;
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'lojadiscretaboutique-applet/1.0 (lojadiscretaboutique@gmail.com)'
          }
        });

        if (fallbackResponse.ok) {
          const nominatimData = await fallbackResponse.json();
          const address = nominatimData.address || {};

          const payload = {
            rua: address.road || address.street || address.pedestrian || '',
            numero: address.house_number || '',
            numeroSugerido: address.house_number ? false : true,
            bairro: address.suburb || address.neighbourhood || address.quarter || address.city_district || address.residential || address.village || address.town || '',
            bairroSugerido: false,
            cidade: address.city || address.town || address.village || address.municipality || '',
            estado: address.state || '',
            estadoSigla: '',
            cep: address.postcode || '',
            pais: address.country || 'Brasil',
            latitude: latNum,
            longitude: lngNum,
            accuracy: accuracyNum,
            provider: 'nominatim_fallback',
            source: 'gps-nominatim',
            placeId: nominatimData.place_id ? String(nominatimData.place_id) : '',
            formattedAddress: nominatimData.display_name || '',
            addressConfidenceScore: 70,
            addressConfidenceLevel: 'AVERAGE'
          };

          addressFromGpsCache.set(cacheKey, payload);
          return res.json(payload);
        }
      } catch (nominatimErr: any) {
        console.error('[Address GPS API Fallback] Nominatim callback failed during core catch:', nominatimErr.message);
      }

      // Ultimate fallback
      return res.json({
        rua: '',
        numero: '',
        numeroSugerido: false,
        bairro: '',
        bairroSugerido: false,
        cidade: '',
        estado: '',
        estadoSigla: '',
        cep: '',
        pais: '',
        latitude: latNum,
        longitude: lngNum,
        accuracy: accuracyNum,
        provider: 'ultimate_fallback',
        source: 'gps-none',
        placeId: '',
        formattedAddress: '',
        addressConfidenceScore: 0,
        addressConfidenceLevel: 'LOW'
      });
    }
  });

  // Cache for address intelligence
  const addressIntelligenceCache = new Map<string, any>();

  app.post('/api/address-intelligence', async (req, res) => {
    const { latitude, longitude, rua, cidade, estado, pais, accuracy } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude e Longitude são obrigatórias.' });
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const accuracyNum = accuracy ? parseFloat(accuracy) : null;

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ error: 'Latitude e Longitude devem ser valores numéricos válidos.' });
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'A chave GOOGLE_MAPS_API_KEY não está configurada no backend.' });
    }

    // Normalized text function
    const normalizeText = (value: string): string => {
      if (!value) return '';
      return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove accents
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^A-Z0-9\s]/g, '');
    };

    // Cache lookup: 4 decimal places
    const cacheKey = `${latNum.toFixed(4)},${lngNum.toFixed(4)},${normalizeText(rua || '')}`;
    if (addressIntelligenceCache.has(cacheKey)) {
      console.log(`[Address Intelligence] Serving cached result for keys: ${cacheKey}`);
      return res.json(addressIntelligenceCache.get(cacheKey));
    }

    // Calculate distance in meters using Haversine
    const calculateDistanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371000; // metres
      const phi1 = lat1 * Math.PI / 180;
      const phi2 = lat2 * Math.PI / 180;
      const deltaPhi = (lat2 - lat1) * Math.PI / 180;
      const deltaLambda = (lng2 - lng1) * Math.PI / 180;

      const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                Math.cos(phi1) * Math.cos(phi2) *
                Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return R * c;
    };

    const cleanField = (val: any): string => {
      if (!val) return '';
      const str = String(val).trim();
      const lower = str.toLowerCase();
      
      const invalidValues = [
        's/n', 'sem numero', 'sem número', 'sem bairro', 'não informado', 'nao informado',
        'undefined', 'null', 'n/a', 'na'
      ];
      
      if (invalidValues.includes(lower)) {
        return '';
      }
      return str;
    };

    // Construct Text Query for Places API
    const queryParts = [rua, cidade, estado, pais || 'Brasil'].filter(Boolean);
    const query = queryParts.join(', ');

    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${latNum},${lngNum}&radius=500&language=pt-BR&key=${apiKey}`;

    console.log(`[Address Intelligence] Querying text search: "${query}"`);

    try {
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) {
        throw new Error(`Google Places Text Search failed with status: ${searchRes.status}`);
      }

      const searchData = await searchRes.json();
      console.log('Resposta Google Places:', JSON.stringify(searchData, null, 2));

      if (searchData.status !== 'OK' || !searchData.results || searchData.results.length === 0) {
        console.warn(`[Address Intelligence] No places found for query: "${query}"`);
        const resultPayload = {
          provider: 'google_intelligence_no_results',
          rua: cleanField(rua),
          cidade: cleanField(cidade),
          estado: cleanField(estado),
          pais: cleanField(pais || 'Brasil'),
          latitude: latNum,
          longitude: lngNum,
          accuracy: accuracyNum,
          score: 0,
          confidenceLevel: 'low'
        };
        addressIntelligenceCache.set(cacheKey, resultPayload);
        return res.json(resultPayload);
      }

      // Find closest result to original coordinates
      let selectedPlace = searchData.results[0];
      let minDistance = Infinity;

      for (const place of searchData.results) {
        if (place.geometry && place.geometry.location) {
          const dist = calculateDistanceMeters(latNum, lngNum, place.geometry.location.lat, place.geometry.location.lng);
          if (dist < minDistance) {
            minDistance = dist;
            selectedPlace = place;
          }
        }
      }

      console.log("Resultado escolhido:", JSON.stringify(selectedPlace, null, 2));

      // Fetch Place Details for best result to extract address components
      let detailsResult = null;
      if (selectedPlace && selectedPlace.place_id) {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${selectedPlace.place_id}&fields=address_component,formatted_address,geometry&language=pt-BR&key=${apiKey}`;
        const detailsResponse = await fetch(detailsUrl);
        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json();
          if (detailsData.status === 'OK') {
            detailsResult = detailsData.result;
          }
        }
      }

      // Parse fields from detailsResult or from selectedPlace
      const parsedComponents = parseGoogleAddressComponents(detailsResult || selectedPlace);
      
      const resRua = cleanField(parsedComponents.rua || selectedPlace.name || '');
      let resNumero = cleanField(parsedComponents.numero);
      let resBairro = cleanField(parsedComponents.bairro);
      const resCidade = cleanField(parsedComponents.cidade || cidade || '');
      const resEstado = cleanField(parsedComponents.estado || estado || '');
      const resEstadoSigla = cleanField(parsedComponents.estadoSigla);
      const resCep = cleanField(parsedComponents.cep);
      const resPais = cleanField(parsedComponents.pais || pais || 'Brasil');
      const formattedAddress = detailsResult?.formatted_address || selectedPlace.formatted_address || '';

      const destLat = detailsResult?.geometry?.location?.lat ?? selectedPlace.geometry?.location?.lat ?? latNum;
      const destLng = detailsResult?.geometry?.location?.lng ?? selectedPlace.geometry?.location?.lng ?? lngNum;

      const finalDistance = calculateDistanceMeters(latNum, lngNum, destLat, destLng);

      // Critério de proximidade
      // - até 80 metros: alta confiança;
      // - 81 a 150 metros: média confiança;
      // - acima de 150 metros: não usar número automaticamente.
      // Se o resultado estiver longe demais, não usar número nem bairro.
      if (finalDistance > 150) {
        resNumero = '';
        resBairro = '';
      }

      // Build confidence score
      let addressConfidenceScore = 0;
      const normInputRua = normalizeText(rua || '');
      const normParsedRua = normalizeText(resRua);
      const normInputCidade = normalizeText(cidade || '');
      const normParsedCidade = normalizeText(resCidade);
      const normInputEstado = normalizeText(estado || '');
      const normParsedEstado = normalizeText(resEstado);

      if (normInputRua && normParsedRua && (normInputRua === normParsedRua || normInputRua.includes(normParsedRua) || normParsedRua.includes(normInputRua))) {
        addressConfidenceScore += 30;
      }
      if (normInputCidade && normParsedCidade && normInputCidade === normParsedCidade) {
        addressConfidenceScore += 25;
      }
      if (normInputEstado && normParsedEstado && normInputEstado === normParsedEstado) {
        addressConfidenceScore += 20;
      }
      if (finalDistance <= 80) {
        addressConfidenceScore += 15;
      }
      if (resNumero) {
        addressConfidenceScore += 10;
      }
      if (resBairro) {
        addressConfidenceScore += 10;
      }

      let addressConfidenceLevel: 'high' | 'medium' | 'low' = 'low';
      if (addressConfidenceScore >= 70) {
        addressConfidenceLevel = 'high';
      } else if (addressConfidenceScore >= 50) {
        addressConfidenceLevel = 'medium';
      }

      // Adjust based on confidence score:
      // Se score < 50: não sobrescrever bairro/número
      if (addressConfidenceScore < 50) {
        resNumero = '';
        resBairro = '';
      }

      const finalAddress = {
        provider: 'google_places_intelligence',
        rua: resRua,
        numero: resNumero,
        bairro: resBairro,
        cidade: resCidade,
        estado: resEstado,
        estadoSigla: resEstadoSigla,
        cep: resCep,
        pais: resPais,
        latitude: destLat,
        longitude: destLng,
        accuracy: accuracyNum,
        placeId: detailsResult?.place_id || selectedPlace.place_id || '',
        formattedAddress,
        addressConfidenceScore,
        addressConfidenceLevel,
        distanceMeters: finalDistance
      };

      console.log("GPS:", latNum, lngNum, accuracyNum);
      console.log("Endereço base:", { latitude: latNum, longitude: lngNum, rua, cidade, estado, pais });
      console.log("Resposta Google Places:", JSON.stringify(detailsResult || selectedPlace, null, 2));
      console.log("Resultado escolhido:", JSON.stringify(selectedPlace, null, 2));
      console.log("Score:", addressConfidenceScore);
      console.log("Endereço final sugerido:", JSON.stringify(finalAddress, null, 2));

      addressIntelligenceCache.set(cacheKey, finalAddress);
      return res.json(finalAddress);

    } catch (error: any) {
      console.error('[Address Intelligence] Error in POST route:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  // WhatsApp Webhook Verification (GET)
  // Requisito: Retornar APENAS o challenge como texto puro se o token for válido
  app.get('/api/whatsapp/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WhatsApp] Webhook verificado com sucesso.');
      // Importante: Enviar apenas o challenge como texto puro, sem JSON ou HTML
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    } else {
      console.warn('[WhatsApp] Falha na verificação do webhook: Token incorreto ou modo inválido.');
      return res.status(403).send('Forbidden');
    }
  });

  // WhatsApp Webhook Message Handler (POST)
  // Requisito: Retornar 200 OK imediatamente e logar o body
  app.post('/api/whatsapp/webhook', (req, res) => {
    // Logar o body recebido conforme solicitado
    console.log('[WhatsApp] Webhook POST recebido:', JSON.stringify(req.body, null, 2));

    // Retornar status 200 imediatamente para a Meta (obrigatório para evitar retentativas)
    res.status(200).send('EVENT_RECEIVED');

    // Processar a lógica em segundo plano
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

      // Execução assíncrona para não travar o loop de eventos
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

  // API route for manual restaurant registration by admin
  app.post('/api/admin/register-restaurant', async (req, res) => {
    const { email, password, nome_proprietario, telefone, nome, slug, cpf_cnpj, endereco, ...rest } = req.body;
    
    try {
      // 1. Create Auth user
      const userRecord: UserRecord = await authAdmin.createUser({
        email,
        password,
        displayName: nome_proprietario,
      });

      const uid = userRecord.uid;

      // 2. Create user doc
      await db.collection('users').doc(uid).set({
        uid,
        nome: nome_proprietario,
        email,
        telefone,
        whatsapp: rest.whatsapp || '',
        instagram: rest.instagram || '',
        tipo_usuario: 'restaurant',
        restaurantId: uid,
        status_conta: 'aprovado',
        onboarding_completo: true,
        data_criacao: new Date().toISOString(),
        acceptedTerms: true,
        acceptedAt: FieldValue.serverTimestamp(),
        termsVersion: "1.0"
      });

      // 3. Create restaurant doc
      await db.collection('restaurants').doc(uid).set({
        id: uid,
        nome,
        slug,
        nome_fantasia: nome,
        nome_proprietario,
        cpf_cnpj,
        status_aprovacao: 'aprovado',
        status_operacao: 'fechado',
        data_criacao: new Date().toISOString(),
        tipo_entrega: 'ambos',
        tempo_max_aceite: 15,
        owner_name: nome_proprietario,
        owner_email: email,
        owner_phone: telefone,
        endereco,
        ...rest
      });

      res.json({ success: true, uid });
    } catch (error: any) {
      console.error("Error registering restaurant:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API route for user deletion by admin
  app.delete('/api/admin/users/:uid', async (req, res) => {
    const { uid } = req.params;
    try {
      // 1. Delete from Auth
      await authAdmin.deleteUser(uid);
      
      // 2. Delete from Firestore (users collection)
      await db.collection('users').doc(uid).delete();
      
      // 3. If it's a restaurant, delete from restaurants collection
      await db.collection('restaurants').doc(uid).delete();

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      if (error.message && error.message.includes('identitytoolkit.googleapis.com')) {
        return res.status(403).json({ 
          error: 'A API Identity Toolkit precisa ser ativada no Google Cloud Console para permitir a exclusão de usuários.',
          activationUrl: 'https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=54807670224'
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // API route for user update by admin
  app.patch('/api/admin/users/:uid', async (req, res) => {
    const { uid } = req.params;
    const { email, nome, telefone, tipo_usuario, status_conta } = req.body;
    try {
      // 1. Update Auth if email is provided
      if (email) {
        await authAdmin.updateUser(uid, { email });
      }
      
      // 2. Update Firestore
      const updates: any = {};
      if (email) updates.email = email;
      if (nome) updates.nome = nome;
      if (telefone) updates.telefone = telefone;
      if (tipo_usuario) updates.tipo_usuario = tipo_usuario;
      if (status_conta) updates.status_conta = status_conta;
      
      await db.collection('users').doc(uid).update(updates);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error updating user:", error);
      if (error.message && error.message.includes('identitytoolkit.googleapis.com')) {
        return res.status(403).json({ 
          error: 'A API Identity Toolkit precisa ser ativada no Google Cloud Console para permitir a atualização de usuários.',
          activationUrl: 'https://console.developers.google.com/apis/api/identitytoolkit.googleapis.com/overview?project=54807670224'
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // API route to send account activation email
  app.post('/api/auth/send-activation-email', async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    try {
      // 1. Generate Firebase verification link
      // Use actionCodeSettings to redirect back to the app if needed
      const host = req.headers['x-forwarded-host'] || req.get('host');
      const protocol = host?.includes('localhost') ? 'http' : 'https';
      
      const link = await authAdmin.generateEmailVerificationLink(email, {
        url: `${protocol}://${host}/profile`,
        handleCodeInApp: true
      });

      // 2. Send the email via Nodemailer
      const result = await sendActivationEmail(email, link);
      
      res.json({ success: true, message: 'Email de ativação enviado com sucesso' });
    } catch (error: any) {
      console.error('[Auth API] Erro ao processar email de ativação:', error);
      res.status(500).json({ error: error.message || 'Erro ao enviar email de ativação' });
    }
  });

  // Middleware to verify admin
  const verifyAdmin = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ error: 'Unauthorized: Token missing' });
    }

    try {
      console.log('Verifying token...');
      const decodedToken: DecodedIdToken = await authAdmin.verifyIdToken(idToken);
      console.log('Token verified. UID:', decodedToken.uid);
      
      console.log('Fetching user doc...');
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      console.log('User doc fetched. Exists:', userDoc.exists);
      
      const userData = userDoc.data();
      console.log('User data:', userData);

      if (userData && userData.tipo_usuario === 'admin') {
        req.user = decodedToken;
        next();
      } else {
        console.warn(`Forbidden: User ${decodedToken.uid} is not an admin. Type: ${userData?.tipo_usuario}`);
        res.status(403).json({ error: 'Forbidden: Admin access required' });
      }
    } catch (error: any) {
      console.error('Error verifying admin token:', error);
      res.status(401).json({ error: `Unauthorized: ${error.message}` });
    }
  };

  // Middleware to verify restaurant owner or admin
  const verifyRestaurant = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      return res.status(401).json({ error: 'Unauthorized: Token missing' });
    }

    try {
      const decodedToken = await authAdmin.verifyIdToken(idToken);
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (userData && (userData.tipo_usuario === 'restaurant' || userData.tipo_usuario === 'restaurante' || userData.tipo_usuario === 'admin')) {
        req.user = {
          ...decodedToken,
          restaurantId: userData.restaurantId || decodedToken.uid
        };
        next();
      } else {
        res.status(403).json({ error: 'Forbidden: Restaurant access required' });
      }
    } catch (error: any) {
      console.error('Error verifying restaurant token:', error);
      res.status(401).json({ error: `Unauthorized: ${error.message}` });
    }
  };
  
  // ==========================================
  // MÓDULO FINANCEIRO: CAIXA BACKEND ENDPOINTS
  // ==========================================

  // 1. ABERTURA DE CAIXA (Atômica)
  app.post('/api/restaurant/financeiro/caixa/open', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { openingBalance, openingBalanceCents, observation } = req.body || {};

      let cents = 0;
      if (typeof openingBalanceCents === 'number') {
        cents = Math.round(openingBalanceCents);
      } else if (typeof openingBalance === 'number') {
        cents = Math.round(openingBalance * 100);
      } else if (typeof openingBalance === 'string') {
        const clean = openingBalance.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents < 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor do saldo inicial deve ser um número inteiro positivo em centavos.'
        });
      }

      const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
      const activeCaixaRef = db.collection('restaurants').doc(restaurantId).collection('active_caixa').doc('current');

      const result = await db.runTransaction(async (transaction) => {
        const activeSnap = await transaction.get(activeCaixaRef);
        if (activeSnap.exists && activeSnap.data()?.status === 'OPEN') {
          const err: any = new Error('Já existe um caixa aberto para este restaurante.');
          err.code = 'CASH_REGISTER_ALREADY_OPEN';
          throw err;
        }

        const openQuery = await caixasRef.where('status', '==', 'OPEN').get();
        if (!openQuery.empty) {
          const err: any = new Error('Já existe um caixa aberto para este restaurante.');
          err.code = 'CASH_REGISTER_ALREADY_OPEN';
          throw err;
        }

        const newCaixaRef = caixasRef.doc();
        const now = new Date().toISOString();
        const userName = req.user.nome || req.user.name || req.user.email || 'Operador';

        const newCaixaData = {
          id: newCaixaRef.id,
          restaurantId,
          status: 'OPEN',
          openedAt: now,
          openedBy: userName,
          openedById: req.user.uid,
          openingBalance: cents,
          observation: typeof observation === 'string' ? observation.trim() : '',
          createdAt: now,
          updatedAt: now
        };

        transaction.set(newCaixaRef, newCaixaData);
        transaction.set(activeCaixaRef, {
          cashRegisterId: newCaixaRef.id,
          status: 'OPEN',
          openedAt: now,
          openedBy: userName,
          updatedAt: now
        });

        return newCaixaData;
      });

      return res.status(201).json({ success: true, caixa: result });
    } catch (error: any) {
      if (error.code === 'CASH_REGISTER_ALREADY_OPEN') {
        return res.status(409).json({ code: 'CASH_REGISTER_ALREADY_OPEN', error: error.message });
      }
      console.error('Error opening caixa:', error);
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao abrir caixa.' });
    }
  });

  // 2. FECHAMENTO DE CAIXA (Atômico)
  app.post('/api/restaurant/financeiro/caixa/close', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { countedValues, countedValuesInCents, observation } = req.body || {};

      const rawCounted: Record<string, any> = countedValuesInCents || countedValues || {};
      const parsedCountedCents: Record<string, number> = {};

      for (const [pmId, rawVal] of Object.entries(rawCounted)) {
        let valCents = 0;
        if (typeof rawVal === 'number') {
          valCents = Number.isInteger(rawVal) ? rawVal : Math.round(rawVal * 100);
        } else if (typeof rawVal === 'string') {
          const clean = rawVal.replace(/[^\d,-]/g, '').replace(',', '.');
          const num = parseFloat(clean);
          valCents = Math.round((isNaN(num) ? 0 : num) * 100);
        }
        if (isNaN(valCents) || valCents < 0) {
          return res.status(400).json({
            code: 'INVALID_AMOUNT',
            error: `O valor para a forma de pagamento "${pmId}" é inválido.`
          });
        }
        parsedCountedCents[pmId] = valCents;
      }

      const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
      const openCaixasSnap = await caixasRef.where('status', '==', 'OPEN').get();

      if (openCaixasSnap.empty) {
        return res.status(400).json({
          code: 'CASH_REGISTER_NOT_OPEN',
          error: 'Nenhum caixa aberto foi encontrado para realizar o fechamento.'
        });
      }

      const openCaixaDoc = openCaixasSnap.docs[0];
      const caixaId = openCaixaDoc.id;
      const caixaRef = caixasRef.doc(caixaId);
      const activeCaixaRef = db.collection('restaurants').doc(restaurantId).collection('active_caixa').doc('current');
      const restaurantDocRef = db.collection('restaurants').doc(restaurantId);

      const result = await db.runTransaction(async (transaction) => {
        const caixaSnap = await transaction.get(caixaRef);
        if (!caixaSnap.exists) {
          const err: any = new Error('Caixa não encontrado.');
          err.code = 'CASH_REGISTER_NOT_OPEN';
          throw err;
        }
        const caixaData = caixaSnap.data()!;
        if (caixaData.status !== 'OPEN') {
          const err: any = new Error('Este caixa já se encontra fechado.');
          err.code = 'CASH_REGISTER_ALREADY_CLOSED';
          throw err;
        }
        if (caixaData.restaurantId !== restaurantId) {
          const err: any = new Error('O caixa não pertence ao restaurante autenticado.');
          err.code = 'RESTAURANT_MISMATCH';
          throw err;
        }

        const movementsSnap = await transaction.get(caixaRef.collection('movimentacoes'));
        const restSnap = await transaction.get(restaurantDocRef);
        const rawFormasPagamento = restSnap.data()?.formas_pagamento || restSnap.data()?.payment_methods || [];
        const formasPagamento: any[] = Array.isArray(rawFormasPagamento)
          ? rawFormasPagamento
          : rawFormasPagamento && typeof rawFormasPagamento === 'object'
            ? Object.entries(rawFormasPagamento).map(([key, val]: [string, any]) => ({ id: key, ...(typeof val === 'object' ? val : { active: Boolean(val) }) }))
            : [];

        let rawOpening = caixaData.openingBalance || 0;
        let openingCents = Number.isInteger(rawOpening) ? rawOpening : Math.round(rawOpening * 100);

        let totalEntries = 0;
        let totalExits = 0;
        let totalSupplies = 0;
        let totalWithdrawals = 0;

        const pmExpected: Record<string, number> = {};
        pmExpected['dinheiro'] = openingCents;

        movementsSnap.forEach((mDoc) => {
          const m = mDoc.data();
          let amt = m.amount || 0;
          if (!Number.isInteger(amt)) amt = Math.round(amt * 100);
          const pmId = m.paymentMethodId || 'dinheiro';
          if (!pmExpected[pmId]) pmExpected[pmId] = 0;

          if (m.type === 'INCOME') {
            totalEntries += amt;
            pmExpected[pmId] += amt;
          } else if (m.type === 'EXPENSE') {
            totalExits += amt;
            pmExpected[pmId] -= amt;
          } else if (m.type === 'SUPPLY') {
            totalSupplies += amt;
            pmExpected[pmId] += amt;
          } else if (m.type === 'WITHDRAWAL') {
            totalWithdrawals += amt;
            pmExpected[pmId] -= amt;
          }
        });

        const expectedTotal = openingCents + totalEntries + totalSupplies - totalExits - totalWithdrawals;

        const allMethodIdsSet = new Set<string>();
        formasPagamento.forEach((p: any) => { if (p.id) allMethodIdsSet.add(p.id); });
        Object.keys(pmExpected).forEach((id) => allMethodIdsSet.add(id));
        Object.keys(parsedCountedCents).forEach((id) => allMethodIdsSet.add(id));
        if (openingCents > 0) allMethodIdsSet.add('dinheiro');

        const expectedByPaymentMethod: Record<string, number> = {};
        const countedByPaymentMethod: Record<string, number> = {};
        const differenceByPaymentMethod: Record<string, number> = {};
        const paymentSummary: Array<{
          paymentMethodId: string;
          paymentMethodName: string;
          expectedAmount: number;
          countedAmount: number;
          differenceAmount: number;
        }> = [];

        let totalCounted = 0;

        const getMethodLabel = (id: string): string => {
          const found = formasPagamento.find((p: any) => p.id === id);
          if (found?.label) return found.label;
          const fallback: Record<string, string> = {
            dinheiro: 'Dinheiro',
            pix: 'Pix',
            credito: 'Cartão de Crédito',
            debito: 'Cartão de Débito'
          };
          return fallback[id] || id;
        };

        allMethodIdsSet.forEach((pmId) => {
          const exp = pmExpected[pmId] || 0;
          const cnt = parsedCountedCents[pmId] ?? 0;
          const diff = cnt - exp;
          totalCounted += cnt;

          expectedByPaymentMethod[pmId] = exp;
          countedByPaymentMethod[pmId] = cnt;
          differenceByPaymentMethod[pmId] = diff;

          paymentSummary.push({
            paymentMethodId: pmId,
            paymentMethodName: getMethodLabel(pmId),
            expectedAmount: exp,
            countedAmount: cnt,
            differenceAmount: diff
          });
        });

        const totalDifference = totalCounted - expectedTotal;
        const now = new Date().toISOString();
        const userName = req.user.nome || req.user.name || req.user.email || 'Operador';

        let finalObs = caixaData.observation || '';
        if (typeof observation === 'string' && observation.trim()) {
          finalObs = finalObs
            ? `${finalObs}\n---\nFechamento: ${observation.trim()}`
            : `Fechamento: ${observation.trim()}`;
        }

        const updatePayload = {
          status: 'CLOSED',
          closedAt: now,
          closedBy: userName,
          closedById: req.user.uid,
          closingBalance: totalCounted,
          expectedTotal,
          countedTotal: totalCounted,
          totalDifference,
          totalEntries,
          totalExits,
          totalSupplies,
          totalWithdrawals,
          expectedByPaymentMethod,
          countedByPaymentMethod,
          differenceByPaymentMethod,
          paymentSummary,
          observation: finalObs,
          updatedAt: now
        };

        transaction.update(caixaRef, updatePayload);
        transaction.set(activeCaixaRef, {
          status: 'CLOSED',
          cashRegisterId: caixaId,
          closedAt: now,
          closedBy: userName,
          updatedAt: now
        });

        return {
          ...caixaData,
          ...updatePayload,
          id: caixaId
        };
      });

      return res.json({ success: true, caixa: result });
    } catch (error: any) {
      if (error.code) {
        return res.status(400).json({ code: error.code, error: error.message });
      }
      console.error('Error closing caixa:', error);
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao fechar caixa.' });
    }
  });

  // 3. MOVIMENTAÇÃO MANUAL DE CAIXA
  app.post('/api/restaurant/financeiro/caixa/movement', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { type, amount, amountCents, category, description, paymentMethodId, observation } = req.body || {};

      const allowedTypes = ['INCOME', 'EXPENSE', 'SUPPLY', 'WITHDRAWAL'];
      if (!type || !allowedTypes.includes(type)) {
        return res.status(400).json({
          code: 'INVALID_CASH_MOVEMENT',
          error: 'Tipo de movimentação inválido. Tipos permitidos: INCOME, EXPENSE, SUPPLY, WITHDRAWAL.'
        });
      }

      let cents = 0;
      if (typeof amountCents === 'number') {
        cents = Math.round(amountCents);
      } else if (typeof amount === 'number') {
        cents = Math.round(amount * 100);
      } else if (typeof amount === 'string') {
        const clean = amount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor da movimentação deve ser um número inteiro maior que zero (em centavos).'
        });
      }

      if (!category || typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({
          code: 'INVALID_CASH_MOVEMENT',
          error: 'A categoria da movimentação é obrigatória.'
        });
      }

      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({
          code: 'INVALID_CASH_MOVEMENT',
          error: 'A descrição da movimentação é obrigatória.'
        });
      }

      if (!paymentMethodId || typeof paymentMethodId !== 'string') {
        return res.status(400).json({
          code: 'INVALID_PAYMENT_METHOD',
          error: 'A forma de pagamento é obrigatória.'
        });
      }

      const restDoc = await db.collection('restaurants').doc(restaurantId).get();
      const rawFormasPagamento = restDoc.data()?.formas_pagamento || restDoc.data()?.payment_methods || [];
      const formasPagamento: any[] = Array.isArray(rawFormasPagamento)
        ? rawFormasPagamento
        : rawFormasPagamento && typeof rawFormasPagamento === 'object'
          ? Object.entries(rawFormasPagamento).map(([key, val]: [string, any]) => ({ id: key, ...(typeof val === 'object' ? val : { active: Boolean(val) }) }))
          : [];
      const validMethods = new Set(['dinheiro', 'pix', 'credito', 'debito']);
      formasPagamento.forEach((p: any) => { if (p.id) validMethods.add(p.id); });

      if (!validMethods.has(paymentMethodId)) {
        return res.status(400).json({
          code: 'INVALID_PAYMENT_METHOD',
          error: `A forma de pagamento "${paymentMethodId}" não está configurada para este restaurante.`
        });
      }

      const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
      const openCaixa = await requireOpenCashRegister(restaurantId);
      const cashRegisterId = openCaixa.id;

      const movementRef = caixasRef.doc(cashRegisterId).collection('movimentacoes').doc();
      const now = new Date().toISOString();
      const userName = req.user.nome || req.user.name || req.user.email || 'Operador';

      const movementDoc = {
        id: movementRef.id,
        restaurantId,
        cashRegisterId,
        type,
        category: category.trim(),
        description: description.trim(),
        amount: cents,
        paymentMethodId,
        createdAt: now,
        createdBy: userName,
        createdById: req.user.uid,
        createdByName: userName,
        observation: typeof observation === 'string' && observation.trim() ? observation.trim() : null,
        automatic: false,
        origin: 'MANUAL'
      };

      await movementRef.set(movementDoc);

      return res.status(201).json({ success: true, movement: movementDoc });
    } catch (error: any) {
      if (error.code === 'CASH_REGISTER_CLOSED') {
        return res.status(409).json({
          code: 'CASH_REGISTER_CLOSED',
          message: error.message,
          error: error.message
        });
      }
      console.error('Error creating cash movement:', error);
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao criar movimentação de caixa.' });
    }
  });

  // Helper para extrair formas de pagamento configuradas pelo restaurante
  function extractConfiguredPaymentMethods(restaurantData: any): Set<string> {
    const validMethods = new Set<string>();
    if (!restaurantData) return validMethods;

    const fp = restaurantData.formas_pagamento || restaurantData.payment_methods;
    if (!fp) return validMethods;

    if (Array.isArray(fp)) {
      fp.forEach((item: any) => {
        if (typeof item === 'string' && item.trim()) {
          validMethods.add(item.trim());
        } else if (item && typeof item === 'object' && item.id) {
          if (item.active !== false) {
            validMethods.add(String(item.id).trim());
          }
        }
      });
    } else if (typeof fp === 'object') {
      Object.entries(fp).forEach(([key, conf]: [string, any]) => {
        if (typeof conf === 'boolean') {
          if (conf) validMethods.add(key);
        } else if (conf && typeof conf === 'object') {
          const isActive = conf.active !== false && (
            conf.entrega || conf.retirada || conf.balcao || conf.consumoLocal || conf.active || Object.keys(conf).length === 0
          );
          if (isActive) {
            validMethods.add(key);
          }
        }
      });
    }

    return validMethods;
  }

  // ==========================================
  // PEDIDOS FINANCEIRO ENDPOINTS
  // ==========================================

  app.post('/api/restaurant/financeiro/pedidos/processar-pagamentos', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user?.restaurantId;
      if (!restaurantId) {
        return res.status(401).json({ error: 'Usuário não autenticado.', code: 'UNAUTHORIZED' });
      }

      await requireOpenCashRegister(restaurantId);

      const { orderId, payments, operatorName } = req.body || {};
      if (!orderId) {
        return res.status(400).json({ error: 'orderId é obrigatório.', code: 'ORDER_NOT_FOUND' });
      }

      const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return res.status(404).json({ error: 'Pedido não encontrado.', code: 'ORDER_NOT_FOUND' });
      }

      const orderData = orderSnap.data() || {};
      if (orderData.restaurantId && orderData.restaurantId !== restaurantId && orderData.restaurante_id !== restaurantId) {
        return res.status(403).json({ error: 'Acesso negado ao pedido de outro restaurante.', code: 'RESTAURANT_MISMATCH' });
      }

      let totalCents = 0;
      if (typeof orderData.valor_total === 'number') {
        totalCents = Math.round(orderData.valor_total * 100);
      } else if (typeof orderData.total === 'number') {
        totalCents = Math.round(orderData.total * 100);
      } else if (typeof orderData.valor_produtos === 'number') {
        totalCents = Math.round(orderData.valor_produtos * 100);
      }

      let updatedPayments = Array.isArray(payments) ? payments : (Array.isArray(orderData.payments) ? orderData.payments : []);

      if (!Array.isArray(payments) || payments.length === 0) {
        if (req.body.pago === true) {
          const pmId = normalizePaymentMethodId(orderData.forma_pagamento || orderData.paymentMethodId || orderData.paymentMethod || 'dinheiro');
          updatedPayments = [{
            id: 'legacy',
            paymentMethodId: pmId || 'dinheiro',
            amount: totalCents,
            status: 'PAID'
          }];
        }
      } else {
        let totalPaidCents = 0;
        const normalizedPayments = [];

        for (let i = 0; i < payments.length; i++) {
          const p = payments[i];
          const amountCents = Math.round(Number(p.amount));
          if (isNaN(amountCents) || amountCents <= 0) {
            return res.status(400).json({ error: 'Valor do pagamento deve ser um número positivo em centavos.', code: 'INVALID_AMOUNT' });
          }

          const pmId = normalizePaymentMethodId(p.paymentMethodId);
          if (!pmId) {
            return res.status(400).json({ error: 'Forma de pagamento inválida.', code: 'INVALID_PAYMENT_METHOD' });
          }

          if (p.status === 'PAID') {
            totalPaidCents += amountCents;
          }

          normalizedPayments.push({
            id: p.id || `p_${i + 1}`,
            paymentMethodId: pmId,
            amount: amountCents,
            status: p.status || 'PAID'
          });
        }

        if (totalPaidCents > totalCents) {
          return res.status(400).json({ error: 'A soma dos pagamentos não pode ser superior ao total do pedido.', code: 'PAYMENT_EXCEEDS_ORDER_TOTAL' });
        }

        updatedPayments = normalizedPayments;
      }

      const sumPaid = updatedPayments.filter((p: any) => p.status === 'PAID').reduce((sum: number, p: any) => sum + p.amount, 0);
      const isFullyPaid = sumPaid >= totalCents && totalCents > 0;

      let principalMethod = orderData.forma_pagamento;
      if (updatedPayments.length > 0) {
        const highest = updatedPayments.reduce((prev: any, current: any) => (prev.amount > current.amount) ? prev : current, updatedPayments[0]);
        principalMethod = highest.paymentMethodId;
      }

      const updateData: any = {
        payments: updatedPayments,
        pago: isFullyPaid,
        updated_at: new Date().toISOString()
      };
      if (principalMethod) {
        updateData.forma_pagamento = principalMethod;
      }

      await orderRef.update(updateData);

      const fullUpdatedOrder = { ...orderData, ...updateData };

      const operator = operatorName || req.user.nome || req.user.email || 'Operador';
      await registerServerOrderPaymentMovement(restaurantId, orderId, fullUpdatedOrder, operator);

      return res.json({
        success: true,
        order: fullUpdatedOrder
      });
    } catch (error: any) {
      if (error.code === 'CASH_REGISTER_CLOSED') {
        return res.status(409).json({
          code: 'CASH_REGISTER_CLOSED',
          message: error.message,
          error: error.message
        });
      }
      console.error('Erro ao processar pagamentos do pedido:', error);
      return res.status(500).json({ error: error.message || 'Erro ao processar pagamento.', code: 'HTTP_ERROR' });
    }
  });

  app.post('/api/restaurant/financeiro/pedidos/processar-estorno', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user?.restaurantId;
      if (!restaurantId) {
        return res.status(401).json({ error: 'Usuário não autenticado.', code: 'UNAUTHORIZED' });
      }

      await requireOpenCashRegister(restaurantId);

      const { orderId, paymentId, operatorName } = req.body || {};
      if (!orderId) {
        return res.status(400).json({ error: 'orderId é obrigatório.', code: 'ORDER_NOT_FOUND' });
      }

      const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        return res.status(404).json({ error: 'Pedido não encontrado.', code: 'ORDER_NOT_FOUND' });
      }

      const orderData = orderSnap.data() || {};
      if (orderData.restaurantId && orderData.restaurantId !== restaurantId && orderData.restaurante_id !== restaurantId) {
        return res.status(403).json({ error: 'Acesso negado ao pedido de outro restaurante.', code: 'RESTAURANT_MISMATCH' });
      }

      let payments = Array.isArray(orderData.payments) ? orderData.payments : [];

      if (payments.length === 0) {
        const pmId = normalizePaymentMethodId(orderData.forma_pagamento || orderData.paymentMethodId || orderData.paymentMethod);
        let totalCents = 0;
        if (typeof orderData.valor_total === 'number') {
          totalCents = Math.round(orderData.valor_total * 100);
        } else if (typeof orderData.total === 'number') {
          totalCents = Math.round(orderData.total * 100);
        }

        payments = [{
          id: 'legacy',
          paymentMethodId: pmId || 'dinheiro',
          amount: totalCents,
          status: orderData.pago ? 'PAID' : 'PENDING'
        }];
      }

      const targetId = paymentId || 'legacy';
      const paymentIndex = payments.findIndex((p: any) => (p.id || 'legacy') === targetId);

      if (paymentIndex === -1) {
        return res.status(404).json({ error: 'Pagamento não encontrado no pedido.', code: 'ORDER_NOT_FOUND' });
      }

      const targetPayment = payments[paymentIndex];

      if (targetPayment.status === 'REFUNDED') {
        return res.status(400).json({ error: 'Este pagamento já foi estornado.', code: 'PAYMENT_ALREADY_REFUNDED' });
      }

      if (targetPayment.status !== 'PAID') {
        return res.status(400).json({ error: 'Apenas pagamentos com status PAGO podem ser estornados.', code: 'PAYMENT_NOT_PAID' });
      }

      // Mark payment as REFUNDED
      payments[paymentIndex] = { ...targetPayment, status: 'REFUNDED' };

      let totalCents = 0;
      if (typeof orderData.valor_total === 'number') {
        totalCents = Math.round(orderData.valor_total * 100);
      } else if (typeof orderData.total === 'number') {
        totalCents = Math.round(orderData.total * 100);
      }

      const sumPaid = payments.filter((p: any) => p.status === 'PAID').reduce((sum: number, p: any) => sum + p.amount, 0);
      const isFullyPaid = sumPaid >= totalCents && totalCents > 0;

      const updateData = {
        payments,
        pago: isFullyPaid,
        updated_at: new Date().toISOString()
      };

      await orderRef.update(updateData);

      const fullUpdatedOrder = { ...orderData, ...updateData };

      const operator = operatorName || req.user.nome || req.user.email || 'Operador';
      await registerServerOrderRefundMovement(restaurantId, orderId, fullUpdatedOrder, operator, targetId);

      return res.json({
        success: true,
        order: fullUpdatedOrder
      });
    } catch (error: any) {
      if (error.code === 'CASH_REGISTER_CLOSED') {
        return res.status(409).json({
          code: 'CASH_REGISTER_CLOSED',
          message: error.message,
          error: error.message
        });
      }
      console.error('Erro ao processar estorno do pedido:', error);
      return res.status(500).json({ error: error.message || 'Erro ao processar estorno.', code: 'HTTP_ERROR' });
    }
  });

  // ==========================================
  // CONTAS A RECEBER ENDPOINTS
  // ==========================================

  // 1. Criar Conta a Receber
  app.post('/api/restaurant/financeiro/contas-receber', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { customerName, customerId, description, totalAmount, totalAmountCents, dueDate } = req.body || {};

      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ code: 'INVALID_DESCRIPTION', error: 'A descrição é obrigatória.' });
      }

      let cents = 0;
      if (typeof totalAmountCents === 'number') {
        cents = Math.round(totalAmountCents);
      } else if (typeof totalAmount === 'number') {
        cents = Number.isInteger(totalAmount) && totalAmount >= 100 ? totalAmount : Math.round(totalAmount * 100);
      } else if (typeof totalAmount === 'string') {
        const clean = totalAmount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor da conta deve ser um número inteiro positivo em centavos.'
        });
      }

      if (!dueDate || typeof dueDate !== 'string' || isNaN(Date.parse(dueDate))) {
        return res.status(400).json({ code: 'INVALID_DUE_DATE', error: 'Data de vencimento inválida.' });
      }

      const contaRef = db.collection('restaurants').doc(restaurantId).collection('contasReceber').doc();
      const now = new Date().toISOString();

      const newContaData = {
        id: contaRef.id,
        restaurantId,
        customerId: typeof customerId === 'string' && customerId.trim() ? customerId.trim() : null,
        customerName: typeof customerName === 'string' && customerName.trim() ? customerName.trim() : 'Cliente',
        description: description.trim(),
        totalAmount: cents,
        paidAmount: 0,
        remainingAmount: cents,
        dueDate: dueDate.trim(),
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
        createdBy: req.user.uid
      };

      await contaRef.set(newContaData);

      return res.status(201).json({ success: true, conta: newContaData });
    } catch (error: any) {
      console.error('Error creating conta a receber:', error);
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao criar conta a receber.' });
    }
  });

  // 2. Registrar Recebimento
  app.post('/api/restaurant/financeiro/contas-receber/:id/receber', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const accountId = req.params.id;
      const { amount, amountCents, paymentMethodId, observation, idempotencyKey } = req.body || {};

      let cents = 0;
      if (typeof amountCents === 'number') {
        cents = Math.round(amountCents);
      } else if (typeof amount === 'number') {
        cents = Number.isInteger(amount) && amount >= 100 ? amount : Math.round(amount * 100);
      } else if (typeof amount === 'string') {
        const clean = amount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor do recebimento deve ser um número inteiro maior que zero em centavos.'
        });
      }

      if (!paymentMethodId || typeof paymentMethodId !== 'string') {
        return res.status(400).json({ code: 'INVALID_PAYMENT_METHOD', error: 'A forma de pagamento é obrigatória.' });
      }

      const contaRef = db.collection('restaurants').doc(restaurantId).collection('contasReceber').doc(accountId);
      const restRef = db.collection('restaurants').doc(restaurantId);
      const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');

      const result = await db.runTransaction(async (transaction) => {
        const contaSnap = await transaction.get(contaRef);
        if (!contaSnap.exists) {
          const err: any = new Error('Conta a receber não encontrada.');
          err.code = 'ACCOUNT_NOT_FOUND';
          throw err;
        }
        const conta = contaSnap.data()!;
        if (conta.restaurantId !== restaurantId) {
          const err: any = new Error('Conta não pertence ao restaurante autenticado.');
          err.code = 'RESTAURANT_MISMATCH';
          throw err;
        }
        if (conta.status !== 'OPEN' && conta.status !== 'PARTIALLY_PAID') {
          const err: any = new Error('Esta conta já se encontra quitada ou indisponível para recebimento.');
          err.code = 'ACCOUNT_ALREADY_PAID';
          throw err;
        }

        if (cents > conta.remainingAmount) {
          const err: any = new Error('O valor informado excede o saldo restante da conta.');
          err.code = 'PAYMENT_EXCEEDS_REMAINING';
          throw err;
        }

        const restSnap = await transaction.get(restRef);
        const validMethods = extractConfiguredPaymentMethods(restSnap.data());
        if (!validMethods.has(paymentMethodId)) {
          const err: any = new Error(`A forma de pagamento "${paymentMethodId}" não está configurada para este restaurante.`);
          err.code = 'INVALID_PAYMENT_METHOD';
          throw err;
        }

        const openCaixa = await requireOpenCashRegister(restaurantId, transaction);
        const caixaId = openCaixa.id;

        const recRef = contaRef.collection('recebimentos').doc();
        const stableKey = idempotencyKey || `ACCOUNT_RECEIVABLE:${accountId}:${recRef.id}`;

        let movementRef: any = null;
        if (caixaId) {
          movementRef = caixasRef.doc(caixaId).collection('movimentacoes').doc(stableKey);
          const movSnap: any = await transaction.get(movementRef);
          if (movSnap.exists) {
            const err: any = new Error('Esta operação financeira já foi processada.');
            err.code = 'DUPLICATE_FINANCIAL_OPERATION';
            throw err;
          }
        }

        const newPaidAmount = (conta.paidAmount || 0) + cents;
        const newRemainingAmount = (conta.remainingAmount || 0) - cents;
        const newStatus = newRemainingAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
        const now = new Date().toISOString();

        const receiptDoc = {
          id: recRef.id,
          accountId,
          amount: cents,
          paymentMethodId,
          observation: typeof observation === 'string' && observation.trim() ? observation.trim() : null,
          createdAt: now,
          createdBy: req.user.uid,
          cashMovementStatus: caixaId ? 'REGISTERED' : 'NO_OPEN_CAIXA'
        };

        transaction.set(recRef, receiptDoc);
        transaction.update(contaRef, {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
          updatedAt: now
        });

        if (caixaId && movementRef) {
          transaction.set(movementRef, {
            id: stableKey,
            restaurantId,
            cashRegisterId: caixaId,
            accountId,
            receiptId: recRef.id,
            type: 'INCOME',
            category: 'ACCOUNT_RECEIVABLE',
            origin: 'ACCOUNT_RECEIVABLE',
            automatic: true,
            amount: cents,
            paymentMethodId,
            description: `Recebimento de conta (${conta.description || 'Conta a Receber'})`,
            createdAt: now,
            createdBy: req.user.uid,
            idempotencyKey: stableKey
          });
        }

        return {
          receipt: receiptDoc,
          conta: {
            ...conta,
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            status: newStatus,
            updatedAt: now
          }
        };
      });

      return res.json({ success: true, ...result });
    } catch (error: any) {
      if (error.code) {
        const statusMap: Record<string, number> = {
          UNAUTHORIZED: 401,
          RESTAURANT_MISMATCH: 403,
          ACCOUNT_NOT_FOUND: 404,
          ACCOUNT_ALREADY_PAID: 400,
          INVALID_AMOUNT: 400,
          INVALID_PAYMENT_METHOD: 400,
          PAYMENT_EXCEEDS_REMAINING: 400,
          DUPLICATE_FINANCIAL_OPERATION: 409,
          FINANCIAL_RECORD_IMMUTABLE: 400,
          CASH_REGISTER_CLOSED: 409
        };
        return res.status(statusMap[error.code] || 400).json({ code: error.code, message: error.message, error: error.message });
      }
      console.error('Error processing recebimento:', error);
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao registrar recebimento.' });
    }
  });

  // ==========================================
  // CONTAS A PAGAR ENDPOINTS
  // ==========================================

  // 1. Criar Conta a Pagar
  app.post('/api/restaurant/financeiro/contas-pagar', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { supplierName, supplierId, description, category, totalAmount, totalAmountCents, dueDate } = req.body || {};

      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ code: 'INVALID_DESCRIPTION', error: 'A descrição é obrigatória.' });
      }

      if (!category || typeof category !== 'string' || !category.trim()) {
        return res.status(400).json({ code: 'INVALID_CATEGORY', error: 'A categoria é obrigatória.' });
      }

      let cents = 0;
      if (typeof totalAmountCents === 'number') {
        cents = Math.round(totalAmountCents);
      } else if (typeof totalAmount === 'number') {
        cents = Number.isInteger(totalAmount) && totalAmount >= 100 ? totalAmount : Math.round(totalAmount * 100);
      } else if (typeof totalAmount === 'string') {
        const clean = totalAmount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor da conta deve ser um número inteiro positivo em centavos.'
        });
      }

      if (!dueDate || typeof dueDate !== 'string' || isNaN(Date.parse(dueDate))) {
        return res.status(400).json({ code: 'INVALID_DUE_DATE', error: 'Data de vencimento inválida.' });
      }

      const contaRef = db.collection('restaurants').doc(restaurantId).collection('contasPagar').doc();
      const now = new Date().toISOString();

      const newContaData = {
        id: contaRef.id,
        restaurantId,
        supplierId: typeof supplierId === 'string' && supplierId.trim() ? supplierId.trim() : null,
        supplierName: typeof supplierName === 'string' && supplierName.trim() ? supplierName.trim() : 'Fornecedor',
        description: description.trim(),
        category: category.trim(),
        totalAmount: cents,
        paidAmount: 0,
        remainingAmount: cents,
        dueDate: dueDate.trim(),
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
        createdBy: req.user.uid
      };

      await contaRef.set(newContaData);

      return res.status(201).json({ success: true, conta: newContaData });
    } catch (error: any) {
      console.error('Error creating conta a pagar:', error);
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao criar conta a pagar.' });
    }
  });

  // 2. Registrar Pagamento
  app.post('/api/restaurant/financeiro/contas-pagar/:id/pagar', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const accountId = req.params.id;
      const { amount, amountCents, paymentMethodId, observation, idempotencyKey } = req.body || {};

      let cents = 0;
      if (typeof amountCents === 'number') {
        cents = Math.round(amountCents);
      } else if (typeof amount === 'number') {
        cents = Number.isInteger(amount) && amount >= 100 ? amount : Math.round(amount * 100);
      } else if (typeof amount === 'string') {
        const clean = amount.replace(/[^\d,-]/g, '').replace(',', '.');
        const num = parseFloat(clean);
        cents = Math.round((isNaN(num) ? 0 : num) * 100);
      }

      if (isNaN(cents) || cents <= 0 || !Number.isInteger(cents)) {
        return res.status(400).json({
          code: 'INVALID_AMOUNT',
          error: 'O valor do pagamento deve ser um número inteiro maior que zero em centavos.'
        });
      }

      if (!paymentMethodId || typeof paymentMethodId !== 'string') {
        return res.status(400).json({ code: 'INVALID_PAYMENT_METHOD', error: 'A forma de pagamento é obrigatória.' });
      }

      const contaRef = db.collection('restaurants').doc(restaurantId).collection('contasPagar').doc(accountId);
      const restRef = db.collection('restaurants').doc(restaurantId);
      const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');

      const result = await db.runTransaction(async (transaction) => {
        const contaSnap = await transaction.get(contaRef);
        if (!contaSnap.exists) {
          const err: any = new Error('Conta a pagar não encontrada.');
          err.code = 'ACCOUNT_NOT_FOUND';
          throw err;
        }
        const conta = contaSnap.data()!;
        if (conta.restaurantId !== restaurantId) {
          const err: any = new Error('Conta não pertence ao restaurante autenticado.');
          err.code = 'RESTAURANT_MISMATCH';
          throw err;
        }
        if (conta.status !== 'OPEN' && conta.status !== 'PARTIALLY_PAID') {
          const err: any = new Error('Esta conta já se encontra quitada ou indisponível para pagamento.');
          err.code = 'ACCOUNT_ALREADY_PAID';
          throw err;
        }

        if (cents > conta.remainingAmount) {
          const err: any = new Error('O valor informado excede o saldo restante da conta.');
          err.code = 'PAYMENT_EXCEEDS_REMAINING';
          throw err;
        }

        const restSnap = await transaction.get(restRef);
        const validMethods = extractConfiguredPaymentMethods(restSnap.data());
        if (!validMethods.has(paymentMethodId)) {
          const err: any = new Error(`A forma de pagamento "${paymentMethodId}" não está configurada para este restaurante.`);
          err.code = 'INVALID_PAYMENT_METHOD';
          throw err;
        }

        const openCaixa = await requireOpenCashRegister(restaurantId, transaction);
        const caixaId = openCaixa.id;

        const pagRef = contaRef.collection('pagamentos').doc();
        const stableKey = idempotencyKey || `ACCOUNT_PAYABLE:${accountId}:${pagRef.id}`;

        let movementRef: any = null;
        if (caixaId) {
          movementRef = caixasRef.doc(caixaId).collection('movimentacoes').doc(stableKey);
          const movSnap: any = await transaction.get(movementRef);
          if (movSnap.exists) {
            const err: any = new Error('Esta operação financeira já foi processada.');
            err.code = 'DUPLICATE_FINANCIAL_OPERATION';
            throw err;
          }
        }

        const newPaidAmount = (conta.paidAmount || 0) + cents;
        const newRemainingAmount = (conta.remainingAmount || 0) - cents;
        const newStatus = newRemainingAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
        const now = new Date().toISOString();

        const paymentDoc = {
          id: pagRef.id,
          accountId,
          amount: cents,
          paymentMethodId,
          observation: typeof observation === 'string' && observation.trim() ? observation.trim() : null,
          createdAt: now,
          createdBy: req.user.uid,
          cashMovementStatus: caixaId ? 'REGISTERED' : 'NO_OPEN_CAIXA'
        };

        transaction.set(pagRef, paymentDoc);
        transaction.update(contaRef, {
          paidAmount: newPaidAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus,
          updatedAt: now
        });

        if (caixaId && movementRef) {
          transaction.set(movementRef, {
            id: stableKey,
            restaurantId,
            cashRegisterId: caixaId,
            accountId,
            paymentId: pagRef.id,
            type: 'EXPENSE',
            category: 'ACCOUNT_PAYABLE',
            origin: 'ACCOUNT_PAYABLE',
            automatic: true,
            amount: cents,
            paymentMethodId,
            description: `Pagamento de conta (${conta.description || 'Conta a Pagar'})`,
            createdAt: now,
            createdBy: req.user.uid,
            idempotencyKey: stableKey
          });
        }

        return {
          payment: paymentDoc,
          conta: {
            ...conta,
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            status: newStatus,
            updatedAt: now
          }
        };
      });

      return res.json({ success: true, ...result });
    } catch (error: any) {
      if (error.code) {
        const statusMap: Record<string, number> = {
          UNAUTHORIZED: 401,
          RESTAURANT_MISMATCH: 403,
          ACCOUNT_NOT_FOUND: 404,
          ACCOUNT_ALREADY_PAID: 400,
          INVALID_AMOUNT: 400,
          INVALID_PAYMENT_METHOD: 400,
          PAYMENT_EXCEEDS_REMAINING: 400,
          DUPLICATE_FINANCIAL_OPERATION: 409,
          FINANCIAL_RECORD_IMMUTABLE: 400,
          CASH_REGISTER_CLOSED: 409
        };
        return res.status(statusMap[error.code] || 400).json({ code: error.code, message: error.message, error: error.message });
      }
      console.error('Error processing pagamento:', error);
      return res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Erro ao registrar pagamento.' });
    }
  });
  app.post('/api/orders/check-timeout', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const payloadRestaurantId = req.body?.restaurantId;

      if (payloadRestaurantId && payloadRestaurantId !== restaurantId) {
        return res.status(403).json({ error: 'Forbidden: You cannot check orders for other restaurants' });
      }

      const result = await checkOrdersTimeoutForRestaurant(restaurantId);
      res.json({
        success: true,
        restaurantId,
        checkedOrders: result.checkedOrders,
        processedOrders: result.processedOrders
      });
    } catch (error: any) {
      console.error('[Order Timeout API] Error checking timeouts:', error);
      res.status(500).json({ error: error.message || 'Erro interno ao verificar timeouts' });
    }
  });

  // GET: List drivers of the logged-in restaurant
  app.get('/api/restaurant/drivers', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const driversSnapshot = await db.collection('restaurants').doc(restaurantId).collection('drivers').get();
      const drivers = driversSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      res.json({ success: true, drivers });
    } catch (error: any) {
      console.error('Error listing drivers:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Register a driver
  app.post('/api/restaurant/drivers', verifyRestaurant, async (req: any, res: any) => {
    const { name, nickname, email, password, phone, cpf, vehicleType, vehiclePlate, observations, active } = req.body;
    
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'Nome completo, e-mail, senha e WhatsApp são obrigatórios' });
    }

    try {
      const restaurantId = req.user.restaurantId;

      let driverId;
      let isExistingUser = false;

      try {
        // Attempt to find existing user by email
        const existingUser = await authAdmin.getUserByEmail(email);
        driverId = existingUser.uid;

        // Check if driver is already registered in this restaurant
        const existingDriverDoc = await db.collection('restaurants').doc(restaurantId).collection('drivers').doc(driverId).get();
        if (!existingDriverDoc.exists) {
          // If email exists and is not a driver for this restaurant, reject without altering user profile or password
          return res.status(409).json({ error: 'Este e-mail já está vinculado a outra conta.' });
        }
        isExistingUser = true;
      } catch (authErr: any) {
        if (authErr.code === 'auth/user-not-found') {
          // If not registered under any account, create a new Auth user
          const userRecord = await authAdmin.createUser({
            email,
            password,
            displayName: name,
          });
          driverId = userRecord.uid;
        } else {
          throw authErr;
        }
      }

      // 2. Create driver doc in Firestore: restaurants/{restaurantId}/drivers/{driverId}
      const driverDoc = {
        id: driverId,
        restaurantId,
        userId: driverId,
        name,
        nickname: nickname || '',
        phone,
        email,
        cpf: cpf || '',
        vehicleType: vehicleType || 'moto',
        vehiclePlate: vehiclePlate || '',
        observations: observations || '',
        status: active ? "ACTIVE" : "INACTIVE",
        availabilityStatus: "OFFLINE",
        currentOrderId: null,
        lastLocation: null,
        totalDeliveries: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: req.user.uid
      };

      await db.collection('restaurants').doc(restaurantId).collection('drivers').doc(driverId).set(driverDoc);

      // 3. Create or update user doc in users/{driverId} with role profile (using merge to preserve external user info if any)
      const userDocDef = {
        uid: driverId,
        nome: name,
        phone,
        email,
        role: "delivery_driver",
        tipo_usuario: "delivery_driver",
        restaurantId,
        active: active !== undefined ? active : true,
        data_criacao: new Date().toISOString(),
        acceptedTerms: true,
        onboarding_completo: true
      };

      await db.collection('users').doc(driverId).set(userDocDef, { merge: true });

      res.status(201).json({ success: true, driverId, upgraded: isExistingUser });
    } catch (error: any) {
      console.error('Error creating driver:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT: Update an existing driver
  app.put('/api/restaurant/drivers/:id', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const { name, nickname, email, phone, cpf, vehicleType, vehiclePlate, observations, active } = req.body;

    try {
      const restaurantId = req.user.restaurantId;

      // Check if driver belongs to this restaurant
      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(id);
      const driverDocSnap = await driverRef.get();
      if (!driverDocSnap.exists) {
        return res.status(404).json({ error: 'Entregador não encontrado neste restaurante' });
      }

      // 1. Update Auth if email is provided and differs
      const currentData = driverDocSnap.data();
      if (email && email !== currentData?.email) {
        await authAdmin.updateUser(id, { email });
      }

      // 2. Update driver doc in subcollection
      const driverUpdates: any = {
        updatedAt: new Date().toISOString()
      };
      if (name !== undefined) driverUpdates.name = name;
      if (nickname !== undefined) driverUpdates.nickname = nickname;
      if (email !== undefined) driverUpdates.email = email;
      if (phone !== undefined) driverUpdates.phone = phone;
      if (cpf !== undefined) driverUpdates.cpf = cpf;
      if (vehicleType !== undefined) driverUpdates.vehicleType = vehicleType;
      if (vehiclePlate !== undefined) driverUpdates.vehiclePlate = vehiclePlate;
      if (observations !== undefined) driverUpdates.observations = observations;
      if (active !== undefined) driverUpdates.status = active ? "ACTIVE" : "INACTIVE";

      await driverRef.update(driverUpdates);

      // 3. Update users/{id}
      const userUpdates: any = {};
      if (name !== undefined) userUpdates.nome = name;
      if (email !== undefined) userUpdates.email = email;
      if (phone !== undefined) userUpdates.phone = phone;
      if (active !== undefined) userUpdates.active = active;

      await db.collection('users').doc(id).update(userUpdates);

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error updating driver:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE: Remove/un-register a driver (Deactivate instead of deletion)
  app.delete('/api/restaurant/drivers/:id', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;

    try {
      const restaurantId = req.user.restaurantId;

      // Check if driver belongs to this restaurant
      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(id);
      const driverDocSnap = await driverRef.get();
      if (!driverDocSnap.exists) {
        return res.status(404).json({ error: 'Entregador não encontrado neste restaurante' });
      }

      const now = new Date().toISOString();

      // Deactivate driver document in subcollection
      await driverRef.update({
        status: 'INACTIVE',
        active: false,
        updatedAt: now
      });

      // Update users/{id} doc to reflect inactive state
      await db.collection('users').doc(id).update({
        status: 'INACTIVE',
        active: false,
        updatedAt: now
      });

      res.json({ success: true, message: 'Entregador desativado com sucesso' });
    } catch (error: any) {
      console.error('Error deleting/deactivating driver:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET: Retrieve a restaurant's custom delivery settings
  app.get('/api/restaurant/delivery-settings', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const resDoc = await db.collection('restaurants').doc(restaurantId).get();
      if (!resDoc.exists) {
        return res.status(404).json({ error: 'Restaurante não encontrado' });
      }

      const resData = resDoc.data();
      const settings = resData?.deliverySettings || {
        deliveryPropria: true,
        atribuicaoManual: true,
        entregadorAceitaRecusa: false,
        tempoMedioEntrega: 30,
        observacoesInternas: ''
      };

      res.json({ success: true, settings });
    } catch (error: any) {
      console.error('Error fetching delivery settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT: Save restaurant delivery settings
  app.put('/api/restaurant/delivery-settings', verifyRestaurant, async (req: any, res: any) => {
    const { deliveryPropria, atribuicaoManual, entregadorAceitaRecusa, tempoMedioEntrega, observacoesInternas } = req.body;
    try {
      const restaurantId = req.user.restaurantId;

      await db.collection('restaurants').doc(restaurantId).update({
        deliverySettings: {
          deliveryPropria: deliveryPropria !== undefined ? deliveryPropria : true,
          atribuicaoManual: atribuicaoManual !== undefined ? atribuicaoManual : true,
          entregadorAceitaRecusa: entregadorAceitaRecusa !== undefined ? entregadorAceitaRecusa : false,
          tempoMedioEntrega: tempoMedioEntrega !== undefined ? Number(tempoMedioEntrega) : 30,
          observacoesInternas: observacoesInternas || ''
        }
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error saving delivery settings:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- COUNTER ORDER ENDPOINT (POST /api/restaurant/counter/orders) ---
  app.post('/api/restaurant/counter/orders', verifyRestaurant, async (req: any, res: any) => {
    const restaurantId = req.user.restaurantId;
    const operatorId = req.user.uid;
    const operatorName = req.user.nome || req.user.name || req.user.displayName || 'Operador Balcão';

    const {
      clientActionId,
      serviceMode = 'COUNTER',
      clientName = '',
      items = [],
      paymentMethod: rawPaymentMethod,
      forma_pagamento,
      pago = false,
      amountReceived = 0
    } = req.body;

    const paymentMethod = rawPaymentMethod || forma_pagamento || 'dinheiro';

    const normalizeText = (value: any, maxLength: number): string => {
      if (typeof value !== 'string') return '';
      const clean = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
      return clean.trim().substring(0, maxLength);
    };

    if (typeof clientActionId !== 'string') {
      return res.status(400).json({ success: false, error: 'INVALID_CLIENT_ACTION_ID', message: 'clientActionId deve ser uma string.' });
    }
    const normalizedActionId = clientActionId.trim();
    const actionIdRegex = /^[A-Za-z0-9_-]{10,120}$/;
    if (!actionIdRegex.test(normalizedActionId)) {
      return res.status(400).json({ success: false, error: 'INVALID_CLIENT_ACTION_ID', message: 'clientActionId inválido. Deve conter de 10 a 120 caracteres alfanuméricos, hífen ou sublinhado.' });
    }

    if (!['COUNTER', 'PICKUP', 'DINE_IN'].includes(serviceMode)) {
      return res.status(400).json({ success: false, error: 'INVALID_SERVICE_MODE', message: 'Modo de atendimento (serviceMode) inválido. Use COUNTER, PICKUP ou DINE_IN.' });
    }

    const normalizedClientName = normalizeText(clientName, 100);
    if (serviceMode === 'PICKUP' && !normalizedClientName) {
      return res.status(400).json({ success: false, error: 'CLIENT_NAME_REQUIRED', message: 'O nome do cliente é obrigatório para pedidos de retirada.' });
    }
    const finalClientName = normalizedClientName || 'Cliente Balcão';

    if (typeof pago !== 'boolean') {
      return res.status(400).json({ success: false, error: 'INVALID_PAGO', message: 'O campo "pago" deve ser um booleano.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'EMPTY_CART', message: 'O carrinho não pode estar vazio.' });
    }

    const isValidOrderResponse = (orderId: any, order: any) => {
      if (!orderId || typeof orderId !== 'string' || !orderId.trim()) return false;
      if (!order || typeof order !== 'object') return false;
      if (order.source !== 'COUNTER') return false;
      if (order.orderStatus !== 'PREPARING') return false;
      if (order.status !== 'cozinha') return false;
      if (!Array.isArray(order.items)) return false;
      if (typeof order.valor_total !== 'number' || !Number.isFinite(order.valor_total) || order.valor_total < 0) return false;
      if (!['dinheiro', 'pix', 'credito', 'debito'].includes(order.forma_pagamento)) return false;
      return true;
    };

    try {
      await requireOpenCashRegister(restaurantId);

      const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
      if (!restaurantDoc.exists || restaurantDoc.data()?.features?.counterEnabled !== true) {
        return res.status(403).json({ success: false, error: 'COUNTER_DISABLED', message: 'A funcionalidade de Balcão não está ativada neste restaurante.' });
      }

      const paymentCheck = await loadRestaurantCounterPaymentMethods(restaurantId, serviceMode);
      if (paymentCheck.hasExplicitConfiguration) {
        const anyEnabledForChannel = paymentCheck.methods.some(m => m.enabledForCurrentServiceMode);
        if (!anyEnabledForChannel) {
          return res.status(400).json({
            success: false,
            error: 'NO_PAYMENT_METHOD_AVAILABLE',
            message: 'Nenhuma forma de pagamento está habilitada para este tipo de atendimento.'
          });
        }
      }

      let reqPayments = Array.isArray(req.body.payments) ? req.body.payments : [];
      let normalizedPayments: any[] = [];
      let cashPaymentCents = 0;
      let totalPaymentsCents = 0;

      const formatPtBrCurrency = (cents: number) => {
        return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      if (reqPayments.length > 0) {
        for (const p of reqPayments) {
          const pMethodId = normalizePaymentMethodId(p.paymentMethodId || p.forma_pagamento || p.method);
          if (!pMethodId) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_PAYMENT_METHOD',
              message: 'Uma das formas de pagamento fornecidas é inválida.'
            });
          }

          if (paymentCheck.hasExplicitConfiguration) {
            const methodObj = paymentCheck.methods.find(m => m.id === pMethodId);
            if (!methodObj || !methodObj.enabledForCurrentServiceMode) {
              return res.status(400).json({
                success: false,
                error: 'PAYMENT_METHOD_NOT_AVAILABLE',
                message: `A forma de pagamento (${pMethodId}) não está disponível para este atendimento.`
              });
            }
          } else {
            if (!['dinheiro', 'pix', 'credito', 'debito'].includes(pMethodId)) {
              return res.status(400).json({
                success: false,
                error: 'PAYMENT_METHOD_NOT_AVAILABLE',
                message: 'A forma de pagamento selecionada não está disponível.'
              });
            }
          }

          const pAmountCents = typeof p.amount === 'number' ? Math.round(p.amount) : (typeof p.value === 'number' ? Math.round(p.value * 100) : 0);
          if (pAmountCents <= 0) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_PAYMENT_AMOUNT',
              message: 'O valor de cada parcela de pagamento deve ser maior que zero.'
            });
          }

          totalPaymentsCents += pAmountCents;
          if (pMethodId === 'dinheiro') {
            cashPaymentCents += pAmountCents;
          }

          normalizedPayments.push({
            id: p.id || `pm_${normalizedPayments.length + 1}`,
            paymentMethodId: pMethodId,
            paymentMethodName: p.paymentMethodName || (pMethodId === 'dinheiro' ? 'Dinheiro' : pMethodId === 'pix' ? 'Pix' : pMethodId === 'credito' ? 'Crédito' : 'Débito'),
            amount: pAmountCents,
            status: pago ? 'PAID' : 'PENDING'
          });
        }
      } else {
        const normalizedMethod = normalizePaymentMethodId(paymentMethod);
        if (!normalizedMethod) {
          return res.status(400).json({
            success: false,
            error: 'PAYMENT_METHOD_NOT_AVAILABLE',
            message: 'A forma de pagamento selecionada não está disponível para este atendimento.'
          });
        }

        if (paymentCheck.hasExplicitConfiguration) {
          const methodObj = paymentCheck.methods.find(m => m.id === normalizedMethod);
          if (!methodObj || !methodObj.enabledForCurrentServiceMode) {
            return res.status(400).json({
              success: false,
              error: 'PAYMENT_METHOD_NOT_AVAILABLE',
              message: 'A forma de pagamento selecionada não está disponível para este atendimento.'
            });
          }
        } else {
          if (!['dinheiro', 'pix', 'credito', 'debito'].includes(normalizedMethod)) {
            return res.status(400).json({
              success: false,
              error: 'PAYMENT_METHOD_NOT_AVAILABLE',
              message: 'A forma de pagamento selecionada não está disponível.'
            });
          }
        }

        if (normalizedMethod === 'dinheiro') {
          cashPaymentCents = 0; // will set after totalCents calculation
        }

        normalizedPayments.push({
          id: 'legacy',
          paymentMethodId: normalizedMethod,
          paymentMethodName: normalizedMethod === 'dinheiro' ? 'Dinheiro' : normalizedMethod === 'pix' ? 'Pix' : normalizedMethod === 'credito' ? 'Crédito' : 'Débito',
          amount: 0, // will set after totalCents calculation
          status: pago ? 'PAID' : 'PENDING'
        });
      }

      const [optionItemsSnap, optionGroupsSnap] = await Promise.all([
        db.collection('restaurants').doc(restaurantId).collection('optionItems').get(),
        db.collection('restaurants').doc(restaurantId).collection('optionGroups').get()
      ]);

      const optionItemsMap = new Map<string, any>();
      optionItemsSnap.docs.forEach((doc: any) => {
        optionItemsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      const optionGroupsMap = new Map<string, any>();
      optionGroupsSnap.docs.forEach((doc: any) => {
        optionGroupsMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      const toCents = (val: number) => Math.round(Number(val || 0) * 100);
      const fromCents = (cents: number) => cents / 100;

      let totalCents = 0;
      const formattedItems: any[] = [];

      for (const item of items) {
        const productId = item.productId;
        if (!productId || typeof productId !== 'string') {
          return res.status(400).json({ success: false, error: 'INVALID_PRODUCT_ID', message: 'productId é obrigatório para todos os itens e deve ser uma string.' });
        }

        const productSnap = await db.collection('restaurants').doc(restaurantId).collection('products').doc(productId).get();
        if (!productSnap.exists) {
          return res.status(400).json({ success: false, error: 'PRODUCT_NOT_FOUND', message: `O produto com ID "${productId}" não foi encontrado no cardápio.` });
        }

        const pData = productSnap.data() || {};
        if (pData.status === 'inativo' || pData.ativo === false) {
          return res.status(400).json({ success: false, error: 'PRODUCT_INACTIVE', message: `O produto "${pData.nome || pData.name || 'item'}" está inativo e não pode ser vendido.` });
        }

        const counterAvailable = isProductAvailableForChannelData(pData, 'counter');
        if (!counterAvailable) {
          return res.status(400).json({ success: false, error: 'PRODUCT_NOT_AVAILABLE', message: `O produto "${pData.nome || pData.name}" não está disponível para vendas no Balcão.` });
        }

        if (
          typeof item.quantity !== 'number' ||
          !Number.isFinite(item.quantity) ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0 ||
          item.quantity > 100
        ) {
          return res.status(400).json({ success: false, error: 'INVALID_QUANTITY', message: `Quantidade inválida (${item.quantity}) para o produto "${pData.nome || pData.name}".` });
        }
        const qty = item.quantity;

        // Consolidated Size Validation
        const rawSizes = Array.isArray(pData.sizes) ? pData.sizes : (Array.isArray(pData.tamanhos) ? pData.tamanhos : []);
        const pSizes = rawSizes.map((s: any, idx: number) => ({
          ...s,
          id: s.id || `size_${idx}`
        }));
        const hasSizes = pSizes.length > 0;
        let matchedSize: any = null;
        let sizeObj: any = null;

        const isSizeOptional = pData.optionalSize === true || pData.tamanhoOpcional === true || pData.requiresSize === false || pData.tamanhoObrigatorio === false;
        const requiresSize = hasSizes && !isSizeOptional;

        if (requiresSize && !item.selectedSizeId) {
          return res.status(400).json({ success: false, error: 'SIZE_REQUIRED', message: `Selecione um tamanho válido para o produto "${pData.nome || pData.name}".` });
        }

        if (item.selectedSizeId) {
          if (!hasSizes) {
            return res.status(400).json({ success: false, error: 'INVALID_SIZE', message: 'O tamanho selecionado não está disponível para este produto.' });
          }
          matchedSize = pSizes.find((s: any) => s.id === item.selectedSizeId);
          if (!matchedSize) {
            return res.status(400).json({ success: false, error: 'INVALID_SIZE', message: 'O tamanho selecionado não está disponível para este produto.' });
          }
          const sizeActive = matchedSize.active !== false && matchedSize.ativo !== false && matchedSize.status !== 'INACTIVE' && matchedSize.status !== 'inativo';
          if (!sizeActive) {
            return res.status(400).json({ success: false, error: 'SIZE_INACTIVE', message: 'O tamanho selecionado não está disponível para este produto.' });
          }
        }

        const canonicalBasePriceCents = resolveCounterUnitPriceCents(pData, matchedSize);
        if (typeof canonicalBasePriceCents !== 'number' || !Number.isFinite(canonicalBasePriceCents) || canonicalBasePriceCents < 0) {
          return res.status(400).json({ success: false, error: 'INVALID_PRODUCT_PRICE', message: 'O preço do produto não está configurado corretamente para o Balcão.' });
        }

        const baseUnitPrice = fromCents(canonicalBasePriceCents);
        if (matchedSize) {
          sizeObj = {
            id: matchedSize.id,
            nome: matchedSize.nome || matchedSize.name || 'Tamanho',
            preco: baseUnitPrice
          };
        }

        let additionalsCents = 0;
        const selectedAdditionalsInItem: any[] = [];
        const selectedAdditionalIds = Array.isArray(item.selectedAdditionalIds) ? item.selectedAdditionalIds : [];

        const seenIds = new Set<string>();
        for (const addId of selectedAdditionalIds) {
          if (typeof addId !== 'string') {
            return res.status(400).json({ success: false, error: 'INVALID_ADDITIONAL', message: 'Identificador de adicional inválido.' });
          }
          const cleanAddId = addId.trim();
          if (!cleanAddId || cleanAddId.length > 120) {
            return res.status(400).json({ success: false, error: 'INVALID_ADDITIONAL', message: 'Identificador de adicional inválido.' });
          }
          if (seenIds.has(cleanAddId)) {
            return res.status(400).json({ success: false, error: 'DUPLICATE_ADDITIONAL', message: 'Adicional duplicado no mesmo produto.' });
          }
          seenIds.add(cleanAddId);

          const opt = optionItemsMap.get(cleanAddId);
          if (!opt) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_NOT_FOUND', message: `O adicional com ID "${cleanAddId}" não foi encontrado.` });
          }

          const addActive = opt.active !== false && opt.ativo !== false && opt.status !== 'INACTIVE' && opt.status !== 'inativo';
          if (!addActive) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_INACTIVE', message: `O adicional "${opt.nome || 'adicional'}" está inativo.` });
          }

          if (typeof opt.restaurantId === 'string' && opt.restaurantId !== restaurantId) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_RESTRICTED', message: `O adicional "${opt.nome || 'adicional'}" não pertence a este restaurante.` });
          }

          const pOptionGroups = Array.isArray(pData.optionGroups) ? pData.optionGroups : [];
          const productGroupConfig = pOptionGroups.find((g: any) => (g.groupId === opt.grupoId || g.id === opt.grupoId));
          const realGroupDoc = optionGroupsMap.get(opt.grupoId);

          if (!productGroupConfig && !realGroupDoc) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_NOT_FOUND', message: `O adicional "${opt.nome || 'adicional'}" pertence a um grupo não associado a este produto.` });
          }

          if (realGroupDoc) {
            const groupActive = realGroupDoc.active !== false && realGroupDoc.ativo !== false && realGroupDoc.status !== 'INACTIVE' && realGroupDoc.status !== 'inativo';
            if (!groupActive) {
              return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_INACTIVE', message: 'O grupo de adicionais está inativo.' });
            }
          }

          const groupOptionIds = realGroupDoc?.optionIds || productGroupConfig?.optionIds;
          if (Array.isArray(groupOptionIds) && groupOptionIds.length > 0) {
            if (!groupOptionIds.includes(cleanAddId)) {
              return res.status(400).json({ success: false, error: 'ADDITIONAL_NOT_PERMITTED', message: `O adicional "${opt.nome || 'adicional'}" não é permitido neste grupo.` });
            }
          }

          let addPrice = opt.preco ?? opt.price ?? opt.valor;
          if (addPrice === undefined && opt.channelPricing?.counter !== undefined) {
            addPrice = opt.channelPricing.counter;
          }
          if (typeof addPrice !== 'number' || !Number.isFinite(addPrice) || addPrice < 0) {
            return res.status(400).json({ success: false, error: 'INVALID_ADDITIONAL_PRICE', message: 'O preço do adicional não está configurado corretamente.' });
          }

          const addPriceCents = toCents(addPrice);
          additionalsCents += addPriceCents;
          selectedAdditionalsInItem.push({
            id: opt.id || cleanAddId,
            nome: opt.nome || opt.name || 'Adicional',
            preco: addPrice,
            grupoId: opt.grupoId,
            grupoNome: realGroupDoc?.nome || productGroupConfig?.nome || 'Adicional'
          });
        }

        const effectiveGroupsMap = new Map<string, any>();
        if (Array.isArray(pData.optionGroups)) {
          pData.optionGroups.forEach((g: any) => {
            const gId = g.groupId || g.id;
            if (gId) effectiveGroupsMap.set(gId, { ...g, groupId: gId });
          });
        }
        optionGroupsMap.forEach((gDoc, gId) => {
          if (!effectiveGroupsMap.has(gId)) {
            effectiveGroupsMap.set(gId, { ...gDoc, groupId: gId });
          } else {
            const existing = effectiveGroupsMap.get(gId);
            effectiveGroupsMap.set(gId, { ...gDoc, ...existing });
          }
        });

        effectiveGroupsMap.forEach((group, gId) => {
          const selectionsInGroup = selectedAdditionalsInItem.filter(opt => opt.grupoId === gId);
          const count = selectionsInGroup.length;

          const isRequired = group.obrigatorio === true || group.required === true || group.isRequired === true;
          const min = Number(group.min ?? group.minimum ?? group.minSelections ?? group.minimo ?? 0);
          const max = Number(group.max ?? group.maximum ?? group.maxSelections ?? group.maximo ?? 0);
          const selectionType = group.selectionType || group.tipoSelecao;
          const isSingle = selectionType === 'single' || selectionType === 'unico' || max === 1;

          const effectiveMin = isRequired ? Math.max(1, min) : min;

          if (isRequired && count < effectiveMin) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_MIN', message: `O grupo "${group.nome || 'Adicional'}" é obrigatório e exige pelo menos ${effectiveMin} seleções.` });
          }
          if (!isRequired && min > 0 && count > 0 && count < min) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_MIN', message: `O grupo "${group.nome || 'Adicional'}" exige pelo menos ${min} seleções se for escolhido.` });
          }
          if (max > 0 && count > max) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_MAX', message: `O grupo "${group.nome || 'Adicional'}" permite no máximo ${max} seleções.` });
          }
          if (isSingle && count > 1) {
            return res.status(400).json({ success: false, error: 'ADDITIONAL_GROUP_SINGLE', message: `O grupo "${group.nome || 'Adicional'}" permite apenas uma única seleção.` });
          }
        });

        const unitBasePriceCents = canonicalBasePriceCents;
        const unitPriceCents = unitBasePriceCents + additionalsCents;
        const itemTotalCents = unitPriceCents * qty;
        totalCents += itemTotalCents;

        formattedItems.push({
          id: productId,
          nome: pData.nome || pData.name || 'Produto',
          precoUnitario: fromCents(unitPriceCents),
          precoBase: fromCents(unitBasePriceCents),
          unitPriceCents: unitPriceCents,
          basePriceCents: unitBasePriceCents,
          pricingChannel: 'BALCAO',
          quantidade: qty,
          valorTotal: fromCents(itemTotalCents),
          observacao: normalizeText(item.observation, 500),
          tamanhoSelecionado: sizeObj,
          adicionaisSelecionados: selectedAdditionalsInItem
        });
      }

      if (reqPayments.length === 0) {
        normalizedPayments[0].amount = totalCents;
        if (normalizedPayments[0].paymentMethodId === 'dinheiro') {
          cashPaymentCents = totalCents;
        }
      }

      if (pago && reqPayments.length > 0 && totalPaymentsCents !== totalCents) {
        return res.status(400).json({
          success: false,
          error: 'PAYMENT_SUM_MISMATCH',
          message: `A soma das formas de pagamento (R$ ${formatPtBrCurrency(totalPaymentsCents)}) é diferente do total do pedido (R$ ${formatPtBrCurrency(totalCents)}).`
        });
      }

      let finalPago = Boolean(pago);
      let finalAmountReceivedCents = 0;
      let finalChangeAmountCents = 0;
      let settlementStatus = 'PENDING_RESTAURANT_CONFIRMATION';

      if (finalPago) {
        settlementStatus = 'SETTLED';
        if (cashPaymentCents > 0) {
          let inputReceivedCents = 0;
          if (typeof amountReceived === 'number' && Number.isFinite(amountReceived) && amountReceived >= 0) {
            inputReceivedCents = toCents(amountReceived);
          } else {
            inputReceivedCents = cashPaymentCents;
          }

          if (inputReceivedCents > 1000000) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_AMOUNT_RECEIVED',
              message: 'O valor recebido excede o limite permitido (R$ 10.000,00).'
            });
          }

          if (inputReceivedCents < cashPaymentCents) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_AMOUNT_RECEIVED',
              message: `O valor entregue em dinheiro (R$ ${formatPtBrCurrency(inputReceivedCents)}) é menor que a parcela em dinheiro (R$ ${formatPtBrCurrency(cashPaymentCents)}).`
            });
          }

          finalAmountReceivedCents = inputReceivedCents;
          finalChangeAmountCents = finalAmountReceivedCents - cashPaymentCents;
        } else {
          finalAmountReceivedCents = 0;
          finalChangeAmountCents = 0;
        }
      } else {
        finalPago = false;
        finalAmountReceivedCents = 0;
        finalChangeAmountCents = 0;
        settlementStatus = 'PENDING_RESTAURANT_CONFIRMATION';
      }

      const actionRef = db.collection('restaurants').doc(restaurantId).collection('processedActions').doc(normalizedActionId);
      const nowIso = new Date().toISOString();

      const result = await db.runTransaction(async (transaction: any) => {
        const actionSnap = await transaction.get(actionRef);
        if (actionSnap.exists) {
          const actionData = actionSnap.data();
          if (
            actionData.source !== 'COUNTER' ||
            actionData.restaurantId !== restaurantId ||
            actionData.operatorId !== operatorId
          ) {
            return {
              error: 'ACTION_ALREADY_USED',
              status: 409,
              message: 'Esta ação já foi utilizada por outra operação.'
            };
          }

          const existingOrderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(actionData.orderId);
          const existingOrderSnap = await transaction.get(existingOrderRef);
          if (!existingOrderSnap.exists) {
            return {
              error: 'IDEMPOTENCY_RECORD_INCONSISTENT',
              status: 409,
              message: 'A venda precisa ser conferida no painel antes de uma nova tentativa.'
            };
          }

          const existingOrderData = {
            ...existingOrderSnap.data(),
            id: existingOrderSnap.id
          };

          if (!isValidOrderResponse(actionData.orderId, existingOrderData)) {
            return {
              error: 'INVALID_ORDER_RESPONSE',
              status: 500,
              message: 'O pedido anterior recuperado possui dados inválidos.'
            };
          }

          return {
            alreadyProcessed: true,
            orderId: actionData.orderId,
            order: existingOrderData
          };
        }

        const counterRef = db.collection('restaurants').doc(restaurantId).collection('counters').doc('orders');
        const counterSnap = await transaction.get(counterRef);
        let nextNumber = 1;
        if (counterSnap.exists) {
          nextNumber = (counterSnap.data().value || 0) + 1;
        }
        transaction.set(counterRef, { value: nextNumber }, { merge: true });

        const newOrderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc();

        let tipoEntrega = 'balcao';
        if (serviceMode === 'DINE_IN') tipoEntrega = 'consumo_local';
        else if (serviceMode === 'PICKUP') tipoEntrega = 'retirada';

        const orderDocData: any = {
          source: 'COUNTER',
          serviceMode,
          orderStatus: 'PREPARING',
          status: 'cozinha',
          tipo_entrega: tipoEntrega,

          restaurante_id: restaurantId,
          restaurantId,
          cliente_id: null,
          cliente_nome: finalClientName,
          cliente_telefone: '',

          createdBy: {
            type: 'RESTAURANT',
            userId: operatorId,
            name: operatorName
          },
          counterContext: {
            operatorId,
            operatorName
          },

          items: formattedItems,

          valor_produtos: fromCents(totalCents),
          taxa_entrega: 0,
          valor_desconto: 0,
          valor_total: fromCents(totalCents),

          payments: normalizedPayments,
          forma_pagamento: normalizedPayments.length > 0 
            ? normalizedPayments.reduce((prev: any, current: any) => (current.amount > prev.amount) ? current : prev, normalizedPayments[0]).paymentMethodId 
            : 'dinheiro',
          pago: finalPago,
          amountReceived: fromCents(finalAmountReceivedCents),
          changeAmount: fromCents(finalChangeAmountCents),
          troco: fromCents(finalChangeAmountCents),
          financialSettlementStatus: settlementStatus,

          driverId: null,
          assignedDriverId: null,
          entregador_id: null,

          numero_pedido: nextNumber,
          orderNumber: nextNumber,
          numero: nextNumber,
          sequencial: nextNumber,

          data_criacao: nowIso,
          data_criacao_iso: nowIso,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),

          clientActionId: normalizedActionId
        };

        transaction.set(newOrderRef, orderDocData);
        transaction.set(actionRef, {
          orderId: newOrderRef.id,
          clientActionId: normalizedActionId,
          source: 'COUNTER',
          restaurantId,
          operatorId,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const createdOrderResult = {
          ...orderDocData,
          id: newOrderRef.id,
          createdAt: nowIso,
          updatedAt: nowIso
        };

        if (!isValidOrderResponse(newOrderRef.id, createdOrderResult)) {
          return {
            error: 'INVALID_ORDER_RESPONSE',
            status: 500,
            message: 'A resposta do pedido gerada é inválida.'
          };
        }

        return {
          alreadyProcessed: false,
          orderId: newOrderRef.id,
          order: createdOrderResult
        };
      });

      if (result.error) {
        return res.status(result.status || 400).json({
          success: false,
          error: result.error,
          message: result.message
        });
      }

      if (!isValidOrderResponse(result.orderId, result.order)) {
        return res.status(500).json({
          success: false,
          error: 'INVALID_ORDER_RESPONSE',
          message: 'O servidor retornou uma resposta inválida. Confira o painel de pedidos.'
        });
      }

      if (result.order.pago && !result.alreadyProcessed) {
        // Run as background promise (non-blocking)
        registerServerOrderPaymentMovement(
          restaurantId,
          result.orderId,
          result.order,
          operatorName
        ).catch(err => console.error('[Counter Finance Integration] Error:', err));
      }

      res.status(result.alreadyProcessed ? 200 : 201).json({
        success: true,
        orderId: result.orderId,
        alreadyProcessed: result.alreadyProcessed,
        order: result.order
      });
    } catch (error: any) {
      if (error.code === 'CASH_REGISTER_CLOSED') {
        return res.status(409).json({
          success: false,
          code: 'CASH_REGISTER_CLOSED',
          error: 'CASH_REGISTER_CLOSED',
          message: error.message
        });
      }
      console.error('Error creating counter order:', error);
      res.status(500).json({ success: false, error: 'SERVER_ERROR', message: error.message || 'Erro ao criar pedido do balcão.' });
    }
  });

  // --- WAITER MANAGEMENT ENDPOINTS (FASE 3) ---

  // Helper to check if waiter feature is enabled
  async function checkWaiterFeatureEnabled(restaurantId: string): Promise<boolean> {
    const docSnap = await db.collection('restaurants').doc(restaurantId).get();
    if (!docSnap.exists) return false;
    const data = docSnap.data();
    return data?.features?.waiterEnabled === true;
  }

  function normalizeWaiterPermissionsServer(raw: any = {}) {
    return {
      createOrders: raw.createOrders === true,
      editOwnOrders: raw.editOwnOrders === true,
      editOtherWaitersOrders: raw.editOtherWaitersOrders === true,
      cancelUnsentItems: raw.cancelUnsentItems === true,
      cancelSentItems: raw.cancelSentItems === true,
      applyDiscount: raw.applyDiscount === true,
      transferTable: raw.transferTable === true,
      mergeTables: raw.mergeTables === true,
      receivePayment: raw.receivePayment === true,
      closeTable: raw.closeTable === true,
      viewFinancialTotals: raw.viewFinancialTotals === true
    };
  }

  // GET: List all waiters of the logged-in restaurant
  app.get('/api/restaurant/waiters', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const isEnabled = await checkWaiterFeatureEnabled(restaurantId);
      if (!isEnabled) {
        return res.status(403).json({ error: 'A funcionalidade de Garçons não está ativada neste restaurante.' });
      }

      const snapshot = await db.collection('restaurants').doc(restaurantId).collection('waiters').get();
      const waiters = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      res.json({ success: true, waiters });
    } catch (error: any) {
      console.error('Error fetching waiters:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Create a new waiter (Backend driven creation with Auth user)
  app.post('/api/restaurant/waiters', verifyRestaurant, async (req: any, res: any) => {
    const { name, email, password, phone, photoUrl, permissions, status } = req.body;
    const restaurantId = req.user.restaurantId;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const waiterStatus = status || 'ACTIVE';
    if (!['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(waiterStatus)) {
      return res.status(400).json({ error: 'Status do garçom inválido. Use ACTIVE, INACTIVE ou BLOCKED.' });
    }

    try {
      const isEnabled = await checkWaiterFeatureEnabled(restaurantId);
      if (!isEnabled) {
        return res.status(403).json({ error: 'A funcionalidade de Garçons não está ativada neste restaurante.' });
      }

      // Check if user already exists
      try {
        await authAdmin.getUserByEmail(email);
        return res.status(409).json({ error: 'Este e-mail já está em uso por outro usuário.' });
      } catch (authErr: any) {
        if (authErr.code !== 'auth/user-not-found') {
          throw authErr;
        }
      }

      // 1. Create Auth user
      const userRecord = await authAdmin.createUser({
        email,
        password,
        displayName: name,
        disabled: waiterStatus !== 'ACTIVE'
      });

      const waiterId = userRecord.uid;
      const nowIso = new Date().toISOString();
      const finalPermissions = normalizeWaiterPermissionsServer(permissions);

      const userDocData = {
        uid: waiterId,
        nome: name,
        email,
        phone: phone || '',
        role: 'WAITER',
        tipo_usuario: 'waiter',
        restaurantId,
        waiterId,
        status: waiterStatus,
        active: waiterStatus === 'ACTIVE',
        data_criacao: nowIso,
        onboarding_completo: true,
        acceptedTerms: true
      };

      const waiterDocData = {
        id: waiterId,
        userId: waiterId,
        restaurantId,
        name,
        email,
        phone: phone || '',
        photoUrl: photoUrl || '',
        status: waiterStatus,
        accessConfigured: true,
        permissions: finalPermissions,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: {
          userId: req.user.uid,
          name: req.user.name || req.user.nome || 'Restaurante'
        },
        lastAccessAt: null
      };

      const auditLogData = {
        action: 'WAITER_CREATED',
        restaurantId,
        operatorId: req.user.uid,
        targetWaiterId: waiterId,
        waiterEmail: email,
        createdAt: nowIso
      };

      try {
        const batch = db.batch();
        batch.set(db.collection('users').doc(waiterId), userDocData);
        batch.set(db.collection('restaurants').doc(restaurantId).collection('waiters').doc(waiterId), waiterDocData);
        batch.set(db.collection('audit_logs').doc(), auditLogData);

        await batch.commit();

        res.status(201).json({ success: true, waiterId, waiter: waiterDocData });
      } catch (dbError: any) {
        // Rollback Auth user if Firestore batch fails
        console.error('Error writing waiter to Firestore batch, rolling back Auth user:', dbError);
        await authAdmin.deleteUser(waiterId).catch(err => {
          console.error('Failed to rollback Auth user deletion:', err);
        });
        throw dbError;
      }
    } catch (error: any) {
      console.error('Error creating waiter:', error);
      res.status(500).json({ error: error.message || 'Erro ao criar garçom.' });
    }
  });

  // PUT: Update waiter details and permissions (NO password field in general PUT)
  app.put('/api/restaurant/waiters/:id', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const { name, email, phone, photoUrl, permissions, status } = req.body;
    const restaurantId = req.user.restaurantId;

    if (status !== undefined && !['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use ACTIVE, INACTIVE ou BLOCKED.' });
    }

    try {
      const isEnabled = await checkWaiterFeatureEnabled(restaurantId);
      if (!isEnabled) {
        return res.status(403).json({ error: 'A funcionalidade de Garçons não está ativada neste restaurante.' });
      }

      const waiterRef = db.collection('restaurants').doc(restaurantId).collection('waiters').doc(id);
      const waiterSnap = await waiterRef.get();
      if (!waiterSnap.exists) {
        return res.status(404).json({ error: 'Garçom não encontrado.' });
      }

      const currentData = waiterSnap.data()!;
      const previousEmail = currentData.email;
      const nowIso = new Date().toISOString();

      let previousAuthUser: any = null;
      try {
        previousAuthUser = await authAdmin.getUser(id);
      } catch (authErr) {
        console.warn(`Auth user not found for waiter ${id}, continuing with Firestore updates.`);
      }

      // 1. Update Auth user if email, name or status changed
      const authUpdates: any = {};
      const isEmailChanging = email && email !== previousEmail;
      if (isEmailChanging) authUpdates.email = email;
      if (name) authUpdates.displayName = name;
      if (status !== undefined) authUpdates.disabled = status !== 'ACTIVE';

      if (previousAuthUser && Object.keys(authUpdates).length > 0) {
        await authAdmin.updateUser(id, authUpdates);
      }

      try {
        // 2. Build waiter doc updates
        const waiterUpdates: any = {
          updatedAt: nowIso
        };
        if (name !== undefined) waiterUpdates.name = name;
        if (email !== undefined) waiterUpdates.email = email;
        if (phone !== undefined) waiterUpdates.phone = phone;
        if (photoUrl !== undefined) waiterUpdates.photoUrl = photoUrl;
        if (status !== undefined) waiterUpdates.status = status;
        if (permissions !== undefined) {
          waiterUpdates.permissions = normalizeWaiterPermissionsServer({
            ...(currentData.permissions || {}),
            ...permissions
          });
        }

        // 3. Update user profile doc
        const userUpdates: any = { updatedAt: nowIso };
        if (name !== undefined) userUpdates.nome = name;
        if (email !== undefined) userUpdates.email = email;
        if (phone !== undefined) userUpdates.phone = phone;
        if (status !== undefined) {
          userUpdates.status = status;
          userUpdates.active = status === 'ACTIVE';
        }

        const batch = db.batch();
        batch.update(waiterRef, waiterUpdates);

        const userRef = db.collection('users').doc(id);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          batch.update(userRef, userUpdates);
        }

        // 4. Audit Log
        batch.set(db.collection('audit_logs').doc(), {
          action: 'WAITER_UPDATED',
          restaurantId,
          operatorId: req.user.uid,
          targetWaiterId: id,
          changedFields: Object.keys(waiterUpdates),
          createdAt: nowIso
        });

        if (status !== undefined && status !== currentData.status) {
          const statusActionMap: Record<string, string> = {
            'ACTIVE': 'WAITER_ACTIVATED',
            'INACTIVE': 'WAITER_INACTIVATED',
            'BLOCKED': 'WAITER_BLOCKED'
          };
          batch.set(db.collection('audit_logs').doc(), {
            action: statusActionMap[status] || `WAITER_STATUS_${status}`,
            restaurantId,
            operatorId: req.user.uid,
            targetWaiterId: id,
            createdAt: nowIso
          });
        }

        await batch.commit();

        res.json({ success: true, message: 'Garçom atualizado com sucesso.' });
      } catch (dbError: any) {
        if (previousAuthUser && Object.keys(authUpdates).length > 0) {
          console.error('Firestore batch update failed, rolling back Auth updates:', dbError);
          await authAdmin.updateUser(id, {
            email: previousAuthUser.email,
            displayName: previousAuthUser.displayName,
            disabled: previousAuthUser.disabled
          }).catch(err => {
            console.error('Failed to rollback Auth user updates:', err);
          });
        }
        throw dbError;
      }
    } catch (error: any) {
      console.error('Error updating waiter:', error);
      res.status(500).json({ error: error.message || 'Erro ao atualizar garçom.' });
    }
  });

  // POST: Reset waiter password
  app.post('/api/restaurant/waiters/:id/reset-password', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const { password } = req.body;
    const restaurantId = req.user.restaurantId;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
    }

    try {
      const isEnabled = await checkWaiterFeatureEnabled(restaurantId);
      if (!isEnabled) {
        return res.status(403).json({ error: 'A funcionalidade de Garçons não está ativada neste restaurante.' });
      }

      const waiterRef = db.collection('restaurants').doc(restaurantId).collection('waiters').doc(id);
      const waiterSnap = await waiterRef.get();
      if (!waiterSnap.exists) {
        return res.status(404).json({ error: 'Garçom não encontrado.' });
      }

      await authAdmin.updateUser(id, { password });

      const nowIso = new Date().toISOString();
      await db.collection('audit_logs').add({
        action: 'WAITER_PASSWORD_UPDATED',
        restaurantId,
        operatorId: req.user.uid,
        targetWaiterId: id,
        createdAt: nowIso
      });

      res.json({ success: true, message: 'Senha do garçom redefinida com sucesso.' });
    } catch (error: any) {
      console.error('Error resetting waiter password:', error);
      res.status(500).json({ error: error.message || 'Erro ao redefinir senha do garçom.' });
    }
  });

  // PATCH: Change waiter status (ACTIVE / INACTIVE / BLOCKED)
  app.patch('/api/restaurant/waiters/:id/status', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const { status } = req.body;
    const restaurantId = req.user.restaurantId;

    if (!status || !['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use ACTIVE, INACTIVE ou BLOCKED.' });
    }

    try {
      const isEnabled = await checkWaiterFeatureEnabled(restaurantId);
      if (!isEnabled) {
        return res.status(403).json({ error: 'A funcionalidade de Garçons não está ativada neste restaurante.' });
      }

      const waiterRef = db.collection('restaurants').doc(restaurantId).collection('waiters').doc(id);
      const waiterSnap = await waiterRef.get();
      if (!waiterSnap.exists) {
        return res.status(404).json({ error: 'Garçom não encontrado.' });
      }

      let previousAuthUser: any = null;
      try {
        previousAuthUser = await authAdmin.getUser(id);
        await authAdmin.updateUser(id, { disabled: status !== 'ACTIVE' });
      } catch (authErr) {
        console.warn(`Auth user not found for waiter ${id}, updating Firestore only.`);
      }

      const nowIso = new Date().toISOString();

      const batch = db.batch();
      batch.update(waiterRef, {
        status,
        updatedAt: nowIso
      });

      const userRef = db.collection('users').doc(id);
      const userSnap = await userRef.get();
      if (userSnap.exists) {
        batch.update(userRef, {
          status,
          active: status === 'ACTIVE',
          updatedAt: nowIso
        });
      }

      const statusActionMap: Record<string, string> = {
        'ACTIVE': 'WAITER_ACTIVATED',
        'INACTIVE': 'WAITER_INACTIVATED',
        'BLOCKED': 'WAITER_BLOCKED'
      };

      // Audit Log
      batch.set(db.collection('audit_logs').doc(), {
        action: statusActionMap[status] || `WAITER_STATUS_${status}`,
        restaurantId,
        operatorId: req.user.uid,
        targetWaiterId: id,
        createdAt: nowIso
      });

      try {
        await batch.commit();
        res.json({ success: true, message: `Status do garçom alterado para ${status}.` });
      } catch (dbError: any) {
        if (previousAuthUser) {
          console.error('Firestore batch update failed, rolling back Auth disabled status:', dbError);
          await authAdmin.updateUser(id, { disabled: previousAuthUser.disabled }).catch(err => {
            console.error('Failed to rollback Auth disabled status:', err);
          });
        }
        throw dbError;
      }
    } catch (error: any) {
      console.error('Error updating waiter status:', error);
      res.status(500).json({ error: error.message || 'Erro ao alterar status do garçom.' });
    }
  });

  // Middleware to verify driver token
  const verifyDriver = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Não autorizado: Token não informado' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await authAdmin.verifyIdToken(idToken);
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (!userData) {
        return res.status(403).json({ error: 'Acesso negado: Perfil do usuário não encontrado' });
      }

      const isDriverRole = userData.role === 'delivery_driver' || 
                           userData.role === 'entregador' || 
                           userData.tipo_usuario === 'delivery_driver' || 
                           userData.tipo_usuario === 'entregador';

      if (!isDriverRole) {
        return res.status(403).json({ error: 'Acesso negado: Perfil de entregador necessário' });
      }

      let restaurantId = userData.restaurantId;

      if (!restaurantId) {
        const driverQuery = await db.collectionGroup('drivers').where('userId', '==', decodedToken.uid).limit(1).get();
        if (!driverQuery.empty) {
          restaurantId = driverQuery.docs[0].data().restaurantId;
        }
      }

      if (!restaurantId) {
        return res.status(403).json({ error: 'Entregador não está vinculado a nenhum restaurante' });
      }

      // Check real driver document in subcollection
      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(decodedToken.uid);
      const driverSnap = await driverRef.get();

      if (!driverSnap.exists) {
        return res.status(403).json({ error: 'Acesso negado: Perfil de entregador não encontrado no restaurante' });
      }

      const driverData = driverSnap.data()!;
      const isActive = driverData.status === 'ACTIVE' && driverData.active !== false;

      if (!isActive) {
        return res.status(403).json({ error: 'Acesso negado: Perfil de entregador inativo ou bloqueado' });
      }

      req.driver = {
        id: decodedToken.uid,
        uid: decodedToken.uid,
        restaurantId,
        name: driverData.name || driverData.nickname || userData.nome || decodedToken.name || 'Entregador',
        phone: driverData.phone || userData.phone || userData.telefone || '',
        email: driverData.email || decodedToken.email || userData.email || '',
        status: driverData.status,
        availabilityStatus: driverData.availabilityStatus || 'OFFLINE',
        ...driverData
      };
      next();
    } catch (error: any) {
      console.error('Error verifying driver token:', error);
      res.status(401).json({ error: `Não autorizado: ${error.message}` });
    }
  };

  // POST: Assign a driver to an order
  app.post('/api/restaurant/orders/:orderId/assign-driver', verifyRestaurant, async (req: any, res: any) => {
    const { orderId } = req.params;
    const { driverId } = req.body;
    const restaurantId = req.user.restaurantId;

    if (!driverId) {
      return res.status(400).json({ error: 'driverId é obrigatório' });
    }

    try {
      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(driverId);
      const driverDoc = await driverRef.get();

      if (!driverDoc.exists) {
        return res.status(404).json({ error: 'Entregador não encontrado neste restaurante' });
      }

      const driverData = driverDoc.data()!;
      if (driverData.status !== 'ACTIVE' || driverData.active === false) {
        return res.status(400).json({ error: 'Este entregador está inativo' });
      }

      const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
      const orderDoc = await orderRef.get();

      if (!orderDoc.exists) {
        return res.status(404).json({ error: 'Pedido não encontrado' });
      }

      const orderData = orderDoc.data()!;

      // --- Item 14 Validations ---
      if (orderData.tipo_entrega === 'retirada') {
        return res.status(409).json({ error: 'Não é possível atribuir entregador para pedidos de retirada.' });
      }

      const orderStatusLower = (orderData.status || '').toLowerCase();
      if (orderStatusLower === 'cancelado' || orderStatusLower === 'cancelled') {
        return res.status(409).json({ error: 'Não é possível atribuir entregador para pedidos cancelados.' });
      }

      if (['entregue', 'delivered', 'finalizado', 'completed', 'concluido'].includes(orderStatusLower)) {
        return res.status(409).json({ error: 'Não é possível atribuir entregador para pedidos já finalizados ou entregues.' });
      }

      const hasAddress = orderData.endereco_entrega || orderData.endereco;
      if (!hasAddress) {
        return res.status(409).json({ error: 'Não é possível atribuir entregador para pedidos sem endereço de entrega.' });
      }
      // ----------------------------

      // Load restaurant settings to determine entregadorAceitaRecusa
      const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
      const restaurantData = restaurantDoc.data();
      const deliverySettings = restaurantData?.deliverySettings || { entregadorAceitaRecusa: false };
      const entregadorAceitaRecusa = deliverySettings.entregadorAceitaRecusa === true;

      const now = new Date().toISOString();

      const deliveryStatus = entregadorAceitaRecusa ? 'ASSIGNED' : 'ACCEPTED';
      const statusEntrega = entregadorAceitaRecusa ? 'waiting' : 'accepted';
      const acceptedAt = entregadorAceitaRecusa ? null : now;

      const driverName = driverData.name || driverData.nickname || 'Entregador';
      const driverPhone = driverData.phone || '';

      const batch = db.batch();

      // Preserve active status (e.g. 'saiu para entrega', 'em preparo', 'aceito') or default to 'pronto'
      const activeStatuses = ['recebido', 'aceito', 'preparo', 'em preparo', 'pronto', 'saiu para entrega', 'entrega', 'delivering', 'out_for_delivery', 'in_transit'];
      const currentStatus = activeStatuses.includes(orderStatusLower) ? orderData.status : 'pronto';

      const orderUpdates = {
        driverId: driverId,
        assignedDriverId: driverId,
        entregador_id: driverId,
        driverName: driverName,
        driverPhone: driverPhone,
        deliveryStatus: deliveryStatus,
        canonicalStatus: deliveryStatus,
        status_entrega: statusEntrega,
        status: currentStatus,
        assignedAt: now,
        acceptedAt: acceptedAt,
        updated_at: now,
        assignedBy: req.user.uid
      };

      batch.update(orderRef, orderUpdates);

      const deliveryRef = db.collection('restaurants').doc(restaurantId).collection('deliveries').doc(orderId);
      const deliverySnapshot = {
        id: orderId,
        orderId: orderId,
        restaurantId: restaurantId,
        driverId: driverId,
        assignedDriverId: driverId,
        responsibleDriverId: driverId, // permanent field for history tracking
        driverName: driverName,
        driverPhone: driverPhone,
        cliente_id: orderData.cliente_id || '',
        cliente_nome: orderData.cliente_nome || 'Cliente',
        cliente_telefone: orderData.cliente_telefone || orderData.telefone || '',
        endereco_entrega: orderData.endereco_entrega || orderData.endereco || '',
        deliveryStatus: deliveryStatus,
        canonicalStatus: deliveryStatus,
        paymentStatus: orderData.pago ? 'PAID' : 'PENDING',
        status_entrega: statusEntrega,
        status: currentStatus,
        valor_total: orderData.valor_total || 0,
        valor_produtos: orderData.valor_produtos || 0,
        taxa_entrega: orderData.taxa_entrega || 0,
        forma_pagamento: orderData.forma_pagamento || '',
        troco: orderData.troco || null,
        data_criacao: orderData.data_criacao || now,
        assignedAt: now,
        acceptedAt: acceptedAt,
        updatedAt: now
      };

      batch.set(deliveryRef, deliverySnapshot, { merge: true });

      batch.update(driverRef, {
        updatedAt: now
      });

      await batch.commit();

      try {
        const driverUserDoc = await db.collection('users').doc(driverId).get();
        const fcmToken = driverUserDoc.data()?.fcmToken;
        if (fcmToken) {
          const bodyMessage = entregadorAceitaRecusa
            ? `Você recebeu a entrega do pedido #${orderId.slice(-6).toUpperCase()}. Abra o app para aceitar/recusar.`
            : `Você recebeu a entrega do pedido #${orderId.slice(-6).toUpperCase()}. Abra o app para iniciar a entrega.`;
          await sendPush(
            fcmToken,
            "Novo Pedido Atribuído! 🛵",
            bodyMessage,
            orderId,
            "delivery_assigned"
          );
        }
      } catch (pushErr) {
        console.error('Error sending push to driver:', pushErr);
      }

      res.json({ 
        success: true, 
        message: 'Entregador atribuído com sucesso',
        requiresDriverAcceptance: entregadorAceitaRecusa,
        deliveryStatus: deliveryStatus
      });
    } catch (error: any) {
      console.error('Error assigning driver:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Execute driver delivery action
  app.post('/api/driver/orders/:orderId/action', verifyDriver, async (req: any, res: any) => {
    const { orderId } = req.params;
    const { action, reason, failureReason, clientActionId } = req.body;
    const driver = req.driver;
    const restaurantId = driver.restaurantId;

    if (!clientActionId) {
      return res.status(400).json({ error: 'clientActionId é obrigatório' });
    }

    if (!action || !['ACCEPT', 'REJECT', 'START', 'DELIVER', 'FAIL'].includes(action)) {
      return res.status(400).json({ error: 'Ação inválida. Use ACCEPT, REJECT, START, DELIVER ou FAIL' });
    }

    const getServerOrderDeliveryStatus = (orderData: any): string => {
      if (orderData.deliveryStatus) {
        return orderData.deliveryStatus.toUpperCase();
      }
      const se = orderData.status_entrega ? orderData.status_entrega.toLowerCase() : '';
      const sp = orderData.status ? orderData.status.toLowerCase() : '';

      if (se === 'waiting' || se === 'pending') {
        return 'ASSIGNED';
      }
      if (se === 'accepted') {
        return 'ACCEPTED';
      }
      if (se === 'out_for_delivery' || se === 'delivering' || sp === 'delivering') {
        return 'IN_TRANSIT';
      }
      if (se === 'delivered' || sp === 'completed' || sp === 'finalizado' || sp === 'entregue') {
        return 'DELIVERED';
      }
      if (se === 'rejected' || se === 'refused' || se === 'not_delivered' || se === 'failed') {
        return 'FAILED';
      }
      if (sp === 'cancelled' || sp === 'cancelado') {
        return 'CANCELLED';
      }
      return 'ASSIGNED';
    };

    try {
      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(driver.id);
      const actionRef = driverRef.collection('processedActions').doc(clientActionId);
      const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
      const deliveryRef = db.collection('restaurants').doc(restaurantId).collection('deliveries').doc(orderId);
      const eventRef = deliveryRef.collection('events').doc();

      const now = new Date().toISOString();

      const result = await db.runTransaction(async (transaction) => {
        // 1. Check if action already processed
        const actionDoc = await transaction.get(actionRef);
        if (actionDoc.exists) {
          return { alreadyProcessed: true };
        }

        // 2. Load order
        const orderDoc = await transaction.get(orderRef);
        if (!orderDoc.exists) {
          throw { status: 404, message: 'Pedido não encontrado' };
        }
        const orderData = orderDoc.data()!;

        // 3. Validate driver is assigned
        const isAssignedToThisDriver = 
          orderData.driverId === driver.id || 
          orderData.assignedDriverId === driver.id || 
          orderData.entregador_id === driver.id;

        if (!isAssignedToThisDriver) {
          throw { status: 403, message: 'Este pedido não está atribuído a você' };
        }

        // 4. Validate transition
        const currentStatus = getServerOrderDeliveryStatus(orderData);
        if (action === 'ACCEPT' && currentStatus !== 'ASSIGNED') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus, requestedAction: action };
        }
        if (action === 'REJECT' && currentStatus !== 'ASSIGNED') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus, requestedAction: action };
        }
        if (action === 'START' && currentStatus !== 'ACCEPTED') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus, requestedAction: action };
        }
        if (action === 'DELIVER' && currentStatus !== 'IN_TRANSIT') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus, requestedAction: action };
        }
        if (action === 'FAIL' && currentStatus !== 'IN_TRANSIT') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus, requestedAction: action };
        }

        // 5. Load driver document
        const driverDoc = await transaction.get(driverRef);
        const driverDocData = driverDoc.exists ? driverDoc.data() : null;

        // Perform Writes
        // Set processed action
        transaction.set(actionRef, {
          clientActionId,
          orderId,
          action,
          driverId: driver.id,
          restaurantId,
          processedAt: now
        });

        let orderUpdates: any = { updated_at: now };
        let deliveryUpdates: any = { updatedAt: now };
        let driverUpdates: any = { updatedAt: now };

        // Determine new status for event logging
        let newStatus = currentStatus;

        if (action === 'ACCEPT') {
          newStatus = 'ACCEPTED';
          orderUpdates.deliveryStatus = 'ACCEPTED';
          orderUpdates.canonicalStatus = 'ASSIGNED'; // keeping legacy alignment
          orderUpdates.status_entrega = 'accepted';
          orderUpdates.acceptedAt = now;

          deliveryUpdates.deliveryStatus = 'ACCEPTED';
          deliveryUpdates.canonicalStatus = 'ASSIGNED';
          deliveryUpdates.status_entrega = 'accepted';
          deliveryUpdates.acceptedAt = now;
          deliveryUpdates.lastAssignedDriverId = driver.id;
          deliveryUpdates.responsibleDriverId = driver.id;
        } else if (action === 'REJECT') {
          newStatus = 'UNASSIGNED';
          const rejectionReason = reason || failureReason || 'Recusado pelo entregador';

          orderUpdates.deliveryStatus = 'UNASSIGNED';
          orderUpdates.canonicalStatus = 'UNASSIGNED';
          orderUpdates.driverId = null;
          orderUpdates.assignedDriverId = null;
          orderUpdates.entregador_id = null;
          orderUpdates.driverName = null;
          orderUpdates.status_entrega = 'waiting';
          orderUpdates.lastRejectedDriverId = driver.id;
          orderUpdates.lastRejectionReason = rejectionReason;
          orderUpdates.lastRejectedAt = now;

          deliveryUpdates.deliveryStatus = 'REJECTED';
          deliveryUpdates.canonicalStatus = 'UNASSIGNED';
          deliveryUpdates.driverId = null;
          deliveryUpdates.assignedDriverId = null;
          deliveryUpdates.entregador_id = null;
          deliveryUpdates.status_entrega = 'waiting';
          deliveryUpdates.lastRejectedDriverId = driver.id;
          deliveryUpdates.lastRejectionReason = rejectionReason;
          deliveryUpdates.lastRejectedAt = now;
          deliveryUpdates.lastAssignedDriverId = driver.id;
          deliveryUpdates.responsibleDriverId = driver.id;

          driverUpdates.currentOrderId = null;
          driverUpdates.availabilityStatus = 'ONLINE';
        } else if (action === 'START') {
          newStatus = 'IN_TRANSIT';
          orderUpdates.orderStatus = 'OUT_FOR_DELIVERY';
          orderUpdates.canonicalStatus = 'OUT_FOR_DELIVERY';
          orderUpdates.deliveryStatus = 'IN_TRANSIT';
          orderUpdates.status_entrega = 'out_for_delivery';
          orderUpdates.status = 'delivering';
          orderUpdates.startedAt = now;
          orderUpdates.horario_saida = now;

          deliveryUpdates.deliveryStatus = 'IN_TRANSIT';
          deliveryUpdates.canonicalStatus = 'IN_TRANSIT';
          deliveryUpdates.status_entrega = 'out_for_delivery';
          deliveryUpdates.status = 'delivering';
          deliveryUpdates.startedAt = now;
          deliveryUpdates.horario_saida = now;
          deliveryUpdates.lastAssignedDriverId = driver.id;
          deliveryUpdates.responsibleDriverId = driver.id;

          driverUpdates.currentOrderId = orderId;
          driverUpdates.availabilityStatus = 'ON_DELIVERY';
        } else if (action === 'DELIVER' || action === 'DELIVERED') {
          newStatus = 'DELIVERED_PENDING_SETTLEMENT';
          
          const orderTotal = Number(orderData.valor_total || orderData.total || 0);
          const isPrepaid = orderData.pago === true || orderData.paymentStatus === 'PAID' || orderData.paymentStatus === 'SETTLED';
          const amountAlreadyPaid = isPrepaid ? orderTotal : 0;
          const amountDue = Math.max(0, orderTotal - amountAlreadyPaid);

          // Parse payment report from driver
          const paymentReportPayload = req.body.paymentReport || {};
          const paymentMethods = Array.isArray(paymentReportPayload.paymentMethods) 
            ? paymentReportPayload.paymentMethods 
            : [];
          const observation = (paymentReportPayload.observation || req.body.observation || '').trim();

          const totalReported = paymentMethods.reduce((sum: number, pm: any) => sum + (Number(pm.amount) || 0), 0);

          if (amountDue > 0 && totalReported < amountDue) {
            return res.status(400).json({ error: 'O total recebido não pode ser menor que o valor pendente do pedido.' });
          }

          const changeAmount = amountDue > 0 ? Math.max(0, totalReported - amountDue) : 0;
          const netAmountReceived = totalReported - changeAmount;

          const driverPaymentReport = {
            expectedAmount: orderTotal,
            amountAlreadyPaid,
            amountDue,
            totalReported,
            changeAmount,
            netAmountReceived,
            paymentMethods,
            observation,
            reportedAt: now,
            reportedByDriverId: driver.id,
            reportedByDriverName: driver.nome || driver.name || 'Entregador'
          };

          orderUpdates.deliveredAt = now;
          orderUpdates.horario_entrega = now;
          orderUpdates.deliveredByDriverId = driver.id;
          orderUpdates.deliveredByDriverName = driver.nome || driver.name || 'Entregador';
          orderUpdates.orderStatus = 'DELIVERED';
          orderUpdates.deliveryStatus = 'DELIVERED';
          orderUpdates.canonicalStatus = 'DELIVERED';
          orderUpdates.status_entrega = 'delivered';
          orderUpdates.status = 'entregue'; // Keeps in "entrega" column in Kanban while pending settlement
          orderUpdates.financialSettlementStatus = 'PENDING_RESTAURANT_CONFIRMATION';
          orderUpdates.driverPaymentReport = driverPaymentReport;

          deliveryUpdates.deliveredAt = now;
          deliveryUpdates.horario_entrega = now;
          deliveryUpdates.completedByDriverId = driver.id;
          deliveryUpdates.lastAssignedDriverId = driver.id;
          deliveryUpdates.responsibleDriverId = driver.id;
          deliveryUpdates.orderStatus = 'DELIVERED';
          deliveryUpdates.deliveryStatus = 'DELIVERED';
          deliveryUpdates.canonicalStatus = 'DELIVERED';
          deliveryUpdates.status_entrega = 'delivered';
          deliveryUpdates.status = 'entregue';
          deliveryUpdates.financialSettlementStatus = 'PENDING_RESTAURANT_CONFIRMATION';
          deliveryUpdates.driverPaymentReport = driverPaymentReport;

          // Audit events
          try {
            await db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId).collection('auditEvents').add({
              type: 'DELIVERY_CONFIRMED_BY_DRIVER',
              driverId: driver.id,
              driverName: driver.nome || driver.name || 'Entregador',
              driverPaymentReport,
              timestamp: now
            });
          } catch (auditErr) {
            console.warn('[DELIVER] Audit event log failed:', auditErr);
          }

          let nextOrderId: string | null = null;
          driverUpdates.totalDeliveries = FieldValue.increment(1);
          driverUpdates.lastDeliveryAt = now;

          if (driverDocData?.activeRoute?.orderIds?.length) {
            const routeOrderIds: string[] = driverDocData.activeRoute.orderIds;
            const currentRouteIdx: number = driverDocData.activeRoute.currentIndex ?? 0;
            const nextIdx = currentRouteIdx + 1;

            if (nextIdx < routeOrderIds.length) {
              nextOrderId = routeOrderIds[nextIdx];
              driverUpdates['activeRoute.currentIndex'] = nextIdx;
              driverUpdates['currentOrderId'] = nextOrderId;
              driverUpdates['availabilityStatus'] = 'ON_DELIVERY';
            } else {
              driverUpdates['activeRoute'] = FieldValue.delete();
              driverUpdates['currentOrderId'] = null;
              driverUpdates['availabilityStatus'] = 'ONLINE';
            }
          } else {
            driverUpdates['currentOrderId'] = null;
            driverUpdates['availabilityStatus'] = 'ONLINE';
          }
        } else if (action === 'FAIL') {
          newStatus = 'FAILED';
          orderUpdates.status = 'pronto';
          orderUpdates.deliveryStatus = 'FAILED';
          orderUpdates.canonicalStatus = 'FAILED';
          orderUpdates.status_entrega = 'failed';
          orderUpdates.assignedDriverId = null;
          orderUpdates.driverId = null;
          orderUpdates.entregador_id = null;
          orderUpdates.failedAt = now;
          orderUpdates.failureReason = failureReason || 'Não entregue';

          deliveryUpdates.status = 'pronto';
          deliveryUpdates.deliveryStatus = 'FAILED';
          deliveryUpdates.canonicalStatus = 'FAILED';
          deliveryUpdates.status_entrega = 'failed';
          deliveryUpdates.assignedDriverId = null;
          deliveryUpdates.driverId = null;
          deliveryUpdates.failedAt = now;
          deliveryUpdates.failureReason = failureReason || 'Não entregue';
          deliveryUpdates.failedByDriverId = driver.id;
          deliveryUpdates.lastAssignedDriverId = driver.id;
          deliveryUpdates.responsibleDriverId = driver.id;

          driverUpdates.currentOrderId = null;
          driverUpdates.availabilityStatus = 'ONLINE';
        }

        // Apply updates in transaction
        transaction.update(orderRef, orderUpdates);
        transaction.set(deliveryRef, deliveryUpdates, { merge: true });
        transaction.update(driverRef, driverUpdates);

        // Save delivery event
        const reasonStr = reason || failureReason || '';
        transaction.set(eventRef, {
          type: action,
          orderId,
          driverId: driver.id,
          restaurantId,
          previousStatus: currentStatus,
          newStatus,
          reason: reasonStr,
          createdAt: now,
          clientActionId
        });

        return { success: true, orderData };
      });

      if (result.alreadyProcessed) {
        return res.json({ 
          success: true, 
          alreadyProcessed: true, 
          message: 'Esta ação já foi processada anteriormente' 
        });
      }

      // Send Push notifications
      const orderDataSnap = result.orderData;
      try {
        if (orderDataSnap.cliente_id) {
          const clientDoc = await db.collection('users').doc(orderDataSnap.cliente_id).get();
          const clientFcm = clientDoc.data()?.fcmToken;
          if (clientFcm) {
            let title = "Atualização da Entrega 🛵";
            let body = `Seu pedido #${orderId.slice(-6).toUpperCase()} teve uma atualização no status da entrega.`;
            if (action === 'START') {
              title = "Pedido a caminho! 🛵";
              body = `O entregador ${driver.name} saiu para entregar seu pedido #${orderId.slice(-6).toUpperCase()}.`;
            } else if (action === 'DELIVER') {
              title = "Pedido Entregue! 🎉";
              body = `Seu pedido #${orderId.slice(-6).toUpperCase()} foi entregue com sucesso. Bom apetite!`;
            } else if (action === 'FAIL') {
              title = "Problema na Entrega ⚠️";
              body = `Ocorreu um problema com a entrega do seu pedido #${orderId.slice(-6).toUpperCase()}. Entre em contato com o restaurante.`;
            }
            await sendPush(clientFcm, title, body, orderId, `delivery_${action.toLowerCase()}`, '/orders');
          }
        }
      } catch (pErr) {
        console.error('Error sending client push:', pErr);
      }

      res.json({ success: true, action, message: `Ação ${action} realizada com sucesso` });
    } catch (error: any) {
      console.error('Error handling driver action transaction:', error);
      if (error && error.status) {
        return res.status(error.status).json({
          error: error.message,
          currentStatus: error.currentStatus,
          requestedAction: error.requestedAction
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Start route with multiple orders
  app.post('/api/driver/routes/start', verifyDriver, async (req: any, res: any) => {
    const { orderIds, orderedOrderIds, clientActionId } = req.body;
    const driver = req.driver;
    const restaurantId = driver.restaurantId;

    const routeOrders = orderedOrderIds || orderIds;

    if (!Array.isArray(routeOrders) || routeOrders.length === 0) {
      return res.status(400).json({ error: 'Nenhum pedido informado para a rota' });
    }

    try {
      const now = new Date().toISOString();
      const batch = db.batch();
      const routeId = `route_${Date.now()}`;

      for (const orderId of routeOrders) {
        const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderSnap.exists) {
          return res.status(404).json({ error: `Pedido ${orderId} não encontrado` });
        }
        const orderData = orderSnap.data()!;
        const isAssigned = orderData.driverId === driver.id || orderData.assignedDriverId === driver.id || orderData.entregador_id === driver.id;
        if (!isAssigned) {
          return res.status(403).json({ error: `Pedido ${orderId} não está atribuído a você` });
        }

        const updates = {
          status: 'delivering',
          deliveryStatus: 'IN_TRANSIT',
          canonicalStatus: 'IN_TRANSIT',
          status_entrega: 'out_for_delivery',
          startedAt: now,
          horario_saida: now,
          updated_at: now
        };

        batch.update(orderRef, updates);

        const deliveryRef = db.collection('restaurants').doc(restaurantId).collection('deliveries').doc(orderId);
        batch.set(deliveryRef, {
          status: 'delivering',
          deliveryStatus: 'IN_TRANSIT',
          canonicalStatus: 'IN_TRANSIT',
          status_entrega: 'out_for_delivery',
          startedAt: now,
          horario_saida: now,
          updatedAt: now
        }, { merge: true });

        try {
          if (orderData.cliente_id) {
            const clientDoc = await db.collection('users').doc(orderData.cliente_id).get();
            const clientFcm = clientDoc.data()?.fcmToken;
            if (clientFcm) {
              await sendPush(
                clientFcm,
                "Pedido a caminho! 🛵",
                `O entregador ${driver.name} saiu para entregar seu pedido #${orderId.slice(-6).toUpperCase()}.`,
                orderId,
                "delivery_in_transit"
              );
            }
          }
        } catch (pErr) {
          console.error('Error sending push on route start:', pErr);
        }
      }

      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(driver.id);
      batch.update(driverRef, {
        activeRoute: {
          id: routeId,
          orderIds: routeOrders,
          currentIndex: 0,
          createdAt: now,
          startedAt: now
        },
        currentOrderId: routeOrders[0],
        availabilityStatus: 'ON_DELIVERY',
        updatedAt: now
      });

      await batch.commit();

      res.json({ success: true, routeId, message: 'Rota iniciada com sucesso' });
    } catch (error: any) {
      console.error('Error starting route:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Settlement of payment collected by driver
  app.post('/api/restaurant/orders/:orderId/settle-driver-payment', verifyRestaurant, async (req: any, res: any) => {
    const { orderId } = req.params;
    const { receivedAmount, paymentMethods, notes, internalNotes, clientActionId } = req.body;
    const restaurantId = req.user.restaurantId;

    try {
      await requireOpenCashRegister(restaurantId);

      const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
      const deliveryRef = db.collection('restaurants').doc(restaurantId).collection('deliveries').doc(orderId);

      const orderDoc = await orderRef.get();
      if (!orderDoc.exists) {
        return res.status(404).json({ error: 'Pedido não encontrado' });
      }

      const orderData = orderDoc.data()!;

      // Verify status allows settlement
      if (orderData.financialSettlementStatus === 'SETTLED' && orderData.status === 'finalizado' && orderData.pago === true) {
        return res.status(400).json({ error: 'Este pedido já foi baixado e finalizado anteriormente.' });
      }

      const now = new Date().toISOString();
      const orderTotal = Number(orderData.valor_total || orderData.total || 0);
      const isPrepaid = (orderData.pago === true && orderData.status === 'finalizado') || orderData.paymentStatus === 'PAID';
      const amountAlreadyPaid = isPrepaid ? orderTotal : (orderData.driverPaymentReport?.amountAlreadyPaid || 0);
      const amountDue = Math.max(0, orderTotal - amountAlreadyPaid);

      let confirmedPaymentMethods: any[] = [];
      let confirmedTotal = 0;

      if (Array.isArray(paymentMethods) && paymentMethods.length > 0) {
        confirmedPaymentMethods = paymentMethods;
        confirmedTotal = paymentMethods.reduce((sum: number, pm: any) => sum + (Number(pm.amount) || 0), 0);
      } else if (receivedAmount !== undefined && receivedAmount !== null) {
        confirmedTotal = Number(receivedAmount);
        confirmedPaymentMethods = orderData.driverPaymentReport?.paymentMethods || [
          { methodId: orderData.forma_pagamento || 'dinheiro', methodName: orderData.forma_pagamento || 'Dinheiro', amount: confirmedTotal }
        ];
      } else {
        confirmedTotal = orderData.driverPaymentReport?.totalReported || orderTotal;
        confirmedPaymentMethods = orderData.driverPaymentReport?.paymentMethods || [];
      }

      const changeAmount = amountDue > 0 ? Math.max(0, confirmedTotal - amountDue) : 0;
      const netAmountReceived = confirmedTotal - changeAmount;

      const restaurantPaymentConfirmation = {
        paymentMethods: confirmedPaymentMethods,
        expectedAmount: orderTotal,
        confirmedAmount: confirmedTotal,
        changeAmount,
        netAmountReceived,
        observation: notes || '',
        internalObservation: internalNotes || '',
        confirmedAt: now,
        confirmedByUserId: req.user.uid,
        confirmedByUserName: req.user.nome || req.user.displayName || req.user.email || 'Restaurante'
      };

      const batch = db.batch();

      const orderUpdates = {
        orderStatus: 'FINALIZED',
        deliveryStatus: 'DELIVERED',
        financialSettlementStatus: 'SETTLED',
        financialSettledAt: now,
        financialSettledByUserId: req.user.uid,
        financialSettledByUserName: req.user.nome || req.user.displayName || req.user.email || 'Restaurante',
        restaurantPaymentConfirmation,
        canonicalStatus: 'FINALIZED',
        status: 'finalizado',
        status_entrega: 'delivered',
        pago: true,
        paymentStatus: 'SETTLED',
        data_finalizado: now,
        updated_at: now
      };

      const deliveryUpdates = {
        orderStatus: 'FINALIZED',
        deliveryStatus: 'DELIVERED',
        financialSettlementStatus: 'SETTLED',
        financialSettledAt: now,
        financialSettledByUserId: req.user.uid,
        financialSettledByUserName: req.user.nome || req.user.displayName || req.user.email || 'Restaurante',
        restaurantPaymentConfirmation,
        canonicalStatus: 'FINALIZED',
        status: 'finalizado',
        status_entrega: 'delivered',
        pago: true,
        paymentStatus: 'SETTLED',
        updatedAt: now
      };

      batch.update(orderRef, orderUpdates);
      batch.set(deliveryRef, deliveryUpdates, { merge: true });

      await batch.commit();

      // Log financial logs & launches
      try {
        await db.collection('restaurants').doc(restaurantId).collection('financialLogs').add({
          orderId,
          type: 'FINANCIAL_SETTLEMENT_CONFIRMED',
          receivedAmount: netAmountReceived,
          expectedAmount: orderTotal,
          driverPaymentReport: orderData.driverPaymentReport || null,
          restaurantPaymentConfirmation,
          driverId: orderData.driverId || orderData.assignedDriverId || null,
          driverName: orderData.driverName || 'Entregador',
          settledBy: req.user.uid,
          notes: notes || '',
          internalNotes: internalNotes || '',
          clientActionId: clientActionId || null,
          createdAt: now
        });

        for (const pm of confirmedPaymentMethods) {
          await db.collection('restaurants').doc(restaurantId).collection('financial_launches').add({
            orderId,
            type: 'INCOME',
            category: 'DELIVERY_SALE',
            paymentMethodId: pm.methodId || 'outro',
            paymentMethodName: pm.methodName || 'Forma de Pagamento',
            amount: Number(pm.amount) || 0,
            status: 'CONFIRMED',
            settledByUserId: req.user.uid,
            createdAt: now
          });

          // Register in the active cash register (caixas)
          const paymentOrderData = {
            ...orderData,
            forma_pagamento: pm.methodId || 'outro',
            valor_total: Number(pm.amount) || 0
          };
          await registerServerOrderPaymentMovement(
            restaurantId,
            orderId,
            paymentOrderData,
            req.user.nome || req.user.displayName || req.user.email || 'Sistema'
          ).catch(err => console.error('[Driver Settlement Finance Integration] Error:', err));
        }
      } catch (logErr) {
        console.warn('Error recording financial log:', logErr);
      }

      // Send push notification to driver if driver user exists
      const driverId = orderData.driverId || orderData.assignedDriverId;
      if (driverId) {
        try {
          const driverUserDoc = await db.collection('users').doc(driverId).get();
          const driverFcm = driverUserDoc.data()?.fcmToken;
          if (driverFcm) {
            await sendPush(
              driverFcm,
              "Baixa Confirmada! 💰",
              `A baixa do valor do pedido #${orderId.slice(-6).toUpperCase()} foi confirmada pelo restaurante.`,
              orderId,
              "payment_settled",
              "/entregador"
            );
          }
        } catch (dErr) {
          console.warn('Error notifying driver of settlement:', dErr);
        }
      }

      res.json({
        success: true,
        message: 'Baixa financeira e finalização concluídas com sucesso',
        settledAt: now
      });
    } catch (error: any) {
      if (error.code === 'CASH_REGISTER_CLOSED') {
        return res.status(409).json({
          code: 'CASH_REGISTER_CLOSED',
          message: error.message,
          error: error.message
        });
      }
      console.error('Error settling driver payment:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Migration of legacy orders
  app.post('/api/admin/migrate-orders', async (req: any, res: any) => {
    const { dryRun = true, restaurantId } = req.body;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação necessário' });
    }

    try {
      const idToken = authHeader.split('Bearer ')[1];
      const decoded = await authAdmin.verifyIdToken(idToken);
      const userDoc = await db.collection('users').doc(decoded.uid).get();
      const userData = userDoc.data();

      if (!userData || (userData.role !== 'admin' && userData.tipo_usuario !== 'admin' && userData.role !== 'restaurant_owner')) {
        return res.status(403).json({ error: 'Acesso negado: Permissão administrativa necessária' });
      }

      const targetRestaurantId = restaurantId || userData.restaurantId || decoded.uid;
      const ordersRef = db.collection('restaurants').doc(targetRestaurantId).collection('orders');
      const snapshot = await ordersRef.get();

      let totalExamined = 0;
      let totalUpdated = 0;
      const simulationLogs: any[] = [];

      const batches: any[] = [db.batch()];
      let operationCount = 0;
      let currentBatchIdx = 0;

      for (const orderDoc of snapshot.docs) {
        totalExamined++;
        const data = orderDoc.data();
        const updates: any = {};

        if (!data.deliveryStatus) {
          if (data.status === 'out_for_delivery' || data.status_entrega === 'out_for_delivery' || data.status === 'delivering') {
            updates.deliveryStatus = 'IN_TRANSIT';
            updates.canonicalStatus = 'IN_TRANSIT';
          } else if (data.status === 'delivered' || data.status_entrega === 'delivered' || data.status === 'completed' || data.status === 'entregue') {
            updates.deliveryStatus = 'DELIVERED';
            updates.canonicalStatus = 'DELIVERED';
          } else if (data.status === 'accepted' || data.status === 'aceito') {
            updates.deliveryStatus = 'ACCEPTED';
            updates.canonicalStatus = 'ASSIGNED';
          } else if (data.driverId || data.assignedDriverId || data.entregador_id) {
            updates.deliveryStatus = 'ASSIGNED';
            updates.canonicalStatus = 'ASSIGNED';
          } else {
            updates.deliveryStatus = 'UNASSIGNED';
            updates.canonicalStatus = 'UNASSIGNED';
          }
        }

        if (!data.paymentStatus) {
          if (data.pago) {
            updates.paymentStatus = 'SETTLED';
          } else if (data.paymentCollectedByDriver) {
            updates.paymentStatus = 'AWAITING_DRIVER_SETTLEMENT';
          } else {
            updates.paymentStatus = 'PENDING';
          }
        }

        if (!data.assignedDriverId && (data.driverId || data.entregador_id)) {
          updates.assignedDriverId = data.driverId || data.entregador_id;
        }

        if (Object.keys(updates).length > 0) {
          totalUpdated++;
          simulationLogs.push({
            orderId: orderDoc.id,
            original: {
              status: data.status,
              status_entrega: data.status_entrega,
              pago: data.pago,
              driverId: data.driverId
            },
            proposedUpdates: updates
          });

          if (!dryRun) {
            batches[currentBatchIdx].update(orderDoc.ref, updates);
            operationCount++;
            if (operationCount >= 400) {
              batches.push(db.batch());
              currentBatchIdx++;
              operationCount = 0;
            }
          }
        }
      }

      if (!dryRun) {
        for (const batch of batches) {
          await batch.commit();
        }
      }

      res.json({
        success: true,
        dryRun,
        restaurantId: targetRestaurantId,
        totalExamined,
        totalUpdated,
        simulationLogs: simulationLogs.slice(0, 50)
      });
    } catch (err: any) {
      console.error('Error migrating orders:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST: Update driver availability status
  app.post('/api/driver/availability', verifyDriver, async (req: any, res: any) => {
    const { availabilityStatus, clientActionId } = req.body;
    const driver = req.driver;
    const restaurantId = driver.restaurantId;

    if (!availabilityStatus || !['ONLINE', 'OFFLINE'].includes(availabilityStatus)) {
      return res.status(400).json({ error: 'Status de disponibilidade inválido. Use ONLINE ou OFFLINE' });
    }

    if (!clientActionId) {
      return res.status(400).json({ error: 'clientActionId é obrigatório' });
    }

    try {
      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(driver.id);
      const actionRef = driverRef.collection('processedActions').doc(clientActionId);

      const now = new Date().toISOString();

      const result = await db.runTransaction(async (transaction) => {
        const actionDoc = await transaction.get(actionRef);
        if (actionDoc.exists) {
          return { alreadyProcessed: true };
        }

        transaction.set(actionRef, {
          clientActionId,
          type: 'DRIVER_AVAILABILITY',
          availabilityStatus,
          processedAt: now
        });

        transaction.update(driverRef, {
          availabilityStatus,
          updatedAt: now
        });

        return { success: true };
      });

      res.json({ success: true, availabilityStatus, alreadyProcessed: result.alreadyProcessed });
    } catch (error: any) {
      console.error('Error updating driver availability:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Update driver GPS location
  app.post('/api/driver/location', verifyDriver, async (req: any, res: any) => {
    const { latitude, longitude, accuracy, heading, speed, timestamp, activeOrderIds } = req.body;
    const driver = req.driver;
    const restaurantId = driver.restaurantId;

    if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Coordenadas de GPS inválidas' });
    }

    try {
      const now = new Date().toISOString();
      const recordedAt = timestamp || now;

      const batch = db.batch();
      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(driver.id);

      const locationData = {
        latitude,
        longitude,
        accuracy: accuracy || 0,
        heading: heading || null,
        speed: speed || null,
        recordedAt,
        receivedAt: now
      };

      batch.update(driverRef, {
        lastLocation: locationData,
        updatedAt: now
      });

      if (Array.isArray(activeOrderIds) && activeOrderIds.length > 0) {
        for (const orderId of activeOrderIds) {
          const deliveryRef = db.collection('restaurants').doc(restaurantId).collection('deliveries').doc(orderId);
          batch.set(deliveryRef, {
            currentLocation: locationData,
            updatedAt: now
          }, { merge: true });
        }
      }

      await batch.commit();

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error updating driver location:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // API route to send push notifications
  app.post('/api/notifications/send', async (req, res) => {
    const { token, title, body, orderId, type, restaurantId } = req.body;

    if (!token || !title || !body) {
      return res.status(400).json({ error: 'Token, title and body are required' });
    }

    try {
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

      // 1. Send Push Notification
      const pushResult = await messaging.send(message);

      // WhatsApp notification removed intentionally for clients.
      
      // 2. Send Email if it's a status update to the client
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
      res.status(500).json({ error: error.message });
    }
  });

  // API route to send push notifications to all users
  app.post('/api/admin/send-notifications', verifyAdmin, async (req, res) => {
    const { title, body, link } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    try {
      const result = await sendPushNotification(title, body, link);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Error sending push notifications:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Mercado Pago PIX Creation
  app.post('/api/payments/mercadopago/create', async (req, res) => {
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
      
      const items = orderData.itens?.map((item: any) => ({
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
        error: error.message || 'Erro interno ao criar pagamento',
        details: error.response || error.cause || null
      });
    }
  });

  // Mercado Pago Refund
  app.post('/api/payments/mercadopago/refund', async (req, res) => {
    const { restaurantId, orderId, amount } = req.body;

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
        error: error.message || 'Erro interno ao estornar pagamento',
        details: error.response || error.cause || null
      });
    }
  });

  // Mercado Pago Webhook
  app.post('/api/payments/mercadopago/webhook', async (req, res) => {
    const { restaurantId } = req.query;
    const { action, data, type } = req.body;

    console.log(`[Webhook MP] Recebido: action=${action}, type=${type}, restaurantId=${restaurantId}`);

    // Mercado Pago envia notificações de vários tipos, nos interessa 'payment'
    if (type === 'payment' || action === 'payment.updated' || action === 'payment.created') {
      const paymentId = data?.id || req.body.id;

      if (!paymentId || !restaurantId) {
        return res.status(400).send();
      }

      try {
        // 1. Fetch restaurant settings to get access token
        const restaurantDoc = await db.collection('restaurants').doc(restaurantId as string).get();
        if (!restaurantDoc.exists) return res.status(404).send();
        const restaurantData = restaurantDoc.data()!;

        // 2. Fetch payment details from Mercado Pago
        const client = new MercadoPagoConfig({ accessToken: restaurantData.mercadopago_access_token });
        const payment = new Payment(client);
        const mpPayment = await payment.get({ id: paymentId });

        const orderId = mpPayment.external_reference;
        const status = mpPayment.status;

        // Log the webhook
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
            
            // Se o pedido já está pago e o webhook é de uma tentativa de pagamento diferente
            // ou é um webhook atrasado de rejeição para o mesmo pagamento, ignoramos.
            if (orderData.pago && status !== 'approved' && status !== 'refunded' && status !== 'charged_back') {
              console.log(`[Webhook MP] Pedido ${orderId} já está pago. Ignorando status ${status} do pagamento ${paymentId}.`);
              return res.status(200).send();
            }

            if (status === 'approved' && !orderData.pago) {
              await orderRef.update({
                pago: true,
                mercadopago_status: 'approved',
                mercadopago_payment_id: paymentId, // Atualiza para o ID que realmente aprovou
                data_pagamento: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
              console.log(`[Webhook MP] Pedido ${orderId} marcado como PAGO.`);

              // Register in active cash register
              await registerServerOrderPaymentMovement(
                restaurantId as string,
                orderId,
                { ...orderData, pago: true },
                'Mercado Pago Webhook'
              ).catch(err => console.error('[Webhook Finance Integration Error]:', err));

              // Notificar cliente sobre pagamento aprovado
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
              // Se foi cancelado ou rejeitado, garantimos que está desmarcado
              // Isso atende ao requisito: "desmarcada para pagamento cancelado ou rejeitado"
              await orderRef.update({
                pago: false,
                mercadopago_status: status,
                updated_at: new Date().toISOString()
              });
              console.log(`[Webhook MP] Pedido ${orderId} DESMARCADO como pago (status: ${status}).`);

              // Register refund in active cash register if refunded or charged back
              if (['refunded', 'charged_back'].includes(status)) {
                await registerServerOrderRefundMovement(
                  restaurantId as string,
                  orderId,
                  orderData,
                  'Mercado Pago Webhook'
                ).catch(err => console.error('[Webhook Refund Finance Integration Error]:', err));
              }

              // Notificar cliente sobre alteração no status do pagamento
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
              // Atualiza o status do mercadopago, mas mantém a transação "aberta" (não altera 'pago')
              // até que um status 'approved' chegue ou o pedido seja cancelado manualmente.
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

    // Mercado Pago exige retorno 200 ou 201
    res.status(200).send('OK');
  });

  // Mercado Pago Credentials Validation
  app.post('/api/payments/mercadopago/validate', async (req, res) => {
    const { accessToken, publicKey } = req.body;

    if (!accessToken || !publicKey) {
      return res.status(400).json({ error: 'Access Token e Public Key são obrigatórios para validação' });
    }

    try {
      // Validate Access Token by trying to initialize and make a simple request
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

      // Simple format check for Public Key (starts with APP_USR- or TEST-)
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

  async function sendPushNotification(title: string, body: string, link?: string) {
    // 1. Fetch all users with an FCM token
    const usersSnapshot: QuerySnapshot = await db.collection('users').where('fcmToken', '>', '').get();
    const tokens: string[] = [];
    const tokenToUid: { [token: string]: string } = {};

    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken) {
        tokens.push(data.fcmToken);
        tokenToUid[data.fcmToken] = doc.id;
      }
    });

    if (tokens.length === 0) {
      return { sentCount: 0, failureCount: 0 };
    }

    // 2. Send notifications in batches of 500 (multicast limit)
    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const response: BatchResponse = await messaging.sendEachForMulticast({
        tokens: batch,
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

      // 3. Identify invalid tokens
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (errorCode === 'messaging/registration-token-not-registered' || 
              errorCode === 'messaging/invalid-registration-token') {
            invalidTokens.push(batch[idx]);
          }
        }
      });
    }

    // 4. Remove invalid tokens from Firestore
    if (invalidTokens.length > 0) {
      const batch: WriteBatch = db.batch();
      invalidTokens.forEach(token => {
        const uid = tokenToUid[token];
        if (uid) {
          batch.update(db.collection('users').doc(uid), {
            fcmToken: FieldValue.delete()
          });
        }
      });
      await batch.commit();
    }

    return { successCount, failureCount, removedTokensCount: invalidTokens.length };
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) return next();
      
      try {
        const url = req.originalUrl;
        let template = await fs.readFile(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        
        // Parse slug
        const pathOnly = url.split('?')[0];
        const parts = pathOnly.split('/').filter(Boolean);
        const slug = parts[0];
        const knownRoutes = ['restaurantes', 'cart', 'checkout', 'profile', 'orders', 'favorites', 'admin-dashboard', 'onboarding', 'login', 'register'];

        let title = 'Qfomeai';
        let description = 'Aplicativo de Delivery Qfomeai';
        let image = '/logo-og.png';
        const protocol = req.get('host')?.includes('localhost') ? 'http' : 'https';
        const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;
        const baseUrl = `${protocol}://${req.get('host')}`;

        if (slug && !knownRoutes.includes(slug)) {
          try {
            const snapshot = await db.collection('restaurants').where('slug', '==', slug).limit(1).get();
            if (!snapshot.empty) {
              const restaurant = snapshot.docs[0].data();
              title = `${restaurant.nome} | Qfomeai`;
              description = restaurant.descricao || `Faça seu pedido no ${restaurant.nome} pelo Qfomeai!`;
              image = restaurant.logoUrl || restaurant.logo_url || restaurant.capaUrl || restaurant.capa_url || '/logo-og.png';
            }
          } catch (dbError) {
            console.warn(`Could not fetch restaurant data for SSR (slug: ${slug}):`, dbError);
            // Fallback to defaults
          }
        }

        // Ensure image is absolute URL
        if (image.startsWith('/')) {
          image = `${baseUrl}${image}`;
        }

        let html = template
          .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
          .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${title}" />`)
          .replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${description}" />`)
          .replace(/<meta property="og:image" content=".*?" \/>/, `<meta property="og:image" content="${image}" />`)
          .replace(/<\/head>/, `<meta property="og:image:secure_url" content="${image}" />\n    <meta property="og:image:type" content="image/png" />\n    <meta property="og:url" content="${fullUrl}" />\n    <meta property="og:type" content="website" />\n  </head>`);

        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) return next();
      
      try {
        const url = req.originalUrl;
        let template = await fs.readFile(path.resolve(distPath, 'index.html'), 'utf-8');
        
        // Parse slug
        const pathOnly = url.split('?')[0];
        const parts = pathOnly.split('/').filter(Boolean);
        const slug = parts[0];
        const knownRoutes = ['restaurantes', 'cart', 'checkout', 'profile', 'orders', 'favorites', 'admin-dashboard', 'onboarding', 'login', 'register'];

        let title = 'Qfomeai';
        let description = 'Aplicativo de Delivery Qfomeai';
        let image = '/logo-og.webp';
        const protocol = req.get('host')?.includes('localhost') ? 'http' : 'https';
        const fullUrl = `${protocol}://${req.get('host')}${req.originalUrl}`;
        const baseUrl = `${protocol}://${req.get('host')}`;

        if (slug && !knownRoutes.includes(slug)) {
          try {
            const snapshot = await db.collection('restaurants').where('slug', '==', slug).limit(1).get();
            if (!snapshot.empty) {
              const restaurant = snapshot.docs[0].data();
              title = `${restaurant.nome} | Qfomeai`;
              description = restaurant.descricao || `Faça seu pedido no ${restaurant.nome} pelo Qfomeai!`;
              image = restaurant.logoUrl || restaurant.logo_url || restaurant.capaUrl || restaurant.capa_url || '/logo-og.png';
            }
          } catch (dbError) {
            console.warn(`Could not fetch restaurant data for SSR (slug: ${slug}):`, dbError);
            // Fallback to defaults
          }
        }

        // Ensure image is absolute URL
        if (image.startsWith('/')) {
          image = `${baseUrl}${image}`;
        }

        let html = template
          .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
          .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${title}" />`)
          .replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${description}" />`)
          .replace(/<meta property="og:image" content=".*?" \/>/, `<meta property="og:image" content="${image}" />`)
          .replace(/<\/head>/, `<meta property="og:image:secure_url" content="${image}" />\n    <meta property="og:image:type" content="image/png" />\n    <meta property="og:url" content="${fullUrl}" />\n    <meta property="og:type" content="website" />\n  </head>`);

        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
    // Run connection test in background after server starts
    testFirestoreConnection().catch(err => console.error('Background Firestore test failed:', err));
    
    // Start the background job to automatically cancel orders older than 5 minutes
    // Now done on-demand per authenticated restaurant via /api/orders/check-timeout to avoid global loop
    console.log('[Order Timeout] Global loop disabled. Checking on-demand per authenticated tenant.');
  });
}

startServer();
