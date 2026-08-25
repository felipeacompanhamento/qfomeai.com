import { describe, it, expect } from 'vitest';
import { openTabForTable } from './tabRepository';

describe('openTabForTable Backend Rules', () => {
  it('1. Rejeita restaurantId vazio', async () => {
    await expect(openTabForTable({
      restaurantId: '',
      tableId: 'table_01',
      peopleCount: 2,
      openedBy: 'waiter_01'
    })).rejects.toThrow();
  });

  it('2. Rejeita tableId vazio', async () => {
    await expect(openTabForTable({
      restaurantId: 'rest_123',
      tableId: '',
      peopleCount: 2,
      openedBy: 'waiter_01'
    })).rejects.toThrow();
  });

  it('3. Rejeita peopleCount <= 0', async () => {
    await expect(openTabForTable({
      restaurantId: 'rest_123',
      tableId: 'table_01',
      peopleCount: 0,
      openedBy: 'waiter_01'
    })).rejects.toThrow();
  });
});
