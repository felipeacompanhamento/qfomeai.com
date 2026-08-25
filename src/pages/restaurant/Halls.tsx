import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Hall } from '../../types/mesas';
import { hallRepository } from '../../domain/hall/hallRepository';
import { 
  PrimaryButton, 
  SecondaryButton, 
  SearchInput, 
  TextInput, 
  TextareaInput, 
  SelectInput, 
  Badge, 
  ConfirmDialog,
  FormModal,
  FormActions
} from '../../components/ui';
import { 
  Plus, 
  Edit2, 
  Power, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  Building, 
  MoreVertical, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  X,
  Layers,
  RefreshCw
} from 'lucide-react';

export default function RestaurantHalls() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  const [halls, setHalls] = useState<Hall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingHall, setEditingHall] = useState<Hall | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sortOrder: 0,
    active: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Active dropdown action menu state for mobile/table
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Confirmation modal state for deactivation
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const loadHalls = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await hallRepository.listHalls(restaurantId);
      setHalls(data);
    } catch (err: any) {
      console.error('Erro ao carregar salões:', err);
      setError(err?.message || 'Ocorreu um erro ao carregar os salões.');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadHalls();
  }, [loadHalls]);

  const handleOpenCreateModal = () => {
    setEditingHall(null);
    const nextSortOrder = halls.length > 0 ? Math.max(...halls.map(h => h.sortOrder || 0)) + 1 : 1;
    setFormData({
      name: '',
      description: '',
      sortOrder: nextSortOrder,
      active: true
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (hall: Hall) => {
    setEditingHall(hall);
    setFormData({
      name: hall.name,
      description: hall.description || '',
      sortOrder: hall.sortOrder ?? 0,
      active: hall.active
    });
    setModalError(null);
    setIsModalOpen(true);
    setActiveMenuId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || isSubmitting) return;

    if (!formData.name.trim()) {
      setModalError('O nome do salão é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      if (editingHall) {
        await hallRepository.updateHall(editingHall.id, restaurantId, {
          name: formData.name.trim(),
          description: formData.description.trim(),
          sortOrder: Number(formData.sortOrder) || 0,
          active: formData.active
        });
      } else {
        await hallRepository.createHall({
          restaurantId,
          name: formData.name.trim(),
          description: formData.description.trim(),
          sortOrder: Number(formData.sortOrder) || 0,
          active: formData.active
        });
      }
      setIsModalOpen(false);
      await loadHalls();
    } catch (err: any) {
      console.error('Erro ao salvar salão:', err);
      setModalError(err?.message || 'Erro ao salvar informações do salão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (hall: Hall) => {
    if (!restaurantId || isProcessingAction) return;

    if (hall.active) {
      // Exibir modal de confirmação para desativar
      setConfirmDeactivateId(hall.id);
      setActiveMenuId(null);
    } else {
      // Ativar diretamente
      setIsProcessingAction(true);
      try {
        await hallRepository.activateHall(hall.id, restaurantId);
        await loadHalls();
      } catch (err: any) {
        alert(err?.message || 'Erro ao ativar salão.');
      } finally {
        setIsProcessingAction(false);
      }
    }
  };

  const confirmDeactivation = async () => {
    if (!restaurantId || !confirmDeactivateId || isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      await hallRepository.deactivateHall(confirmDeactivateId, restaurantId);
      setConfirmDeactivateId(null);
      await loadHalls();
    } catch (err: any) {
      alert(err?.message || 'Erro ao desativar salão.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleMoveOrder = async (hall: Hall, direction: 'up' | 'down') => {
    if (!restaurantId || isProcessingAction) return;

    const currentIndex = halls.findIndex(h => h.id === hall.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= halls.length) return;

    const targetHall = halls[targetIndex];
    setIsProcessingAction(true);

    try {
      // Trocar os sortOrders
      const currentSort = hall.sortOrder ?? currentIndex;
      const targetSort = targetHall.sortOrder ?? targetIndex;

      await Promise.all([
        hallRepository.updateHallSortOrder(hall.id, restaurantId, targetSort),
        hallRepository.updateHallSortOrder(targetHall.id, restaurantId, currentSort)
      ]);

      await loadHalls();
    } catch (err: any) {
      alert(err?.message || 'Erro ao reordenar salões.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const filteredHalls = halls.filter(hall => {
    const matchesSearch = 
      hall.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (hall.description && hall.description.toLowerCase().includes(searchTerm.toLowerCase()));

    if (filterStatus === 'active') return matchesSearch && hall.active;
    if (filterStatus === 'inactive') return matchesSearch && !hall.active;
    return matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Layers className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Salões e Ambientes</h1>
          </div>
          <p className="text-stone-500 text-xs sm:text-sm mt-1">
            Cadastre e organize os ambientes do seu restaurante para distribuição de mesas e comandas.
          </p>
        </div>

        <PrimaryButton
          onClick={handleOpenCreateModal}
          className="shrink-0"
        >
          <Plus className="w-4 h-4 mr-2" />
          <span>Novo Salão</span>
        </PrimaryButton>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <div className="flex-1">
          <SearchInput
            placeholder="Buscar por nome ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <SecondaryButton
            onClick={() => setFilterStatus('all')}
            className={filterStatus === 'all' ? '!bg-stone-800 !text-white' : ''}
          >
            Todos ({halls.length})
          </SecondaryButton>
          <SecondaryButton
            onClick={() => setFilterStatus('active')}
            className={filterStatus === 'active' ? '!bg-emerald-600 !text-white' : ''}
          >
            Ativos ({halls.filter(h => h.active).length})
          </SecondaryButton>
          <SecondaryButton
            onClick={() => setFilterStatus('inactive')}
            className={filterStatus === 'inactive' ? '!bg-amber-600 !text-white' : ''}
          >
            Inativos ({halls.filter(h => !h.active).length})
          </SecondaryButton>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-stone-200 shadow-sm text-stone-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-sm font-medium">Carregando salões...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <p className="font-bold text-red-800 text-sm">Erro ao carregar dados</p>
              <p className="text-red-600 text-xs mt-0.5">{error}</p>
            </div>
          </div>
          <PrimaryButton
            onClick={loadHalls}
            className="!bg-red-600 hover:!bg-red-700 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Tentar Novamente
          </PrimaryButton>
        </div>
      ) : filteredHalls.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-stone-200 shadow-sm">
          <div className="w-12 h-12 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <Building className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-stone-700">Nenhum salão encontrado</h3>
          <p className="text-stone-500 text-xs sm:text-sm mt-1 max-w-sm mx-auto">
            {searchTerm || filterStatus !== 'all'
              ? 'Tente alterar os filtros de busca para encontrar o salão desejado.'
              : 'Você ainda não possui nenhum salão cadastrado. Clique no botão acima para criar o primeiro.'}
          </p>
          {!searchTerm && filterStatus === 'all' && (
            <PrimaryButton
              onClick={handleOpenCreateModal}
              className="mt-4"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Cadastrar Primeiro Salão
            </PrimaryButton>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-16 text-center">Ordem</th>
                  <th className="py-3.5 px-4">Nome do Salão</th>
                  <th className="py-3.5 px-4">Descrição</th>
                  <th className="py-3.5 px-4 w-32 text-center">Status</th>
                  <th className="py-3.5 px-4 w-48 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs text-stone-700">
                {filteredHalls.map((hall, idx) => (
                  <tr key={hall.id} className="hover:bg-stone-50/80 transition-colors">
                    <td className="py-3 px-4 text-center font-bold text-stone-500">
                      <div className="flex items-center justify-center gap-1">
                        <span>{hall.sortOrder ?? idx + 1}</span>
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(hall, 'up')}
                            disabled={idx === 0 || isProcessingAction}
                            className="p-0.5 hover:bg-stone-200 rounded text-stone-500 disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Mover para cima"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(hall, 'down')}
                            disabled={idx === filteredHalls.length - 1 || isProcessingAction}
                            className="p-0.5 hover:bg-stone-200 rounded text-stone-500 disabled:opacity-30 disabled:hover:bg-transparent"
                            title="Mover para baixo"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-bold text-stone-900 break-words max-w-xs">
                      {hall.name}
                    </td>

                    <td className="py-3 px-4 text-stone-500 break-words max-w-sm">
                      {hall.description || <span className="italic text-stone-400">Sem descrição</span>}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <Badge variant={hall.active ? 'success' : 'neutral'}>
                        {hall.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <SecondaryButton
                          onClick={() => handleOpenEditModal(hall)}
                          className="!py-1.5 !px-2.5 text-xs"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          <span>Editar</span>
                        </SecondaryButton>

                        <SecondaryButton
                          onClick={() => handleToggleActive(hall)}
                          disabled={isProcessingAction}
                          className={`!py-1.5 !px-2.5 text-xs ${
                            hall.active
                              ? '!bg-amber-50 hover:!bg-amber-100 !text-amber-700 !border-amber-200'
                              : '!bg-emerald-50 hover:!bg-emerald-100 !text-emerald-700 !border-emerald-200'
                          }`}
                          title={hall.active ? 'Desativar Salão' : 'Ativar Salão'}
                        >
                          <Power className="w-3.5 h-3.5 mr-1" />
                          <span>{hall.active ? 'Desativar' : 'Ativar'}</span>
                        </SecondaryButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="block md:hidden space-y-3">
            {filteredHalls.map((hall, idx) => (
              <div key={hall.id} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-3 relative">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-stone-100 text-stone-600 font-bold text-xs flex items-center justify-center shrink-0">
                      {hall.sortOrder ?? idx + 1}
                    </span>
                    <h3 className="font-bold text-stone-900 text-sm truncate">{hall.name}</h3>
                  </div>

                  <Badge variant={hall.active ? 'success' : 'neutral'}>
                    {hall.active ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                {hall.description && (
                  <p className="text-xs text-stone-500 line-clamp-2 bg-stone-50 p-2 rounded-xl">
                    {hall.description}
                  </p>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-stone-100 gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleMoveOrder(hall, 'up')}
                      disabled={idx === 0 || isProcessingAction}
                      className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg disabled:opacity-30 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Mover para cima"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveOrder(hall, 'down')}
                      disabled={idx === filteredHalls.length - 1 || isProcessingAction}
                      className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg disabled:opacity-30 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Mover para baixo"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <SecondaryButton
                      onClick={() => handleOpenEditModal(hall)}
                      className="!py-1.5 !px-3 text-xs"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1" /> Editar
                    </SecondaryButton>

                    <SecondaryButton
                      onClick={() => handleToggleActive(hall)}
                      disabled={isProcessingAction}
                      className={`!py-1.5 !px-3 text-xs ${
                        hall.active
                          ? '!bg-amber-50 !text-amber-700 !border-amber-200'
                          : '!bg-emerald-50 !text-emerald-700 !border-emerald-200'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5 mr-1" />
                      {hall.active ? 'Desativar' : 'Ativar'}
                    </SecondaryButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Criar/Editar Salão */}
      <FormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingHall ? 'Editar Salão' : 'Novo Salão'}
        icon={Building}
        iconTextColor="text-emerald-600"
        iconBgColor="bg-emerald-50"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {modalError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{modalError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Nome do Salão <span className="text-red-500">*</span>
            </label>
            <TextInput
              required
              placeholder="Ex: Salão Principal, Varanda, Rooftop"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Descrição (opcional)
            </label>
            <TextareaInput
              rows={3}
              placeholder="Ex: Ambiente interno climatizado com capacidade para 20 mesas"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Ordem de Exibição
              </label>
              <TextInput
                type="number"
                min={0}
                value={formData.sortOrder}
                onChange={(e) => setFormData(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Status Inicial
              </label>
              <SelectInput
                value={formData.active ? 'true' : 'false'}
                onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.value === 'true' }))}
              >
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </SelectInput>
            </div>
          </div>

          <FormActions>
            <SecondaryButton
              type="button"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </SecondaryButton>

            <PrimaryButton
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Salvando...
                </>
              ) : (
                <span>{editingHall ? 'Atualizar Salão' : 'Criar Salão'}</span>
              )}
            </PrimaryButton>
          </FormActions>
        </form>
      </FormModal>

      {/* Confirmation Modal for Deactivation */}
      <ConfirmDialog
        isOpen={!!confirmDeactivateId}
        onClose={() => setConfirmDeactivateId(null)}
        onConfirm={confirmDeactivation}
        title="Confirmar Desativação"
        description="Deseja realmente desativar este salão? Ele deixará de ser exibido como ativo no sistema, mas os dados históricos serão preservados."
        confirmLabel="Sim, Desativar Salão"
        cancelLabel="Cancelar"
        type="danger"
        loading={isProcessingAction}
      />
    </div>
  );
}
