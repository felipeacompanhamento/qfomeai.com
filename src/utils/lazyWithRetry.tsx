import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface LazyErrorFallbackProps {
  componentName: string;
  onRetry: () => void;
}

function LazyModuleErrorFallback({ componentName, onRetry }: LazyErrorFallbackProps) {
  const [retrying, setRetrying] = useState(false);
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onRetry();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onRetry]);

  const handleManualRetry = () => {
    setRetrying(true);
    onRetry();
  };

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-stone-200 p-6 shadow-sm text-center">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-stone-800 mb-1">
          Carregando dados do módulo...
        </h3>
        <p className="text-sm text-stone-500 mb-5">
          Restabelecendo a conexão com o módulo ({componentName}).
          {countdown > 0 ? ` Nova tentativa automática em ${countdown}s.` : ''}
        </p>
        <button
          onClick={handleManualRetry}
          disabled={retrying}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Carregando...' : 'Tentar agora'}
        </button>
      </div>
    </div>
  );
}

/**
 * Robust wrapper for React.lazy that handles module import failures
 * (e.g., Vite on-demand compiles, temporary network pauses, stale hashes)
 * without ever crashing the React root tree.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<any>,
  componentName: string = 'module'
) {
  return React.lazy(async () => {
    const maxInlineRetries = 4;
    const retryDelays = [200, 500, 1000, 1800];

    for (let attempt = 0; attempt < maxInlineRetries; attempt++) {
      try {
        const component = await componentImport();
        
        if (component && component.default) {
          return { default: component.default };
        }
        if (component && typeof component === 'function') {
          return { default: component };
        }
        if (component && typeof component === 'object') {
          const firstExportKey = Object.keys(component)[0];
          if (firstExportKey && typeof component[firstExportKey] === 'function') {
            return { default: component[firstExportKey] };
          }
        }
        return component;
      } catch (error) {
        console.warn(`[lazyWithRetry] Attempt ${attempt + 1}/${maxInlineRetries} failed for ${componentName}:`, error);
        if (attempt < maxInlineRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        }
      }
    }

    // Graceful fallback component that auto-recovers instead of crashing the root ErrorBoundary
    return {
      default: (props: any) => (
        <LazyModuleErrorFallback
          componentName={componentName}
          onRetry={() => {
            try {
              window.location.reload();
            } catch (e) {
              console.error('Reload error:', e);
            }
          }}
          {...props}
        />
      )
    };
  });
}


