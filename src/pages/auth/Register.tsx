import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../../firebase';
import { useNavigate, Link } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, Phone, Eye, EyeOff } from 'lucide-react';
import ConsentCheckbox from '../../components/ConsentCheckbox';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [referencia, setReferencia] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [bairros, setBairros] = useState<any[]>([]);

  const [selectedEstadoId, setSelectedEstadoId] = useState('');
  const [selectedCidadeId, setSelectedCidadeId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchEstados = async () => {
      try {
        const snap = await getDocs(collection(db, 'estados'));
        setEstados(snap.docs.map(d => ({ id: d.id, ...d.data() as any })).filter(e => e.ativo));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'estados');
      }
    };
    fetchEstados();
  }, []);

  useEffect(() => {
    const fetchCidades = async () => {
      if (!selectedEstadoId) {
        setCidades([]);
        return;
      }
      try {
        const q = query(collection(db, 'cidades'), where('estado_id', '==', selectedEstadoId));
        const snap = await getDocs(q);
        setCidades(snap.docs.map(d => ({ id: d.id, ...d.data() as any })).filter(c => c.ativo));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'cidades');
      }
    };
    fetchCidades();
  }, [selectedEstadoId]);

  useEffect(() => {
    const fetchBairros = async () => {
      if (!selectedCidadeId) {
        setBairros([]);
        return;
      }
      try {
        const q = query(collection(db, 'bairros'), where('cidade_id', '==', selectedCidadeId));
        const snap = await getDocs(q);
        setBairros(snap.docs.map(d => ({ id: d.id, ...d.data() as any })).filter(b => b.ativo));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'bairros');
      }
    };
    fetchBairros();
  }, [selectedCidadeId]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedTerms) {
      setConsentError('Você precisa aceitar os termos para continuar.');
      return;
    }
    setConsentError('');

    const stateName = estado.trim();
    const cityName = cidade.trim();
    const neighborhoodName = bairro.trim();

    if (!stateName || !cityName || !neighborhoodName) {
      setError('Por favor, preencha o Estado, Cidade e Bairro obrigatórios.');
      return;
    }

    const matchedState = estados.find(e => e.id === selectedEstadoId);
    if (!matchedState) {
      setError('O Estado selecionado não foi encontrado ou não está ativo no sistema.');
      return;
    }

    const matchedCity = cidades.find(c => c.id === selectedCidadeId);
    if (!matchedCity) {
      setError('A Cidade selecionada não foi encontrada ou não está cadastrada para o Estado correspondente.');
      return;
    }

    const matchedNeighborhood = bairros.find(b => b.nome.trim().toLowerCase() === neighborhoodName.toLowerCase());
    if (!matchedNeighborhood) {
      setError('O Bairro selecionado não corresponde a nenhum cadastrado no sistema para esta Cidade.');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      try {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          nome: name,
          email: email,
          telefone: phone,
          tipo_usuario: 'cliente',
          status_conta: 'ativo',
          onboarding_completo: true,
          data_criacao: new Date().toISOString(),
          lgpdAccepted: true,
          acceptedAt: serverTimestamp(),
          termsVersion: "1.0"
        });
        localStorage.setItem('lgpdAccepted', 'true');
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
      }

      try {
        await setDoc(doc(db, 'users', user.uid, 'enderecos', 'principal'), {
          rua,
          numero,
          complemento,
          bairro: matchedNeighborhood.nome,
          bairro_id: matchedNeighborhood.id,
          cidade: matchedCity.nome,
          cidade_id: matchedCity.id,
          estado: matchedState.nome,
          estado_id: matchedState.id,
          referencia
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/enderecos/principal`);
      }

      navigate('/');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está em uso. Tente fazer login ou use outro e-mail.');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha é muito fraca. Use pelo menos 6 caracteres.');
      } else if (err.code === 'auth/invalid-email') {
        setError('O e-mail informado é inválido.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('O cadastro por e-mail e senha não está ativado no Firebase. Ative-o no Console do Firebase > Authentication > Sign-in method.');
      } else {
        setError('Falha no cadastro. ' + err.message);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-stone-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-emerald-600 mb-2">Qfomeai</h1>
          <p className="text-stone-500">Crie sua conta e comece a pedir.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-6 border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider ml-1">Nome Completo</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="Seu nome"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider ml-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="seu@email.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider ml-1">Telefone</label>
            <div className="relative">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="(00) 00000-0000"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-12 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-emerald-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-stone-100">
            <h3 className="text-sm font-bold text-stone-800">Endereço de Entrega</h3>
            <div className="grid grid-cols-2 gap-4">
              <select 
                value={selectedEstadoId} 
                onChange={e => {
                  setSelectedEstadoId(e.target.value);
                  setEstado(estados.find(est => est.id === e.target.value)?.nome || '');
                  setSelectedCidadeId('');
                  setCidade('');
                  setBairro('');
                }} 
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl" 
                required
              >
                <option value="">Selecione o Estado</option>
                {estados.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
              <select 
                value={selectedCidadeId} 
                onChange={e => {
                  setSelectedCidadeId(e.target.value);
                  setCidade(cidades.find(c => c.id === e.target.value)?.nome || '');
                  setBairro('');
                }} 
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl" 
                required
                disabled={!selectedEstadoId}
              >
                <option value="">Selecione a Cidade</option>
                {cidades.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <select 
                value={bairro} 
                onChange={e => setBairro(e.target.value)} 
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl col-span-2" 
                required
                disabled={!selectedCidadeId}
              >
                <option value="">Selecione o Bairro</option>
                {bairros.map(b => <option key={b.id} value={b.nome}>{b.nome}</option>)}
              </select>
              <input type="text" value={rua} onChange={e => setRua(e.target.value)} placeholder="Rua" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl col-span-2" required />
              <input type="text" value={numero} onChange={e => setNumero(e.target.value)} placeholder="Número" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl" required />
              <input type="text" value={complemento} onChange={e => setComplemento(e.target.value)} placeholder="Complemento" className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl" />
              <input 
                type="text" 
                value={referencia} 
                onChange={e => setReferencia(e.target.value)} 
                placeholder="Referência (obrigatório)" 
                className="w-full p-3 bg-white border-2 border-emerald-100 rounded-2xl col-span-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder:text-emerald-300" 
                required 
              />
            </div>
          </div>

          <ConsentCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} error={consentError} />

          <button
            type="submit"
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md shadow-emerald-200 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <UserPlus className="w-5 h-5" />
            Criar Conta
          </button>
        </form>

        <p className="mt-8 text-center text-stone-500 text-sm">
          Já tem uma conta?{' '}
          <Link to="/login" className="text-emerald-600 font-bold hover:underline">
            Entrar
          </Link>
        </p>

        <div className="mt-6 pt-6 border-t border-stone-100 text-center">
          <Link to="/register-Restaurante" className="text-stone-400 text-xs font-bold uppercase tracking-widest hover:text-emerald-600 transition-colors">
            Quero vender no Qfomeai
          </Link>
        </div>
      </div>
    </div>
  );
}
