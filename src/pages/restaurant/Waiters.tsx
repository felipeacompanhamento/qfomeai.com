import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { 
  waiterService, 
  Waiter, 
  WaiterPermissions, 
  WaiterStatus, 
  DEFAULT_WAITER_PERMISSIONS 
} from '../../services/waiterService';
import { 
  Users, 
  UserPlus, 
  Search, 
  Check, 
  X, 
  Edit2, 
  ShieldCheck, 
  Phone, 
  Mail, 
  Lock, 
  Loader2, 
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Ban,
  Save
} from 'lucide-react';
import { FormField, TextInput, SelectInput, FormModal } from '../../components/ui/FormComponents';

export default function WaitersPage() {
  const { user, profile } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // Data states
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WaiterStatus>('all');

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingWaiter, setEditingWaiter] = useState<Waiter | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [status, setStatus] = useState<WaiterStatus>('ACTIVE');
  const [permissions, setPermissions] = useState<WaiterPermissions>(DEFAULT_WAITER_PERMISSIONS);

  // Status Change Confirmation Modal
  const [statusModalWaiter, setStatusModalWaiter] = useState<Waiter | null>(null);
  const [targetStatus, setTargetStatus] = useState<WaiterStatus>('ACTIVE');
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusModalError, setStatusModalError] = useState<string | null>(null);

  // Init restaurant ID
  useEffect(() => {
    const init = async () => {
      try {
        const rid = profile?.restaurantId || (user?.uid ? (await restaurantService.getRestaurantByOwnerId(user.uid))?.id : null);
        if (rid) {
          setRestaurantId(rid);
        } else {
          setError("Restaurante não identificado.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Error identifying restaurant for waiters:", err);
        setError("Erro ao identificar o restaurante.");
        setLoading(false);
      }
    };
    init();
  }, [profile?.restaurantId, user?.uid]);

  // Load waiters
  const loadWaiters = async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await waiterService.getWaiters(restaurantId);
      setWaiters(data);
    } catch (err: any) {
      console.error("Error loading waiters list:", err);
      setError(err.message || "Não foi possível carregar a lista de garçons.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restaurantId) {
      loadWaiters();
    }
  }, [restaurantId]);

  // Open modal for Create or Edit
  const handleOpenModal = (waiter?: Waiter) => {
    setFormError(null);
    if (waiter) {
      setEditingWaiter(waiter);
      setName(waiter.name || '');
      setEmail(waiter.email || '');
      setPassword('');
      setPhone(waiter.phone || '');
      setPhotoUrl(waiter.photoUrl || '');
      setStatus(waiter.status || 'ACTIVE');
      setPermissions(waiter.permissions || DEFAULT_WAITER_PERMISSIONS);
    } else {
      setEditingWaiter(null);
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setPhotoUrl('');
      setStatus('ACTIVE');
      setPermissions(DEFAULT_WAITER_PERMISSIONS);
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingWaiter(null);
    setFormError(null);
  };

  // Toggle single permission switch
  const handlePermissionToggle = (key: keyof WaiterPermissions) => {
    setPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Submit Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId) return;

    if (!name.trim() || !email.trim()) {
      setFormError("Nome completo e e-mail são obrigatórios.");
      return;
    }

    if (!editingWaiter && (!password || password.length < 6)) {
      setFormError("Para novos garçons, a senha é obrigatória (mínimo 6 caracteres).");
      return;
    }

    setSaveLoading(true);
    setFormError(null);

    try {
      if (editingWaiter) {
        if (password.trim()) {
          if (password.trim().length < 6) {
            setFormError("A nova senha deve ter no mínimo 6 caracteres.");
            setSaveLoading(false);
            return;
          }
          await waiterService.resetPassword(editingWaiter.id, password.trim());
        }

        await waiterService.updateWaiter(editingWaiter.id, {
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          photoUrl: photoUrl.trim(),
          permissions,
          status
        });
      } else {
        await waiterService.createWaiter({
          name: name.trim(),
          email: email.trim(),
          password: password.trim(),
          phone: phone.trim(),
          photoUrl: photoUrl.trim(),
          permissions,
          status
        });
      }

      handleCloseModal();
      await loadWaiters();
    } catch (err: any) {
      console.error("Error saving waiter:", err);
      setFormError(err.message || "Erro ao salvar informações do garçom.");
    } finally {
      setSaveLoading(false);
    }
  };

  // Confirm Status Change
  const handleConfirmStatusChange = async () => {
    if (!statusModalWaiter) return;
    setStatusLoading(true);
    setStatusModalError(null);
    try {
      await waiterService.updateWaiterStatus(statusModalWaiter.id, targetStatus);
      setStatusModalWaiter(null);
      await loadWaiters();
    } catch (err: any) {
      console.error("Error updating waiter status:", err);
      setStatusModalError(err.message || "Erro ao alterar status do garçom.");
    } finally {
      setStatusLoading(false);
    }
  };

  // Filtered list
  const filteredWaiters = useMemo(() => {
    return waiters.filter(w => {
      if (statusFilter !== 'all' && w.status !== statusFilter) return false;
      if (searchQuery.trim() !== '') {
        const queryNorm = searchQuery.toLowerCase();
        const nameNorm = (w.name || '').toLowerCase();
        const emailNorm = (w.email || '').toLowerCase();
        const phoneNorm = (w.phone || '').toLowerCase();
        return nameNorm.includes(queryNorm) || emailNorm.includes(queryNorm) || phoneNorm.includes(queryNorm);
      }
      return true;
    });
  }, [waiters, statusFilter, searchQuery]);

  const permissionLabels: { key: keyof WaiterPermissions; label: string; desc: string }[] = [
    { key: 'createOrders', label: 'Criar Pedidos', desc: 'Permite abrir novas comandas/mesas e lançar itens' },
    { key: 'editOwnOrders', label: 'Editar Próprios Pedidos', desc: 'Permite alterar itens lançados pelo próprio garçom' },
    { key: 'editOtherWaitersOrders', label: 'Editar Pedidos de Outros', desc: 'Permite alterar comandas iniciadas por outros garçons' },
    { key: 'cancelUnsentItems', label: 'Cancelar Itens Não Enviados', desc: 'Permite remover itens antes do envio para a cozinha' },
    { key: 'cancelSentItems', label: 'Cancelar Itens Enviados', desc: 'Permite cancelar itens já em preparo ou entregues' },
    { key: 'applyDiscount', label: 'Aplicar Desconto', desc: 'Permite aplicar descontos no valor da conta' },
    { key: 'transferTable', label: 'Transferir Mesa / Comanda', desc: 'Permite mover itens ou contas entre mesas' },
    { key: 'mergeTables', label: 'Juntar Mesas', desc: 'Permite agrupar duas ou mais mesas em uma única sessão' },
    { key: 'receivePayment', label: 'Receber Pagamentos', desc: 'Permite registrar pagamentos parciais ou totais' },
    { key: 'closeTable', label: 'Fechar Mesa / Comanda', desc: 'Permite emitir o pré-fechamento e encerrar o atendimento' },
    { key: 'viewFinancialTotals', label: 'Ver Totais Financeiros', desc: 'Permite visualizar o resumo de faturamento na tela' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-stone-500 font-medium text-sm">Carregando garçons cadastrados...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-800">Gestão de Garçons</h1>
            <p className="text-xs text-stone-500">Cadastre e gerencie a equipe de atendimento com controle de acesso granular</p>
          </div>
        </div>

        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          <span>Cadastrar Garçom</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar garçom por nome, e-mail ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto bg-stone-100 p-1 rounded-xl">
          <button
            onClick={() => setStatusFilter('all')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'all' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Todos ({waiters.length})
          </button>
          <button
            onClick={() => setStatusFilter('ACTIVE')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'ACTIVE' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Ativos ({waiters.filter(w => w.status === 'ACTIVE').length})
          </button>
          <button
            onClick={() => setStatusFilter('INACTIVE')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'INACTIVE' ? 'bg-white text-stone-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Inativos ({waiters.filter(w => w.status === 'INACTIVE').length})
          </button>
          <button
            onClick={() => setStatusFilter('BLOCKED')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              statusFilter === 'BLOCKED' ? 'bg-white text-red-700 shadow-sm' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Bloqueados ({waiters.filter(w => w.status === 'BLOCKED').length})
          </button>
        </div>
      </div>

      {/* Waiters Grid */}
      {filteredWaiters.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-stone-200 text-stone-500 space-y-3">
          <Users className="w-10 h-10 mx-auto text-stone-300" />
          <p className="font-bold text-stone-700 text-sm">Nenhum garçom encontrado.</p>
          <p className="text-xs text-stone-400">
            {searchQuery ? 'Tente alterar os termos da busca ou os filtros aplicados.' : 'Clique no botão acima para cadastrar o primeiro garçom.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWaiters.map(waiter => {
            const isBlocked = waiter.status === 'BLOCKED';
            const isActive = waiter.status === 'ACTIVE';

            return (
              <div
                key={waiter.id}
                className={`bg-white rounded-2xl p-4 border transition-all flex flex-col justify-between space-y-4 shadow-sm ${
                  isBlocked ? 'border-red-200 bg-red-50/20' : !isActive ? 'border-stone-200 bg-stone-50/40 opacity-80' : 'border-stone-200 hover:border-emerald-500 hover:shadow-md'
                }`}
              >
                {/* Header Info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700 text-sm overflow-hidden flex-shrink-0 border border-stone-200">
                      {waiter.photoUrl ? (
                        <img src={waiter.photoUrl} alt={waiter.name} className="w-full h-full object-cover" />
                      ) : (
                        waiter.name.substring(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-stone-800 text-sm line-clamp-1">{waiter.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-0.5">
                        <Mail className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                        <span className="truncate">{waiter.email || 'Sem e-mail'}</span>
                      </div>
                      {waiter.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-0.5">
                          <Phone className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                          <span>{waiter.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status & Access Badges */}
                  <div className="flex flex-col items-end gap-1">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                      isActive ? 'bg-emerald-100 text-emerald-800' : isBlocked ? 'bg-red-100 text-red-800' : 'bg-stone-200 text-stone-700'
                    }`}>
                      {isActive ? 'Ativo' : isBlocked ? 'Bloqueado' : 'Inativo'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold ${
                      waiter.accessConfigured
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {waiter.accessConfigured ? 'Acesso configurado' : 'Acesso não configurado'}
                    </span>
                  </div>
                </div>

                {/* Permissions Summary */}
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 space-y-1 text-[11px]">
                  <div className="font-bold text-stone-700 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Permissões Habilitadas</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {permissionLabels.filter(p => waiter.permissions?.[p.key]).map(p => (
                      <span key={p.key} className="px-2 py-0.5 bg-white border border-stone-200 text-stone-700 rounded-md font-semibold">
                        {p.label}
                      </span>
                    ))}
                    {permissionLabels.filter(p => waiter.permissions?.[p.key]).length === 0 && (
                      <span className="text-stone-400 italic">Nenhuma permissão ativada</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setStatusModalWaiter(waiter);
                        setTargetStatus(waiter.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
                      }}
                      title={waiter.status === 'ACTIVE' ? 'Desativar garçom' : 'Ativar garçom'}
                      className={`p-2 rounded-xl transition-all ${
                        waiter.status === 'ACTIVE' ? 'text-stone-500 hover:text-stone-800 hover:bg-stone-100' : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      {waiter.status === 'ACTIVE' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => {
                        setStatusModalWaiter(waiter);
                        setTargetStatus(waiter.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED');
                      }}
                      title={waiter.status === 'BLOCKED' ? 'Desbloquear garçom' : 'Bloquear garçom'}
                      className={`p-2 rounded-xl transition-all ${
                        waiter.status === 'BLOCKED' ? 'text-emerald-600 hover:bg-emerald-50' : 'text-red-500 hover:bg-red-50'
                      }`}
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleOpenModal(waiter)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs rounded-xl transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}      {/* Modal Create / Edit */}
      <FormModal
        isOpen={showModal}
        onClose={handleCloseModal}
        title={editingWaiter ? 'Editar Garçom' : 'Cadastrar Novo Garçom'}
        subtitle="Gerencie as informações básicas e as permissões operacionais do garçom"
        maxWidth="2xl"
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
              form="waiter-form"
              disabled={saveLoading}
              className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {saveLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editingWaiter ? 'Salvar Alterações' : 'Confirmar Cadastro'}
            </button>
          </div>
        }
      >
        <form id="waiter-form" onSubmit={handleSave} className="space-y-6">
          {formError && (
            <div className="p-3.5 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Basic Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Nome Completo" required>
              <TextInput
                type="text"
                required
                placeholder="Ex: João da Silva"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>

            <FormField label="E-mail de Acesso" required>
              <TextInput
                type="email"
                required
                placeholder="garcom@restaurante.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>

            <FormField label={`Senha ${editingWaiter ? '(Deixe em branco para não alterar)' : ''}`} required={!editingWaiter}>
              {editingWaiter && !editingWaiter.accessConfigured ? (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium leading-tight">
                  Acesso não configurado (garçom legado sem Auth UID). Para redefinir a senha, recrie o cadastro.
                </div>
              ) : (
                <div className="relative">
                  <TextInput
                    type={showPassword ? 'text' : 'password'}
                    placeholder={editingWaiter ? 'Sua nova senha' : 'Mínimo 6 caracteres'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </FormField>

            <FormField label="Telefone / WhatsApp">
              <TextInput
                type="text"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField label="Status da Conta">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatus('ACTIVE')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      status === 'ACTIVE' ? 'bg-emerald-50 border-emerald-600 text-emerald-800' : 'bg-stone-50 border-stone-200 text-stone-600'
                    }`}
                  >
                    Ativo
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('INACTIVE')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      status === 'INACTIVE' ? 'bg-stone-100 border-stone-400 text-stone-800' : 'bg-stone-50 border-stone-200 text-stone-600'
                    }`}
                  >
                    Inativo
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('BLOCKED')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                      status === 'BLOCKED' ? 'bg-red-50 border-red-600 text-red-800' : 'bg-stone-50 border-stone-200 text-stone-600'
                    }`}
                  >
                    Bloqueado
                  </button>
                </div>
              </FormField>
            </div>
          </div>

          {/* Permissions Checkboxes Section */}
          <div className="space-y-3 pt-4 border-t border-stone-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-stone-800 text-sm">Permissões Operacionais</h4>
                <p className="text-xs text-stone-500">Defina o que este garçom está autorizado a realizar no app</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const allTrue = permissionLabels.every(p => permissions[p.key]);
                  const newPerms = { ...permissions };
                  permissionLabels.forEach(p => {
                    newPerms[p.key] = !allTrue;
                  });
                  setPermissions(newPerms);
                }}
                className="text-xs font-bold text-emerald-600 hover:underline"
              >
                {permissionLabels.every(p => permissions[p.key]) ? 'Desmarcar Todas' : 'Marcar Todas'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {permissionLabels.map(item => {
                const isChecked = !!permissions[item.key];
                return (
                  <label
                    key={item.key}
                    onClick={() => handlePermissionToggle(item.key)}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                      isChecked ? 'bg-emerald-50/50 border-emerald-300' : 'bg-stone-50 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 pointer-events-none"
                    />
                    <div className="space-y-0.5">
                      <span className="font-bold text-stone-800 text-xs block">{item.label}</span>
                      <span className="text-[10px] text-stone-500 leading-tight block">{item.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </form>
      </FormModal>

      {/* Status Modal Confirmation */}
      <FormModal
        isOpen={!!statusModalWaiter}
        onClose={() => setStatusModalWaiter(null)}
        title="Alterar Status do Garçom"
        subtitle="Confirme a alteração de status operacional"
        icon={targetStatus === 'BLOCKED' ? Ban : targetStatus === 'ACTIVE' ? UserCheck : UserX}
        iconBgColor={targetStatus === 'BLOCKED' ? 'bg-red-50' : targetStatus === 'ACTIVE' ? 'bg-emerald-50' : 'bg-stone-50'}
        iconTextColor={targetStatus === 'BLOCKED' ? 'text-red-500' : targetStatus === 'ACTIVE' ? 'text-emerald-500' : 'text-stone-500'}
        maxWidth="sm"
        footer={
          <div className="flex w-full gap-3">
            <button
              onClick={() => setStatusModalWaiter(null)}
              className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmStatusChange}
              disabled={statusLoading}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {statusLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Confirmar</span>
            </button>
          </div>
        }
      >
        <div className="text-center py-2 space-y-3">
          <p className="text-stone-500 text-sm">
            Tem certeza que deseja alterar o status de <strong>{statusModalWaiter?.name}</strong> para{' '}
            <strong className="uppercase">{targetStatus === 'ACTIVE' ? 'Ativo' : targetStatus === 'BLOCKED' ? 'Bloqueado' : 'Inativo'}</strong>?
          </p>

          {statusModalError && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs flex items-center justify-center gap-1.5 text-left font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{statusModalError}</span>
            </div>
          )}
        </div>
      </FormModal>
    </div>
  );
}
