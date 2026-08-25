import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Table, TableStatus, Tab, TabStatus } from '../../types/mesas';
import { CreateTableInput, UpdateTableInput, createTableData } from './table';
import { getHallById } from '../hall/hallRepository';

/**
 * Normaliza um documento de mesa do Firestore para o tipo Table canônico.
 * Compatibiliza campos legados sem alterar o banco de dados.
 */
export function normalizeTable(id: string, data: any): Table {
  if (!data) {
    return {
      id,
      restaurantId: '',
      hallId: '',
      name: `Mesa ${id}`,
      number: 0,
      capacity: 2,
      status: TableStatus.AVAILABLE,
      active: true,
      sortOrder: 0
    } as Table;
  }

  const name = String(data.name || data.nome || data.number || data.numero || id).trim();
  const rawNum = data.number ?? data.numero;
  const parsedNum = typeof rawNum === 'number' ? rawNum : parseInt(rawNum || name, 10);
  const number = isNaN(parsedNum) ? 0 : parsedNum;

  const rawCap = data.capacity ?? data.capacidade;
  const capacity = (typeof rawCap === 'number' && rawCap > 0) ? rawCap : 2;

  const hallId = String(data.hallId || data.salaoId || data.hall_id || '').trim();
  const active = data.active !== false;

  // Normalização de status de mesa
  const rawStatus = String(data.status || '').toLowerCase().trim();
  let status: TableStatus = TableStatus.AVAILABLE;

  if (['occupied', 'ocupada', 'atendimento'].includes(rawStatus)) {
    status = TableStatus.OCCUPIED;
  } else if (['waiting_payment', 'aguardando', 'aguardando_pagamento'].includes(rawStatus)) {
    status = TableStatus.WAITING_PAYMENT;
  } else if (['reserved', 'reservada'].includes(rawStatus)) {
    status = TableStatus.RESERVED;
  } else if (['cleaning', 'limpeza'].includes(rawStatus)) {
    status = TableStatus.CLEANING;
  } else if (['disabled', 'inativa', 'desativada'].includes(rawStatus)) {
    status = TableStatus.DISABLED;
  } else if (['available', 'livre'].includes(rawStatus)) {
    status = TableStatus.AVAILABLE;
  } else if (Object.values(TableStatus).includes(data.status as TableStatus)) {
    status = data.status as TableStatus;
  }

  const sortOrder = typeof data.sortOrder === 'number' ? data.sortOrder : 0;
  const comandaId = data.comandaId || data.tabId || null;

  return {
    id,
    restaurantId: data.restaurantId || '',
    hallId,
    name,
    number,
    capacity,
    status,
    active,
    sortOrder,
    qrToken: data.qrToken,
    comandaId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  } as Table;
}

/**
 * Função derivada canônica para obter o estado operacional real de uma mesa
 * considerando tanto o status no documento da mesa quanto a comanda ativa associada.
 */
