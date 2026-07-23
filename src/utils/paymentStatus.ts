import { FinancialDeliveryStatus } from '../types/delivery';

export interface PaymentStatusInfo {
  label: string;
  badgeClass: string;
  description: string;
}

export function getPaymentStatusInfo(
  status?: FinancialDeliveryStatus | string,
  pago?: boolean
): PaymentStatusInfo {
  switch (status) {
    case 'SETTLED':
      return {
        label: 'Baixado (Concluído)',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        description: 'Pagamento confirmado e baixado pelo restaurante.'
      };
    case 'PAID':
      return {
        label: 'Pago Online',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        description: 'Pago via gateway online.'
      };
    case 'AWAITING_DRIVER_SETTLEMENT':
    case 'COLLECTED_BY_DRIVER':
      return {
        label: 'Aguardando Baixa',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse',
        description: 'Recebido pelo entregador. Aguardando repasse ao restaurante.'
      };
    case 'PAYMENT_NOT_COLLECTED':
      return {
        label: 'Não Recebido',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        description: 'Entregador informou que o valor não foi pago.'
      };
    case 'REFUNDED':
      return {
        label: 'Estornado',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
        description: 'Pagamento estornado.'
      };
    case 'PENDING':
    default:
      if (pago) {
        return {
          label: 'Pago',
          badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          description: 'Pagamento confirmado.'
        };
      }
      return {
        label: 'Cobrança na Entrega',
        badgeClass: 'bg-stone-100 text-stone-700 border-stone-300',
        description: 'Aguardando pagamento no momento da entrega.'
      };
  }
}

/**
 * Checks if the payment method requires physical collection upon delivery
 */
export function isPaymentOnDelivery(formaPagamento?: string | null, pago?: boolean): boolean {
  if (pago === true) return false;
  if (!formaPagamento) return false;

  const lower = formaPagamento.toLowerCase();

  // If explicitly online or approved
  if (lower.includes('online') || lower.includes('mercado') || lower.includes('mp') || lower.includes('site') || lower.includes('app')) {
    return false;
  }

  if (
    lower.includes('dinheiro') ||
    lower.includes('cartao') ||
    lower.includes('cartão') ||
    lower.includes('maquininha') ||
    lower.includes('entrega') ||
    lower.includes('pix_entrega') ||
    lower.includes('pix na entrega') ||
    lower.includes('presencial') ||
    lower.includes('debito') ||
    lower.includes('débito') ||
    lower.includes('credito') ||
    lower.includes('crédito')
  ) {
    return true;
  }

  return false;
}
