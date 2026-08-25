import React from 'react';
import { Search, AlertCircle } from 'lucide-react';
import { DESIGN_TOKENS } from '../../theme/tokens';

export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const FormLabel: React.FC<FormLabelProps> = ({ children, required, className = '', ...props }) => {
  return (
    <label className={`block text-xs font-extrabold text-stone-500 uppercase tracking-wider ${className}`} {...props}>
      {children} {required && <span className="text-rose-500 font-bold ml-0.5">*</span>}
    </label>
  );
};

export interface FormFieldProps {
  label?: string;
  required?: boolean;
  error?: string | null;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  required,
  error,
  description,
  className = '',
  children,
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <FormLabel required={required}>{label}</FormLabel>}
      {children}
      {description && <p className="text-[11px] text-stone-400 leading-normal">{description}</p>}
      {error && (
        <p className="text-xs text-rose-600 font-bold flex items-center gap-1.5 mt-1 animate-fade-in">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string | null;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, icon, className = '', value, defaultValue, ...props }, ref) => {
    const isControlled = value !== undefined || (defaultValue === undefined && props.onChange !== undefined);
    const resolvedValue = isControlled ? (value ?? '') : undefined;

    return (
      <div className="relative w-full">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none flex items-center">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          {...(isControlled ? { value: resolvedValue } : { defaultValue })}
          className={`w-full ${icon ? 'pl-10' : 'px-3.5'} min-h-[44px] py-2.5 bg-stone-50 border rounded-xl text-stone-800 text-sm font-semibold transition-all focus:bg-white focus:outline-none focus:ring-2 disabled:bg-stone-100 disabled:text-stone-400 ${
            error
              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
              : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-500/20'
          } ${className}`}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className = '', placeholder = 'Buscar...', ...props }, ref) => {
    return (
      <Input
        ref={ref}
        type="text"
        icon={<Search className="w-4 h-4" />}
        placeholder={placeholder}
        className={className}
        {...props}
      />
    );
  }
);
SearchInput.displayName = 'SearchInput';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string | null;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, children, className = '', value, defaultValue, ...props }, ref) => {
    const isControlled = value !== undefined || (defaultValue === undefined && props.onChange !== undefined);
    const resolvedValue = isControlled ? (value ?? '') : undefined;

    return (
      <select
        ref={ref}
        {...(isControlled ? { value: resolvedValue } : { defaultValue })}
        className={`w-full px-3.5 min-h-[44px] py-2.5 bg-stone-50 border rounded-xl text-stone-800 text-sm font-semibold transition-all focus:bg-white focus:outline-none focus:ring-2 disabled:bg-stone-100 disabled:text-stone-400 cursor-pointer ${
          error
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
            : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-500/20'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string | null;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className = '', rows = 3, value, defaultValue, ...props }, ref) => {
    const isControlled = value !== undefined || (defaultValue === undefined && props.onChange !== undefined);
    const resolvedValue = isControlled ? (value ?? '') : undefined;

    return (
      <textarea
        ref={ref}
        rows={rows}
        {...(isControlled ? { value: resolvedValue } : { defaultValue })}
        className={`w-full p-3.5 bg-stone-50 border rounded-xl text-stone-800 text-sm font-semibold transition-all focus:bg-white focus:outline-none focus:ring-2 disabled:bg-stone-100 disabled:text-stone-400 resize-none ${
          error
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
            : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-500/20'
        } ${className}`}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';