export function deriveTableOperationalState(
  table: Table, 
  activeTab: Tab | null | undefined
): TableStatus | 'PARTIALLY_PAID' | 'UNKNOWN' {
  // 1. WAITING_PAYMENT na tab ou mesa
  if (activeTab?.status === TabStatus.WAITING_PAYMENT || table?.status === TableStatus.WAITING_PAYMENT) {
    return TableStatus.WAITING_PAYMENT;
  }

  // 2. PARTIALLY_PAID na comanda ativa
  if (activeTab?.status === TabStatus.PARTIALLY_PAID) {
    return 'PARTIALLY_PAID';
  }

  // 3. activeTab OPEN / WAITING_ITEMS -> a mesa está Ocupada
  if (activeTab && (activeTab.status === TabStatus.OPEN || activeTab.status === TabStatus.WAITING_ITEMS)) {
    return TableStatus.OCCUPIED;
  }

  // 4. Se a mesa está salva como OCCUPIED no banco (mesmo sem tab carregada ainda) -> NUNCA classificar como Livre
  if (table?.status === TableStatus.OCCUPIED) {
    return TableStatus.OCCUPIED;
  }

  // 5. RESERVED
  if (table?.status === TableStatus.RESERVED) {
    return TableStatus.RESERVED;
  }

  // 6. CLEANING
  if (table?.status === TableStatus.CLEANING) {
    return TableStatus.CLEANING;
  }

  // 7. DISABLED
  if (table?.status === TableStatus.DISABLED) {
    return TableStatus.DISABLED;
  }

  // 8. AVAILABLE
  if (table?.status === TableStatus.AVAILABLE) {
    return TableStatus.AVAILABLE;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[TableStatus] Status desconhecido encontrado para a mesa ${table?.id}:`, table?.status);
  }

  return 'UNKNOWN';
}

function validateRestaurantId(restaurantId: string): void {
  if (!restaurantId || typeof restaurantId !== 'string' || !restaurantId.trim()) {
    throw new Error('restaurantId é obrigatório para esta operação');
  }
}

function validateTableId(id: string): void {
  if (!id || typeof id !== 'string' || !id.trim()) {
    throw new Error('id da mesa é obrigatório para esta operação');
  }
}

async function validateHallIdForRestaurant(hallId: string, restaurantId: string): Promise<void> {
  if (!hallId || typeof hallId !== 'string' || !hallId.trim()) {
    throw new Error('hallId é obrigatório');
  }
  const hall = await getHallById(hallId, restaurantId);
  if (!hall) {
    throw new Error('Salão informado não foi encontrado ou não pertence a este restaurante');
  }
}

export async function listTablesByRestaurant(restaurantId: string): Promise<Table[]> {
  validateRestaurantId(restaurantId);

  const tablesRef = collection(db, 'tables');
  // Buscar somente por restaurantId (sem orderBy) para incluir registros legados sem sortOrder
  const q = query(
    tablesRef, 
    where('restaurantId', '==', restaurantId.trim())
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(docSnap => normalizeTable(docSnap.id, docSnap.data()))
    .filter(t => t.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function listTablesByHall(hallId: string, restaurantId: string): Promise<Table[]> {
  validateRestaurantId(restaurantId);
  await validateHallIdForRestaurant(hallId, restaurantId);

  const tablesRef = collection(db, 'tables');
  const q = query(
    tablesRef, 
    where('restaurantId', '==', restaurantId.trim()),
    where('hallId', '==', hallId.trim())
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(docSnap => normalizeTable(docSnap.id, docSnap.data()))
    .filter(t => t.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

export async function getTableById(id: string, restaurantId: string): Promise<Table | null> {
  validateTableId(id);
  validateRestaurantId(restaurantId);

  const docRef = doc(db, 'tables', id.trim());
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();

  // Impedir acesso entre restaurantes diferente do informado
  if (data.restaurantId !== restaurantId.trim()) {
    throw new Error('Acesso negado: A mesa não pertence ao restaurante informado');
  }

  return normalizeTable(docSnap.id, data);
}

export async function createTable(input: CreateTableInput): Promise<Table> {
  validateRestaurantId(input?.restaurantId);
  await validateHallIdForRestaurant(input?.hallId, input?.restaurantId);

  const tableData = createTableData(input);
  const tablesRef = collection(db, 'tables');
  const docRef = await addDoc(tablesRef, tableData);

  return normalizeTable(docRef.id, tableData);
}

export async function updateTable(id: string, restaurantId: string, input: UpdateTableInput): Promise<Table> {
  validateTableId(id);
  validateRestaurantId(restaurantId);

  // Verificar existência e propriedade da mesa no restaurante
  const existingTable = await getTableById(id, restaurantId);
  if (!existingTable) {
    throw new Error('Mesa não encontrada');
  }

  const updateData: Record<string, any> = {
    updatedAt: new Date()
  };

  if (input.hallId !== undefined) {
    await validateHallIdForRestaurant(input.hallId, restaurantId);
    updateData.hallId = input.hallId.trim();
  }

  if (input.name !== undefined) {
    if (!input.name || !input.name.trim()) {
      throw new Error('Nome da mesa não pode ser vazio');
    }
    updateData.name = input.name.trim();
  }

  if (input.number !== undefined) {
    if (typeof input.number !== 'number' || isNaN(input.number)) {
      throw new Error('number deve ser um número válido');
    }
    updateData.number = input.number;
  }

  if (input.capacity !== undefined) {
    if (typeof input.capacity !== 'number' || isNaN(input.capacity) || input.capacity <= 0) {
      throw new Error('capacity deve ser um número maior que zero');
    }
    updateData.capacity = input.capacity;
  }

  if (input.status !== undefined) {
    if (!Object.values(TableStatus).includes(input.status)) {
      throw new Error('status de mesa inválido');
    }
    updateData.status = input.status;
  }

  if (input.sortOrder !== undefined) {
    if (typeof input.sortOrder !== 'number' || isNaN(input.sortOrder)) {
      throw new Error('sortOrder deve ser um número válido');
    }
    updateData.sortOrder = input.sortOrder;
  }

  if (input.active !== undefined) {
    updateData.active = Boolean(input.active);
  }

  if (input.qrToken !== undefined) {
    updateData.qrToken = input.qrToken;
  }

  const docRef = doc(db, 'tables', id.trim());
  await updateDoc(docRef, updateData);

  const updatedSnap = await getDoc(docRef);
  return normalizeTable(updatedSnap.id, updatedSnap.data());
}

export async function activateTable(id: string, restaurantId: string): Promise<Table> {
  return updateTable(id, restaurantId, { active: true });
}

export async function deactivateTable(id: string, restaurantId: string): Promise<Table> {
  // Desativação lógica (soft delete) com active=false, sem exclusão física
  return updateTable(id, restaurantId, { active: false });
}

export async function updateTableStatus(id: string, restaurantId: string, status: TableStatus): Promise<Table> {
  if (!status || !Object.values(TableStatus).includes(status)) {
    throw new Error('status é obrigatório e deve ser um TableStatus válido');
  }
  return updateTable(id, restaurantId, { status });
}

export async function updateTableSortOrder(id: string, restaurantId: string, sortOrder: number): Promise<Table> {
  if (sortOrder === undefined || typeof sortOrder !== 'number' || isNaN(sortOrder)) {
    throw new Error('sortOrder é obrigatório e deve ser um número válido');
  }
  return updateTable(id, restaurantId, { sortOrder });
}

export function subscribeTablesByRestaurant(
  restaurantId: string, 
  onNext: (tables: Table[]) => void, 
  onError?: (error: Error) => void
): () => void {
  validateRestaurantId(restaurantId);

  const tablesRef = collection(db, 'tables');
  // Buscar somente por restaurantId (sem orderBy) para que mesas sem sortOrder apareçam obrigatoriamente
  const q = query(
    tablesRef, 
    where('restaurantId', '==', restaurantId.trim())
  );

  return onSnapshot(
    q, 
    (snapshot) => {
      const tablesList = snapshot.docs
        .map(docSnap => normalizeTable(docSnap.id, docSnap.data()))
        .filter(t => t.active !== false)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      onNext(tablesList);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export const tableRepository = {
  normalizeTable,
  deriveTableOperationalState,
  listTablesByRestaurant,
  listTablesByHall,
  getTableById,
  createTable,
  updateTable,
  activateTable,
  deactivateTable,
  updateTableStatus,
  updateTableSortOrder,
  subscribeTablesByRestaurant
};

