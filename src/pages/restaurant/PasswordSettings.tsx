import React, { useState } from 'react';
import { sendPasswordResetEmail, signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { Lock, Save, Loader2, AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PasswordSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error('Usuário não autenticado. Por favor, faça login novamente.');
      }

      // Enviar e-mail de redefinição de senha
      await sendPasswordResetEmail(auth, user.email);
      
      setSuccess(true);

      // Logout automático e redirecionamento após 3 segundos para segurança
      setTimeout(async () => {
        await signOut(auth);
        navigate('/login');
      }, 3000);
    } catch (err: any) {
      console.error('Error sending reset email:', err);
      if (err.message === 'Usuário não autenticado. Por favor, faça login novamente.') {
        setError(err.message);
      } else if (err.code === 'auth/too-many-requests') {
        setError('Muitas solicitações. Tente novamente mais tarde.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Falha na conexão. Verifique sua internet.');
      } else {
        setError('Ocorreu um erro ao enviar o e-mail de redefinição. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-12">
      <div>
        <h2 className="text-2xl font-bold text-stone-800">Alterar Senha</h2>
        <p className="text-stone-500 text-sm">Solicite um link de redefinição de senha para o seu e-mail cadastrado.</p>
      </div>

      <form onSubmit={handleResetPassword} className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 text-sm font-bold">
            <Check className="w-5 h-5 shrink-0" />
            <p>Enviamos um link para redefinição de senha no seu e-mail. Verifique sua caixa de entrada e spam.</p>
          </div>
        )}

        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6 text-center">
          <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-stone-800">Redefinição de Senha</h3>
          <p className="text-stone-500">
            Ao clicar no botão abaixo, um e-mail será enviado para <strong>{auth.currentUser?.email}</strong> com as instruções para criar uma nova senha.
          </p>
          <p className="text-stone-400 text-sm italic">
            Por segurança, você será desconectado após o envio do e-mail.
          </p>
        </div>

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={loading || success}
            className="flex items-center gap-2 px-12 py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {loading ? 'Enviando...' : 'Solicitar Redefinição de Senha'}
          </button>
        </div>
      </form>
    </div>
  );
}
