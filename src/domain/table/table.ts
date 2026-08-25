import { Table, TableStatus } from '../../types/mesas';

export type CreateTableInput = {
  restaurantId: string;
  hallId: string;
  name: string;
  number?: number;
  capacity: number;
  status?: TableStatus;
  sortOrder?: number;
  active?: boolean;
  qrToken?: string;
};

export type UpdateTableInput = Partial<Omit<Table, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>;

export interface TableValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTableInput(input: Partial<CreateTableInput>): TableValidationResult {
  const errors: string[] = [];

  if (!input.restaurantId || typeof input.restaurantId !== 'string' || !input.restaurantId.trim()) {
    errors.push('restaurantId é obrigatório');
  }

  if (!input.hallId || typeof input.hallId !== 'string' || !input.hallId.trim()) {
    errors.push('hallId é obrigatório');
  }

  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    errors.push('nome é obrigatório');
  }

  if (input.number !== undefined && (typeof input.number !== 'number' || isNaN(input.number))) {
    errors.push('number deve ser um número válido');
  }

  if (input.capacity === undefined || typeof input.capacity !== 'number' || isNaN(input.capacity) || input.capacity <= 0) {
    errors.push('capacity é obrigatória e deve ser maior que zero');
  }

  if (input.status !== undefined && !Object.values(TableStatus).includes(input.status)) {
    errors.push('status inválido');
  }

  if (input.sortOrder !== undefined && (typeof input.sortOrder !== 'number' || isNaN(input.sortOrder))) {
    errors.push('sortOrder deve ser um número válido');
  }

  if (input.active !== undefined && typeof input.active !== 'boolean') {
    errors.push('active deve ser um booleano');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createTableData(input: CreateTableInput): Omit<Table, 'id'> {
  const validation = validateTableInput(input);
  if (!validation.valid) {
    throw new Error(`Dados inválidos para Mesa: ${validation.errors.join(', ')}`);
  }

  const now = new Date();

  const data: any = {
    restaurantId: input.restaurantId.trim(),
    hallId: input.hallId.trim(),
    name: input.name.trim(),
    capacity: input.capacity,
    status: input.status || TableStatus.AVAILABLE,
    sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : 0,
    active: input.active !== undefined ? Boolean(input.active) : true,
    createdAt: now,
    updatedAt: now,
  };

  if (input.number !== undefined) {
    data.number = input.number;
  }
  if (input.qrToken !== undefined) {
    data.qrToken = input.qrToken;
  }

  return data;
}
