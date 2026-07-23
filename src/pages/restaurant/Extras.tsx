import React, { useState, useEffect } from 'react';
import { collection, query, where, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService, invalidateRestaurantCache } from '../../services/restaurantService';
import { Plus, Edit2, Trash2, X, Check, AlertCircle, Loader2 } from 'lucide-react';

export default function RestaurantExtras({ adminRestaurantId }: { adminRestaurantId?: string }) {
  const { user, profile } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(adminRestaurantId || null);
  const [extras, setExtras] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [extraToDelete, setExtraToDelete] = useState<any>(null);
  const [editingExtra, setEditingExtra] = useState<any>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    preco: 0,
    categoria_relacionada: [] as string[],
    status: 'ativo'
  });

  useEffect(() => {
    if (adminRestaurantId) {
      setRestaurantId(adminRestaurantId);
      return;
    }
    const init = async () => {
      if (!user?.uid) return;
      
      try {
        const rid = profile?.restaurantId || (await restaurantService.getRestaurantByOwnerId(user.uid))?.id;
        if (rid) {
          setRestaurantId(rid);
        } else {
          setError("Restaurante não encontrado.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Error initializing extras:", err);
        setError("Erro ao identificar restaurante.");
        setLoading(false);
      }
    };
    init();
  }, [profile?.restaurantId, user?.uid, adminRestaurantId]);

  const fetchExtras = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const qExtras = query(
        collection(db, 'restaurants', restaurantId, 'extras'),
        orderBy('created_at', 'desc')
      );
      const snapshot = await getDocs(qExtras);
      const extrasDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setExtras(extrasDocs);
    } catch (err) {
      console.error("Error loading extras data:", err);
      setError("Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!restaurantId) return;

    // Fetch Categories for selection (static fetch is fine for categories here)
    const loadCategories = async () => {
      try {
        const qCats = query(
          collection(db, 'restaurants', restaurantId, 'categories'),
          orderBy('nome', 'asc')
        );
        const catsSnapshot = await getDocs(qCats);
        const catsDocs = catsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setCategories(catsDocs);
      } catch (err) {
        console.error("Error loading categories:", err);
      }
    };
    loadCategories();

    fetchExtras();
  }, [restaurantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || formData.preco < 0 || !restaurantId) return;

    setSaveLoading(true);
    try {
      if (editingExtra) {
        await updateDoc(doc(db, 'restaurants', restaurantId, 'extras', editingExtra.id), {
          ...formData,
          updated_at: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'restaurants', restaurantId, 'extras'), {
          ...formData,
          created_at: serverTimestamp()
        });
      }
      invalidateRestaurantCache(restaurantId);
      await fetchExtras();
      handleCloseModal();
    } catch (error) {
      console.error("Error saving extra:", error);
      alert("Erro ao salvar adicional.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurantId || !extraToDelete) return;
    
    setSaveLoading(true);
    try {
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'extras', extraToDelete.id));
      invalidateRestaurantCache(restaurantId);
      await fetchExtras();
      setIsDeleteModalOpen(false);
      setExtraToDelete(null);
    } catch (error) {
      console.error("Error deleting extra:", error);
      alert("Erro ao excluir adicional.");
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDelete = (extra: any) => {
    setExtraToDelete(extra);
    setIsDeleteModalOpen(true);
  };

  const handleOpenModal = (extra?: any) => {
    if (extra) {
      setEditingExtra(extra);
      setFormData({
        nome: extra.nome,
        preco: extra.preco || 0,
        categoria_relacionada: extra.categoria_relacionada || [],
        status: extra.status || 'ativo'
      });
    } else {
      setEditingExtra(null);
      setFormData({
        nome: '',
        preco: 0,
        categoria_relacionada: [],
        status: 'ativo'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingExtra(null);
    setFormData({ nome: '', preco: 0, categoria_relacionada: [], status: 'ativo' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Adicionais</h2>
          <p className="text-stone-500 text-sm">Gerencie os complementos e adicionais dos seus produtos.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
        >
          <Plus className="w-5 h-5" />
          Novo Adicional
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Preço</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-stone-400">Carregando...</td>
                </tr>
              ) : extras.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-stone-400">Nenhum adicional cadastrado.</td>
                </tr>
              ) : (
                extras.map((extra) => {
                  return (
                    <tr key={extra.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-stone-800">{extra.nome}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-mono text-emerald-600 font-bold">R$ {extra.preco.toFixed(2)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-stone-500">
                          {extra.categoria_relacionada?.length > 0 
                            ? categories.filter(c => extra.categoria_relacionada.includes(c.id)).map(c => c.nome).join(', ') 
                            : 'Geral'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                          extra.status === 'ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                        }`}>
                          {extra.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenModal(extra)}
                            className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(extra)}
                            className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-stone-800">
                {editingExtra ? 'Editar Adicional' : 'Novo Adicional'}
              </h3>
              <button onClick={handleCloseModal} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Nome *</label>
                <input
                  type="text"
                  required
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Bacon Extra, Queijo, Molho Especial"
                  className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Preço (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={Number.isNaN(formData.preco) ? '' : formData.preco}
                  onChange={e => setFormData({ ...formData, preco: parseFloat(e.target.value) })}
                  className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700 mb-2">Categorias Relacionadas</label>
                <div className="space-y-2 max-h-40 overflow-y-auto p-3 bg-stone-50 border border-stone-200 rounded-2xl">
                  {categories.map(cat => (
                    <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.categoria_relacionada.includes(cat.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setFormData({ ...formData, categoria_relacionada: [...formData.categoria_relacionada, cat.id] });
                          } else {
                            setFormData({ ...formData, categoria_relacionada: formData.categoria_relacionada.filter(id => id !== cat.id) });
                          }
                        }}
                        className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-stone-700">{cat.nome}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-stone-400 mt-1">Se nenhuma categoria for selecionada, o adicional será exibido em todos os produtos.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={e => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-6 py-3 bg-stone-100 text-stone-600 font-bold rounded-2xl hover:bg-stone-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex-1 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-stone-800">Excluir Adicional</h3>
                <p className="text-stone-500 text-sm mt-1">
                  Tem certeza que deseja excluir o adicional <strong>{extraToDelete?.nome}</strong>? 
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex w-full gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setExtraToDelete(null);
                  }}
                  className="flex-1 px-4 py-3 bg-stone-100 text-stone-600 font-bold rounded-2xl hover:bg-stone-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saveLoading}
                  className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
