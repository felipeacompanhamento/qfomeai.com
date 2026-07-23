import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Mail, AlertCircle, Loader2, CheckCircle, RefreshCw } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';

export default function EmailVerificationBanner() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || user.emailVerified) return null;

  const handleResendVerification = async () => {
    setLoading(true);
    setError(null);
    try {
      await sendEmailVerification(user);
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    } catch (err: any) {
      console.error("Error resending verification:", err);
      setError("Erro ao enviar e-mail. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await refreshUser();
    } catch (err) {
      console.error("Error refreshing user:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 p-4 sticky top-0 z-[100] shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-amber-800">
          <div className="bg-amber-100 p-2 rounded-xl">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-sm sm:text-base">Verifique seu endereço de e-mail</p>
            <p className="text-xs sm:text-sm opacity-80">
              Enviamos um link de confirmação para <strong>{user.email}</strong>. 
              Você precisa confirmar seu e-mail para acessar o painel.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white border border-amber-200 text-amber-800 font-bold rounded-xl hover:bg-amber-100 transition-all text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Já confirmei
          </button>
          
          <button
            onClick={handleResendVerification}
            disabled={loading || sent}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all text-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (sent ? <CheckCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />)}
            {sent ? 'E-mail enviado!' : 'Reenviar e-mail'}
          </button>
        </div>
      </div>
      {error && (
        <div className="max-w-7xl mx-auto mt-2 flex items-center gap-2 text-red-600 text-xs font-bold">
          <AlertCircle className="w-3 h-3" />
          {error}
        </div>
      )}
    </div>
  );
}
