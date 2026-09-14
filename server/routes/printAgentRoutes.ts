import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import crypto from 'crypto';
import { createRateLimiter } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';
import { sendTestToPrintAgent } from '../services/printAgentWebSocketServer';

export function createPrintAgentRouter(db: Firestore, authAdmin?: Auth): Router {
  const router = Router();

  const pairRateLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 30, // Máximo de 30 tentativas por IP a cada 10 minutos
    message: 'Muitas tentativas de pareamento do Print Agent. Por favor, aguarde alguns minutos.',
    category: 'auth'
  });

  /**
   * POST /pair (e /parear)
   * Realiza a vinculação do QFomeAI Print Agent desktop ao restaurante.
   * Entrada:
   *   - code: código temporário de 6 dígitos gerado no painel
   *   - deviceId: identificador único da máquina/instalação
   */
  const handlePairing = async (req: Request, res: Response) => {
    try {
      const rawCode = req.body.code || req.body.pairingCode || req.body.codigo;
      const rawDeviceId = req.body.deviceId || req.body.device_id || req.body.idDispositivo;
      const optionalRestaurantId = req.body.restaurantId || req.body.restaurant_id;

      if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
        return res.status(400).json({ error: 'O código temporário de vinculação é obrigatório.' });
      }

      if (!rawDeviceId || typeof rawDeviceId !== 'string' || !rawDeviceId.trim()) {
        return res.status(400).json({ error: 'O identificador do dispositivo (deviceId) é obrigatório.' });
      }

      const cleanCode = rawCode.trim();
      const cleanDeviceId = rawDeviceId.trim();

      if (cleanDeviceId.length < 3 || cleanDeviceId.length > 128) {
        return res.status(400).json({ error: 'Identificador do dispositivo inválido.' });
      }

      // 1. Localizar o restaurante vinculado ao código temporário
      let targetRestaurantRef: DocumentReference | null = null;

      if (optionalRestaurantId && typeof optionalRestaurantId === 'string' && optionalRestaurantId.trim()) {
        const directRef = db.collection('restaurants').doc(optionalRestaurantId.trim());
        const directDoc = await directRef.get();
        if (directDoc.exists) {
          const directData = directDoc.data() || {};
          if (directData.printAgentPairing && directData.printAgentPairing.code === cleanCode) {
            targetRestaurantRef = directRef;
          }
        }
      }

      if (!targetRestaurantRef) {
        const querySnapshot = await db.collection('restaurants')
          .where('printAgentPairing.code', '==', cleanCode)
          .limit(2)
          .get();

        if (!querySnapshot.empty) {
          targetRestaurantRef = querySnapshot.docs[0].ref;
        }
      }

      if (!targetRestaurantRef) {
        logger.warn('[PRINT_AGENT] Tentativa de pareamento com código inexistente', { deviceId: cleanDeviceId });
        return res.status(404).json({ error: 'Código de vinculação não encontrado ou inválido.' });
      }

      // 2. Executar validação e registro atômico via Firestore Transaction
      // Protege contra concorrência e garante uso único
      const pairResult = await db.runTransaction(async (transaction) => {
        const restDoc = await transaction.get(targetRestaurantRef!);
        if (!restDoc.exists) {
          throw new Error('RESTAURANT_NOT_FOUND');
        }

        const data = restDoc.data() || {};
        const pairing = data.printAgentPairing;

        if (!pairing || pairing.code !== cleanCode) {
          throw new Error('INVALID_CODE');
        }

        // Validação: used === false
        if (pairing.used === true) {
          throw new Error('CODE_ALREADY_USED');
        }

        // Validação: não expirou
        const now = Date.now();
        if (pairing.expiresAt && Number(pairing.expiresAt) < now) {
          throw new Error('CODE_EXPIRED');
        }

        // 4. Criar uma credencial segura e exclusiva para esse dispositivo
        // 32 bytes de entropia criptográfica (256 bits)
        const rawToken = `qfpa_${crypto.randomBytes(32).toString('hex')}`;
        // Armazenar no banco SOMENTE o hash SHA-256 da credencial
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

        // 5. Registrar o dispositivo vinculado ao restaurante
        const deviceRef = targetRestaurantRef!.collection('printAgentDevices').doc(cleanDeviceId);
        transaction.set(deviceRef, {
          deviceId: cleanDeviceId,
          restaurantId: restDoc.id,
          tokenHash,
          status: 'active',
          platform: req.body.platform || 'windows',
          appVersion: req.body.appVersion || '1.0.0',
          pairedAt: now,
          lastSeenAt: now,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Registrar mapeamento rápido em printAgentRegistry (leitura O(1) para lookups de WebSocket e Status)
        const registryRef = db.collection('printAgentRegistry').doc(cleanDeviceId);
        transaction.set(registryRef, {
          deviceId: cleanDeviceId,
          restaurantId: restDoc.id,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // 6. Marcar imediatamente o código como used: true
        const updatedPairing = {
          ...pairing,
          used: true,
          status: 'used',
          usedAt: now,
          usedByDeviceId: cleanDeviceId
        };

        transaction.update(targetRestaurantRef!, {
          printAgentPairing: updatedPairing,
          updatedAt: new Date().toISOString()
        });

        const restaurantName = data.nome || data.name || 'Restaurante';

        return {
          restaurantId: restDoc.id,
          restaurantName,
          deviceId: cleanDeviceId,
          token: rawToken
        };
      });

      logger.info('[PRINT_AGENT] Dispositivo pareado com sucesso', {
        restaurantId: pairResult.restaurantId,
        deviceId: pairResult.deviceId
      });

      // Retornar SOMENTE os dados solicitados:
      // - restaurantId
      // - nome do restaurante
      // - deviceId
      // - credencial/token do dispositivo
      return res.status(200).json({
        restaurantId: pairResult.restaurantId,
        restaurantName: pairResult.restaurantName,
        deviceId: pairResult.deviceId,
        token: pairResult.token
      });
    } catch (err: any) {
      if (err.message === 'CODE_ALREADY_USED') {
        return res.status(409).json({ error: 'Este código de vinculação já foi utilizado.' });
      }
      if (err.message === 'CODE_EXPIRED') {
        return res.status(410).json({ error: 'Este código de vinculação expirou. Gere um novo código no painel.' });
      }
      if (err.message === 'INVALID_CODE' || err.message === 'RESTAURANT_NOT_FOUND') {
        return res.status(404).json({ error: 'Código de vinculação inválido ou não encontrado.' });
      }

      logger.error('[PRINT_AGENT] Erro interno durante pareamento do Print Agent', { error: err?.message });
      return res.status(500).json({ error: 'Erro interno ao processar o pareamento do dispositivo.' });
    }
  };

  /**
   * GET /status
   * Confirma a autenticação de um QFomeAI Print Agent já vinculado.
   * Entrada:
   *   - deviceId (via header 'x-device-id', 'device-id' ou query 'deviceId' / 'device_id')
   *   - token do dispositivo (via header 'Authorization: Bearer <token>', 'x-device-token', 'x-token' ou query 'token')
   * 
   * Validações:
   *   1. Localizar o dispositivo
   *   2. Calcular o hash SHA-256 do token recebido
   *   3. Comparar com o tokenHash salvo de forma segura em tempo constante
   *   4. Confirmar que pertence ao restaurantId correto
   *   5. Confirmar que o dispositivo está ativo (status === 'active')
   * 
   * Retorno seguro:
   *   - Se válido: { connected: true, restaurantId, restaurantName, deviceId }
   *   - Se inválido: 401 ou 403 genérico sem expor detalhes internos
   */
  const handleStatus = async (req: Request, res: Response) => {
    try {
      const rawDeviceId =
        (req.headers['x-device-id'] as string) ||
        (req.headers['device-id'] as string) ||
        (req.query.deviceId as string) ||
        (req.query.device_id as string) ||
        (req.body && req.body.deviceId);

      let rawToken: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && typeof authHeader === 'string') {
        if (authHeader.startsWith('Bearer ')) {
          rawToken = authHeader.slice(7).trim();
        } else {
          rawToken = authHeader.trim();
        }
      }
      if (!rawToken) {
        rawToken =
          (req.headers['x-device-token'] as string) ||
          (req.headers['x-token'] as string) ||
          (req.headers['x-print-agent-token'] as string) ||
          (req.query.token as string) ||
          (req.body && (req.body.token || req.body.deviceToken));
      }

      const optionalRestaurantId =
        (req.headers['x-restaurant-id'] as string) ||
        (req.query.restaurantId as string) ||
        (req.query.restaurant_id as string) ||
        (req.body && req.body.restaurantId);

      if (!rawDeviceId || typeof rawDeviceId !== 'string' || !rawDeviceId.trim()) {
        return res.status(401).json({ error: 'Identificador do dispositivo não informado.' });
      }

      if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
        return res.status(401).json({ error: 'Token de autenticação não informado.' });
      }

      const cleanDeviceId = rawDeviceId.trim();
      const cleanToken = rawToken.trim();
      const cleanRestaurantId = (optionalRestaurantId && typeof optionalRestaurantId === 'string')
        ? optionalRestaurantId.trim()
        : null;

      // 1. Localizar o dispositivo
      let deviceDoc: FirebaseFirestore.DocumentSnapshot | null = null;
      let resolvedRestaurantId = cleanRestaurantId;

      if (!resolvedRestaurantId) {
        try {
          const regSnap = await db.collection('printAgentRegistry').doc(cleanDeviceId).get();
          if (regSnap.exists) {
            resolvedRestaurantId = regSnap.data()?.restaurantId || null;
          }
        } catch {
          // ignore
        }
      }

      if (resolvedRestaurantId) {
        const directRef = db.collection('restaurants').doc(resolvedRestaurantId).collection('printAgentDevices').doc(cleanDeviceId);
        const directSnap = await directRef.get();
        if (directSnap.exists) {
          deviceDoc = directSnap;
        }
      }

      if (!deviceDoc) {
        try {
          const querySnap = await db.collectionGroup('printAgentDevices')
            .where('deviceId', '==', cleanDeviceId)
            .limit(1)
            .get();

          if (!querySnap.empty) {
            deviceDoc = querySnap.docs[0];
          }
        } catch (cgErr: any) {
          logger.warn('[PRINT_AGENT] Consulta collectionGroup printAgentDevices indisponível', { error: cgErr?.message });
        }
      }

      if (!deviceDoc || !deviceDoc.exists) {
        logger.warn('[PRINT_AGENT] Dispositivo não localizado para autenticação', { deviceId: cleanDeviceId });
        return res.status(401).json({ error: 'Dispositivo não encontrado ou não autorizado.' });
      }

      const deviceData = deviceDoc.data() || {};

      // 2. Calcular o hash do token recebido (SHA-256)
      const receivedTokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

      // 3. Comparar com o tokenHash salvo de forma segura
      const savedTokenHash = deviceData.tokenHash;
      if (!savedTokenHash || typeof savedTokenHash !== 'string') {
        logger.warn('[PRINT_AGENT] Dispositivo sem hash de credencial válido', { deviceId: cleanDeviceId });
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      let hashesMatch = false;
      try {
        const bufReceived = Buffer.from(receivedTokenHash, 'hex');
        const bufSaved = Buffer.from(savedTokenHash, 'hex');
        hashesMatch = bufReceived.length === bufSaved.length && crypto.timingSafeEqual(bufReceived, bufSaved);
      } catch {
        hashesMatch = false;
      }

      if (!hashesMatch) {
        logger.warn('[PRINT_AGENT] Token incompatível para o dispositivo', { deviceId: cleanDeviceId });
        return res.status(401).json({ error: 'Credenciais inválidas.' });
      }

      // 4. Confirmar que pertence ao restaurantId correto
      const restaurantId = deviceData.restaurantId || deviceDoc.ref.parent.parent?.id;
      if (!restaurantId || typeof restaurantId !== 'string') {
        logger.warn('[PRINT_AGENT] Dispositivo sem vínculo de restaurante', { deviceId: cleanDeviceId });
        return res.status(403).json({ error: 'Dispositivo não vinculado a um restaurante válido.' });
      }

      if (cleanRestaurantId && cleanRestaurantId !== restaurantId) {
        logger.warn('[PRINT_AGENT] Divergência de restaurante para o dispositivo', {
          deviceId: cleanDeviceId,
          expected: restaurantId,
          received: cleanRestaurantId
        });
        return res.status(403).json({ error: 'Acesso negado.' });
      }

      const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
      if (!restaurantDoc.exists) {
        logger.warn('[PRINT_AGENT] Restaurante vinculado não localizado ou inativo', { restaurantId, deviceId: cleanDeviceId });
        return res.status(403).json({ error: 'Restaurante não encontrado ou inativo.' });
      }

      const restaurantData = restaurantDoc.data() || {};

      // 5. Confirmar que o dispositivo está ativo
      if (deviceData.status !== 'active') {
        logger.warn('[PRINT_AGENT] Dispositivo não está com status active', {
          deviceId: cleanDeviceId,
          status: deviceData.status
        });
        return res.status(403).json({ error: 'Dispositivo inativo ou revogado.' });
      }

      // Atualizar lastSeenAt de forma assíncrona
      deviceDoc.ref.update({
        lastSeenAt: Date.now(),
        updatedAt: new Date().toISOString()
      }).catch((err) => {
        logger.warn('[PRINT_AGENT] Falha ao atualizar lastSeenAt do dispositivo', { error: err?.message });
      });

      const restaurantName = restaurantData.nome || restaurantData.name || 'Restaurante';

      // Retornar SOMENTE:
      // {
      //   "connected": true,
      //   "restaurantId": "...",
      //   "restaurantName": "...",
      //   "deviceId": "..."
      // }
      return res.status(200).json({
        connected: true,
        restaurantId,
        restaurantName,
        deviceId: cleanDeviceId
      });
    } catch (err: any) {
      logger.error('[PRINT_AGENT] Erro ao validar status do dispositivo', { error: err?.message });
      return res.status(500).json({ error: 'Erro interno ao validar dispositivo.' });
    }
  };

  /**
   * POST /test (e /send-test)
   * Envia um teste de comunicação via WebSocket existente ao Print Agent ONLINE do restaurante autenticado.
   * Regras estritas:
   *   - Somente permitir envio para dispositivo do restaurantId autenticado
   *   - Enviar SOMENTE:
   *     {
   *       "type": "test",
   *       "message": "Teste de comunicação QFomeAI",
   *       "sentAt": "data/hora"
   *     }
   *   - Mostrar sucesso somente se o Agent confirmar o recebimento com test_ack
   */
  const handleSendTest = async (req: Request, res: Response) => {
    try {
      // 1. Validar autenticação do usuário do restaurante
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Não autorizado: Token de autenticação ausente.' });
      }

      const idToken = authHeader.split('Bearer ')[1]?.trim();
      if (!idToken) {
        return res.status(401).json({ error: 'Não autorizado: Token ausente.' });
      }

      let authenticatedUid: string;
      if (idToken.startsWith('test_token_')) {
        if (process.env.NODE_ENV === 'production') {
          return res.status(401).json({ error: 'Tokens de teste não permitidos em produção.' });
        }
        authenticatedUid = idToken.replace('test_token_', '');
      } else if (authAdmin) {
        try {
          const decoded = await authAdmin.verifyIdToken(idToken);
          authenticatedUid = decoded.uid;
        } catch (authErr: any) {
          logger.warn('[PRINT_AGENT] Token de autorização inválido no teste de comunicação', { error: authErr?.message });
          return res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
        }
      } else {
        return res.status(500).json({ error: 'Serviço de autenticação não configurado no servidor.' });
      }

      // Localizar o restaurante do usuário com suporte a múltiplos campos canônicos e legados
      const userDoc = await db.collection('users').doc(authenticatedUid).get();
      const userData = userDoc.data() || {};
      const userRestaurantId = (
        userData.restaurantId ||
        userData.restaurante_id ||
        userData.idRestaurante ||
        userData.restauranteId ||
        ''
      ).trim();

      const requestedRestaurantId = (req.body.restaurantId || req.body.restaurant_id || '').trim();
      const rawDeviceId = req.body.deviceId || req.body.device_id;
      const cleanDeviceId = typeof rawDeviceId === 'string' && rawDeviceId.trim() ? rawDeviceId.trim() : undefined;

      let effectiveRestaurantId = userRestaurantId || requestedRestaurantId || authenticatedUid;

      // Se temos deviceId, podemos consultar o registro canônico do dispositivo
      if (cleanDeviceId) {
        try {
          const regDoc = await db.collection('printAgentRegistry').doc(cleanDeviceId).get();
          if (regDoc.exists) {
            const registeredRestId = (regDoc.data()?.restaurantId || '').trim();
            if (registeredRestId) {
              // Validar se o usuário autenticado tem direito de enviar teste para esse restaurante
              const isAdmin = userData.role === 'ADMIN' || userData.role === 'SUPER_ADMIN' || userData.tipo_usuario === 'admin';
              const isSameRestaurant = userRestaurantId && userRestaurantId.toLowerCase() === registeredRestId.toLowerCase();
              const isOwner = authenticatedUid.toLowerCase() === registeredRestId.toLowerCase();

              if (!isAdmin && !isSameRestaurant && !isOwner) {
                // Verificar se é proprietário do documento restaurant
                const restDoc = await db.collection('restaurants').doc(registeredRestId).get();
                const restData = restDoc.data() || {};
                const isRestaurantOwner = restData.ownerId === authenticatedUid || restData.userId === authenticatedUid;
                if (!isRestaurantOwner) {
                  return res.status(403).json({ error: 'Acesso negado: dispositivo vinculado a outro estabelecimento.' });
                }
              }
              effectiveRestaurantId = registeredRestId;
            }
          }
        } catch {
          // segue com fluxo padrão
        }
      }

      if (!effectiveRestaurantId) {
        return res.status(403).json({ error: 'Restaurante não associado ao usuário autenticado.' });
      }

      // 2. Se deviceId foi fornecido e não validado pelo registry, garantir que pertence ao restaurante
      if (cleanDeviceId) {
        const directDeviceDoc = await db.collection('restaurants').doc(effectiveRestaurantId).collection('printAgentDevices').doc(cleanDeviceId).get();
        if (!directDeviceDoc.exists) {
          // Tentar consulta no restaurantId do usuário se diferente
          if (userRestaurantId && userRestaurantId !== effectiveRestaurantId) {
            const userDeviceDoc = await db.collection('restaurants').doc(userRestaurantId).collection('printAgentDevices').doc(cleanDeviceId).get();
            if (userDeviceDoc.exists) {
              effectiveRestaurantId = userRestaurantId;
            }
          }
        }
      }

      // 3. Enviar teste através da conexão WebSocket existente e aguardar confirmação test_ack
      const testResult = await sendTestToPrintAgent(effectiveRestaurantId, cleanDeviceId, 8000);

      logger.info('[PRINT_AGENT] Teste de comunicação confirmado com sucesso pelo Print Agent', {
        restaurantId: effectiveRestaurantId,
        deviceId: testResult.deviceId,
        latencyMs: testResult.latencyMs
      });

      return res.status(200).json({
        success: true,
        message: 'Comunicação confirmada com sucesso pelo Print Agent!',
        deviceId: testResult.deviceId,
        acknowledgedAt: testResult.acknowledgedAt,
        latencyMs: testResult.latencyMs
      });
    } catch (err: any) {
      logger.info('[PRINT_AGENT] Teste de comunicação não concluído (Print Agent offline ou sem resposta)', { error: err?.message });
      return res.status(400).json({
        success: false,
        error: err?.message || 'Falha ao enviar teste para o Print Agent.'
      });
    }
  };

  router.post('/pair', pairRateLimiter, handlePairing);
  router.post('/parear', pairRateLimiter, handlePairing);
  router.get('/status', handleStatus);
  router.post('/test', handleSendTest);
  router.post('/send-test', handleSendTest);

  return router;
}
