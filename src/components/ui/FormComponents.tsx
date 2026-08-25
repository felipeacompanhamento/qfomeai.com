import React, { useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Button, ButtonProps } from './Button';
import { Input, InputProps, Select, SelectProps, Textarea, TextareaProps, FormField, FormLabel } from './InputComponents';
import { Modal, ModalProps } from './ModalComponents';
import { EmptyState as BaseEmptyState, EmptyStateProps } from './Feedback';

export { FormLabel, FormField };

// PrimaryButton
export const PrimaryButton: React.FC<ButtonProps> = (props) => (
  <Button variant="primary" size="md" {...props} />
);

// SecondaryButton
export const SecondaryButton: React.FC<ButtonProps> = (props) => (
  <Button variant="secondary" size="md" {...props} />
);

// DangerButton
export const DangerButton: React.FC<ButtonProps> = (props) => (
  <Button variant="destructive" size="md" {...props} />
);

// LoadingButton
export interface LoadingButtonProps extends Omit<ButtonProps, 'variant'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success' | 'danger';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  variant = 'primary',
  ...props
}) => {
  const mappedVariant = variant === 'danger' ? 'destructive' : (variant as ButtonProps['variant']);
  return <Button variant={mappedVariant} {...props} />;
};

// FormDescription
export const FormDescription: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <p className={`text-[11px] text-stone-400 mt-1 leading-normal ${className}`}>{children}</p>;
};

// FormError
export const FormError: React.FC<{ error?: string | null; className?: string }> = ({ error, className = '' }) => {
  if (!error) return null;
  return (
    <p className={`text-xs text-rose-600 font-bold flex items-center gap-1.5 mt-1.5 animate-fade-in ${className}`}>
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      <span>{error}</span>
    </p>
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
    <div className={`p-4 sm:p-5 bg-stone-50/80 border-t border-stone-100 flex items-center justify-end gap-3 shrink-0 ${className}`}>
      {children}
    </div>
  );
};

// FormModal
export interface FormModalProps extends Omit<ModalProps, 'children'> {
  error?: string | null;
  children: React.ReactNode;
}

export const FormModal: React.FC<FormModalProps> = ({ error, children, ...props }) => {
  return (
    <Modal {...props}>
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs sm:text-sm font-medium flex items-start gap-2.5 animate-shake mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {children}
    </Modal>
  );
};

// TextInput
export const TextInput = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <Input ref={ref} {...props} />
));
TextInput.displayName = 'TextInput';

// DateInput
export const DateInput = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <Input ref={ref} type="date" {...props} />
));
DateInput.displayName = 'DateInput';

// SelectInput
export const SelectInput = React.forwardRef<HTMLSelectElement, SelectProps>((props, ref) => (
  <Select ref={ref} {...props} />
));
SelectInput.displayName = 'SelectInput';

// TextareaInput
export const TextareaInput = React.forwardRef<HTMLTextAreaElement, TextareaProps>((props, ref) => (
  <Textarea ref={ref} {...props} />
));
TextareaInput.displayName = 'TextareaInput';

// EmptyState
export const EmptyState: React.FC<EmptyStateProps> = (props) => <BaseEmptyState {...props} />;

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
  loading = false,
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

// Re-export CurrencyInput
export { CurrencyInput } from '../CurrencyInput';

// Switch
export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
  id,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;

  return (
    <label
      htmlFor={inputId}
      className={`inline-flex items-start justify-between gap-3 cursor-pointer select-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {(label || description) && (
        <div className="flex flex-col pr-2">
          {label && <span className="text-xs font-bold text-stone-800">{label}</span>}
          {description && <span className="text-[11px] text-stone-400 font-medium leading-normal">{description}</span>}
        </div>
      )}
      <div className="relative inline-shrink-0 pt-0.5">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
          {...props}
        />
        <div
          className={`w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
            checked ? 'bg-emerald-600' : 'bg-stone-200'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white shadow-xs transform transition-transform duration-200 ease-in-out mt-0.5 ml-0.5 ${
              checked ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </div>
      </div>
    </label>
  );
};

// Checkbox
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked, onChange, label, description, disabled = false, className = '', id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <label
        htmlFor={inputId}
        className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${className}`}
      >
        <div className="relative flex items-center justify-center mt-0.5 shrink-0">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="sr-only"
            {...props}
          />
          <div
            className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${
              checked
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-stone-50 border-stone-300 hover:border-stone-400'
            }`}
          >
            {checked && (
              <svg className="w-3 h-3 fill-current stroke-current" viewBox="0 0 12 12">
                <path d="M3.707 5.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l5-5a1 1 0 00-1.414-1.414L5.5 8.086 3.707 5.293z" />
              </svg>
            )}
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && <span className="text-xs font-semibold text-stone-800">{label}</span>}
            {description && <span className="text-[11px] text-stone-400 font-medium leading-normal">{description}</span>}
          </div>
        )}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';

