import React, { useEffect, useState, useMemo } from 'react';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Hall, 
  Table, 
  Tab, 
  TabStatus 
} from '../../types/mesas';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  getDocs,
  orderBy,
  limit
} from 'firebase/firestore';
import { waiterService, Waiter } from '../../services/waiterService';
import { OpenTabModal } from '../../components/tables/OpenTabModal';
import { TabCatalogModal, TabDraftItem } from '../../components/tables/TabCatalogModal';
import { TabDetailsModal } from '../../components/tables/TabDetailsModal';
import { TransferTableModal } from '../../components/tables/TransferTableModal';
import { TransferItemsModal } from '../../components/tables/TransferItemsModal';
import { MergeTabsModal } from '../../components/tables/MergeTabsModal';
import { SplitTabsModal } from '../../components/tables/SplitTabsModal';
import { PrimaryButton, SecondaryButton, SearchInput, Badge } from '../../components/ui';
import { 
  Receipt, 
  Users, 
  Clock, 
  Search, 
  User, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Filter,
  Eye,
  UtensilsCrossed,
  Sparkles,
  ChevronRight,
  FileText
} from 'lucide-react';

const ACTIVE_TAB_STATUSES: TabStatus[] = [
  TabStatus.OPEN,
  TabStatus.WAITING_ITEMS,
  TabStatus.WAITING_PAYMENT,
  TabStatus.PARTIALLY_PAID
];

function parseDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  if (typeof dateValue.toDate === 'function') return dateValue.toDate();
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue === 'number') return new Date(dateValue);
  if (typeof dateValue === 'string') return new Date(dateValue);
  return null;
}

function getElapsedTimeFormatted(openedAt: any): string {
  const date = parseDate(openedAt);
  if (!date || isNaN(date.getTime())) return '-';

  const diffMs = Math.max(0, Date.now() - date.getTime());
  const totalMinutes = Math.floor(diffMs / (1000 * 60));

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}

