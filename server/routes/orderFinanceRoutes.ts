import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { createVerifyRestaurant } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { hasPermission } from '../../src/domain/permissions/canonicalPermissions';
import { normalizePaymentMethodId, extractConfiguredPaymentMethods } from '../constants/payment';
import { sanitizeForFirestore } from '../utils/sanitize';
import { logger } from '../utils/logger';

export function createOrderFinanceRouter(authAdmin: Auth, db: Firestore): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);
  const financialLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 financial requests per minute per IP
    message: 'Muitas operações financeiras simultâneas. Por favor, aguarde alguns segundos.'
  });

  router.post('/processar-pagamentos', verifyRestaurant, financialLimiter, async (req: any, res: any) => {
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em /processar-pagamentos', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }
    try {
      // 1. autenticar
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Usuário não autenticado.', code: 'UNAUTHORIZED', requestId });
      }

      // 2. carregar usuário canônico
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      if (!userDoc.exists) {
        return res.status(401).json({ error: 'Usuário não autenticado.', code: 'UNAUTHORIZED', requestId });
      }
      const userData = userDoc.data() || {};

      // 3. validar conta ativa
      if (userData.status === 'INACTIVE' || userData.active === false) {
        return res.status(403).json({ error: 'Sua conta está desativada. Entre em contato com o proprietário.', code: 'FORBIDDEN', requestId });
      }

      // 4. validar restaurantId
      const restaurantId = userData.restaurantId;
      if (!restaurantId) {
        return res.status(403).json({ error: 'Você não tem um restaurante associado à sua conta.', code: 'FORBIDDEN', requestId });
      }

      // 5. validar cargo e permissão financeira
      const roleUpper = (userData.role || '').toUpperCase();
      if (['KITCHEN', 'WAITER', 'DRIVER'].includes(roleUpper)) {
        return res.status(403).json({ error: 'Seu cargo não possui permissão para realizar operações financeiras.', code: 'FORBIDDEN', requestId });
      }
      if (!hasPermission(userData, 'caixa.visualizar')) {
        return res.status(403).json({ error: 'Você não tem permissão para realizar operações financeiras.', code: 'FORBIDDEN', requestId });
      }

      // Validate payload basics
      const { orderId, payments, operatorName, clientActionId } = req.body || {};
      if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'orderId é obrigatório.', code: 'ORDER_NOT_FOUND', requestId });
      }

      if (!Array.isArray(payments) || payments.length === 0) {
        return res.status(400).json({ error: 'A lista de pagamentos é obrigatória.', code: 'INVALID_PAYLOAD', requestId });
      }

      // Validate amounts and payment methods in payload
      for (const p of payments) {
        if (!p || typeof p !== 'object') {
          return res.status(400).json({ error: 'Item de pagamento inválido.', code: 'INVALID_PAYLOAD', requestId });
        }
        const amt = Number(p.amount);
        if (isNaN(amt) || !Number.isFinite(amt) || !Number.isInteger(amt) || amt <= 0) {
          return res.status(400).json({ error: 'O valor do pagamento deve ser um número inteiro positivo em centavos.', code: 'INVALID_AMOUNT', requestId });
        }
        const pmId = normalizePaymentMethodId(p.paymentMethodId);
        if (!pmId) {
          return res.status(400).json({ error: 'Forma de pagamento inválida ou não especificada.', code: 'INVALID_PAYMENT_METHOD', requestId });
        }
      }

      // Execute atomic transaction with highly optimized parallel reads and self-healing retry logic under contention
      let attempts = 0;
      const maxAttempts = 8;
      let transactionResult;

      while (attempts < maxAttempts) {
        try {
          attempts++;
          transactionResult = await db.runTransaction(async (transaction) => {
            const actionRef = (clientActionId && typeof clientActionId === 'string' && clientActionId.trim())
              ? db.collection('restaurants').doc(restaurantId).collection('processedActions').doc(clientActionId.trim())
              : null;
            
            const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
            const restRef = db.collection('restaurants').doc(restaurantId);
            const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');

            // Fetch all required resources in a single batch to avoid multiple serial awaits
            const [actionSnap, orderSnap, restSnap, openCaixasQuery] = await Promise.all([
              actionRef ? transaction.get(actionRef) : Promise.resolve(null),
              transaction.get(orderRef),
              transaction.get(restRef),
              transaction.get(caixasRef.where('status', '==', 'OPEN'))
            ]);

            // Check clientActionId for idempotency
            if (actionSnap && actionSnap.exists) {
              const err: any = new Error('Esta ação já foi processada anteriormente.');
              err.status = 409;
              err.code = 'DUPLICATE_ACTION';
              throw err;
            }

            // 6. buscar pedido
            if (!orderSnap.exists) {
              const err: any = new Error('Pedido não encontrado.');
              err.status = 404;
              err.code = 'ORDER_NOT_FOUND';
              throw err;
            }

            const orderData = orderSnap.data() || {};

            // 7. confirmar que o pedido pertence ao mesmo restaurante
            const orderRestId = orderData.restaurantId || orderData.restaurante_id;
            if (orderRestId && orderRestId !== restaurantId) {
              const err: any = new Error('Acesso negado ao pedido de outro restaurante.');
              err.status = 403;
              err.code = 'RESTAURANT_MISMATCH';
              throw err;
            }

            // 8. validar estado financeiro atual (pedido não cancelado)
            if (orderData.status === 'cancelado') {
              const err: any = new Error('Não é possível processar pagamentos para um pedido cancelado.');
              err.status = 400;
              err.code = 'ORDER_CANCELLED';
              throw err;
            }

            // 10. validar regra de negócio (formas de pagamento habilitadas)
            if (!restSnap.exists) {
              const err: any = new Error('Restaurante não encontrado.');
              err.status = 404;
              err.code = 'RESTAURANT_NOT_FOUND';
              throw err;
            }
            const restData = restSnap.data() || {};
            const enabledPaymentMethods = extractConfiguredPaymentMethods(restData);
            const hasExplicitConfig = restData.formas_pagamento || restData.payment_methods;

            for (const p of payments) {
              const pmId = normalizePaymentMethodId(p.paymentMethodId)!;
              if (hasExplicitConfig && !enabledPaymentMethods.has(pmId)) {
                const err: any = new Error(`Forma de pagamento desabilitada pelo restaurante: ${pmId}`);
                err.status = 422;
                err.code = 'PAYMENT_METHOD_DISABLED';
                throw err;
              }
            }

            // Validate active open cash register
            if (openCaixasQuery.empty) {
              const err: any = new Error('Nenhum caixa aberto encontrado.');
              err.status = 404;
              err.code = 'CASH_REGISTER_NOT_FOUND';
              throw err;
            }
            const activeCaixa = openCaixasQuery.docs[0];
            const cashRegisterId = activeCaixa.id;

            // Calculate totals and balance
            let totalCents = 0;
            if (typeof orderData.valor_total === 'number') {
              totalCents = Math.round(orderData.valor_total * 100);
            } else if (typeof orderData.total === 'number') {
              totalCents = Math.round(orderData.total * 100);
            } else if (typeof orderData.valor_produtos === 'number') {
              totalCents = Math.round(orderData.valor_produtos * 100);
            }

            const existingPayments = Array.isArray(orderData.payments) ? orderData.payments : [];
            const alreadyPaidCents = existingPayments
              .filter((p: any) => p.status === 'PAID')
              .reduce((sum: number, p: any) => sum + p.amount, 0);

            const pendingCents = totalCents - alreadyPaidCents;

            // Check already fully paid
            if (pendingCents <= 0) {
              const err: any = new Error('Este pedido já foi totalmente pago.');
              err.status = 409;
              err.code = 'ORDER_ALREADY_PAID';
              throw err;
            }

            // Check for duplicated payment entries
            for (const p of payments) {
              if (p.id && existingPayments.some((ep: any) => ep.id === p.id && ep.status === 'PAID')) {
                const err: any = new Error(`Pagamento com ID ${p.id} já foi registrado.`);
                err.status = 409;
                err.code = 'DUPLICATE_PAYMENT';
                throw err;
              }
            }

            const newPaymentsSum = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

            // Check payment sum limits
            if (newPaymentsSum > pendingCents) {
              const hasDinheiro = payments.some((p: any) => p.paymentMethodId === 'dinheiro');
              if (!hasDinheiro) {
                const err: any = new Error('A soma dos pagamentos não pode ser superior ao saldo pendente para formas de pagamento eletrônicas.');
                err.status = 422;
                err.code = 'PAYMENT_EXCEEDS_PENDING';
                throw err;
              }
            }

            // 11. executar transação
            const normalizedNewPayments = payments.map((p: any, idx: number) => ({
              id: p.id || `p_${Date.now()}_${idx}`,
              paymentMethodId: normalizePaymentMethodId(p.paymentMethodId)!,
              amount: Math.round(Number(p.amount)),
              status: p.status || 'PAID',
              createdAt: new Date().toISOString()
            }));

            const updatedPaymentsList = [...existingPayments, ...normalizedNewPayments];

            const newPaidCents = updatedPaymentsList
              .filter((p: any) => p.status === 'PAID')
              .reduce((sum: number, p: any) => sum + p.amount, 0);

            const isFullyPaid = newPaidCents >= totalCents && totalCents > 0;

            let changeAmountCents = 0;
            if (newPaidCents > totalCents) {
              changeAmountCents = newPaidCents - totalCents;
            }

            const finalAmountReceivedCents = newPaidCents;
            const finalChangeAmountCents = changeAmountCents;

            let principalMethod = orderData.forma_pagamento;
            if (updatedPaymentsList.length > 0) {
              const highest = updatedPaymentsList.reduce((prev: any, current: any) => (prev.amount > current.amount) ? prev : current, updatedPaymentsList[0]);
              principalMethod = highest.paymentMethodId;
            }

            const updateData: any = {
              payments: updatedPaymentsList,
              pago: isFullyPaid,
              amountReceived: finalAmountReceivedCents / 100,
              changeAmount: finalChangeAmountCents / 100,
              troco: finalChangeAmountCents / 100,
              forma_pagamento: principalMethod || 'dinheiro',
              financialSettlementStatus: isFullyPaid ? 'SETTLED' : 'PARTIALLY_SETTLED',
              updatedAt: new Date().toISOString()
            };

            const sanitizedUpdateData = sanitizeForFirestore(updateData);
            transaction.update(orderRef, sanitizedUpdateData);

            if (clientActionId && typeof clientActionId === 'string' && clientActionId.trim()) {
              const actionRef = db.collection('restaurants').doc(restaurantId).collection('processedActions').doc(clientActionId.trim());
              transaction.set(actionRef, {
                processedAt: new Date().toISOString(),
                orderId,
                payments: normalizedNewPayments
              });
            }

            for (const np of normalizedNewPayments) {
              const movementId = `ORDER_PAYMENT:${orderId}:${np.id}`;
              const movementRef = caixasRef.doc(cashRegisterId).collection('movimentacoes').doc(movementId);
              
              let netAmount = np.amount;
              if (np.paymentMethodId === 'dinheiro' && changeAmountCents > 0) {
                netAmount = np.amount - changeAmountCents;
              }

              const movementData = {
                id: movementId,
                type: 'ENTRY',
                origin: 'ORDER',
                amount: np.amount,
                amountCents: np.amount,
                netAmountCents: netAmount,
                changeAmountCents: np.paymentMethodId === 'dinheiro' ? changeAmountCents : 0,
                paymentMethodId: np.paymentMethodId,
                description: `Recebimento pedido #${orderData.numero_pedido || orderData.numero || orderId}`,
                orderId,
                paymentId: np.id,
                operatorName: operatorName || userData.nome || userData.name || 'Operador',
                operatorId: req.user.uid,
                createdAt: new Date().toISOString(),
                timestamp: new Date().toISOString()
              };

              transaction.set(movementRef, sanitizeForFirestore(movementData));
            }

            return {
              order: { ...orderData, ...sanitizedUpdateData },
              cashRegisterId
            };
          });
          break; // Succeeded! Break the retry loop
        } catch (error: any) {
          const isAborted = error.code === 10 || 
                            error.status === 10 || 
                            error.message?.includes('ABORTED') || 
                            error.message?.includes('conflict') ||
                            error.message?.includes('contention') ||
                            error.message?.includes('Please retry the transaction');

          if (isAborted && attempts < maxAttempts) {
            // Jittered backoff: wait between 40ms and (attempts * 100)ms before retrying
            const delay = 40 + Math.random() * (attempts * 100);
            logger.warn(`Concurrencia detectada (processar-pagamentos). Tentativa ${attempts}/${maxAttempts} aguardando ${delay.toFixed(0)}ms.`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
      }

      // 12. registrar auditoria
      await db.collection('restaurants').doc(restaurantId).collection('financialAuditLogs').add(sanitizeForFirestore({
        requestId,
        uid: req.user.uid,
        restaurantId,
        orderId,
        payments: payments.map((p: any) => ({ id: p.id, amount: p.amount, paymentMethodId: p.paymentMethodId })),
        caixa: transactionResult.cashRegisterId,
        acao: 'PROCESS_PAYMENT',
        valor: payments.reduce((sum: number, p: any) => sum + p.amount, 0),
        forma_pagamento: payments.map((p: any) => p.paymentMethodId).join(', '),
        motivo_estorno: null,
        resultado: 'success',
        codigoHttp: 200,
        createdAt: new Date().toISOString()
      }));

      return res.json({
        success: true,
        order: transactionResult.order,
        requestId
      });

    } catch (error: any) {
      const httpStatus = error.status || 500;
      const errorCode = error.code || 'HTTP_ERROR';
      const errorMessage = error.message || 'Erro inesperado ao processar pagamento.';

      const restaurantId = req.user?.restaurantId;
      if (restaurantId) {
        try {
          await db.collection('restaurants').doc(restaurantId).collection('financialAuditLogs').add(sanitizeForFirestore({
            requestId,
            uid: req.user?.uid || 'unknown',
            restaurantId,
            orderId: req.body?.orderId || null,
            payments: req.body?.payments || null,
            caixa: null,
            acao: 'PROCESS_PAYMENT_FAILED',
            valor: 0,
            forma_pagamento: null,
            motivo_estorno: null,
            resultado: 'failure',
            codigoHttp: httpStatus,
            errorMessage,
            createdAt: new Date().toISOString()
          }));
        } catch (auditErr) {
          logger.error('Falha ao registrar auditoria de erro', { error: auditErr });
        }
      }

      logger.error(`[PROCESS_PAYMENT] Error status ${httpStatus}`, { error });
      return res.status(httpStatus).json({
        success: false,
        error: errorMessage,
        code: errorCode,
        requestId
      });
    }
  });

  router.post('/processar-estorno', verifyRestaurant, financialLimiter, async (req: any, res: any) => {
    let requestId = req.requestId;
    if (!requestId) {
      logger.error('req.requestId ausente em /processar-estorno', { infraError: true });
      requestId = 'NO_REQUEST_ID_FOUND';
    }
    try {
      // 1. autenticar
      if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Usuário não autenticado.', code: 'UNAUTHORIZED', requestId });
      }

      // 2. carregar usuário canônico
      const userDoc = await db.collection('users').doc(req.user.uid).get();
      if (!userDoc.exists) {
        return res.status(401).json({ error: 'Usuário não autenticado.', code: 'UNAUTHORIZED', requestId });
      }
      const userData = userDoc.data() || {};

      // 3. validar conta ativa
      if (userData.status === 'INACTIVE' || userData.active === false) {
        return res.status(403).json({ error: 'Sua conta está desativada. Entre em contato com o proprietário.', code: 'FORBIDDEN', requestId });
      }

      // 4. validar restaurantId
      const restaurantId = userData.restaurantId;
      if (!restaurantId) {
        return res.status(403).json({ error: 'Você não tem um restaurante associado à sua conta.', code: 'FORBIDDEN', requestId });
      }

      // 5. validar cargo e permissão financeira de estorno (permissão explícita caixa.estornar)
      const roleUpper = (userData.role || '').toUpperCase();
      if (['KITCHEN', 'WAITER', 'DRIVER'].includes(roleUpper)) {
        return res.status(403).json({ error: 'Seu cargo não possui permissão para estornos.', code: 'FORBIDDEN', requestId });
      }
      if (!hasPermission(userData, 'caixa.estornar')) {
        return res.status(403).json({ error: 'Seu usuário não possui permissão explícita para realizar estornos.', code: 'FORBIDDEN', requestId });
      }

      // Validate payload basics
      const { orderId, paymentId, operatorName, reason, clientActionId } = req.body || {};
      if (!orderId || typeof orderId !== 'string') {
        return res.status(400).json({ error: 'orderId é obrigatório.', code: 'ORDER_NOT_FOUND', requestId });
      }
      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({ error: 'O motivo do estorno é obrigatório.', code: 'REFUND_REASON_REQUIRED', requestId });
      }

      const targetId = paymentId || 'legacy';

      // Execute atomic transaction
      const transactionResult = await db.runTransaction(async (transaction) => {
        // Idempotency check for clientActionId
        if (clientActionId && typeof clientActionId === 'string' && clientActionId.trim()) {
          const actionRef = db.collection('restaurants').doc(restaurantId).collection('processedActions').doc(clientActionId.trim());
          const actionSnap = await transaction.get(actionRef);
          if (actionSnap.exists) {
            const err: any = new Error('Esta ação já foi processada anteriormente.');
            err.status = 409;
            err.code = 'DUPLICATE_ACTION';
            throw err;
          }
        }

        // 6. buscar pedido
        const orderRef = db.collection('restaurants').doc(restaurantId).collection('orders').doc(orderId);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) {
          const err: any = new Error('Pedido não encontrado.');
          err.status = 404;
          err.code = 'ORDER_NOT_FOUND';
          throw err;
        }

        const orderData = orderSnap.data() || {};

        // 7. confirmar que o pedido pertence ao mesmo restaurante
        const orderRestId = orderData.restaurantId || orderData.restaurante_id;
        if (orderRestId && orderRestId !== restaurantId) {
          const err: any = new Error('Acesso negado ao pedido de outro restaurante.');
          err.status = 403;
          err.code = 'RESTAURANT_MISMATCH';
          throw err;
        }

        // Validate active open cash register
        const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
        const openCaixasQuery = await transaction.get(caixasRef.where('status', '==', 'OPEN'));
        if (openCaixasQuery.empty) {
          const err: any = new Error('Nenhum caixa aberto encontrado.');
          err.status = 404;
          err.code = 'CASH_REGISTER_NOT_FOUND';
          throw err;
        }
        const activeCaixa = openCaixasQuery.docs[0];
        const cashRegisterId = activeCaixa.id;

        // Find structured payments
        let payments = Array.isArray(orderData.payments) ? orderData.payments : [];
        if (payments.length === 0) {
          const pmId = normalizePaymentMethodId(orderData.forma_pagamento || orderData.paymentMethodId || orderData.paymentMethod || 'dinheiro') || 'dinheiro';
          let totalCents = 0;
          if (typeof orderData.valor_total === 'number') {
            totalCents = Math.round(orderData.valor_total * 100);
          } else if (typeof orderData.total === 'number') {
            totalCents = Math.round(orderData.total * 100);
          }
          payments = [{
            id: 'legacy',
            paymentMethodId: pmId,
            amount: totalCents,
            status: orderData.pago ? 'PAID' : 'PENDING'
          }];
        }

        const paymentIndex = payments.findIndex((p: any) => (p.id || 'legacy') === targetId);

        if (paymentIndex === -1) {
          const err: any = new Error('Pagamento não encontrado no pedido.');
          err.status = 404;
          err.code = 'PAYMENT_NOT_FOUND';
          throw err;
        }

        const targetPayment = payments[paymentIndex];

        // 8. validar estado financeiro atual (impedir estornos duplicados / não pagos)
        if (targetPayment.status === 'REFUNDED') {
          const err: any = new Error('Este pagamento já foi estornado.');
          err.status = 409;
          err.code = 'PAYMENT_ALREADY_REFUNDED';
          throw err;
        }

        if (targetPayment.status !== 'PAID') {
          const err: any = new Error('Apenas pagamentos com status PAGO podem ser estornados.');
          err.status = 422;
          err.code = 'PAYMENT_NOT_PAID';
          throw err;
        }

        // 11. executar transação
        payments[paymentIndex] = {
          ...targetPayment,
          status: 'REFUNDED',
          refundedAt: new Date().toISOString(),
          refundReason: reason.trim()
        };

        let totalCents = 0;
        if (typeof orderData.valor_total === 'number') {
          totalCents = Math.round(orderData.valor_total * 100);
        } else if (typeof orderData.total === 'number') {
          totalCents = Math.round(orderData.total * 100);
        }

        const newPaidSum = payments
          .filter((p: any) => p.status === 'PAID')
          .reduce((sum: number, p: any) => sum + p.amount, 0);

        const isFullyPaid = newPaidSum >= totalCents && totalCents > 0;

        const updateData = {
          payments,
          pago: isFullyPaid,
          financialSettlementStatus: newPaidSum === 0 ? 'REFUNDED' : (isFullyPaid ? 'SETTLED' : 'PARTIALLY_SETTLED'),
          updatedAt: new Date().toISOString()
        };

        transaction.update(orderRef, sanitizeForFirestore(updateData));

        if (clientActionId && typeof clientActionId === 'string' && clientActionId.trim()) {
          const actionRef = db.collection('restaurants').doc(restaurantId).collection('processedActions').doc(clientActionId.trim());
          transaction.set(actionRef, {
            processedAt: new Date().toISOString(),
            orderId,
            paymentId: targetId,
            action: 'REFUND'
          });
        }

        // Record EXIT movement in active cash register
        const movementId = `ORDER_REFUND:${orderId}:${targetId}`;
        const movementRef = caixasRef.doc(cashRegisterId).collection('movimentacoes').doc(movementId);

        const movementData = {
          id: movementId,
          type: 'EXIT',
          origin: 'REFUND',
          amount: targetPayment.amount,
          amountCents: targetPayment.amount,
          paymentMethodId: targetPayment.paymentMethodId,
          description: `Estorno pedido #${orderData.numero_pedido || orderData.numero || orderId} - Motivo: ${reason.trim()}`,
          orderId,
          paymentId: targetId,
          refundReason: reason.trim(),
          operatorName: operatorName || userData.nome || userData.name || 'Operador',
          operatorId: req.user.uid,
          createdAt: new Date().toISOString(),
          timestamp: new Date().toISOString()
        };

        transaction.set(movementRef, sanitizeForFirestore(movementData));

        return {
          order: { ...orderData, ...updateData },
          cashRegisterId,
          refundAmount: targetPayment.amount,
          paymentMethodId: targetPayment.paymentMethodId
        };
      });

      // 12. registrar auditoria
      await db.collection('restaurants').doc(restaurantId).collection('financialAuditLogs').add(sanitizeForFirestore({
        requestId,
        uid: req.user.uid,
        restaurantId,
        orderId,
        paymentId: targetId,
        caixa: transactionResult.cashRegisterId,
        acao: 'PROCESS_REFUND',
        valor: transactionResult.refundAmount,
        forma_pagamento: transactionResult.paymentMethodId,
        motivo_estorno: reason.trim(),
        resultado: 'success',
        codigoHttp: 200,
        createdAt: new Date().toISOString()
      }));

      return res.json({
        success: true,
        order: transactionResult.order,
        requestId
      });

    } catch (error: any) {
      const httpStatus = error.status || 500;
      const errorCode = error.code || 'HTTP_ERROR';
      const errorMessage = error.message || 'Erro inesperado ao processar estorno.';

      const restaurantId = req.user?.restaurantId;
      if (restaurantId) {
        try {
          await db.collection('restaurants').doc(restaurantId).collection('financialAuditLogs').add(sanitizeForFirestore({
            requestId,
            uid: req.user?.uid || 'unknown',
            restaurantId,
            orderId: req.body?.orderId || null,
            paymentId: req.body?.paymentId || null,
            caixa: null,
            acao: 'PROCESS_REFUND_FAILED',
            valor: 0,
            forma_pagamento: null,
            motivo_estorno: req.body?.reason || null,
            resultado: 'failure',
            codigoHttp: httpStatus,
            errorMessage,
            createdAt: new Date().toISOString()
          }));
        } catch (auditErr) {
          logger.error('Falha ao registrar auditoria de erro', { error: auditErr });
        }
      }

      logger.error(`[PROCESS_REFUND] Error status ${httpStatus}`, { error });
      return res.status(httpStatus).json({
        success: false,
        error: errorMessage,
        code: errorCode,
        requestId
      });
    }
  });

  return router;
}
