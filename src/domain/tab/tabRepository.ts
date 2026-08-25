import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where,
  runTransaction,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Tab, TabStatus, TableStatus, ServiceOrigin, Table } from '../../types/mesas';
import { CreateTabInput, UpdateTabInput, createTabData } from './tab';
import { getTableById, normalizeTable as normalizeTableObj } from '../table/tableRepository';

export const ACTIVE_TAB_STATUSES: TabStatus[] = [
  TabStatus.OPEN,
  TabStatus.WAITING_ITEMS,
  TabStatus.WAITING_PAYMENT,
  TabStatus.PARTIALLY_PAID
];

export const ACTIVE_TAB_STATUSES_AND_ALIASES = [
  'OPEN', 'open', 'aberta', 'ABERTA',
  'WAITING_ITEMS', 'waiting_items', 'atendimento', 'ATENDIMENTO',
  'WAITING_PAYMENT', 'waiting_payment', 'aguardando', 'aguardando_pagamento', 'AGUARDANDO_PAGAMENTO',
  'PARTIALLY_PAID', 'partially_paid', 'parcialmente_paga', 'PARCIALMENTE_PAGA'
];

export function normalizeTab(id: string, data: any): Tab {
  if (!data) {
    return {
      id,
      restaurantId: '',
      status: TabStatus.CLOSED,
      totalInCents: 0,
      paidInCents: 0,
      openedAt: new Date()
    } as Tab;
  }

  let status = TabStatus.CLOSED;
  const rawStatus = String(data.status || '').toUpperCase().trim();

  if (['OPEN', 'ABERTA'].includes(rawStatus)) {
    status = TabStatus.OPEN;
  } else if (['WAITING_ITEMS', 'ATENDIMENTO'].includes(rawStatus)) {
    status = TabStatus.WAITING_ITEMS;
  } else if (['WAITING_PAYMENT', 'AGUARDANDO', 'AGUARDANDO_PAGAMENTO'].includes(rawStatus)) {
    status = TabStatus.WAITING_PAYMENT;
  } else if (['PARTIALLY_PAID', 'PARCIALMENTE_PAGA'].includes(rawStatus)) {
    status = TabStatus.PARTIALLY_PAID;
  } else if (['CLOSED', 'FECHADA'].includes(rawStatus)) {
    status = TabStatus.CLOSED;
  } else if (['CANCELLED', 'CANCELADA'].includes(rawStatus)) {
    status = TabStatus.CANCELLED;
  } else if (Object.values(TabStatus).includes(data.status as TabStatus)) {
    status = data.status as TabStatus;
  }

  const openedAt = data.openedAt || data.createdAt || data.data_criacao || data.opened_at || data.created_at || data.dataAbertura || data.abertaEm || null;
  const closedAt = data.closedAt || data.fechadaEm || data.closed_at || null;
  const updatedAt = data.updatedAt || data.atualizadoEm || data.updated_at || null;

  return {
    id,
    restaurantId: data.restaurantId || data.restaurante_id || data.restaurant_id || '',
    tableId: data.tableId || data.mesaId || '',
    hallId: data.hallId || data.salaoId || '',
    waiterId: data.waiterId || data.garcomId || '',
    customerName: data.customerName || data.nomeCliente || '',
    observation: data.observation || data.observacao || '',
    peopleCount: typeof data.peopleCount === 'number' ? data.peopleCount : (data.numeroPessoas || 1),
    status,
    totalInCents: typeof data.totalInCents === 'number' ? data.totalInCents : (data.valorTotalCentavos || 0),
    paidInCents: typeof data.paidInCents === 'number' ? data.paidInCents : (data.valorPagoCentavos || 0),
    openedAt,
    closedAt,
    updatedAt,
    origin: data.origin || 'TABLE',
    openedBy: data.openedBy || ''
  } as Tab;
}

function validateRestaurantId(restaurantId: string): void {
  if (!restaurantId || typeof restaurantId !== 'string' || !restaurantId.trim()) {
    throw new Error('restaurantId é obrigatório para esta operação');
  }
}

function validateTabId(id: string): void {
  if (!id || typeof id !== 'string' || !id.trim()) {
    throw new Error('id da comanda é obrigatório para esta operação');
  }
}

