import React from 'react';
import { LucideIcon } from 'lucide-react';
import { FormModal, FormFooter, SecondaryButton, PrimaryButton, DangerButton } from '../../../../components/ui/FormComponents';

interface FinancialModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconBgColor?: string;
  iconTextColor?: string;
  children: React.ReactNode;
  error?: string | null;
  loading?: boolean;
  submitLabel?: string;
  submitVariant?: 'emerald' | 'rose' | 'stone';
  onSubmit?: () => void;
  submitDisabled?: boolean;
}

export const FinancialModal: React.FC<FinancialModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  iconBgColor = 'bg-stone-100',
  iconTextColor = 'text-stone-700',
  children,
  error,
  loading = false,
  submitLabel = 'Salvar',
  submitVariant = 'emerald',
  onSubmit,
  submitDisabled = false
}) => {
  const renderSubmitButton = () => {
    if (!onSubmit) return null;

    if (submitVariant === 'rose') {
      return (
        <DangerButton
          onClick={onSubmit}
          disabled={loading || submitDisabled}
          loading={loading}
        >
          {submitLabel}
        </DangerButton>
      );
    }

    return (
      <PrimaryButton
        onClick={onSubmit}
        disabled={loading || submitDisabled}
        loading={loading}
        className={submitVariant === 'stone' ? 'bg-stone-800 hover:bg-stone-900 focus:ring-stone-800/20' : ''}
      >
        {submitLabel}
      </PrimaryButton>
    );
  };

  return (
    <FormModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={icon}
      iconBgColor={iconBgColor}
      iconTextColor={iconTextColor}
      error={error}
      loading={loading}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={loading}>
            Cancelar
          </SecondaryButton>
          {renderSubmitButton()}
        </>
      }
    >
      {children}
    </FormModal>
  );
};
