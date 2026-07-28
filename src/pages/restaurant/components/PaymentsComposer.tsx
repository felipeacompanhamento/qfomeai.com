import React from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash, ExternalLink } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { PaymentItem } from './PaymentsManager';
import { PaymentMethodSelect } from './PaymentMethodSelect';
import CurrencyInput from '../../../components/CurrencyInput';
import { formatCurrency as formatBRL } from '../../../utils/currencyUtils';
import { getAvailablePaymentMethods, PaymentChannel } from '../../../services/paymentMethodsService';

export function getAvailablePaymentMethodsForChannel(
  configuredMethods: any,
  serviceMode: 'COUNTER' | 'PICKUP' | 'DINE_IN' = 'COUNTER'
) {
  const channelMap: Record<string, PaymentChannel> = {
    COUNTER: 'BALCAO',
    PICKUP: 'RETIRADA',
    DINE_IN: 'CONSUMO_LOCAL'
  };
  const channel = channelMap[serviceMode] || 'BALCAO';
  const available = getAvailablePaymentMethods(configuredMethods, channel);

  return available.map(m => ({
    id: m.id,
    name: m.name
  }));
}

interface PaymentsComposerProps {
  totalOrderCents: number;
  payments: PaymentItem[];
  setPayments: (payments: PaymentItem[]) => void;
  configuredMethods: any;
  serviceMode?: 'COUNTER' | 'PICKUP' | 'DINE_IN';
  isPaid: boolean;
  setIsPaid: (val: boolean) => void;
}

export const PaymentsComposer: React.FC<PaymentsComposerProps> = ({
  totalOrderCents,
  payments,
  setPayments,
  configuredMethods,
  serviceMode = 'COUNTER',
  isPaid,
  setIsPaid
}) => {
  const methodsOptions = getAvailablePaymentMethodsForChannel(configuredMethods, serviceMode);

  const totalPaymentsCents = payments.reduce((acc, p) => acc + p.amount, 0);
  const remainingCents = totalOrderCents - totalPaymentsCents;

  const handleAddPayment = () => {
    if (methodsOptions.length === 0) {
      return;
    }

    // Suggest an unused payment method if possible, otherwise default to the first available method to allow repetition
    const usedMethodIds = payments.map(p => p.paymentMethodId).filter(Boolean);
    const unusedMethod = methodsOptions.find(m => !usedMethodIds.includes(m.id));
    const selectedMethod = unusedMethod || methodsOptions[0];

    setPayments([
      ...payments,
      {
        id: uuidv4(),
        paymentMethodId: selectedMethod.id,
        paymentMethodName: selectedMethod.name,
        amount: remainingCents > 0 ? remainingCents : 0,
        status: isPaid ? 'PAID' : 'PENDING'
      }
    ]);
  };

  const handleRemovePayment = (id: string) => {
    setPayments(payments.filter(p => p.id !== id));
  };

  const handleChangePayment = (id: string, field: keyof PaymentItem, value: any) => {
    setPayments(payments.map(p => {
      if (p.id === id) {
        const updated = { ...p, [field]: value };
        if (field === 'paymentMethodId') {
          updated.paymentMethodName = methodsOptions.find(m => m.id === value)?.name || value;
        }
        return updated;
      }
      return p;
    }));
  };

  React.useEffect(() => {
    setPayments(payments.map(p => {
      const newStatus = isPaid ? 'PAID' : 'PENDING';
      if (p.status !== newStatus) {
        return { ...p, status: newStatus };
      }
      return p;
    }));
  }, [isPaid]);

  return (
    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200">
      <div className="flex justify-between items-center mb-3">
        <label className="text-xs font-bold text-stone-600 block">Formas de Pagamento</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPaid(true)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
              isPaid ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
            }`}
          >
            Pago Agora
          </button>
          <button
            type="button"
            onClick={() => setIsPaid(false)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
              !isPaid ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
            }`}
          >
            Pagar na Entrega
          </button>
        </div>
      </div>

      {methodsOptions.length === 0 ? (
        <div className="p-3 bg-amber-50 text-amber-800 text-xs rounded-lg border border-amber-200 font-medium space-y-2">
          <p>Nenhuma forma de pagamento está disponível. Configure as formas de pagamento nas configurações do restaurante.</p>
          <Link
            to="/restaurant/settings/payments"
            className="inline-flex items-center gap-1 font-bold text-amber-900 underline hover:text-amber-700"
          >
            <span>Ir para Configurações de Pagamento</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {payments.map(payment => {
            const isEmptySelection = payment.paymentMethodId === '';

            return (
              <div key={payment.id} className="space-y-1">
                <div className="flex items-center gap-2 bg-white p-2 border border-stone-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <PaymentMethodSelect
                      paymentId={payment.id}
                      value={payment.paymentMethodId}
                      options={methodsOptions}
                      onChange={(newMethodId) => handleChangePayment(payment.id, 'paymentMethodId', newMethodId)}
                      className="w-full p-1.5 text-xs border border-stone-200 rounded focus:ring-1 focus:ring-emerald-500 bg-white cursor-pointer font-medium"
                    />
                  </div>
                  
                  <div className="w-28 shrink-0">
                    <CurrencyInput
                      valueCents={payment.amount}
                      onChangeCents={(cents) => handleChangePayment(payment.id, 'amount', cents)}
                      inputClassName="w-full p-1.5 text-xs border border-stone-200 rounded text-right font-bold focus:ring-1 focus:ring-emerald-500 bg-white"
                      className="space-y-0"
                    />
                  </div>

                  {payments.length > 1 && (
                    <button 
                      type="button"
                      onClick={() => handleRemovePayment(payment.id)} 
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                      title="Remover parcela"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {isEmptySelection && (
                  <p className="text-[10px] text-red-500 font-bold px-1">
                    Selecione uma forma de pagamento diferente para esta parcela.
                  </p>
                )}
              </div>
            );
          })}

          {payments.some(p => p.paymentMethodId === '') && (
            <div className="p-2 bg-amber-50 text-amber-800 text-[10px] rounded-lg border border-amber-200 font-semibold mt-1">
              Todas as formas disponíveis já foram usadas. Adicione formas habilitadas ou remova parcelas excedentes.
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between items-center mt-3 pt-3 border-t border-stone-200">
        <button
          type="button"
          onClick={handleAddPayment}
          disabled={methodsOptions.length === 0}
          className="flex items-center gap-1 text-[11px] font-bold text-stone-600 hover:text-stone-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar Parcela
        </button>
        
        <div className="text-right text-[11px] font-bold">
          {remainingCents === 0 ? (
            <span className="text-emerald-600">Total coberto</span>
          ) : remainingCents > 0 ? (
            <span className="text-amber-600">Falta {formatBRL(remainingCents, true)}</span>
          ) : (
            <span className="text-red-600">Excesso de {formatBRL(Math.abs(remainingCents), true)}</span>
          )}
        </div>
      </div>
    </div>
  );
};

