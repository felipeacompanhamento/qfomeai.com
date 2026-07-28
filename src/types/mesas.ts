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
