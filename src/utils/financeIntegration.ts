import { auth } from '../firebase';

// Helper to normalize payment method id
export function normalizePaymentMethodId(value: any): 'dinheiro' | 'pix' | 'credito' | 'debito' | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase();
  if (clean === 'dinheiro' || clean === 'cash') return 'dinheiro';
  if (clean === 'pix') return 'pix';
  if (clean === 'credito' || clean === 'credit' || clean === 'cartao_credito' || clean === 'cartão_credito' || clean === 'cartao de credito') return 'credito';
  if (clean === 'debito' || clean === 'debit' || clean === 'cartao_debito' || clean === 'cartão_debito' || clean === 'cartao de debito') return 'debito';
  return null;
}

export function ensureCents(val: number): number {
  if (typeof val !== 'number' || isNaN(val) || val <= 0) return 0;
  if (Number.isInteger(val)) return val;
  return Math.round(val * 100);
}

export interface ProcessPaymentParams {
  restaurantId: string;
  orderId: string;
  payments: Array<{
    id?: string;
    paymentMethodId: string;
    amount: number;
    status?: string;
  }>;
  operatorName?: string;
  clientActionId?: string;
}

export interface ProcessRefundParams {
  restaurantId: string;
  orderId: string;
  paymentId?: string;
  reason: string;
  operatorName?: string;
  clientActionId?: string;
}

/**
 * Processa pagamentos do pedido via endpoint do servidor.
 * Nenhuma gravação direta no Firestore é realizada pelo frontend.
 */
export async function processOrderPaymentsApi(params: ProcessPaymentParams): Promise<{ ok: boolean; order?: any; cashRegisterId?: string; error?: string }> {
  try {
    if (!params.orderId) {
      return { ok: false, error: 'ID do pedido não informado.' };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { ok: false, error: 'Usuário não autenticado.' };
    }

    const token = await currentUser.getIdToken();
    const clientActionId = params.clientActionId || `act_pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const formattedPayments = (params.payments || []).map((p, idx) => ({
      id: p.id || `p_${Date.now()}_${idx}`,
      paymentMethodId: normalizePaymentMethodId(p.paymentMethodId) || p.paymentMethodId || 'dinheiro',
      amount: ensureCents(p.amount),
      status: p.status || 'PAID'
    }));

    const response = await fetch('/api/restaurant/financeiro/pedidos/processar-pagamentos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        orderId: params.orderId,
        payments: formattedPayments,
        operatorName: params.operatorName || 'Operador',
        clientActionId
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: data.error || data.message || 'Erro ao processar pagamento no servidor.'
      };
    }

    return { ok: true, order: data.order, cashRegisterId: data.cashRegisterId };
  } catch (error: any) {
    console.error('[Finance Integration] Erro ao chamar endpoint de pagamento:', error);
    return {
      ok: false,
      error: error?.message || 'Erro de conexão ao processar pagamento.'
    };
  }
}

/**
 * Processa estornos do pedido via endpoint do servidor.
 * Exige orderId, paymentId, reason e clientActionId.
 * Nenhuma gravação direta no Firestore é realizada pelo frontend.
 */
export async function processOrderRefundApi(params: ProcessRefundParams): Promise<{ ok: boolean; order?: any; cashRegisterId?: string; error?: string }> {
  try {
    if (!params.orderId) {
      return { ok: false, error: 'ID do pedido não informado.' };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { ok: false, error: 'Usuário não autenticado.' };
    }

    const token = await currentUser.getIdToken();
    const clientActionId = params.clientActionId || `act_ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const response = await fetch('/api/restaurant/financeiro/pedidos/processar-estorno', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        orderId: params.orderId,
        paymentId: params.paymentId || 'legacy',
        reason: params.reason,
        operatorName: params.operatorName || 'Operador',
        clientActionId
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: data.error || data.message || 'Erro ao processar estorno no servidor.'
      };
    }

    return { ok: true, order: data.order, cashRegisterId: data.cashRegisterId };
  } catch (error: any) {
    console.error('[Finance Integration] Erro ao chamar endpoint de estorno:', error);
    return {
      ok: false,
      error: error?.message || 'Erro de conexão ao processar estorno.'
    };
  }
}

export async function registerClientOrderPaymentMovement(
  restaurantId: string,
  orderId: string,
  orderData: any,
  createdBy: string
) {
  let pmId = normalizePaymentMethodId(orderData?.forma_pagamento || 'dinheiro') || 'dinheiro';
  let totalCents = 0;
  if (typeof orderData?.valor_total === 'number') {
    totalCents = Math.round(orderData.valor_total * 100);
  } else if (typeof orderData?.total === 'number') {
    totalCents = Math.round(orderData.total * 100);
  }

  const payments = Array.isArray(orderData?.payments) && orderData.payments.length > 0
    ? orderData.payments.map((p: any, idx: number) => ({
        id: p.id || `p_${Date.now()}_${idx}`,
        paymentMethodId: normalizePaymentMethodId(p.paymentMethodId) || pmId,
        amount: ensureCents(p.amount || totalCents),
        status: p.status || 'PAID'
      }))
    : [{
        id: `p_${Date.now()}_0`,
        paymentMethodId: pmId,
        amount: totalCents,
        status: 'PAID'
      }];

  return await processOrderPaymentsApi({
    restaurantId,
    orderId,
    payments,
    operatorName: createdBy,
    clientActionId: `act_pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  });
}

export async function registerClientOrderRefundMovement(
  restaurantId: string,
  orderId: string,
  orderData: any,
  createdBy: string,
  targetPaymentId?: string,
  reason?: string
) {
  let paymentId = targetPaymentId;
  if (!paymentId && Array.isArray(orderData?.payments) && orderData.payments.length > 0) {
    const paid = orderData.payments.find((p: any) => p.status === 'PAID');
    if (paid) {
      paymentId = paid.id;
    }
  }

  return await processOrderRefundApi({
    restaurantId,
    orderId,
    paymentId: paymentId || 'legacy',
    reason: reason || 'Estorno solicitado pelo operador',
    operatorName: createdBy,
    clientActionId: `act_ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  });
}
