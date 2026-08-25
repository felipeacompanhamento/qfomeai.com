import { Tab, TabStatus, ServiceOrigin } from '../../types/mesas';

export type CreateTabInput = {
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
  status?: TabStatus;
  origin?: ServiceOrigin;
  openedBy: string;
  totalInCents?: number;
  paidInCents?: number;
};

export type UpdateTabInput = Partial<Omit<Tab, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>;

export interface TabValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTabInput(input: Partial<CreateTabInput>): TabValidationResult {
  const errors: string[] = [];

  if (!input.restaurantId || typeof input.restaurantId !== 'string' || !input.restaurantId.trim()) {
    errors.push('restaurantId é obrigatório');
  }

  if (!input.openedBy || typeof input.openedBy !== 'string' || !input.openedBy.trim()) {
    errors.push('openedBy é obrigatório');
  }

  if (
    input.peopleCount === undefined ||
    typeof input.peopleCount !== 'number' ||
    isNaN(input.peopleCount) ||
    !Number.isInteger(input.peopleCount) ||
    input.peopleCount <= 0
  ) {
    errors.push('peopleCount é obrigatório, deve ser um inteiro maior que zero');
  }

  if (input.totalInCents !== undefined) {
    if (typeof input.totalInCents !== 'number' || isNaN(input.totalInCents) || !Number.isInteger(input.totalInCents) || input.totalInCents < 0) {
      errors.push('totalInCents deve ser um número inteiro em centavos maior ou igual a zero');
    }
  }

  if (input.paidInCents !== undefined) {
    if (typeof input.paidInCents !== 'number' || isNaN(input.paidInCents) || !Number.isInteger(input.paidInCents) || input.paidInCents < 0) {
      errors.push('paidInCents deve ser um número inteiro em centavos maior ou igual a zero');
    }
  }

  if (input.status !== undefined && !Object.values(TabStatus).includes(input.status)) {
    errors.push('status da comanda é inválido');
  }

  if (input.origin !== undefined && !Object.values(ServiceOrigin).includes(input.origin)) {
    errors.push('origem do serviço é inválida');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function calculateTabRemainingInCents(totalInCents: number, paidInCents: number): number {
  return Math.max(0, Math.floor(totalInCents) - Math.floor(paidInCents));
}

export function createTabData(input: CreateTabInput): Omit<Tab, 'id'> {
  const validation = validateTabInput(input);
  if (!validation.valid) {
    throw new Error(`Dados inválidos para Comanda: ${validation.errors.join(', ')}`);
  }

  const now = new Date();
  const totalInCents = input.totalInCents ?? 0;
  const paidInCents = input.paidInCents ?? 0;
  const remainingInCents = calculateTabRemainingInCents(totalInCents, paidInCents);

  const data: any = {
    restaurantId: input.restaurantId.trim(),
    status: input.status || TabStatus.OPEN,
    origin: input.origin || ServiceOrigin.TABLE,
    openedAt: now,
    openedBy: input.openedBy.trim(),
    totalInCents,
    paidInCents,
    remainingInCents,
    createdAt: now,
    updatedAt: now,
  };

  if (input.tableId) {
    data.tableId = input.tableId.trim();
  }
  if (input.tableName) {
    data.tableName = input.tableName.trim();
  }
  if (input.tableNumber !== undefined && input.tableNumber !== null) {
    data.tableNumber = input.tableNumber;
  }
  if (input.hallId) {
    data.hallId = input.hallId.trim();
  }
  if (input.waiterId) {
    data.waiterId = input.waiterId.trim();
  }
  if (input.waiterName) {
    data.waiterName = input.waiterName.trim();
  }
  if (input.customerName) {
    data.customerName = input.customerName.trim();
  }
  if (input.observation) {
    data.observation = input.observation.trim();
  }
  if (input.peopleCount !== undefined) {
    data.peopleCount = input.peopleCount;
  }

  return data;
}
