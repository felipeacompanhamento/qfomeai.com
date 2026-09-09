import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Trash2, Ban } from 'lucide-react';
import { Button } from '../ui';

interface CancelOrderModalProps {
  isOpen: boolean;
  order: any;
  onClose: () => void;
  onConfirmCancel: (orderId: string, reason: string) => void;
  isUpdating?: boolean;
}

const COMMON_REASONS = [
  'Cancelado pelo restaurante',
  'Item indisponível / esgotado',
  'Endereço fora da área de entrega',
  'Cliente solicitou cancelamento',
  'Problema operacional na cozinha',
  'Erro no cadastro do pedido'
];

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  isOpen,
  order,
  onClose,
  onConfirmCancel,
  isUpdating = false
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(COMMON_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setSelectedReason(COMMON_REASONS[0]);
      setCustomReason('');
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const orderCode = String(order.numero_pedido || order.id || '').slice(-6).toUpperCase();

  const handleConfirm = () => {
    const finalReason = customReason.trim() ? customReason.trim() : selectedReason;
    onConfirmCancel(order.id, finalReason || 'Cancelado pelo restaurante');
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-200 relative animate-in zoom-in-95 duration-150 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={isUpdating}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
            <Ban className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-stone-900 tracking-tight">
              Cancelar Pedido #{orderCode}
            </h3>
            <p className="text-xs text-stone-500">
              Esta ação cancelará o pedido e notificará o cliente.
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <label className="text-xs font-bold text-stone-700 block">
            Selecione o motivo do cancelamento:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {COMMON_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setSelectedReason(reason)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl text-left border transition-all cursor-pointer ${
                  selectedReason === reason && !customReason.trim()
                    ? 'border-rose-500 bg-rose-50 text-rose-800 ring-1 ring-rose-500'
                    : 'border-stone-200 bg-stone-50/50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {reason}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold text-stone-700 block">
              Ou digite outro motivo detalhado (opcional):
            </label>
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Ex: Cliente não atende o telefone..."
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="flex-1 py-2.5 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            Voltar
          </button>
          <Button
            variant="destructive"
            size="md"
            loading={isUpdating}
            onClick={handleConfirm}
            className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md cursor-pointer"
          >
            Confirmar Cancelamento
          </Button>
        </div>
      </div>
    </div>
  );
};
