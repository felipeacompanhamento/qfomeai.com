import React, { useState, useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Plus, Trash2, DollarSign, Wallet } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { AssignedOrder } from '../types';

interface PaymentLine {
  id: string;
  methodId: string;
  methodName: string;
  amount: number | string;
}

interface DriverConfirmDeliveryModalProps {
  order: AssignedOrder;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentReport: any) => void;
  isLoading: boolean;
}

const AVAILABLE_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'pix', label: 'Pix' },
  { id: 'cartao_debito', label: 'Cartão de Débito' },
  { id: 'cartao_credito', label: 'Cartão de Crédito' },
  { id: 'vale', label: 'Vale Refeição / Alimentação' },
  { id: 'outro', label: 'Outro' }
];

export const DriverConfirmDeliveryModal: React.FC<DriverConfirmDeliveryModalProps> = ({
  order,
  isOpen,
  onClose,
  onConfirm,
  isLoading
}) => {
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [observation, setObservation] = useState('');
  
  const [customerName, setCustomerName] = useState<string>('Cliente');

  const orderTotal = order ? Number(order.valor_total || order.total || order.totalValue || 0) : 0;
  const isPaidOnline = order ? (order.pago === true || order.paymentStatus === 'PAID' || order.paymentStatus === 'SETTLED') : false;
  const amountAlreadyPaid = isPaidOnline ? orderTotal : 0;
  const amountDue = Math.max(0, orderTotal - amountAlreadyPaid);

  // Initial payment line setup
  const mapInitialMethod = (forma?: string) => {
    if (!forma) return { id: 'dinheiro', label: 'Dinheiro' };
    const f = forma.toLowerCase();
    if (f.includes('pix')) return { id: 'pix', label: 'Pix' };
    if (f.includes('débito') || f.includes('debito')) return { id: 'cartao_debito', label: 'Cartão de Débito' };
    if (f.includes('crédito') || f.includes('credito')) return { id: 'cartao_credito', label: 'Cartão de Crédito' };
    if (f.includes('vale') || f.includes('refeicao') || f.includes('alimentacao')) return { id: 'vale', label: 'Vale Refeição / Alimentação' };
    return { id: 'dinheiro', label: 'Dinheiro' };
  };

  const initialMethod = order ? mapInitialMethod(order.forma_pagamento || order.paymentMethod) : { id: 'dinheiro', label: 'Dinheiro' };

  useEffect(() => {
    if (!isOpen || !order) return;
    const nameFromOrder = order.cliente_nome || order.customerName || order.nome_cliente || order.cliente?.nome || 'Cliente';
    if (nameFromOrder === 'Cliente' && order.cliente_id) {
      const fetchClientName = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', order.cliente_id));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setCustomerName(userData.nome || userData.displayName || 'Cliente');
          }
        } catch (error) {
          console.error("Error fetching client name:", error);
        }
      };
      fetchClientName();
    } else {
      setCustomerName(nameFromOrder);
    }
  }, [isOpen, order?.id, order?.cliente_id, order?.cliente_nome, order?.customerName, order?.nome_cliente, order?.cliente?.nome]);

  useEffect(() => {
    if (!isOpen || !order) return;
    if (amountDue > 0) {
      setPaymentLines([
        {
          id: '1',
          methodId: initialMethod.id,
          methodName: initialMethod.label,
          amount: amountDue.toFixed(2)
        }
      ]);
    } else {
      setPaymentLines([]);
    }
    setObservation('');
  }, [isOpen, order?.id, amountDue]);

  if (!isOpen || !order) return null;

  const handleAddLine = () => {
    const newId = String(Date.now());
    setPaymentLines(prev => [
      ...prev,
      {
        id: newId,
        methodId: 'pix',
        methodName: 'Pix',
        amount: ''
      }
    ]);
  };

  const handleRemoveLine = (id: string) => {
    if (paymentLines.length <= 1) return;
    setPaymentLines(prev => prev.filter(l => l.id !== id));
  };

  const handleMethodChange = (id: string, methodId: string) => {
    const found = AVAILABLE_METHODS.find(m => m.id === methodId);
    setPaymentLines(prev =>
      prev.map(l =>
        l.id === id
          ? { ...l, methodId, methodName: found ? found.label : methodId }
          : l
      )
    );
  };

  const handleAmountChange = (id: string, val: string) => {
    setPaymentLines(prev =>
      prev.map(l => (l.id === id ? { ...l, amount: val } : l))
    );
  };

  const totalReported = paymentLines.reduce(
    (sum, line) => sum + (Number(line.amount) || 0),
    0
  );

  const hasCash = paymentLines.some(l => l.methodId === 'dinheiro');
  const changeAmount =
    hasCash && totalReported > amountDue && amountDue > 0
      ? totalReported - amountDue
      : 0;

  const isUnderpaid = amountDue > 0 && totalReported < amountDue - 0.01;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isUnderpaid && amountDue > 0) return;

    const formattedLines = paymentLines.map(l => ({
      methodId: l.methodId,
      methodName: l.methodName,
      amount: Number(l.amount) || 0
    }));

    const report = {
      expectedAmount: orderTotal,
      amountAlreadyPaid,
      amountDue,
      totalReported,
      changeAmount,
      netAmountReceived: totalReported - changeAmount,
      paymentMethods: formattedLines,
      observation: observation.trim()
    };

    onConfirm(report);
  };

  const shortOrderId = order.id ? `#${order.id.slice(-6).toUpperCase()}` : '';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col w-full sm:max-w-md shadow-2xl animate-in slide-in-from-bottom duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/50 rounded-t-3xl sm:rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-900">Confirmar Entrega</h3>
              <p className="text-xs text-stone-500 font-medium">
                Pedido {shortOrderId} • {customerName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Order Summary Box */}
          <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
            <div className="flex justify-between items-center text-xs text-stone-600">
              <span>Valor Total do Pedido:</span>
              <span className="font-bold text-stone-900">R$ {orderTotal.toFixed(2)}</span>
            </div>

            {amountAlreadyPaid > 0 && (
              <div className="flex justify-between items-center text-xs text-emerald-700">
                <span>Pago Online / Antecipado:</span>
                <span className="font-bold">- R$ {amountAlreadyPaid.toFixed(2)}</span>
              </div>
            )}

            <div className="pt-1.5 border-t border-stone-200 flex justify-between items-center text-sm font-extrabold text-stone-900">
              <span>A Receber do Cliente:</span>
              <span className={amountDue > 0 ? "text-amber-600" : "text-emerald-600"}>
                R$ {amountDue.toFixed(2)}
              </span>
            </div>
          </div>

          {amountDue === 0 ? (
            /* Case: Already Paid Online */
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-start gap-3 text-emerald-900">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-extrabold block">Pedido Pago On-line</span>
                <p className="text-emerald-800">
                  Nenhum valor precisa ser cobrado do cliente. Confirme para notificar o restaurante.
                </p>
              </div>
            </div>
          ) : (
            /* Case: Payment Due on Delivery */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-amber-600" />
                  Valores e Formas de Pagamento Recebidos
                </label>
              </div>

              {/* Payment Methods Lines */}
              <div className="space-y-2.5">
                {paymentLines.map((line, index) => (
                  <div key={line.id} className="p-3 bg-stone-50 border border-stone-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={line.methodId}
                        onChange={(e) => handleMethodChange(line.id, e.target.value)}
                        className="flex-1 bg-white border border-stone-300 rounded-lg text-xs font-semibold p-2.5 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                      >
                        {AVAILABLE_METHODS.map(m => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>

                      <div className="relative w-28">
                        <span className="absolute left-2.5 top-2.5 text-xs font-bold text-stone-400">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.amount}
                          onChange={(e) => handleAmountChange(line.id, e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-white border border-stone-300 rounded-lg text-xs font-extrabold pl-7 pr-2.5 py-2 text-stone-900 text-right focus:outline-none focus:ring-2 focus:ring-stone-900"
                        />
                      </div>

                      {paymentLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddLine}
                  className="w-full py-2.5 border border-dashed border-stone-300 hover:border-stone-400 bg-white hover:bg-stone-50 text-stone-600 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Outra Forma de Pagamento
                </button>
              </div>

              {/* Validation & Calculations */}
              {isUnderpaid && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-rose-800 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    O valor total informado (R$ {totalReported.toFixed(2)}) é menor que o devido (R$ {amountDue.toFixed(2)}).
                  </span>
                </div>
              )}

              {changeAmount > 0 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-900 text-xs font-bold">
                  <span>Troco a devolver ao cliente:</span>
                  <span className="text-sm text-emerald-700 font-black">R$ {changeAmount.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Observation */}
          <div className="space-y-1 pt-1">
            <label className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
              Observação (opcional)
            </label>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Ex: Deixou com o porteiro, pagou via Pix direto..."
              rows={2}
              className="w-full bg-white border border-stone-300 rounded-xl text-xs text-stone-900 p-2.5 focus:outline-none focus:ring-2 focus:ring-stone-900"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isLoading || (amountDue > 0 && isUnderpaid)}
              className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Confirmar Entrega
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
