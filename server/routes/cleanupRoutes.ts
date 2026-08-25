import express from 'express';
import admin from 'firebase-admin';
import { createVerifyRestaurant } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { validatePrimaryOwnerRequest } from '../utils/owner';
import {
  countCollectionSafe,
  performRealOrdersCleanup,
  performRealStaffCleanup,
  performRealCommercialDataCleanup
} from '../services/cleanupService';

export function createCleanupRouter(authAdmin: any, db: any) {
  const router = express.Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);
  const cleanupLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Max 10 cleanup operations per 15 minutes
    message: 'Muitas solicitações de limpeza. Por favor, aguarde alguns minutos.'
  });

  // POST: Create cleanup request
  router.post('/request', verifyRestaurant, cleanupLimiter, async (req: any, res: any) => {
    const restaurantId = req.user.restaurantId;
    const primaryOwnerUid = await validatePrimaryOwnerRequest(db, req, res, restaurantId);
    if (!primaryOwnerUid) return;

    const { cleanupType, reason } = req.body;
    if (!cleanupType || !['ORDERS_ONLY', 'INTERNAL_USERS_ONLY', 'ORDERS_AND_INTERNAL_USERS', 'FACTORY_RESET'].includes(cleanupType)) {
      return res.status(400).json({ error: 'Modalidade de limpeza inválida.' });
    }
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'O motivo da limpeza deve conter pelo menos 10 caracteres.' });
    }

    try {
      // Check if there is already an active request (not completed, cancelled or failed)
      const activeRequests = await db.collection('restaurants')
        .doc(restaurantId)
        .collection('dataCleanupRequests')
        .where('status', 'in', ['DRAFT', 'ANALYZING', 'AWAITING_CONFIRMATION', 'APPROVED', 'BACKUP_IN_PROGRESS', 'READY', 'RUNNING'])
        .get();

      if (!activeRequests.empty) {
        return res.status(409).json({ error: 'Já existe uma solicitação de limpeza ativa em andamento.' });
      }

      const requestId = db.collection('restaurants').doc(restaurantId).collection('dataCleanupRequests').doc().id;
      
      const newRequest = {
        requestId,
        restaurantId,
        requestedBy: req.user.uid,
        requestedByRole: req.user.role || req.user.tipo_usuario || 'OWNER',
        primaryOwnerUid,
        cleanupType,
        reason,
        status: 'DRAFT',
        estimatedCounts: {},
        preservedData: [],
        deletedData: [],
        backupReference: '',
        startedAt: null,
        completedAt: null,
        failedAt: null,
        progress: 0,
        currentStep: 'Criada',
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        schemaVersion: 1
      };

      await db.collection('restaurants')
        .doc(restaurantId)
        .collection('dataCleanupRequests')
        .doc(requestId)
        .set(newRequest);

      res.status(201).json(newRequest);
    } catch (error: any) {
      console.error('Error creating cleanup request:', error);
      res.status(500).json({ error: 'Erro ao criar solicitação de limpeza.' });
    }
  });

  // POST: Execute dry-run / analysis of the request
  router.post('/:id/analyze', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const restaurantId = req.user.restaurantId;
    const primaryOwnerUid = await validatePrimaryOwnerRequest(db, req, res, restaurantId);
    if (!primaryOwnerUid) return;

    try {
      const requestRef = db.collection('restaurants')
        .doc(restaurantId)
        .collection('dataCleanupRequests')
        .doc(id);
      
      const requestSnap = await requestRef.get();
      if (!requestSnap.exists) {
        return res.status(404).json({ error: 'Solicitação de limpeza não encontrada.' });
      }

      const requestData = requestSnap.data()!;
      if (requestData.status !== 'DRAFT' && requestData.status !== 'ANALYZING' && requestData.status !== 'AWAITING_CONFIRMATION') {
        return res.status(400).json({ error: 'A solicitação de limpeza não está no estado correto para análise.' });
      }

      await requestRef.update({ status: 'ANALYZING', updatedAt: new Date().toISOString() });

      const type = requestData.cleanupType;

      // Perform fast counting
      const countOrders = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('orders'));
      const countDeliveries = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('deliveries'));
      const countCaixas = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('caixas'));
      const countContasReceber = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('contasReceber'));
      const countContasPagar = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('contasPagar'));
      
      const countTabs = await countCollectionSafe(db.collection('tabs').where('restaurantId', '==', restaurantId));
      const countTables = await countCollectionSafe(db.collection('tables').where('restaurantId', '==', restaurantId));
      const countHalls = await countCollectionSafe(db.collection('halls').where('restaurantId', '==', restaurantId));
      
      const countUsersAll = await countCollectionSafe(db.collection('users').where('restaurantId', '==', restaurantId));
      const countStaffProfiles = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('staffProfiles'));
      const countIntegrationLogs = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('integration_logs'));

      // Products & adjacents
      const countProducts = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('products'));
      const countCategories = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('categories'));
      const countSizes = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('sizes'));
      const countExtras = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('extras'));
      const countOptionGroups = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('optionGroups'));
      const countOptionItems = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('optionItems'));
      const countPromotions = await countCollectionSafe(db.collection('restaurants').doc(restaurantId).collection('promotions'));

      // Determine what to delete and what to preserve
      let toDelete: any = {};
      let toPreserve: any = {};

      if (type === 'ORDERS_ONLY') {
        toDelete = {
          'Pedidos (orders)': countOrders,
          'Entregas (deliveries)': countDeliveries,
          'Sessões de Caixa (caixas)': countCaixas,
          'Comandas (tabs)': countTabs,
          'Contas a Receber (contasReceber)': countContasReceber,
          'Contas a Pagar (contasPagar)': countContasPagar,
          'Logs de Integração': countIntegrationLogs
        };
        toPreserve = {
          'Equipe de Funcionários': countStaffProfiles,
          'Produtos / Itens de Menu': countProducts,
          'Categorias de Produtos': countCategories,
          'Adicionais e Opcionais': countExtras,
          'Mesas e Ambientes': countTables + countHalls,
          'Configurações da Loja': 1
        };
      } else if (type === 'INTERNAL_USERS_ONLY') {
        // Exclude the requesting OWNER from toDelete
        const deletableUsers = Math.max(0, countUsersAll - 1);
        const deletableStaff = Math.max(0, countStaffProfiles);
        toDelete = {
          'Perfis de Funcionários (staffProfiles)': deletableStaff,
          'Contas de Usuários Internos': deletableUsers
        };
        toPreserve = {
          'Pedidos e Histórico': countOrders,
          'Dados do Financeiro': countCaixas,
          'Produtos e Cardápio': countProducts,
          'Mesas e Ambientes': countTables + countHalls,
          'Configurações Comerciais': 1,
          'OWNER Principal (Sua conta)': 1
        };
      } else if (type === 'ORDERS_AND_INTERNAL_USERS') {
        const deletableUsers = Math.max(0, countUsersAll - 1);
        const deletableStaff = Math.max(0, countStaffProfiles);
        toDelete = {
          'Pedidos (orders)': countOrders,
          'Entregas (deliveries)': countDeliveries,
          'Sessões de Caixa (caixas)': countCaixas,
          'Comandas (tabs)': countTabs,
          'Contas de Usuários Internos': deletableUsers,
          'Perfis de Funcionários (staffProfiles)': deletableStaff,
          'Logs de Integração': countIntegrationLogs
        };
        toPreserve = {
          'Produtos / Itens de Menu': countProducts,
          'Categorias de Produtos': countCategories,
          'Mesas e Ambientes': countTables + countHalls,
          'Configurações da Loja': 1,
          'OWNER Principal (Sua conta)': 1
        };
      } else if (type === 'FACTORY_RESET') {
        const deletableUsers = Math.max(0, countUsersAll - 1);
        const deletableStaff = Math.max(0, countStaffProfiles);
        toDelete = {
          'Pedidos (orders)': countOrders,
          'Entregas (deliveries)': countDeliveries,
          'Sessões de Caixa (caixas)': countCaixas,
          'Comandas (tabs)': countTabs,
          'Produtos / Itens de Menu': countProducts,
          'Categorias de Produtos': countCategories,
          'Tamanhos de Produtos': countSizes,
          'Adicionais e Extras': countExtras,
          'Grupos de Opções': countOptionGroups + countOptionItems,
          'Promoções e Cupons': countPromotions,
          'Mesas e Salões': countTables + countHalls,
          'Perfis de Funcionários (staffProfiles)': deletableStaff,
          'Contas de Usuários Internos': deletableUsers,
          'Logs e Temporários': countIntegrationLogs
        };
        toPreserve = {
          'Documento Base do Restaurante': 1,
          'Vínculo de Acesso de Segurança': 1,
          'OWNER Principal (Sua conta)': 1,
          'Auditorias Legais Obrigatórias': 1
        };
      }

      const deletedList = Object.entries(toDelete).map(([key, val]) => `${key}: ${val}`);
      const preservedList = Object.entries(toPreserve).map(([key, val]) => `${key}: ${val}`);

      const updatedRequest = {
        ...requestData,
        status: 'AWAITING_CONFIRMATION',
        estimatedCounts: { toDelete, toPreserve },
        deletedData: deletedList,
        preservedData: preservedList,
        currentStep: 'Análise Concluída',
        updatedAt: new Date().toISOString()
      };

      await requestRef.set(updatedRequest);

      res.json(updatedRequest);
    } catch (error: any) {
      console.error('Error analyzing cleanup:', error);
      res.status(500).json({ error: 'Erro ao analisar os dados do restaurante.' });
    }
  });

  // POST: Confirm cleanup request (user must type restaurant name)
  router.post('/:id/confirm', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const { restaurantName } = req.body;
    const restaurantId = req.user.restaurantId;
    const primaryOwnerUid = await validatePrimaryOwnerRequest(db, req, res, restaurantId);
    if (!primaryOwnerUid) return;

    if (!restaurantName) {
      return res.status(400).json({ error: 'É necessário digitar o nome do restaurante para confirmação.' });
    }

    try {
      const restDoc = await db.collection('restaurants').doc(restaurantId).get();
      if (!restDoc.exists) {
        return res.status(404).json({ error: 'Restaurante não encontrado.' });
      }

      const restData = restDoc.data()!;
      const actualName = (restData.nome || restData.nome_fantasia || '').trim().toUpperCase();

      if (restaurantName.trim().toUpperCase() !== actualName) {
        return res.status(400).json({ error: `Nome do restaurante incorreto. Digitado: "${restaurantName}", esperado: "${restData.nome || restData.nome_fantasia}"` });
      }

      const requestRef = db.collection('restaurants')
        .doc(restaurantId)
        .collection('dataCleanupRequests')
        .doc(id);

      const requestSnap = await requestRef.get();
      if (!requestSnap.exists) {
        return res.status(404).json({ error: 'Solicitação de limpeza não encontrada.' });
      }

      const requestData = requestSnap.data()!;
      if (requestData.status !== 'AWAITING_CONFIRMATION') {
        return res.status(400).json({ error: 'A solicitação não está no estado correto para confirmação.' });
      }

      const updatedRequest = {
        ...requestData,
        status: 'APPROVED',
        currentStep: 'Aprovado pelo proprietário',
        updatedAt: new Date().toISOString()
      };

      await requestRef.set(updatedRequest);

      res.json(updatedRequest);
    } catch (error: any) {
      console.error('Error confirming cleanup:', error);
      res.status(500).json({ error: 'Erro ao confirmar a solicitação de limpeza.' });
    }
  });

  // POST: Execute the actual/simulated cleanup
  router.post('/:id/execute', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const restaurantId = req.user.restaurantId;
    const primaryOwnerUid = await validatePrimaryOwnerRequest(db, req, res, restaurantId);
    if (!primaryOwnerUid) return;

    try {
      const requestRef = db.collection('restaurants')
        .doc(restaurantId)
        .collection('dataCleanupRequests')
        .doc(id);

      const requestSnap = await requestRef.get();
      if (!requestSnap.exists) {
        return res.status(404).json({ error: 'Solicitação de limpeza não encontrada.' });
      }

      const requestData = requestSnap.data()!;
      if (requestData.status !== 'APPROVED') {
        return res.status(400).json({ error: 'A solicitação precisa ser aprovada antes de ser executada.' });
      }

      // 1. Put restaurant in MAINTENANCE mode
      await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: true });

      // 2. Set status to BACKUP_IN_PROGRESS
      const backupRef = `backup_rest_${restaurantId}_${Date.now()}`;
      await requestRef.update({
        status: 'BACKUP_IN_PROGRESS',
        backupReference: backupRef,
        startedAt: new Date().toISOString(),
        progress: 10,
        currentStep: 'Iniciando backup de segurança...',
        updatedAt: new Date().toISOString()
      });

      // 3. Perform actual/simulated step-by-step cleanup
      // We run this asynchronously in the background so the HTTP request returns instantly!
      const executeInSteps = async () => {
        try {
          const type = requestData.cleanupType;

          if (type === 'ORDERS_ONLY') {
            console.log(`[CLEANUP] Starting real cleanup of orders for restaurant ${restaurantId}...`);

            const ordersResult = await performRealOrdersCleanup(db, admin, restaurantId, requestRef, id, { start: 15, end: 90 });

            if (ordersResult.success) {
              await db.collection('audit_logs').add({
                action: 'DATA_CLEANUP_EXECUTED',
                restaurantId,
                operatorId: req.user.uid,
                cleanupType: 'ORDERS_ONLY',
                reason: requestData.reason,
                createdAt: new Date().toISOString()
              });

              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });

              await requestRef.update({
                status: 'COMPLETED',
                progress: 100,
                currentStep: 'Limpeza e reconfiguração de pedidos concluídas com sucesso.',
                completedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                  pedidosDeletados: ordersResult.deletedCount
                }
              });

              console.log(`[CLEANUP] Real orders cleanup for ${restaurantId} completed successfully.`);
            } else {
              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
              const targetStatus = ordersResult.statusOverride || 'FAILED';
              await requestRef.update({
                status: targetStatus,
                error: ordersResult.error || 'Alguns documentos não puderam ser excluídos. Limpeza parcial realizada.',
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                  remainingCollections: ordersResult.remainingCollections || []
                }
              });
              console.warn(`[CLEANUP] Real orders cleanup for ${restaurantId} ended with status ${targetStatus}.`);
            }

          } else if (type === 'INTERNAL_USERS_ONLY') {
            console.log(`[CLEANUP] Starting real cleanup of staff for restaurant ${restaurantId}...`);

            const primaryOwnerId = primaryOwnerUid;
            const staffResult = await performRealStaffCleanup(db, authAdmin, restaurantId, requestRef, id, primaryOwnerId, { start: 15, end: 90 });

            if (staffResult.success) {
              await db.collection('audit_logs').add({
                action: 'DATA_CLEANUP_EXECUTED',
                restaurantId,
                operatorId: req.user.uid,
                cleanupType: 'INTERNAL_USERS_ONLY',
                reason: requestData.reason,
                createdAt: new Date().toISOString()
              });

              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });

              await requestRef.update({
                status: 'COMPLETED',
                progress: 100,
                currentStep: 'Limpeza e reconfiguração da equipe concluídas com sucesso.',
                completedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                  usuariosEncontrados: staffResult.processedCount,
                  usuariosRemovidos: staffResult.removedCount,
                  usuariosAnonimizados: staffResult.anonimizedCount,
                  usuariosPreservados: staffResult.preservedCount
                }
              });

              console.log(`[CLEANUP] Real staff cleanup for ${restaurantId} completed successfully.`);
            } else {
              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
              const targetStatus = staffResult.statusOverride || 'FAILED';
              await requestRef.update({
                status: targetStatus,
                error: staffResult.error || 'A limpeza da equipe falhou.',
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                  remainingCollections: staffResult.remainingCollections || []
                }
              });
              console.error(`[CLEANUP] Real staff cleanup for ${restaurantId} ended with status ${targetStatus}.`);
            }

          } else if (type === 'ORDERS_AND_INTERNAL_USERS') {
            console.log(`[CLEANUP] Starting real cleanup of orders AND staff for restaurant ${restaurantId}...`);

            // STEP 1: EXECUTE REAL ORDERS CLEANUP FIRST (15% to 50%)
            const ordersResult = await performRealOrdersCleanup(db, admin, restaurantId, requestRef, id, { start: 15, end: 50 });

            if (!ordersResult.success) {
              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
              const targetStatus = ordersResult.statusOverride || 'FAILED';
              await requestRef.update({
                status: targetStatus,
                error: `Falha na etapa de limpeza de pedidos: ${ordersResult.error || 'Não foi possível excluir o histórico de pedidos.'}`,
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                  remainingCollections: ordersResult.remainingCollections || []
                }
              });
              console.error(`[CLEANUP] Orders cleanup failed during ORDERS_AND_INTERNAL_USERS for ${restaurantId}. Aborting team cleanup.`);
              return;
            }

            // STEP 2: EXECUTE REAL TEAM CLEANUP SECOND (55% to 85%)
            const primaryOwnerId = primaryOwnerUid;
            const staffResult = await performRealStaffCleanup(db, authAdmin, restaurantId, requestRef, id, primaryOwnerId, { start: 55, end: 85 });

            if (!staffResult.success) {
              const remainingMsg = staffResult.remainingUsersCount 
                ? ` Restaram ${staffResult.remainingUsersCount} usuário(s) interno(s) ativo(s).` 
                : '';
              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
              const targetStatus = staffResult.statusOverride || 'FAILED';
              await requestRef.update({
                status: targetStatus,
                error: `Os pedidos e históricos foram removidos com sucesso, porém a limpeza da equipe falhou.${remainingMsg} Detalhes: ${staffResult.error || 'Erro no processamento da equipe.'}`,
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                  remainingCollections: staffResult.remainingCollections || []
                }
              });
              console.error(`[CLEANUP] Team cleanup failed during ORDERS_AND_INTERNAL_USERS for ${restaurantId}.`);
              return;
            }

            // STEP 3: FINAL INTEGRITY & PRESERVATION VERIFICATION (90% to 100%)
            await requestRef.update({
              progress: 90,
              currentStep: 'Executando verificação final de integridade e dados preservados...',
              updatedAt: new Date().toISOString()
            });

            // Verify remaining orders = 0
            const checkOrdersSnap = await db.collection('restaurants').doc(restaurantId).collection('orders').limit(1).get();
            const checkCaixasSnap = await db.collection('restaurants').doc(restaurantId).collection('caixas').limit(1).get();

            // Verify active internal users = only Primary Owner
            const postUsersSnap = await db.collection('users').where('restaurantId', '==', restaurantId).get();
            let remainingActiveUsersCount = 0;
            postUsersSnap.forEach((doc: any) => {
              const u = doc.data();
              if (doc.id !== primaryOwnerId) {
                const role = (u.role || '').toUpperCase();
                const tipo = (u.tipo_usuario || '').toUpperCase();
                const accType = (u.accountType || '').toUpperCase();
                if (role !== 'CLIENT' && role !== 'CLIENTE' && tipo !== 'CLIENT' && tipo !== 'CLIENTE' && accType !== 'CLIENT' && accType !== 'CLIENTE' &&
                    role !== 'ADMIN' && role !== 'PLATFORM_ADMIN' && tipo !== 'ADMIN') {
                  if (u.active !== false && u.status !== 'INACTIVE') {
                    remainingActiveUsersCount++;
                  }
                }
              }
            });

            // Verify mandatory preserved data exists
            const restDoc = await db.collection('restaurants').doc(restaurantId).get();
            const primaryOwnerDoc = await db.collection('users').doc(primaryOwnerId).get();

            const isFinalVerificationOK = 
              checkOrdersSnap.empty && 
              checkCaixasSnap.empty && 
              remainingActiveUsersCount === 0 && 
              restDoc.exists && 
              primaryOwnerDoc.exists;

            if (!isFinalVerificationOK) {
              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
              await requestRef.update({
                status: 'FAILED',
                error: 'Verificação final falhou: restaram pedidos não removidos ou usuários internos indevidamente ativos.',
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              console.error(`[CLEANUP] Final integrity check failed for ORDERS_AND_INTERNAL_USERS on ${restaurantId}.`);
              return;
            }

            // SUCCESS!
            await db.collection('audit_logs').add({
              action: 'DATA_CLEANUP_EXECUTED',
              restaurantId,
              operatorId: req.user.uid,
              cleanupType: 'ORDERS_AND_INTERNAL_USERS',
              reason: requestData.reason,
              createdAt: new Date().toISOString()
            });

            await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });

            await requestRef.update({
              status: 'COMPLETED',
              progress: 100,
              currentStep: 'Limpeza e reconfiguração de pedidos e equipe concluídas com sucesso.',
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              metadata: {
                ordersDeleted: true,
                teamProcessed: true,
                pedidosDeletados: ordersResult.deletedCount,
                usuariosEncontrados: staffResult.processedCount,
                usuariosRemovidos: staffResult.removedCount,
                usuariosAnonimizados: staffResult.anonimizedCount,
                usuariosPreservados: staffResult.preservedCount
              }
            });

            console.log(`[CLEANUP] Real ORDERS_AND_INTERNAL_USERS cleanup for ${restaurantId} completed successfully.`);

          } else if (type === 'FACTORY_RESET') {
            console.log(`[CLEANUP] Starting real FACTORY_RESET for restaurant ${restaurantId}...`);

            // STEP 1: EXECUTE REAL ORDERS CLEANUP (15% to 40%)
            const ordersResult = await performRealOrdersCleanup(db, admin, restaurantId, requestRef, id, { start: 15, end: 40 });

            if (!ordersResult.success) {
              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
              const targetStatus = ordersResult.statusOverride || 'FAILED';
              await requestRef.update({
                status: targetStatus,
                error: `Falha na etapa de limpeza de pedidos durante restauração: ${ordersResult.error || 'Não foi possível excluir o histórico de pedidos.'}`,
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                  remainingCollections: ordersResult.remainingCollections || []
                }
              });
              console.error(`[CLEANUP] Orders cleanup failed during FACTORY_RESET for ${restaurantId}. Aborting reset.`);
              return;
            }

            // STEP 2: EXECUTE REAL TEAM CLEANUP (45% to 65%)
            const primaryOwnerId = primaryOwnerUid;
            const staffResult = await performRealStaffCleanup(db, authAdmin, restaurantId, requestRef, id, primaryOwnerId, { start: 45, end: 65 });

            if (!staffResult.success) {
              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
              const targetStatus = staffResult.statusOverride || 'FAILED';
              await requestRef.update({
                status: targetStatus,
                error: `A limpeza de pedidos foi concluída, mas a limpeza da equipe falhou durante a restauração. Detalhes: ${staffResult.error || 'Erro no processamento da equipe.'}`,
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                  remainingCollections: staffResult.remainingCollections || []
                }
              });
              console.error(`[CLEANUP] Team cleanup failed during FACTORY_RESET for ${restaurantId}. Aborting reset.`);
              return;
            }

            // STEP 3: EXECUTE REAL COMMERCIAL DATA CLEANUP (70% to 85%)
            const commercialResult = await performRealCommercialDataCleanup(db, admin, restaurantId, requestRef, id, { start: 70, end: 85 });

            if (!commercialResult.success) {
              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
              const targetStatus = commercialResult.statusOverride || 'FAILED';
              await requestRef.update({
                status: targetStatus,
                error: `Os pedidos e a equipe foram limpos, porém a remoção de produtos e cadastros comerciais falhou. Detalhes: ${commercialResult.error || 'Erro ao remover cadastros comerciais.'}`,
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                metadata: {
                  remainingCollections: commercialResult.remainingCollections || []
                }
              });
              console.error(`[CLEANUP] Commercial data cleanup failed during FACTORY_RESET for ${restaurantId}. Aborting reset.`);
              return;
            }

            // STEP 4: FINAL INTEGRITY & PRESERVATION VERIFICATION (90% to 100%)
            await requestRef.update({
              progress: 90,
              currentStep: 'Executando verificação final de segurança e estado inicial...',
              updatedAt: new Date().toISOString()
            });

            // Verify orders, caixas, products, categories are empty
            const checkOrdersSnap = await db.collection('restaurants').doc(restaurantId).collection('orders').limit(1).get();
            const checkCaixasSnap = await db.collection('restaurants').doc(restaurantId).collection('caixas').limit(1).get();
            const checkProductsSnap = await db.collection('restaurants').doc(restaurantId).collection('products').limit(1).get();
            const checkCategoriesSnap = await db.collection('restaurants').doc(restaurantId).collection('categories').limit(1).get();

            // Verify active internal users = 0 except Primary Owner
            const postUsersSnap = await db.collection('users').where('restaurantId', '==', restaurantId).get();
            let remainingActiveUsersCount = 0;
            postUsersSnap.forEach((doc: any) => {
              const u = doc.data();
              if (doc.id !== primaryOwnerId) {
                const role = (u.role || '').toUpperCase();
                const tipo = (u.tipo_usuario || '').toUpperCase();
                const accType = (u.accountType || '').toUpperCase();
                if (role !== 'CLIENT' && role !== 'CLIENTE' && tipo !== 'CLIENT' && tipo !== 'CLIENTE' && accType !== 'CLIENT' && accType !== 'CLIENTE' &&
                    role !== 'ADMIN' && role !== 'PLATFORM_ADMIN' && tipo !== 'ADMIN') {
                  if (u.active !== false && u.status !== 'INACTIVE') {
                    remainingActiveUsersCount++;
                  }
                }
              }
            });

            // Verify mandatory preserved data exists
            const restDoc = await db.collection('restaurants').doc(restaurantId).get();
            const primaryOwnerDoc = await db.collection('users').doc(primaryOwnerId).get();

            const isFinalResetOK = 
              checkOrdersSnap.empty && 
              checkCaixasSnap.empty && 
              checkProductsSnap.empty && 
              checkCategoriesSnap.empty && 
              remainingActiveUsersCount === 0 && 
              restDoc.exists && 
              primaryOwnerDoc.exists;

            if (!isFinalResetOK) {
              await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
              await requestRef.update({
                status: 'FAILED',
                error: 'Verificação final da restauração falhou: alguns dados ainda persistem.',
                failedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
              console.error(`[CLEANUP] Final verification failed for FACTORY_RESET on ${restaurantId}.`);
              return;
            }

            // Update restaurant status to pending initial configuration
            await db.collection('restaurants').doc(restaurantId).update({
              em_manutencao: false,
              configuracao_inicial_pendente: true,
              status: 'PENDING_SETUP',
              onboarding_completo: false,
              updatedAt: new Date().toISOString()
            });

            // Audit log
            await db.collection('audit_logs').add({
              action: 'DATA_CLEANUP_EXECUTED',
              restaurantId,
              operatorId: req.user.uid,
              cleanupType: 'FACTORY_RESET',
              reason: requestData.reason,
              createdAt: new Date().toISOString()
            });

            await requestRef.update({
              status: 'COMPLETED',
              progress: 100,
              currentStep: 'Restauração concluída. Restaurante pronto para nova configuração inicial.',
              completedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              metadata: {
                factoryReset: true,
                pedidosDeletados: ordersResult.deletedCount,
                usuariosEncontrados: staffResult.processedCount,
                usuariosRemovidos: staffResult.removedCount,
                usuariosAnonimizados: staffResult.anonimizedCount,
                usuariosPreservados: staffResult.preservedCount,
                dadosComerciaisDeletados: commercialResult.deletedCount,
                primaryOwnerPreserved: true
              }
            });

            console.log(`[CLEANUP] Real FACTORY_RESET for ${restaurantId} completed successfully.`);

          } else {
            // Unsupported modality
            await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
            await requestRef.update({
              status: 'FAILED',
              error: `Modalidade de limpeza não suportada: ${requestData.cleanupType}`,
              failedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            console.error(`[CLEANUP] Unsupported cleanup modality requested: ${requestData.cleanupType}`);
          }
        } catch (bgError: any) {
          console.error('[CLEANUP BACKGROUND ERROR]', bgError);
          // Set to failed and turn off maintenance
          await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
          await requestRef.update({
            status: 'FAILED',
            error: bgError.message || 'Erro durante a limpeza de dados em lote.',
            failedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      };

      // Trigger asynchronous execution
      executeInSteps();

      // Return immediately with the updated in-progress request doc
      res.json({
        ...requestData,
        status: 'BACKUP_IN_PROGRESS',
        backupReference: backupRef,
        startedAt: new Date().toISOString(),
        progress: 10,
        currentStep: 'Iniciando backup de segurança...',
        updatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('Error executing cleanup:', error);
      // Ensure maintenance is false if something blows up synchronously
      await db.collection('restaurants').doc(restaurantId).update({ em_manutencao: false });
      res.status(500).json({ error: 'Erro ao iniciar execução da limpeza de dados.' });
    }
  });

  // POST: Cancel cleanup request before execution starts
  router.post('/:id/cancel', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const restaurantId = req.user.restaurantId;
    const primaryOwnerUid = await validatePrimaryOwnerRequest(db, req, res, restaurantId);
    if (!primaryOwnerUid) return;

    try {
      const requestRef = db.collection('restaurants')
        .doc(restaurantId)
        .collection('dataCleanupRequests')
        .doc(id);

      const requestSnap = await requestRef.get();
      if (!requestSnap.exists) {
        return res.status(404).json({ error: 'Solicitação de limpeza não encontrada.' });
      }

      const requestData = requestSnap.data()!;
      if (!['DRAFT', 'ANALYZING', 'AWAITING_CONFIRMATION', 'APPROVED'].includes(requestData.status)) {
        return res.status(400).json({ error: 'A solicitação de limpeza não pode ser cancelada neste estágio.' });
      }

      const updatedRequest = {
        ...requestData,
        status: 'CANCELLED',
        currentStep: 'Cancelado pelo usuário',
        updatedAt: new Date().toISOString()
      };

      await requestRef.set(updatedRequest);

      res.json(updatedRequest);
    } catch (error: any) {
      console.error('Error cancelling cleanup request:', error);
      res.status(500).json({ error: 'Erro ao cancelar a solicitação de limpeza.' });
    }
  });

  // GET: Get specific request details/progress
  router.get('/:id', verifyRestaurant, async (req: any, res: any) => {
    const { id } = req.params;
    const restaurantId = req.user.restaurantId;
    const primaryOwnerUid = await validatePrimaryOwnerRequest(db, req, res, restaurantId);
    if (!primaryOwnerUid) return;

    try {
      const requestSnap = await db.collection('restaurants')
        .doc(restaurantId)
        .collection('dataCleanupRequests')
        .doc(id)
        .get();

      if (!requestSnap.exists) {
        return res.status(404).json({ error: 'Solicitação não encontrada.' });
      }

      res.json(requestSnap.data());
    } catch (error: any) {
      console.error('Error getting cleanup request details:', error);
      res.status(500).json({ error: 'Erro ao consultar detalhes da solicitação de limpeza.' });
    }
  });

  return router;
}
