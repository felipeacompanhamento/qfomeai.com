import React, { useEffect, useState, useMemo } from 'react';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Hall, 
  Table, 
  TableStatus, 
  Tab, 
  TabStatus 
} from '../../types/mesas';
import { db, auth } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { waiterService, Waiter } from '../../services/waiterService';
import { OpenTabModal } from '../../components/tables/OpenTabModal';
import { TabCatalogModal, TabDraftItem } from '../../components/tables/TabCatalogModal';
import { TabDetailsModal } from '../../components/tables/TabDetailsModal';
import { TransferTableModal } from '../../components/tables/TransferTableModal';
import { TransferItemsModal } from '../../components/tables/TransferItemsModal';
import { MergeTabsModal } from '../../components/tables/MergeTabsModal';
import { SplitTabsModal } from '../../components/tables/SplitTabsModal';
import { PrimaryButton, Badge, SearchInput } from '../../components/ui';
import { 
  UtensilsCrossed, 
  Users, 
  Clock, 
  Building, 
  Search, 
  MoreVertical, 
  User, 
  DollarSign, 
  Play, 
  Eye, 
  Sparkles, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Plus,
  X,
  Layers,
  Filter,
  Receipt
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



export default function OperationalTablesMap() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  // Real-time Collections State
  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeTabs, setActiveTabs] = useState<Tab[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [selectedHallId, setSelectedHallId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Clock tick state to auto-update occupation time every 30 seconds
  const [, setTick] = useState<number>(0);

  // Modal / Toast Feedback Info
  const [actionNotice, setActionNotice] = useState<{ title: string; message: string } | null>(null);

  // Open Tab Modal State
  const [isOpenTabModalOpen, setIsOpenTabModalOpen] = useState<boolean>(false);
  const [selectedTableForOpenTab, setSelectedTableForOpenTab] = useState<Table | null>(null);

  // Tab Catalog Modal State
  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [catalogTable, setCatalogTable] = useState<Table | null>(null);
  const [catalogTab, setCatalogTab] = useState<Tab | null>(null);

  // Tab Details Modal State
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [detailsTable, setDetailsTable] = useState<Table | null>(null);
  const [detailsTab, setDetailsTab] = useState<Tab | null>(null);

  // Transfer Table Modal State
  const [isTransferOpen, setIsTransferOpen] = useState<boolean>(false);
  const [sourceTableForTransfer, setSourceTableForTransfer] = useState<Table | null>(null);
  const [sourceTabForTransfer, setSourceTabForTransfer] = useState<Tab | null>(null);

  // Transfer Items Modal State
  const [isTransferItemsOpen, setIsTransferItemsOpen] = useState<boolean>(false);
  const [sourceTabForTransferItems, setSourceTabForTransferItems] = useState<Tab | null>(null);
  const [sourceTableForTransferItems, setSourceTableForTransferItems] = useState<Table | null>(null);

  // Merge Tabs Modal State
  const [isMergeOpen, setIsMergeOpen] = useState<boolean>(false);
  const [mainTabForMerge, setMainTabForMerge] = useState<Tab | null>(null);
  const [mainTableForMerge, setMainTableForMerge] = useState<Table | null>(null);

  // Split Tabs Modal State
  const [isSplitOpen, setIsSplitOpen] = useState<boolean>(false);
  const [mainTabForSplit, setMainTabForSplit] = useState<Tab | null>(null);
  const [mainTableForSplit, setMainTableForSplit] = useState<Table | null>(null);

  // Active action menu popover ID
  const [activeMenuTableId, setActiveMenuTableId] = useState<string | null>(null);

  // Auto timer to refresh occupation minutes
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
      .catch(err => console.warn('Aviso ao buscar garçons:', err));
  }, [restaurantId]);

  // Realtime Firestore Subscriptions
  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Subscribe to Halls
    const hallsRef = collection(db, 'halls');
    const hallsQuery = query(hallsRef, where('restaurantId', '==', restaurantId));
    const unsubscribeHalls = onSnapshot(hallsQuery, (snapshot) => {
      const hallsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Hall)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setHalls(hallsList);
    }, (err) => {
      console.error('Erro no listener de salões:', err);
      setError('Erro na atualização em tempo real dos salões.');
    });

    // 2. Subscribe to Tables
    const tablesRef = collection(db, 'tables');
    const tablesQuery = query(tablesRef, where('restaurantId', '==', restaurantId));
    const unsubscribeTables = onSnapshot(tablesQuery, (snapshot) => {
      const tablesList = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Table))
        .filter(t => t.active)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      setTables(tablesList);
      setLoading(false);
    }, (err) => {
      console.error('Erro no listener de mesas:', err);
      setError('Erro na atualização em tempo real das mesas.');
      setLoading(false);
    });

    // 3. Subscribe to Active Tabs
    const tabsRef = collection(db, 'tabs');
    const tabsQuery = query(
      tabsRef,
      where('restaurantId', '==', restaurantId),
      where('status', 'in', ACTIVE_TAB_STATUSES)
    );
    const unsubscribeTabs = onSnapshot(tabsQuery, (snapshot) => {
      const tabsList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Tab));
      setActiveTabs(tabsList);
    }, (err) => {
      console.error('Erro no listener de comandas ativas:', err);
    });

    return () => {
      unsubscribeHalls();
      unsubscribeTables();
      unsubscribeTabs();
    };
  }, [restaurantId]);

  // Map of active tabs by tableId
  const activeTabsByTable = useMemo(() => {
    const map = new Map<string, Tab>();
    activeTabs.forEach(tab => {
      if (tab.tableId) {
        map.set(tab.tableId, tab);
      }
    });
    return map;
  }, [activeTabs]);

  // Map of halls by hallId
  const hallNameMap = useMemo(() => {
    const map = new Map<string, string>();
    halls.forEach(h => map.set(h.id, h.name));
    return map;
  }, [halls]);

  // Map of waiters by waiterId/userId
  const waiterNameMap = useMemo(() => {
    const map = new Map<string, string>();
    waiters.forEach(w => {
      if (w.id) map.set(w.id, w.name);
      if (w.userId) map.set(w.userId, w.name);
    });
    return map;
  }, [waiters]);

  // Helper to resolve Waiter Name
  const getWaiterDisplayName = (tab: Tab): string => {
    if (tab.waiterId && waiterNameMap.has(tab.waiterId)) {
      return waiterNameMap.get(tab.waiterId)!;
    }
    if (tab.openedBy) {
      if (waiterNameMap.has(tab.openedBy)) {
        return waiterNameMap.get(tab.openedBy)!;
      }
      return tab.openedBy;
    }
    return 'Não atribuído';
  };

  // Filtered Tables
  const filteredTables = useMemo(() => {
    return tables.filter(table => {
      // Hall filter
      if (selectedHallId !== 'all' && table.hallId !== selectedHallId) {
        return false;
      }

      const activeTab = activeTabsByTable.get(table.id);
      const isOccupied = !!activeTab || table.status === TableStatus.OCCUPIED || table.status === TableStatus.WAITING_PAYMENT;

      // Status filter
      if (selectedStatus === 'available' && (isOccupied || table.status !== TableStatus.AVAILABLE)) {
        return false;
      }
      if (selectedStatus === 'occupied' && !isOccupied) {
        return false;
      }
      if (selectedStatus === 'waiting_payment' && table.status !== TableStatus.WAITING_PAYMENT && activeTab?.status !== TabStatus.WAITING_PAYMENT) {
        return false;
      }
      if (selectedStatus === 'reserved' && table.status !== TableStatus.RESERVED) {
        return false;
      }

      // Search term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const tableName = table.name.toLowerCase();
        const tableNum = table.number !== undefined ? table.number.toString() : '';
        const hallName = (hallNameMap.get(table.hallId) || '').toLowerCase();
        const waiterName = activeTab ? getWaiterDisplayName(activeTab).toLowerCase() : '';

        return tableName.includes(term) || tableNum.includes(term) || hallName.includes(term) || waiterName.includes(term);
      }

      return true;
    });
  }, [tables, selectedHallId, selectedStatus, searchTerm, activeTabsByTable, hallNameMap, waiterNameMap]);

  // Operational metrics summary
  const metrics = useMemo(() => {
    let availableCount = 0;
    let occupiedCount = 0;
    let waitingPaymentCount = 0;
    let totalPartialInCents = 0;

    tables.forEach(table => {
      const activeTab = activeTabsByTable.get(table.id);
      if (activeTab || table.status === TableStatus.OCCUPIED) {
        occupiedCount++;
        if (activeTab) {
          totalPartialInCents += activeTab.totalInCents || 0;
        }
      } else if (table.status === TableStatus.WAITING_PAYMENT) {
        waitingPaymentCount++;
        if (activeTab) {
          totalPartialInCents += activeTab.totalInCents || 0;
        }
      } else if (table.status === TableStatus.AVAILABLE) {
        availableCount++;
      }
    });

    return {
      total: tables.length,
      available: availableCount,
      occupied: occupiedCount,
      waitingPayment: waitingPaymentCount,
      totalPartialInCents
    };
  }, [tables, activeTabsByTable]);

  // Handle Main Action Click: Available table opens the OpenTabModal
  const handleStartService = (table: Table) => {
    setSelectedTableForOpenTab(table);
    setIsOpenTabModalOpen(true);
  };

  const handleOpenCatalog = (table: Table, tab?: Tab) => {
    setCatalogTable(table);
    setCatalogTab(tab || null);
    setIsCatalogOpen(true);
  };

  const handleOpenTabDetails = (table: Table, tab?: Tab) => {
    setDetailsTable(table);
    setDetailsTab(tab || null);
    setIsDetailsOpen(true);
  };

  const handleReleaseTable = async (table: Table) => {
    const confirmed = window.confirm(
      'Liberar esta mesa? Esta ação só será permitida se não houver consumo ou valor pendente.'
    );
    if (!confirmed) return;

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/restaurant/tab/release-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ tableId: table.id })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setActionNotice({
          title: 'Mesa Liberada com Sucesso!',
          message: `A mesa ${table.name} foi liberada.`
        });
        setIsDetailsOpen(false);
      } else {
        const errorMsg = data.code === 'HAS_CONSUMPTION' || response.status === 409
          ? 'Esta mesa possui consumo ou valor pendente e não pode ser liberada.'
          : (data.message || 'Erro ao tentar liberar a mesa.');
        alert(errorMsg);
      }
    } catch (err: any) {
      alert('Esta mesa possui consumo ou valor pendente e não pode ser liberada.');
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-16 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-stone-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Mapa Operacional de Mesas</h1>
          </div>
          <p className="text-stone-500 text-xs sm:text-sm mt-1">
            Acompanhe o status em tempo real das mesas, comandas ativas e tempo de permanência.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Tempo Real Ativo
          </span>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center font-bold text-sm shrink-0">
            {metrics.total}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-stone-400 tracking-wider truncate">Total de Mesas</p>
            <p className="text-sm font-bold text-stone-800">{metrics.total} mesas</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
            {metrics.available}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-600 tracking-wider truncate">Livres</p>
            <p className="text-sm font-bold text-emerald-800">{metrics.available} disponíveis</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-100 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-sm shrink-0">
            {metrics.occupied}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-rose-600 tracking-wider truncate">Ocupadas</p>
            <p className="text-sm font-bold text-rose-800">{metrics.occupied} ocupadas</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-amber-600 tracking-wider truncate">Acumulado Parcial</p>
            <p className="text-sm font-bold text-amber-900 truncate">
              {formatCurrency(metrics.totalPartialInCents, true)}
            </p>
          </div>
        </div>
      </div>

      {/* Filters Section */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        {/* Hall Selection Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedHallId('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              selectedHallId === 'all'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Todos os Salões</span>
          </button>

          {halls.map(hall => (
            <button
              key={hall.id}
              type="button"
              onClick={() => setSelectedHallId(hall.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                selectedHallId === hall.id
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <span>{hall.name}</span>
            </button>
          ))}
        </div>

        {/* Status Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-2 border-t border-stone-100">
          <div className="flex-1">
            <SearchInput
              placeholder="Buscar mesa, salão ou garçom..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === 'all'
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Todas Status
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('available')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === 'available'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              Livres
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('occupied')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === 'occupied'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }`}
            >
              Ocupadas
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('waiting_payment')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === 'waiting_payment'
                  ? 'bg-amber-600 text-white'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              Aguardando Pgto
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatus('reserved')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedStatus === 'reserved'
                  ? 'bg-blue-600 text-white'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }`}
            >
              Reservadas
            </button>
          </div>
        </div>
      </div>

      {/* Tables Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-stone-200 shadow-sm text-stone-400 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
          <p className="text-sm font-medium">Carregando mapa operacional...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-stone-200 shadow-sm">
          <div className="w-12 h-12 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-stone-700">Nenhuma mesa encontrada</h3>
          <p className="text-stone-500 text-xs sm:text-sm mt-1 max-w-sm mx-auto">
            Nenhuma mesa corresponde aos filtros ou seleções atuais.
          </p>
        </div>
      ) : (
        /* Responsive Grid: 1 col on tiny screen, 2 col on sm, 3 col on md, 4 col on lg */
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {filteredTables.map(table => {
            const activeTab = activeTabsByTable.get(table.id);
            const isOccupied = !!activeTab || table.status === TableStatus.OCCUPIED || table.status === TableStatus.WAITING_PAYMENT;
            const hallName = hallNameMap.get(table.hallId) || 'Salão';
            const waiterName = activeTab ? getWaiterDisplayName(activeTab) : null;

            return (
              <div
                key={table.id}
                className={`bg-white rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden ${
                  isOccupied 
                    ? 'border-rose-200 bg-gradient-to-b from-rose-50/20 to-white' 
                    : table.status === TableStatus.RESERVED
                    ? 'border-amber-200 bg-amber-50/10'
                    : 'border-stone-200'
                }`}
              >
                {/* Status Indicator Stripe */}
                <div 
                  className={`absolute top-0 left-0 right-0 h-1 ${
                    isOccupied 
                      ? 'bg-rose-500' 
                      : table.status === TableStatus.RESERVED
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                />

                <div className="space-y-3">
                  {/* Table Name & Hall Header */}
                  <div className="flex items-start justify-between gap-2 pt-1">
                    <div className="min-w-0">
                      <span className="text-xs font-bold tracking-wider text-stone-400 block truncate">
                        {hallName}
                      </span>
                      <h3 className="font-extrabold text-stone-900 text-base truncate">
                        {table.name}
                      </h3>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      {isOccupied ? (
                        <Badge variant="danger">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
                          Ocupada
                        </Badge>
                      ) : table.status === TableStatus.RESERVED ? (
                        <Badge variant="warning">
                          Reservada
                        </Badge>
                      ) : (
                        <Badge variant="success">
                          Disponível
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Operational Details Block */}
                  <div className="bg-stone-50 rounded-xl p-2.5 space-y-1.5 text-xs text-stone-700">
                    {/* Capacity & People Count */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-stone-500">
                        <Users className="w-3.5 h-3.5" />
                        <span>Capacidade: <strong>{table.capacity}</strong></span>
                      </div>

                      {activeTab && (
                        <div className="font-bold text-stone-900 bg-stone-200/60 px-2 py-0.5 rounded-md">
                          👥 {activeTab.peopleCount || 1} {activeTab.peopleCount === 1 ? 'pessoa' : 'pessoas'}
                        </div>
                      )}
                    </div>

                    {/* Waiter info if active tab */}
                    {activeTab && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60">
                        <span className="text-stone-500 flex items-center gap-1">
                          <User className="w-3 h-3 text-stone-400" /> Garçom:
                        </span>
                        <span className="font-bold text-stone-800 truncate max-w-[120px]">
                          {waiterName}
                        </span>
                      </div>
                    )}

                    {/* Time & Duration if active tab */}
                    {activeTab && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60">
                        <span className="text-stone-500 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-stone-400" /> Abertura / Tempo:
                        </span>
                        <span className="font-bold text-rose-700">
                          {formatTimeOnly(activeTab.openedAt)} ({getElapsedTimeFormatted(activeTab.openedAt)})
                        </span>
                      </div>
                    )}

                    {/* Partial Total Value */}
                    {activeTab && (
                      <div className="flex items-center justify-between text-xs font-bold pt-1 border-t border-stone-200">
                        <span className="text-stone-600 flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Valor Parcial:
                        </span>
                        <span className="text-emerald-700 font-extrabold text-sm">
                          {formatCurrency(activeTab.totalInCents, true)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="pt-3 mt-2 border-t border-stone-100 flex items-center gap-2">
                  {isOccupied ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenTabDetails(table, activeTab);
                      }}
                      className="w-full py-2.5 px-3 bg-stone-900 hover:bg-stone-800 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 min-h-[44px] active:scale-95 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Ver atendimento</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartService(table);
                      }}
                      className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 min-h-[44px] active:scale-95 cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-white" />
                      <span>Iniciar atendimento</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Open Tab Modal */}
      <OpenTabModal
        isOpen={isOpenTabModalOpen}
        table={selectedTableForOpenTab}
        hallName={halls.find(h => h.id === selectedTableForOpenTab?.hallId)?.name}
        waiters={waiters}
        onClose={() => {
          setIsOpenTabModalOpen(false);
          setSelectedTableForOpenTab(null);
        }}
        onSuccess={(tabId) => {
          setActionNotice({
            title: 'Comanda Aberta com Sucesso!',
            message: `A comanda da mesa ${selectedTableForOpenTab?.name || ''} foi aberta com sucesso. A mesa agora está ocupada.`
          });
        }}
      />

      {/* Tab Details Modal (Prompt 4.5.1) */}
      <TabDetailsModal
        isOpen={isDetailsOpen}
        table={detailsTable}
        tab={detailsTab}
        hallName={halls.find(h => h.id === detailsTable?.hallId)?.name}
        waiterName={detailsTab?.waiterName || (detailsTab ? getWaiterDisplayName(detailsTab) : undefined)}
        onClose={() => {
          setIsDetailsOpen(false);
          setDetailsTable(null);
          setDetailsTab(null);
        }}
        onSuccessClose={() => {
          setActionNotice({
            title: 'Conta Finalizada com Sucesso!',
            message: 'O pagamento foi registrado no caixa, a comanda foi encerrada e a mesa está liberada.'
          });
        }}
        onOpenCatalog={(tbl, tb) => {
          setIsDetailsOpen(false);
          handleOpenCatalog(tbl, tb);
        }}
        onOpenTransferTable={(tbl, tb) => {
          setIsDetailsOpen(false);
          setSourceTableForTransfer(tbl);
          setSourceTabForTransfer(tb);
          setIsTransferOpen(true);
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

      {/* Operational Tab Item Catalog Modal */}
      <TabCatalogModal
        isOpen={isCatalogOpen}
        table={catalogTable}
        tab={catalogTab}
        hallName={halls.find(h => h.id === catalogTable?.hallId)?.name}
        onClose={() => {
          setIsCatalogOpen(false);
          setCatalogTable(null);
          setCatalogTab(null);
        }}
        onConfirmDraft={(draftItems) => {
          const count = draftItems.reduce((acc, i) => acc + i.quantity, 0);
          setActionNotice({
            title: 'Itens Selecionados no Rascunho',
            message: `Foram selecionados ${count} item(ns) para a mesa ${catalogTable?.name || ''}. Nenhum pedido foi salvo no banco nesta etapa de catálogo.`
          });
        }}
      />

      {/* Transfer Table Modal (Prompt 4.7.1) */}
      <TransferTableModal
        isOpen={isTransferOpen}
        sourceTable={sourceTableForTransfer}
        sourceTab={sourceTabForTransfer}
        tables={tables}
        halls={halls}
        onClose={() => {
          setIsTransferOpen(false);
          setSourceTableForTransfer(null);
          setSourceTabForTransfer(null);
        }}
        onSuccess={() => {
          setActionNotice({
            title: 'Mesa Transferida com Sucesso!',
            message: `A comanda foi transferida com sucesso para a nova mesa.`
          });
        }}
      />

      {/* Transfer Items Modal (Prompt 4.7.2) */}
      <TransferItemsModal
        isOpen={isTransferItemsOpen}
        sourceTab={sourceTabForTransferItems}
        sourceTable={sourceTableForTransferItems}
        activeTabs={activeTabs}
        tables={tables}
        onClose={() => {
          setIsTransferItemsOpen(false);
          setSourceTabForTransferItems(null);
          setSourceTableForTransferItems(null);
        }}
        onSuccess={() => {
          setActionNotice({
            title: 'Itens Transferidos com Sucesso!',
            message: `Os itens selecionados foram transferidos com sucesso para a nova comanda.`
          });
        }}
      />

      {/* Merge/Union of Tabs Modal (Prompt 4.7.3) */}
      <MergeTabsModal
        isOpen={isMergeOpen}
        mainTab={mainTabForMerge}
        mainTable={mainTableForMerge}
        activeTabs={activeTabs}
        tables={tables}
        onClose={() => {
          setIsMergeOpen(false);
          setMainTabForMerge(null);
          setMainTableForMerge(null);
        }}
        onSuccess={() => {
          setActionNotice({
            title: 'Mesas Unificadas com Sucesso!',
            message: `As comandas e mesas selecionadas foram integradas com sucesso à comanda principal.`
          });
        }}
      />

      {/* Split/Separation of Tabs Modal (Prompt 4.7.4) */}
      <SplitTabsModal
        isOpen={isSplitOpen}
        mainTab={mainTabForSplit}
        mainTable={mainTableForSplit}
        onClose={() => {
          setIsSplitOpen(false);
          setMainTabForSplit(null);
          setMainTableForSplit(null);
        }}
        onSuccess={() => {
          setActionNotice({
            title: 'Mesas Separadas com Sucesso!',
            message: `As mesas selecionadas foram desmembradas com sucesso da mesa principal, com suas comandas e itens restabelecidos.`
          });
        }}
      />

      {/* Action Notice Modal */}
      {actionNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Info className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-stone-900">{actionNotice.title}</h3>
              <p className="text-xs sm:text-sm text-stone-600 mt-2 leading-relaxed">
                {actionNotice.message}
              </p>
            </div>

            <button
              onClick={() => setActionNotice(null)}
              className="w-full py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
