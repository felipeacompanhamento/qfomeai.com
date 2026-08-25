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
import { isProductAvailableForChannelData, getProductPriceForChannelData, resolveCounterUnitPriceCents } from './src/shared/productChannels';
import { validatePermissionsForRole, getDefaultPermissionsForRole, getAllowedPermissionsForRole, normalizeLegacyPermissions, hasPermission } from './src/domain/permissions/canonicalPermissions';
import { normalizePaymentMethodId, extractConfiguredPaymentMethods } from './server/constants/payment';
import { sanitizeForFirestore, removeUndefinedRecursively } from './server/utils/sanitize';
import { logger, requestIDMiddleware, requestLoggerMiddleware } from './server/utils/logger';
import { metricsRegistry, metricsMiddleware } from './server/utils/metrics';
import { alertManager } from './server/utils/alerts';
import {
  registerServerOrderPaymentMovement as registerServerOrderPaymentMovementUtil,
  registerServerOrderRefundMovement as registerServerOrderRefundMovementUtil,
  loadRestaurantCounterPaymentMethods as loadRestaurantCounterPaymentMethodsUtil,
  requireOpenCashRegister as requireOpenCashRegisterUtil
} from './server/utils/cashRegister';
import { sendPush as sendPushUtil } from './server/utils/push';
import { sendWhatsAppMessage as sendWhatsAppMessageUtil } from './server/utils/whatsapp';
import { sendActivationEmail, sendStatusUpdateEmail } from './server/utils/email';
import {
  parseGoogleAddressComponents,
  normalizeText,
  calculateDistanceMeters,
  cleanInvalidAddressValue,
  getConfidenceLevel,
  buildAddressConfidenceScore,
  selectBestAddressCandidate
} from './server/utils/geo';
import { checkOrdersTimeoutForRestaurant as checkOrdersTimeoutForRestaurantUtil } from './server/utils/orderTimeout';
import { logDriverAudit as logDriverAuditUtil, logDriverResolutionAudit as logDriverResolutionAuditUtil } from './server/utils/audit';
import {
  getPrimaryOwnerUidForRestaurant as getPrimaryOwnerUidForRestaurantUtil,
  validatePrimaryOwnerRequest as validatePrimaryOwnerRequestUtil
} from './server/utils/owner';
import {
  normalizeWaiterPermissionsServer,
  extractServerCommonData,
  extractServerRoleSpecificData,
  checkServerProfileCompleteness
} from './server/validators/teamValidators';
import { createVerifyAdmin, createVerifyRestaurant, createVerifyDriver } from './server/middleware/auth';
import { createDriverRouter } from './server/routes/driverRoutes';
import { createAccountsRouter } from './server/routes/accountsRoutes';
import { createKitchenRouter } from './server/routes/kitchenRoutes';
import { createOrderFinanceRouter } from './server/routes/orderFinanceRoutes';
import { createCashRegisterRouter } from './server/routes/cashRegisterRoutes';
import { createTabRouter } from './server/routes/tabRoutes';
import { createOrderRouter } from './server/routes/orderRoutes';
import { createReportRouter } from './server/routes/reportRoutes';
import { createTeamRouter } from './server/routes/teamRoutes';
import { createCleanupRouter } from './server/routes/cleanupRoutes';
import { createSettingsRouter } from './server/routes/settingsRoutes';
import { createCounterRouter } from './server/routes/counterRoutes';
import { createStockRouter } from './server/routes/stockRoutes';
import { createMercadoPagoRouter } from './server/routes/mercadoPagoRoutes';
import { createNotificationRouter } from './server/routes/notificationRoutes';
import { createGeoRouter } from './server/routes/geoRoutes';
import { createAdminRouter } from './server/routes/adminRoutes';


