import React, { useState, useEffect } from 'react';
import { collection, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { invalidateRestaurantCache } from '../../services/restaurantService';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { Plus, Edit2, Trash2, X, Save, Loader2, AlertCircle } from 'lucide-react';

export default function RestaurantCategories({ adminRestaurantId }: { adminRestaurantId?: string }) {
  const { profile, user } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<any>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(adminRestaurantId || null);
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    ordem: 0,
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
        console.error("Error initializing categories:", err);
        setError("Erro ao identificar restaurante.");
        setLoading(false);
      }
    };
    init();
  }, [profile?.restaurantId, user?.uid, adminRestaurantId]);

  const loadData = async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'categories')
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setCategories(docs.sort((a: any, b: any) => (a.ordem || 0) - (b.ordem || 0)));
      setLoading(false);
    } catch (err) {
      console.error("Error fetching categories:", err);
      setError("Erro ao carregar categorias. Verifique suas permissões.");
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [restaurantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || !restaurantId) return;

    setSaveLoading(true);
    try {
      const path = `restaurants/${restaurantId}/categories`;
      if (editingCategory) {
        await updateDoc(doc(db, path, editingCategory.id), {
          ...formData,
          updated_at: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, path), {
          ...formData,
          created_at: serverTimestamp()
        });
      }
      handleCloseModal();
      invalidateRestaurantCache(restaurantId);
      loadData();
    } catch (err: any) {
      console.error("Error saving category:", err);
      alert("Erro ao salvar categoria. Verifique se você tem permissão.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurantId || !categoryToDelete) return;
    
    setSaveLoading(true);
    try {
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'categories', categoryToDelete.id));
      setIsDeleteModalOpen(false);
      setCategoryToDelete(null);
      invalidateRestaurantCache(restaurantId);
      loadData();
    } catch (err: any) {
      console.error("Error deleting category:", err);
      alert("Erro ao excluir categoria. Verifique se existem produtos vinculados.");
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDelete = (category: any) => {
    setCategoryToDelete(category);
    setIsDeleteModalOpen(true);
  };

  const handleOpenModal = (category?: any) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        nome: category.nome,
        descricao: category.descricao || '',
        ordem: category.ordem || 0,
        status: category.status || 'ativo'
      });
    } else {
      setEditingCategory(null);
      setFormData({
        nome: '',
        descricao: '',
        ordem: categories.length,
        status: 'ativo'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData({ nome: '', descricao: '', ordem: 0, status: 'ativo' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Categorias</h2>
          <p className="text-stone-500 text-sm">Gerencie as categorias do seu cardápio.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
        >
          <Plus className="w-5 h-5" />
          Nova Categoria
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Ordem</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                    <p className="mt-2 text-stone-400">Carregando categorias...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
                    <p className="mt-2 text-red-500 font-medium">{error}</p>
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-stone-400">Nenhuma categoria cadastrada.</td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono text-stone-400">{cat.ordem}</td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-stone-800">{cat.nome}</p>
                      {cat.descricao && <p className="text-xs text-stone-400">{cat.descricao}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        cat.status === 'ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                      }`}>
                        {cat.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenModal(cat)}
                          className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => confirmDelete(cat)}
                          className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
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
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
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
                  placeholder="Ex: Pizzas, Bebidas, Sobremesas"
                  className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Descrição</label>
                <textarea
                  value={formData.descricao}
                  onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Opcional"
                  className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all h-24 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Ordem</label>
                  <input
                    type="number"
                    value={Number.isNaN(formData.ordem) ? '' : formData.ordem}
                    onChange={e => setFormData({ ...formData, ordem: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
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
                  {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingCategory ? 'Atualizar' : 'Salvar'}
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
                <h3 className="text-xl font-bold text-stone-800">Excluir Categoria</h3>
                <p className="text-stone-500 text-sm mt-1">
                  Tem certeza que deseja excluir a categoria <strong>{categoryToDelete?.nome}</strong>? 
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex w-full gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setCategoryToDelete(null);
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
