import React from 'react';
import { LucideIcon, FileText } from 'lucide-react';

interface EmptyFinancialStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyFinancialState: React.FC<EmptyFinancialStateProps> = ({
  title = 'Nenhum registro encontrado',
  description = 'Não há lançamentos cadastrados até o momento com os filtros selecionados.',
  icon: Icon = FileText,
  actionButton
}) => {
  return (
    <div className="bg-white rounded-2xl border border-stone-200/80 p-8 sm:p-12 text-center flex flex-col items-center justify-center space-y-3 max-w-md mx-auto my-6 shadow-xs">
      <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-stone-800">{title}</h3>
      <p className="text-xs sm:text-sm text-stone-500 max-w-xs leading-relaxed">{description}</p>
      {actionButton && (
        <button
          onClick={actionButton.onClick}
          className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs active:scale-95"
        >
          {actionButton.label}
        </button>
      )}
    </div>
  );
};