function formatTimeOnly(openedAt: any): string {
  const date = parseDate(openedAt);
  if (!date || isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function RestaurantComandas() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId || profile?.uid;

  // Real-time State
  const [activeTabs, setActiveTabs] = useState<Tab[]>([]);
  const [historyTabs, setHistoryTabs] = useState<Tab[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [statusFilter, setStatusFilter] = useState<'ALL' | TabStatus | 'HISTORY'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Clock tick to refresh duration
  const [, setTick] = useState<number>(0);

  // Modals state
  const [isOpenTabModalOpen, setIsOpenTabModalOpen] = useState(false);
  
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<Tab | null>(null);
  const [detailsTable, setDetailsTable] = useState<Table | null>(null);

  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogTable, setCatalogTable] = useState<Table | null>(null);
  const [catalogTab, setCatalogTab] = useState<Tab | null>(null);

  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [sourceTableForTransfer, setSourceTableForTransfer] = useState<Table | null>(null);
  const [sourceTabForTransfer, setSourceTabForTransfer] = useState<Tab | null>(null);

  const [isTransferItemsOpen, setIsTransferItemsOpen] = useState(false);
  const [sourceTabForTransferItems, setSourceTabForTransferItems] = useState<Tab | null>(null);
  const [sourceTableForTransferItems, setSourceTableForTransferItems] = useState<Table | null>(null);

  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mainTabForMerge, setMainTabForMerge] = useState<Tab | null>(null);
  const [mainTableForMerge, setMainTableForMerge] = useState<Table | null>(null);

  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [mainTabForSplit, setMainTabForSplit] = useState<Tab | null>(null);
  const [mainTableForSplit, setMainTableForSplit] = useState<Table | null>(null);

  const [actionNotice, setActionNotice] = useState<{ title: string; message: string } | null>(null);

  // Auto tick every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(prev => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Waiters once
  useEffect(() => {
    if (!restaurantId) return;
    waiterService.getWaiters(restaurantId)
      .then(setWaiters)
      .catch(err => console.warn('[RestaurantComandas] erro ao buscar garçons:', err));
  }, [restaurantId]);

  // Realtime Firestore Subscriptions for Tables, Halls & Active Tabs
  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Halls subscription
    const hallsRef = collection(db, 'halls');
    const hallsQuery = query(hallsRef, where('restaurantId', '==', restaurantId));
    const unsubHalls = onSnapshot(hallsQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Hall));
      setHalls(list);
    }, (err) => console.error('[RestaurantComandas] erro em halls:', err));

    // Tables subscription
    const tablesRef = collection(db, 'tables');
    const tablesQuery = query(tablesRef, where('restaurantId', '==', restaurantId));
    const unsubTables = onSnapshot(tablesQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Table));
      setTables(list);
    }, (err) => console.error('[RestaurantComandas] erro em tables:', err));

    // Active Tabs subscription
    const tabsRef = collection(db, 'tabs');
    const tabsQuery = query(
      tabsRef,
      where('restaurantId', '==', restaurantId),
      where('status', 'in', ACTIVE_TAB_STATUSES)
    );
    const unsubTabs = onSnapshot(tabsQuery, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tab));
      setActiveTabs(list);
      setLoading(false);
    }, (err) => {
      console.error('[RestaurantComandas] erro em tabs:', err);
      setError('Erro ao carregar as comandas em tempo real.');
      setLoading(false);
    });

    return () => {
      unsubHalls();
      unsubTables();
      unsubTabs();
    };
  }, [restaurantId]);

  // Load Recent History if HISTORY tab is selected
  useEffect(() => {
    if (statusFilter !== 'HISTORY' || !restaurantId) return;

    setLoadingHistory(true);
    const loadHistory = async () => {
      try {
        const tabsRef = collection(db, 'tabs');
        const qHistory = query(
          tabsRef,
          where('restaurantId', '==', restaurantId),
          where('status', 'in', [TabStatus.CLOSED, TabStatus.PAID, TabStatus.CANCELLED]),
          orderBy('closedAt', 'desc'),
          limit(30)
        );
        const snap = await getDocs(qHistory);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tab));
        setHistoryTabs(list);
      } catch (err: any) {
        console.error('[RestaurantComandas] erro ao carregar histórico:', err);
      } finally {
        setLoadingHistory(false);
      }
    };
    loadHistory();
  }, [statusFilter, restaurantId]);

  // Maps
  const tablesMap = useMemo(() => {
    const map = new Map<string, Table>();
    tables.forEach(t => map.set(t.id, t));
    return map;
  }, [tables]);

  const hallsMap = useMemo(() => {
    const map = new Map<string, Hall>();
    halls.forEach(h => map.set(h.id, h));
    return map;
  }, [halls]);

  const waitersMap = useMemo(() => {
    const map = new Map<string, Waiter>();
    waiters.forEach(w => map.set(w.id, w));
    return map;
  }, [waiters]);

  // Metrics
  const metrics = useMemo(() => {
    const openCount = activeTabs.filter(t => t.status === TabStatus.OPEN).length;
    const waitingItemsCount = activeTabs.filter(t => t.status === TabStatus.WAITING_ITEMS).length;
    const waitingPaymentCount = activeTabs.filter(t => 
      t.status === TabStatus.WAITING_PAYMENT || t.status === TabStatus.PARTIALLY_PAID
    ).length;

    const totalPartialCents = activeTabs.reduce((sum, t) => {
      const rem = t.remainingInCents ?? (t.totalInCents || Math.round((t.total || 0) * 100));
      return sum + Math.max(0, rem);
    }, 0);

    return {
      total: activeTabs.length,
      openCount,
      waitingItemsCount,
      waitingPaymentCount,
      totalPartialCents
    };
  }, [activeTabs]);

  // Filtered List
  const displayTabs = useMemo(() => {
    const source = statusFilter === 'HISTORY' ? historyTabs : activeTabs;

    return source.filter(tab => {
      // Status filter
      if (statusFilter !== 'ALL' && statusFilter !== 'HISTORY') {
        if (statusFilter === TabStatus.WAITING_PAYMENT) {
          if (tab.status !== TabStatus.WAITING_PAYMENT && tab.status !== TabStatus.PARTIALLY_PAID) {
            return false;
          }
        } else if (tab.status !== statusFilter) {
          return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const table = tab.tableId ? tablesMap.get(tab.tableId) : null;
        const tableName = table?.name?.toLowerCase() || '';
        const tableNumber = table?.number?.toString() || '';
        const customer = (tab.customerName || '').toLowerCase();
        const waiter = (tab.waiterName || waitersMap.get(tab.waiterId || '')?.name || (waitersMap.get(tab.waiterId || '') as any)?.nome || '').toLowerCase();
        const tabId = tab.id.toLowerCase();

        return (
          tableName.includes(term) ||
          tableNumber.includes(term) ||
          customer.includes(term) ||
          waiter.includes(term) ||
          tabId.includes(term)
        );
      }

      return true;
    });
  }, [activeTabs, historyTabs, statusFilter, searchTerm, tablesMap, waitersMap]);

  // Actions
  const handleOpenTabDetails = (tab: Tab) => {
    const table = tab.tableId ? tablesMap.get(tab.tableId) || null : null;
    setDetailsTab(tab);
    setDetailsTable(table);
    setIsDetailsOpen(true);
  };

  const handleOpenCatalogForTab = (table: Table, tab: Tab | null) => {
    setCatalogTable(table);
    setCatalogTab(tab);
    setIsCatalogOpen(true);
  };

  const getStatusBadge = (status: TabStatus) => {
    switch (status) {
      case TabStatus.OPEN:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Aberta
          </span>
        );
      case TabStatus.WAITING_ITEMS:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold">
            <Clock className="w-3 h-3 text-amber-500" />
            Em Atendimento
          </span>
        );
      case TabStatus.WAITING_PAYMENT:
      case TabStatus.PARTIALLY_PAID:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold">
            <Receipt className="w-3 h-3 text-blue-500" />
            Aguardando Fechamento
          </span>
        );
      case TabStatus.CLOSED:
      case TabStatus.PAID:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-700 border border-stone-200 rounded-lg text-xs font-bold">
            <CheckCircle2 className="w-3 h-3 text-stone-500" />
            Encerrada
          </span>
        );
      case TabStatus.CANCELLED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold">
            Cancelada
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-16 font-sans">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-stone-100 rounded-2xl animate-pulse"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-44 bg-stone-100 rounded-2xl animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-16 font-sans">
      {/* Feedback Toast */}
      {actionNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-emerald-800 text-sm shadow-xs">
          <div>
            <p className="font-bold">{actionNotice.title}</p>
            <p className="text-xs text-emerald-700">{actionNotice.message}</p>
          </div>
          <button 
            type="button"
            onClick={() => setActionNotice(null)}
            className="px-3 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between gap-3 text-red-800 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button 
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Recarregar
          </button>
        </div>
      )}

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-sm shrink-0">
            {metrics.total}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-stone-400 tracking-wider truncate">Comandas Ativas</p>
            <p className="text-sm font-bold text-stone-800">{metrics.total} em aberto</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
            {metrics.openCount}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-600 tracking-wider truncate">Abertas</p>
            <p className="text-sm font-bold text-emerald-800">{metrics.openCount} recém-abertas</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm shrink-0">
            {metrics.waitingItemsCount}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-600 tracking-wider truncate">Em Atendimento</p>
            <p className="text-sm font-bold text-amber-800">{metrics.waitingItemsCount} com itens</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-blue-600 tracking-wider truncate">Acumulado Parcial</p>
            <p className="text-sm font-bold text-blue-900 truncate">
              {formatCurrency(metrics.totalPartialCents / 100, true)}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Controls Header */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Todas ({metrics.total})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(TabStatus.OPEN)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                statusFilter === TabStatus.OPEN
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Abertas ({metrics.openCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(TabStatus.WAITING_ITEMS)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                statusFilter === TabStatus.WAITING_ITEMS
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Em Atendimento ({metrics.waitingItemsCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(TabStatus.WAITING_PAYMENT)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                statusFilter === TabStatus.WAITING_PAYMENT
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Aguardando Fechamento ({metrics.waitingPaymentCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('HISTORY')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                statusFilter === 'HISTORY'
                  ? 'bg-stone-800 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Histórico Recente
            </button>
          </div>

          {/* New Tab Primary Button */}
          <PrimaryButton
            onClick={() => setIsOpenTabModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
            className="shrink-0"
          >
            Abrir Nova Comanda
          </PrimaryButton>
        </div>

        {/* Search Bar */}
        <div>
          <SearchInput
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por mesa, cliente, garçom ou código da comanda..."
          />
        </div>
      </div>

      {/* Comandas Grid / Empty State */}
      {loadingHistory && statusFilter === 'HISTORY' ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-stone-200">
          <RefreshCw className="w-6 h-6 text-stone-400 animate-spin mx-auto mb-2" />
          <p className="text-sm font-bold text-stone-600">Carregando histórico recente...</p>
        </div>
      ) : displayTabs.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-stone-200 shadow-sm space-y-3">
          <div className="w-12 h-12 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-stone-800">Nenhuma comanda encontrada</h3>
          <p className="text-xs sm:text-sm text-stone-500 max-w-md mx-auto">
            {searchTerm 
              ? 'Nenhuma comanda corresponde aos termos da busca digitados.'
              : statusFilter === 'HISTORY'
              ? 'Nenhum histórico recente de comandas fechadas foi encontrado.'
              : 'Não há comandas ativas na categoria selecionada.'}
          </p>
          {!searchTerm && statusFilter !== 'HISTORY' && (
            <button
              onClick={() => setIsOpenTabModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Abrir Primeira Comanda</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayTabs.map(tab => {
            const table = tab.tableId ? tablesMap.get(tab.tableId) : null;
            const hall = table?.hallId ? hallsMap.get(table.hallId) : null;
            const waiter = tab.waiterId ? waitersMap.get(tab.waiterId) : null;
            const waiterName = tab.waiterName || waiter?.name || (waiter as any)?.nome || 'Não atribuído';
            const totalValue = (tab.totalInCents || Math.round((tab.total || 0) * 100)) / 100;
            const itemCount = tab.items?.length || 0;

            return (
              <div
                key={tab.id}
                onClick={() => handleOpenTabDetails(tab)}
                className="bg-white rounded-2xl border border-stone-200 shadow-sm hover:shadow-md hover:border-stone-300 transition-all p-5 flex flex-col justify-between gap-4 cursor-pointer group"
              >
                {/* Card Top */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-stone-100 text-stone-700 rounded-xl group-hover:bg-stone-900 group-hover:text-white transition-colors">
                        <UtensilsCrossed className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-stone-800">
                          {table ? `Mesa ${table.number || table.name}` : 'Comanda Avulsa'}
                        </h4>
                        {hall && (
                          <p className="text-[11px] text-stone-400 font-medium">
                            {hall.name}
                          </p>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(tab.status)}
                  </div>

                  {/* Customer / Waiter Info */}
                  <div className="bg-stone-50 p-3 rounded-xl border border-stone-100 space-y-1.5 text-xs text-stone-600">
                    {tab.customerName && (
                      <div className="flex items-center gap-1.5 text-stone-800 font-bold">
                        <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="truncate">{tab.customerName}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-stone-500">
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        {tab.peopleCount || 1} pessoas
                      </span>
                      <span className="truncate">Garçom: {waiterName}</span>
                    </div>
                  </div>
                </div>

                {/* Card Bottom */}
                <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                      Total Consumido
                    </span>
                    <span className="text-base font-extrabold text-stone-900">
                      {formatCurrency(totalValue, true)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-bold text-stone-600 group-hover:text-stone-900">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    <span>{getElapsedTimeFormatted(tab.openedAt)}</span>
                    <ChevronRight className="w-4 h-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODALS */}

      {/* 1. Open Tab Modal */}
      <OpenTabModal
        isOpen={isOpenTabModalOpen}
        table={null}
        waiters={waiters}
        onClose={() => setIsOpenTabModalOpen(false)}
        onSuccess={(tabId) => {
          setIsOpenTabModalOpen(false);
          setActionNotice({
            title: 'Comanda Aberta',
            message: `A comanda #${tabId.slice(-4)} foi iniciada com sucesso.`
          });
        }}
      />

      {/* 2. Tab Details Modal */}
      {isDetailsOpen && (
        <TabDetailsModal
          isOpen={isDetailsOpen}
          table={detailsTable}
          tab={detailsTab}
          hallName={detailsTable?.hallId ? hallsMap.get(detailsTable.hallId)?.name : undefined}
          waiterName={detailsTab?.waiterId ? (waitersMap.get(detailsTab.waiterId)?.name || (waitersMap.get(detailsTab.waiterId) as any)?.nome) : undefined}
          onClose={() => {
            setIsDetailsOpen(false);
            setDetailsTab(null);
            setDetailsTable(null);
          }}
          onOpenCatalog={(tbl, tb) => {
            setIsDetailsOpen(false);
            handleOpenCatalogForTab(tbl, tb);
          }}
          onOpenTransferItems={(tbl, tb) => {
            setIsDetailsOpen(false);
            setSourceTableForTransferItems(tbl);
            setSourceTabForTransferItems(tb);
            setIsTransferItemsOpen(true);
          }}
          onOpenMergeTabs={(tbl, tb) => {
            setIsDetailsOpen(false);
            setMainTableForMerge(tbl);
            setMainTabForMerge(tb);
            setIsMergeOpen(true);
          }}
          onOpenSplitTabs={(tbl, tb) => {
            setIsDetailsOpen(false);
            setMainTableForSplit(tbl);
            setMainTabForSplit(tb);
            setIsSplitOpen(true);
          }}
        />
      )}

      {/* 3. Catalog Modal */}
      {isCatalogOpen && catalogTable && (
        <TabCatalogModal
          isOpen={isCatalogOpen}
          table={catalogTable}
          tab={catalogTab}
          onClose={() => {
            setIsCatalogOpen(false);
            setCatalogTable(null);
            setCatalogTab(null);
          }}
        />
      )}

      {/* 4. Transfer Items Modal */}
      {isTransferItemsOpen && sourceTabForTransferItems && (
        <TransferItemsModal
          isOpen={isTransferItemsOpen}
          sourceTable={sourceTableForTransferItems}
          sourceTab={sourceTabForTransferItems}
          activeTabs={activeTabs}
          tables={tables}
          onClose={() => {
            setIsTransferItemsOpen(false);
            setSourceTableForTransferItems(null);
            setSourceTabForTransferItems(null);
          }}
          onSuccess={() => {
            setIsTransferItemsOpen(false);
            setActionNotice({
              title: 'Transferência Concluída',
              message: 'Os itens selecionados foram transferidos com sucesso.'
            });
          }}
        />
      )}

      {/* 5. Merge Tabs Modal */}
      {isMergeOpen && mainTabForMerge && (
        <MergeTabsModal
          isOpen={isMergeOpen}
          mainTable={mainTableForMerge}
          mainTab={mainTabForMerge}
          activeTabs={activeTabs.filter(t => t.id !== mainTabForMerge.id)}
          tables={tables}
          onClose={() => {
            setIsMergeOpen(false);
            setMainTableForMerge(null);
            setMainTabForMerge(null);
          }}
          onSuccess={() => {
            setIsMergeOpen(false);
            setActionNotice({
              title: 'Comandas Unificadas',
              message: 'As comandas selecionadas foram incorporadas com sucesso.'
            });
          }}
        />
      )}

      {/* 6. Split Tabs Modal */}
      {isSplitOpen && mainTabForSplit && (
        <SplitTabsModal
          isOpen={isSplitOpen}
          mainTable={mainTableForSplit}
          mainTab={mainTabForSplit}
          onClose={() => {
            setIsSplitOpen(false);
            setMainTableForSplit(null);
            setMainTabForSplit(null);
          }}
          onSuccess={() => {
            setIsSplitOpen(false);
            setActionNotice({
              title: 'Desmembramento Concluído',
              message: 'As mesas desmembradas retornaram com suas comandas.'
            });
          }}
        />
      )}
    </div>
  );
}