// Catch unhandled rejections to prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
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
      logger.info('Firebase Admin credential loaded from FIREBASE_SERVICE_ACCOUNT_KEY secret.');
    } catch (parseError: any) {
      logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:', { error: parseError.message });
      logger.warn('Falling back to applicationDefault() credentials.');
      credential = admin.credential.applicationDefault();
    }
  } else {
    credential = admin.credential.applicationDefault();
    logger.info('No FIREBASE_SERVICE_ACCOUNT_KEY found. Using applicationDefault() credentials.');
  }

  if (admin.apps.length === 0) {
    adminApp = admin.initializeApp({
      credential: credential,
      projectId: projectId
    });
    logger.info(`Firebase Admin initialized successfully for project: ${projectId}`);
  } else {
    adminApp = admin.app();
    logger.info('Firebase Admin already initialized');
  }
} catch (error: any) {
  logger.error('Error initializing Firebase Admin:', { error: error.message });
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
    logger.info(`Initialized Firestore with named database: ${databaseId}`);
  } else {
    db = getFirestore(adminApp);
    logger.info('Initialized Firestore with (default) database');
  }
} catch (e: any) {
  logger.warn(`Failed to initialize Firestore with database ${firebaseConfig.firestoreDatabaseId}, falling back to default:`, { error: e.message });
  db = getFirestore(adminApp);
  logger.info('Initialized Firestore with (default) database (fallback)');
}

const messaging: Messaging = getMessaging(adminApp);
const authAdmin: Auth = admin.auth(adminApp);

const registerServerOrderPaymentMovement = (restaurantId: string, orderId: string, orderData: any, createdBy: string) =>
  registerServerOrderPaymentMovementUtil(db, restaurantId, orderId, orderData, createdBy);

const registerServerOrderRefundMovement = (restaurantId: string, orderId: string, orderData: any, createdBy: string, targetPaymentId?: string) =>
  registerServerOrderRefundMovementUtil(db, restaurantId, orderId, orderData, createdBy, targetPaymentId);

const loadRestaurantCounterPaymentMethods = (restaurantId: string, serviceMode: 'COUNTER' | 'PICKUP' | 'DINE_IN') =>
  loadRestaurantCounterPaymentMethodsUtil(db, restaurantId, serviceMode);

const requireOpenCashRegister = (restaurantId: string, transaction?: any) =>
  requireOpenCashRegisterUtil(db, restaurantId, transaction);

const sendPush = (token: string, title: string, body: string, orderId?: string, type?: string, targetUrl?: string) =>
  sendPushUtil(messaging, db, token, title, body, orderId, type, targetUrl);

const sendWhatsAppMessage = (phone: string, text: string, restaurantId: string) =>
  sendWhatsAppMessageUtil(db, phone, text, restaurantId);

const checkOrdersTimeoutForRestaurant = (restaurantId: string) =>
  checkOrdersTimeoutForRestaurantUtil(db, sendPush, restaurantId);

const logDriverAudit = (params: any) => logDriverAuditUtil(db, params);
const logDriverResolutionAudit = (params: any) => logDriverResolutionAuditUtil(db, params);

const getPrimaryOwnerUidForRestaurant = (restaurantId: string) => getPrimaryOwnerUidForRestaurantUtil(db, restaurantId);
const validatePrimaryOwnerRequest = (req: any, res: any, targetRestaurantId: string) => validatePrimaryOwnerRequestUtil(db, req, res, targetRestaurantId);

const verifyAdmin = createVerifyAdmin(authAdmin, db);
const verifyRestaurant = createVerifyRestaurant(authAdmin, db);
const verifyDriver = createVerifyDriver(authAdmin, db);


