import React, { useState, useEffect } from 'react';
import { collection, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { invalidateRestaurantCache } from '../../services/restaurantService';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { Plus, Edit2, Trash2, X, Save, Loader2, AlertCircle } from 'lucide-react';
import { FormField, TextInput, SelectInput, FormModal } from '../../components/ui/FormComponents';

export default function RestaurantCategories({ adminRestaurantId }: { adminRestaurantId?: string }) {
  const { profile, user } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    setFormError(null);
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
      setFormError("Erro ao salvar categoria. Verifique se você tem permissão.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurantId || !categoryToDelete) return;
    
    setSaveLoading(true);
    setDeleteError(null);
    try {
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'categories', categoryToDelete.id));
      setIsDeleteModalOpen(false);
      setCategoryToDelete(null);
      invalidateRestaurantCache(restaurantId);
      loadData();
    } catch (err: any) {
      console.error("Error deleting category:", err);
      setDeleteError("Erro ao excluir categoria. Verifique se existem produtos vinculados.");
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDelete = (category: any) => {
    setCategoryToDelete(category);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleOpenModal = (category?: any) => {
    setFormError(null);
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
    setFormError(null);
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
      <FormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
        subtitle="Preencha os detalhes da categoria do cardápio"
        maxWidth="md"
        footer={
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={handleCloseModal}
              className="flex-1 px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-xl transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="category-form"
              disabled={saveLoading}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingCategory ? 'Atualizar' : 'Salvar'}
            </button>
          </div>
        }
      >
        <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-2 text-red-700 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <FormField label="Nome" required>
            <TextInput
              type="text"
              required
              value={formData.nome}
              onChange={e => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Ex: Pizzas, Bebidas, Sobremesas"
            />
          </FormField>

          <FormField label="Descrição">
            <textarea
              value={formData.descricao}
              onChange={e => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Opcional"
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 text-sm font-semibold transition-all focus:bg-white focus:outline-none focus:ring-2 focus:border-emerald-500 focus:ring-emerald-500/20 h-24 resize-none"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Ordem">
              <TextInput
                type="number"
                value={Number.isNaN(formData.ordem) ? '' : formData.ordem}
                onChange={e => setFormData({ ...formData, ordem: parseInt(e.target.value) })}
              />
            </FormField>
            <FormField label="Status">
              <SelectInput
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </SelectInput>
            </FormField>
          </div>
        </form>
      </FormModal>

      {/* Modal de Exclusão */}
      <FormModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setCategoryToDelete(null);
        }}
        title="Excluir Categoria"
        subtitle="Confirme a exclusão da categoria"
        icon={Trash2}
        iconBgColor="bg-red-50"
        iconTextColor="text-red-500"
        maxWidth="sm"
        footer={
          <div className="flex w-full gap-3">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setCategoryToDelete(null);
              }}
              className="flex-1 px-4 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-2xl transition-all text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={saveLoading}
              className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Excluir'}
            </button>
          </div>
        }
      >
        <div className="text-center py-2 space-y-3">
          <p className="text-stone-500 text-sm">
            Tem certeza que deseja excluir a categoria <strong>{categoryToDelete?.nome}</strong>? 
            Esta ação não pode ser desfeita.
          </p>

          {deleteError && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-2 text-red-700 text-xs font-semibold text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}
        </div>
      </FormModal>
    </div>
  );
}
