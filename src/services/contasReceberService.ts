import { auth } from '../firebase';
import { ContaReceber, Recebimento } from '../types/financeiro';

export const createContaReceber = async (
  _restaurantId: string,
  data: Omit<ContaReceber, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'paidAmount' | 'remainingAmount' | 'createdBy' | 'restaurantId'>,
  _userId?: string
) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    const error = new Error('Usuário não autenticado.');
    (error as any).code = 'UNAUTHORIZED';
    throw error;
  }

  const response = await fetch('/api/restaurant/financeiro/contas-receber', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      customerName: data.customerName,
      customerId: data.customerId,
      description: data.description,
      totalAmountCents: data.totalAmount,
      dueDate: data.dueDate
    })
  });

  const resData = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(resData.error || `Erro (${response.status}) ao criar conta a receber.`);
    (error as any).code = resData.code || 'HTTP_ERROR';
    throw error;
  }

  return resData;
};

export const registrarRecebimento = async (
  _restaurantId: string,
  contaId: string,
  recebimentoData: Omit<Recebimento, 'id' | 'createdAt' | 'createdBy' | 'accountId'>,
  _userId?: string,
  idempotencyKey?: string
) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    const error = new Error('Usuário não autenticado.');
    (error as any).code = 'UNAUTHORIZED';
    throw error;
  }

  const response = await fetch(`/api/restaurant/financeiro/contas-receber/${contaId}/receber`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      amountCents: recebimentoData.amount,
      paymentMethodId: recebimentoData.paymentMethodId,
      observation: recebimentoData.observation,
      idempotencyKey
    })
  });

  const resData = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(resData.error || `Erro (${response.status}) ao registrar recebimento.`);
    (error as any).code = resData.code || 'HTTP_ERROR';
    throw error;
  }

  return resData;
};
