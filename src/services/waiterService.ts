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

let waitersCache: { restaurantId: string; timestamp: number; data: Waiter[] } | null = null;
const CACHE_TTL_MS = 60000; // 1 minuto de cache

export const waiterService = {
  clearCache(): void {
    waitersCache = null;
  },

  async getWaiters(restaurantId: string, forceRefresh = false): Promise<Waiter[]> {
    try {
      const now = Date.now();
      if (!forceRefresh && waitersCache && waitersCache.restaurantId === restaurantId && (now - waitersCache.timestamp) < CACHE_TTL_MS) {
        return waitersCache.data;
      }

      const token = await getIdToken();
      const response = await fetch('/api/restaurant/waiters', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar garçons.');
      }

      const list = (data.waiters || []).map((w: any) =>
        normalizeWaiter(w, w.id || w.userId, restaurantId)
      );

      // Sort by name alphabetically
      const sorted = list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      
      waitersCache = {
        restaurantId,
        timestamp: now,
        data: sorted
      };

      return sorted;
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
    waitersCache = null;
    const token = await getIdToken();
    const response = await fetch('/api/restaurant/waiters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(input)
    });

    const data = await response.json().catch(() => ({}));
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
    waitersCache = null;
    const token = await getIdToken();
    const response = await fetch(`/api/restaurant/waiters/${waiterId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(input)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao atualizar garçom.');
    }
  },

  async updateWaiterStatus(waiterId: string, status: WaiterStatus): Promise<void> {
    waitersCache = null;
    const token = await getIdToken();
    const response = await fetch(`/api/restaurant/waiters/${waiterId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });

    const data = await response.json().catch(() => ({}));
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

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao redefinir senha do garçom.');
    }
  }
};
