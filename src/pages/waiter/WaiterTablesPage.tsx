import React, { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
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
  LoadingState, 
  EmptyState, 
  ErrorState, 
  InlineFeedback 
} from '../../components/ui';
import { 
  LayoutGrid, 
  Grid, 
  Layers, 
  Users, 
  User, 
  Clock, 
  Building, 
  Play 
} from 'lucide-react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { ReadyOrdersBanner } from './ReadyOrdersBanner';

const OpenTabModal = lazyWithRetry(() => import('../../components/tables/OpenTabModal'));
const TabDetailsModal = lazyWithRetry(() => import('../../components/tables/TabDetailsModal'));
const TabCatalogModal = lazyWithRetry(() => import('../../components/tables/TabCatalogModal'));
const TransferTableModal = lazyWithRetry(() => import('../../components/tables/TransferTableModal'));
const TransferItemsModal = lazyWithRetry(() => import('../../components/tables/TransferItemsModal'));
const MergeTabsModal = lazyWithRetry(() => import('../../components/tables/MergeTabsModal'));
const SplitTabsModal = lazyWithRetry(() => import('../../components/tables/SplitTabsModal'));

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

export function WaiterTablesPage() {
  const { user, profile } = useAuth();
  const { waiterConfig, attendedHalls, assignedTables } = useWaiter();
  const restaurantId = profile?.restaurantId;

  // Real-time Collections State
  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeTabs, setActiveTabs] = useState<Tab[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [selectedHallId, setSelectedHallId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Clock tick state to auto-update occupation time every 30 seconds
  const [, setTick] = useState<number>(0);

  // Open Tab Modal State
  const [isOpenTabModalOpen, setIsOpenTabModalOpen] = useState<boolean>(false);
  const [selectedTableForOpenTab, setSelectedTableForOpenTab] = useState<Table | null>(null);

  // Tab Details Modal State
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [detailsTable, setDetailsTable] = useState<Table | null>(null);
  const [detailsTab, setDetailsTab] = useState<Tab | null>(null);

  // Tab Catalog Modal State
  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);
  const [catalogTable, setCatalogTable] = useState<Table | null>(null);
  const [catalogTab, setCatalogTab] = useState<Tab | null>(null);

  // Transfer Table Modal State
  const [isTransferOpen, setIsTransferOpen] = useState<boolean>(false);
  const [sourceTableForTransfer, setSourceTableForTransfer] = useState<Table | null>(null);
  const [sourceTabForTransfer, setSourceTabForTransfer] = useState<Tab | null>(null);

  // Transfer Items Modal State
  const [isTransferItemsOpen, setIsTransferItemsOpen] = useState<boolean>(false);
  const [sourceTableForTransferItems, setSourceTableForTransferItems] = useState<Table | null>(null);
  const [sourceTabForTransferItems, setSourceTabForTransferItems] = useState<Tab | null>(null);

  // Merge Tabs Modal State
  const [isMergeOpen, setIsMergeOpen] = useState<boolean>(false);
  const [mainTableForMerge, setMainTableForMerge] = useState<Table | null>(null);
  const [mainTabForMerge, setMainTabForMerge] = useState<Tab | null>(null);

  // Split Tabs Modal State
  const [isSplitOpen, setIsSplitOpen] = useState<boolean>(false);
  const [mainTableForSplit, setMainTableForSplit] = useState<Table | null>(null);
  const [mainTabForSplit, setMainTabForSplit] = useState<Tab | null>(null);

  // Alert/Success Notification Toast at Page Level
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Auto timer to refresh occupation minutes
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(prev => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Realtime Subscriptions via Canonical Repositories
  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Subscribe to Halls via canonical hallRepository
    const unsubscribeHalls = hallRepository.subscribeHalls(
      restaurantId,
      (hallsList) => {
        setHalls(hallsList);
      },
      (err) => {
        console.warn('Erro no listener de salões:', err);
      }
    );

    // 2. Subscribe to Tables via canonical tableRepository
    const unsubscribeTables = tableRepository.subscribeTablesByRestaurant(
      restaurantId,
      (tablesList) => {
        setTables(tablesList);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn('Erro no listener de mesas:', err);
        setLoading(false);
        // Do not clear or error screen if cached data exists
        setTables(prev => {
          if (prev.length === 0) {
            setError('Sem conexão para carregar as mesas. Verifique sua rede.');
          } else {
            setActionNotice({ type: 'info', message: 'Sem conexão em tempo real. Exibindo mesas em cache.' });
          }
          return prev;
        });
      }
    );

    // 3. Subscribe to Active Tabs via canonical tabRepository
    const unsubscribeTabs = tabRepository.subscribeActiveTabs(
      restaurantId,
      (tabsList) => {
        setActiveTabs(tabsList);
      },
      (err) => {
        console.warn('Erro no listener de comandas ativas:', err);
      }
    );

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

  // Map of active tabs by tabId
  const activeTabsById = useMemo(() => {
    const map = new Map<string, Tab>();
    activeTabs.forEach(tab => {
      if (tab.id) {
        map.set(tab.id, tab);
      }
    });
    return map;
  }, [activeTabs]);

  // Helper para localizar a comanda de uma mesa na ordem:
  // 1. tab.tableId === table.id
  // 2. table.comandaId === tab.id
  const getActiveTabForTable = useCallback((table: Table): Tab | undefined => {
    // 1. Prioridade 1: tab.tableId === table.id
    const tabByTableId = activeTabsByTable.get(table.id);
    if (tabByTableId) return tabByTableId;

    // 2. Prioridade 2: table.comandaId === tab.id
    const comandaId = (table as any).comandaId;
    if (comandaId) {
      const tabById = activeTabsById.get(comandaId);
      if (tabById) return tabById;
    }

    return undefined;
  }, [activeTabsByTable, activeTabsById]);

  // Map of halls by hallId
  const hallNameMap = useMemo(() => {
    const map = new Map<string, string>();
    halls.forEach(h => map.set(h.id, h.name));
    return map;
  }, [halls]);

  // Helper to resolve Waiter Name
  const getWaiterDisplayName = (tab: Tab): string => {
    if (tab.waiterName) return tab.waiterName;
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

    // Legacy protection: if attendedHalls only contains legacy default names that do not exist in the restaurant's actual halls, treat as unrestricted
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

  // Filter halls by allowed halls if attendedHalls exists
  const allowedHalls = useMemo(() => {
    if (effectiveAttendedHalls.length > 0) {
      return halls.filter(h => 
        effectiveAttendedHalls.includes(h.id.toLowerCase().trim()) || 
        effectiveAttendedHalls.includes(h.name.toLowerCase().trim())
      );
    }
    return halls;
  }, [halls, effectiveAttendedHalls]);

  // Filter tables by allowed tables or halls based on waiterConfig
  const allowedTables = useMemo(() => {
    let list = tables;
    
    // Filter by assignedTables if configured
    if (effectiveAssignedTables.length > 0) {
      list = list.filter(t => {
        const tableId = (t.id || '').trim().toLowerCase();
        const tableName = (t.name || '').trim().toLowerCase();
        const tableNum = t.number !== undefined && t.number !== null ? String(t.number).trim().toLowerCase() : '';
        return effectiveAssignedTables.includes(tableId) || 
               (tableName && effectiveAssignedTables.includes(tableName)) ||
               (tableNum && effectiveAssignedTables.includes(tableNum));
      });
    }

    // Also filter tables by allowed halls
    if (effectiveAttendedHalls.length > 0) {
      list = list.filter(t => {
        const tableHallId = (t.hallId || '').trim().toLowerCase();
        const hall = halls.find(h => h.id.trim().toLowerCase() === tableHallId);
        const hallName = hall ? hall.name.trim().toLowerCase() : '';
        return (tableHallId && effectiveAttendedHalls.includes(tableHallId)) || 
               (hallName && effectiveAttendedHalls.includes(hallName));
      });
    }

    return list;
  }, [tables, halls, effectiveAttendedHalls, effectiveAssignedTables]);

  // Final filtered list of tables to render
  const filteredTables = useMemo(() => {
    return allowedTables.filter(table => {
      // Selected Hall filter
      if (selectedHallId !== 'all' && table.hallId !== selectedHallId) {
        return false;
      }

      const activeTab = getActiveTabForTable(table);
      const derivedStatus = tableRepository.deriveTableOperationalState(table, activeTab);
      const isOccupied = (derivedStatus === TableStatus.OCCUPIED || derivedStatus === TableStatus.WAITING_PAYMENT || derivedStatus === 'PARTIALLY_PAID');

      // Status filter selection
      if (selectedStatus === 'available' && (isOccupied || derivedStatus !== TableStatus.AVAILABLE)) {
        return false;
      }
      if (selectedStatus === 'occupied' && !isOccupied) {
        return false;
      }
      if (selectedStatus === 'waiting_payment' && derivedStatus !== TableStatus.WAITING_PAYMENT && derivedStatus !== 'PARTIALLY_PAID') {
        return false;
      }

      return true;
    });
  }, [allowedTables, selectedHallId, selectedStatus, getActiveTabForTable]);

  // Metrics summary
  const metrics = useMemo(() => {
    let available = 0;
    let occupied = 0;
    let waitingPayment = 0;

    allowedTables.forEach(table => {
      const activeTab = getActiveTabForTable(table);
      const derivedStatus = tableRepository.deriveTableOperationalState(table, activeTab);
      const isOccupied = (derivedStatus === TableStatus.OCCUPIED || derivedStatus === TableStatus.WAITING_PAYMENT || derivedStatus === 'PARTIALLY_PAID');
      
      if (isOccupied) {
        occupied++;
        if (derivedStatus === TableStatus.WAITING_PAYMENT || derivedStatus === 'PARTIALLY_PAID') {
          waitingPayment++;
        }
      } else {
        available++;
      }
    });

    return { available, occupied, waitingPayment, total: allowedTables.length };
  }, [allowedTables, getActiveTabForTable]);

  const handleStartService = (table: Table) => {
    if (!waiterConfig.canOpenTab) {
      setActionNotice({
        type: 'error',
        message: 'Você não tem permissão operacional para abrir novas comandas.'
      });
      setTimeout(() => setActionNotice(null), 4000);
      return;
    }
    setSelectedTableForOpenTab(table);
    setIsOpenTabModalOpen(true);
  };

  const handleOpenTabDetails = (table: Table, tab: Tab | undefined) => {
    if (!tab) return;
    setDetailsTable(table);
    setDetailsTab(tab);
    setIsDetailsOpen(true);
  };

  // Safe Table Click handler based on derived operational state
  const handleTableClick = (table: Table, activeTab: Tab | undefined) => {
    const derivedStatus = tableRepository.deriveTableOperationalState(table, activeTab);

    if (derivedStatus === TableStatus.AVAILABLE) {
      handleStartService(table);
      return;
    }

    if (derivedStatus === TableStatus.OCCUPIED || derivedStatus === TableStatus.WAITING_PAYMENT || derivedStatus === 'PARTIALLY_PAID') {
      if (activeTab) {
        handleOpenTabDetails(table, activeTab);
      } else {
        setActionNotice({
          type: 'info',
          message: 'Esta mesa está marcada como ocupada, mas a comanda ativa ainda não foi localizada.'
        });
        setTimeout(() => setActionNotice(null), 5000);
      }
      return;
    }

    if (derivedStatus === TableStatus.RESERVED) {
      setActionNotice({
        type: 'info',
        message: 'Mesa reservada. Libere a reserva antes de abrir atendimento.'
      });
      setTimeout(() => setActionNotice(null), 4000);
      return;
    }

    if (derivedStatus === TableStatus.CLEANING) {
      setActionNotice({
        type: 'info',
        message: 'Mesa em limpeza. Aguarde a finalização da higienização.'
      });
      setTimeout(() => setActionNotice(null), 4000);
      return;
    }

    if (derivedStatus === TableStatus.DISABLED) {
      setActionNotice({
        type: 'error',
        message: 'Esta mesa está indisponível para atendimento.'
      });
      setTimeout(() => setActionNotice(null), 4000);
      return;
    }
  };

  // Helper to resolve status styling
  const getTableStatusInfo = (table: Table, activeTab: Tab | undefined) => {
    const derivedStatus = tableRepository.deriveTableOperationalState(table, activeTab);

    if (derivedStatus === TableStatus.WAITING_PAYMENT) {
      return {
        label: 'Aguardando',
        variant: 'warning' as const,
        bgClass: 'border-amber-200 bg-amber-50/20 hover:bg-amber-50/30',
        barClass: 'bg-amber-500'
      };
    }

    if (derivedStatus === 'PARTIALLY_PAID') {
      return {
        label: 'Parcialmente Paga',
        variant: 'warning' as const,
        bgClass: 'border-amber-200 bg-amber-50/20 hover:bg-amber-50/30',
        barClass: 'bg-amber-500'
      };
    }

    if (derivedStatus === TableStatus.OCCUPIED) {
      return {
        label: 'Ocupada',
        variant: 'danger' as const,
        bgClass: 'border-rose-200 bg-rose-50/20 hover:bg-rose-50/30',
        barClass: 'bg-rose-500'
      };
    }

    if (derivedStatus === TableStatus.RESERVED) {
      return {
        label: 'Reservada',
        variant: 'info' as const,
        bgClass: 'border-blue-200 bg-blue-50/20 hover:bg-blue-50/30',
        barClass: 'bg-blue-500'
      };
    }

    if (derivedStatus === TableStatus.CLEANING) {
      return {
        label: 'Limpeza',
        variant: 'info' as const,
        bgClass: 'border-stone-200 bg-stone-50/40 hover:bg-stone-50/60',
        barClass: 'bg-stone-400'
      };
    }

    if (derivedStatus === TableStatus.DISABLED) {
      return {
        label: 'Indisponível',
        variant: 'danger' as const,
        bgClass: 'border-stone-200 bg-stone-100/60 hover:bg-stone-100',
        barClass: 'bg-stone-500'
      };
    }

    if (derivedStatus === TableStatus.AVAILABLE) {
      return {
        label: 'Livre',
        variant: 'success' as const,
        bgClass: 'border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/30',
        barClass: 'bg-emerald-500'
      };
    }

    return {
      label: 'Status desconhecido',
      variant: 'neutral' as const,
      bgClass: 'border-stone-200 bg-white hover:bg-stone-50/50',
      barClass: 'bg-stone-300'
    };
  };

  return (
    <div className="space-y-4" id="waiter-tables-page">
      <PageHeader
        title="Mesas"
        description="Visualize o salão e acesse as mesas em atendimento."
        icon={LayoutGrid}
      />

      <ReadyOrdersBanner />

      {actionNotice && (
        <InlineFeedback
          type={actionNotice.type}
          message={actionNotice.message}
          className="mb-2 animate-in fade-in duration-200 text-xs"
        />
      )}

      {loading ? (
        <LoadingState message="Buscando mesas do salão..." />
      ) : (error && tables.length === 0) ? (
        <ErrorState message={error} />
      ) : (
        <div className="space-y-4">
          {/* Quick Stats Banner */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white p-3 rounded-2xl border border-stone-200/80 shadow-2xs text-center">
              <span className="text-xs font-bold text-stone-400 block uppercase tracking-tight">Total</span>
              <span className="text-sm font-extrabold text-stone-800">{metrics.total}</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-stone-200/80 shadow-2xs text-center">
              <span className="text-xs font-bold text-emerald-500 block uppercase tracking-tight">Livres</span>
              <span className="text-sm font-extrabold text-emerald-600">{metrics.available}</span>
            </div>
            <div className="bg-white p-3 rounded-2xl border border-stone-200/80 shadow-2xs text-center">
              <span className="text-xs font-bold text-rose-500 block uppercase tracking-tight">Ocupadas</span>
              <span className="text-sm font-extrabold text-rose-600">{metrics.occupied}</span>
            </div>
          </div>

          {/* Filter Pills for Halls */}
          <div className="bg-white border border-stone-200/80 p-3 rounded-2xl shadow-2xs space-y-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedHallId('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
                  selectedHallId === 'all'
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Todos os Salões</span>
              </button>

              {allowedHalls.map(hall => (
                <button
                  key={hall.id}
                  type="button"
                  onClick={() => setSelectedHallId(hall.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    selectedHallId === hall.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <span>{hall.name}</span>
                </button>
              ))}
            </div>

            {/* Quick Status filter & Grid/List view selector */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-100 gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedStatus('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-tight whitespace-nowrap transition-all cursor-pointer ${
                    selectedStatus === 'all'
                      ? 'bg-stone-800 text-white'
                      : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStatus('available')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-tight whitespace-nowrap transition-all cursor-pointer ${
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
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-tight whitespace-nowrap transition-all cursor-pointer ${
                    selectedStatus === 'occupied'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  Ocupadas
                </button>
              </div>

              <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg shrink-0">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'grid' ? 'bg-white text-emerald-600 shadow-2xs' : 'text-stone-400 hover:text-stone-600'
                  }`}
                  title="Modo Grade"
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    viewMode === 'list' ? 'bg-white text-emerald-600 shadow-2xs' : 'text-stone-400 hover:text-stone-600'
                  }`}
                  title="Modo Lista"
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Tables Render Zone */}
          {filteredTables.length === 0 ? (
            <div className="bg-white border border-stone-200/80 rounded-3xl p-8 shadow-2xs">
              <EmptyState
                title={tables.length > 0 && allowedTables.length === 0 ? "Restrição Operacional" : "Nenhuma Mesa Encontrada"}
                description={
                  tables.length > 0 && allowedTables.length === 0
                    ? "Nenhuma mesa corresponde às restrições configuradas para este garçom."
                    : "Nenhuma mesa foi encontrada com os filtros selecionados ou associada à sua conta."
                }
                icon={Grid}
              />
            </div>
          ) : (
            <div className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 gap-3 md:grid-cols-3'
                : 'flex flex-col gap-2.5'
            }>
              {filteredTables.map(table => {
                const activeTab = getActiveTabForTable(table);
                const derivedStatus = tableRepository.deriveTableOperationalState(table, activeTab);
                const isOccupied = (derivedStatus === TableStatus.OCCUPIED || derivedStatus === TableStatus.WAITING_PAYMENT || derivedStatus === 'PARTIALLY_PAID');
                const hallName = hallNameMap.get(table.hallId) || 'Salão';
                const statusInfo = getTableStatusInfo(table, activeTab);
                const waiterName = activeTab ? getWaiterDisplayName(activeTab) : null;
                const itemsCount = activeTab?.items?.reduce((sum, item) => sum + (item.quantidade || 0), 0) || 0;

                return (
                  <div
                    key={table.id}
                    onClick={() => handleTableClick(table, activeTab)}
                    className={`rounded-2xl border p-4 shadow-2xs hover:shadow-xs transition-all duration-200 relative overflow-hidden flex flex-col justify-between cursor-pointer min-h-[140px] md:min-h-[150px] active:scale-98 select-none ${statusInfo.bgClass}`}
                  >
                    {/* Color status bar indicator */}
                    <div className={`absolute top-0 left-0 right-0 h-1 ${statusInfo.barClass}`} />

                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-stone-400 block truncate">
                            {hallName}
                          </span>
                          <h3 className="font-extrabold text-stone-900 text-sm md:text-base truncate">
                            Mesa {table.name}
                          </h3>
                        </div>
                        <Badge variant={statusInfo.variant} size="sm" className="px-1.5 py-0 text-xs">
                          {statusInfo.label}
                        </Badge>
                      </div>

                      {/* Content block */}
                      <div className="text-xs text-stone-500 font-medium space-y-1">
                        <div className="flex items-center gap-1 justify-between">
                          <span className="flex items-center gap-0.5"><Users className="w-3.5 h-3.5 text-stone-400" /> Cap.</span>
                          <span className="font-bold text-stone-700">{table.capacity}</span>
                        </div>

                        {activeTab ? (
                          <>
                            {activeTab.peopleCount !== undefined && activeTab.peopleCount !== null && (
                              <div className="flex items-center gap-1 justify-between border-t border-stone-100 pt-1">
                                <span className="flex items-center gap-0.5">👥 Pessoas</span>
                                <span className="font-extrabold text-stone-700">{activeTab.peopleCount}</span>
                              </div>
                            )}

                            {waiterName && (
                              <div className="flex items-center gap-1 justify-between truncate">
                                <span className="flex items-center gap-0.5"><User className="w-3.5 h-3.5 text-stone-400" /> Garçom</span>
                                <span className="font-bold text-stone-700 truncate max-w-[80px]">{waiterName}</span>
                              </div>
                            )}

                            {activeTab.openedAt && (
                              <div className="flex items-center gap-1 justify-between flex-wrap">
                                <span className="flex items-center gap-0.5"><Clock className="w-3.5 h-3.5 text-stone-400" /> Tempo</span>
                                <div className="flex items-center gap-1">
                                  {tabRepository.isTabOlderThan12Hours(activeTab.openedAt) && (
                                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 border border-amber-200 px-1 py-0.2 rounded">
                                      Comanda antiga
                                    </span>
                                  )}
                                  <span className="font-semibold text-rose-600">{getElapsedTimeFormatted(activeTab.openedAt)}</span>
                                </div>
                              </div>
                            )}
                          </>
                        ) : isOccupied ? (
                          <div className="text-xs text-amber-600 font-medium italic pt-1 border-t border-stone-100">
                            Sincronizando comanda...
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Footer price / action */}
                    <div className="border-t border-stone-100 pt-2 mt-2 flex items-center justify-between gap-1">
                      {isOccupied ? (
                        activeTab ? (
                          <>
                            <div className="min-w-0">
                              <p className="text-xs text-emerald-600 font-bold uppercase tracking-tight leading-none">Total Parcial</p>
                              <p className="text-xs font-black text-emerald-700 truncate mt-0.5">
                                {waiterConfig.canViewPrices ? formatCurrency(activeTab.totalInCents ?? 0, true) : '***'}
                              </p>
                            </div>
                            <div className="text-xs font-bold bg-stone-100 px-2 py-0.5 rounded-md text-stone-600 shrink-0">
                              {itemsCount} itens
                            </div>
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-amber-600 italic">
                            Sincronizando comanda...
                          </span>
                        )
                      ) : (
                        <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 uppercase tracking-tight">
                          <Play className="w-3.5 h-3.5 fill-emerald-600 shrink-0" /> Iniciar
                        </span>
                      )}
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
                message: `Mesa ${selectedTableForOpenTab?.name || ''} aberta com sucesso! O atendimento foi iniciado.`
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
            table={detailsTable}
            tab={detailsTab}
            hallName={halls.find(h => h.id === detailsTable?.hallId)?.name}
            waiterName={detailsTab?.waiterName || (detailsTab ? getWaiterDisplayName(detailsTab) : undefined)}
            canViewPrices={waiterConfig.canViewPrices}
            canAddItems={waiterConfig.canOpenTab !== false}
            canCloseAccount={false}
            onClose={() => {
              setIsDetailsOpen(false);
              setDetailsTable(null);
              setDetailsTab(null);
            }}
            onSuccessClose={() => {
              setActionNotice({
                type: 'success',
                message: 'Conta finalizada e mesa liberada com sucesso!'
              });
              setTimeout(() => setActionNotice(null), 4000);
            }}
            onOpenCatalog={(tbl, tb) => {
              setIsDetailsOpen(false);
              setCatalogTable(tbl || detailsTable);
              setCatalogTab(tb || detailsTab);
              setIsCatalogOpen(true);
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

      {/* Transfer Table Modal */}
      <Suspense fallback={null}>
        {isTransferOpen && (
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
                type: 'success',
                message: `Mesa transferida com sucesso!`
              });
              setTimeout(() => setActionNotice(null), 4000);
            }}
          />
        )}
      </Suspense>

      {/* Transfer Items Modal */}
      <Suspense fallback={null}>
        {isTransferItemsOpen && (
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
                type: 'success',
                message: `Itens transferidos com sucesso!`
              });
              setTimeout(() => setActionNotice(null), 4000);
            }}
          />
        )}
      </Suspense>

      {/* Merge/Union of Tabs Modal */}
      <Suspense fallback={null}>
        {isMergeOpen && (
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
                type: 'success',
                message: `Mesas unificadas com sucesso!`
              });
              setTimeout(() => setActionNotice(null), 4000);
            }}
          />
        )}
      </Suspense>

      {/* Split/Separation of Tabs Modal */}
      <Suspense fallback={null}>
        {isSplitOpen && (
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
                type: 'success',
                message: `Mesas separadas com sucesso!`
              });
              setTimeout(() => setActionNotice(null), 4000);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

export default WaiterTablesPage;
