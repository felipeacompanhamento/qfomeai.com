import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';

export function WaiterLoginPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const errCode = searchParams.get('error');
    if (errCode === 'inactive') {
      setError("Sua conta de garçom está inativa. Fale com seu restaurante.");
    } else if (errCode === 'blocked') {
      setError("Sua conta de garçom está bloqueada. Fale com seu restaurante.");
    } else if (errCode === 'not_waiter') {
      setError("Esta conta não possui perfil de garçom ativo.");
    } else if (errCode === 'unconfigured') {
      setError("O acesso desta conta ainda não foi configurado pelo restaurante.");
    }
  }, []);

  React.useEffect(() => {
    if (user && profile) {
      const isWaiter = profile.role === 'WAITER';
      const isRestaurantAccount = profile.accountType === 'RESTAURANT';
      const status = String(profile.status || '').toUpperCase();
      const hasRestaurant = typeof profile.restaurantId === 'string' && profile.restaurantId.trim().length > 0;

      if (!isWaiter) {
        signOut(auth).then(() => {
          setError("Esta conta não possui perfil de garçom.");
          setLoading(false);
        });
        return;
      }

      if (!isRestaurantAccount) {
        signOut(auth).then(() => {
          setError("Esta conta não está associada a um estabelecimento.");
          setLoading(false);
        });
        return;
      }

      if (status === 'BLOCKED') {
        signOut(auth).then(() => {
          setError("Sua conta de garçom está bloqueada. Fale com o restaurante.");
          setLoading(false);
        });
        return;
      }

      if (status === 'INACTIVE' || profile.active === false) {
        signOut(auth).then(() => {
          setError("Sua conta de garçom está inativa. Fale com o restaurante.");
          setLoading(false);
        });
        return;
      }

      if (!hasRestaurant) {
        signOut(auth).then(() => {
          setError("O acesso desta conta ainda não foi configurado pelo restaurante.");
          setLoading(false);
        });
        return;
      }

      if (status !== 'ACTIVE') {
        signOut(auth).then(() => {
          setError("O status desta conta não está configurado corretamente.");
          setLoading(false);
        });
        return;
      }

      // Valid waiter logged in
      setLoading(false);
      navigate('/garcom');
    }
  }, [user, profile, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      console.error("Error signing in waiter:", err);
      setError("Credenciais inválidas. Verifique seu e-mail e senha.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-3xl p-6 sm:p-8 shadow-xl border border-stone-200 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <Users className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-extrabold text-stone-800">Acesso Garçom</h1>
          <p className="text-xs text-stone-500">Entre com suas credenciais cadastradas pelo restaurante</p>
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">E-mail</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="seu.email@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">Senha</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Entrar</span>}
          </button>
        </form>

        <div className="text-center pt-2">
          <Link to="/" className="text-xs text-stone-500 hover:text-stone-800 underline font-medium">
            Voltar para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

export default WaiterLoginPage;
