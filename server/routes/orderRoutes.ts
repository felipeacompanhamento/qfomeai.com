import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { createVerifyRestaurant } from '../middleware/auth';
import { getDefaultPermissionsForRole, hasPermission } from '../../src/domain/permissions/canonicalPermissions';
import {
  registerServerOrderPaymentMovement as registerServerOrderPaymentMovementUtil,
  requireOpenCashRegister as requireOpenCashRegisterUtil
} from '../utils/cashRegister';
import { sendPush as sendPushUtil } from '../utils/push';
import { logger } from '../utils/logger';

export function createOrderRouter(authAdmin: Auth, db: Firestore, messaging: Messaging): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  const sendPush = (token: string, title: string, body: string, orderId?: string, type?: string, targetUrl?: string) =>
    sendPushUtil(messaging, db, token, title, body, orderId, type, targetUrl);

  const registerServerOrderPaymentMovement = (restaurantId: string, orderId: string, orderData: any, createdBy: string) =>
    registerServerOrderPaymentMovementUtil(db, restaurantId, orderId, orderData, createdBy);

  const requireOpenCashRegister = (restaurantId: string, transaction?: any) =>
    requireOpenCashRegisterUtil(db, restaurantId, transaction);

  // POST: Assign a driver to an order
  router.post('/orders/:orderId/assign-driver', verifyRestaurant, async (req: any, res: any) => {
    const { orderId } = req.params;
    const { driverId } = req.body;
    const restaurantId = req.user.restaurantId;

    if (!driverId) {
      return res.status(400).json({ error: 'driverId é obrigatório' });
    }

    try {
      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(driverId);
      const staffRef = db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(driverId);
      const userRef = db.collection('users').doc(driverId);

      const [driverDoc, staffDoc, userDoc] = await Promise.all([
        driverRef.get(),
        staffRef.get(),
        userRef.get()
      ]);

      if (!driverDoc.exists && !staffDoc.exists && !userDoc.exists) {
        return res.status(404).json({ error: 'Entregador não encontrado neste restaurante' });
      }

      const dData = driverDoc.exists ? driverDoc.data()! : {};
      const pData = staffDoc.exists ? staffDoc.data()! : {};
      const uData = userDoc.exists ? userDoc.data()! : {};
      const roleData = pData.roleSpecificData || {};
      const commonData = pData.commonOperationalData || {};

      const driverData = {
        ...dData,
        ...pData,
        ...roleData,
        ...commonData,
        ...uData
      };

      const rawStatus = String(driverData.status || driverData.status_conta || driverData.operationalStatus || uData.status || pData.operationalStatus || '').toUpperCase().trim();
      const isExplicitlyInactive = ['INACTIVE', 'INATIVO', 'BLOCKED', 'BLOQUEADO', 'DISABLED', 'DESATIVADO', 'SUSPENDED'].includes(rawStatus);
      const isExplicitlyFalseActive = driverData.active === false || driverData.ativo === false || driverData.active === 'false' || driverData.ativo === 'false' || uData.active === false || uData.ativo === false;

      if (isExplicitlyInactive || isExplicitlyFalseActive) {
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
        logger.error('Error sending push to driver', { error: pushErr });
      }

      res.json({ 
        success: true, 
        message: 'Entregador atribuído com sucesso',
        requiresDriverAcceptance: entregadorAceitaRecusa,
        deliveryStatus: deliveryStatus
      });
    } catch (error: any) {
      logger.error('Error assigning driver', { error });
      res.status(500).json({ error: 'Erro ao atribuir entregador ao pedido.' });
    }
  });

  // POST: Settlement of payment collected by driver
  router.post('/orders/:orderId/settle-driver-payment', verifyRestaurant, async (req: any, res: any) => {
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
          ).catch(err => logger.error('[Driver Settlement Finance Integration] Error', { error: err }));
        }
      } catch (logErr) {
        logger.warn('Error recording financial log', { error: logErr });
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
          logger.warn('Error notifying driver of settlement', { error: dErr });
        }
      }

      res.json({
        success: true,
        message: 'Baixa financeira e finalização concluídas com sucesso',
        settledAt: now
      });
    } catch (error: any) {
      if (error.code === 'CASH_REGISTER_CLOSED' || error.code === 'CASH_REGISTER_NOT_OPEN') {
        return res.status(409).json({
          code: error.code,
          message: error.message,
          error: error.message
        });
      }
      logger.error('Error settling driver payment', { error });
      res.status(500).json({ error: 'Erro ao liquidar pagamento do entregador.' });
    }
  });

  // Canonical Order Status Update Endpoint
  router.post('/orders/:orderId/status', verifyRestaurant, async (req: any, res: any) => {
    const { orderId } = req.params;
    const { status: newStatus, motivo, clientActionId: rawClientActionId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId é obrigatório' });
    }

    if (!newStatus || typeof newStatus !== 'string' || !newStatus.trim()) {
      return res.status(400).json({ error: 'status é obrigatório' });
    }

    const rawActionId = rawClientActionId || req.headers['x-client-action-id'];
    if (!rawActionId || typeof rawActionId !== 'string' || !rawActionId.trim()) {
      return res.status(400).json({ error: 'clientActionId é obrigatório' });
    }
    const clientActionId = rawActionId.trim();

    try {
      // 1. Authenticate user & load user record
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      if (!userDoc.exists) {
        return res.status(401).json({ error: 'Usuário não encontrado' });
      }

      const userData = userDoc.data()!;

      // 2. Validate active account status
      if (userData.status === 'INACTIVE' || userData.active === false) {
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

      // 4. Validate canonical permissions
      const roleUpper = (userData.role || '').toUpperCase();
      const allowedRoles = ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN', 'CASHIER', 'WAITER', 'DRIVER'];
      if (!allowedRoles.includes(roleUpper)) {
        return res.status(403).json({
          error: 'FORBIDDEN_ACCESS',
          code: 'FORBIDDEN_ACCESS',
          message: 'Acesso negado: Perfil de usuário não autorizado para alterar status de pedidos.'
        });
      }

      const isCancellation = ['cancelado', 'rejeitado'].includes(newStatus.toLowerCase());
      const requiredPermission = isCancellation ? 'pedidos.cancelar' : 'pedidos.alterar_status';

      if (roleUpper !== 'OWNER') {
        const userPermissions = (userData.permissions !== undefined && userData.permissions !== null)
          ? userData.permissions
          : getDefaultPermissionsForRole(roleUpper);

        const effectiveUser = {
          ...userData,
          role: roleUpper,
          permissions: userPermissions
        };

        if (!hasPermission(effectiveUser, requiredPermission)) {
          return res.status(403).json({
            error: 'FORBIDDEN_ACCESS',
            code: 'FORBIDDEN_ACCESS',
            message: 'Acesso negado: Você não possui a permissão necessária para alterar o status deste pedido.'
          });
        }
      }

      // 5. Look up order
      const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
      const orderDoc = await orderRef.get();
      if (!orderDoc.exists) {
        return res.status(404).json({ error: 'Pedido não encontrado' });
      }

      const orderData = orderDoc.data()!;
      const currentStatus = orderData.status;

      if (currentStatus === newStatus) {
        return res.json({
          success: true,
          order: { id: orderDoc.id, ...orderData }
        });
      }

      // Terminal status check
      const terminalStatuses = ['finalizado', 'cancelado', 'rejeitado'];
      if (terminalStatuses.includes((currentStatus || '').toLowerCase())) {
        return res.status(400).json({
          error: 'INVALID_TRANSITION',
          message: `Este pedido já está no status "${currentStatus}" e não pode ter seu status alterado.`
        });
      }

      // Valid status transitions check
      const validTransitions: Record<string, string[]> = {
        pendente: ['aceito', 'preparo', 'em preparo', 'em_preparo', 'cancelado', 'rejeitado'],
        recebido: ['aceito', 'preparo', 'em preparo', 'em_preparo', 'cancelado', 'rejeitado'],
        aceito: ['preparo', 'em preparo', 'em_preparo', 'pronto', 'cancelado', 'rejeitado'],
        confirmado: ['preparo', 'em preparo', 'em_preparo', 'pronto', 'cancelado', 'rejeitado'],
        preparo: ['pronto', 'cancelado', 'rejeitado'],
        'em preparo': ['pronto', 'cancelado', 'rejeitado'],
        'em_preparo': ['pronto', 'cancelado', 'rejeitado'],
        pronto: ['saiu_entrega', 'entrega', 'saiu para entrega', 'saiu_para_entrega', 'entregue', 'finalizado', 'cancelado', 'rejeitado'],
        saiu_entrega: ['entregue', 'finalizado', 'cancelado'],
        entrega: ['entregue', 'finalizado', 'cancelado'],
        'saiu para entrega': ['entregue', 'finalizado', 'cancelado'],
        'saiu_para_entrega': ['entregue', 'finalizado', 'cancelado'],
        entregue: ['finalizado', 'cancelado']
      };

      const allowedNext = validTransitions[(currentStatus || '').toLowerCase()] || ['cancelado', 'rejeitado'];
      if (!allowedNext.includes(newStatus.toLowerCase())) {
        return res.status(400).json({
          error: 'INVALID_TRANSITION',
          message: `Transição de status inválida: de "${currentStatus}" para "${newStatus}".`
        });
      }

      // 6. Execute atomic transaction with idempotency check
      const actionDocId = `${req.user.uid}_${orderId}_status_${newStatus}_${clientActionId}`;
      const actionRef = db.collection('restaurants').doc(restaurantId).collection('processedStatusActions').doc(actionDocId);

      const now = new Date().toISOString();
      const updates: any = {
        status: newStatus,
        updatedAt: now
      };

      if (newStatus === 'aceito') {
        updates.data_aceite = now;
      } else if (newStatus === 'rejeitado' || newStatus === 'cancelado') {
        if (motivo) updates.motivo_cancelamento = motivo;
        updates.cancelledAt = now;
      } else if (newStatus === 'finalizado') {
        updates.data_finalizado = now;
        updates.finalizedAt = now;
      }

      const transactionResult = await db.runTransaction(async (transaction) => {
        const actionDoc = await transaction.get(actionRef);
        if (actionDoc.exists) {
          return { duplicate: true };
        }

        const tOrderDoc = await transaction.get(orderRef);
        if (!tOrderDoc.exists) {
          throw new Error('ORDER_NOT_FOUND');
        }

        transaction.set(actionRef, {
          clientActionId,
          restaurantId,
          uid: req.user.uid,
          orderId,
          status: newStatus,
          processedAt: now
        });

        transaction.update(orderRef, updates);
        return { success: true };
      });

      if (transactionResult.duplicate) {
        return res.status(409).json({
          error: 'DUPLICATE_ACTION',
          code: 'DUPLICATE_ACTION',
          message: 'Esta ação já foi processada anteriormente.'
        });
      }

      // Fetch fresh updated order
      const finalDoc = await orderRef.get();
      const updatedOrder = { id: finalDoc.id, ...finalDoc.data() };

      return res.json({
        success: true,
        message: `Status do pedido atualizado para ${newStatus}`,
        order: updatedOrder
      });

    } catch (error: any) {
      logger.error('Error updating order status', { error });
      return res.status(500).json({ error: 'Erro interno ao atualizar status do pedido.' });
    }
  });

  return router;
}
