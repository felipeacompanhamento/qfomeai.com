import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ShieldCheck, 
  Phone, 
  Mail, 
  Loader2, 
  AlertCircle,
  ChevronRight,
  Info
} from 'lucide-react';

export default function WaitersPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // Data states
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | WaiterStatus>('all');

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
            <h1 className="text-xl font-bold text-stone-800">Garçons (Visão Operacional)</h1>
            <p className="text-xs text-stone-500">Visualização de garçons ativos e permissões do atendimento</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/restaurant/settings/team?create=WAITER')}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          <span>Cadastrar Garçom</span>
        </button>
      </div>

      {/* Centralization Notice */}
      <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl flex items-start gap-3 text-indigo-950 text-xs sm:text-sm">
        <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Gestão Unificada de Usuários</p>
          <p className="text-indigo-800">
            A criação, edição de e-mail/senha, alteração de permissões e ativação/desativação de garçons é realizada exclusivamente na central de <strong>Equipe</strong>.
          </p>
        </div>
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
            {searchQuery ? 'Tente alterar os termos da busca ou os filtros aplicados.' : 'Clique no botão acima para cadastrar o primeiro garçom na tela de Equipe.'}
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
                    <div className="w-11 h-11 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700 text-sm overflow-hidden shrink-0 border border-stone-200">
                      {waiter.photoUrl ? (
                        <img src={waiter.photoUrl} alt={waiter.name} className="w-full h-full object-cover" />
                      ) : (
                        waiter.name.substring(0, 2).toUpperCase()
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-stone-800 text-sm line-clamp-1">{waiter.name}</h3>
                      <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-0.5">
                        <Mail className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="truncate">{waiter.email || 'Sem e-mail'}</span>
                      </div>
                      {waiter.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-0.5">
                          <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
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
                  </div>
                </div>

                 {/* Informações de Trabalho */}
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 space-y-1.5 text-[11px]">
                  <div className="font-bold text-stone-700 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Informações de Trabalho</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-stone-600 pt-1">
                    <div>
                      <span className="font-semibold text-stone-500">Turno:</span>{' '}
                      <span className="text-stone-800">{waiter.shift || 'Não definido'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-stone-500">Ambientes:</span>{' '}
                      <span className="text-stone-800 truncate block max-w-[120px]" title={waiter.environments?.join(', ')}>
                        {waiter.environments && waiter.environments.length > 0
                          ? waiter.environments.join(', ')
                          : 'Todos'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="font-semibold text-stone-500">Mesas Atribuídas:</span>{' '}
                      <span className="text-stone-800">
                        {waiter.assignedTables && waiter.assignedTables.length > 0
                          ? waiter.assignedTables.join(', ')
                          : 'Todas as mesas'}
                      </span>
                    </div>
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

                {/* Redirect Action */}
                <div className="flex items-center justify-end pt-2 border-t border-stone-100">
                  <button
                    onClick={() => navigate('/restaurant/settings/team')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-all"
                  >
                    <span>Gerenciar na Equipe</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
