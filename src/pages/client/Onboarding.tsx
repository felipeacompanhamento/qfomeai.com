import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, setDoc, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { useNavigate } from 'react-router-dom';
import { User, Phone, MapPin, Plus, Trash2, LogOut, CheckCircle2 } from 'lucide-react';
import { registerPushNotifications } from '../../firebaseMessaging';

export default function Onboarding() {
  const { user, profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addresses, setAddresses] = useState<any[]>([]);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [bairros, setBairros] = useState<any[]>([]);

  const [selectedEstadoId, setSelectedEstadoId] = useState('');
  const [selectedCidadeId, setSelectedCidadeId] = useState('');

  const [newAddress, setNewAddress] = useState({
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    referencia: ''
  });

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile) {
      // Only set if current state is empty to avoid overwriting user input
      if (!name) setName(profile.nome || '');
      if (!phone) setPhone(profile.telefone || '');
    }
    if (user) {
      fetchAddresses();
    }
  }, [profile, user]);

  const fetchAddresses = async () => {
    if (!user) return;
    try {
      const q = query(collection(db, 'users', user.uid, 'enderecos'));
      const snap = await getDocs(q);
      setAddresses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}/enderecos`);
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const stateName = newAddress.estado.trim();
    const cityName = newAddress.cidade.trim();
    const neighborhoodName = newAddress.bairro.trim();

    if (!stateName || !cityName || !neighborhoodName) {
      setError("O Estado, Cidade e Bairro são campos de preenchimento obrigatório e não podem ser vazios.");
      return;
    }

    const matchedState = estados.find(e => e.id === selectedEstadoId);
    if (!matchedState) {
      setError("O Estado selecionado não foi encontrado ou não é válido.");
      return;
    }

    const matchedCity = cidades.find(c => c.id === selectedCidadeId);
    if (!matchedCity) {
      setError("A Cidade selecionada não foi encontrada ou não é válida.");
      return;
    }

    const matchedNeighborhood = bairros.find(b => b.nome.trim().toLowerCase() === neighborhoodName.toLowerCase());
    if (!matchedNeighborhood) {
      setError("O Bairro selecionado não corresponde a nenhum cadastrado no sistema para esta Cidade.");
      return;
    }

    const addressToSave = {
      ...newAddress,
      estado: matchedState.nome,
      estado_id: matchedState.id,
      cidade: matchedCity.nome,
      cidade_id: matchedCity.id,
      bairro: matchedNeighborhood.nome,
      bairro_id: matchedNeighborhood.id
    };

    try {
      await addDoc(collection(db, 'users', user.uid, 'enderecos'), addressToSave);
      setNewAddress({ rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', referencia: '' });
      setSelectedEstadoId('');
      setSelectedCidadeId('');
      setShowAddAddress(false);
      setError('');
      fetchAddresses();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/enderecos`);
    }
  };

  const handleComplete = async () => {
    if (!name.trim() || !phone.trim()) {
      setError('Nome e telefone são obrigatórios.');
      return;
    }
    if (addresses.length === 0) {
      setError('Você precisa cadastrar pelo menos um endereço.');
      return;
    }

    setLoading(true);
    try {
      const updateData = {
        nome: name,
        telefone: phone,
        onboarding_completo: true
      };
      
      await setDoc(doc(db, 'users', user!.uid), updateData, { merge: true });
      
      // Request notification permission after onboarding
      registerPushNotifications(user!.uid);
      
      // Update local state manually
      updateProfile(updateData);
      
      // Navigate after state update
      navigate('/');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user!.uid}`);
      setError('Erro ao salvar dados: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden">
        <div className="bg-emerald-600 p-8 text-white text-center">
          <h1 className="text-3xl font-bold mb-2">Bem-vindo ao Qfomeai!</h1>
          <p className="opacity-90">Para continuar, precisamos completar seu cadastro.</p>
        </div>

        <div className="p-8 space-y-8">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-sm border border-red-100">
              {error}
            </div>
          )}

          {/* Profile Info */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
              <User className="w-5 h-5 text-emerald-600" />
              Dados Pessoais
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase ml-1">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Seu nome"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase ml-1">Telefone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="(00) 00000-0000"
                    required
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Addresses */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-600" />
                Endereço de Entrega
              </h2>
              {!showAddAddress && (
                <button 
                  onClick={() => setShowAddAddress(true)}
                  className="text-emerald-600 font-bold text-sm flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar
                </button>
              )}
            </div>

            {showAddAddress && (
              <form onSubmit={handleAddAddress} className="p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <input 
                    placeholder="Rua" 
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl"
                    value={newAddress.rua}
                    onChange={e => setNewAddress({...newAddress, rua: e.target.value})}
                    required
                  />
                  <input 
                    placeholder="Número" 
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl"
                    value={newAddress.numero}
                    onChange={e => setNewAddress({...newAddress, numero: e.target.value})}
                    required
                  />
                  <select 
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl"
                    value={selectedEstadoId}
                    onChange={e => {
                      setSelectedEstadoId(e.target.value);
                      setNewAddress({...newAddress, estado: estados.find(est => est.id === e.target.value)?.nome || '', cidade: '', bairro: ''});
                      setSelectedCidadeId('');
                    }}
                    required
                  >
                    <option value="">Selecione o Estado</option>
                    {estados.map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                  <select 
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl"
                    value={selectedCidadeId}
                    onChange={e => {
                      setSelectedCidadeId(e.target.value);
                      setNewAddress({...newAddress, cidade: cidades.find(c => c.id === e.target.value)?.nome || '', bairro: ''});
                    }}
                    required
                    disabled={!selectedEstadoId}
                  >
                    <option value="">Selecione a Cidade</option>
                    {cidades.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <select 
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl"
                    value={newAddress.bairro}
                    onChange={e => setNewAddress({...newAddress, bairro: e.target.value})}
                    required
                    disabled={!selectedCidadeId}
                  >
                    <option value="">Selecione o Bairro</option>
                    {bairros.map(b => (
                      <option key={b.id} value={b.nome}>{b.nome}</option>
                    ))}
                  </select>
                  <input 
                    placeholder="Referência (obrigatório)" 
                    className="w-full p-3 bg-white border-2 border-emerald-100 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder:text-emerald-300"
                    value={newAddress.referencia}
                    onChange={e => setNewAddress({...newAddress, referencia: e.target.value})}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl">Salvar Endereço</button>
                  <button type="button" onClick={() => setShowAddAddress(false)} className="px-6 py-3 bg-stone-200 text-stone-600 font-bold rounded-xl">Cancelar</button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {addresses.map(addr => (
                <div key={addr.id} className="flex items-center justify-between p-4 rounded-2xl border border-stone-100 bg-white">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-stone-400" />
                    <div>
                      <p className="font-bold text-stone-800">{addr.rua}, {addr.numero}</p>
                      <p className="text-sm text-stone-500">{addr.bairro}</p>
                    </div>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                </div>
              ))}
              {addresses.length === 0 && !showAddAddress && (
                <div className="text-center py-8 border-2 border-dashed border-stone-200 rounded-3xl text-stone-400">
                  Nenhum endereço cadastrado ainda.
                </div>
              )}
            </div>
          </section>

          <div className="pt-6 border-t border-stone-100 flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => auth.signOut()}
              className="px-8 py-4 bg-stone-100 text-stone-600 font-bold rounded-2xl hover:bg-stone-200 transition-all flex items-center justify-center gap-2"
            >
              <LogOut className="w-5 h-5" />
              Sair
            </button>
            <button 
              onClick={handleComplete}
              disabled={loading}
              className="flex-1 py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? 'Salvando...' : 'Concluir Cadastro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
