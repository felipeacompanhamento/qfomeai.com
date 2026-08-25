import React from 'react';
import { DESIGN_TOKENS } from '../../theme/tokens';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  className = '',
  ...props
}) => {
  const variantClasses = {
    default: DESIGN_TOKENS.colors.primary.soft,
    success: DESIGN_TOKENS.colors.success.soft,
    warning: DESIGN_TOKENS.colors.warning.soft,
    danger: DESIGN_TOKENS.colors.danger.soft,
    info: DESIGN_TOKENS.colors.info.soft,
    neutral: 'bg-stone-100 text-stone-700 border border-stone-200/80',
  }[variant];

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider',
    md: 'px-2.5 py-1 text-xs font-bold',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${DESIGN_TOKENS.radius.badge} whitespace-nowrap select-none ${variantClasses} ${sizeClasses} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
