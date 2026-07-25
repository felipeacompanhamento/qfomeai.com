import { 
  collection, 
  getDocs, 
  query 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { 
  Waiter, 
  WaiterPermissions, 
  WaiterStatus, 
  DEFAULT_WAITER_PERMISSIONS, 
  normalizeWaiter, 
  normalizeWaiterPermissions 
} from '../domain/waiter/waiter';

export type { Waiter, WaiterPermissions, WaiterStatus };
export { DEFAULT_WAITER_PERMISSIONS, normalizeWaiter, normalizeWaiterPermissions };

async function getIdToken(): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Usuário não autenticado.");
  return await currentUser.getIdToken();
}

export const waiterService = {
  async getWaiters(restaurantId: string): Promise<Waiter[]> {
    try {
      const token = await getIdToken();
      const response = await fetch('/api/restaurant/waiters', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar garçons.');
      }

      const list = (data.waiters || []).map((w: any) =>
        normalizeWaiter(w, w.id || w.userId, restaurantId)
      );

      // Sort by name alphabetically
      return list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } catch (error) {
      console.error("Error getting waiters:", error);
      throw error;
    }
  },

  async createWaiter(input: {
    name: string;
    email: string;
    password?: string;
    phone?: string;
    photoUrl?: string;
    permissions?: Partial<WaiterPermissions>;
    status?: WaiterStatus;
  }): Promise<Waiter> {
    const token = await getIdToken();
    const response = await fetch('/api/restaurant/waiters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(input)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao cadastrar garçom.');
    }

    return normalizeWaiter(data.waiter, data.waiterId, data.waiter.restaurantId);
  },

  async updateWaiter(
    waiterId: string, 
    input: {
      name?: string;
      email?: string;
      password?: string;
      phone?: string;
      photoUrl?: string;
      permissions?: Partial<WaiterPermissions>;
      status?: WaiterStatus;
    }
  ): Promise<void> {
    const token = await getIdToken();
    const response = await fetch(`/api/restaurant/waiters/${waiterId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(input)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao atualizar garçom.');
    }
  },

  async updateWaiterStatus(waiterId: string, status: WaiterStatus): Promise<void> {
    const token = await getIdToken();
    const response = await fetch(`/api/restaurant/waiters/${waiterId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao alterar status do garçom.');
    }
  },

  async resetPassword(waiterId: string, password: string): Promise<void> {
    const token = await getIdToken();
    const response = await fetch(`/api/restaurant/waiters/${waiterId}/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ password })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao redefinir senha do garçom.');
    }
  }
};
