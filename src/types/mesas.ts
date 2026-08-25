export type MesaStatus = 'livre' | 'ocupada' | 'reservada' | 'atendimento';

export interface Mesa {
  id: string;
  restaurantId: string;
  numero: number;
  status: MesaStatus;
  capacidade: number;
  garcomId?: string | null;
  comandaId?: string | null; // active comanda/command
  createdAt: any;
  updatedAt?: any;
}

export type GarcomStatus = 'ativo' | 'inativo';

export interface Garcom {
  id: string;
  restaurantId: string;
  nome: string;
  email: string;
  telefone?: string;
  status: GarcomStatus;
  createdAt: any;
}

export type ComandaStatus = 'aberta' | 'fechada' | 'paga' | 'cancelada';

export type ComandaItemStatus = 'pendente' | 'em_preparo' | 'entregue' | 'cancelado';

export interface ComandaItem {
  id: string;
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  precoUnitario: number;
  total: number;
  status: ComandaItemStatus;
  observacoes?: string;
  pedidosAdicionais?: any[]; // option details, sizes, extras
}

export type DivisaoTipo = 'igual' | 'por_item' | 'individual';

export interface PagamentoDivisao {
  id: string;
  valor: number;
  formaPagamento: string;
  pagoEm: any;
  identificacaoPessoa?: string;
}

export interface DivisaoContaInfo {
  tipo: DivisaoTipo;
  numeroPessoas: number;
  valorPorPessoa: number;
  totalComanda: number;
  pagos: PagamentoDivisao[];
  restantePagar: number;
}

export interface Comanda {
  id: string;
  restaurantId: string;
  mesaId: string;
  mesaNumero: number;
  garcomId: string;
  garcomNome: string;
  status: ComandaStatus;
  itens: ComandaItem[];
  subtotal: number;
  taxaServico: number; // e.g. 10%
  total: number;
  divisaoConta?: DivisaoContaInfo | null;
  createdAt: any;
  fechadaAt?: any;
  pagaAt?: any;
}

export interface TransferenciaMesaHistorico {
  id: string;
  restaurantId: string;
  comandaId: string;
  mesaOrigemId: string;
  mesaOrigemNumero: number;
  mesaDestinoId: string;
  mesaDestinoNumero: number;
  transferidoPorUserId: string;
  transferidoPorUserName: string;
  transferidoEm: any;
  motivo?: string;
}

// FASE 4 - ESTRUTURA CANÔNICA

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  RESERVED = 'RESERVED',
  WAITING_PAYMENT = 'WAITING_PAYMENT',
  CLEANING = 'CLEANING',
  DISABLED = 'DISABLED'
}

export enum TabStatus {
  OPEN = 'OPEN',
  WAITING_ITEMS = 'WAITING_ITEMS',
  WAITING_PAYMENT = 'WAITING_PAYMENT',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED'
}

export enum ServiceOrigin {
  TABLE = 'TABLE',
  WAITER = 'WAITER',
  COUNTER = 'COUNTER',
  DELIVERY = 'DELIVERY',
  TAKEAWAY = 'TAKEAWAY'
}

export interface Hall {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  sortOrder: number;
  active: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface Table {
  id: string;
  restaurantId: string;
  hallId: string;
  name: string;
  number?: number;
  capacity: number;
  status: TableStatus;
  sortOrder: number;
  active: boolean;
  qrToken?: string;
  createdAt: any;
  updatedAt: any;
}

export interface TabItem {
  id: string;
  orderId?: string;
  produtoId?: string;
  produtoNome?: string;
  productName?: string;
  quantidade: number;
  precoUnitario?: number;
  unitPriceCents?: number;
  total?: number;
  totalPriceCents?: number;
  status?: string;
  observacoes?: string;
  pedidosAdicionais?: {
    size?: { id: string; nome: string; precoCents?: number } | null;
    options?: Array<{ groupId?: string; groupNome?: string; itemId?: string; itemNome?: string; precoCents?: number }>;
  };
  sentAt?: string;
}

export interface Tab {
  id: string;
  restaurantId: string;
  tableId?: string;
  tableName?: string;
  tableNumber?: number | string;
  hallId?: string;
  waiterId?: string;
  waiterName?: string;
  customerName?: string;
  observation?: string;
  peopleCount: number;
  status: TabStatus;
  origin: ServiceOrigin;
  openedAt: any;
  closedAt?: any;
  openedBy: string; // User ID or waiter ID/name who opened
  items?: TabItem[];
  subtotal?: number;
  total?: number;
  totalInCents: number;
  paidInCents: number;
  remainingInCents: number;
  mergedTables?: any[];
  createdAt: any;
  updatedAt: any;
}
