import React, { useEffect, useRef } from 'react';
import { AlertTriangle, DollarSign, X } from 'lucide-react';

interface UnpaidOrderAlertDialogProps {
  open: boolean;
  orderNumber?: string;
  onClose: () => void;
}

export const UnpaidOrderAlertDialog: React.FC<UnpaidOrderAlertDialogProps> = ({
  open,
  orderNumber,
  onClose
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';

      const timer = setTimeout(() => {
        buttonRef.current?.focus();
      }, 50);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timer);
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          previousFocusRef.current.focus();
        }
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unpaid-order-title"
      aria-describedby="unpaid-order-desc"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-stone-200 relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100 transition-colors"
          aria-label="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shadow-inner">
            <DollarSign className="w-9 h-9" />
          </div>

          <div className="space-y-2">
            <h3 id="unpaid-order-title" className="text-xl font-extrabold text-stone-900">
              Pagamento ainda não confirmado
            </h3>
            {orderNumber && (
              <p className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1 rounded-full inline-block">
                Pedido #{orderNumber.slice(-5).toUpperCase()}
              </p>
            )}
            <p id="unpaid-order-desc" className="text-stone-600 text-sm leading-relaxed pt-1">
              Este pedido ainda não foi marcado como pago. Confirme o pagamento antes de finalizar o pedido.
            </p>
          </div>

          <div className="pt-2 w-full">
            <button
              ref={buttonRef}
              onClick={onClose}
              className="w-full py-3.5 bg-stone-900 hover:bg-stone-800 text-white font-extrabold text-sm rounded-2xl transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500 active:scale-[0.98]"
            >
              Entendi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
