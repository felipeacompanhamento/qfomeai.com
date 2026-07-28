import React from 'react';
import { formatCurrency } from '../../../../utils/currencyUtils';

interface SummaryItem {
  label: string;
  valueCents: number;
  variant?: 'neutral' | 'emerald' | 'rose' | 'amber';
}

interface FinancialSummaryProps {
  items: SummaryItem[];
}

export const FinancialSummary: React.FC<FinancialSummaryProps> = ({ items }) => {
  const getBadgeClass = (variant?: string) => {
    switch (variant) {
      case 'emerald':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'rose':
        return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'amber':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      default:
        return 'bg-stone-50 text-stone-700 border-stone-200/80';
    }
  };

  const getValueColor = (variant?: string) => {
    switch (variant) {
      case 'emerald':
        return 'text-emerald-700';
      case 'rose':
        return 'text-rose-700';
      case 'amber':
        return 'text-amber-700';
      default:
        return 'text-stone-800';
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      {items.map((item, idx) => (
        <div 
          key={idx}
          className={`p-4 rounded-2xl border ${getBadgeClass(item.variant)} transition-all shadow-xs flex flex-col justify-between`}
        >
          <span className="text-xs font-bold uppercase tracking-wider opacity-80 mb-1">{item.label}</span>
          <span className={`text-lg sm:text-xl font-extrabold ${getValueColor(item.variant)}`}>
            {formatCurrency(item.valueCents / 100)}
          </span>
        </div>
      ))}
    </div>
  );
};
