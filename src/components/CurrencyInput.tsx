import React, { useLayoutEffect, useRef } from 'react';
import { formatCurrency, parseToCents, parsePastedValue } from '../utils/currencyUtils';

export interface CurrencyInputProps {
  valueCents?: number;
  valueInCents?: number;
  onChangeCents?: (cents: number) => void;
  onChange?: (cents: number) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
  required?: boolean;
  id?: string;
  name?: string;
  className?: string;
  inputClassName?: string;
  helperText?: string;
  autoFocus?: boolean;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  valueCents,
  valueInCents,
  onChangeCents,
  onChange,
  label,
  placeholder = 'R$ 0,00',
  disabled = false,
  readOnly = false,
  error,
  required = false,
  id,
  name,
  className = '',
  inputClassName = '',
  helperText,
  autoFocus = false,
  onFocus,
  onBlur
}) => {
  const cents = valueInCents !== undefined ? valueInCents : (valueCents !== undefined ? valueCents : 0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const notifyChange = (newCents: number) => {
    if (onChangeCents) onChangeCents(newCents);
    if (onChange) onChange(newCents);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    // Extract only digits
    const digits = rawValue.replace(/\D/g, '');
    const newCents = digits ? parseInt(digits, 10) : 0;
    const safeCents = Math.min(Math.max(0, newCents), Number.MAX_SAFE_INTEGER);
    notifyChange(safeCents);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteText = e.clipboardData.getData('text');
    const parsed = parsePastedValue(pasteText);
    notifyChange(parsed);
  };

  const formattedValue = formatCurrency(cents, true);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input) {
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }, [formattedValue]);

  return (
    <div className={className ? `space-y-1.5 ${className}` : 'space-y-1.5'}>
      {label && (
        <label htmlFor={id} className="block text-xs font-bold text-stone-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          name={name}
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={formattedValue}
          onChange={handleChange}
          onPaste={handlePaste}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          autoFocus={autoFocus}
          className={inputClassName || `w-full px-3.5 py-2.5 bg-stone-50 border rounded-xl text-stone-800 text-sm font-semibold transition-all focus:bg-white focus:outline-none focus:ring-2 disabled:bg-stone-100 disabled:text-stone-400 ${
            error 
              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20' 
              : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-500/20'
          }`}
        />
      </div>
      {helperText && !error && (
        <p className="text-xs text-stone-500">{helperText}</p>
      )}
      {error && (
        <p className="text-xs text-rose-600 font-medium">{error}</p>
      )}
    </div>
  );
};

export default CurrencyInput;

