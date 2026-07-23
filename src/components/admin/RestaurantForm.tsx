import React, { useState, useEffect } from 'react';
import { X, Store, User, Phone, Mail, FileText, MapPin, Clock, DollarSign, Globe, Save, Loader2, Plus, Trash2 } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import ImageUpload from '../ImageUpload';

export default function RestaurantForm({ restaurant, categories, onSave, onCancel }: any) {
  const [formData, setFormData] = useState(restaurant || {
    nome: '',
    slug: '',
    descricao: '',
    nome_proprietario: '',
    cpf_cnpj: '',
    email: '',
    telefone: '',
    whatsapp: '',
    instagram: '',
    password: '',
    status_operacao_config: 'automatico',
    aceita_entrega: true,
    aceita_retirada: true,
    tempo_min_entrega: 30,
    tempo_max_entrega: 45,
    tempo_max_aceite: 15,
    valor_minimo_pedido: 0,
    valor_minimo_frete_gratis: 0,
    categorias: [],
    endereco: { 
      rua: '', 
      numero: '', 
      complemento: '',
      bairro: '', 
      cidade: '', 
      estado: '', 
      cep: '',
      estado_id: '',
      cidade_id: ''
    }
  });

  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [bairros, setBairros] = useState<any[]>([]);

  const [selectedEstadoId, setSelectedEstadoId] = useState(restaurant?.endereco?.estado_id || '');
  const [selectedCidadeId, setSelectedCidadeId] = useState(restaurant?.endereco?.cidade_id || '');

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <h3 className="text-xl font-bold text-stone-800">{restaurant ? 'Editar Restaurante' : 'Novo Restaurante'}</h3>
          <button onClick={onCancel} className="p-2 hover:bg-stone-200 rounded-xl transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-8 bg-white">
          {/* Dados do Proprietário */}
          <section className="space-y-4">
            <h4 className="font-bold text-stone-800 flex items-center gap-2 border-b border-stone-100 pb-2">
              <User className="w-5 h-5 text-emerald-600" />
              Dados do Proprietário
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Nome do Proprietário</label>
                <input 
                  type="text" 
                  placeholder="Nome completo" 
                  value={formData.nome_proprietario} 
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({
                      ...formData, 
                      nome_proprietario: val,
                      owner_name: val
                    });
                  }}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Telefone / WhatsApp</label>
                <input 
                  type="tel" 
                  placeholder="(00) 00000-0000" 
                  value={formData.telefone} 
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({
                      ...formData, 
                      telefone: val,
                      owner_phone: val
                    });
                  }}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">WhatsApp</label>
                <input 
                  type="tel" 
                  placeholder="(00) 00000-0000" 
                  value={formData.whatsapp} 
                  onChange={e => setFormData({...formData, whatsapp: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Instagram</label>
                <input 
                  type="text" 
                  placeholder="@seurestaurante" 
                  value={formData.instagram} 
                  onChange={e => setFormData({...formData, instagram: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">E-mail</label>
                <input 
                  type="email" 
                  placeholder="seu@email.com" 
                  value={formData.email} 
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({
                      ...formData, 
                      email: val,
                      owner_email: val
                    });
                  }}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  required
                />
              </div>
              {!restaurant && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Senha Inicial</label>
                  <input 
                    type="password" 
                    placeholder="••••••••" 
                    value={formData.password} 
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                    required
                  />
                </div>
              )}
            </div>
          </section>

          {/* Dados do Restaurante */}
          <section className="space-y-4">
            <h4 className="font-bold text-stone-800 flex items-center gap-2 border-b border-stone-100 pb-2">
              <Store className="w-5 h-5 text-emerald-600" />
              Dados do Restaurante
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Nome Fantasia</label>
                <input 
                  type="text" 
                  placeholder="Nome do seu restaurante" 
                  value={formData.nome} 
                  onChange={e => {
                    const val = e.target.value;
                    setFormData({
                      ...formData, 
                      nome: val,
                      nome_fantasia: val,
                      slug: restaurant ? formData.slug : val.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '')
                    });
                  }}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Slug da URL</label>
                <input 
                  type="text" 
                  placeholder="ex: pizzaria-do-ze" 
                  value={formData.slug} 
                  onChange={e => setFormData({...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '')})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">CPF ou CNPJ</label>
                <input 
                  type="text" 
                  placeholder="000.000.000-00" 
                  value={formData.cpf_cnpj} 
                  onChange={e => setFormData({...formData, cpf_cnpj: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Status de Operação</label>
                <select 
                  value={formData.status_operacao_config || 'automatico'}
                  onChange={e => setFormData({...formData, status_operacao_config: e.target.value})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                >
                  <option value="automatico">Automático (Horários)</option>
                  <option value="aberto">Aberto Manualmente</option>
                  <option value="fechado">Fechado Manualmente</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Descrição</label>
              <textarea 
                placeholder="Uma breve descrição do restaurante..." 
                value={formData.descricao} 
                onChange={e => setFormData({...formData, descricao: e.target.value})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                rows={3}
              />
            </div>
          </section>

          {/* Categorias */}
          <section className="space-y-4">
            <h4 className="font-bold text-stone-800 flex items-center gap-2 border-b border-stone-100 pb-2">
              Categorias
            </h4>
            <div className="flex flex-wrap gap-2">
              {categories?.map((cat: any) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    const newCats = formData.categorias?.includes(cat.nome)
                      ? formData.categorias.filter((name: string) => name !== cat.nome)
                      : [...(formData.categorias || []), cat.nome];
                    setFormData({...formData, categorias: newCats});
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    formData.categorias?.includes(cat.nome)
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {cat.nome}
                </button>
              ))}
            </div>
          </section>

          {/* Identidade Visual */}
          {restaurant && (
            <section className="space-y-4">
              <h4 className="font-bold text-stone-800 flex items-center gap-2 border-b border-stone-100 pb-2">
                <Globe className="w-5 h-5 text-emerald-600" />
                Identidade Visual
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <ImageUpload 
                  label="Logo do Restaurante"
                  path={`restaurants/${restaurant.id}/logo`}
                  isLogo={true}
                  currentImageUrl={formData.logoUrl || formData.logo_url}
                  onUploadComplete={(url) => setFormData({...formData, logoUrl: url})}
                />
                <ImageUpload 
                  label="Capa do Restaurante"
                  path={`restaurants/${restaurant.id}/cover`}
                  aspectRatio="video"
                  isCover={true}
                  currentImageUrl={formData.coverUrl || formData.capa_url}
                  onUploadComplete={(url) => setFormData({...formData, coverUrl: url})}
                />
              </div>
            </section>
          )}
          
          {/* Endereço */}
          <section className="space-y-4">
            <h4 className="font-bold text-stone-800 flex items-center gap-2 border-b border-stone-100 pb-2">
              <MapPin className="w-5 h-5 text-emerald-600" />
              Endereço
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* CEP field removed */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Estado</label>
                <select 
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  value={selectedEstadoId}
                  onChange={e => {
                    const id = e.target.value;
                    setSelectedEstadoId(id);
                    setFormData({
                      ...formData, 
                      endereco: {
                        ...formData.endereco, 
                        estado: estados.find(est => est.id === id)?.nome || '',
                        estado_id: id,
                        cidade: '',
                        cidade_id: '',
                        bairro: ''
                      }
                    });
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
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Cidade</label>
                <select 
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  value={selectedCidadeId}
                  onChange={e => {
                    const id = e.target.value;
                    setSelectedCidadeId(id);
                    setFormData({
                      ...formData, 
                      endereco: {
                        ...formData.endereco, 
                        cidade: cidades.find(c => c.id === id)?.nome || '',
                        cidade_id: id,
                        bairro: ''
                      }
                    });
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
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Bairro</label>
                <select 
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  value={formData.endereco.bairro}
                  onChange={e => setFormData({...formData, endereco: {...formData.endereco, bairro: e.target.value}})}
                  required
                  disabled={!selectedCidadeId}
                >
                  <option value="">Selecione o Bairro</option>
                  {bairros.map(b => (
                    <option key={b.id} value={b.nome}>{b.nome}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Rua</label>
                <input 
                  type="text" 
                  placeholder="Nome da rua, avenida, etc" 
                  value={formData.endereco.rua} 
                  onChange={e => setFormData({...formData, endereco: {...formData.endereco, rua: e.target.value}})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Número</label>
                  <input 
                    type="text" 
                    placeholder="123" 
                    value={formData.endereco.numero} 
                    onChange={e => setFormData({...formData, endereco: {...formData.endereco, numero: e.target.value}})}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Complemento</label>
                  <input 
                    type="text" 
                    placeholder="Sala, Loja, etc" 
                    value={formData.endereco.complemento} 
                    onChange={e => setFormData({...formData, endereco: {...formData.endereco, complemento: e.target.value}})}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Operação e Delivery */}
          <section className="space-y-4">
            <h4 className="font-bold text-stone-800 flex items-center gap-2 border-b border-stone-100 pb-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              Operação e Delivery
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <label className="text-xs font-bold text-stone-400 uppercase">Tipos de Atendimento</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={formData.aceita_entrega}
                      onChange={e => setFormData({...formData, aceita_entrega: e.target.checked})}
                      className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-medium text-stone-700">Entrega</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={formData.aceita_retirada}
                      onChange={e => setFormData({...formData, aceita_retirada: e.target.checked})}
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
                    value={formData.tempo_min_entrega}
                    onChange={e => setFormData({...formData, tempo_min_entrega: parseInt(e.target.value)})}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-stone-400 uppercase">Tempo Máx. (min)</label>
                  <input 
                    type="number"
                    value={formData.tempo_max_entrega}
                    onChange={e => setFormData({...formData, tempo_max_entrega: parseInt(e.target.value)})}
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Valor Mínimo Pedido (R$)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={formData.valor_minimo_pedido}
                  onChange={e => setFormData({...formData, valor_minimo_pedido: parseFloat(e.target.value)})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Frete Grátis a partir de (R$)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={formData.valor_minimo_frete_gratis}
                  onChange={e => setFormData({...formData, valor_minimo_frete_gratis: parseFloat(e.target.value)})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>
            </div>
          </section>

          <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
            <Save className="w-6 h-6" />
            {restaurant ? 'Salvar Alterações' : 'Cadastrar Restaurante'}
          </button>
        </form>
      </div>
    </div>
  );
}
