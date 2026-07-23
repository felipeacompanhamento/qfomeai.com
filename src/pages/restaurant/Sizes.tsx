import React, { useState, useEffect } from 'react';
import { collection, query, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService, invalidateRestaurantCache } from '../../services/restaurantService';
import { Plus, Edit2, Trash2, X, Save, Loader2, AlertCircle } from 'lucide-react';

export default function RestaurantSizes({ adminRestaurantId }: { adminRestaurantId?: string }) {
  const { profile, user } = useAuth();
  const [sizes, setSizes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [sizeToDelete, setSizeToDelete] = useState<any>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editingSize, setEditingSize] = useState<any>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(adminRestaurantId || null);
  const [formData, setFormData] = useState({
    nome: '',
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
        console.error("Error initializing sizes:", err);
        setError("Erro ao identificar restaurante.");
        setLoading(false);
      }
    };
    init();
  }, [profile?.restaurantId, user?.uid, adminRestaurantId]);

  const fetchSizes = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'sizes'),
        orderBy('ordem', 'asc')
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setSizes(docs);
    } catch (err) {
      console.error("Error loading sizes:", err);
      setError("Erro ao carregar tamanhos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSizes();
  }, [restaurantId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;
    setSaveLoading(true);
    setError(null);

    try {
      if (editingSize) {
        await updateDoc(doc(db, 'restaurants', restaurantId, 'sizes', editingSize.id), {
          ...formData,
          updated_at: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'restaurants', restaurantId, 'sizes'), {
          ...formData,
          created_at: serverTimestamp()
        });
      }
      invalidateRestaurantCache(restaurantId);
      await fetchSizes();
      setIsModalOpen(false);
      setEditingSize(null);
      setFormData({ nome: '', ordem: 0, status: 'ativo' });
    } catch (err) {
      console.error("Error saving size:", err);
      handleFirestoreError(err, editingSize ? OperationType.UPDATE : OperationType.CREATE, `restaurants/${restaurantId}/sizes${editingSize ? '/' + editingSize.id : ''}`);
      setError("Erro ao salvar tamanho.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurantId || !sizeToDelete) return;
    setSaveLoading(true);
    try {
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'sizes', sizeToDelete.id));
      invalidateRestaurantCache(restaurantId);
      await fetchSizes();
      setIsDeleteModalOpen(false);
      setSizeToDelete(null);
    } catch (err) {
      console.error("Error deleting size:", err);
      handleFirestoreError(err, OperationType.DELETE, `restaurants/${restaurantId}/sizes/${sizeToDelete.id}`);
      setError("Erro ao excluir tamanho.");
    } finally {
      setSaveLoading(false);
    }
  };

  const openModal = (size?: any) => {
    if (size) {
      setEditingSize(size);
      setFormData({ nome: size.nome, ordem: size.ordem, status: size.status });
    } else {
      setEditingSize(null);
      setFormData({ nome: '', ordem: sizes.length, status: 'ativo' });
    }
    setIsModalOpen(true);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-stone-800">Tamanhos</h1>
        <button 
          onClick={() => openModal()}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-bold"
        >
          <Plus className="w-5 h-5" /> Novo Tamanho
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-2">
          <AlertCircle className="w-5 h-5" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-10"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-x-auto">
          <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-100">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-bold text-stone-500">Nome</th>
                <th className="px-6 py-3 text-left text-sm font-bold text-stone-500">Ordem</th>
                <th className="px-6 py-3 text-left text-sm font-bold text-stone-500">Status</th>
                <th className="px-6 py-3 text-right text-sm font-bold text-stone-500">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((size) => (
                <tr key={size.id} className="border-b border-stone-50 last:border-0 hover:bg-stone-50">
                  <td className="px-6 py-4 text-stone-800 font-medium">{size.nome}</td>
                  <td className="px-6 py-4 text-stone-600">{size.ordem}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${size.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {size.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <button onClick={() => openModal(size)} className="p-2 text-stone-400 hover:text-emerald-600"><Edit2 className="w-5 h-5" /></button>
                    <button onClick={() => { setSizeToDelete(size); setIsDeleteModalOpen(true); }} className="p-2 text-stone-400 hover:text-red-600"><Trash2 className="w-5 h-5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Edição/Criação */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingSize ? 'Editar Tamanho' : 'Novo Tamanho'}</h2>
            <form onSubmit={handleSave}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Nome</label>
                  <input 
                    type="text" 
                    value={formData.nome} 
                    onChange={e => setFormData({...formData, nome: e.target.value})}
                    className="w-full px-4 py-2 border border-stone-200 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Ordem</label>
                  <input 
                    type="number" 
                    value={formData.ordem} 
                    onChange={e => setFormData({...formData, ordem: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-stone-200 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Status</label>
                  <select 
                    value={formData.status} 
                    onChange={e => setFormData({...formData, status: e.target.value})}
                    className="w-full px-4 py-2 border border-stone-200 rounded-xl"
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-stone-600 font-bold">Cancelar</button>
                <button type="submit" disabled={saveLoading} className="px-6 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold flex items-center gap-2">
                  {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <h2 className="text-xl font-bold mb-4">Excluir Tamanho</h2>
            <p className="text-stone-600 mb-6">Tem certeza que deseja excluir o tamanho "{sizeToDelete?.nome}"?</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-stone-600 font-bold">Cancelar</button>
              <button 
                onClick={handleDelete} 
                disabled={saveLoading}
                className="px-6 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold flex items-center gap-2"
              >
                {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />} Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
