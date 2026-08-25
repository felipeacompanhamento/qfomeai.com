import React from 'react';
import { LucideIcon, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../../../../components/ui/Button';

interface FinancialPageHeaderProps {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  onBack?: () => void;
  backPath?: string;
  actionButton?: {
    label: string;
    icon?: LucideIcon;
    onClick: () => void;
    variant?: 'emerald' | 'rose' | 'stone';
    disabled?: boolean;
  };
}

export const FinancialPageHeader: React.FC<FinancialPageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  onBack,
  backPath = '/restaurant/financeiro',
  actionButton
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(backPath);
    }
  };

  const ActionIcon = actionButton?.icon;

  const getButtonVariant = (): 'primary' | 'secondary' | 'destructive' => {
    if (!actionButton) return 'primary';
    if (actionButton.variant === 'rose') return 'destructive';
    if (actionButton.variant === 'stone') return 'secondary';
    return 'primary';
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-200/60">
      <div className="flex items-start gap-3">
        <IconButton
          onClick={handleBack}
          aria-label="Voltar"
          variant="secondary"
          size="sm"
          className="mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </IconButton>
        <div>
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 text-stone-700" />}
            <h1 className="text-xl sm:text-2xl font-bold text-stone-800 tracking-tight">{title}</h1>
          </div>
          <p className="text-stone-500 text-xs sm:text-sm mt-0.5">{subtitle}</p>
        </div>
      </div>

      {actionButton && (
        <Button
          onClick={actionButton.onClick}
          disabled={actionButton.disabled}
          variant={getButtonVariant()}
          icon={ActionIcon ? <ActionIcon className="w-4 h-4" /> : undefined}
        >
          {actionButton.label}
        </Button>
      )}
    </div>
  );
};

