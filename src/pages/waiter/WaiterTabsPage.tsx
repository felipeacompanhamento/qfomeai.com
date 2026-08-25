import React, { useEffect, useState, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWaiter } from '../../contexts/WaiterContext';
import { hallRepository } from '../../domain/hall/hallRepository';
import { tableRepository } from '../../domain/table/tableRepository';
import { tabRepository } from '../../domain/tab/tabRepository';
import { 
  Hall, 
  Table, 
  TableStatus,
  Tab, 
  TabStatus 
} from '../../types/mesas';
import { formatCurrency } from '../../lib/utils';
import { 
  PageHeader, 
  Badge, 
  Button, 
  LoadingState, 
  EmptyState, 
  ErrorState, 
  InlineFeedback,
  SearchInput
} from '../../components/ui';
import { 
  Receipt, 
  Plus, 
  User, 
  Clock, 
  Building, 
  ExternalLink,
  X,
  Users
} from 'lucide-react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const OpenTabModal = lazyWithRetry(() => import('../../components/tables/OpenTabModal'));
const TabDetailsModal = lazyWithRetry(() => import('../../components/tables/TabDetailsModal'));
const TabCatalogModal = lazyWithRetry(() => import('../../components/tables/TabCatalogModal'));

type FilterType = 'all' | 'my' | 'in_service' | 'waiting_payment' | 'partially_paid';

function parseDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  if (typeof dateValue.toDate === 'function') {
    const d = dateValue.toDate();
    return d instanceof Date && !isNaN(d.getTime()) && d.getTime() > 0 ? d : null;
  }
  if (dateValue instanceof Date) {
    return !isNaN(dateValue.getTime()) && dateValue.getTime() > 0 ? dateValue : null;
  }
  if (typeof dateValue === 'object') {
    if (typeof dateValue.seconds === 'number' && !isNaN(dateValue.seconds) && dateValue.seconds > 0) {
      const d = new Date(dateValue.seconds * 1000 + Math.floor((dateValue.nanoseconds || 0) / 1000000));
      return !isNaN(d.getTime()) && d.getTime() > 0 ? d : null;
    }
    if (typeof dateValue._seconds === 'number' && !isNaN(dateValue._seconds) && dateValue._seconds > 0) {
      const d = new Date(dateValue._seconds * 1000 + Math.floor((dateValue._nanoseconds || 0) / 1000000));
      return !isNaN(d.getTime()) && d.getTime() > 0 ? d : null;
    }
  }
  if (typeof dateValue === 'number') {
    if (!isFinite(dateValue) || dateValue <= 0) return null;
    const ms = dateValue < 1e11 ? dateValue * 1000 : dateValue;
    const d = new Date(ms);
    return !isNaN(d.getTime()) && d.getTime() > 0 ? d : null;
  }
  if (typeof dateValue === 'string') {
    const trimmed = dateValue.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!isFinite(num) || num <= 0) return null;
      const ms = num < 1e11 ? num * 1000 : num;
      const d = new Date(ms);
      return !isNaN(d.getTime()) && d.getTime() > 0 ? d : null;
    }
    const d = new Date(trimmed);
    return !isNaN(d.getTime()) && d.getTime() > 0 ? d : null;
  }
  return null;
}

