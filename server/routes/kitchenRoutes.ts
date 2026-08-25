import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { createVerifyRestaurant } from '../middleware/auth';
import { getDefaultPermissionsForRole, hasPermission } from '../../src/domain/permissions/canonicalPermissions';
import { logger } from '../utils/logger';

export function createKitchenRouter(authAdmin: Auth, db: Firestore): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  // Audit logger helper for kitchen endpoints
  const logKitchenAudit = async (params: {
    requestId: string;
    uid: string;
    restaurantId: string;
    endpoint: string;
    orderId?: string;
    itemId?: string;
    action: string;
    previousStatus?: string;
    newStatus?: string;
    result: string;
    httpStatus: number;
  }) => {
    const timestamp = new Date().toISOString();
    logger.info('Kitchen action audit', params);
    try {
      // Filter out any undefined values to avoid Firestore serialization issues
      const cleanedParams: any = {};
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined) {
          cleanedParams[key] = val;
        }
      });

      await db.collection('restaurants').doc(params.restaurantId).collection('kitchenAuditLogs').add({
        ...cleanedParams,
        timestamp
      });
    } catch (err) {
      logger.warn('Failed to persist kitchen audit log to Firestore', { error: err });
    }
  };

  const sanitizeOrderForKitchen = (order: any) => {
    if (!order) return null;
    const sanitized = { ...order };
    delete sanitized.total;
    delete sanitized.desconto;
    delete sanitized.valor_desconto;
    delete sanitized.forma_pagamento;
    delete sanitized.troco;
    delete sanitized.pago;
    delete sanitized.contas_receber;
    delete sanitized.financialDetails;
    delete sanitized.paymentDetails;
    return sanitized;
  };

  const handleKitchenAction = async (req: any, res: any, actionNameFromRoute?: string) => {
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em handleKitchenAction', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }
    const { orderId } = req.params;
    const actionName = actionNameFromRoute || req.body.action;
    const endpoint = `${req.method} ${req.originalUrl}`;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório' });
    }

    if (!actionName) {
      return res.status(400).json({ error: 'action é obrigatório' });
    }

    // Normalized Action
    const normalizedAction = actionName.toUpperCase();
    const allowedActions = ['ACCEPT_ORDER', 'START_PREPARATION', 'CONCLUDE_ITEM', 'CONCLUDE_ORDER', 'CHANGE_PRIORITY', 'UPDATE_PRODUCTION_STATUS'];
    if (!allowedActions.includes(normalizedAction)) {
      return res.status(400).json({ error: 'Ação de cozinha inválida' });
    }

    // Require clientActionId for kitchen operations
    const rawClientActionId = req.body?.clientActionId || req.headers['x-client-action-id'];
    if (!rawClientActionId || typeof rawClientActionId !== 'string' || !rawClientActionId.trim()) {
      await logKitchenAudit({
        requestId,
        uid: req.user.uid,
        restaurantId: req.user.restaurantId || 'N/A',
        endpoint,
        orderId,
        action: normalizedAction,
        result: 'MISSING_CLIENT_ACTION_ID',
        httpStatus: 400
      });
      return res.status(400).json({ error: 'clientActionId é obrigatório' });
    }
    const clientActionId = rawClientActionId.trim();

    try {
      // 1. Authenticate & load canonical user
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      if (!userDoc.exists) {
        return res.status(401).json({ error: 'Usuário não encontrado' });
      }
      const userData = userDoc.data()!;

      // 2. Validate account status is active
      if (userData.status === 'INACTIVE' || userData.active === false) {
        await logKitchenAudit({
          requestId,
          uid: req.user.uid,
          restaurantId: userData.restaurantId || req.user.restaurantId || 'N/A',
          endpoint,
          orderId,
          action: normalizedAction,
          result: 'FORBIDDEN_ACCESS: INACTIVE_ACCOUNT',
          httpStatus: 403
        });
        return res.status(403).json({
          error: 'FORBIDDEN_ACCESS',
          code: 'FORBIDDEN_ACCESS',
          message: 'Sua conta está desativada. Entre em contato com o proprietário.'
        });
      }

      // 3. Validate restaurantId
      const restaurantId = userData.restaurantId || req.user.restaurantId;
      if (!restaurantId) {
        return res.status(400).json({ error: 'ID do restaurante não encontrado no cadastro do usuário.' });
      }

      // 4. Validate role and kitchen canonical permissions
      const roleUpper = (userData.role || '').toUpperCase();
      const allowedRoles = ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN'];
      if (!allowedRoles.includes(roleUpper)) {
        await logKitchenAudit({
          requestId,
          uid: req.user.uid,
          restaurantId,
          endpoint,
          orderId,
          action: normalizedAction,
          result: 'FORBIDDEN_ACCESS: INVALID_ROLE',
          httpStatus: 403
        });
        return res.status(403).json({
          error: 'FORBIDDEN_ACCESS',
          code: 'FORBIDDEN_ACCESS',
          message: 'Acesso negado: Perfil de usuário não autorizado para ações de cozinha.'
        });
      }

      const ACTION_PERMISSIONS: Record<string, string> = {
        ACCEPT_ORDER: 'cozinha.aceitar',
        START_PREPARATION: 'cozinha.iniciar_preparo',
        CONCLUDE_ITEM: 'cozinha.concluir_item',
        CONCLUDE_ORDER: 'cozinha.concluir_item',
        CHANGE_PRIORITY: 'cozinha.alterar_prioridade',
        UPDATE_PRODUCTION_STATUS: 'cozinha.concluir_item'
      };

      const requiredPermission = ACTION_PERMISSIONS[normalizedAction];
      if (requiredPermission) {
        const userPermissions = (userData.permissions !== undefined && userData.permissions !== null)
          ? userData.permissions
          : getDefaultPermissionsForRole(roleUpper);

        const effectiveUser = {
          ...userData,
          role: roleUpper,
          permissions: userPermissions
        };

        if (!hasPermission(effectiveUser, requiredPermission)) {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            action: normalizedAction,
            result: `FORBIDDEN_ACCESS: MISSING_PERMISSION_${requiredPermission}`,
            httpStatus: 403
          });
          return res.status(403).json({
            error: 'FORBIDDEN_ACCESS',
            code: 'FORBIDDEN_ACCESS',
            message: `Acesso negado: Você não possui a permissão necessária para executar esta ação de cozinha.`
          });
        }
      }

      // 5. Look up order
      const orderDocRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
      const orderDoc = await orderDocRef.get();
      if (!orderDoc.exists) {
        await logKitchenAudit({
          requestId,
          uid: req.user.uid,
          restaurantId,
          endpoint,
          orderId,
          action: normalizedAction,
          result: 'ORDER_NOT_FOUND',
          httpStatus: 404
        });
        return res.status(404).json({ error: 'Pedido não encontrado' });
      }

      const orderData = orderDoc.data()!;
      const previousStatus = orderData.status;

      // 6. Validate payload parameters based on specific actions
      const updates: any = {};
      let targetItemId: string | undefined;

      if (normalizedAction === 'ACCEPT_ORDER') {
        if (previousStatus !== 'pendente' && previousStatus !== 'recebido') {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            action: normalizedAction,
            previousStatus,
            result: 'INVALID_TRANSITION',
            httpStatus: 400
          });
          return res.status(400).json({ error: 'Transição inválida: Apenas pedidos pendentes/recebidos podem ser aceitos' });
        }
        updates.status = 'aceito';
        updates.data_aceite = new Date().toISOString();
      }

      else if (normalizedAction === 'START_PREPARATION') {
        const allowed = ['aceito', 'confirmado'];
        if (!allowed.includes(previousStatus)) {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            action: normalizedAction,
            previousStatus,
            result: 'INVALID_TRANSITION',
            httpStatus: 400
          });
          return res.status(400).json({ error: 'Transição inválida: Apenas pedidos aceitos podem iniciar preparo' });
        }
        updates.status = 'preparo';
      }

      else if (normalizedAction === 'CONCLUDE_ITEM') {
        const { itemId, quantity } = req.body;
        if (!itemId) {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            action: normalizedAction,
            previousStatus,
            result: 'MISSING_ITEM_ID',
            httpStatus: 400
          });
          return res.status(400).json({ error: 'itemId é obrigatório para concluir o item' });
        }
        targetItemId = itemId;

        const items = orderData.items || orderData.itens || [];
        if (!Array.isArray(items)) {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            itemId,
            action: normalizedAction,
            previousStatus,
            result: 'ORDER_HAS_NO_ITEMS',
            httpStatus: 400
          });
          return res.status(400).json({ error: 'O pedido não possui itens cadastrados' });
        }

        // Find item by ID, productId, name, or index
        let itemIndex = items.findIndex((it: any) => it.id === itemId || it.productId === itemId || it.nome === itemId);
        if (itemIndex === -1 && !Number.isNaN(Number(itemId))) {
          const idx = Number(itemId);
          if (idx >= 0 && idx < items.length) {
            itemIndex = idx;
          }
        }

        if (itemIndex === -1) {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            itemId,
            action: normalizedAction,
            previousStatus,
            result: 'ITEM_NOT_FOUND',
            httpStatus: 404
          });
          return res.status(404).json({ error: 'Item não encontrado no pedido' });
        }

        const item = { ...items[itemIndex] };
        if (quantity !== undefined) {
          const qty = Number(quantity);
          if (Number.isNaN(qty) || qty <= 0) {
            await logKitchenAudit({
              requestId,
              uid: req.user.uid,
              restaurantId,
              endpoint,
              orderId,
              itemId,
              action: normalizedAction,
              previousStatus,
              result: 'INVALID_QUANTITY',
              httpStatus: 400
            });
            return res.status(400).json({ error: 'Quantidade de conclusão inválida' });
          }
          const origQty = Number(item.quantidade || 1);
          const currentConcluded = Number(item.concluido_quantidade || 0);
          const newConcluded = currentConcluded + qty;
          if (newConcluded > origQty) {
            await logKitchenAudit({
              requestId,
              uid: req.user.uid,
              restaurantId,
              endpoint,
              orderId,
              itemId,
              action: normalizedAction,
              previousStatus,
              result: 'EXCEEDS_ORIGINAL_QUANTITY',
              httpStatus: 400
            });
            return res.status(400).json({ error: `Quantidade informada (${qty}) somada à já concluída (${currentConcluded}) excede a quantidade total do item (${origQty})` });
          }
          item.concluido_quantidade = newConcluded;
          if (newConcluded === origQty) {
            item.concluido = true;
            item.status_producao = 'concluido';
          } else {
            item.status_producao = 'preparo';
          }
        } else {
          // If no specific quantity is passed, conclude entirely
          item.concluido = true;
          item.status_producao = 'concluido';
          item.concluido_quantidade = item.quantidade || 1;
        }

        const newItems = [...items];
        newItems[itemIndex] = item;
        updates.items = newItems;
      }

      else if (normalizedAction === 'CONCLUDE_ORDER') {
        const allowedStatuses = ['preparo', 'cozinha', 'aceito', 'confirmado'];
        if (!allowedStatuses.includes(previousStatus)) {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            action: normalizedAction,
            previousStatus,
            result: 'INVALID_TRANSITION',
            httpStatus: 400
          });
          return res.status(400).json({ error: `Transição inválida: Apenas pedidos nos status ${allowedStatuses.join('/')} podem ser concluídos` });
        }

        // Check if any item requiring production is not marked as completed
        const checkItems = orderData.items || orderData.itens;
        if (checkItems && Array.isArray(checkItems)) {
          const pendingProductionItem = checkItems.find((it: any) => {
            const needsProd = it.needs_production === true;
            const notDone = it.concluido !== true && it.status_producao !== 'concluido';
            return needsProd && notDone;
          });
          if (pendingProductionItem) {
            await logKitchenAudit({
              requestId,
              uid: req.user.uid,
              restaurantId,
              endpoint,
              orderId,
              action: normalizedAction,
              previousStatus,
              result: 'PENDING_ITEMS_PRODUCTION',
              httpStatus: 400
            });
            return res.status(400).json({
              error: 'PENDING_ITEMS',
              message: `Não é possível concluir o pedido porque o item "${pendingProductionItem.nome}" exige produção e ainda não foi concluído na cozinha.`
            });
          }
        }

        updates.status = 'pronto';
        updates.data_pronto = new Date().toISOString();
      }

      else if (normalizedAction === 'CHANGE_PRIORITY') {
        const { priority } = req.body;
        if (priority === undefined) {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            action: normalizedAction,
            previousStatus,
            result: 'MISSING_PRIORITY',
            httpStatus: 400
          });
          return res.status(400).json({ error: 'priority é obrigatório' });
        }
        const isValidPriority = (typeof priority === 'number' && priority >= 1 && priority <= 5) ||
                                (typeof priority === 'string' && ['alta', 'normal', 'baixa', 'HIGH', 'NORMAL', 'LOW'].includes(priority));
        if (!isValidPriority) {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            action: normalizedAction,
            previousStatus,
            result: 'INVALID_PRIORITY_VALUE',
            httpStatus: 400
          });
          return res.status(400).json({ error: 'Valor de prioridade inválido. Use de 1 a 5, ou "alta", "normal", "baixa"' });
        }
        updates.prioridade = priority;
      }

      else if (normalizedAction === 'UPDATE_PRODUCTION_STATUS') {
        const { productionStatus } = req.body;
        if (!productionStatus || !['pendente', 'preparo', 'concluido'].includes(productionStatus)) {
          await logKitchenAudit({
            requestId,
            uid: req.user.uid,
            restaurantId,
            endpoint,
            orderId,
            action: normalizedAction,
            previousStatus,
            result: 'INVALID_PRODUCTION_STATUS',
            httpStatus: 400
          });
          return res.status(400).json({ error: 'productionStatus inválido. Use "pendente", "preparo" ou "concluido"' });
        }
        updates.status_producao = productionStatus;
        if (productionStatus === 'concluido') {
          updates.status = 'pronto';
          updates.data_pronto = new Date().toISOString();
        }
      }

      // 7. Execute Firestore transaction with idempotency check
      const actionDocId = `${req.user.uid}_${orderId}_${normalizedAction}_${clientActionId}`;
      const actionRef = db.collection('restaurants').doc(restaurantId).collection('kitchenProcessedActions').doc(actionDocId);

      const transactionResult = await db.runTransaction(async (transaction) => {
        // Idempotency check: verify if action was already processed
        const actionDoc = await transaction.get(actionRef);
        if (actionDoc.exists) {
          return { duplicate: true };
        }

        const tOrderDoc = await transaction.get(orderDocRef);
        if (!tOrderDoc.exists) {
          throw new Error('ORDER_NOT_FOUND_IN_TRANSACTION');
        }

        const currentOrderData = tOrderDoc.data()!;
        
        // Final sanity check: make sure the state hasn't changed since our read outside transaction
        if (currentOrderData.status !== previousStatus) {
          return { conflict: true, currentStatus: currentOrderData.status };
        }

        // Record processed action within the SAME transaction as order update
        transaction.set(actionRef, {
          clientActionId,
          restaurantId,
          uid: req.user.uid,
          orderId,
          action: normalizedAction,
          processedAt: new Date().toISOString()
        });

        // Perform atomic update on order
        transaction.update(orderDocRef, {
          ...updates,
          updatedAt: new Date().toISOString()
        });

        return { success: true, updatedFields: updates };
      });

      if (transactionResult.duplicate) {
        // Do NOT call logKitchenAudit to prevent duplicate audit logging
        return res.status(409).json({
          error: 'DUPLICATE_ACTION',
          code: 'DUPLICATE_ACTION',
          message: 'Esta ação já foi processada anteriormente.'
        });
      }

      if (transactionResult.conflict) {
        await logKitchenAudit({
          requestId,
          uid: req.user.uid,
          restaurantId,
          endpoint,
          orderId,
          action: normalizedAction,
          previousStatus,
          result: `CONFLICT: status changed to ${transactionResult.currentStatus} during transaction`,
          httpStatus: 409
        });
        return res.status(409).json({ error: 'Conflito de estado: O status do pedido foi atualizado por outro processo' });
      }

      // 8. Log success audit
      const finalNewStatus = updates.status || previousStatus;
      await logKitchenAudit({
        requestId,
        uid: req.user.uid,
        restaurantId,
        endpoint,
        orderId,
        itemId: targetItemId,
        action: normalizedAction,
        previousStatus,
        newStatus: finalNewStatus,
        result: 'SUCCESS',
        httpStatus: 200
      });

      // Fetch fresh sanitized order
      const finalDoc = await orderDocRef.get();
      const sanitizedOrder = sanitizeOrderForKitchen({ id: finalDoc.id, ...finalDoc.data() });

      return res.json({
        success: true,
        action: normalizedAction,
        message: `Operação ${normalizedAction} executada com sucesso`,
        order: sanitizedOrder
      });

    } catch (error: any) {
      logger.error('Error in kitchen action', { error });
      const httpStatus = error.status || 500;
      await logKitchenAudit({
        requestId,
        uid: req.user.uid,
        restaurantId: req.user.restaurantId,
        endpoint,
        orderId,
        action: normalizedAction,
        result: `ERROR: ${error.message || error}`,
        httpStatus
      });
      return res.status(httpStatus).json({ error: error.message || 'Erro interno ao processar ação de cozinha' });
    }
  };

  // General action endpoint
  router.post('/orders/:orderId/kitchen/action', verifyRestaurant, async (req: any, res: any) => {
    await handleKitchenAction(req, res);
  });

  // Individual friendly action endpoints for flexibility
  router.post('/orders/:orderId/kitchen/accept', verifyRestaurant, async (req: any, res: any) => {
    await handleKitchenAction(req, res, 'ACCEPT_ORDER');
  });

  router.post('/orders/:orderId/kitchen/start-prepare', verifyRestaurant, async (req: any, res: any) => {
    await handleKitchenAction(req, res, 'START_PREPARATION');
  });

  router.post('/orders/:orderId/kitchen/conclude-item', verifyRestaurant, async (req: any, res: any) => {
    await handleKitchenAction(req, res, 'CONCLUDE_ITEM');
  });

  router.post('/orders/:orderId/kitchen/conclude', verifyRestaurant, async (req: any, res: any) => {
    await handleKitchenAction(req, res, 'CONCLUDE_ORDER');
  });

  router.post('/orders/:orderId/kitchen/priority', verifyRestaurant, async (req: any, res: any) => {
    await handleKitchenAction(req, res, 'CHANGE_PRIORITY');
  });

  router.post('/orders/:orderId/kitchen/production-status', verifyRestaurant, async (req: any, res: any) => {
    await handleKitchenAction(req, res, 'UPDATE_PRODUCTION_STATUS');
  });

  return router;
}
