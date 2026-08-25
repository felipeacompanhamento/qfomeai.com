import React from 'react';
import { Loader2 } from 'lucide-react';
import { DESIGN_TOKENS } from '../../theme/tokens';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      icon,
      iconPosition = 'left',
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      primary: DESIGN_TOKENS.colors.primary.default,
      secondary: DESIGN_TOKENS.colors.secondary.default,
      ghost: DESIGN_TOKENS.colors.ghost.default,
      destructive: DESIGN_TOKENS.colors.danger.default,
      success: DESIGN_TOKENS.colors.success.default,
    }[variant];

    const sizeClasses = {
      sm: 'min-h-[36px] px-3.5 py-1.5 text-xs font-bold rounded-lg gap-1.5',
      md: 'min-h-[44px] px-4 py-2.5 text-sm font-bold rounded-xl gap-2',
      lg: 'min-h-[48px] px-6 py-3 text-base font-bold rounded-xl gap-2.5',
    }[size];

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-bold transition-all duration-150 ease-in-out select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:transform-none ${variantClasses} ${sizeClasses} ${className}`}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          <>
            {icon && iconPosition === 'left' && <span className="shrink-0 flex items-center">{icon}</span>}
            {children && <span>{children}</span>}
            {icon && iconPosition === 'right' && <span className="shrink-0 flex items-center">{icon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  'aria-label': string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      children,
      variant = 'ghost',
      size = 'md',
      loading = false,
      disabled = false,
      className = '',
      'aria-label': ariaLabel,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const variantClasses = {
      primary: DESIGN_TOKENS.colors.primary.default,
      secondary: DESIGN_TOKENS.colors.secondary.default,
      ghost: DESIGN_TOKENS.colors.ghost.default,
      destructive: DESIGN_TOKENS.colors.danger.default,
    }[variant];

    const sizeClasses = {
      sm: 'w-8 h-8 min-h-[32px] p-1.5 rounded-lg text-xs',
      md: 'w-11 h-11 min-h-[44px] p-2.5 rounded-xl text-sm',
      lg: 'w-12 h-12 min-h-[48px] p-3 rounded-xl text-base',
    }[size];

    return (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center font-bold transition-all duration-150 shrink-0 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${variantClasses} ${sizeClasses} ${className}`}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';
