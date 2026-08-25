import { auth } from '../firebase';
import type { TabDraftItem } from '../components/tables/TabCatalogModal';

export interface SendTabRoundInput {
  restaurantId: string;
  tableId?: string | null;
  tabId?: string | null;
  origin?: 'TABLE' | 'WAITER';
  items: TabDraftItem[];
  clientActionId: string;
}

export interface SendTabRoundResult {
  success: boolean;
  orderId: string;
  alreadyProcessed: boolean;
  order?: any;
  message?: string;
}

export interface CancelTabItemInput {
  restaurantId: string;
  tabId?: string | null;
  orderId?: string | null;
  itemId: string;
  cancellationReason: string;
  simulatedRole?: string;
}

export interface CancelTabItemResult {
  success: boolean;
  message?: string;
  itemId: string;
  cancelledAt?: string;
  cancelledBy?: any;
}

export interface RequestItemCancellationInput {
  restaurantId: string;
  tabId?: string | null;
  orderId?: string | null;
  itemId: string;
  cancellationReason: string;
  simulatedRole?: string;
}

export interface ApproveItemCancellationInput {
  restaurantId: string;
  tabId?: string | null;
  orderId?: string | null;
  itemId: string;
  approvalNote?: string;
  simulatedRole?: string;
}

export interface RefuseItemCancellationInput {
  restaurantId: string;
  tabId?: string | null;
  orderId?: string | null;
  itemId: string;
  refusalReason?: string;
  simulatedRole?: string;
}

