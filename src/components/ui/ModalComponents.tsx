import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconBgColor?: string;
  iconTextColor?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconBgColor = 'bg-stone-100',
  iconTextColor = 'text-stone-700',
  children,
  footer,
  loading = false,
  maxWidth = 'md',
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
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
      <div
        className={`bg-white rounded-3xl shadow-xl border border-stone-200 w-full ${maxWidthClass} my-auto overflow-hidden flex flex-col max-h-[92vh] transition-all transform animate-in fade-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between gap-3 bg-stone-50/50">
          <div className="flex items-center gap-3 min-w-0">
            {Icon && (
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${iconBgColor} ${iconTextColor} flex items-center justify-center shrink-0 shadow-2xs`}>
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
            aria-label="Fechar modal"
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition-all shrink-0 disabled:opacity-50 focus:outline-none cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="p-4 sm:p-5 bg-stone-50/80 border-t border-stone-100 flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  position?: 'right' | 'left';
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  position = 'right',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const posClass = position === 'right' ? 'right-0' : 'left-0';

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex overflow-hidden">
      <div className="fixed inset-0" onClick={onClose} />
      <div className={`fixed top-0 bottom-0 ${posClass} w-full max-w-md bg-white shadow-2xl border-l border-stone-200 flex flex-col z-10 animate-in slide-in-from-right duration-200`}>
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between gap-3 bg-stone-50/50">
          <div>
            <h2 className="text-lg font-bold text-stone-800">{title}</h2>
            {subtitle && <p className="text-xs text-stone-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar drawer"
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="p-4 sm:p-5 bg-stone-50 border-t border-stone-100 flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