export async function getActiveTabByTable(tableId: string, restaurantId: string): Promise<Tab | null> {
  validateRestaurantId(restaurantId);
  if (!tableId || typeof tableId !== 'string' || !tableId.trim()) {
    throw new Error('tableId é obrigatório para buscar comanda ativa por mesa');
  }

  const tabsRef = collection(db, 'tabs');
  const q = query(
    tabsRef,
    where('restaurantId', '==', restaurantId.trim()),
    where('tableId', '==', tableId.trim()),
    where('status', 'in', ACTIVE_TAB_STATUSES_AND_ALIASES)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return null;
  }

  const docSnap = snapshot.docs[0];
  return normalizeTab(docSnap.id, docSnap.data());
}

export async function listOpenTabs(restaurantId: string): Promise<Tab[]> {
  validateRestaurantId(restaurantId);

  const tabsRef = collection(db, 'tabs');
  const q = query(
    tabsRef,
    where('restaurantId', '==', restaurantId.trim()),
    where('status', 'in', ACTIVE_TAB_STATUSES_AND_ALIASES),
    orderBy('openedAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => normalizeTab(docSnap.id, docSnap.data()));
}

export async function getTabById(id: string, restaurantId: string): Promise<Tab | null> {
  validateTabId(id);
  validateRestaurantId(restaurantId);

  // 1. Tentar fonte canônica /tabs/{id}
  const docRef = doc(db, 'tabs', id.trim());
  let docSnap = await getDoc(docRef);

  // 2. Se não existir, tentar fallback controlado para estrutura legada nested
  if (!docSnap.exists()) {
    const nestedRef = doc(db, 'restaurants', restaurantId.trim(), 'tabs', id.trim());
    docSnap = await getDoc(nestedRef);
  }

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();

  // Impedir acesso entre restaurantes diferente do informado
  if (data.restaurantId !== restaurantId.trim()) {
    throw new Error('Acesso negado: A comanda não pertence ao restaurante informado');
  }

  return normalizeTab(docSnap.id, data);
}

export async function createTab(input: CreateTabInput): Promise<Tab> {
  validateRestaurantId(input?.restaurantId);

  // Se houver mesa associada, validar se a mesa existe e pertence ao restaurante
  if (input.tableId && input.tableId.trim()) {
    const table = await getTableById(input.tableId, input.restaurantId);
    if (!table) {
      throw new Error('Mesa informada não foi encontrada ou não pertence a este restaurante');
    }
  }

  const tabData = createTabData(input);

  // Se houver mesa associada, executar via transação para garantir que não existam duas comandas ativas na mesma mesa
  if (tabData.tableId) {
    const newTabId = await runTransaction(db, async (transaction) => {
      const tabsRef = collection(db, 'tabs');
      const q = query(
        tabsRef,
        where('restaurantId', '==', tabData.restaurantId),
        where('tableId', '==', tabData.tableId),
        where('status', 'in', ACTIVE_TAB_STATUSES_AND_ALIASES)
      );

      const activeTabsSnapshot = await getDocs(q);
      if (!activeTabsSnapshot.empty) {
        throw new Error('Já existe uma comanda ativa para esta mesa');
      }

      const newTabRef = doc(collection(db, 'tabs'));
      transaction.set(newTabRef, tabData);
      return newTabRef.id;
    });

    return normalizeTab(newTabId, tabData);
  }

  // Sem mesa vinculada (ex: comanda individual / balcão)
  const newTabRef = doc(collection(db, 'tabs'));
  await runTransaction(db, async (transaction) => {
    transaction.set(newTabRef, tabData);
  });

  return normalizeTab(newTabRef.id, tabData);
}

export async function updateTabStatus(id: string, restaurantId: string, status: TabStatus): Promise<Tab> {
  validateTabId(id);
  validateRestaurantId(restaurantId);

  if (!status || !Object.values(TabStatus).includes(status)) {
    throw new Error('status é obrigatório e deve ser um TabStatus válido');
  }

  const existingTab = await getTabById(id, restaurantId);
  if (!existingTab) {
    throw new Error('Comanda não encontrada');
  }

  const now = new Date();
  const updateData: Record<string, any> = {
    status,
    updatedAt: now
  };

  if (status === TabStatus.CLOSED || status === TabStatus.CANCELLED) {
    updateData.closedAt = now;
  }

  const rootRef = doc(db, 'tabs', id.trim());
  const rootSnap = await getDoc(rootRef);
  if (rootSnap.exists()) {
    await updateDoc(rootRef, updateData);
  } else {
    const nestedRef = doc(db, 'restaurants', restaurantId.trim(), 'tabs', id.trim());
    await updateDoc(nestedRef, updateData);
  }

  const updatedTab = await getTabById(id, restaurantId);
  if (!updatedTab) {
    throw new Error('Erro ao recuperar comanda atualizada');
  }
  return updatedTab;
}

export async function closeTab(id: string, restaurantId: string): Promise<Tab> {
  return updateTabStatus(id, restaurantId, TabStatus.CLOSED);
}

export async function cancelTab(id: string, restaurantId: string): Promise<Tab> {
  return updateTabStatus(id, restaurantId, TabStatus.CANCELLED);
}

export function subscribeActiveTabs(
  restaurantId: string, 
  onNext: (tabs: Tab[]) => void, 
  onError?: (error: Error) => void
): () => void {
  validateRestaurantId(restaurantId);

  const tabsRef = collection(db, 'tabs');
  const q = query(
    tabsRef,
    where('restaurantId', '==', restaurantId.trim()),
    where('status', 'in', ACTIVE_TAB_STATUSES_AND_ALIASES)
  );

  return onSnapshot(
    q, 
    (snapshot) => {
      const tabsList = snapshot.docs.map(docSnap => normalizeTab(docSnap.id, docSnap.data()));
      onNext(tabsList);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export type OpenTabForTableParams = {
  restaurantId: string;
  tableId: string;
  peopleCount: number;
  openedBy: string;
  waiterId?: string;
  customerName?: string;
  observation?: string;
};

export async function openTabForTable(params: OpenTabForTableParams): Promise<{ tab: Tab; table: Table }> {
  const { restaurantId, tableId, peopleCount, openedBy, waiterId, customerName, observation } = params;

  validateRestaurantId(restaurantId);

  if (!tableId || typeof tableId !== 'string' || !tableId.trim()) {
    throw new Error('tableId é obrigatório para abrir comanda');
  }

  if (
    peopleCount === undefined ||
    typeof peopleCount !== 'number' ||
    isNaN(peopleCount) ||
    !Number.isInteger(peopleCount) ||
    peopleCount <= 0
  ) {
    throw new Error('peopleCount é obrigatório e deve ser um número inteiro maior que zero');
  }

  if (!openedBy || typeof openedBy !== 'string' || !openedBy.trim()) {
    throw new Error('openedBy é obrigatório para identificar quem abriu a comanda');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuário não autenticado.');
  }

  const token = await currentUser.getIdToken();
  const response = await fetch('/api/restaurant/tab/open-for-table', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      tableId,
      peopleCount,
      waiterId,
      customerName,
      observation
    })
  });

  const data = await response.json().catch(() => ({}));
  if (response.ok && data.success && data.tab) {
    return { 
      tab: normalizeTab(data.tab.id || data.tab._id || tableId, data.tab), 
      table: normalizeTableObj(data.table?.id || tableId, data.table) 
    };
  }

  throw new Error(data.message || data.error || 'Não foi possível abrir a comanda. Verifique sua conexão e tente novamente.');
}

export function isTabOlderThan12Hours(openedAt: any): boolean {
  if (!openedAt) return false;
  let date: Date | null = null;
  if (typeof openedAt.toDate === 'function') {
    date = openedAt.toDate();
  } else if (openedAt instanceof Date) {
    date = openedAt;
  } else if (typeof openedAt === 'object') {
    if (typeof openedAt.seconds === 'number' && openedAt.seconds > 0) {
      date = new Date(openedAt.seconds * 1000 + Math.floor((openedAt.nanoseconds || 0) / 1000000));
    } else if (typeof openedAt._seconds === 'number' && openedAt._seconds > 0) {
      date = new Date(openedAt._seconds * 1000 + Math.floor((openedAt._nanoseconds || 0) / 1000000));
    }
  } else if (typeof openedAt === 'number') {
    if (isFinite(openedAt) && openedAt > 0) {
      const ms = openedAt < 1e11 ? openedAt * 1000 : openedAt;
      date = new Date(ms);
    }
  } else if (typeof openedAt === 'string') {
    const trimmed = openedAt.trim();
    if (trimmed) {
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        if (isFinite(num) && num > 0) {
          const ms = num < 1e11 ? num * 1000 : num;
          date = new Date(ms);
        }
      } else {
        date = new Date(trimmed);
      }
    }
  }

  if (!date || isNaN(date.getTime()) || date.getTime() <= 0 || date.getFullYear() < 2020) {
    return false;
  }

  const diffMs = Date.now() - date.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  return hours > 12;
}

export function getTabAgeInHours(openedAt: any): number | null {
  if (!openedAt) return null;
  let date: Date | null = null;
  if (typeof openedAt.toDate === 'function') {
    date = openedAt.toDate();
  } else if (openedAt instanceof Date) {
    date = openedAt;
  } else if (typeof openedAt === 'object') {
    if (typeof openedAt.seconds === 'number' && openedAt.seconds > 0) {
      date = new Date(openedAt.seconds * 1000 + Math.floor((openedAt.nanoseconds || 0) / 1000000));
    } else if (typeof openedAt._seconds === 'number' && openedAt._seconds > 0) {
      date = new Date(openedAt._seconds * 1000 + Math.floor((openedAt._nanoseconds || 0) / 1000000));
    }
  } else if (typeof openedAt === 'number') {
    if (isFinite(openedAt) && openedAt > 0) {
      const ms = openedAt < 1e11 ? openedAt * 1000 : openedAt;
      date = new Date(ms);
    }
  } else if (typeof openedAt === 'string') {
    const trimmed = openedAt.trim();
    if (trimmed) {
      if (/^\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        if (isFinite(num) && num > 0) {
          const ms = num < 1e11 ? num * 1000 : num;
          date = new Date(ms);
        }
      } else {
        date = new Date(trimmed);
      }
    }
  }

  if (!date || isNaN(date.getTime()) || date.getTime() <= 0 || date.getFullYear() < 2020) {
    return null;
  }

  const diffMs = Date.now() - date.getTime();
  return Number((diffMs / (1000 * 60 * 60)).toFixed(1));
}

export interface PayTabPaymentParam {
  paymentMethodId: string;
  amount: number; // in cents
  amountCents?: number;
  isCents?: boolean;
}

export interface PayTabResponse {
  success: boolean;
  isFullySettled: boolean;
  status: TabStatus | string;
  totalInCents: number;
  paidInCents: number;
  remainingInCents: number;
  message: string;
}

export async function payAndCloseTab(params: {
  restaurantId: string;
  tabId: string;
  payments: PayTabPaymentParam[];
  observation?: string;
}): Promise<PayTabResponse> {
  const { restaurantId, tabId, payments, observation } = params;
  validateRestaurantId(restaurantId);

  if (!tabId || typeof tabId !== 'string' || !tabId.trim()) {
    throw new Error('tabId é obrigatório para receber pagamento da comanda');
  }

  if (!Array.isArray(payments) || payments.length === 0) {
    throw new Error('Informe ao menos uma forma de pagamento com valor');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuário não autenticado.');
  }

  const token = await currentUser.getIdToken();
  const response = await fetch('/api/restaurant/tab/pay-and-close', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      tabId: tabId.trim(),
      payments,
      observation
    })
  });

  const data = await response.json().catch(() => ({}));
  if (response.ok && data.success) {
    return data;
  }

  throw new Error(data.message || data.error || 'Não foi possível registrar o pagamento da comanda.');
}

export async function requestBillForTab(params: {
  restaurantId: string;
  tabId: string;
}): Promise<{ success: boolean; message: string; status: string }> {
  const { restaurantId, tabId } = params;
  validateRestaurantId(restaurantId);

  if (!tabId || typeof tabId !== 'string' || !tabId.trim()) {
    throw new Error('tabId é obrigatório para solicitar a conta');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Usuário não autenticado.');
  }

  const token = await currentUser.getIdToken();
  const response = await fetch('/api/restaurant/tab/request-bill', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      tabId: tabId.trim()
    })
  });

  const data = await response.json().catch(() => ({}));
  if (response.ok && data.success) {
    return data;
  }

  throw new Error(data.message || data.error || 'Não foi possível solicitar a conta da mesa.');
}

export const tabRepository = {
  normalizeTab,
  getActiveTabByTable,
  listOpenTabs,
  getTabById,
  createTab,
  openTabForTable,
  updateTabStatus,
  closeTab,
  cancelTab,
  payAndCloseTab,
  requestBillForTab,
  subscribeActiveTabs,
  isTabOlderThan12Hours,
  getTabAgeInHours
};
