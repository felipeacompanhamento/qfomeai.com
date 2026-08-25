import type { Firestore } from 'firebase-admin/firestore';
import { normalizePaymentMethodId } from '../constants/payment';
import { logger } from './logger';

export async function registerServerOrderPaymentMovement(
  db: Firestore,
  restaurantId: string,
  orderId: string,
  orderData: any,
  createdBy: string
) {
  try {
    if (!restaurantId || !orderId || !orderData) return;

    // Find if there is an active OPEN caixa
    const activeCaixa = await resolveActiveCashRegister(db, restaurantId);
    if (!activeCaixa) {
      logger.warn(`[Finance Integration Server] Auditoria: Nenhum Caixa aberto encontrado ao quitar o pedido`);
      return;
    }
    const cashRegisterId = activeCaixa.id;
    const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');

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
          logger.debug(`[Finance Integration Server] Lançamento já existe (idempotência)`);
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
        logger.debug(`[Finance Integration Server] Lançamento automático de entrada criado com sucesso`);
      });
    }
  } catch (error: any) {
    logger.error(`[Finance Integration Server] Erro técnico ao criar lançamento do pedido:`, { error: error.message });
  }
}

export async function registerServerOrderRefundMovement(
  db: Firestore,
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
      logger.warn(`[Finance Integration Server] Auditoria: Nenhum Caixa aberto encontrado ao estornar o pedido`);
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
          logger.debug(`[Finance Integration Server] Estorno já lançado anteriormente (idempotência)`);
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
        logger.debug(`[Finance Integration Server] Lançamento automático de estorno criado com sucesso`);
      });
    }
  } catch (error: any) {
    logger.error(`[Finance Integration Server] Erro técnico ao criar estorno do pedido:`, { error: error.message });
  }
}

export async function loadRestaurantCounterPaymentMethods(db: Firestore, restaurantId: string, serviceMode: 'COUNTER' | 'PICKUP' | 'DINE_IN') {
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

/**
 * Resolves the active open cash register for a restaurant from canonical source.
 * Canonical Source: `restaurants/{restaurantId}/caixas` where `status == 'OPEN'`.
 * Also validates and repairs stale pointers in `restaurants/{restaurantId}/active_caixa/current`.
 */
export async function resolveActiveCashRegister(
  db: Firestore,
  restaurantId: string,
  transaction?: any
): Promise<{ id: string; [key: string]: any } | null> {
  if (!restaurantId) return null;

  const caixasRef = db.collection('restaurants').doc(restaurantId).collection('caixas');
  const activeCaixaRef = db.collection('restaurants').doc(restaurantId).collection('active_caixa').doc('current');

  const openCaixasQuery = caixasRef.where('status', '==', 'OPEN');
  const openCaixasSnap = transaction ? await transaction.get(openCaixasQuery) : await openCaixasQuery.get();
  const activeSnap = transaction ? await transaction.get(activeCaixaRef) : await activeCaixaRef.get();

  const now = new Date().toISOString();

  // 1. REAL OPEN CAIXA DOCS EXIST IN FIRESTORE
  if (!openCaixasSnap.empty) {
    if (openCaixasSnap.docs.length > 1) {
      logger.error(`[Caixa Resolution] INCONSISTÊNCIA CRÍTICA: Múltiplos caixas ABERTOS encontrados para o restaurante ${restaurantId} (${openCaixasSnap.docs.length} caixas abertos).`);
    }

    const primaryOpenDoc = openCaixasSnap.docs[0];
    const realOpenData = { id: primaryOpenDoc.id, ...primaryOpenDoc.data() };

    // Synchronize/Repair pointer in active_caixa/current if missing or desynced
    const activeData = activeSnap.exists ? activeSnap.data() : null;
    if (!activeData || activeData.status !== 'OPEN' || activeData.cashRegisterId !== primaryOpenDoc.id) {
      logger.warn(`[Caixa Resolution] Sincronizando ponteiro active_caixa/current para o caixa real OPEN ${primaryOpenDoc.id}`);
      const pointerData = {
        cashRegisterId: primaryOpenDoc.id,
        status: 'OPEN',
        openedAt: realOpenData.openedAt || now,
        openedBy: realOpenData.openedBy || 'Operador',
        updatedAt: now
      };
      if (transaction) {
        transaction.set(activeCaixaRef, pointerData, { merge: true });
      } else {
        await activeCaixaRef.set(pointerData, { merge: true });
      }
    }

    return realOpenData;
  }

  // 2. NO REAL OPEN CAIXA DOCS EXIST
  // Repair stale pointer if active_caixa/current erroneously claims status === 'OPEN'
  if (activeSnap.exists && activeSnap.data()?.status === 'OPEN') {
    logger.warn(`[Caixa Resolution] Ponteiro stale em active_caixa/current para o restaurante ${restaurantId}. Reparando para CLOSED.`);
    const pointerRepair = {
      status: 'CLOSED',
      updatedAt: now
    };
    if (transaction) {
      transaction.set(activeCaixaRef, pointerRepair, { merge: true });
    } else {
      await activeCaixaRef.set(pointerRepair, { merge: true });
    }
  }

  return null;
}

export async function requireOpenCashRegister(db: Firestore, restaurantId: string, transaction?: any) {
  if (!restaurantId) {
    const error: any = new Error('ID do restaurante inválido.');
    error.code = 'INVALID_RESTAURANT_ID';
    throw error;
  }

  const openCaixa = await resolveActiveCashRegister(db, restaurantId, transaction);

  if (!openCaixa) {
    const error: any = new Error('O caixa do restaurante precisa estar aberto para realizar esta operação.');
    error.code = 'CASH_REGISTER_NOT_OPEN';
    throw error;
  }

  return openCaixa;
}
