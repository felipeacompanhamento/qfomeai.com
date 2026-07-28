import React, { useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';

// PrimaryButton
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  icon?: React.ReactNode;
}

export const PrimaryButton: React.FC<ButtonProps> = ({
  children,
  loading,
  disabled,
  icon,
  className = '',
  ...props
}) => {
  return (
    <button
      disabled={disabled || loading}
      className={`relative flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-xs transition-all duration-150 ease-in-out disabled:opacity-50 disabled:pointer-events-none disabled:transform-none select-none cursor-pointer ${className}`}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
      {!loading && icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

// SecondaryButton
export const SecondaryButton: React.FC<ButtonProps> = ({
  children,
  loading,
  disabled,
  icon,
  className = '',
  ...props
}) => {
  return (
    <button
      disabled={disabled || loading}
      className={`relative flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-stone-200 hover:bg-stone-50 active:bg-stone-100 text-stone-700 font-bold text-sm rounded-xl shadow-2xs transition-all duration-150 ease-in-out disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer ${className}`}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
      {!loading && icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

// DangerButton
export const DangerButton: React.FC<ButtonProps> = ({
  children,
  loading,
  disabled,
  icon,
  className = '',
  ...props
}) => {
  return (
    <button
      disabled={disabled || loading}
      className={`relative flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-sm rounded-xl shadow-xs transition-all duration-150 ease-in-out disabled:opacity-50 disabled:pointer-events-none select-none cursor-pointer ${className}`}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />}
      {!loading && icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

// LoadingButton
export const LoadingButton: React.FC<ButtonProps & { variant?: 'primary' | 'secondary' | 'danger' }> = ({
  children,
  loading,
  variant = 'primary',
  ...props
}) => {
  if (variant === 'secondary') return <SecondaryButton loading={loading} {...props}>{children}</SecondaryButton>;
  if (variant === 'danger') return <DangerButton loading={loading} {...props}>{children}</DangerButton>;
  return <PrimaryButton loading={loading} {...props}>{children}</PrimaryButton>;
};

// FormLabel
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

// FormDescription
export const FormDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  return <p className={`text-[11px] text-stone-400 mt-1 leading-normal ${className}`}>{children}</p>;
};

// FormError
export const FormError: React.FC<{ error?: string | null; className?: string }> = ({ error, className = '' }) => {
  if (!error) return null;
  return (
    <p className={`text-xs text-rose-600 font-bold flex items-center gap-1.5 mt-1.5 animate-fade-in ${className}`}>
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{error}</span>
    </p>
  );
};

// FormField
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
  children
}) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <FormLabel required={required}>{label}</FormLabel>}
      {children}
      {description && <FormDescription>{description}</FormDescription>}
      <FormError error={error} />
    </div>
  );
};

// FormSection
export interface FormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormSection: React.FC<FormSectionProps> = ({ title, description, children, className = '' }) => {
  return (
    <div className={`space-y-4 border-b border-stone-100 pb-5 last:border-0 last:pb-0 ${className}`}>
      {(title || description) && (
        <div className="space-y-1">
          {title && <h4 className="text-sm font-extrabold text-stone-700 tracking-tight">{title}</h4>}
          {description && <p className="text-xs text-stone-400 font-medium">{description}</p>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </div>
  );
};

// FormFooter
export const FormFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  return (
    <div className={`p-4 sm:p-5 bg-stone-50/80 border-t border-stone-100 flex items-center justify-end gap-3 flex-shrink-0 ${className}`}>
      {children}
    </div>
  );
};

// FormModal
export interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<any>;
  iconBgColor?: string;
  iconTextColor?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  error?: string | null;
  loading?: boolean;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export const FormModal: React.FC<FormModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconBgColor = 'bg-stone-100',
  iconTextColor = 'text-stone-700',
  children,
  footer,
  error,
  loading = false,
  maxWidth = 'md'
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, loading]);

  if (!isOpen) return null;

  const maxWidthClass = {
    xs: 'max-w-xs',
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl'
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
      <div
        className={`bg-white rounded-2xl shadow-xl border border-stone-100 w-full ${maxWidthClass} my-auto overflow-hidden flex flex-col max-h-[92vh] transition-all transform animate-in fade-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between gap-3 bg-stone-50/50">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${iconBgColor} ${iconTextColor} flex items-center justify-center flex-shrink-0 shadow-xs`}>
                <Icon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 text-left">
              <h2 className="text-base sm:text-lg font-bold text-stone-800 tracking-tight truncate">{title}</h2>
              {subtitle && <p className="text-xs text-stone-400 font-medium truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Fechar"
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition-all flex-shrink-0 disabled:opacity-50 focus:outline-none cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs sm:text-sm font-medium flex items-start gap-2.5 animate-shake">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {children}
        </div>

        {/* Footer */}
        {footer && <FormFooter>{footer}</FormFooter>}
      </div>
    </div>
  );
};

// TextInput
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string | null;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full px-3.5 py-2.5 bg-stone-50 border rounded-xl text-stone-800 text-sm font-semibold transition-all focus:bg-white focus:outline-none focus:ring-2 disabled:bg-stone-100 disabled:text-stone-400 ${
          error
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
            : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-500/20'
        } ${className}`}
        {...props}
      />
    );
  }
);
TextInput.displayName = 'TextInput';

// DateInput
export interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string | null;
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="date"
        className={`w-full px-3.5 py-2.5 bg-stone-50 border rounded-xl text-stone-800 text-sm font-semibold transition-all focus:bg-white focus:outline-none focus:ring-2 disabled:bg-stone-100 disabled:text-stone-400 ${
          error
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
            : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-500/20'
        } ${className}`}
        {...props}
      />
    );
  }
);
DateInput.displayName = 'DateInput';

// SelectInput
export interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string | null;
}

export const SelectInput = React.forwardRef<HTMLSelectElement, SelectInputProps>(
  ({ error, children, className = '', ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={`w-full px-3.5 py-2.5 bg-stone-50 border rounded-xl text-stone-800 text-sm font-semibold transition-all focus:bg-white focus:outline-none focus:ring-2 disabled:bg-stone-100 disabled:text-stone-400 ${
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
SelectInput.displayName = 'SelectInput';

// TextareaInput
export interface TextareaInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string | null;
}

export const TextareaInput = React.forwardRef<HTMLTextAreaElement, TextareaInputProps>(
  ({ error, className = '', ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`w-full p-3 bg-stone-50 border rounded-xl text-stone-800 text-sm font-semibold transition-all focus:bg-white focus:outline-none focus:ring-2 disabled:bg-stone-100 disabled:text-stone-400 resize-none ${
          error
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20'
            : 'border-stone-200 focus:border-emerald-500 focus:ring-emerald-500/20'
        } ${className}`}
        {...props}
      />
    );
  }
);
TextareaInput.displayName = 'TextareaInput';

// EmptyState
export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ComponentType<any>;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon,
  action,
  className = ''
}) => {
  return (
    <div className={`p-8 text-center flex flex-col items-center justify-center bg-stone-50/50 border border-dashed border-stone-200/80 rounded-2xl max-w-lg mx-auto ${className}`}>
      {Icon && (
        <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-400 mb-4 shadow-2xs">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <h4 className="text-base font-extrabold text-stone-700 tracking-tight mb-1">{title}</h4>
      <p className="text-xs text-stone-400 font-medium leading-relaxed max-w-sm mb-5">{description}</p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
};

// ConfirmDialog
export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'primary' | 'danger';
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  type = 'primary',
  loading = false
}) => {
  if (!isOpen) return null;

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={description}
      loading={loading}
      maxWidth="sm"
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={loading}>
            {cancelLabel}
          </SecondaryButton>
          {type === 'danger' ? (
            <DangerButton onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </DangerButton>
          ) : (
            <PrimaryButton onClick={onConfirm} loading={loading}>
              {confirmLabel}
            </PrimaryButton>
          )}
        </>
      }
    >
      <div className="text-sm text-stone-500 py-2">
        Essa ação não poderá ser desfeita. Por favor, confirme se deseja prosseguir.
      </div>
    </FormModal>
  );
};

// Re-export CurrencyInput as requested
export { CurrencyInput } from '../CurrencyInput';
