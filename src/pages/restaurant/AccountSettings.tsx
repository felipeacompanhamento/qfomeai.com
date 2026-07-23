import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import ImageUpload from '../../components/ImageUpload';
import { Save, Loader2, MapPin, Phone, Mail, Instagram, Globe, Clock, ShoppingBag, AlertCircle, Check } from 'lucide-react';

export default function AccountSettings() {
  const { profile, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantData, setRestaurantData] = useState<any>(null);

  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [bairros, setBairros] = useState<any[]>([]);
  const [selectedEstadoId, setSelectedEstadoId] = useState<string>('');
  const [selectedCidadeId, setSelectedCidadeId] = useState<string>('');

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
    const init = async () => {
      if (!user?.uid) return;
      
      setLoading(true);
      setError(null);
      try {
        const rid = profile?.restaurantId || (await restaurantService.getRestaurantByOwnerId(user?.uid))?.id;
        if (rid) {
          setRestaurantId(rid);
          const docRef = doc(db, 'restaurants', rid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.id ? { id: docSnap.id, ...docSnap.data() } : docSnap.data();
            setRestaurantData(data);

            // Tentar encontrar os IDs de estado e cidade se já existirem no endereço
            if (data.endereco?.estado) {
              const estQ = query(collection(db, 'estados'), where('nome', '==', data.endereco.estado));
              const estSnap = await getDocs(estQ);
              if (!estSnap.empty) {
                const estId = estSnap.docs[0].id;
                setSelectedEstadoId(estId);

                if (data.endereco?.cidade) {
                  const cidQ = query(collection(db, 'cidades'), where('estado_id', '==', estId), where('nome', '==', data.endereco.cidade));
                  const cidSnap = await getDocs(cidQ);
                  if (!cidSnap.empty) {
                    const cidId = cidSnap.docs[0].id;
                    setSelectedCidadeId(cidId);
                  }
                }
              }
            }
          } else {
            setError("Restaurante não encontrado.");
          }
        } else {
          setError("Restaurante não encontrado.");
        }
      } catch (err: any) {
        console.error("Error fetching restaurant:", err);
        setError("Erro ao carregar dados do restaurante.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [profile?.restaurantId, user?.uid]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !restaurantData) return;

    setSaveLoading(true);
    setSuccess(false);
    setError(null);
    try {
      const { id, logo_url, capa_url, ...data } = restaurantData;
      
      // Garantir que campos obrigatórios pelas regras do Firestore estejam presentes
      const updatePayload = {
        ...data,
        nome: data.nome || data.nome_fantasia || '',
        nome_fantasia: data.nome_fantasia || data.nome || '',
        slug: data.slug || '',
        whatsapp: data.whatsapp || '',
        email: data.email || '',
        cpf_cnpj: data.cpf_cnpj || '',
        updated_at: serverTimestamp(),
        updatedBy: user?.uid,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'restaurants', restaurantId), updatePayload);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error updating restaurant:", err);
      setError('Erro ao atualizar configurações. Verifique se todos os campos obrigatórios estão preenchidos.');
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-stone-500 animate-pulse">Carregando configurações...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-red-500 font-bold">{error}</p>
      </div>
    );
  }

  if (!restaurantData) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h2 className="text-2xl font-bold text-stone-800">Configurações da Conta</h2>
        <p className="text-stone-500 text-sm">Gerencie as informações públicas e operacionais do seu negócio.</p>
      </div>

      <form id="account-settings-form" onSubmit={handleSave} className="space-y-8">
        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 text-sm font-bold">
            <Check className="w-5 h-5 shrink-0" />
            <p>Configurações salvas com sucesso!</p>
          </div>
        )}
        {/* Informações Básicas */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            Informações do Negócio
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Nome do Negócio</label>
              <input 
                value={restaurantData.nome || ''}
                onChange={e => setRestaurantData({...restaurantData, nome: e.target.value})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Ex: Pizzaria do João"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Link da Loja (Slug)</label>
              <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3">
                <span className="text-stone-400 text-sm">qfomeai.com/</span>
                <input 
                  value={restaurantData.slug || ''}
                  onChange={e => setRestaurantData({...restaurantData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                  className="flex-1 py-3 bg-transparent focus:outline-none text-sm"
                  placeholder="pizzaria-do-joao"
                  required
                />
              </div>
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Breve Descrição</label>
              <textarea 
                value={restaurantData.descricao || ''}
                onChange={e => setRestaurantData({...restaurantData, descricao: e.target.value})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 h-24 resize-none"
                placeholder="Conte um pouco sobre seu restaurante..."
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Status de Operação</label>
              <select
                value={restaurantData.status_operacao_config || 'automatico'}
                onChange={e => setRestaurantData({...restaurantData, status_operacao_config: e.target.value})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="automatico">Automático (Horário)</option>
                <option value="aberto">Aberto (Manual)</option>
                <option value="fechado">Fechado (Manual)</option>
              </select>
              <p className="text-xs text-stone-500 mt-1">
                O status automático usa os horários configurados na aba "Horários".
              </p>
            </div>
          </div>
        </section>

        {/* Contato e Redes Sociais */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <Phone className="w-5 h-5 text-emerald-600" />
            Contato e Redes Sociais
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">WhatsApp</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input 
                  value={restaurantData.whatsapp || ''}
                  onChange={e => setRestaurantData({...restaurantData, whatsapp: e.target.value})}
                  className="w-full pl-10 pr-3 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Email de Contato</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input 
                  type="email"
                  value={restaurantData.email || ''}
                  onChange={e => setRestaurantData({...restaurantData, email: e.target.value})}
                  className="w-full pl-10 pr-3 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="contato@restaurante.com"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Instagram</label>
              <div className="relative">
                <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input 
                  value={restaurantData.instagram || ''}
                  onChange={e => setRestaurantData({...restaurantData, instagram: e.target.value})}
                  className="w-full pl-10 pr-3 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="@seurestaurante"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Endereço */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            Endereço da Loja
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Rua</label>
              <input 
                value={restaurantData.endereco?.rua || ''}
                onChange={e => setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, rua: e.target.value}})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Rua das Flores"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Número</label>
              <input 
                value={restaurantData.endereco?.numero || ''}
                onChange={e => setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, numero: e.target.value}})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                placeholder="123"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Estado</label>
              <select 
                value={selectedEstadoId}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedEstadoId(id);
                  const nome = estados.find(est => est.id === id)?.nome || '';
                  setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, estado: nome, cidade: '', bairro: ''}});
                  setSelectedCidadeId('');
                }}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="">Selecione o Estado</option>
                {estados.map(est => (
                  <option key={est.id} value={est.id}>{est.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Cidade</label>
              <select 
                value={selectedCidadeId}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedCidadeId(id);
                  const nome = cidades.find(cid => cid.id === id)?.nome || '';
                  setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, cidade: nome, bairro: ''}});
                }}
                disabled={!selectedEstadoId}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <option value="">Selecione a Cidade</option>
                {cidades.map(cid => (
                  <option key={cid.id} value={cid.id}>{cid.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Bairro</label>
              <select 
                value={restaurantData.endereco?.bairro || ''}
                onChange={e => setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, bairro: e.target.value}})}
                disabled={!selectedCidadeId}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <option value="">Selecione o Bairro</option>
                {bairros.map(b => (
                  <option key={b.id} value={b.nome}>{b.nome}</option>
                ))}
              </select>
            </div>
            {/* CEP field removed */}
          </div>
        </section>

        {/* Operação e Delivery */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            Operação e Delivery
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <label className="text-xs font-bold text-stone-400 uppercase">Tipos de Atendimento</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={restaurantData.aceita_entrega ?? true}
                    onChange={e => setRestaurantData({...restaurantData, aceita_entrega: e.target.checked})}
                    className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-stone-700">Entrega</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={restaurantData.aceita_retirada ?? true}
                    onChange={e => setRestaurantData({...restaurantData, aceita_retirada: e.target.checked})}
                    className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-stone-700">Retirada</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Tempo Mín. (min)</label>
                <input 
                  type="number"
                  value={restaurantData.tempo_min_entrega || ''}
                  onChange={e => setRestaurantData({...restaurantData, tempo_min_entrega: parseInt(e.target.value)})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Tempo Máx. (min)</label>
                <input 
                  type="number"
                  value={restaurantData.tempo_max_entrega || ''}
                  onChange={e => setRestaurantData({...restaurantData, tempo_max_entrega: parseInt(e.target.value)})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="45"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Valor Mínimo Pedido (R$)</label>
              <input 
                type="number"
                step="0.01"
                value={restaurantData.valor_minimo_pedido || ''}
                onChange={e => setRestaurantData({...restaurantData, valor_minimo_pedido: parseFloat(e.target.value)})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                placeholder="20.00"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Frete Grátis a partir de (R$)</label>
              <input 
                type="number"
                step="0.01"
                value={restaurantData.valor_minimo_frete_gratis || ''}
                onChange={e => setRestaurantData({...restaurantData, valor_minimo_frete_gratis: parseFloat(e.target.value)})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                placeholder="100.00"
              />
            </div>
          </div>
        </section>

        {/* Identidade Visual */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" />
              Identidade Visual
            </h3>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider bg-stone-50 px-2 py-1 rounded-lg border border-stone-100">
              Exibido no catálogo e lista de restaurantes
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ImageUpload 
              label="Logo do Restaurante"
              path={`restaurants/${restaurantId}/logo`}
              isLogo={true}
              currentImageUrl={restaurantData.logoUrl}
              onUploadComplete={(url) => setRestaurantData({...restaurantData, logoUrl: url})}
            />
            <ImageUpload 
              label="Capa do Restaurante"
              path={`restaurants/${restaurantId}/cover`}
              aspectRatio="video"
              isCover={true}
              currentImageUrl={restaurantData.coverUrl}
              onUploadComplete={(url) => setRestaurantData({...restaurantData, coverUrl: url})}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <button 
            type="submit"
            disabled={saveLoading}
            className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Salvar Alterações
          </button>
        </div>
      </form>
    </div>
  );
}
