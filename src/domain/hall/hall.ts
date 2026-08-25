import { Hall } from '../../types/mesas';

export type CreateHallInput = {
  restaurantId: string;
  name: string;
  description?: string;
  sortOrder?: number;
  active?: boolean;
};

export type UpdateHallInput = Partial<Omit<Hall, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>;

export interface HallValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateHallInput(input: Partial<CreateHallInput>): HallValidationResult {
  const errors: string[] = [];

  if (!input.restaurantId || typeof input.restaurantId !== 'string' || !input.restaurantId.trim()) {
    errors.push('restaurantId é obrigatório');
  }

  if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
    errors.push('nome é obrigatório');
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

export function createHallData(input: CreateHallInput): Omit<Hall, 'id'> {
  const validation = validateHallInput(input);
  if (!validation.valid) {
    throw new Error(`Dados inválidos para Salão: ${validation.errors.join(', ')}`);
  }

  const now = new Date();

  return {
    restaurantId: input.restaurantId.trim(),
    name: input.name.trim(),
    description: input.description ? input.description.trim() : '',
    sortOrder: typeof input.sortOrder === 'number' ? input.sortOrder : 0,
    active: input.active !== undefined ? Boolean(input.active) : true,
    createdAt: now,
    updatedAt: now,
  };
}
