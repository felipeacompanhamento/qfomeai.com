export type ContaReceberStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface ContaReceber {
  id: string;
  restaurantId: string;
  customerId?: string;
  customerName: string;
  description: string;
  totalAmount: number; // in cents
  paidAmount: number; // in cents
  remainingAmount: number; // in cents
  dueDate: string;
  status: ContaReceberStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Recebimento {
  id: string;
  accountId: string;
  amount: number; // in cents
  paymentMethodId: string;
  observation?: string;
  createdAt: string;
  createdBy: string;
}

export type ContaPagarStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface ContaPagar {
  id: string;
  restaurantId: string;
  supplierId?: string;
  supplierName: string;
  description: string;
  category: string;
  totalAmount: number; // in cents
  paidAmount: number; // in cents
  remainingAmount: number; // in cents
  dueDate: string;
  status: ContaPagarStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Pagamento {
  id: string;
  accountId: string;
  amount: number; // in cents
  paymentMethodId: string;
  observation?: string;
  createdAt: string;
  createdBy: string;
}