// Test Firestore connection on startup
async function testFirestoreConnection() {
  try {
    const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)' 
      ? firebaseConfig.firestoreDatabaseId 
      : '(default)';
      
    logger.info(`Testing Firebase Admin connection...`);
    logger.info(`Project: ${firebaseConfig.projectId}`);
    logger.info(`Database: ${databaseId}`);
    
    // Test Auth first
    try {
      const authTest = await authAdmin.listUsers(1);
      logger.info('Successfully connected to Firebase Auth.');
    } catch (authError: any) {
      logger.error('Firebase Auth test failed:', { error: authError.message });
      if (authError.code === 'auth/insufficient-permission' || authError.message.includes('permission denied')) {
        logger.error('CRITICAL: Firebase Auth PERMISSION_DENIED. Check service account IAM roles.');
      }
    }

    // Test Firestore
    try {
      // Try to get a document from 'users' to verify permissions
      const snapshot = await db.collection('users').limit(1).get();
      logger.info(`Successfully connected to Firestore. Found ${snapshot.size} users in 'users' collection.`);
      
      // Also test 'restaurants' collection
      const restSnapshot = await db.collection('restaurants').limit(1).get();
      logger.info(`Successfully connected to Firestore. Found ${restSnapshot.size} restaurants in 'restaurants' collection.`);
    } catch (firestoreError: any) {
      logger.error('Firestore test failed:', { error: firestoreError.message });
      if (firestoreError.code === 7 || firestoreError.message.includes('permission denied')) {
        logger.error('CRITICAL: Firestore PERMISSION_DENIED. Check service account IAM roles.');
        logger.error('Ensure the service account has "Cloud Datastore User" or "Firebase Admin" roles.');
        logger.error(`Attempted to access project "${firebaseConfig.projectId}" database "${databaseId}"`);
      }
    }
  } catch (error: any) {
    logger.error('General Firebase Admin test failed:', { error: error.message });
  }
}



