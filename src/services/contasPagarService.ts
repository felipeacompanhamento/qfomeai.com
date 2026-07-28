import { auth } from '../firebase';
import { ContaPagar, Pagamento } from '../types/financeiro';

export const createContaPagar = async (
  _restaurantId: string,
  data: Omit<ContaPagar, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'paidAmount' | 'remainingAmount' | 'createdBy' | 'restaurantId'>,
  _userId?: string
) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    const error = new Error('Usuário não autenticado.');
    (error as any).code = 'UNAUTHORIZED';
    throw error;
  }

  const response = await fetch('/api/restaurant/financeiro/contas-pagar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      supplierName: data.supplierName,
      supplierId: data.supplierId,
      description: data.description,
      category: data.category,
      totalAmountCents: data.totalAmount,
      dueDate: data.dueDate
    })
  });

  const resData = await response.json();
  if (!response.ok) {
    const error = new Error(resData.error || 'Erro ao criar conta a pagar.');
    (error as any).code = resData.code || 'HTTP_ERROR';
    throw error;
  }

  return resData;
};

export const registrarPagamento = async (
  _restaurantId: string,
  contaId: string,
  pagamentoData: Omit<Pagamento, 'id' | 'createdAt' | 'createdBy' | 'accountId'>,
  _userId?: string,
  idempotencyKey?: string
) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    const error = new Error('Usuário não autenticado.');
    (error as any).code = 'UNAUTHORIZED';
    throw error;
  }

  const response = await fetch(`/api/restaurant/financeiro/contas-pagar/${contaId}/pagar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      amountCents: pagamentoData.amount,
      paymentMethodId: pagamentoData.paymentMethodId,
      observation: pagamentoData.observation,
      idempotencyKey
    })
  });

  const resData = await response.json();
  if (!response.ok) {
    const error = new Error(resData.error || 'Erro ao registrar pagamento.');
    (error as any).code = resData.code || 'HTTP_ERROR';
    throw error;
  }

  return resData;
};