function getElapsedTimeFormatted(openedAt: any): string {
  const date = parseDate(openedAt);
  if (!date || isNaN(date.getTime()) || date.getTime() <= 0 || date.getFullYear() < 2020) {
    return '--';
  }

  const now = Date.now();
  const diffMs = Math.max(0, now - date.getTime());
  const totalMinutes = Math.floor(diffMs / (1000 * 60));

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

function getTabItemsCount(tab: Tab): number {
  if (!tab.items || !Array.isArray(tab.items)) return 0;
  return tab.items.reduce((acc, item) => acc + (item.quantidade || 1), 0);
}

function getTabTotalInCents(tab: Tab): number {
  if (typeof tab.totalInCents === 'number' && tab.totalInCents > 0) {
    return tab.totalInCents;
  }
  if (!tab.items || !Array.isArray(tab.items)) return 0;
  return tab.items.reduce((acc, item) => {
    const itemPrice = item.totalPriceCents ?? (item.unitPriceCents ? item.unitPriceCents * (item.quantidade || 1) : 0);
    return acc + itemPrice;
  }, 0);
}

function getStatusBadgeProps(status: TabStatus | string) {
  switch (status) {
    case TabStatus.OPEN:
      return {
        label: 'Aberta',
        variant: 'success' as const,
        bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    case TabStatus.WAITING_ITEMS:
      return {
        label: 'Em Atendimento',
        variant: 'info' as const,
        bgClass: 'bg-blue-50 text-blue-700 border-blue-200'
      };
    case TabStatus.WAITING_PAYMENT:
      return {
        label: 'Aguardando Pagamento',
        variant: 'warning' as const,
        bgClass: 'bg-amber-50 text-amber-800 border-amber-300'
      };
    case TabStatus.PARTIALLY_PAID:
      return {
        label: 'Parcialmente Paga',
        variant: 'warning' as const,
        bgClass: 'bg-purple-50 text-purple-700 border-purple-200'
      };
    default:
      return {
        label: status || 'Ativa',
        variant: 'neutral' as const,
        bgClass: 'bg-stone-50 text-stone-700 border-stone-200'
      };
  }
}

export function WaiterTabsPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { waiterConfig, attendedHalls, assignedTables } = useWaiter();
  const restaurantId = profile?.restaurantId;
  const waiterId = profile?.uid || user?.uid;

  // Real-time domain states
  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeTabs, setActiveTabs] = useState<Tab[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<FilterType>('all');

  // Timer tick for real-time elapsed time
  const [, setTick] = useState<number>(0);

  // Modal States
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [selectedTabForDetails, setSelectedTabForDetails] = useState<Tab | null>(null);
  const [selectedTableForDetails, setSelectedTableForDetails] = useState<Table | null>(null);

  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [catalogTable, setCatalogTable] = useState<Table | null>(null);
  const [catalogTab, setCatalogTab] = useState<Tab | null>(null);

  const [isOpenTabModalOpen, setIsOpenTabModalOpen] = useState<boolean>(false);
  const [selectedTableForOpenTab, setSelectedTableForOpenTab] = useState<Table | null>(null);

  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Auto tick every 30s
  useEffect(() => {
    const timer = setInterval(() => setTick(prev => prev + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // Realtime Domain Subscriptions via Canonical Repositories
  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Subscribe Halls
    const unsubscribeHalls = hallRepository.subscribeHalls(
      restaurantId,
      (hallsList) => setHalls(hallsList),
      (err) => console.error('Erro no listener de salões:', err)
    );

    // 2. Subscribe Tables
    const unsubscribeTables = tableRepository.subscribeTablesByRestaurant(
      restaurantId,
      (tablesList) => setTables(tablesList),
      (err) => console.error('Erro no listener de mesas:', err)
    );

    // 3. Subscribe Active Tabs
    const unsubscribeTabs = tabRepository.subscribeActiveTabs(
      restaurantId,
      (tabsList) => {
        setActiveTabs(tabsList);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn('Erro no listener de comandas ativas:', err);
        setLoading(false);
        setActiveTabs(prev => {
          if (prev.length === 0) {
            setError('Sem conexão para carregar as comandas. Verifique sua rede.');
          } else {
            setActionNotice({ type: 'info', message: 'Sem conexão em tempo real. Exibindo comandas em cache.' });
          }
          return prev;
        });
      }
    );

    return () => {
      unsubscribeHalls();
      unsubscribeTables();
      unsubscribeTabs();
    };
  }, [restaurantId]);

  // Quick lookup maps
  const hallsMap = useMemo(() => {
    const map = new Map<string, Hall>();
    halls.forEach(h => map.set(h.id, h));
    return map;
  }, [halls]);

  const tablesMap = useMemo(() => {
    const map = new Map<string, Table>();
    tables.forEach(t => map.set(t.id, t));
    return map;
  }, [tables]);

  // Waiter Display Name resolver
  const getWaiterName = (tab: Tab): string => {
    if (tab.waiterName && tab.waiterName.trim()) return tab.waiterName;
    if (tab.waiterId === user?.uid || tab.openedBy === user?.uid) {
      return profile?.nome || profile?.name || 'Você';
    }
    return tab.openedBy || 'Garçom';
  };

  // Normalized restrictions with legacy default protection
  const effectiveAttendedHalls = useMemo(() => {
    if (!attendedHalls || !Array.isArray(attendedHalls) || attendedHalls.length === 0) {
      return [];
    }
    const normalized = attendedHalls.map(h => String(h).trim().toLowerCase()).filter(Boolean);
    if (normalized.length === 0) return [];

    if (halls.length > 0) {
      const hasRealMatch = halls.some(h => 
        normalized.includes(h.id.toLowerCase().trim()) || 
        normalized.includes(h.name.toLowerCase().trim())
      );
      if (!hasRealMatch) {
        const legacyDefaultNames = ['salão principal', 'salao principal', 'varanda', 'deck', 'delivery'];
        const isAllLegacyPlaceholders = normalized.every(entry => legacyDefaultNames.includes(entry));
        if (isAllLegacyPlaceholders) {
          return [];
        }
      }
    }
    return normalized;
  }, [attendedHalls, halls]);

  const effectiveAssignedTables = useMemo(() => {
    if (!assignedTables || !Array.isArray(assignedTables) || assignedTables.length === 0) {
      return [];
    }
    return assignedTables.map(t => String(t).trim().toLowerCase()).filter(Boolean);
  }, [assignedTables]);

  // Filtered & Sorted Active Tabs
  const filteredTabs = useMemo(() => {
    let result = activeTabs;
    const countTotal = activeTabs.length;

    // 0. Permission restriction: if cannot view other waiters' tabs, restrict base list to my tabs only
    if (waiterConfig?.canViewOtherWaitersTabs === false) {
      result = result.filter(tab => 
        tab.waiterId === waiterId || 
        tab.waiterId === user?.uid || 
        tab.openedBy === waiterId ||
        tab.openedBy === user?.uid ||
        tab.openedBy === profile?.uid
      );
    }
    const countAfterOwner = result.length;

    // 1. Apply waiterConfig (effectiveAssignedTables & effectiveAttendedHalls) restrictions if set
    if (effectiveAssignedTables.length > 0) {
      result = result.filter(tab => {
        if (!tab.tableId) return true;
        const table = tablesMap.get(tab.tableId);
        const tableId = (tab.tableId || '').trim().toLowerCase();
        const tableName = (table?.name || (tab as any).tableName || '').trim().toLowerCase();
        const tableNum = table?.number !== undefined && table?.number !== null ? String(table.number).trim().toLowerCase() : '';
        return effectiveAssignedTables.includes(tableId) || 
               (tableName && effectiveAssignedTables.includes(tableName)) ||
               (tableNum && effectiveAssignedTables.includes(tableNum));
      });
    }
    const countAfterAssigned = result.length;

    if (effectiveAttendedHalls.length > 0) {
      result = result.filter(tab => {
        const table = tab.tableId ? tablesMap.get(tab.tableId) : null;
        const hallId = (table?.hallId || tab.hallId || '').trim().toLowerCase();
        const hall = hallId ? hallsMap.get(table?.hallId || tab.hallId || '') : null;
        const hallName = hall ? hall.name.trim().toLowerCase() : '';
        if (!hallId && !hallName) return true;
        return (hallId && effectiveAttendedHalls.includes(hallId)) || 
               (hallName && effectiveAttendedHalls.includes(hallName));
      });
    }
    const countAfterAttended = result.length;

    // 2. Status / Quick Filter
    if (statusFilter === 'my') {
      result = result.filter(tab => 
        tab.waiterId === waiterId || 
        tab.waiterId === user?.uid || 
        tab.waiterId === profile?.uid ||
        tab.openedBy === waiterId ||
        tab.openedBy === user?.uid
      );
    } else if (statusFilter === 'in_service') {
      result = result.filter(tab => 
        tab.status === TabStatus.OPEN || tab.status === TabStatus.WAITING_ITEMS
      );
    } else if (statusFilter === 'waiting_payment') {
      result = result.filter(tab => 
        tab.status === TabStatus.WAITING_PAYMENT
      );
    } else if (statusFilter === 'partially_paid') {
      result = result.filter(tab => 
        tab.status === TabStatus.PARTIALLY_PAID
      );
    }

    // 3. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(tab => {
        const table = tab.tableId ? tablesMap.get(tab.tableId) : null;
        const tableName = (table?.name || (tab as any).tableName || ((tab as any).tableNumber ? `Mesa ${(tab as any).tableNumber}` : '') || '').toString().toLowerCase();
        const clientName = (tab.customerName || (tab as any).clientName || (tab as any).name || '').toLowerCase();
        const tabNum = ((tab as any).tabNumber || tab.id || '').toString().toLowerCase();
        const waiterName = (tab.waiterName || getWaiterName(tab)).toLowerCase();
        const hallName = (table?.hallId ? hallsMap.get(table.hallId)?.name : (tab.hallId ? hallsMap.get(tab.hallId)?.name : '') || '').toLowerCase();

        return tableName.includes(q) || 
               clientName.includes(q) || 
               tabNum.includes(q) || 
               waiterName.includes(q) || 
               hallName.includes(q);
      });
    }

    // 4. Sort: Priority to WAITING_PAYMENT/PARTIALLY_PAID, then oldest openedAt
    return [...result].sort((a, b) => {
      const aUrgent = a.status === TabStatus.WAITING_PAYMENT || a.status === TabStatus.PARTIALLY_PAID;
      const bUrgent = b.status === TabStatus.WAITING_PAYMENT || b.status === TabStatus.PARTIALLY_PAID;

      if (aUrgent && !bUrgent) return -1;
      if (!aUrgent && bUrgent) return 1;

      const dateA = parseDate(a.openedAt)?.getTime() || 0;
      const dateB = parseDate(b.openedAt)?.getTime() || 0;
      return dateA - dateB;
    });
  }, [activeTabs, effectiveAttendedHalls, effectiveAssignedTables, waiterId, user, profile, waiterConfig, tablesMap, hallsMap, statusFilter, searchQuery, restaurantId]);

  // Counts for pills
  const counts = useMemo(() => {
    let my = 0;
    let inService = 0;
    let waitingPayment = 0;
    let partiallyPaid = 0;

    activeTabs.forEach(tab => {
      if (tab.waiterId === waiterId || tab.waiterId === user?.uid || tab.waiterId === profile?.uid) {
        my++;
      }
      if (tab.status === TabStatus.OPEN || tab.status === TabStatus.WAITING_ITEMS) {
        inService++;
      } else if (tab.status === TabStatus.WAITING_PAYMENT) {
        waitingPayment++;
      } else if (tab.status === TabStatus.PARTIALLY_PAID) {
        partiallyPaid++;
      }
    });

    return {
      all: activeTabs.length,
      my,
      inService,
      waitingPayment,
      partiallyPaid
    };
  }, [activeTabs, waiterId, user, profile]);

  const handleOpenTabDetails = (tab: Tab) => {
    const table = tab.tableId ? tablesMap.get(tab.tableId) || null : null;
    setSelectedTabForDetails(tab);
    setSelectedTableForDetails(table);
    setIsDetailsOpen(true);
  };

  const handleNewTab = () => {
    if (!waiterConfig.canOpenTab) {
      setActionNotice({
        type: 'error',
        message: 'Você não tem permissão operacional para abrir novas comandas.'
      });
      setTimeout(() => setActionNotice(null), 4000);
      return;
    }

    const freeTables = tables.filter(t => t.status === TableStatus.AVAILABLE || (t.status as any) === 'livre');
    if (freeTables.length > 0) {
      setSelectedTableForOpenTab(freeTables[0]);
      setIsOpenTabModalOpen(true);
    } else {
      navigate('/garcom/mesas');
    }
  };

  const FILTER_PILLS: { id: FilterType; label: string; count: number }[] = [
    { id: 'all', label: waiterConfig?.canViewOtherWaitersTabs === false ? 'Minhas Comandas' : 'Todas', count: counts.all },
    ...(waiterConfig?.canViewOtherWaitersTabs !== false ? [{ id: 'my' as FilterType, label: 'Minhas', count: counts.my }] : []),
    { id: 'in_service', label: 'Em Atendimento', count: counts.inService },
    { id: 'waiting_payment', label: 'Aguardando Pagamento', count: counts.waitingPayment },
    { id: 'partially_paid', label: 'Parcialmente Pagas', count: counts.partiallyPaid },
  ];

  return (
    <div className="space-y-4" id="waiter-tabs-page">
      <PageHeader
        title="Comandas Ativas"
        description="Acompanhe todas as comandas e atendimentos em andamento."
        icon={Receipt}
      />

      {actionNotice && (
        <div className="relative">
          <InlineFeedback
            type={actionNotice.type}
            message={actionNotice.message}
            className="text-xs"
          />
          <button
            onClick={() => setActionNotice(null)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState message="Buscando comandas em atendimento..." />
      ) : (error && activeTabs.length === 0) ? (
        <ErrorState message={error} />
      ) : (
        <div className="space-y-3">
          {/* Search bar & New Tab Button */}
          <div className="flex gap-2 items-center">
            <div className="flex-grow">
              <SearchInput
                placeholder="Buscar por mesa, cliente, comanda..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                id="input-search-tabs"
              />
            </div>

            <Button
              variant="primary"
              onClick={handleNewTab}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl shadow-xs"
              id="btn-new-tab"
              title="Nova Comanda"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nova Comanda</span>
            </Button>
          </div>

          {/* Quick Filter Pills */}
          <div className="flex gap-1.5 py-1 overflow-x-auto scrollbar-none">
            {FILTER_PILLS.map((pill) => {
              const isSelected = statusFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  onClick={() => setStatusFilter(pill.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer min-h-[38px] ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                  }`}
                  id={`filter-pill-${pill.id}`}
                >
                  <span>{pill.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-xs font-extrabold ${
                      isSelected
                        ? 'bg-emerald-700 text-white'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {pill.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Tabs List */}
          {filteredTabs.length === 0 ? (
            <div className="bg-white border border-stone-200/80 rounded-2xl p-6 shadow-2xs">
              <EmptyState
                title={searchQuery ? 'Nenhuma comanda encontrada' : 'Nenhuma comanda em atendimento'}
                description={
                  searchQuery
                    ? 'Nenhum resultado corresponde à sua busca. Tente pesquisar por outro termo.'
                    : 'As comandas abertas e atendimentos iniciados aparecerão aqui automaticamente.'
                }
                icon={Receipt}
                action={
                  <Button
                    variant="primary"
                    onClick={handleNewTab}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-xs flex items-center gap-2"
                    id="btn-empty-new-tab"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Iniciar Atendimento</span>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredTabs.map((tab) => {
                const table = tab.tableId ? tablesMap.get(tab.tableId) : null;
                const hall = table?.hallId
                  ? hallsMap.get(table.hallId)
                  : tab.hallId
                  ? hallsMap.get(tab.hallId)
                  : null;

                const tableLabel = table
                  ? table.name || `Mesa ${table.number}`
                  : (tab as any).tableName || ((tab as any).tableNumber ? `Mesa ${(tab as any).tableNumber}` : 'Sem Mesa');

                const clientName = tab.customerName || (tab as any).clientName || (tab as any).name || null;
                const waiterDisplayName = getWaiterName(tab);
                const itemsCount = getTabItemsCount(tab);
                const totalCents = getTabTotalInCents(tab);
                const badgeProps = getStatusBadgeProps(tab.status);

                return (
                  <div
                    key={tab.id}
                    onClick={() => handleOpenTabDetails(tab)}
                    className="bg-white border border-stone-200/90 rounded-2xl p-3.5 shadow-2xs hover:shadow-xs transition-all active:scale-[0.99] cursor-pointer space-y-2.5 flex flex-col justify-between"
                    id={`card-tab-${tab.id}`}
                  >
                    {/* Top Row: Table Label, Hall Badge & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-stone-900 text-sm tracking-tight truncate">
                            {tableLabel}
                          </span>
                          {hall && (
                            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-stone-500 bg-stone-100 border border-stone-200/80 px-1.5 py-0.5 rounded-md truncate max-w-[120px]">
                              <Building className="w-3 h-3 text-stone-400 shrink-0" />
                              <span className="truncate">{hall.name}</span>
                            </span>
                          )}
                        </div>
                        {clientName && (
                          <p className="text-xs font-bold text-stone-600 truncate mt-0.5 flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{clientName}</span>
                          </p>
                        )}
                      </div>

                      <Badge
                        variant={badgeProps.variant}
                        className={`text-xs font-bold uppercase px-2 py-0.5 rounded-lg shrink-0 border ${badgeProps.bgClass}`}
                      >
                        {badgeProps.label}
                      </Badge>
                    </div>

                    {/* Middle Row: Operational Info */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-stone-500 bg-stone-50/80 rounded-xl p-2.5 border border-stone-100">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="truncate">{getElapsedTimeFormatted(tab.openedAt)}</span>
                        {tabRepository.isTabOlderThan12Hours(tab.openedAt) && (
                          <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-100/70 border border-amber-200 px-1.5 py-0.2 rounded-md">
                            Comanda antiga
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 min-w-0 justify-end">
                        <Users className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="font-semibold text-stone-700 truncate">{waiterDisplayName}</span>
                      </div>
                    </div>

                    {/* Bottom Row: Item count, Partial Total & Table Action */}
                    <div className="border-t border-stone-100 pt-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-stone-400 uppercase tracking-tight leading-none">Total Parcial</p>
                        <p className="text-sm font-extrabold text-emerald-700 mt-0.5">
                          {waiterConfig.canViewPrices ? formatCurrency(totalCents, true) : '***'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold bg-stone-100 border border-stone-200/60 text-stone-600 px-2 py-1 rounded-lg shrink-0">
                          {itemsCount} {itemsCount === 1 ? 'item' : 'itens'}
                        </span>

                        {tab.tableId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate('/garcom/mesas');
                            }}
                            className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center justify-center min-h-[36px] min-w-[36px]"
                            title="Ir para a Mesa"
                            id={`btn-goto-table-${tab.id}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Open Tab Modal */}
      <Suspense fallback={null}>
        {isOpenTabModalOpen && (
          <OpenTabModal
            isOpen={isOpenTabModalOpen}
            table={selectedTableForOpenTab}
            hallName={halls.find(h => h.id === selectedTableForOpenTab?.hallId)?.name}
            lockedWaiterId={user?.uid}
            lockedWaiterName={profile?.nome || profile?.name}
            canChangeWaiter={false}
            onClose={() => {
              setIsOpenTabModalOpen(false);
              setSelectedTableForOpenTab(null);
            }}
            onSuccess={() => {
              setActionNotice({
                type: 'success',
                message: `Atendimento iniciado com sucesso para a mesa ${selectedTableForOpenTab?.name || ''}!`
              });
              setTimeout(() => setActionNotice(null), 4000);
            }}
          />
        )}
      </Suspense>

      {/* Tab Details Modal */}
      <Suspense fallback={null}>
        {isDetailsOpen && (
          <TabDetailsModal
            isOpen={isDetailsOpen}
            table={selectedTableForDetails}
            tab={selectedTabForDetails}
            hallName={halls.find(h => h.id === selectedTableForDetails?.hallId)?.name}
            waiterName={selectedTabForDetails?.waiterName || (selectedTabForDetails ? getWaiterName(selectedTabForDetails) : undefined)}
            canViewPrices={waiterConfig.canViewPrices}
            canAddItems={waiterConfig.canOpenTab !== false}
            canCloseAccount={false}
            onClose={() => {
              setIsDetailsOpen(false);
              setSelectedTabForDetails(null);
              setSelectedTableForDetails(null);
            }}
            onOpenCatalog={(tbl, tb) => {
              setIsDetailsOpen(false);
              setCatalogTable(tbl || selectedTableForDetails);
              setCatalogTab(tb || selectedTabForDetails);
              setIsCatalogOpen(true);
            }}
          />
        )}
      </Suspense>

      {/* Tab Catalog Modal */}
      <Suspense fallback={null}>
        {isCatalogOpen && (
          <TabCatalogModal
            isOpen={isCatalogOpen}
            table={catalogTable}
            tab={catalogTab}
            hallName={halls.find(h => h.id === catalogTable?.hallId)?.name}
            canViewPrices={waiterConfig.canViewPrices}
            onClose={() => {
              setIsCatalogOpen(false);
              setCatalogTable(null);
              setCatalogTab(null);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

export default WaiterTabsPage;
