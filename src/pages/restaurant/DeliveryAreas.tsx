import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { deliveryAreaService, DeliveryArea } from '../../services/deliveryAreaService';
import { Plus, Edit2, Trash2, X, AlertCircle, Loader2, MapPin, Save } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { FormField, TextInput, SelectInput, FormModal } from '../../components/ui/FormComponents';

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
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
    setDeleteError(null);
    try {
      await deliveryAreaService.deleteDeliveryArea(restaurantId, areaToDelete.id);
      setIsDeleteModalOpen(false);
      setAreaToDelete(null);
      await fetchDeliveryAreas(restaurantId);
    } catch (err) {
      console.error("Error deleting delivery area:", err);
      setDeleteError("Erro ao excluir bairro.");
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDelete = (area: DeliveryArea) => {
    setAreaToDelete(area);
    setDeleteError(null);
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

      {/* Modal Create / Edit */}
      <FormModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingArea ? 'Editar Bairro de Entrega' : 'Novo Bairro de Entrega'}
        subtitle="Configure a região, taxa de entrega e tempo estimado de entrega"
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
              form="delivery-area-form"
              disabled={saveLoading}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Salvar Bairro</span>
            </button>
          </div>
        }
      >
        <form id="delivery-area-form" onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-2 text-red-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <FormField label="Estado" required>
              <SelectInput
                required
                value={selectedEstadoId}
                onChange={e => { setSelectedEstadoId(e.target.value); setSelectedCidadeId(''); setFormData({...formData, bairro_id: ''}); }}
                disabled={!!restaurantData?.endereco?.estado_id}
              >
                <option value="">Selecione um estado</option>
                {estados.map(e => (
                  <option key={e.id} value={e.id}>{e.nome} ({e.sigla})</option>
                ))}
              </SelectInput>
            </FormField>

            <FormField label="Cidade" required>
              <SelectInput
                required
                value={selectedCidadeId}
                onChange={e => { setSelectedCidadeId(e.target.value); setFormData({...formData, bairro_id: ''}); }}
                disabled={!selectedEstadoId || !!restaurantData?.endereco?.cidade_id}
              >
                <option value="">Selecione uma cidade</option>
                {cidades.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </SelectInput>
            </FormField>

            <FormField label="Bairro" required>
              <SelectInput
                required
                value={formData.bairro_id}
                onChange={e => setFormData({...formData, bairro_id: e.target.value})}
                disabled={!selectedCidadeId}
              >
                <option value="">Selecione um bairro</option>
                {bairros.map(n => (
                  <option key={n.id} value={n.id}>{n.nome}</option>
                ))}
              </SelectInput>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Taxa (R$)" required>
              <TextInput
                type="number"
                step="0.01"
                required
                value={Number.isNaN(formData.taxa_entrega) ? '' : formData.taxa_entrega}
                onChange={e => setFormData({...formData, taxa_entrega: parseFloat(e.target.value)})}
              />
            </FormField>

            <FormField label="Tempo Est." required>
              <TextInput
                type="text"
                placeholder="Ex: 30-40 min"
                required
                value={formData.tempo_entrega}
                onChange={e => setFormData({...formData, tempo_entrega: e.target.value})}
              />
            </FormField>
          </div>
        </form>
      </FormModal>

      {/* Modal de Exclusão */}
      <FormModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setAreaToDelete(null);
        }}
        title="Excluir Bairro de Entrega"
        subtitle="Esta ação removerá permanentemente as taxas configuradas para este bairro"
        icon={Trash2}
        iconBgColor="bg-red-50"
        iconTextColor="text-red-500"
        maxWidth="sm"
        error={deleteError}
        footer={
          <div className="flex w-full gap-3">
            <button
              onClick={() => {
                setIsDeleteModalOpen(false);
                setAreaToDelete(null);
              }}
              className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={saveLoading}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Excluir'}
            </button>
          </div>
        }
      >
        <div className="text-center py-2">
          <p className="text-stone-500 text-sm">
            Tem certeza que deseja excluir o bairro <strong>{areaToDelete?.bairro_nome}</strong>? 
            Esta ação não pode ser desfeita.
          </p>
        </div>
      </FormModal>
    </div>
  );
}
