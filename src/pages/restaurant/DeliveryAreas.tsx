import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { deliveryAreaService, DeliveryArea } from '../../services/deliveryAreaService';
import { Plus, Edit2, Trash2, X, AlertCircle, Loader2, MapPin } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export default function DeliveryAreas({ restaurantId: propRestaurantId }: { restaurantId?: string }) {
  const { user, profile } = useAuth();
  const [areas, setAreas] = useState<DeliveryArea[]>([]);
  
  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [bairros, setBairros] = useState<any[]>([]);
  
  const [selectedEstadoId, setSelectedEstadoId] = useState('');
  const [selectedCidadeId, setSelectedCidadeId] = useState('');

  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [areaToDelete, setAreaToDelete] = useState<DeliveryArea | null>(null);
  const [editingArea, setEditingArea] = useState<DeliveryArea | null>(null);
  const [formData, setFormData] = useState({
    bairro_id: '',
    bairro_nome: '',
    taxa_entrega: 0,
    tempo_entrega: '',
    status: 'ativo' as 'ativo' | 'inativo'
  });
  const [error, setError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [restaurantId, setRestaurantId] = useState<string | null>(propRestaurantId || null);
  const [restaurantData, setRestaurantData] = useState<any>(null);

  useEffect(() => {
    if (propRestaurantId) {
      setRestaurantId(propRestaurantId);
    }
  }, [propRestaurantId]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const q = query(collection(db, 'estados'), where('ativo', '==', true));
        const snap = await getDocs(q);
        setEstados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching estados:", error);
      }
    };
    fetchInitialData();
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

  const fetchDeliveryAreas = async (rid: string) => {
    try {
      const data = await deliveryAreaService.getDeliveryAreasByRestaurant(rid);
      setAreas(data);
      setLoading(false);
    } catch (err) {
      console.error("Error loading delivery areas:", err);
      setError("Erro ao carregar dados.");
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      if (!propRestaurantId && !user?.uid) return;
      
      try {
        const rid = propRestaurantId || profile?.restaurantId || (user?.uid ? (await restaurantService.getRestaurantByOwnerId(user.uid))?.id : null);
        if (!rid) {
          setError("Restaurante não encontrado.");
          setLoading(false);
          return;
        }
        setRestaurantId(rid);

        // Fetch restaurant data to get location
        const rDoc = await getDoc(doc(db, 'restaurants', rid));
        if (rDoc.exists()) {
          const rData = rDoc.data();
          setRestaurantData(rData);
          
          if (rData.endereco?.estado_id) {
            setSelectedEstadoId(rData.endereco.estado_id);
          }
          if (rData.endereco?.cidade_id) {
            setSelectedCidadeId(rData.endereco.cidade_id);
          }
        }
        
        fetchDeliveryAreas(rid);
      } catch (err) {
        console.error("Error loading delivery areas:", err);
        setError("Erro ao carregar dados.");
        setLoading(false);
      }
    };

    let unsubscribe: any;
    loadInitialData().then(unsub => unsubscribe = unsub);
    return () => unsubscribe && unsubscribe();
  }, [profile?.restaurantId, user?.uid, propRestaurantId]);

  const handleOpenModal = async (area?: DeliveryArea) => {
    if (area) {
      setEditingArea(area);
      setFormData({
        bairro_id: area.bairro_id || '',
        bairro_nome: area.bairro_nome || '',
        taxa_entrega: area.taxa_entrega,
        tempo_entrega: area.tempo_entrega || '',
        status: area.status
      });
      
      // Fetch the state and city for the selected neighborhood
      if (area.bairro_id) {
        try {
          const bairroDoc = await getDoc(doc(db, 'bairros', area.bairro_id));
          if (bairroDoc.exists()) {
            const bairroData = bairroDoc.data();
            setSelectedCidadeId(bairroData.cidade_id);
            
            const cidadeDoc = await getDoc(doc(db, 'cidades', bairroData.cidade_id));
            if (cidadeDoc.exists()) {
              const cidadeData = cidadeDoc.data();
              setSelectedEstadoId(cidadeData.estado_id);
            }
          }
        } catch (error) {
          console.error("Error fetching location details for editing:", error);
        }
      }
    } else {
      setEditingArea(null);
      setFormData({
        bairro_id: '',
        bairro_nome: '',
        taxa_entrega: 0,
        tempo_entrega: '',
        status: 'ativo'
      });
      setSelectedEstadoId(restaurantData?.endereco?.estado_id || '');
      setSelectedCidadeId(restaurantData?.endereco?.cidade_id || '');
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingArea(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) {
      setError("ID do restaurante não encontrado. Tente recarregar a página.");
      return;
    }
    if (!formData.bairro_id) {
      setError("Por favor, selecione um bairro.");
      return;
    }

    setSaveLoading(true);
    setError(null);

    const bairro = bairros.find(n => n.id === formData.bairro_id);
    const dataToSave = {
      ...formData,
      bairro_nome: bairro?.nome || formData.bairro_nome
    };

    console.log("Saving delivery area:", { restaurantId, dataToSave });

    try {
      if (editingArea?.id) {
        await deliveryAreaService.updateDeliveryArea(restaurantId, editingArea.id, dataToSave);
      } else {
        await deliveryAreaService.createDeliveryArea(restaurantId, dataToSave);
      }
      handleCloseModal();
      await fetchDeliveryAreas(restaurantId);
    } catch (err: any) {
      console.error("Error saving delivery area:", err);
      let message = "Erro ao salvar bairro.";
      try {
        const parsed = JSON.parse(err.message);
        if (parsed.error.includes("permission-denied")) {
          message = "Sem permissão para salvar neste restaurante.";
        } else {
          message = parsed.error;
        }
      } catch (e) {
        message = err.message || message;
      }
      setError(message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurantId || !areaToDelete?.id) return;
    
    setSaveLoading(true);
    try {
      await deliveryAreaService.deleteDeliveryArea(restaurantId, areaToDelete.id);
      setIsDeleteModalOpen(false);
      setAreaToDelete(null);
      await fetchDeliveryAreas(restaurantId);
    } catch (err) {
      console.error("Error deleting delivery area:", err);
      alert("Erro ao excluir bairro.");
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDelete = (area: DeliveryArea) => {
    setAreaToDelete(area);
    setIsDeleteModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Bairros de Entrega</h2>
          <p className="text-stone-500 text-sm">Configure as taxas e tempo para cada bairro.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
        >
          <Plus className="w-5 h-5" />
          Novo Bairro
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-100">
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Bairro</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Taxa</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Tempo Est.</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-stone-400">Carregando...</td></tr>
            ) : areas.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-stone-400">Nenhum bairro cadastrado.</td></tr>
            ) : (
              areas.map(area => (
                <tr key={area.id} className="hover:bg-stone-50/50">
                  <td className="px-6 py-4 font-bold text-stone-800">{area.bairro_nome}</td>
                  <td className="px-6 py-4">R$ {area.taxa_entrega.toFixed(2)}</td>
                  <td className="px-6 py-4">{area.tempo_entrega}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${area.status === 'ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                      {area.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleOpenModal(area)} className="p-2 text-stone-400 hover:text-emerald-600 rounded-xl transition-all"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => confirmDelete(area)} className="p-2 text-stone-400 hover:text-red-600 rounded-xl transition-all"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-stone-800 mb-6">{editingArea ? 'Editar Bairro' : 'Novo Bairro'}</h3>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Estado *</label>
                  <select 
                    required 
                    value={selectedEstadoId} 
                    onChange={e => { setSelectedEstadoId(e.target.value); setSelectedCidadeId(''); setFormData({...formData, bairro_id: ''}); }} 
                    className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl disabled:opacity-60"
                    disabled={!!restaurantData?.endereco?.estado_id}
                  >
                    <option value="">Selecione um estado</option>
                    {estados.map(e => (
                      <option key={e.id} value={e.id}>{e.nome} ({e.sigla})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Cidade *</label>
                  <select 
                    required 
                    value={selectedCidadeId} 
                    onChange={e => { setSelectedCidadeId(e.target.value); setFormData({...formData, bairro_id: ''}); }} 
                    disabled={!selectedEstadoId || !!restaurantData?.endereco?.cidade_id} 
                    className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl disabled:opacity-60"
                  >
                    <option value="">Selecione uma cidade</option>
                    {cidades.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Bairro *</label>
                  <select required value={formData.bairro_id} onChange={e => setFormData({...formData, bairro_id: e.target.value})} disabled={!selectedCidadeId} className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl disabled:opacity-50">
                    <option value="">Selecione um bairro</option>
                    {bairros.map(n => (
                      <option key={n.id} value={n.id}>{n.nome}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Taxa (R$)</label>
                  <input type="number" step="0.01" required value={Number.isNaN(formData.taxa_entrega) ? '' : formData.taxa_entrega} onChange={e => setFormData({...formData, taxa_entrega: parseFloat(e.target.value)})} className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-1">Tempo Est.</label>
                  <input type="text" required value={formData.tempo_entrega} onChange={e => setFormData({...formData, tempo_entrega: e.target.value})} className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl" />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={handleCloseModal} className="flex-1 px-6 py-3 bg-stone-100 text-stone-600 font-bold rounded-2xl">Cancelar</button>
                <button type="submit" disabled={saveLoading} className="flex-1 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl">{saveLoading ? 'Salvando...' : 'Salvar'}</button>
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
                <h3 className="text-xl font-bold text-stone-800">Excluir Bairro</h3>
                <p className="text-stone-500 text-sm mt-1">
                  Tem certeza que deseja excluir o bairro <strong>{areaToDelete?.bairro_nome}</strong>? 
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex w-full gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setAreaToDelete(null);
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
