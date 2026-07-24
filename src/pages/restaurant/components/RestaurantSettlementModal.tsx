import React, { useState, useEffect } from 'react';
import { X, CheckCircle, DollarSign, Wallet, AlertCircle, Plus, Trash2, FileText, User, Clock, Bike } from 'lucide-react';
import { auth } from '../../../firebase';

interface PaymentLine {
  id: string;
  methodId: string;
  methodName: string;
  amount: number | string;
}

interface RestaurantSettlementModalProps {
  order: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AVAILABLE_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'pix', label: 'Pix' },
  { id: 'cartao_debito', label: 'Cartão de Débito' },
  { id: 'cartao_credito', label: 'Cartão de Crédito' },
  { id: 'vale', label: 'Vale Refeição / Alimentação' },
  { id: 'outro', label: 'Outro' }
];

export const RestaurantSettlementModal: React.FC<RestaurantSettlementModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([]);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderTotal = order ? Number(order.valor_total || order.total || 0) : 0;
  const driverReport = order?.driverPaymentReport || null;

  const amountAlreadyPaid = driverReport?.amountAlreadyPaid ?? (order?.pago && order?.status === 'finalizado' ? orderTotal : 0);
  const amountDue = Math.max(0, orderTotal - amountAlreadyPaid);

  useEffect(() => {
    if (!isOpen || !order) return;
    if (driverReport?.paymentMethods?.length > 0) {
      setPaymentLines(
        driverReport.paymentMethods.map((pm: any, idx: number) => ({
          id: String(idx + 1),
          methodId: pm.methodId || 'dinheiro',
          methodName: pm.methodName || 'Dinheiro',
          amount: Number(pm.amount || 0).toFixed(2)
        }))
      );
    } else {
      setPaymentLines([
        {
          id: '1',
          methodId: 'dinheiro',
          methodName: 'Dinheiro',
          amount: amountDue.toFixed(2)
        }
      ]);
    }

    setNotes(driverReport?.observation || '');
    setInternalNotes('');
    setError(null);
  }, [isOpen, order?.id, driverReport, amountDue]);

  if (!isOpen || !order) return null;

  const handleAddLine = () => {
    setPaymentLines(prev => [
      ...prev,
      {
        id: String(Date.now()),
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
      prev.map(l => (l.id === id ? { ...l, methodId, methodName: found ? found.label : methodId } : l))
    );
  };

  const handleAmountChange = (id: string, val: string) => {
    setPaymentLines(prev => prev.map(l => (l.id === id ? { ...l, amount: val } : l)));
  };

  const confirmedTotal = paymentLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const changeAmount = amountDue > 0 && confirmedTotal > amountDue ? confirmedTotal - amountDue : 0;
  const netReceived = confirmedTotal - changeAmount;

  const handleConfirmSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Sessão expirada. Faça login novamente.');

      const token = await user.getIdToken();
      const formattedLines = paymentLines.map(l => ({
        methodId: l.methodId,
        methodName: l.methodName,
        amount: Number(l.amount) || 0
      }));

      const response = await fetch(`/api/restaurant/orders/${order.id}/settle-driver-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          receivedAmount: confirmedTotal,
          paymentMethods: formattedLines,
          notes,
          internalNotes
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao realizar baixa financeira.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao processar baixa.');
    } finally {
      setLoading(false);
    }
  };

  const orderNumber = (order.id || '').slice(-6).toUpperCase();
  const driverName = driverReport?.reportedByDriverName || order.driverName || order.entregador_nome || 'Entregador';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-h-[92vh] flex flex-col w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in duration-150">
        
        {/* Header */}
        <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-900">
                Conferência Financeira do Pedido
              </h3>
              <p className="text-xs text-stone-500 font-medium">
                #{orderNumber} • Entregador: {driverName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <form onSubmit={handleConfirmSettlement} className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Order Values Summary */}
          <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5">
            <div className="flex justify-between items-center text-stone-600">
              <span>Valor Total do Pedido:</span>
              <span className="font-extrabold text-stone-900">R$ {orderTotal.toFixed(2)}</span>
            </div>
            {amountAlreadyPaid > 0 && (
              <div className="flex justify-between items-center text-emerald-700">
                <span>Pago Online / Antecipado:</span>
                <span className="font-extrabold">- R$ {amountAlreadyPaid.toFixed(2)}</span>
              </div>
            )}
            <div className="pt-1.5 border-t border-stone-200 flex justify-between items-center font-black text-sm text-stone-900">
              <span>Saldo Pendente a Conferir:</span>
              <span className={amountDue > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                R$ {amountDue.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Driver Reported Info */}
          {driverReport ? (
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2 text-amber-900">
              <div className="flex items-center justify-between font-bold text-[11px] uppercase tracking-wider text-amber-800">
                <span className="flex items-center gap-1">
                  <Bike className="w-3.5 h-3.5 text-amber-600" />
                  Valores Informados pelo Entregador
                </span>
                {driverReport.reportedAt && (
                  <span className="text-[10px] font-normal text-amber-700 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(driverReport.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              <div className="space-y-1 pt-1 border-t border-amber-200/60 text-xs">
                {driverReport.paymentMethods?.map((pm: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-amber-800">{pm.methodName || 'Dinheiro'}:</span>
                    <span className="font-extrabold text-amber-950">R$ {Number(pm.amount || 0).toFixed(2)}</span>
                  </div>
                ))}

                {driverReport.changeAmount > 0 && (
                  <div className="flex justify-between items-center text-emerald-800 font-bold">
                    <span>Troco devolvido pelo entregador:</span>
                    <span>R$ {Number(driverReport.changeAmount).toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center font-black pt-1 border-t border-amber-200/60 text-stone-900">
                  <span>Valor Líquido Informado:</span>
                  <span>R$ {Number(driverReport.netAmountReceived || driverReport.totalReported || 0).toFixed(2)}</span>
                </div>

                {driverReport.observation && (
                  <p className="text-[11px] text-amber-900 italic pt-1">
                    " {driverReport.observation} "
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-600 text-xs">
              Sem dados detalhados do entregador. Informe os valores recebidos abaixo:
            </div>
          )}

          {/* Restaurant Confirmation Editable Section */}
          <div className="space-y-2 pt-1">
            <label className="font-extrabold text-stone-800 uppercase tracking-wider block">
              Conferência dos Valores Recebidos pelo Restaurante
            </label>

            <div className="space-y-2">
              {paymentLines.map((line) => (
                <div key={line.id} className="flex items-center gap-2 p-2 bg-stone-50 border border-stone-200 rounded-xl">
                  <select
                    value={line.methodId}
                    onChange={(e) => handleMethodChange(line.id, e.target.value)}
                    className="flex-1 bg-white border border-stone-300 rounded-lg text-xs font-semibold p-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900"
                  >
                    {AVAILABLE_METHODS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>

                  <div className="relative w-28">
                    <span className="absolute left-2.5 top-2 text-xs font-bold text-stone-400">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.amount}
                      onChange={(e) => handleAmountChange(line.id, e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white border border-stone-300 rounded-lg text-xs font-extrabold pl-7 pr-2.5 py-1.5 text-stone-900 text-right focus:outline-none focus:ring-2 focus:ring-stone-900"
                    />
                  </div>

                  {paymentLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(line.id)}
                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddLine}
                className="w-full py-2 border border-dashed border-stone-300 hover:border-stone-400 bg-white text-stone-600 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Outra Forma de Pagamento
              </button>
            </div>
          </div>

          {/* Internal Notes */}
          <div className="space-y-1">
            <label className="font-bold text-stone-700 uppercase tracking-wider block">
              Observação Financeira Interna (opcional)
            </label>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Ex: Conferido no caixa por João, divergência de R$ 2,00 tratada..."
              rows={2}
              className="w-full bg-white border border-stone-300 rounded-xl text-xs text-stone-900 p-2.5 focus:outline-none focus:ring-2 focus:ring-stone-900"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Confirmar Recebimento e Finalizar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