function validateEnvironmentAndSecrets() {
  const appVersion = process.env.APP_VERSION || '1.0.0';
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || firebaseConfig.projectId;
  const disableHmr = process.env.DISABLE_HMR === 'true';
  
  const rawTimeout = process.env.INTEGRATION_TIMEOUT;
  const parsedTimeout = rawTimeout ? Number(rawTimeout) : NaN;
  const integrationTimeout = (!isNaN(parsedTimeout) && parsedTimeout > 0) ? parsedTimeout : 10000;

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN;
  const googleMapsKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_API_KEY;
  const alertWebhook = process.env.ALERT_WEBHOOK_URL;
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_HOST;

  logger.info(`[ENV_VALIDATION] APP_VERSION: ${appVersion}`);
  logger.info(`[ENV_VALIDATION] GOOGLE_CLOUD_PROJECT: ${googleCloudProject ? 'configurado' : 'ausente'}`);
  logger.info(`[ENV_VALIDATION] DISABLE_HMR: ${disableHmr}`);
  logger.info(`[ENV_VALIDATION] INTEGRATION_TIMEOUT: ${integrationTimeout}ms`);

  logger.info(`[ENV_VALIDATION] MERCADOPAGO_ACCESS_TOKEN: ${mpToken ? 'configurado' : 'nao_configurado'}`);
  logger.info(`[ENV_VALIDATION] GOOGLE_MAPS_PLATFORM_KEY: ${googleMapsKey ? 'configurado' : 'nao_configurado'}`);

  if (!redisUrl) {
    logger.warn('[ENV_VALIDATION] REDIS_URL/REDIS_HOST não configurado. Utilizando fallback local (Firestore / Memória Local).');
  } else {
    logger.info('[ENV_VALIDATION] REDIS_URL: configurado');
  }

  if (!alertWebhook) {
    logger.info('[ENV_VALIDATION] ALERT_WEBHOOK_URL ausente. Alertas mantidos no logger estruturado.');
  } else {
    logger.info('[ENV_VALIDATION] ALERT_WEBHOOK_URL: configurado');
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  logger.info(`[STARTUP] Starting server`);
  logger.info(`[STARTUP] Environment: ${process.env.NODE_ENV || 'development'}`);
  const port = 3000;
  logger.info(`[STARTUP] Port: ${port}`);

  // Validation of environment variables & secrets without logging actual secret values
  validateEnvironmentAndSecrets();

  app.use(express.json());
  app.use(requestIDMiddleware);
  app.use(requestLoggerMiddleware);
  app.use(metricsMiddleware);

  // Protected Metrics Endpoint
  app.get('/api/metrics', createVerifyAdmin(authAdmin, db), (req: any, res: any) => {
    try {
      const data = metricsRegistry.getAggregatedMetrics();
      res.json(data);
    } catch (err: any) {
      logger.error('Error fetching metrics', { error: err });
      res.status(500).json({ error: 'Erro ao obter métricas' });
    }
  });
  // Register Admin Routes
  app.use('/api', createAdminRouter(authAdmin, db));

  // Configurar headers para evitar problemas com Cross-Origin-Opener-Policy (COOP)
  // Isso é necessário para que o Firebase Auth Popup funcione corretamente
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });


  // WhatsApp webhook routes extracted to server/routes/notificationRoutes.ts

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
      logger.debug('Verifying admin token...');
      const decodedToken: DecodedIdToken = await authAdmin.verifyIdToken(idToken);
      logger.debug('Token verified for admin', { uid: decodedToken.uid });
      
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (userData && userData.tipo_usuario === 'admin') {
        req.user = decodedToken;
        next();
      } else {
        logger.warn(`Forbidden: User is not an admin`, { uid: decodedToken.uid, tipo: userData?.tipo_usuario });
        res.status(403).json({ error: 'Forbidden: Admin access required' });
      }
    } catch (error: any) {
      logger.error('Error verifying admin token:', { error: error.message });
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
      let decodedToken: any;
      if (idToken.startsWith('test_token_')) {
        if (process.env.NODE_ENV === 'production') {
          logger.warn('[SECURITY] Tentativa de usar token de teste em produção bloqueada');
          return res.status(401).json({ error: 'Não autorizado: Tokens de teste não são permitidos em ambiente de produção' });
        }
        const uid = idToken.replace('test_token_', '');
        decodedToken = { uid, email: `${uid}@test.com` };
      } else {
        decodedToken = await authAdmin.verifyIdToken(idToken);
      }
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      const userData = userDoc.data();

      if (userData && (userData.status === 'INACTIVE' || userData.active === false)) {
        return res.status(403).json({ error: 'Sua conta está desativada. Entre em contato com o proprietário.' });
      }

      const roleUpper = (userData?.role || '').toUpperCase();
      const tipoUpper = (userData?.tipo_usuario || '').toUpperCase();
      const isRestaurant = Boolean(
        userData?.restaurantId ||
        ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'DRIVER', 'CASHIER', 'KITCHEN', 'ADMIN'].includes(roleUpper) ||
        ['RESTAURANT', 'RESTAURANTE', 'ADMIN', 'RESTAURANT_ADMIN', 'OWNER', 'MANAGER', 'WAITER', 'GARCOM', 'DRIVER', 'CASHIER', 'KITCHEN'].includes(tipoUpper)
      );

      if (userData && isRestaurant) {
        req.user = {
          ...decodedToken,
          restaurantId: userData.restaurantId || decodedToken.uid,
          tipo_usuario: userData.tipo_usuario || '',
          role: userData.role || ''
        };
        next();
      } else {
        res.status(403).json({ error: 'Forbidden: Restaurant access required' });
      }
    } catch (error: any) {
      logger.error('Error verifying restaurant token:', { error: error.message });
      res.status(401).json({ error: `Unauthorized: ${error.message}` });
    }
  };


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
      logger.error('[Order Timeout API] Error checking timeouts:', { error: error.message });
      res.status(500).json({ error: error.message || 'Erro interno ao verificar timeouts' });
    }
  });

  // GET: List drivers of the logged-in restaurant
  app.get('/api/restaurant/drivers', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const profilesSnapshot = await db.collection('restaurants')
        .doc(restaurantId)
        .collection('staffProfiles')
        .where('role', '==', 'DRIVER')
        .get();

      const drivers = [];

      for (const profileDoc of profilesSnapshot.docs) {
        const pData = profileDoc.data();
        const uid = pData.uid || profileDoc.id;

        // Fetch corresponding user document for canonical details
        const userDoc = await db.collection('users').doc(uid).get();
        const uData = userDoc.exists ? userDoc.data()! : {};

        const roleData = pData.roleSpecificData || {};
        const commonData = pData.commonOperationalData || {};

        drivers.push({
          id: uid,
          restaurantId,
          userId: uid,
          name: uData.nome || uData.name || roleData.nickname || 'Entregador',
          nickname: roleData.nickname || '',
          phone: uData.phone || uData.telefone || commonData.emergencyContact || '',
          email: uData.email || '',
          cpf: roleData.cpf || uData.cpf || '',
          vehicleType: roleData.vehicleType || 'moto',
          vehiclePlate: roleData.vehiclePlate || '',
          observations: roleData.operationalNotes || '',
          status: uData.status || (pData.operationalStatus !== 'INACTIVE' ? 'ACTIVE' : 'INACTIVE'),
          availabilityStatus: roleData.availability || 'OFFLINE',
          locationSharingEnabled: roleData.locationSharingEnabled ?? true,
          deliveryAreas: roleData.deliveryAreas || [],
          deliveryRadiusKm: roleData.deliveryRadiusKm ?? 8,
          totalDeliveries: roleData.totalDeliveries || 0,
          createdAt: pData.createdAt || uData.createdAt || new Date().toISOString(),
          updatedAt: pData.updatedAt || new Date().toISOString()
        });
      }

      res.json({ success: true, drivers });
    } catch (error: any) {
      logger.error('Error listing drivers:', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Register a driver (Centralized in Equipe)
  app.post('/api/restaurant/drivers', verifyRestaurant, async (req: any, res: any) => {
    return res.status(400).json({
      error: 'A gestão de contas de entregadores é realizada exclusivamente em Equipe (/restaurant/settings/team).'
    });
  });

  // PUT: Update an existing driver (Centralized in Equipe)
  app.put('/api/restaurant/drivers/:id', verifyRestaurant, async (req: any, res: any) => {
    return res.status(400).json({
      error: 'A gestão de contas de entregadores é realizada exclusivamente em Equipe (/restaurant/settings/team).'
    });
  });

  // DELETE: Remove/un-register a driver (Centralized in Equipe)
  app.delete('/api/restaurant/drivers/:id', verifyRestaurant, async (req: any, res: any) => {
    return res.status(400).json({
      error: 'A gestão de contas de entregadores é realizada exclusivamente em Equipe (/restaurant/settings/team).'
    });
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

      const profilesSnapshot = await db.collection('restaurants')
        .doc(restaurantId)
        .collection('staffProfiles')
        .where('role', '==', 'WAITER')
        .get();

      const waiters = [];

      for (const profileDoc of profilesSnapshot.docs) {
        const pData = profileDoc.data();
        const uid = pData.uid || profileDoc.id;

        // Fetch corresponding user document for canonical details
        const userDoc = await db.collection('users').doc(uid).get();
        const uData = userDoc.exists ? userDoc.data()! : {};

        const roleData = pData.roleSpecificData || {};
        const commonData = pData.commonOperationalData || {};

        waiters.push({
          id: uid,
          userId: uid,
          restaurantId,
          name: uData.nome || uData.name || roleData.nickname || 'Garçom',
          email: uData.email || '',
          phone: uData.phone || uData.telefone || '',
          photoUrl: commonData.photoUrl || uData.photoUrl || '',
          status: uData.status || (pData.operationalStatus !== 'INACTIVE' ? 'ACTIVE' : 'INACTIVE'),
          accessConfigured: true,
          permissions: normalizeWaiterPermissionsServer(uData.permissions || pData.permissions),
          environments: roleData.environments || [],
          assignedTables: roleData.assignedTables || [],
          shift: roleData.shift || 'DIURNO',
          createdAt: pData.createdAt || uData.createdAt || new Date().toISOString(),
          updatedAt: pData.updatedAt || new Date().toISOString()
        });
      }

      res.json({ success: true, waiters });
    } catch (error: any) {
      logger.error('Error fetching waiters:', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Create a new waiter (Centralized in Equipe)
  app.post('/api/restaurant/waiters', verifyRestaurant, async (req: any, res: any) => {
    return res.status(400).json({
      error: 'A gestão de contas de garçons é realizada exclusivamente em Equipe (/restaurant/settings/team).'
    });
  });

  // PUT: Update waiter details and permissions (Centralized in Equipe)
  app.put('/api/restaurant/waiters/:id', verifyRestaurant, async (req: any, res: any) => {
    return res.status(400).json({
      error: 'A gestão de contas de garçons é realizada exclusivamente em Equipe (/restaurant/settings/team).'
    });
  });

  // POST: Reset waiter password (Centralized in Equipe)
  app.post('/api/restaurant/waiters/:id/reset-password', verifyRestaurant, async (req: any, res: any) => {
    return res.status(400).json({
      error: 'A gestão de contas de garçons é realizada exclusivamente em Equipe (/restaurant/settings/team).'
    });
  });

  // PATCH: Change waiter status (Centralized in Equipe)
  app.patch('/api/restaurant/waiters/:id/status', verifyRestaurant, async (req: any, res: any) => {
    return res.status(400).json({
      error: 'A gestão de contas de garçons é realizada exclusivamente em Equipe (/restaurant/settings/team).'
    });
  });

  // ==========================================
  // MANUTENÇÃO E LIMPEZA DE DADOS DO RESTAURANTE
  // ==========================================

  // Helper function to count safely has been migrated to cleanupService.ts

  // getPrimaryOwnerUidForRestaurant has been migrated to cleanupService.ts

  // validatePrimaryOwnerRequest has been migrated to server/utils/owner.ts

  // Audit logger helper for driver endpoints
  const logDriverAudit = async (params: {
    requestId: string;
    uid: string;
    driverId: string;
    restaurantId: string;
    endpoint: string;
    orderId?: string;
    action: string;
    result: string;
    httpStatus: number;
  }) => {
    const timestamp = new Date().toISOString();
    logger.info(`[DRIVER_AUDIT] RequestId: ${params.requestId} | UID: ${params.uid} | DriverID: ${params.driverId} | RestaurantID: ${params.restaurantId} | Endpoint: ${params.endpoint} | OrderId: ${params.orderId || 'N/A'} | Action: ${params.action} | Result: ${params.result} | HttpStatus: ${params.httpStatus}`);
    try {
      await db.collection('restaurants').doc(params.restaurantId).collection('driverAuditLogs').add({
        ...params,
        timestamp
      });
    } catch (err: any) {
      logger.warn('[DRIVER_AUDIT] Failed to persist log to Firestore:', { error: err.message });
    }
  };

  const logDriverResolutionAudit = async (params: {
    requestId: string;
    uid: string;
    perfisEncontrados: number;
    restaurantIdsEncontrados: string[];
    resultadoValidacao: string;
    httpStatus: number;
    restaurantId?: string;
  }) => {
    const timestamp = new Date().toISOString();
    logger.info(`[DRIVER_RESOLUTION_AUDIT] RequestId: ${params.requestId} | UID: ${params.uid} | PerfisEncontrados: ${params.perfisEncontrados} | RestaurantIDs: [${params.restaurantIdsEncontrados.join(', ')}] | Resultado: ${params.resultadoValidacao} | HttpStatus: ${params.httpStatus}`);
    try {
      const targetRestaurantId = params.restaurantId || (params.restaurantIdsEncontrados[0] || 'SYSTEM');
      if (targetRestaurantId !== 'SYSTEM') {
        await db.collection('restaurants').doc(targetRestaurantId).collection('driverResolutionAuditLogs').add({
          ...params,
          timestamp
        });
      } else {
        await db.collection('systemDriverResolutionAuditLogs').add({
          ...params,
          timestamp
        });
      }
    } catch (err: any) {
      logger.warn('[DRIVER_RESOLUTION_AUDIT] Failed to persist log to Firestore:', { error: err.message });
    }
  };

  // Register Driver Routes
  app.use('/api/driver', createDriverRouter(authAdmin, db, messaging));

  // Register Kitchen Routes
  app.use('/api/restaurant', createKitchenRouter(authAdmin, db));

  // Register Order Finance Routes
  app.use('/api/restaurant/financeiro/pedidos', createOrderFinanceRouter(authAdmin, db));

  // Register Cash Register Routes
  app.use('/api/restaurant/financeiro/caixa', createCashRegisterRouter(authAdmin, db));

  // Register Accounts Routes (Contas a Pagar / Contas a Receber)
  app.use('/api/restaurant/financeiro', createAccountsRouter(authAdmin, db));

  // Register Tab Routes
  app.use('/api/restaurant/tab', createTabRouter(authAdmin, db));

  // Register Order Routes
  app.use('/api/restaurant', createOrderRouter(authAdmin, db, messaging));

  // Register Report and Dashboard Routes
  app.use('/api/restaurant/reports', createReportRouter(authAdmin, db));

  // Register Team Routes
  app.use('/api/restaurant/team', createTeamRouter(authAdmin, db));

  // Register Cleanup Routes
  app.use('/api/restaurant/cleanup', createCleanupRouter(authAdmin, db));

  // Register Settings Routes
  app.use('/api/restaurant', createSettingsRouter(authAdmin, db));

  // Register Counter Routes
  app.use('/api/restaurant', createCounterRouter(authAdmin, db));

  // Register Stock Routes
  app.use('/api/restaurant', createStockRouter(authAdmin, db));

  // Register Mercado Pago Routes
  app.use('/api/payments/mercadopago', createMercadoPagoRouter(authAdmin, db, messaging));

  // Register Notification Routes
  app.use('/api', createNotificationRouter(authAdmin, db, messaging));

  // Register Geo Routes
  app.use('/api', createGeoRouter(db));



  app.get('/api/health', async (req: any, res: any) => {
    const startTime = performance.now();
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em /api/health', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let failedDependency: string | null = null;
    
    // Helper for timeout
    const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
      let timeoutHandle: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error('Timeout'));
        }, timeoutMs);
      });
      return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutHandle);
      });
    };

    // 1. Verify Firebase Admin initialization
    const isFirebaseAdminInitialized = !!adminApp && admin.apps.length > 0 && !!db && !!authAdmin && !!messaging;
    let firebaseAdminStatus: 'configurado' | 'nao_configurado' | 'degradado' = 'configurado';
    let firestoreStatus: 'configurado' | 'nao_configurado' | 'degradado' = 'degradado';
    let storageStatus: 'configurado' | 'nao_configurado' | 'degradado' = 'nao_configurado';

    if (!isFirebaseAdminInitialized) {
      status = 'unhealthy';
      firebaseAdminStatus = 'degradado';
      failedDependency = 'firebaseAdmin';
    }

    // 2. Verify Firestore is responding
    if (status !== 'unhealthy') {
      try {
        await withTimeout(db.collection('users').limit(1).get(), 2000);
        firestoreStatus = 'configurado';
      } catch (err: any) {
        status = 'unhealthy';
        firestoreStatus = 'degradado';
        failedDependency = 'firestore';
      }
    }

    // 3. Verify Storage
    const storageBucketName = firebaseConfig.storageBucket || process.env.VITE_FIREBASE_STORAGE_BUCKET;
    if (status !== 'unhealthy') {
      if (storageBucketName) {
        try {
          const bucket = admin.storage().bucket(storageBucketName);
          const [exists] = await withTimeout(bucket.exists(), 2000);
          if (exists) {
            storageStatus = 'configurado';
          } else {
            storageStatus = 'degradado';
            if (status === 'healthy') {
              status = 'degraded';
              failedDependency = 'storage';
            }
          }
        } catch (err: any) {
          storageStatus = 'degradado';
          if (status === 'healthy') {
            status = 'degraded';
            failedDependency = 'storage';
          }
        }
      } else {
        storageStatus = 'nao_configurado';
        if (status === 'healthy') {
          status = 'degraded';
          failedDependency = 'storage';
        }
      }
    }

    // 4. Integrations configuration status (display ONLY: configurado, nao_configurado, degradado)
    const mpConfigured = !!(process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN);
    const waConfigured = !!(process.env.WHATSAPP_TOKEN && process.env.PHONE_NUMBER_ID);
    const fcmConfigured = !!(firebaseConfig.messagingSenderId || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID);
    const redisConfigured = !!(process.env.REDIS_URL || process.env.REDIS_HOST);
    const googleMapsConfigured = !!(process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_API_KEY);
    const alertWebhookConfigured = !!process.env.ALERT_WEBHOOK_URL;

    const details: Record<string, { status: 'configurado' | 'nao_configurado' | 'degradado' }> = {
      firebaseAdmin: { status: firebaseAdminStatus },
      firestore: { status: firestoreStatus },
      storage: { status: storageStatus },
      mercadoPago: { status: mpConfigured ? 'configurado' : 'nao_configurado' },
      whatsApp: { status: waConfigured ? 'configurado' : 'nao_configurado' },
      fcm: { status: fcmConfigured ? 'configurado' : 'nao_configurado' },
      redis: { status: redisConfigured ? 'configurado' : 'nao_configurado' },
      googleMaps: { status: googleMapsConfigured ? 'configurado' : 'nao_configurado' },
      alertWebhook: { status: alertWebhookConfigured ? 'configurado' : 'nao_configurado' }
    };

    // If any non-essential integration is not configured, status is degraded
    if (status === 'healthy' && (!mpConfigured || !waConfigured || !fcmConfigured || !redisConfigured || !googleMapsConfigured)) {
      status = 'degraded';
      if (!mpConfigured) failedDependency = 'mercadoPago';
      else if (!waConfigured) failedDependency = 'whatsApp';
      else if (!fcmConfigured) failedDependency = 'fcm';
      else if (!redisConfigured) failedDependency = 'redis';
      else if (!googleMapsConfigured) failedDependency = 'googleMaps';
    }

    const appVersion = process.env.APP_VERSION || '1.0.0';
    const duration = parseFloat((performance.now() - startTime).toFixed(2));

    const responseBody = {
      status,
      version: appVersion,
      environment: process.env.NODE_ENV || 'development',
      uptime: parseFloat(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString(),
      requestId,
      duration,
      details
    };

    // Log the result
    const logData: any = {
      requestId,
      status,
      duration
    };
    if (failedDependency) {
      logData.dependency = failedDependency;
    }

    res.setHeader('X-Request-ID', requestId);

    if (status === 'unhealthy') {
      logger.error('Health check completed - unhealthy', logData);
      alertManager.triggerAlert({
        type: 'HEALTH_CHECK_UNHEALTHY',
        severity: 'CRITICAL',
        routeOrModule: 'HealthCheck',
        summary: `Health check failed: dependência ${failedDependency || 'desconhecida'} indisponível`,
        requestId,
        durationOrLatency: duration,
        recommendedAction: 'Verificar status do Firestore, Firebase Admin e serviços principais',
        threshold: 1
      });
      return res.status(503).json(responseBody);
    } else if (status === 'degraded') {
      logger.warn('Health check completed - degraded', logData);
      return res.status(200).json(responseBody);
    } else {
      logger.info('Health check completed - healthy', logData);
      return res.status(200).json(responseBody);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`[STARTUP] Creating Vite middleware`);
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined
      },
      appType: 'custom',
    });
    logger.info(`[STARTUP] Vite middleware ready`);
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
            logger.warn(`Could not fetch restaurant data for SSR (slug: ${slug})`, { error: dbError });
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
            logger.warn(`Could not fetch restaurant data for SSR (slug: ${slug})`, { error: dbError });
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

  // Stock routes extracted to server/routes/stockRoutes.ts

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`[STARTUP] Server running on 0.0.0.0:${port}`);
    logger.info(`[STARTUP] Server running on 0.0.0.0:${port}`);
    // Run connection test in background after server starts
    testFirestoreConnection().catch(err => logger.error('Background Firestore test failed:', { error: err }));
    
    // Start the background job to automatically cancel orders older than 5 minutes
    // Now done on-demand per authenticated restaurant via /api/orders/check-timeout to avoid global loop
    logger.info('[Order Timeout] Global loop disabled. Checking on-demand per authenticated tenant.');
  });

  server.on('error', (error: any) => {
    logger.error('[STARTUP_LISTEN_ERROR]', { error: error.message });
    process.exit(1);
  });
}

startServer().catch(error => {
  logger.error('[STARTUP_FATAL_ERROR]', { error: error.message });
  process.exit(1);
});
