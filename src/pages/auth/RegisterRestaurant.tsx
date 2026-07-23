import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs, serverTimestamp, getDoc, increment, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, Phone, Store, FileText, Eye, EyeOff, Building2, Check, ArrowLeft, ArrowRight } from 'lucide-react';
import ConsentCheckbox from '../../components/ConsentCheckbox';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/authApi';

export default function RegisterRestaurant() {
  const { user: authUser, refreshProfile, refreshUser } = useAuth();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [personType, setPersonType] = useState<'PF' | 'PJ'>('PJ');
  
  const [nomeProprietario, setNomeProprietario] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [slug, setSlug] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [email, setEmail] = useState(authUser?.email || '');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [instagram, setInstagram] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [consentError, setConsentError] = useState('');
  
  // Endereço
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');

  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [bairros, setBairros] = useState<any[]>([]);

  const [selectedEstadoId, setSelectedEstadoId] = useState('');
  const [selectedCidadeId, setSelectedCidadeId] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEstados = async () => {
      try {
        const q = query(collection(db, 'estados'), where('ativo', '==', true));
        const snap = await getDocs(q);
        setEstados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching estados:", error);
      }
    };
    fetchEstados();
  }, []);

  useEffect(() => {
    if (!selectedEstadoId) {
      setCidades([]);
      return;
    }
    const fetchCidades = async () => {
      try {
        const q = query(collection(db, 'cidades'), where('estado_id', '==', selectedEstadoId), where('ativo', '==', true));
        const snap = await getDocs(q);
        setCidades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching cidades:", error);
      }
    };
    fetchCidades();
  }, [selectedEstadoId]);

  useEffect(() => {
    if (!selectedCidadeId) {
      setBairros([]);
      return;
    }
    const fetchBairros = async () => {
      try {
        const q = query(collection(db, 'bairros'), where('cidade_id', '==', selectedCidadeId), where('ativo', '==', true));
        const snap = await getDocs(q);
        setBairros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching bairros:", error);
      }
    };
    fetchBairros();
  }, [selectedCidadeId]);

  const formatCpfCnpj = (value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length <= 11) {
      return clean
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
        .substring(0, 14);
    } else {
      return clean
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
        .substring(0, 18);
    }
  };

  const formatPhone = (value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length <= 10) {
      return clean
        .replace(/^(\d{2})(\d)/g, '($1) $2')
        .replace(/(\d{4})(\d{4})$/g, '$1-$2')
        .substring(0, 14);
    } else {
      return clean
        .replace(/^(\d{2})(\d)/g, '($1) $2')
        .replace(/(\d{5})(\d{4})$/g, '$1-$2')
        .substring(0, 15);
    }
  };

  const handleNameChange = (val: string) => {
    if (personType === 'PF') {
      setNomeProprietario(val);
      setNomeFantasia(val);
    } else {
      setNomeProprietario(val);
      setNomeFantasia(val);
    }
    
    const generatedSlug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    setSlug(generatedSlug);
  };

  const isStep1Valid = () => {
    const cleanCpfCnpj = cpfCnpj.replace(/\D/g, '');
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (personType === 'PF') {
      if (!nomeProprietario.trim()) return 'Por favor, informe seu nome completo.';
      if (cleanCpfCnpj.length !== 11) return 'Por favor, informe um CPF válido com 11 dígitos.';
    } else {
      if (!nomeFantasia.trim()) return 'Por favor, informe a Razão Social.';
      if (cleanCpfCnpj.length !== 14) return 'Por favor, informe um CNPJ válido com 14 dígitos.';
    }

    if (!email.trim() || !email.includes('@')) return 'Por favor, informe um e-mail válido.';
    if (cleanPhone.length < 10) return 'Por favor, informe um telefone de contato válido.';
    if (!password) return 'Por favor, informe uma senha.';
    if (password.length < 6) return 'A senha deve conter no mínimo 6 caracteres.';
    if (password !== confirmPassword) return 'As senhas não coincidem.';
    
    return null;
  };

  const isStep2Valid = () => {
    if (!selectedEstadoId) return 'Por favor, selecione o Estado.';
    if (!selectedCidadeId) return 'Por favor, selecione a Cidade.';
    if (!bairro) return 'Por favor, selecione o Bairro.';
    if (!rua.trim()) return 'Por favor, informe a Rua.';
    if (!numero.trim()) return 'Por favor, informe o Número.';
    return null;
  };

  const handleNextStep = () => {
    setError('');
    if (currentStep === 1) {
      const step1Error = isStep1Valid();
      if (step1Error) {
        setError(step1Error);
        return;
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const step2Error = isStep2Valid();
      if (step2Error) {
        setError(step2Error);
        return;
      }
      setCurrentStep(3);
    }
  };

  const handlePrevStep = () => {
    setError('');
    if (currentStep === 2) setCurrentStep(1);
    if (currentStep === 3) setCurrentStep(2);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setError('Você precisa aceitar os termos para continuar.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const slugQuery = query(collection(db, 'restaurants'), where('slug', '==', slug.toLowerCase()));
      const slugSnapshot = await getDocs(slugQuery);
      if (!slugSnapshot.empty) {
        setError('Este slug já está sendo usado por outro restaurante. Escolha outro.');
        setLoading(false);
        return;
      }

      let user = authUser;
      if (!user) {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          user = userCredential.user;

          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            nome: nomeProprietario,
            email: email,
            telefone: phone,
            whatsapp: whatsapp || phone,
            instagram: instagram,
            tipo_usuario: 'restaurant',
            restaurantId: user.uid,
            status_conta: 'pendente_aprovacao',
            onboarding_completo: true,
            data_criacao: new Date().toISOString(),
            lgpdAccepted: true,
            acceptedAt: serverTimestamp(),
            termsVersion: "1.0"
          });
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            user = userCredential.user;
            
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists() && userDoc.data().tipo_usuario === 'restaurant') {
              setError('Este e-mail já está cadastrado como restaurante.');
              setLoading(false);
              return;
            }

            await setDoc(doc(db, 'users', user.uid), {
              tipo_usuario: 'restaurant',
              restaurantId: user.uid,
              status_conta: 'pendente_aprovacao',
              onboarding_completo: true,
            }, { merge: true });
          } else {
            throw err;
          }
        }
      } else {
        await setDoc(doc(db, 'users', user.uid), {
          tipo_usuario: 'restaurant',
          restaurantId: user.uid,
          status_conta: 'pendente_aprovacao',
          onboarding_completo: true,
        }, { merge: true });
      }
      localStorage.setItem('lgpdAccepted', 'true');

      await setDoc(doc(db, 'restaurants', user.uid), {
        id: user.uid,
        nome: nomeFantasia,
        slug: slug.toLowerCase(),
        nome_fantasia: nomeFantasia,
        nome_proprietario: nomeProprietario,
        cpf_cnpj: cpfCnpj,
        status_aprovacao: 'pendente_aprovacao',
        status_operacao_config: 'fechado',
        data_criacao: new Date().toISOString(),
        tipo_entrega: 'ambos',
        tempo_max_aceite: 15,
        owner_name: nomeProprietario,
        owner_email: user.email || email,
        owner_phone: phone,
        whatsapp: whatsapp || phone,
        instagram: instagram,
        endereco: {
          rua,
          numero,
          complemento,
          bairro,
          cidade,
          estado
        }
      });

      try {
        await setDoc(doc(db, 'public_stats', 'global'), {
          restaurants: increment(1)
        }, { merge: true });
      } catch (e) {
        console.error("Error incrementing restaurants count:", e);
      }

      if (user && !user.emailVerified) {
        try {
          const emailToSend = user.email || email;
          if (emailToSend) {
            await authApi.sendActivationEmail(emailToSend);
            console.log("E-mail de ativação customizado enviado com sucesso.");
          }
        } catch (emailErr: any) {
          console.error("Erro ao enviar e-mail de ativação via servidor:", emailErr);
        }
      }

      await refreshProfile();
      await refreshUser();
      setSuccess(true);
      
      setTimeout(() => {
        navigate('/profile');
      }, 5000);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso. Tente fazer login ou use outro e-mail.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha é muito fraca. Use pelo menos 6 caracteres.');
      } else if (err.code === 'auth/invalid-email') {
        setError('O e-mail informado é inválido.');
      } else {
        setError('Falha no cadastro. ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col font-sans select-none">
      {/* Header aligned like mockup */}
      <header className="w-full bg-white border-b border-stone-200 py-4 px-6 md:px-12 flex justify-between items-center shrink-0">
        <Link to="/" className="flex items-center gap-2">
          <img 
            src="/logo.png" 
            alt="Logo qFomeai" 
            className="h-12 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </Link>
        <Link 
          to="/login" 
          className="bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition-all shadow-sm"
        >
          Entrar
        </Link>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 py-12 md:py-16">
        <div className="w-full max-w-xl bg-white rounded-3xl border border-stone-150 p-6 md:p-8 shadow-sm flex flex-col">
          
          {/* Visual Custom Progress Stepper */}
          <div className="flex items-center justify-between mb-8 relative px-4">
            {/* Connecting background Line */}
            <div className="absolute left-12 right-12 top-5 h-[2px] bg-stone-100 -z-1" />
            <div 
              className="absolute left-12 top-5 h-[2px] bg-emerald-500 transition-all -z-1 duration-300" 
              style={{ width: `${currentStep === 1 ? '0%' : currentStep === 2 ? '50%' : '100%'}` }}
            />

            {/* Step 1 */}
            <div className="flex flex-col items-center gap-2 z-10">
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep >= 1 
                    ? 'bg-stone-900 text-white ring-4 ring-stone-900/10' 
                    : 'bg-stone-100 text-stone-400'
                }`}
              >
                1
              </div>
              <span className={`text-[10px] uppercase font-bold tracking-wider ${currentStep >= 1 ? 'text-stone-800' : 'text-stone-400'}`}>
                Dados
              </span>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center gap-2 z-10">
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep >= 2 
                    ? 'bg-stone-900 text-white ring-4 ring-stone-900/10' 
                    : 'bg-stone-100 text-stone-400'
                }`}
              >
                2
              </div>
              <span className={`text-[10px] uppercase font-bold tracking-wider ${currentStep >= 2 ? 'text-stone-800' : 'text-stone-400'}`}>
                Endereço
              </span>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center gap-2 z-10">
              <div 
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  currentStep >= 3 
                    ? 'bg-stone-900 text-white ring-4 ring-stone-900/10' 
                    : 'bg-stone-100 text-stone-400'
                }`}
              >
                3
              </div>
              <span className={`text-[10px] uppercase font-bold tracking-wider ${currentStep >= 3 ? 'text-stone-800' : 'text-stone-400'}`}>
                Verificação
              </span>
            </div>
          </div>

          {/* Form Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-stone-900 tracking-tight leading-none mb-1.5">
              Cadastre sua Loja
            </h1>
            <p className="text-xs font-medium text-stone-400">
              Preencha os dados abaixo para começar a vender
            </p>
          </div>

          {/* Error and Success states */}
          {error && (
            <div className="bg-red-50 text-red-600 p-3.5 rounded-2xl text-xs font-semibold mb-6 border border-red-100 flex items-center gap-2 animate-fadeIn">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 text-emerald-700 p-5 rounded-2xl text-xs font-bold mb-6 border border-emerald-100 flex flex-col gap-2">
              <p className="text-base font-black text-emerald-800">Cadastro concluído com sucesso!</p>
              <p>Uma mensagem de ativação foi encaminhada ao e-mail <strong>{email}</strong>.</p>
              <p className="font-medium text-emerald-600/80">Por favor, cheque a caixa de entrada para autorizar seu acesso.</p>
              <p className="text-[10px] text-emerald-500/60 mt-2 italic">Aguarde, redirecionando para a sua conta...</p>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); }} className="space-y-5">
            {/* STEP 1: DADOS */}
            {currentStep === 1 && (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Person Type Toggle Selector */}
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPersonType('PF');
                      setNomeProprietario('');
                      setNomeFantasia('');
                      setCpfCnpj('');
                    }}
                    className={`flex items-center justify-center gap-2 py-4 px-4 rounded-xl border text-xs font-bold transition-all ${
                      personType === 'PF'
                        ? 'border-stone-900 bg-stone-50 text-stone-900'
                        : 'border-stone-200 bg-white text-stone-400 hover:text-stone-600 hover:border-stone-300'
                    }`}
                  >
                    <User className="w-4 h-4 shrink-0" />
                    Pessoa Física
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPersonType('PJ');
                      setNomeProprietario('');
                      setNomeFantasia('');
                      setCpfCnpj('');
                    }}
                    className={`flex items-center justify-center gap-2 py-4 px-4 rounded-xl border text-xs font-bold transition-all ${
                      personType === 'PJ'
                        ? 'border-stone-900 bg-stone-50 text-stone-900'
                        : 'border-stone-200 bg-white text-stone-400 hover:text-stone-600 hover:border-stone-300'
                    }`}
                  >
                    <Building2 className="w-4 h-4 shrink-0" />
                    Pessoa Jurídica
                  </button>
                </div>

                {personType === 'PF' ? (
                  <div className="space-y-3.5">
                    {/* PF Inputs */}
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Nome completo"
                        value={nomeProprietario}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-stone-50/50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-stone-800 transition-all"
                        required
                      />
                    </div>

                    <div className="relative">
                      <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="CPF"
                        value={cpfCnpj}
                        onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
                        className="w-full pl-11 pr-4 py-3 bg-stone-50/50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-stone-800 transition-all"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {/* PJ Inputs */}
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Razão Social"
                        value={nomeFantasia}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-stone-50/50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-stone-800 transition-all"
                        required
                      />
                    </div>

                    <div className="relative">
                      <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="CNPJ"
                        value={cpfCnpj}
                        onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
                        className="w-full pl-11 pr-4 py-3 bg-stone-50/50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-stone-800 transition-all"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Common Step 1 Inputs */}
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                  <input
                    type="email"
                    placeholder="E-mail"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-stone-50/50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-stone-800 transition-all"
                    required
                  />
                </div>

                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                  <input
                    type="tel"
                    placeholder="Telefone/WhatsApp"
                    value={phone}
                    onChange={(e) => {
                      const formatted = formatPhone(e.target.value);
                      setPhone(formatted);
                      setWhatsapp(formatted);
                    }}
                    className="w-full pl-11 pr-4 py-3 bg-stone-50/50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-stone-800 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-11 pr-10 py-3 bg-stone-50/50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-stone-800 transition-all"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-emerald-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 shrink-0" /> : <Eye className="w-4 h-4 shrink-0" />}
                    </button>
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Confirmar senha"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-11 pr-10 py-3 bg-stone-50/50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-stone-800 transition-all"
                      required
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full py-4 bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 mt-6 cursor-pointer select-none"
                >
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>
            )}

            {/* STEP 2: ENDEREÇO */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-fadeIn">
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Estado</label>
                    <select 
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:outline-none focus:border-stone-800 transition-all"
                      value={selectedEstadoId}
                      onChange={e => {
                        setSelectedEstadoId(e.target.value);
                        setEstado(estados.find(est => est.id === e.target.value)?.nome || '');
                        setCidade('');
                        setBairro('');
                        setSelectedCidadeId('');
                      }}
                      required
                    >
                      <option value="">Selecione o Estado</option>
                      {estados.map(e => (
                        <option key={e.id} value={e.id}>{e.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Cidade</label>
                    <select 
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:outline-none focus:border-stone-800 transition-all disabled:opacity-60"
                      value={selectedCidadeId}
                      onChange={e => {
                        setSelectedCidadeId(e.target.value);
                        setCidade(cidades.find(c => c.id === e.target.value)?.nome || '');
                        setBairro('');
                      }}
                      required
                      disabled={!selectedEstadoId}
                    >
                      <option value="">Selecione a Cidade</option>
                      {cidades.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Bairro</label>
                    <select 
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:outline-none focus:border-stone-800 transition-all disabled:opacity-60"
                      value={bairro}
                      onChange={e => setBairro(e.target.value)}
                      required
                      disabled={!selectedCidadeId}
                    >
                      <option value="">Selecione o Bairro</option>
                      {bairros.map(b => (
                        <option key={b.id} value={b.nome}>{b.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Rua</label>
                    <input 
                      type="text" 
                      value={rua} 
                      onChange={e => setRua(e.target.value)} 
                      placeholder="Nome da rua / avenida" 
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-800 transition-all" 
                      required 
                    />
                  </div>

                  <div className="space-y-1 col-span-2 sm:col-span-1 border-t sm:border-t-0 pt-2 sm:pt-0 border-stone-100">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Número</label>
                    <input 
                      type="text" 
                      value={numero} 
                      onChange={e => setNumero(e.target.value)} 
                      placeholder="123, S/N" 
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-800 transition-all" 
                      required 
                    />
                  </div>

                  <div className="space-y-1 col-span-2 sm:col-span-1 pt-0">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">Complemento</label>
                    <input 
                      type="text" 
                      value={complemento} 
                      onChange={e => setComplemento(e.target.value)} 
                      placeholder="Ex: Sala 4, Bloco B" 
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-800 transition-all" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handlePrevStep}
                    className="py-4 border border-stone-200 hover:border-stone-300 text-stone-600 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
                  >
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                    <span>Voltar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="py-4 bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
                  >
                    <span>Continuar</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: CONVERSÃO / VERIFICAÇÃO */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Summary Card */}
                <div className="bg-stone-50 rounded-2xl border border-stone-150 p-4 space-y-3">
                  <h3 className="text-xs font-bold text-stone-805 uppercase tracking-wider border-b border-stone-200 pb-1.5 flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600 font-extrabold shrink-0" />
                    Resumo do Registro
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider">Identificação</span>
                      <span className="font-bold text-stone-750">{personType === 'PF' ? 'Pessoa Física / Autônomo' : 'Pessoa Jurídica / Empresa'}</span>
                    </div>

                    <div>
                      <span className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider">{personType === 'PF' ? 'Nome Completo' : 'Razão Social'}</span>
                      <span className="font-bold text-stone-750 truncate max-w-xs block">{nomeFantasia}</span>
                    </div>

                    <div>
                      <span className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider">{personType === 'PF' ? 'CPF' : 'CNPJ'}</span>
                      <span className="font-semibold text-stone-700 font-mono">{cpfCnpj}</span>
                    </div>

                    <div>
                      <span className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider">E-mail Comercial</span>
                      <span className="font-bold text-stone-750 truncate max-w-xs block">{email}</span>
                    </div>

                    <div className="col-span-1 sm:col-span-2">
                      <span className="block text-[9px] font-extrabold text-stone-400 uppercase tracking-wider">Endereço de Atendimento</span>
                      <span className="font-bold text-stone-750">
                        {rua}, nº {numero} {complemento ? `(${complemento})` : ''} - {bairro}, {cidade} / {estado}
                      </span>
                    </div>
                  </div>
                </div>

                <ConsentCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} error={error} />

                <div className="grid grid-cols-2 gap-3 mt-6">
                  <button
                    type="button"
                    onClick={handlePrevStep}
                    className="py-4 border border-stone-200 hover:border-stone-300 text-stone-600 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
                    disabled={loading}
                  >
                    <ArrowLeft className="w-4 h-4 shrink-0" />
                    <span>Voltar</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRegister}
                    disabled={loading}
                    className="py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
                  >
                    <span>{loading ? 'Cadastrando...' : 'Concluir Cadastro'}</span>
                    <UserPlus className="w-4 h-4 shrink-0" />
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Already have account */}
          <p className="mt-8 text-center text-stone-400 text-xs font-semibold">
            Já tem uma conta?{' '}
            <Link to="/login" className="text-emerald-650 font-black hover:underline cursor-pointer">
              Faça login
            </Link>
          </p>

        </div>
      </main>
    </div>
  );
}
