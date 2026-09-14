import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Firestore, DocumentReference } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { createRateLimiter } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';

export function createPrintAgentRouter(db: Firestore): Router {
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

  router.post('/pair', pairRateLimiter, handlePairing);
  router.post('/parear', pairRateLimiter, handlePairing);

  return router;
}