// RadioGroup
export interface RadioOption {
  value: string;
  label: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: RadioOption[];
  disabled?: boolean;
  className?: string;
  layout?: 'vertical' | 'horizontal';
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  onChange,
  options,
  disabled = false,
  className = '',
  layout = 'vertical',
}) => {
  return (
    <div
      className={`${
        layout === 'horizontal' ? 'flex flex-wrap items-center gap-4' : 'flex flex-col space-y-2.5'
      } ${className}`}
    >
      {options.map((option) => {
        const optionId = `${name}-${option.value}`;
        const isSelected = value === option.value;
        const isOptionDisabled = disabled || option.disabled;

        return (
          <label
            key={option.value}
            htmlFor={optionId}
            className={`inline-flex items-start gap-2.5 cursor-pointer select-none ${
              isOptionDisabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <div className="relative flex items-center justify-center mt-0.5 shrink-0">
              <input
                id={optionId}
                type="radio"
                name={name}
                value={option.value}
                checked={isSelected}
                disabled={isOptionDisabled}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <div
                className={`w-4 h-4 rounded-full border transition-colors flex items-center justify-center ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-600'
                    : 'bg-stone-50 border-stone-300 hover:border-stone-400'
                }`}
              >
                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-stone-800">{option.label}</span>
              {option.description && (
                <span className="text-[11px] text-stone-400 font-medium leading-normal">{option.description}</span>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
};

// FieldGroup
export interface FieldGroupProps {
  cols?: 1 | 2 | 3 | 4;
  children: React.ReactNode;
  className?: string;
}

export const FieldGroup: React.FC<FieldGroupProps> = ({ cols = 2, children, className = '' }) => {
  const colsClass =
    cols === 1
      ? 'grid-cols-1'
      : cols === 2
      ? 'grid-cols-1 md:grid-cols-2'
      : cols === 3
      ? 'grid-cols-1 md:grid-cols-3'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';

  return <div className={`grid gap-4 ${colsClass} ${className}`}>{children}</div>;
};

// FormActions
export interface FormActionsProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right' | 'between';
  className?: string;
}

export const FormActions: React.FC<FormActionsProps> = ({ children, align = 'right', className = '' }) => {
  const alignClass =
    align === 'left'
      ? 'justify-start'
      : align === 'center'
      ? 'justify-center'
      : align === 'between'
      ? 'justify-between'
      : 'justify-end';

  return (
    <div className={`flex flex-wrap items-center gap-3 pt-4 border-t border-stone-100 ${alignClass} ${className}`}>
      {children}
    </div>
  );
};

// FileUpload
export interface FileUploadProps {
  accept?: string;
  onFileSelect: (file: File) => void;
  previewUrl?: string | null;
  onRemove?: () => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  accept = 'image/*',
  onFileSelect,
  previewUrl,
  onRemove,
  label,
  description = 'PNG, JPG ou WEBP até 5MB',
  disabled = false,
  loading = false,
  error,
  className = '',
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <FormLabel>{label}</FormLabel>}

      {previewUrl ? (
        <div className="relative inline-block group rounded-2xl overflow-hidden border border-stone-200">
          <img src={previewUrl} alt="Preview" className="w-24 h-24 object-cover" />
          {!disabled && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="absolute top-1 right-1 p-1 bg-stone-900/70 hover:bg-rose-600 text-white rounded-full transition-all cursor-pointer"
              title="Remover imagem"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div
          onClick={() => !disabled && !loading && fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl transition-all cursor-pointer ${
            disabled
              ? 'bg-stone-50 border-stone-200 opacity-60 cursor-not-allowed'
              : 'bg-stone-50/50 hover:bg-stone-50 border-stone-300 hover:border-emerald-500'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={disabled || loading}
            className="hidden"
          />
          <div className="text-center space-y-1">
            <p className="text-xs font-bold text-stone-700">Clique para enviar ou arraste até aqui</p>
            {description && <p className="text-[11px] text-stone-400">{description}</p>}
          </div>
        </div>
      )}

      <FormError error={error} />
    </div>
  );
};

