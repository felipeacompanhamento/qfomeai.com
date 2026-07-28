import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';

export interface PaymentMethodOption {
  id: string;
  name?: string;
  label?: string;
}

export interface PaymentMethodSelectProps {
  /** Unique ID for accessibility and element isolation */
  paymentId?: string;
  id?: string;
  /** Currently selected payment method ID */
  value?: string;
  paymentMethodId?: string;
  /** List of available payment methods */
  options?: PaymentMethodOption[];
  paymentMethods?: PaymentMethodOption[];
  /** Callback when selection changes */
  onChange: (newMethodId: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  placeholder?: string;
  className?: string;
  showSettingsLinkOnEmpty?: boolean;
}

export const PaymentMethodSelect: React.FC<PaymentMethodSelectProps> = ({
  paymentId,
  id,
  value,
  paymentMethodId,
  options,
  paymentMethods,
  onChange,
  disabled = false,
  loading = false,
  error = null,
  onRetry,
  placeholder = 'Selecione...',
  className = '',
  showSettingsLinkOnEmpty = true
}) => {
  const selectedValue = value !== undefined ? value : (paymentMethodId || '');
  const items = options || paymentMethods || [];
  const uniqueId = paymentId || id || 'default';
  const selectElementId = `payment-method-select-${uniqueId}`;
  const labelElementId = `payment-method-label-${uniqueId}`;

  const hasValueInOptions = items.some(opt => opt.id === selectedValue);

  if (loading) {
    return (
      <div className="relative w-full flex items-center">
        <div className="w-full h-10 px-3 bg-stone-50 border border-stone-200 rounded-lg text-xs font-medium text-stone-400 flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
          <span>Carregando formas de pagamento...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 text-red-800 text-xs rounded-lg border border-red-200 font-medium space-y-2">
        <p>{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 font-bold text-red-900 underline hover:text-red-700 cursor-pointer"
          >
            <span>Tentar novamente</span>
          </button>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    if (showSettingsLinkOnEmpty) {
      return (
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
      );
    }
    return (
      <div className="relative w-full">
        <select
          disabled
          className="w-full h-10 px-3 bg-stone-100 border border-stone-200 rounded-lg text-xs font-bold text-stone-400 cursor-not-allowed"
        >
          <option>Nenhuma forma de pagamento disponível</option>
        </select>
      </div>
    );
  }

  const defaultClasses =
    'w-full h-10 px-3 bg-white border border-stone-200 rounded-lg text-xs sm:text-sm font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer disabled:bg-stone-100 disabled:cursor-not-allowed';

  return (
    <div className="relative w-full">
      <label id={labelElementId} htmlFor={selectElementId} className="sr-only">
        Forma de pagamento
      </label>
      <select
        id={selectElementId}
        name={selectElementId}
        aria-labelledby={labelElementId}
        aria-controls={selectElementId}
        value={selectedValue}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={className || defaultClasses}
      >
        {!hasValueInOptions && selectedValue && (
          <option value={selectedValue}>{selectedValue}</option>
        )}
        {!selectedValue && (
          <option value="">{placeholder}</option>
        )}
        {items.map((opt) => {
          const displayName = opt.name || opt.label || opt.id;
          return (
            <option key={`${uniqueId}-${opt.id}`} value={opt.id}>
              {displayName}
            </option>
          );
        })}
      </select>
    </div>
  );
};

export default PaymentMethodSelect;
