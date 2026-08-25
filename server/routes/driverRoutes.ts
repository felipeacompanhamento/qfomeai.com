import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import { createVerifyDriver } from '../middleware/auth';
import { logDriverAudit as logDriverAuditUtil } from '../utils/audit';
import { sendPush as sendPushUtil } from '../utils/push';
import { logger } from '../utils/logger';

export function createDriverRouter(authAdmin: Auth, db: Firestore, messaging: Messaging): Router {
  const router = Router();
  const verifyDriver = createVerifyDriver(authAdmin, db);

  const sendPush = (token: string, title: string, body: string, orderId?: string, type?: string, targetUrl?: string) =>
    sendPushUtil(messaging, db, token, title, body, orderId, type, targetUrl);

  const logDriverAudit = (params: any) => logDriverAuditUtil(db, params);

  // POST: Execute driver delivery action
  router.post('/orders/:orderId/action', verifyDriver, async (req: any, res: any) => {
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em POST /orders/:orderId/action', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }
    const { orderId } = req.params;
    const { action, reason, failureReason, clientActionId } = req.body;
    const driver = req.driver;
    const restaurantId = driver.restaurantId;

    if (!clientActionId) {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: action || 'UNKNOWN',
        result: 'MISSING_CLIENT_ACTION_ID',
        httpStatus: 400
      });
      return res.status(400).json({ error: 'clientActionId é obrigatório' });
    }

    let normalizedAction = (action || '').toString().trim().toUpperCase();
    if (normalizedAction === 'ACEITAR') normalizedAction = 'ACCEPT';
    if (normalizedAction === 'RECUSAR') normalizedAction = 'REJECT';
    if (normalizedAction === 'INICIAR ENTREGA' || normalizedAction === 'INICIAR_ENTREGA') normalizedAction = 'START';
    if (normalizedAction === 'FINALIZAR ENTREGA' || normalizedAction === 'FINALIZAR_ENTREGA' || normalizedAction === 'DELIVERED') normalizedAction = 'DELIVER';

    if (!normalizedAction || !['ACCEPT', 'REJECT', 'START', 'DELIVER', 'FAIL'].includes(normalizedAction)) {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: action || 'UNKNOWN',
        result: 'INVALID_ACTION',
        httpStatus: 400
      });
      return res.status(400).json({ error: 'Ação inválida. Use aceitar, recusar, iniciar entrega ou finalizar entrega.' });
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

    // First, check if order exists in ANY restaurant's order collection globally to distinguish 404 vs 403
    let orderQuery;
    try {
      orderQuery = await db.collectionGroup('orders').where('id', '==', orderId).get();
    } catch (queryErr: any) {
      logger.error('Error querying order globally', { error: queryErr });
    }

    if (!orderQuery || orderQuery.empty) {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: normalizedAction,
        result: 'ORDER_NOT_FOUND',
        httpStatus: 404
      });
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    const orderDocSnap = orderQuery.docs[0];
    const orderData = orderDocSnap.data();
    const orderPathParts = orderDocSnap.ref.path.split('/');
    const orderRestaurantId = orderPathParts[1];

    if (orderRestaurantId !== restaurantId) {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: normalizedAction,
        result: 'FORBIDDEN_OTHER_RESTAURANT',
        httpStatus: 403
      });
      return res.status(403).json({ error: 'Este pedido pertence a outro restaurante' });
    }

    const isAssignedToThisDriver = 
      orderData.driverId === driver.id || 
      orderData.assignedDriverId === driver.id || 
      orderData.entregador_id === driver.id;

    if (!isAssignedToThisDriver) {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: normalizedAction,
        result: 'FORBIDDEN_NOT_ASSIGNED',
        httpStatus: 403
      });
      return res.status(403).json({ error: 'Este pedido não está atribuído a você' });
    }

    const currentStatus = getServerOrderDeliveryStatus(orderData);
    if (normalizedAction === 'ACCEPT' && currentStatus !== 'ASSIGNED') {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: normalizedAction,
        result: 'INVALID_TRANSITION',
        httpStatus: 409
      });
      return res.status(409).json({ error: 'Transição de status inválida', currentStatus, requestedAction: normalizedAction });
    }
    if (normalizedAction === 'REJECT' && currentStatus !== 'ASSIGNED') {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: normalizedAction,
        result: 'INVALID_TRANSITION',
        httpStatus: 409
      });
      return res.status(409).json({ error: 'Transição de status inválida', currentStatus, requestedAction: normalizedAction });
    }
    if (normalizedAction === 'START' && currentStatus !== 'ACCEPTED') {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: normalizedAction,
        result: 'INVALID_TRANSITION',
        httpStatus: 409
      });
      return res.status(409).json({ error: 'Transição de status inválida', currentStatus, requestedAction: normalizedAction });
    }
    if (normalizedAction === 'DELIVER' && currentStatus !== 'IN_TRANSIT') {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: normalizedAction,
        result: 'INVALID_TRANSITION',
        httpStatus: 409
      });
      return res.status(409).json({ error: 'Transição de status inválida', currentStatus, requestedAction: normalizedAction });
    }
    if (normalizedAction === 'FAIL' && currentStatus !== 'IN_TRANSIT') {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        orderId,
        action: normalizedAction,
        result: 'INVALID_TRANSITION',
        httpStatus: 409
      });
      return res.status(409).json({ error: 'Transição de status inválida', currentStatus, requestedAction: normalizedAction });
    }

    try {
      const driverRef = db.collection('restaurants').doc(restaurantId).collection('drivers').doc(driver.id);
      const actionRef = driverRef.collection('processedActions').doc(clientActionId);
      const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
      const deliveryRef = db.collection('restaurants').doc(restaurantId).collection('deliveries').doc(orderId);
      const eventRef = deliveryRef.collection('events').doc();

      const now = new Date().toISOString();

      const cleanUndefined = (obj: any): any => {
        const cleaned: any = {};
        for (const key of Object.keys(obj)) {
          if (obj[key] !== undefined) {
            if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key]) && !(obj[key] instanceof Date)) {
              cleaned[key] = cleanUndefined(obj[key]);
            } else {
              cleaned[key] = obj[key];
            }
          }
        }
        return cleaned;
      };

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
        const orderDataInsideTx = orderDoc.data()!;

        // 3. Validate driver is assigned
        const isAssignedToThisDriverTx = 
          orderDataInsideTx.driverId === driver.id || 
          orderDataInsideTx.assignedDriverId === driver.id || 
          orderDataInsideTx.entregador_id === driver.id;

        if (!isAssignedToThisDriverTx) {
          throw { status: 403, message: 'Este pedido não está atribuído a você' };
        }

        // 4. Validate transition inside transaction
        const currentStatusTx = getServerOrderDeliveryStatus(orderDataInsideTx);
        if (normalizedAction === 'ACCEPT' && currentStatusTx !== 'ASSIGNED') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus: currentStatusTx, requestedAction: normalizedAction };
        }
        if (normalizedAction === 'REJECT' && currentStatusTx !== 'ASSIGNED') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus: currentStatusTx, requestedAction: normalizedAction };
        }
        if (normalizedAction === 'START' && currentStatusTx !== 'ACCEPTED') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus: currentStatusTx, requestedAction: normalizedAction };
        }
        if (normalizedAction === 'DELIVER' && currentStatusTx !== 'IN_TRANSIT') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus: currentStatusTx, requestedAction: normalizedAction };
        }
        if (normalizedAction === 'FAIL' && currentStatusTx !== 'IN_TRANSIT') {
          throw { status: 409, message: 'Transição de status inválida', currentStatus: currentStatusTx, requestedAction: normalizedAction };
        }

        // 5. Load driver document
        const driverDoc = await transaction.get(driverRef);
        const driverDocData = driverDoc.exists ? driverDoc.data() : null;

        // Perform Writes
        // Set processed action
        transaction.set(actionRef, {
          clientActionId,
          orderId,
          action: normalizedAction,
          driverId: driver.id,
          restaurantId,
          processedAt: now
        });

        let orderUpdates: any = { updated_at: now };
        let deliveryUpdates: any = { updatedAt: now };
        let driverUpdates: any = { updatedAt: now };

        // Determine new status for event logging
        let newStatus = currentStatusTx;

        if (normalizedAction === 'ACCEPT') {
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
        } else if (normalizedAction === 'REJECT') {
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
        } else if (normalizedAction === 'START') {
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
        } else if (normalizedAction === 'DELIVER') {
          newStatus = 'DELIVERED_PENDING_SETTLEMENT';
          
          const orderTotal = Number(orderDataInsideTx.valor_total || orderDataInsideTx.total || 0);
          const isPrepaid = orderDataInsideTx.pago === true || orderDataInsideTx.paymentStatus === 'PAID' || orderDataInsideTx.paymentStatus === 'SETTLED';
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
            throw { status: 400, message: 'O total recebido não pode ser menor que o valor pendente do pedido.' };
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
            logger.warn('Audit event log failed', { error: auditErr });
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
        } else if (normalizedAction === 'FAIL') {
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

        // Apply updates in transaction (cleaning undefined)
        transaction.update(orderRef, cleanUndefined(orderUpdates));
        transaction.set(deliveryRef, cleanUndefined(deliveryUpdates), { merge: true });
        transaction.set(driverRef, cleanUndefined(driverUpdates), { merge: true });

        // Save delivery event
        const reasonStr = reason || failureReason || '';
        transaction.set(eventRef, cleanUndefined({
          type: normalizedAction,
          orderId,
          driverId: driver.id,
          restaurantId,
          previousStatus: currentStatusTx,
          newStatus,
          reason: reasonStr,
          createdAt: now,
          clientActionId
        }));

        return { success: true, orderData: orderDataInsideTx };
      });

      if (result.alreadyProcessed) {
        await logDriverAudit({
          requestId,
          uid: driver.uid,
          driverId: driver.id,
          restaurantId,
          orderId,
          endpoint: `POST /api/driver/orders/${orderId}/action`,
          action: normalizedAction,
          result: 'DUPLICATE_ACTION',
          httpStatus: 409
        });
        return res.status(409).json({ error: 'Ação duplicada' });
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
            if (normalizedAction === 'START') {
              title = "Pedido a caminho! 🛵";
              body = `O entregador ${driver.name} saiu para entregar seu pedido #${orderId.slice(-6).toUpperCase()}.`;
            } else if (normalizedAction === 'DELIVER') {
              title = "Pedido Entregue! 🎉";
              body = `Seu pedido #${orderId.slice(-6).toUpperCase()} foi entregue com sucesso. Bom apetite!`;
            } else if (normalizedAction === 'FAIL') {
              title = "Problema na Entrega ⚠️";
              body = `Ocorreu um problema com a entrega do seu pedido #${orderId.slice(-6).toUpperCase()}. Entre em contato com o restaurante.`;
            }
            await sendPush(clientFcm, title, body, orderId, `delivery_${normalizedAction.toLowerCase()}`, '/orders');
          }
        }
      } catch (pErr) {
        logger.error('Error sending client push', { error: pErr });
      }

      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        orderId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        action: normalizedAction,
        result: 'SUCCESS',
        httpStatus: 200
      });

      res.json({ success: true, action: normalizedAction, message: `Ação ${normalizedAction} realizada com sucesso` });
    } catch (error: any) {
      logger.error('Error handling driver action transaction', { error });
      const errStatus = error.status || 500;
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        orderId,
        endpoint: `POST /api/driver/orders/${orderId}/action`,
        action: normalizedAction,
        result: `ERROR: ${error.message || error}`,
        httpStatus: errStatus
      });

      res.status(errStatus).json({
        error: error.message || 'Erro inesperado',
        currentStatus: error.currentStatus,
        requestedAction: error.requestedAction || normalizedAction
      });
    }
  });

  // POST: Start route with multiple orders
  router.post('/routes/start', verifyDriver, async (req: any, res: any) => {
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
          logger.error('Error sending push on route start', { error: pErr });
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
      logger.error('Error starting route', { error });
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Update driver availability status
  router.post('/availability', verifyDriver, async (req: any, res: any) => {
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em POST /availability', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }
    const { availabilityStatus, clientActionId } = req.body;
    const driver = req.driver;
    const restaurantId = driver.restaurantId;

    if (!availabilityStatus || !['ONLINE', 'OFFLINE'].includes(availabilityStatus)) {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: 'POST /api/driver/availability',
        action: 'UPDATE_AVAILABILITY',
        result: 'INVALID_STATUS',
        httpStatus: 400
      });
      return res.status(400).json({ error: 'Status de disponibilidade inválido. Use ONLINE ou OFFLINE' });
    }

    if (!clientActionId) {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: 'POST /api/driver/availability',
        action: 'UPDATE_AVAILABILITY',
        result: 'MISSING_CLIENT_ACTION_ID',
        httpStatus: 400
      });
      return res.status(400).json({ error: 'clientActionId é obrigatório' });
    }

    try {
      const staffProfileRef = db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(driver.id);
      const actionRef = staffProfileRef.collection('processedActions').doc(clientActionId);

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

        transaction.update(staffProfileRef, {
          'roleSpecificData.availability': availabilityStatus,
          updatedAt: now
        });

        return { success: true };
      });

      if (result.alreadyProcessed) {
        await logDriverAudit({
          requestId,
          uid: driver.uid,
          driverId: driver.id,
          restaurantId,
          endpoint: 'POST /api/driver/availability',
          action: `UPDATE_AVAILABILITY_${availabilityStatus}`,
          result: 'DUPLICATE_ACTION',
          httpStatus: 409
        });
        return res.status(409).json({ error: 'Ação duplicada' });
      }

      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: 'POST /api/driver/availability',
        action: `UPDATE_AVAILABILITY_${availabilityStatus}`,
        result: 'SUCCESS',
        httpStatus: 200
      });

      res.json({ success: true, availabilityStatus });
    } catch (error: any) {
      logger.error('Error updating driver availability', { error });
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: 'POST /api/driver/availability',
        action: `UPDATE_AVAILABILITY_${availabilityStatus}`,
        result: `ERROR: ${error.message}`,
        httpStatus: 500
      });
      res.status(500).json({ error: error.message });
    }
  });

  // POST: Update driver GPS location
  router.post('/location', verifyDriver, async (req: any, res: any) => {
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em POST /location', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }
    const { latitude, longitude, accuracy, heading, speed, timestamp, activeOrderIds } = req.body;
    const driver = req.driver;
    const restaurantId = driver.restaurantId;

    if (
      latitude === undefined || latitude === null ||
      longitude === undefined || longitude === null ||
      typeof latitude !== 'number' || typeof longitude !== 'number' ||
      Number.isNaN(latitude) || Number.isNaN(longitude) ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude)
    ) {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: 'POST /api/driver/location',
        action: 'UPDATE_LOCATION',
        result: 'INVALID_COORDINATES',
        httpStatus: 400
      });
      return res.status(400).json({ error: 'Coordenadas de GPS inválidas: latitude e longitude devem ser números finitos' });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: 'POST /api/driver/location',
        action: 'UPDATE_LOCATION',
        result: 'COORDINATES_OUT_OF_BOUNDS',
        httpStatus: 400
      });
      return res.status(400).json({ error: 'Coordenadas de GPS fora dos limites (-90 a 90 para latitude, -180 a 180 para longitude)' });
    }

    if (timestamp !== undefined && timestamp !== null) {
      const parsedDate = new Date(timestamp);
      if (Number.isNaN(parsedDate.getTime())) {
        await logDriverAudit({
          requestId,
          uid: driver.uid,
          driverId: driver.id,
          restaurantId,
          endpoint: 'POST /api/driver/location',
          action: 'UPDATE_LOCATION',
          result: 'INVALID_TIMESTAMP',
          httpStatus: 400
        });
        return res.status(400).json({ error: 'Timestamp inválido' });
      }
    }

    try {
      const cleanUndefined = (obj: any): any => {
        const cleaned: any = {};
        for (const key of Object.keys(obj)) {
          if (obj[key] !== undefined) {
            if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key]) && !(obj[key] instanceof Date)) {
              cleaned[key] = cleanUndefined(obj[key]);
            } else {
              cleaned[key] = obj[key];
            }
          }
        }
        return cleaned;
      };

      const now = new Date().toISOString();
      const recordedAt = timestamp || now;

      const batch = db.batch();
      const staffProfileRef = db.collection('restaurants').doc(restaurantId).collection('staffProfiles').doc(driver.id);

      const locationData = cleanUndefined({
        latitude,
        longitude,
        accuracy: (accuracy !== undefined && accuracy !== null && !Number.isNaN(accuracy) && Number.isFinite(accuracy)) ? accuracy : 0,
        heading: (heading !== undefined && heading !== null && !Number.isNaN(heading) && Number.isFinite(heading)) ? heading : null,
        speed: (speed !== undefined && speed !== null && !Number.isNaN(speed) && Number.isFinite(speed)) ? speed : null,
        recordedAt,
        receivedAt: now
      });

      batch.update(staffProfileRef, {
        'roleSpecificData.lastLocation': locationData,
        updatedAt: now
      });

      if (Array.isArray(activeOrderIds) && activeOrderIds.length > 0) {
        for (const orderId of activeOrderIds) {
          if (orderId) {
            const deliveryRef = db.collection('restaurants').doc(restaurantId).collection('deliveries').doc(orderId);
            batch.set(deliveryRef, {
              currentLocation: locationData,
              updatedAt: now
            }, { merge: true });
          }
        }
      }

      await batch.commit();

      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: 'POST /api/driver/location',
        action: 'UPDATE_LOCATION',
        result: 'SUCCESS',
        httpStatus: 200
      });

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Error updating driver location', { error });
      await logDriverAudit({
        requestId,
        uid: driver.uid,
        driverId: driver.id,
        restaurantId,
        endpoint: 'POST /api/driver/location',
        action: 'UPDATE_LOCATION',
        result: `ERROR: ${error.message}`,
        httpStatus: 500
      });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
