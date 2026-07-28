import React from 'react';
import { LucideIcon, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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

  const getActionClass = () => {
    if (!actionButton) return '';
    const variant = actionButton.variant || 'emerald';
    if (variant === 'rose') {
      return 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/10';
    }
    if (variant === 'stone') {
      return 'bg-stone-800 hover:bg-stone-900 text-white shadow-stone-800/10';
    }
    return 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10';
  };

  const ActionIcon = actionButton?.icon;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-200/60">
      <div className="flex items-start gap-3">
        <button
          onClick={handleBack}
          aria-label="Voltar"
          className="mt-0.5 p-2 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 text-stone-600 transition-all shadow-sm active:scale-95 flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-5 h-5 text-stone-700" />}
            <h1 className="text-xl sm:text-2xl font-bold text-stone-800 tracking-tight">{title}</h1>
          </div>
          <p className="text-stone-500 text-xs sm:text-sm mt-0.5">{subtitle}</p>
        </div>
      </div>

      {actionButton && (
        <button
          onClick={actionButton.onClick}
          disabled={actionButton.disabled}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${getActionClass()}`}
        >
          {ActionIcon && <ActionIcon className="w-4 h-4" />}
          <span>{actionButton.label}</span>
        </button>
      )}
    </div>
  );
};
