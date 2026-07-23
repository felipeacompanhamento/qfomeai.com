import React from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorDetails = null;
      try {
        if (this.state.error?.message) {
          errorDetails = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4 font-sans">
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-stone-800 mb-2">Ops! Algo deu errado</h2>
            <p className="text-stone-500 mb-6">
              Ocorreu um erro inesperado. Por favor, tente recarregar a página.
            </p>
            
            {errorDetails && (
              <div className="mb-6 p-4 bg-stone-50 rounded-2xl text-left overflow-hidden">
                <p className="text-xs font-bold text-stone-400 uppercase mb-2">Detalhes do Erro:</p>
                <div className="text-[10px] text-stone-500 font-mono break-all whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {JSON.stringify(errorDetails, null, 2)}
                </div>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
            >
              <RefreshCcw className="w-5 h-5" />
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
