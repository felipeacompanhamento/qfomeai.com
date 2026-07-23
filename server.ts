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
import { requestIdMiddleware } from './server/external-api/middleware/requestId.js';
import externalHealthRoutes from './server/external-api/routes/externalHealthRoutes.js';
import internalClaimTokenRoutes from './server/external-api/routes/internalClaimTokenRoutes.js';
import { externalErrorHandler } from './server/external-api/middleware/externalErrorHandler.js';

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

const messaging: Messaging = getMessaging(adminApp);

// Helper to send push notifications from server
async function sendPush(token: string, title: string, body: string, orderId?: string, type?: string) {
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

    await messaging.send(message);
    console.log(`[Push] Notificação enviada para ${token}`);
  } catch (error) {
    console.error('[Push] Erro ao enviar notificação:', error);
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

function startOrderTimeoutChecker() {
  // Run every 1 minute
  setInterval(async () => {
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

      // Query all restaurants first to avoid collectionGroup index requirement
      console.log('[Order Timeout] Fetching restaurants...');
      const restaurantsSnapshot = await db.collection('restaurants').get();
      console.log(`[Order Timeout] Found ${restaurantsSnapshot.size} restaurants.`);
      
      for (const restDoc of restaurantsSnapshot.docs) {
        const restaurantData = restDoc.data();
        
        // We only care about restaurants with MP enabled for this specific task
        console.log(`[Order Timeout] Checking orders for restaurant ${restDoc.id}...`);
        try {
          const pendingOrdersSnapshot = await restDoc.ref.collection('orders')
            .where('status', '==', 'pendente')
            .where('forma_pagamento', '==', 'pix')
            .where('pago', '==', false)
            .get();
          console.log(`[Order Timeout] Found ${pendingOrdersSnapshot.size} pending orders for restaurant ${restDoc.id}.`);
          
          if (pendingOrdersSnapshot.empty) continue;
          
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
            }
          }
        } catch (err) {
          console.error(`[Order Timeout] Error checking orders for restaurant ${restDoc.id}:`, err);
        }
      }
    } catch (error) {
      console.error('[Order Timeout] Error checking order timeouts:', error);
    }
  }, 60 * 1000);
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  const port = process.env.PORT || 8080;

  app.use(express.json());
  app.use(requestIdMiddleware);

  // External Delivery API v1 Routes
  app.use('/api/v1/external', externalHealthRoutes);
  app.use('/api/v1/restaurants', internalClaimTokenRoutes);

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
        isExistingUser = true;

        // If password is provided, update it so the driver can log in with current credentials
        if (password) {
          await authAdmin.updateUser(driverId, { password, displayName: name });
        }
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

  // DELETE: Remove/un-register a driver
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

      // 1. Delete from Auth
      try {
        await authAdmin.deleteUser(id);
      } catch (authError) {
        console.warn('Auth user already deleted or not found:', authError);
      }

      // 2. Delete driver doc in subcollection
      await driverRef.delete();

      // 3. Delete users/{id} doc
      await db.collection('users').doc(id).delete();

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting driver:', error);
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

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    // Run connection test in background after server starts
    testFirestoreConnection().catch(err => console.error('Background Firestore test failed:', err));
    
    // Start the background job to automatically cancel orders older than 5 minutes
    startOrderTimeoutChecker();
  });
}

startServer();
