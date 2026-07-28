import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, X, CheckCircle2, AlertCircle, CreditCard, RotateCcw, Loader2, Coins, ExternalLink } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import CurrencyInput from '../../../components/CurrencyInput';
import { PaymentMethodSelect } from './PaymentMethodSelect';
import { formatCurrency } from '../../../utils/currencyUtils';
import { FormModal } from '../../../components/ui/FormComponents';
import { isCashPaymentMethod, getPaymentMethodLabel, useRestaurantPaymentMethods } from '../../../services/paymentMethodsService';

export interface PaymentItem {
  id: string;
  paymentMethodId: string;
  paymentMethodName: string;
  amount: number; // in CENTS
  status: 'PENDING' | 'PAID' | 'REFUNDED';
}

interface MethodOption {
  id: string;
  name: string;
}

interface PaymentsManagerProps {
  order: any;
  configuredMethods?: any;
  restaurantId?: string;
  restaurantProfile?: any;
  onUpdatePayments: (payments: PaymentItem[], pago: boolean) => Promise<void>;
  onRefundPayment: (payment: PaymentItem) => Promise<void>;
}

export const PaymentsManager: React.FC<PaymentsManagerProps> = ({
  order,
  configuredMethods,
  restaurantId,
  restaurantProfile,
  onUpdatePayments,
  onRefundPayment
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftPayments, setDraftPayments] = useState<PaymentItem[]>([]);
  const [cashReceivedCents, setCashReceivedCents] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Fetch or resolve payment methods safely using hook
  const {
    loading: isLoadingMethods,
    error: methodsError,
    methodsOptions,
    refetch: refetchMethods
  } = useRestaurantPaymentMethods(
    restaurantId || restaurantProfile?.id || order?.restaurantId,
    configuredMethods || restaurantProfile?.formas_pagamento || restaurantProfile?.payment_methods
  );

  // Order totals in CENTS
  const totalOrderCents = Math.round(Number(order?.valor_total || order?.total || order?.valor_produtos || 0) * 100);

  const existingPayments: PaymentItem[] = useMemo(() => {
    if (order?.payments && Array.isArray(order.payments)) {
      return order.payments;
    } else if (order?.forma_pagamento || order?.paymentMethod) {
      const pm = String(order.forma_pagamento || order.paymentMethod).toLowerCase();
      const nameMatch = methodsOptions.find(m => m.id === pm)?.name || pm.toUpperCase();
      return [{
        id: 'legacy',
        paymentMethodId: pm,
        paymentMethodName: nameMatch,
        amount: totalOrderCents,
        status: order.pago ? 'PAID' : 'PENDING'
      }];
    }
    return [];
  }, [order, totalOrderCents, methodsOptions]);

  const totalPaidCents = useMemo(() => {
    return existingPayments
      .filter(p => p.status === 'PAID')
      .reduce((acc, p) => acc + p.amount, 0);
  }, [existingPayments]);

  const remainingCents = Math.max(0, totalOrderCents - totalPaidCents);
  const isFullyPaid = order?.pago || (totalOrderCents > 0 && remainingCents === 0);

  // Open modal
  const handleOpenModal = () => {
    setModalError(null);
    const pendingExisting = existingPayments.filter(p => p.status === 'PENDING');

    if (pendingExisting.length > 0) {
      setDraftPayments(pendingExisting.map(p => ({ ...p })));
    } else {
      // Default to 1 installment with remaining amount
      const initialMethod = methodsOptions[0] || { id: 'dinheiro', name: 'Dinheiro' };
      setDraftPayments([{
        id: uuidv4(),
        paymentMethodId: initialMethod.id,
        paymentMethodName: initialMethod.name,
        amount: remainingCents > 0 ? remainingCents : totalOrderCents,
        status: 'PAID'
      }]);
    }

    setCashReceivedCents(0);
    setIsModalOpen(true);
  };

  // Auto-fill default cash received if a cash parcel is selected
  useEffect(() => {
    const cashParcel = draftPayments.find(p => isCashPaymentMethod(p.paymentMethodId));
    if (cashParcel && cashReceivedCents === 0) {
      setCashReceivedCents(cashParcel.amount);
    }
  }, [draftPayments]);

  // Add new payment line
  const handleAddPaymentLine = () => {
    setModalError(null);
    const currentDraftSum = draftPayments.reduce((acc, p) => acc + p.amount, 0);
    const neededCents = Math.max(0, remainingCents - currentDraftSum);

    const usedMethodIds = draftPayments.map(p => p.paymentMethodId).filter(Boolean);
    const unusedMethod = methodsOptions.find(m => !usedMethodIds.includes(m.id));
    const initialMethod = unusedMethod || methodsOptions[0];

    setDraftPayments(prev => [
      ...prev,
      {
        id: uuidv4(),
        paymentMethodId: initialMethod ? initialMethod.id : '',
        paymentMethodName: initialMethod ? initialMethod.name : '',
        amount: neededCents,
        status: 'PAID'
      }
    ]);
  };

  // Remove payment line
  const handleRemovePaymentLine = (id: string) => {
    setModalError(null);
    setDraftPayments(prev => prev.filter(p => p.id !== id));
  };

  // Change payment line
  const handleChangePaymentLine = (id: string, field: 'paymentMethodId' | 'amount', value: any) => {
    setModalError(null);
    setDraftPayments(prev => prev.map(p => {
      if (p.id === id) {
        if (field === 'paymentMethodId') {
          const matched = methodsOptions.find(m => m.id === value);
          return {
            ...p,
            paymentMethodId: value,
            paymentMethodName: matched ? matched.name : value
          };
        } else if (field === 'amount') {
          return { ...p, amount: Number(value) || 0 };
        }
      }
      return p;
    }));
  };

  // Calculations for Modal
  const draftSumCents = useMemo(() => {
    return draftPayments.reduce((acc, p) => acc + p.amount, 0);
  }, [draftPayments]);

  const newTotalPaidCents = totalPaidCents + draftSumCents;
  const newRemainingCents = Math.max(0, totalOrderCents - newTotalPaidCents);

  const hasCashParcel = draftPayments.some(p => isCashPaymentMethod(p.paymentMethodId));
  const cashParcelsSum = draftPayments
    .filter(p => isCashPaymentMethod(p.paymentMethodId))
    .reduce((acc, p) => acc + p.amount, 0);

  const changeCents = hasCashParcel && cashReceivedCents > cashParcelsSum
    ? cashReceivedCents - cashParcelsSum
    : 0;

  // Validation
  const validationError = useMemo(() => {
    if (draftPayments.length === 0) {
      return 'Adicione pelo menos uma forma de pagamento.';
    }
    if (draftPayments.some(p => p.amount <= 0)) {
      return 'Informe um valor maior que R$ 0,00 para todas as parcelas.';
    }
    if (draftSumCents > remainingCents && remainingCents > 0) {
      return 'Pagamento excede o saldo restante.';
    }
    if (hasCashParcel && cashReceivedCents > 0 && cashReceivedCents < cashParcelsSum) {
      return 'Valor insuficiente para a parcela em dinheiro.';
    }
    return null;
  }, [draftPayments, draftSumCents, remainingCents, hasCashParcel, cashReceivedCents, cashParcelsSum]);

  // Submit payment modal
  const handleConfirmPayment = async () => {
    if (validationError) {
      setModalError(validationError);
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      // Build updated list of payments
      const paidDrafts: PaymentItem[] = draftPayments.map(p => ({
        ...p,
        status: 'PAID'
      }));

      // Combine existing PAID payments with new PAID drafts
      const existingPaid = existingPayments.filter(p => p.status === 'PAID');
      const finalPayments = [...existingPaid, ...paidDrafts];

      const finalTotalPaid = finalPayments.reduce((acc, p) => acc + p.amount, 0);
      const isOrderComplete = finalTotalPaid >= totalOrderCents;

      await onUpdatePayments(finalPayments, isOrderComplete);

      setIsSubmitting(false);
      setIsModalOpen(false);
      setToastMessage('Pagamento concluído!');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error(err);
      setIsSubmitting(false);
      setModalError(err?.message || 'Erro ao registrar pagamento. Tente novamente.');
    }
  };

  const orderFormattedNumber = order?.numero_pedido 
    ? `#${order.numero_pedido}`
    : `#${(order?.id || '').slice(-4).toUpperCase()}`;

  return (
    <div className="bg-stone-50/80 p-4 rounded-2xl border border-stone-200/80 space-y-4">
      {/* Header & Status Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">Resumo Financeiro</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-lg font-black text-stone-800">
              {formatCurrency(totalOrderCents / 100)}
            </span>
            {isFullyPaid ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> Pagamento completo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Pendente: {formatCurrency(remainingCents / 100)}
              </span>
            )}
          </div>
        </div>

        {!['cancelado', 'rejeitado'].includes(order?.status) && (
          <button
            onClick={handleOpenModal}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
          >
            <CreditCard className="w-4 h-4" />
            {remainingCents > 0 ? 'Registrar Pagamento' : 'Alterar Pagamento'}
          </button>
        )}
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-bold animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Breakdown Cards */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="bg-white p-2.5 rounded-xl border border-stone-200/60 shadow-xs">
          <p className="text-[10px] font-bold text-stone-400 uppercase">Total</p>
          <p className="text-xs font-bold text-stone-800 mt-0.5">{formatCurrency(totalOrderCents / 100)}</p>
        </div>
        <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100 shadow-xs">
          <p className="text-[10px] font-bold text-emerald-600 uppercase">Recebido</p>
          <p className="text-xs font-bold text-emerald-700 mt-0.5">{formatCurrency(totalPaidCents / 100)}</p>
        </div>
        <div className={`p-2.5 rounded-xl border shadow-xs ${remainingCents > 0 ? 'bg-amber-50/60 border-amber-100' : 'bg-stone-100 border-stone-200'}`}>
          <p className={`text-[10px] font-bold uppercase ${remainingCents > 0 ? 'text-amber-600' : 'text-stone-500'}`}>Restante</p>
          <p className={`text-xs font-bold mt-0.5 ${remainingCents > 0 ? 'text-amber-700' : 'text-stone-600'}`}>{formatCurrency(remainingCents / 100)}</p>
        </div>
      </div>

      {/* List of existing registered payments */}
      {existingPayments.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Histórico de Parcelas</p>
          {existingPayments.map(payment => (
            <div key={payment.id} className="flex items-center justify-between p-2.5 bg-white border border-stone-200/80 rounded-xl text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-700">{payment.paymentMethodName}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${
                  payment.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                  payment.status === 'REFUNDED' ? 'bg-rose-100 text-rose-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  {payment.status === 'PAID' ? 'Pago' : payment.status === 'REFUNDED' ? 'Estornado' : 'Pendente'}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-800">{formatCurrency(payment.amount / 100)}</span>
                {payment.status === 'PAID' && onRefundPayment && (
                  <button
                    onClick={() => onRefundPayment(payment)}
                    className="p-1 text-stone-400 hover:text-amber-600 rounded hover:bg-amber-50 transition-colors"
                    title="Estornar parcela"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RE-DESIGNED PAYMENT MODAL */}
      <FormModal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title="Registrar Pagamento"
        subtitle={`Pedido ${orderFormattedNumber}`}
        icon={CreditCard}
        iconBgColor="bg-emerald-50"
        iconTextColor="text-emerald-600"
        footer={
          <div className="p-4 sm:p-5 border-t border-stone-100 bg-stone-50/50 flex items-center justify-end gap-3 w-full">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
              className="px-4 py-2.5 text-stone-600 hover:text-stone-800 text-xs font-bold rounded-xl hover:bg-stone-200/60 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirmPayment}
              disabled={isSubmitting || !!validationError}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processando...</span>
                </>
              ) : (
                <span>Confirmar Pagamento</span>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-5 text-left">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
            <div className="bg-stone-50 p-3 rounded-xl border border-stone-200/80">
              <p className="text-[10px] font-bold text-stone-400 uppercase">Valor Total</p>
              <p className="text-sm sm:text-base font-extrabold text-stone-800 mt-0.5">
                {formatCurrency(totalOrderCents / 100)}
              </p>
            </div>

            <div className="bg-emerald-50/80 p-3 rounded-xl border border-emerald-100">
              <p className="text-[10px] font-bold text-emerald-600 uppercase">Já recebido</p>
              <p className="text-sm sm:text-base font-extrabold text-emerald-700 mt-0.5">
                {formatCurrency(totalPaidCents / 100)}
              </p>
            </div>

            <div className={`p-3 rounded-xl border ${
              newRemainingCents === 0 
                ? 'bg-emerald-100/70 border-emerald-200' 
                : 'bg-amber-50/80 border-amber-200'
            }`}>
              <p className={`text-[10px] font-bold uppercase ${
                newRemainingCents === 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                Saldo restante
              </p>
              {newRemainingCents === 0 ? (
                <p className="text-xs sm:text-sm font-extrabold text-emerald-800 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  Pagamento completo
                </p>
              ) : (
                <p className="text-sm sm:text-base font-extrabold text-amber-800 mt-0.5">
                  {formatCurrency(newRemainingCents / 100)}
                </p>
              )}
            </div>
          </div>

          {/* Formas de Pagamento Section */}
          <div className="space-y-3 pt-1">
            {isLoadingMethods ? (
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-stone-500">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Carregando formas de pagamento...</span>
              </div>
            ) : methodsError ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-center">
                <p className="text-xs font-bold text-rose-800">{methodsError}</p>
                <button
                  type="button"
                  onClick={refetchMethods}
                  className="inline-flex items-center gap-1 text-xs font-bold text-rose-900 underline hover:text-rose-700 cursor-pointer"
                >
                  <span>Tentar novamente</span>
                </button>
              </div>
            ) : methodsOptions.length === 0 ? (
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
              <>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                    Formas de pagamento
                  </label>
                  <button
                    type="button"
                    onClick={handleAddPaymentLine}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar pagamento
                  </button>
                </div>

                {/* List of Payment Lines */}
                <div className="space-y-2">
                  {draftPayments.map((payment, idx) => (
                <div
                  key={payment.id}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                >
                  {/* Select Method Dropdown */}
                  <div className="flex-1">
                    <PaymentMethodSelect
                      paymentId={payment.id}
                      value={payment.paymentMethodId}
                      options={methodsOptions}
                      onChange={(newMethodId) => handleChangePaymentLine(payment.id, 'paymentMethodId', newMethodId)}
                      disabled={isSubmitting}
                      className="w-full h-10 px-3 bg-white border border-stone-200 rounded-lg text-xs sm:text-sm font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:bg-stone-100 cursor-pointer"
                    />
                  </div>

                  {/* Currency Input */}
                  <div className="w-full sm:w-36">
                    <CurrencyInput
                      valueCents={payment.amount}
                      onChangeCents={(cents) => handleChangePaymentLine(payment.id, 'amount', cents)}
                      disabled={isSubmitting}
                      className="space-y-0"
                    />
                  </div>

                  {/* Delete Line */}
                  {draftPayments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePaymentLine(payment.id)}
                      disabled={isSubmitting}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                      title="Remover parcela"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagamento em dinheiro Section (ONLY shown if cash parcel exists) */}
      {hasCashParcel && (
        <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-3 animate-fade-in">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
            <Coins className="w-4 h-4 text-amber-600" />
            <span>Pagamento em Dinheiro</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <CurrencyInput
              label="Valor recebido do cliente"
              valueCents={cashReceivedCents}
              onChangeCents={setCashReceivedCents}
              disabled={isSubmitting}
            />

            <div className="bg-white p-2.5 rounded-xl border border-amber-200 flex flex-col justify-center h-[42px]">
              <span className="text-[10px] font-bold text-stone-400 uppercase">Troco a devolver</span>
              <span className="text-sm sm:text-base font-extrabold text-emerald-700">
                {formatCurrency(changeCents / 100)}
              </span>
            </div>
          </div>

          {cashReceivedCents > 0 && cashReceivedCents < cashParcelsSum && (
            <p className="text-xs text-rose-600 font-bold flex items-center gap-1 mt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Valor insuficiente para a parcela em dinheiro ({formatCurrency(cashParcelsSum / 100)}).
            </p>
          )}
        </div>
      )}

          {/* Error or Warning Banner */}
          {(modalError || validationError) && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-800 text-xs font-bold animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{modalError || validationError}</span>
            </div>
          )}
        </div>
      </FormModal>
    </div>
  );
};

export default PaymentsManager;
