import React, { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Mail, Lock, Eye, EyeOff, Chrome, ArrowLeft, Send, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function Login() {
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('login_remember_me') === 'true';
  });
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user && !authLoading) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  React.useEffect(() => {
    if (rememberMe) {
      const savedEmail = localStorage.getItem('login_saved_email');
      if (savedEmail) {
        setEmail(savedEmail);
      }
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (rememberMe) {
      localStorage.setItem('login_remember_me', 'true');
      localStorage.setItem('login_saved_email', email);
    } else {
      localStorage.removeItem('login_remember_me');
      localStorage.removeItem('login_saved_email');
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('E-mail ou senha incorretos. Verifique seus dados.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Muitas tentativas malsucedidas. Tente novamente mais tarde.');
      } else {
        setError('Falha no login. Verifique suas credenciais.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Por favor, digite seu e-mail para recuperar a senha.');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
      setTimeout(() => setIsResettingPassword(false), 5000);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('E-mail não encontrado em nossa base de dados.');
      } else {
        setError('Ocorreu um erro ao tentar enviar o e-mail de recuperação.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user document exists
      const docRef = doc(db, 'users', user.uid);
      let docSnap;
      try {
        docSnap = await getDoc(docRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      }

      if (docSnap && !docSnap.exists()) {
        try {
          await setDoc(docRef, {
            uid: user.uid,
            nome: user.displayName || '',
            email: user.email || '',
            telefone: user.phoneNumber || '',
            tipo_usuario: 'cliente',
            status_conta: 'ativo',
            onboarding_completo: false,
            data_criacao: new Date().toISOString(),
            lgpdAccepted: false,
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
        }
      }
      
      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        return; // User intentionally closed the popup
      }
      console.error(err);
      setError('Falha no login com Google.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4 md:p-6 relative select-none font-sans">
      {/* Absolute Back Button */}
      <button 
        onClick={() => navigate('/')}
        className="fixed top-6 left-6 w-11 h-11 bg-white rounded-full flex items-center justify-center text-stone-800 shadow-md hover:bg-stone-50 hover:shadow-lg active:scale-95 transition-all z-10 border border-stone-100"
      >
        <ChevronLeft className="w-5 h-5 text-stone-600" />
      </button>

      <div className="w-full max-w-md bg-white rounded-[32px] shadow-sm border border-stone-200/80 p-8 md:p-10 relative overflow-hidden">
        {/* Brand Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="flex items-center gap-2.5 mb-5 active:scale-95 transition-transform cursor-pointer" onClick={() => navigate('/')}>
            <img 
              src="/logo.png" 
              alt="Logo qFomeai" 
              className="h-16 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>

          <h1 className="text-[26px] font-black text-stone-900 tracking-tight leading-snug">
            Seja bem-vindo(a)!
          </h1>
          <p className="text-stone-450 mt-1.5 text-[14px] font-medium text-stone-550">
            Faça login para continuar
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-xs font-bold leading-relaxed mb-6 border border-red-100/60 animate-in fade-in duration-200">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-emerald-50 text-emerald-800 p-4 rounded-2xl text-xs font-bold leading-relaxed mb-6 border border-emerald-100/60 animate-in fade-in duration-200">
            {message}
          </div>
        )}

        {!isResettingPassword ? (
          <>
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email Input Block */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-700 tracking-wide ml-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4.5 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-13 pr-4.5 py-4 bg-stone-50 border border-stone-200/80 rounded-[20px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/75 focus:bg-white text-[15px] font-medium text-stone-800 placeholder:text-stone-400 transition-all"
                    placeholder="Digite seu e-mail"
                    required
                  />
                </div>
              </div>

              {/* Password Input Block */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-700 tracking-wide ml-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-4.5 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-13 pr-12 py-4 bg-stone-50 border border-stone-200/80 rounded-[20px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/75 focus:bg-white text-[15px] font-medium text-stone-800 placeholder:text-stone-400 transition-all"
                    placeholder="Digite sua senha"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Remember Me and Forgot Password Container */}
              <div className="flex justify-between items-center px-1 py-1 text-sm">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4.5 h-4.5 text-emerald-600 border-stone-300 rounded focus:ring-emerald-500 focus:ring-2 cursor-pointer transition-all"
                  />
                  <span className="text-xs font-semibold text-stone-600 group-hover:text-stone-900 transition-colors">
                    Lembrar de mim
                  </span>
                </label>
                <button 
                  type="button"
                  onClick={() => setIsResettingPassword(true)}
                  className="text-xs font-bold text-stone-90 reliance text-stone-800 hover:text-emerald-600 hover:underline transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>

              {/* Primary Entrar Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-stone-900 hover:bg-stone-800 text-white font-extrabold rounded-[20px] shadow-lg shadow-stone-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-[15px]"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>

            {/* Divider "ou entre com" */}
            <div className="relative my-7">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-100"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-4.5 bg-white text-stone-400 font-semibold uppercase tracking-wider text-[10px]">
                  ou entre com
                </span>
              </div>
            </div>

            {/* Google Circles OAuth Login block matching WhatsApp circle format */}
            <div className="flex justify-center mb-6">
              <button
                onClick={handleGoogleLogin}
                className="w-13 h-13 bg-white border border-stone-200/80 rounded-2xl hover:bg-stone-50 hover:border-stone-300 shadow-xs hover:shadow-md transition-all flex items-center justify-center active:scale-95 group focus:ring-4 focus:ring-emerald-500/10 focus:outline-none"
                title="Logar com Google"
              >
                <Chrome className="w-5.5 h-5.5 text-red-500 group-hover:scale-105 transition-transform" />
              </button>
            </div>

            {/* Footer Cadastre-se */}
            <p className="mt-8 text-center text-stone-500 text-sm">
              Não tem uma conta?{' '}
              <Link to="/register" className="text-emerald-600 font-extrabold hover:text-emerald-700 transition-colors">
                Cadastre-se
              </Link>
            </p>
          </>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-xl font-bold text-stone-900 mb-2 tracking-tight">Recuperar Senha</h2>
            <p className="text-stone-500 text-xs leading-relaxed mb-6">Digite seu e-mail e enviaremos um link para você redefinir sua senha.</p>
            
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-700 tracking-wide ml-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-4.5 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-13 pr-4.5 py-4 bg-stone-50 border border-stone-200/80 rounded-[20px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/75 focus:bg-white text-[15px] font-medium text-stone-800 placeholder:text-stone-400 transition-all"
                    placeholder="Digite seu e-mail"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-emerald-650 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-[20px] shadow-lg shadow-emerald-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-[15px]"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <Send className="w-4.5 h-4.5" />
                    Enviar Link de Recuperação
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsResettingPassword(false);
                  setError('');
                  setMessage('');
                }}
                className="w-full py-3.5 text-stone-650 hover:text-stone-850 font-bold transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar para o Login
              </button>
            </form>
          </div>
        )}

        <div className="mt-7 pt-6 border-t border-stone-100 text-center">
          <Link to="/seja-parceiro" className="text-stone-400 text-[10px] font-extrabold uppercase tracking-widest hover:text-emerald-600 transition-colors">
            Quero vender no Qfomeai
          </Link>
        </div>
      </div>
    </div>
  );
}

