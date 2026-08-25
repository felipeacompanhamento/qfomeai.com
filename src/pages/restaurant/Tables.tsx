import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Hall, Table, TableStatus } from '../../types/mesas';
import { hallRepository } from '../../domain/hall/hallRepository';
import { tableRepository } from '../../domain/table/tableRepository';
import { 
  PrimaryButton, 
  SecondaryButton, 
  SearchInput, 
  TextInput, 
  SelectInput, 
  Badge, 
  ConfirmDialog,
  FormModal,
  FormField,
  FormLabel,
  FormActions
} from '../../components/ui';
import { 
  Plus, 
  Edit2, 
  Power, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  UtensilsCrossed, 
  Users, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  X,
  Building,
  RefreshCw,
  QrCode
} from 'lucide-react';

export default function RestaurantTables() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  // Data states
  const [halls, setHalls] = useState<Hall[]>([]);
  const [selectedHallId, setSelectedHallId] = useState<string>('all');
  const [tables, setTables] = useState<Table[]>([]);
  const [loadingHalls, setLoadingHalls] = useState(true);
  const [loadingTables, setLoadingTables] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [formData, setFormData] = useState({
    hallId: '',
    name: '',
    number: '' as string | number,
    capacity: 4,
    status: TableStatus.AVAILABLE,
    sortOrder: 0,
    active: true
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Confirmation modal state for deactivation
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Load Halls
  const loadHalls = useCallback(async () => {
    if (!restaurantId) return;
    setLoadingHalls(true);
    try {
      const data = await hallRepository.listHalls(restaurantId);
      // Filter active halls for selection when creating tables
      setHalls(data);
    } catch (err: any) {
      console.error('Erro ao carregar salões:', err);
      setError(err?.message || 'Erro ao carregar os salões.');
    } finally {
      setLoadingHalls(false);
    }
  }, [restaurantId]);

  // Load Tables
  const loadTables = useCallback(async () => {
    if (!restaurantId) return;
    setLoadingTables(true);
    setError(null);
    try {
      let data: Table[];
      if (selectedHallId === 'all') {
        data = await tableRepository.listTablesByRestaurant(restaurantId);
      } else {
        data = await tableRepository.listTablesByHall(selectedHallId, restaurantId);
      }
      setTables(data);
    } catch (err: any) {
      console.error('Erro ao carregar mesas:', err);
      setError(err?.message || 'Erro ao carregar as mesas.');
    } finally {
      setLoadingTables(false);
    }
  }, [restaurantId, selectedHallId]);

  useEffect(() => {
    loadHalls();
  }, [loadHalls]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const activeHalls = halls.filter(h => h.active);

  const handleOpenCreateModal = () => {
    if (activeHalls.length === 0) {
      alert('Você precisa ter pelo menos um Salão ativo cadastrado para criar mesas.');
      return;
    }

    setEditingTable(null);
    const defaultHall = selectedHallId !== 'all' && activeHalls.some(h => h.id === selectedHallId)
      ? selectedHallId
      : activeHalls[0].id;

    const hallTables = tables.filter(t => t.hallId === defaultHall);
    const nextSortOrder = hallTables.length > 0 ? Math.max(...hallTables.map(t => t.sortOrder || 0)) + 1 : 1;
    const nextNumber = hallTables.length + 1;

    setFormData({
      hallId: defaultHall,
      name: `Mesa ${nextNumber}`,
      number: nextNumber,
      capacity: 4,
      status: TableStatus.AVAILABLE,
      sortOrder: nextSortOrder,
      active: true
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (table: Table) => {
    setEditingTable(table);
    setFormData({
      hallId: table.hallId,
      name: table.name,
      number: table.number !== undefined ? table.number : '',
      capacity: table.capacity || 4,
      status: table.status || TableStatus.AVAILABLE,
      sortOrder: table.sortOrder ?? 0,
      active: table.active
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || isSubmitting) return;

    if (!formData.hallId) {
      setModalError('Selecione um Salão válido.');
      return;
    }

    if (!formData.name.trim()) {
      setModalError('O nome da mesa é obrigatório.');
      return;
    }

    const numCapacity = Number(formData.capacity);
    if (isNaN(numCapacity) || numCapacity <= 0) {
      setModalError('A capacidade da mesa deve ser maior que zero.');
      return;
    }

    // Validar duplicidade dentro do mesmo salão
    const targetHallId = formData.hallId;
    const trimmedName = formData.name.trim().toLowerCase();
    const numValue = formData.number !== '' ? Number(formData.number) : undefined;

    const existingInHall = tables.filter(t => t.hallId === targetHallId && t.id !== editingTable?.id);
    const nameDuplicate = existingInHall.some(t => t.name.trim().toLowerCase() === trimmedName);
    const numberDuplicate = numValue !== undefined && existingInHall.some(t => t.number === numValue);

    if (nameDuplicate) {
      setModalError(`Já existe uma mesa com o nome "${formData.name.trim()}" neste salão.`);
      return;
    }

    if (numberDuplicate) {
      setModalError(`Já existe uma mesa com o número "${numValue}" neste salão.`);
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      if (editingTable) {
        await tableRepository.updateTable(editingTable.id, restaurantId, {
          hallId: targetHallId,
          name: formData.name.trim(),
          number: numValue,
          capacity: numCapacity,
          status: formData.status,
          sortOrder: Number(formData.sortOrder) || 0,
          active: formData.active
        });
      } else {
        await tableRepository.createTable({
          restaurantId,
          hallId: targetHallId,
          name: formData.name.trim(),
          number: numValue,
          capacity: numCapacity,
          status: formData.status,
          sortOrder: Number(formData.sortOrder) || 0,
          active: formData.active
        });
      }

      setIsModalOpen(false);
      await loadTables();
    } catch (err: any) {
      console.error('Erro ao salvar mesa:', err);
      setModalError(err?.message || 'Erro ao salvar informações da mesa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (table: Table) => {
    if (!restaurantId || isProcessingAction) return;

    if (table.active) {
      // Exibir modal de confirmação para desativar
      setConfirmDeactivateId(table.id);
    } else {
      // Ativar diretamente
      setIsProcessingAction(true);
      try {
        await tableRepository.activateTable(table.id, restaurantId);
        await loadTables();
      } catch (err: any) {
        alert(err?.message || 'Erro ao ativar mesa.');
      } finally {
        setIsProcessingAction(false);
      }
    }
  };

  const confirmDeactivation = async () => {
    if (!restaurantId || !confirmDeactivateId || isProcessingAction) return;
    setIsProcessingAction(true);
    try {
      await tableRepository.deactivateTable(confirmDeactivateId, restaurantId);
      setConfirmDeactivateId(null);
      await loadTables();
    } catch (err: any) {
      alert(err?.message || 'Erro ao desativar mesa.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleMoveOrder = async (table: Table, direction: 'up' | 'down') => {
    if (!restaurantId || isProcessingAction) return;

    // Reordenar dentro do escopo exibido
    const hallTables = tables.filter(t => selectedHallId === 'all' || t.hallId === selectedHallId);
    const currentIndex = hallTables.findIndex(t => t.id === table.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= hallTables.length) return;

    const targetTable = hallTables[targetIndex];
    setIsProcessingAction(true);

    try {
      const currentSort = table.sortOrder ?? currentIndex;
      const targetSort = targetTable.sortOrder ?? targetIndex;

      await Promise.all([
        tableRepository.updateTableSortOrder(table.id, restaurantId, targetSort),
        tableRepository.updateTableSortOrder(targetTable.id, restaurantId, currentSort)
      ]);

      await loadTables();
    } catch (err: any) {
      alert(err?.message || 'Erro ao reordenar mesas.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Status mapping badge helper
  const getTableStatusBadge = (status: TableStatus) => {
    switch (status) {
      case TableStatus.AVAILABLE:
        return <Badge variant="success">Disponível</Badge>;
      case TableStatus.OCCUPIED:
        return <Badge variant="danger">Ocupada</Badge>;
      case TableStatus.RESERVED:
        return <Badge variant="warning">Reservada</Badge>;
      case TableStatus.WAITING_PAYMENT:
        return <Badge variant="warning">Aguardando Pagamento</Badge>;
      case TableStatus.CLEANING:
        return <Badge variant="info">Limpeza</Badge>;
      case TableStatus.DISABLED:
        return <Badge variant="neutral">Indisponível</Badge>;
      default:
        return <Badge variant="neutral">Livre</Badge>;
    }
  };

  const filteredTables = tables.filter(table => {
    const matchesSearch = 
      table.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (table.number !== undefined && table.number.toString().includes(searchTerm));

    if (filterStatus === 'active') return matchesSearch && table.active;
    if (filterStatus === 'inactive') return matchesSearch && !table.active;
    return matchesSearch;
  });

  const getHallName = (hallId: string) => {
    const hall = halls.find(h => h.id === hallId);
    return hall ? hall.name : 'Salão';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Gerenciamento de Mesas</h1>
          </div>
          <p className="text-stone-500 text-xs sm:text-sm mt-1">
            Cadastre, ordene e configure a capacidade das mesas em cada salão.
          </p>
        </div>

        <PrimaryButton
          onClick={handleOpenCreateModal}
          disabled={activeHalls.length === 0}
          icon={<Plus className="w-4 h-4" />}
          className="shrink-0"
        >
          Nova Mesa
        </PrimaryButton>
      </div>

      {/* Hall Selector Tabs & Filter Bar */}
      <div className="space-y-3">
        {/* Hall Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedHallId('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              selectedHallId === 'all'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Todos os Salões ({halls.length})</span>
          </button>

          {halls.map(hall => (
            <button
              type="button"
              key={hall.id}
              onClick={() => setSelectedHallId(hall.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                selectedHallId === hall.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              <span>{hall.name}</span>
              {!hall.active && (
                <span className="px-1.5 py-0.2 text-xs bg-amber-100 text-amber-800 rounded font-normal">inativo</span>
              )}
            </button>
          ))}
        </div>

        {/* Search and Active/Inactive Filter */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-4 rounded-2xl border border-stone-200 shadow-xs">
          <div className="flex-1">
            <SearchInput
              placeholder="Buscar por nome ou número..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterStatus === 'all'
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Todas ({tables.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterStatus === 'active'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Ativas ({tables.filter(t => t.active).length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('inactive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filterStatus === 'inactive'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Inativas ({tables.filter(t => !t.active).length})
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loadingTables || loadingHalls ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-stone-200 shadow-xs text-stone-400 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-sm font-medium">Carregando mesas...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <p className="font-bold text-red-800 text-sm">Erro ao carregar mesas</p>
              <p className="text-red-600 text-xs mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadTables}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-bold text-xs rounded-xl hover:bg-red-700 transition-all shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Tentar Novamente
          </button>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-stone-200 shadow-xs">
          <div className="w-12 h-12 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-stone-700">Nenhuma mesa encontrada</h3>
          <p className="text-stone-500 text-xs sm:text-sm mt-1 max-w-sm mx-auto">
            {searchTerm || filterStatus !== 'all'
              ? 'Tente alterar os filtros de busca para encontrar as mesas desejadas.'
              : selectedHallId !== 'all'
              ? 'Este salão ainda não possui mesas cadastradas.'
              : 'Você ainda não possui mesas cadastradas.'}
          </p>
          {!searchTerm && filterStatus === 'all' && activeHalls.length > 0 && (
            <PrimaryButton
              onClick={handleOpenCreateModal}
              icon={<Plus className="w-4 h-4" />}
              className="mt-4"
            >
              Cadastrar Primeira Mesa
            </PrimaryButton>
          )}
        </div>
      ) : (
        /* Responsive Grid: 2 per row on small mobile min-[400px], 3-4 on tablet/desktop */
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filteredTables.map((table, idx) => (
            <div
              key={table.id}
              className={`bg-white rounded-2xl border p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative ${
                !table.active ? 'opacity-70 border-stone-200 bg-stone-50/50' : 'border-stone-200'
              }`}
            >
              {/* Card Header */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-bold tracking-wider text-stone-400 block truncate">
                      {getHallName(table.hallId)}
                    </span>
                    <h3 className="font-bold text-stone-900 text-base truncate mt-0.5">
                      {table.name}
                    </h3>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {getTableStatusBadge(table.status)}
                    <Badge variant={table.active ? 'success' : 'neutral'}>
                      {table.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                </div>

                {/* Capacity info */}
                <div className="flex items-center gap-3 pt-2 text-stone-600 text-xs">
                  <div className="flex items-center gap-1.5 bg-stone-100 px-2.5 py-1 rounded-lg">
                    <Users className="w-3.5 h-3.5 text-stone-500" />
                    <span className="font-bold">{table.capacity} pessoas</span>
                  </div>

                  {table.number !== undefined && (
                    <div className="text-stone-400 text-xs font-medium">
                      Nº {table.number}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center justify-between pt-4 mt-3 border-t border-stone-100 gap-2">
                {/* Reorder Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleMoveOrder(table, 'up')}
                    disabled={idx === 0 || isProcessingAction}
                    className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg disabled:opacity-30 min-h-[36px] min-w-[36px] flex items-center justify-center transition-all cursor-pointer"
                    title="Mover para cima"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveOrder(table, 'down')}
                    disabled={idx === filteredTables.length - 1 || isProcessingAction}
                    className="p-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg disabled:opacity-30 min-h-[36px] min-w-[36px] flex items-center justify-center transition-all cursor-pointer"
                    title="Mover para baixo"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Edit & Toggle Status */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(table)}
                    className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs transition-all min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                    title="Editar mesa"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleActive(table)}
                    disabled={isProcessingAction}
                    className={`p-2 rounded-xl font-bold text-xs transition-all min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer ${
                      table.active
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                    }`}
                    title={table.active ? 'Desativar Mesa' : 'Ativar Mesa'}
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar/Editar Mesa */}
      {isModalOpen && (
        <FormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingTable ? 'Editar Mesa' : 'Nova Mesa'}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <FormField>
              <FormLabel required>Salão</FormLabel>
              <SelectInput
                required
                value={formData.hallId}
                onChange={(e) => setFormData(prev => ({ ...prev, hallId: e.target.value }))}
              >
                <option value="" disabled>Selecione um Salão</option>
                {activeHalls.map(hall => (
                  <option key={hall.id} value={hall.id}>
                    {hall.name}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField>
                <FormLabel required>Nome da Mesa</FormLabel>
                <TextInput
                  required
                  placeholder="Ex: Mesa 01"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </FormField>

              <FormField>
                <FormLabel>Número (opcional)</FormLabel>
                <TextInput
                  type="number"
                  min={1}
                  placeholder="Ex: 1"
                  value={formData.number}
                  onChange={(e) => setFormData(prev => ({ ...prev, number: e.target.value }))}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField>
                <FormLabel required>Capacidade (Lugares)</FormLabel>
                <TextInput
                  type="number"
                  required
                  min={1}
                  value={formData.capacity}
                  onChange={(e) => setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 1 }))}
                />
              </FormField>

              <FormField>
                <FormLabel>Status Atual</FormLabel>
                <SelectInput
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as TableStatus }))}
                >
                  <option value={TableStatus.AVAILABLE}>Disponível</option>
                  <option value={TableStatus.OCCUPIED}>Ocupada</option>
                  <option value={TableStatus.RESERVED}>Reservada</option>
                  <option value={TableStatus.WAITING_PAYMENT}>Aguardando Pagamento</option>
                  <option value={TableStatus.CLEANING}>Limpeza</option>
                  <option value={TableStatus.DISABLED}>Indisponível</option>
                </SelectInput>
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField>
                <FormLabel>Ordem de Exibição</FormLabel>
                <TextInput
                  type="number"
                  min={0}
                  value={formData.sortOrder}
                  onChange={(e) => setFormData(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </FormField>

              <FormField>
                <FormLabel>Situação da Mesa</FormLabel>
                <SelectInput
                  value={formData.active ? 'true' : 'false'}
                  onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.value === 'true' }))}
                >
                  <option value="true">Ativa</option>
                  <option value="false">Inativa</option>
                </SelectInput>
              </FormField>
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
                {isSubmitting ? 'Salvando...' : (editingTable ? 'Atualizar Mesa' : 'Criar Mesa')}
              </PrimaryButton>
            </FormActions>
          </form>
        </FormModal>
      )}

      {/* Confirmation Modal for Deactivation */}
      {confirmDeactivateId && (
        <ConfirmDialog
          isOpen={!!confirmDeactivateId}
          onClose={() => setConfirmDeactivateId(null)}
          onConfirm={confirmDeactivation}
          title="Confirmar Desativação da Mesa"
          description="Deseja realmente desativar esta mesa? Ela deixará de aparecer no atendimento ativo, mas seus registros serão preservados."
          confirmLabel="Sim, Desativar Mesa"
          cancelLabel="Cancelar"
          type="danger"
        />
      )}
    </div>
  );
}

