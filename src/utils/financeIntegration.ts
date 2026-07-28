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

export async function registerClientOrderPaymentMovement(
  restaurantId: string,
  orderId: string,
  orderData: any,
  createdBy: string
) {
  try {
    if (!orderId) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('[Finance Integration] Usuário não autenticado para registrar pagamento no servidor.');
      return;
    }

    const token = await currentUser.getIdToken();

    const response = await fetch('/api/restaurant/financeiro/pedidos/processar-pagamentos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        orderId,
        payments: orderData?.payments,
        pago: orderData?.pago,
        operatorName: createdBy
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.warn('[Finance Integration] Resposta do servidor ao processar pagamento:', errData);
    }
  } catch (error) {
    console.error(`[Finance Integration] Erro técnico ao enviar pagamento do pedido ${orderId}:`, error);
  }
}

export async function registerClientOrderRefundMovement(
  restaurantId: string,
  orderId: string,
  orderData: any,
  createdBy: string,
  targetPaymentId?: string
) {
  try {
    if (!orderId) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('[Finance Integration] Usuário não autenticado para registrar estorno no servidor.');
      return;
    }

    const token = await currentUser.getIdToken();

    let paymentId = targetPaymentId;
    if (!paymentId && Array.isArray(orderData?.payments) && orderData.payments.length > 0) {
      const refunded = orderData.payments.find((p: any) => p.status === 'REFUNDED');
      if (refunded) {
        paymentId = refunded.id;
      }
    }

    const response = await fetch('/api/restaurant/financeiro/pedidos/processar-estorno', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        orderId,
        paymentId,
        operatorName: createdBy
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.warn('[Finance Integration] Resposta do servidor ao processar estorno:', errData);
    }
  } catch (error) {
    console.error(`[Finance Integration] Erro técnico ao enviar estorno do pedido ${orderId}:`, error);
  }
}
