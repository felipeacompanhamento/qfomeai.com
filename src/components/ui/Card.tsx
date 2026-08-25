import React from 'react';
import { DESIGN_TOKENS } from '../../theme/tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ children, padding = 'md', hoverable = false, className = '', ...props }, ref) => {
    const paddingClasses = {
      none: 'p-0',
      sm: 'p-3 sm:p-4',
      md: DESIGN_TOKENS.spacing.cardPadding,
      lg: DESIGN_TOKENS.spacing.cardPaddingLarge,
    }[padding];

    const hoverClass = hoverable
      ? 'hover:shadow-md hover:border-stone-300 transition-all duration-200'
      : '';

    return (
      <div
        ref={ref}
        className={`bg-white ${DESIGN_TOKENS.radius.card} border ${DESIGN_TOKENS.colors.neutral.border} ${DESIGN_TOKENS.shadows.card} ${paddingClasses} ${hoverClass} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  iconBgColor?: string;
  iconTextColor?: string;
  subtitle?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  action?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  iconBgColor = 'bg-emerald-50',
  iconTextColor = 'text-emerald-600',
  subtitle,
  trend,
  action,
  className = '',
}) => {
  return (
    <Card className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-stone-500 uppercase tracking-wider truncate">{title}</span>
        {Icon && (
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${iconBgColor} ${iconTextColor} flex items-center justify-center shrink-0 shadow-2xs`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="text-xl sm:text-2xl font-extrabold text-stone-800 tracking-tight">{value}</div>
        {action}
      </div>

      {(subtitle || trend) && (
        <div className="flex items-center gap-2 text-xs font-medium">
          {trend && (
            <span
              className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                trend.isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {trend.value}
            </span>
          )}
          {subtitle && <span className="text-stone-400 truncate">{subtitle}</span>}
        </div>
      )}
    </Card>
  );
};
