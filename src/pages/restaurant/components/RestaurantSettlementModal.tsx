import React, { useState, useEffect } from 'react';
import { Wallet, AlertCircle, Plus, Trash2, Bike, Clock, CheckCircle } from 'lucide-react';
import { auth } from '../../../firebase';
import { 
  FormModal, 
  FormField, 
  TextInput, 
  SelectInput, 
  TextareaInput, 
  PrimaryButton, 
  SecondaryButton 
} from '../../../components/ui/FormComponents';

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
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title="Conferência Financeira do Pedido"
      subtitle={`#${orderNumber} • Entregador: ${driverName}`}
      icon={Wallet}
      iconBgColor="bg-amber-50"
      iconTextColor="text-amber-600"
      error={error}
      loading={loading}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={loading} className="flex-1">
            Cancelar
          </SecondaryButton>
          <PrimaryButton 
            onClick={handleConfirmSettlement} 
            disabled={loading} 
            loading={loading}
            className="flex-[2]"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Confirmar Recebimento e Finalizar
          </PrimaryButton>
        </>
      }
    >
      <form onSubmit={handleConfirmSettlement} className="space-y-4 text-left">
        {/* Order Values Summary */}
        <div className="p-4 bg-stone-50 border border-stone-200/80 rounded-2xl space-y-2 text-xs">
          <div className="flex justify-between items-center text-stone-500 font-medium">
            <span>Valor Total do Pedido:</span>
            <span className="font-bold text-stone-800">R$ {orderTotal.toFixed(2)}</span>
          </div>
          {amountAlreadyPaid > 0 && (
            <div className="flex justify-between items-center text-emerald-600 font-medium">
              <span>Pago Online / Antecipado:</span>
              <span className="font-bold">- R$ {amountAlreadyPaid.toFixed(2)}</span>
            </div>
          )}
          <div className="pt-2 border-t border-stone-200/60 flex justify-between items-center text-sm font-extrabold text-stone-800">
            <span>Saldo Pendente a Conferir:</span>
            <span className={amountDue > 0 ? 'text-amber-600' : 'text-emerald-600'}>
              R$ {amountDue.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Driver Reported Info */}
        {driverReport ? (
          <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-2.5 text-xs text-amber-900">
            <div className="flex items-center justify-between font-bold uppercase tracking-wider text-amber-800 text-[10px]">
              <span className="flex items-center gap-1.5">
                <Bike className="w-4 h-4 text-amber-600" />
                Valores Informados pelo Entregador
              </span>
              {driverReport.reportedAt && (
                <span className="font-normal text-amber-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(driverReport.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-amber-200/50">
              {driverReport.paymentMethods?.map((pm: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center text-amber-800">
                  <span>{pm.methodName || 'Dinheiro'}:</span>
                  <span className="font-bold text-amber-950">R$ {Number(pm.amount || 0).toFixed(2)}</span>
                </div>
              ))}

              {driverReport.changeAmount > 0 && (
                <div className="flex justify-between items-center text-emerald-800 font-bold">
                  <span>Troco devolvido pelo entregador:</span>
                  <span>R$ {Number(driverReport.changeAmount).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-stone-900 font-extrabold pt-2 border-t border-amber-200/40 text-sm">
                <span>Valor Líquido Informado:</span>
                <span>R$ {Number(driverReport.netAmountReceived || driverReport.totalReported || 0).toFixed(2)}</span>
              </div>

              {driverReport.observation && (
                <p className="text-[11px] text-amber-900/80 italic pt-1">
                  " {driverReport.observation} "
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-stone-50 border border-stone-200/60 rounded-xl text-stone-500 text-xs text-center font-medium">
            Sem dados detalhados do entregador. Informe os valores recebidos abaixo:
          </div>
        )}

        {/* Restaurant Confirmation Editable Section */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
            Conferência dos Valores Recebidos pelo Restaurante
          </label>

          <div className="space-y-2">
            {paymentLines.map((line) => (
              <div key={line.id} className="flex items-center gap-2.5 p-2.5 bg-stone-50 border border-stone-200/60 rounded-2xl">
                <SelectInput
                  value={line.methodId}
                  onChange={(e) => handleMethodChange(line.id, e.target.value)}
                  className="flex-1 bg-white"
                  disabled={loading}
                >
                  {AVAILABLE_METHODS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </SelectInput>

                <div className="relative w-32">
                  <span className="absolute left-3.5 top-2.5 text-sm font-bold text-stone-400">R$</span>
                  <TextInput
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.amount}
                    onChange={(e) => handleAmountChange(line.id, e.target.value)}
                    placeholder="0.00"
                    className="pl-8 text-right font-bold"
                    disabled={loading}
                  />
                </div>

                {paymentLines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(line.id)}
                    className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                    disabled={loading}
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddLine}
              className="w-full py-2.5 border border-dashed border-stone-200 hover:border-stone-400 bg-white text-stone-500 hover:text-stone-700 text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer"
              disabled={loading}
            >
              <Plus className="w-4 h-4" />
              Adicionar Outra Forma de Pagamento
            </button>
          </div>
        </div>

        {/* Internal Notes */}
        <FormField label="Observação Financeira Interna (opcional)">
          <TextareaInput
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="Ex: Conferido no caixa por João, divergência de R$ 2,00 tratada..."
            rows={2}
            className="resize-none"
            disabled={loading}
          />
        </FormField>
      </form>
    </FormModal>
  );
};