export const tabRoundService = {
  async sendRound(input: SendTabRoundInput): Promise<SendTabRoundResult> {
    const { restaurantId, tableId, tabId, origin = 'TABLE', items, clientActionId } = input;

    if (!restaurantId) {
      throw new Error('Restaurante não identificado.');
    }

    if (!items || items.length === 0) {
      throw new Error('O carrinho da rodada está vazio.');
    }

    if (!clientActionId) {
      throw new Error('Identificador único (clientActionId) é obrigatório.');
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const err: any = new Error('Sem conexão com a internet. Verifique sua rede e tente novamente.');
      err.isNetworkError = true;
      err.isRetryable = true;
      throw err;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const token = await currentUser.getIdToken();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for mobile networks

    try {
      const response = await fetch('/api/restaurant/tab/send-round', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          restaurantId,
          tableId: tableId || null,
          tabId: tabId || null,
          origin,
          items,
          clientActionId
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      let data: any = {};
      try {
        data = await response.json();
      } catch {
        // Fallback for non-JSON response
      }

      if (!response.ok) {
        const errorMsg = data.message || data.error || 'Falha ao processar a rodada.';
        const err: any = new Error(errorMsg);
        err.status = response.status;
        err.code = data.code;

        // Classify retryable vs non-retryable errors
        if (response.status >= 500) {
          err.message = data.message || 'Instabilidade temporária no servidor. Tente novamente.';
          err.isRetryable = true;
        } else if (response.status === 403 || response.status === 401) {
          err.message = data.message || 'Sem permissão ou sessão expirada. Faça login novamente.';
          err.isRetryable = false;
        } else if (response.status === 422) {
          err.message = data.message || 'Um dos itens está indisponível ou fora de estoque.';
          err.isRetryable = false;
        } else if (response.status === 400) {
          err.message = data.message || 'Dados do pedido inválidos. Verifique a seleção.';
          err.isRetryable = false;
        } else {
          err.isRetryable = true;
        }
        throw err;
      }

      return data;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        const timeoutErr: any = new Error('O tempo de resposta da rede esgotou. Verifique sua conexão e tente novamente.');
        timeoutErr.isTimeout = true;
        timeoutErr.isRetryable = true;
        throw timeoutErr;
      }

      if (err.isNetworkError || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        const netErr: any = new Error('Falha de conexão com o servidor. Verifique sua rede e tente novamente.');
        netErr.isNetworkError = true;
        netErr.isRetryable = true;
        throw netErr;
      }

      throw err;
    }
  },

  async cancelItem(input: CancelTabItemInput): Promise<CancelTabItemResult> {
    const { restaurantId, tabId, orderId, itemId, cancellationReason, simulatedRole } = input;

    if (!restaurantId) {
      throw new Error('Restaurante não identificado.');
    }

    if (!itemId) {
      throw new Error('ID do item é obrigatório.');
    }

    if (!cancellationReason || !cancellationReason.trim()) {
      throw new Error('O motivo do cancelamento é obrigatório.');
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const token = await currentUser.getIdToken();

    const response = await fetch('/api/restaurant/tab/cancel-item', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Simulated-Role': simulatedRole || '',
        'X-Restaurant-Id': restaurantId
      },
      body: JSON.stringify({
        restaurantId,
        tabId: tabId || null,
        orderId: orderId || null,
        itemId,
        cancellationReason: cancellationReason.trim(),
        simulatedRole
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Falha ao cancelar o item.');
    }

    return data;
  },

  async requestItemCancellation(input: RequestItemCancellationInput): Promise<CancelTabItemResult> {
    const { restaurantId, tabId, orderId, itemId, cancellationReason, simulatedRole } = input;

    if (!restaurantId) throw new Error('Restaurante não identificado.');
    if (!itemId) throw new Error('ID do item é obrigatório.');
    if (!cancellationReason || !cancellationReason.trim()) throw new Error('O motivo do cancelamento é obrigatório.');

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Sessão expirada. Faça login novamente.');

    const token = await currentUser.getIdToken();

    const response = await fetch('/api/restaurant/tab/request-item-cancellation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Simulated-Role': simulatedRole || '',
        'X-Restaurant-Id': restaurantId
      },
      body: JSON.stringify({
        restaurantId,
        tabId: tabId || null,
        orderId: orderId || null,
        itemId,
        cancellationReason: cancellationReason.trim(),
        simulatedRole
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Falha ao solicitar cancelamento do item.');
    }

    return data;
  },

  async approveItemCancellation(input: ApproveItemCancellationInput): Promise<CancelTabItemResult> {
    const { restaurantId, tabId, orderId, itemId, approvalNote, simulatedRole } = input;

    if (!restaurantId) throw new Error('Restaurante não identificado.');
    if (!itemId) throw new Error('ID do item é obrigatório.');

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Sessão expirada. Faça login novamente.');

    const token = await currentUser.getIdToken();

    const response = await fetch('/api/restaurant/tab/approve-item-cancellation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Simulated-Role': simulatedRole || '',
        'X-Restaurant-Id': restaurantId
      },
      body: JSON.stringify({
        restaurantId,
        tabId: tabId || null,
        orderId: orderId || null,
        itemId,
        approvalNote: approvalNote?.trim() || '',
        simulatedRole
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Falha ao aprovar cancelamento do item.');
    }

    return data;
  },

  async refuseItemCancellation(input: RefuseItemCancellationInput): Promise<CancelTabItemResult> {
    const { restaurantId, tabId, orderId, itemId, refusalReason, simulatedRole } = input;

    if (!restaurantId) throw new Error('Restaurante não identificado.');
    if (!itemId) throw new Error('ID do item é obrigatório.');

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Sessão expirada. Faça login novamente.');

    const token = await currentUser.getIdToken();

    const response = await fetch('/api/restaurant/tab/refuse-item-cancellation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Simulated-Role': simulatedRole || '',
        'X-Restaurant-Id': restaurantId
      },
      body: JSON.stringify({
        restaurantId,
        tabId: tabId || null,
        orderId: orderId || null,
        itemId,
        refusalReason: refusalReason?.trim() || '',
        simulatedRole
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Falha ao recusar cancelamento do item.');
    }

    return data;
  },

  async transferTable(restaurantId: string, tabId: string, targetTableId: string): Promise<any> {
    if (!restaurantId) throw new Error('Restaurante não identificado.');
    if (!tabId) throw new Error('ID da comanda é obrigatório.');
    if (!targetTableId) throw new Error('ID da mesa de destino é obrigatório.');

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Sessão expirada. Faça login novamente.');

    const token = await currentUser.getIdToken();

    const response = await fetch('/api/restaurant/tab/transfer-table', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Restaurant-Id': restaurantId
      },
      body: JSON.stringify({
        tabId,
        targetTableId
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Falha ao transferir a mesa.');
    }

    return data;
  },

  async transferItems(
    restaurantId: string, 
    sourceTabId: string, 
    targetTabId: string, 
    itemsToTransfer: Array<{ itemId: string; quantity: number }>
  ): Promise<any> {
    if (!restaurantId) throw new Error('Restaurante não identificado.');
    if (!sourceTabId) throw new Error('ID da comanda de origem é obrigatório.');
    if (!targetTabId) throw new Error('ID da comanda de destino é obrigatório.');
    if (!itemsToTransfer || itemsToTransfer.length === 0) {
      throw new Error('Nenhum item selecionado para transferência.');
    }

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Sessão expirada. Faça login novamente.');

    const token = await currentUser.getIdToken();

    const response = await fetch('/api/restaurant/tab/transfer-items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Restaurant-Id': restaurantId
      },
      body: JSON.stringify({
        sourceTabId,
        targetTabId,
        itemsToTransfer
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Falha ao transferir os itens.');
    }

    return data;
  },

  async mergeTabs(
    restaurantId: string,
    mainTabId: string,
    secondaryTabIds: string[]
  ): Promise<any> {
    if (!restaurantId) throw new Error('Restaurante não identificado.');
    if (!mainTabId) throw new Error('ID da comanda principal é obrigatório.');
    if (!secondaryTabIds || secondaryTabIds.length === 0) {
      throw new Error('Selecione pelo menos uma comanda secundária para ser incorporada.');
    }

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Sessão expirada. Faça login novamente.');

    const token = await currentUser.getIdToken();

    const response = await fetch('/api/restaurant/tab/merge-tabs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Restaurant-Id': restaurantId
      },
      body: JSON.stringify({
        mainTabId,
        secondaryTabIds
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Falha ao unificar as comandas.');
    }

    return data;
  },

  async splitTabs(
    restaurantId: string,
    mainTabId: string,
    separations: Array<{
      targetTableId: string;
      targetTabId: string;
      items: Array<{ itemId: string; quantity: number }>;
    }>
  ): Promise<any> {
    if (!restaurantId) throw new Error('Restaurante não identificado.');
    if (!mainTabId) throw new Error('ID da comanda principal é obrigatório.');
    if (!separations || separations.length === 0) {
      throw new Error('Forneça pelo menos uma mesa ou comanda para ser separada.');
    }

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Sessão expirada. Faça login novamente.');

    const token = await currentUser.getIdToken();

    const response = await fetch('/api/restaurant/tab/split-tabs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Restaurant-Id': restaurantId
      },
      body: JSON.stringify({
        mainTabId,
        separations
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Falha ao realizar a separação das mesas.');
    }

    return data;
  },

  async getRounds(tabId: string, restaurantId?: string): Promise<any[]> {
    if (!tabId || !tabId.trim()) return [];

    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    const token = await currentUser.getIdToken();

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`
    };
    if (restaurantId) {
      headers['X-Restaurant-Id'] = restaurantId;
    }

    const response = await fetch(`/api/restaurant/tab/${encodeURIComponent(tabId.trim())}/rounds`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || data.error || 'Falha ao buscar rodadas da comanda.');
    }

    const data = await response.json();
    return data.rounds || data.data?.rounds || [];
  }
};
