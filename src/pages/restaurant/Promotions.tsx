import React, { useState, useEffect } from 'react';
import { collection, query, addDoc, deleteDoc, doc, serverTimestamp, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { Percent, Plus, Trash2, Calendar, Tag, ShoppingBag, AlertCircle, Loader2, Check, Edit2, ToggleLeft, ToggleRight, Save } from 'lucide-react';
import { FormField, TextInput, SelectInput, FormModal } from '../../components/ui/FormComponents';

interface Promotion {
  id: string;
  tipo_alvo: 'produto' | 'categoria';
  alvo_id: string;
  tipo_desconto: 'porcentagem' | 'valor';
  valor_desconto: number;
  data_validade: string;
  data_inicio: string;
  ativo: boolean;
}

export default function RestaurantPromotions({ adminRestaurantId }: { adminRestaurantId?: string }) {
  const { profile, user, loading: authLoading } = useAuth();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [promotionToDelete, setPromotionToDelete] = useState<Promotion | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(adminRestaurantId || null);

  // Form state
  const [tipoAlvo, setTipoAlvo] = useState<'produto' | 'categoria'>('produto');
  const [alvoId, setAlvoId] = useState('');
  const [tipoDesconto, setTipoDesconto] = useState<'porcentagem' | 'valor'>('porcentagem');
  const [valorDesconto, setValorDesconto] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataValidade, setDataValidade] = useState('');

  const fetchPromotions = async (rid: string) => {
    try {
      const q = query(collection(db, 'restaurants', rid, 'promotions'));
      const snapshot = await getDocs(q);
      setPromotions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Promotion)));
      setLoading(false);
    } catch (err) {
      console.error("Error fetching promotions:", err);
      setError('Erro ao carregar promoções. Verifique suas permissões.');
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      if (adminRestaurantId) {
        setRestaurantId(adminRestaurantId);
        await fetchPromotions(adminRestaurantId);
        try {
          const catsSnap = await getDocs(collection(db, 'restaurants', adminRestaurantId, 'categories'));
          setCategories(catsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          const prodsSnap = await getDocs(collection(db, 'restaurants', adminRestaurantId, 'products'));
          setProducts(prodsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
          console.error("Error loading categories/products for promotions:", err);
        }
        return;
      }

      if (authLoading) return;
      
      if (!user?.uid) {
        setLoading(false);
        setError('Usuário não autenticado.');
        return;
      }

      try {
        const rid = profile?.restaurantId || (await restaurantService.getRestaurantByOwnerId(user.uid))?.id;
        
        if (!rid) {
          setLoading(false);
          setError('Restaurante não encontrado. Verifique se sua conta está configurada corretamente.');
          return;
        }

        setRestaurantId(rid);

        await fetchPromotions(rid);

        // Fetch categories and products for selection
        const fetchTargets = async () => {
          try {
            const catsSnap = await getDocs(collection(db, 'restaurants', rid, 'categories'));
            setCategories(catsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

            const prodsSnap = await getDocs(collection(db, 'restaurants', rid, 'products'));
            setProducts(prodsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          } catch (err) {
            console.error("Error fetching targets:", err);
          }
        };

        fetchTargets();
      } catch (err) {
        console.error("Error initializing promotions:", err);
        setError('Erro ao inicializar página de promoções.');
        setLoading(false);
      }
    };

    init();
  }, [profile?.restaurantId, user?.uid, authLoading, adminRestaurantId]);

  const handleSavePromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !alvoId || !valorDesconto || !dataValidade || !dataInicio) {
      setFormError('Por favor, preencha todos os campos.');
      return;
    }

    setSaveLoading(true);
    setFormError(null);
    try {
      if (editingPromotion) {
        await updateDoc(doc(db, 'restaurants', restaurantId, 'promotions', editingPromotion.id), {
          tipo_alvo: tipoAlvo,
          alvo_id: alvoId,
          tipo_desconto: tipoDesconto,
          valor_desconto: Number(valorDesconto),
          data_inicio: dataInicio,
          data_validade: dataValidade,
        });
      } else {
        await addDoc(collection(db, 'restaurants', restaurantId, 'promotions'), {
          restaurant_id: restaurantId,
          tipo_alvo: tipoAlvo,
          alvo_id: alvoId,
          tipo_desconto: tipoDesconto,
          valor_desconto: Number(valorDesconto),
          data_inicio: dataInicio,
          data_validade: dataValidade,
          ativo: true,
          created_at: serverTimestamp()
        });
      }
      await fetchPromotions(restaurantId);

      setIsAdding(false);
      setEditingPromotion(null);
      setAlvoId('');
      setValorDesconto('');
      setDataInicio('');
      setDataValidade('');
    } catch (error: any) {
      console.error("Error saving promotion:", error);
      setFormError('Erro ao salvar promoção: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setSaveLoading(false);
    }
  };

  const handleEdit = (promo: Promotion) => {
    setFormError(null);
    setEditingPromotion(promo);
    setTipoAlvo(promo.tipo_alvo);
    setAlvoId(promo.alvo_id);
    setTipoDesconto(promo.tipo_desconto);
    setValorDesconto(promo.valor_desconto.toString());
    setDataInicio(promo.data_inicio);
    setDataValidade(promo.data_validade);
    setIsAdding(true);
  };

  const handleToggleStatus = async (promo: Promotion) => {
    if (!restaurantId) return;
    setActionError(null);
    try {
      await updateDoc(doc(db, 'restaurants', restaurantId, 'promotions', promo.id), {
        ativo: !promo.ativo
      });
      await fetchPromotions(restaurantId);
    } catch (error: any) {
      console.error("Error toggling status:", error);
      setActionError('Erro ao alterar status: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const openDeleteModal = (promo: Promotion) => {
    setPromotionToDelete(promo);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!restaurantId || !promotionToDelete) return;
    setSaveLoading(true);
    try {
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'promotions', promotionToDelete.id));
      await fetchPromotions(restaurantId);
      setIsDeleteModalOpen(false);
      setPromotionToDelete(null);
    } catch (error: any) {
      console.error("Error deleting promotion:", error);
    } finally {
      setSaveLoading(false);
    }
  };

  const getAlvoNome = (promo: Promotion) => {
    if (promo.tipo_alvo === 'produto') {
      return products.find(p => p.id === promo.alvo_id)?.nome || 'Produto não encontrado';
    } else {
      return categories.find(c => c.id === promo.alvo_id)?.nome || 'Categoria não encontrada';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-stone-500 animate-pulse">Carregando promoções...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-red-50 border border-red-100 rounded-3xl flex flex-col items-center text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div>
          <h3 className="text-lg font-bold text-red-800">Ops! Algo deu errado</h3>
          <p className="text-red-600">{error}</p>
        </div>
        <button 
          onClick={() => restaurantId && fetchPromotions(restaurantId)}
          className="px-6 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Promoções</h2>
          <p className="text-stone-500 text-sm">Gerencie ofertas especiais para seus clientes.</p>
        </div>
        <button 
          onClick={() => { setIsAdding(!isAdding); setEditingPromotion(null); setFormError(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
        >
          {isAdding ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? 'Cancelar' : 'Nova Promoção'}
        </button>
      </div>

      {actionError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-2xl flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700 text-xs font-bold">
            Fechar
          </button>
        </div>
      )}

      {/* Modal de Promoção */}
      <FormModal
        isOpen={isAdding}
        onClose={() => { setIsAdding(false); setEditingPromotion(null); setFormError(null); }}
        title={editingPromotion ? 'Editar Promoção' : 'Nova Promoção'}
        subtitle="Defina ofertas especiais para seus produtos ou categorias"
        maxWidth="lg"
        error={formError}
        footer={
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={() => { setIsAdding(false); setEditingPromotion(null); }}
              className="flex-1 px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-xl transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="promotion-form"
              disabled={saveLoading}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingPromotion ? 'Atualizar Promoção' : 'Criar Promoção'}
            </button>
          </div>
        }
      >
        <form id="promotion-form" onSubmit={handleSavePromotion} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Tipo de Alvo" required>
              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => { setTipoAlvo('produto'); setAlvoId(''); }}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${tipoAlvo === 'produto' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-100 text-stone-500 hover:border-stone-200 bg-stone-50'}`}
                >
                  Por Produto
                </button>
                <button 
                  type="button"
                  onClick={() => { setTipoAlvo('categoria'); setAlvoId(''); }}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${tipoAlvo === 'categoria' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-100 text-stone-500 hover:border-stone-200 bg-stone-50'}`}
                >
                  Por Categoria
                </button>
              </div>
            </FormField>

            <FormField label={tipoAlvo === 'produto' ? 'Selecionar Produto' : 'Selecionar Categoria'} required>
              <SelectInput 
                value={alvoId}
                onChange={e => setAlvoId(e.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {tipoAlvo === 'produto' ? (
                  products.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)
                ) : (
                  categories.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)
                )}
              </SelectInput>
            </FormField>

            <FormField label="Tipo de Desconto" required>
              <div className="flex gap-4">
                <button 
                  type="button"
                  onClick={() => setTipoDesconto('porcentagem')}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${tipoDesconto === 'porcentagem' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-100 text-stone-500 hover:border-stone-200 bg-stone-50'}`}
                >
                  Porcentagem (%)
                </button>
                <button 
                  type="button"
                  onClick={() => setTipoDesconto('valor')}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${tipoDesconto === 'valor' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-100 text-stone-500 hover:border-stone-200 bg-stone-50'}`}
                >
                  Valor Fixo (R$)
                </button>
              </div>
            </FormField>

            <FormField label="Valor do Desconto" required>
              <TextInput 
                type="number"
                step="0.01"
                value={valorDesconto || ''}
                onChange={e => setValorDesconto(e.target.value)}
                required
                placeholder={tipoDesconto === 'porcentagem' ? 'Ex: 10' : 'Ex: 5.00'}
              />
            </FormField>

            <FormField label="Data de Início" required>
              <TextInput 
                type="datetime-local"
                value={dataInicio || ''}
                onChange={e => setDataInicio(e.target.value)}
                required
              />
            </FormField>

            <FormField label="Data de Validade" required>
              <TextInput 
                type="datetime-local"
                value={dataValidade || ''}
                onChange={e => setDataValidade(e.target.value)}
                required
              />
            </FormField>
          </div>
        </form>
      </FormModal>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {promotions.map(promo => (
          <div key={promo.id} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4 relative group">
            <div className="absolute top-4 right-4 flex gap-1">
              <button 
                onClick={() => handleToggleStatus(promo)}
                className={`p-2 rounded-xl transition-all ${promo.ativo ? 'text-emerald-500 hover:bg-emerald-50' : 'text-stone-400 hover:bg-stone-100'}`}
                title={promo.ativo ? 'Desativar' : 'Ativar'}
              >
                {promo.ativo ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button 
                onClick={() => handleEdit(promo)}
                className="p-2 text-stone-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                title="Editar"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => openDeleteModal(promo)}
                className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${promo.ativo ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                <Percent className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  {promo.tipo_alvo === 'produto' ? 'Promoção de Produto' : 'Promoção de Categoria'}
                </p>
                <h3 className="font-bold text-stone-800 truncate max-w-[180px]">{getAlvoNome(promo)}</h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase">Desconto</p>
                <p className="text-lg font-bold text-emerald-600">
                  {promo.tipo_desconto === 'porcentagem' ? `${promo.valor_desconto}%` : `R$ ${promo.valor_desconto.toFixed(2)}`}
                </p>
              </div>
              <div className="bg-stone-50 p-3 rounded-2xl border border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase">Status</p>
                <p className={`text-sm font-bold ${promo.ativo && new Date(promo.data_validade) > new Date() ? 'text-emerald-600' : 'text-red-500'}`}>
                  {promo.ativo && new Date(promo.data_validade) > new Date() ? 'Ativa' : 'Inativa/Expirada'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-stone-500">
              <Calendar className="w-3 h-3" />
              <span>Válido até: {new Date(promo.data_validade).toLocaleString()}</span>
            </div>
          </div>
        ))}

        {promotions.length === 0 && !isAdding && (
          <div className="col-span-full py-12 bg-white rounded-3xl border border-dashed border-stone-300 text-center">
            <Percent className="w-12 h-12 text-stone-200 mx-auto mb-3" />
            <p className="text-stone-500 font-medium">Nenhuma promoção cadastrada.</p>
            <button 
              onClick={() => setIsAdding(true)}
              className="mt-4 text-emerald-600 font-bold hover:underline"
            >
              Criar minha primeira promoção
            </button>
          </div>
        )}
      </div>

      {/* Modal de Confirmação de Exclusão */}
      <FormModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setPromotionToDelete(null);
        }}
        title="Excluir Promoção"
        subtitle="Confirme a exclusão do desconto/promoção"
        icon={Trash2}
        iconBgColor="bg-red-50"
        iconTextColor="text-red-500"
        maxWidth="sm"
        footer={
          <div className="flex w-full gap-3">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setPromotionToDelete(null);
              }}
              className="flex-1 px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-2xl transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={saveLoading}
              className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Excluir'}
            </button>
          </div>
        }
      >
        <div className="text-center py-2">
          <p className="text-stone-500 text-sm">
            Tem certeza que deseja excluir esta promoção de <strong>{promotionToDelete ? getAlvoNome(promotionToDelete) : ''}</strong>?
            Esta ação não pode ser desfeita.
          </p>
        </div>
      </FormModal>
    </div>
  );
}
