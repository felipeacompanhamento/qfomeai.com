import React from 'react';
import { AlertTriangle, Loader2, ShieldAlert, WifiOff, RefreshCw, AlertCircle, CheckCircle2, Info } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon,
  action,
  className = '',
}) => {
  return (
    <div className={`p-8 text-center flex flex-col items-center justify-center bg-stone-50/50 border border-dashed border-stone-200 rounded-3xl max-w-lg mx-auto ${className}`}>
      {Icon && (
        <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-400 mb-4 shadow-2xs">
          <Icon className="w-6 h-6" />
        </div>
      )}
      <h4 className="text-base font-extrabold text-stone-700 tracking-tight mb-1">{title}</h4>
      <p className="text-xs text-stone-400 font-medium leading-relaxed max-w-sm mb-5">{description}</p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
};

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Ocorreu um erro',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div role="alert" className={`p-6 bg-rose-50 border border-rose-200 rounded-3xl text-center space-y-3 ${className}`}>
      <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div>
        <h4 className="text-sm font-bold text-rose-800">{title}</h4>
        <p className="text-xs text-rose-600 font-medium mt-1">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
};

export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Carregando informações...',
  className = '',
}) => {
  return (
    <div role="status" aria-live="polite" className={`p-12 flex flex-col items-center justify-center text-center space-y-3 ${className}`}>
      <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      <p className="text-xs text-stone-500 font-medium">{message}</p>
    </div>
  );
};

export interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return <div className={`animate-pulse bg-stone-200/80 rounded-xl ${className}`} />;
};

export interface AccessRestrictedStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const AccessRestrictedState: React.FC<AccessRestrictedStateProps> = ({
  title = 'Acesso Restrito',
  description = 'Você não possui permissão suficiente para acessar este recurso ou visualizar estes dados.',
  action,
  className = '',
}) => {
  return (
    <div className={`p-8 text-center flex flex-col items-center justify-center bg-amber-50/50 border border-amber-200/80 rounded-3xl max-w-lg mx-auto ${className}`}>
      <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4">
        <ShieldAlert className="w-6 h-6" />
      </div>
      <h4 className="text-base font-extrabold text-amber-900 tracking-tight mb-1">{title}</h4>
      <p className="text-xs text-amber-700/80 font-medium leading-relaxed max-w-sm mb-4">{description}</p>
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
};

export interface OfflineStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export const OfflineState: React.FC<OfflineStateProps> = ({
  title = 'Sem conexão com a internet',
  description = 'Algumas informações podem estar temporariamente indisponíveis. Verifique sua rede e tente novamente.',
  onRetry,
  className = '',
}) => {
  return (
    <div className={`p-6 bg-stone-100 border border-stone-200 rounded-3xl text-center space-y-3 ${className}`}>
      <div className="w-10 h-10 bg-stone-200 text-stone-600 rounded-2xl flex items-center justify-center mx-auto">
        <WifiOff className="w-5 h-5" />
      </div>
      <div>
        <h4 className="text-sm font-bold text-stone-800">{title}</h4>
        <p className="text-xs text-stone-500 font-medium mt-1">{description}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 bg-stone-800 hover:bg-stone-900 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
        >
          Reconectar
        </button>
      )}
    </div>
  );
};

export interface SyncStateProps {
  message?: string;
  className?: string;
}

export const SyncState: React.FC<SyncStateProps> = ({
  message = 'Sincronizando dados...',
  className = '',
}) => {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-semibold ${className}`}>
      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
      <span>{message}</span>
    </div>
  );
};

export interface InlineFeedbackProps {
  type?: 'success' | 'error' | 'warning' | 'info';
  message: string;
  className?: string;
}

export const InlineFeedback: React.FC<InlineFeedbackProps> = ({
  type = 'info',
  message,
  className = '',
}) => {
  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800 icon-emerald-600',
    error: 'bg-rose-50 border-rose-200 text-rose-800 icon-rose-600',
    warning: 'bg-amber-50 border-amber-200 text-amber-800 icon-amber-600',
    info: 'bg-stone-50 border-stone-200 text-stone-700 icon-stone-500',
  }[type];

  const Icon = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  }[type];

  return (
    <div className={`p-3 border rounded-xl flex items-center gap-2.5 text-xs font-medium ${styles} ${className}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
};

