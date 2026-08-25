import { auth } from '../firebase';

export class CounterOrderError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'CounterOrderError';
    this.code = code;
    this.status = status;
  }
}

export interface CounterCartItem {
  cartId: string;
  productId: string;
  nome: string;
  unitPriceCents: number;
  basePriceCents: number;
  pricingChannel: 'BALCAO';
  precoBase: number;
  precoFinal: number;
  quantidade: number;
  observacao?: string;
  selectedSizeId?: string;
  selectedAdditionalIds?: string[];
  tamanhoSelecionado?: {
    id?: string;
    nome: string;
    preco: number;
  } | null;
  adicionaisSelecionados?: {
    id: string;
    nome: string;
    preco: number;
    grupoId: string;
    grupoNome: string;
  }[];
}

export interface CounterOrderItemInput {
  cartItemId: string;
  productId: string;
  quantity: number;
  observation?: string;
  selectedSizeId?: string;
  selectedAdditionalIds?: string[];
}

export interface CreateCounterOrderInput {
  restaurantId: string;
  operatorId: string;
  operatorName: string;
  clientName: string;
  serviceMode: 'COUNTER' | 'PICKUP' | 'DINE_IN';
  items: CounterCartItem[];
  forma_pagamento: string; payments?: any[];
  pago: boolean;
  amountReceived?: number;
  clientActionId: string;
}

export interface CounterCreatedOrderItem {
  id: string;
  nome: string;
  precoUnitario: number;
  precoBase: number;
  quantidade: number;
  valorTotal: number;
  observacao: string;
  tamanhoSelecionado?: {
    id: string;
    nome: string;
    preco: number;
  } | null;
  adicionaisSelecionados?: {
    id: string;
    nome: string;
    preco: number;
    grupoId: string;
    grupoNome: string;
  }[];
}

export interface CounterCreatedOrder {
  id?: string;
  source: 'COUNTER';
  serviceMode: 'COUNTER' | 'PICKUP' | 'DINE_IN';
  orderStatus: 'PREPARING';
  status: 'cozinha';
  cliente_nome: string;
  items: CounterCreatedOrderItem[];
  valor_produtos: number;
  valor_total: number;
  forma_pagamento: string;
  pago: boolean;
  amountReceived: number;
  changeAmount: number;
  financialSettlementStatus:
    | 'SETTLED'
    | 'PENDING_RESTAURANT_CONFIRMATION';
  clientActionId: string;
}

export interface CounterOrderResult {
  success: true;
  orderId: string;
  alreadyProcessed: boolean;
  order: CounterCreatedOrder;
}

export const counterOrderService = {
  async createCounterOrder(input: CreateCounterOrderInput): Promise<CounterOrderResult> {
    const {
      restaurantId,
      operatorId,
      clientName,
      serviceMode,
      items,
      forma_pagamento,
      payments,
      pago,
      amountReceived = 0,
      clientActionId
    } = input;

    if (!restaurantId || !operatorId) {
      throw new CounterOrderError("Restaurante e operador são obrigatórios.", "INVALID_INPUT");
    }

    if (!items || items.length === 0) {
      throw new CounterOrderError("O carrinho não pode estar vazio.", "EMPTY_CART");
    }

    if (!clientActionId) {
      throw new CounterOrderError("clientActionId é obrigatório para garantir idempotência.", "MISSING_ACTION_ID");
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new CounterOrderError("Sessão expirada. Faça login novamente.", "UNAUTHENTICATED");
    }

    const token = await currentUser.getIdToken();

    // Transform items to the strictly-validated backend contract
    const normalizedItems: CounterOrderItemInput[] = items.map(item => {
      if (!item.productId) {
        throw new CounterOrderError("ID do produto é obrigatório para todos os itens do carrinho.", "PRODUCT_ID_MISSING");
      }

      // Size ID validation without name fallback
      const sizeId = item.selectedSizeId || item.tamanhoSelecionado?.id;
      if (item.tamanhoSelecionado) {
        if (!sizeId || typeof sizeId !== 'string' || !sizeId.trim()) {
          throw new CounterOrderError("O tamanho deste produto precisa ser selecionado novamente.", "SIZE_ID_MISSING");
        }
      }

      // Additional IDs validation
      const rawAdditionals = item.selectedAdditionalIds || item.adicionaisSelecionados?.map(a => a.id) || [];
      const additionalIds: string[] = [];
      for (const addId of rawAdditionals) {
        if (typeof addId !== 'string' || !addId.trim() || /\s/.test(addId.trim())) {
          throw new CounterOrderError("Um adicional precisa ser selecionado novamente.", "ADDITIONAL_ID_MISSING");
        }
        const trimmed = addId.trim();
        if (additionalIds.includes(trimmed)) {
          throw new CounterOrderError("Um adicional precisa ser selecionado novamente.", "DUPLICATE_ADDITIONAL");
        }
        additionalIds.push(trimmed);
      }

      return {
        cartItemId: item.cartId,
        productId: item.productId,
        quantity: item.quantidade,
        observation: item.observacao,
        selectedSizeId: sizeId ? sizeId.trim() : undefined,
        selectedAdditionalIds: additionalIds
      };
    });

    const response = await fetch('/api/restaurant/counter/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        clientActionId,
        serviceMode,
        clientName,
        items: normalizedItems,
        forma_pagamento,
        paymentMethod: forma_pagamento,
        payments,
        pago,
        amountReceived
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errCode = data.error || data.code || 'UNKNOWN_ERROR';
      const errMsg = data.message || data.error || 'Erro ao criar pedido no balcão.';
      if (errCode === 'IDEMPOTENCY_RECORD_INCONSISTENT' || errMsg.includes('IDEMPOTENCY_RECORD_INCONSISTENT')) {
        throw new CounterOrderError('A venda precisa ser conferida no painel de pedidos. Não tente recriar o pedido até confirmar se ele já existe.', 'IDEMPOTENCY_RECORD_INCONSISTENT', response.status);
      }
      throw new CounterOrderError(errMsg, errCode, response.status);
    }

    if (
      data?.success !== true ||
      typeof data?.orderId !== 'string' ||
      data.orderId.trim().length === 0 ||
      !data?.order ||
      data.order.source !== 'COUNTER' ||
      data.order.orderStatus !== 'PREPARING' ||
      data.order.status !== 'cozinha' ||
      !Array.isArray(data.order.items) ||
      typeof data.order.valor_total !== 'number' ||
      !Number.isFinite(data.order.valor_total) ||
      data.order.valor_total < 0 ||
      !['dinheiro', 'pix', 'credito', 'debito'].includes(data.order.forma_pagamento)
    ) {
      throw new CounterOrderError('A resposta do servidor está incompleta. Confira o pedido no painel antes de tentar novamente.', 'INVALID_SERVER_RESPONSE', response.status);
    }

    return {
      success: true,
      orderId: data.orderId,
      alreadyProcessed: data.alreadyProcessed === true,
      order: data.order
    };
  }
};
