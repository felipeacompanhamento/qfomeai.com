import { getOrderModality, getTotemRealModality, isGarcomOrder, isRetiradaOrder } from '../../../../domain/order/orderSource';
import { getCanonicalOrderState, canRestaurantSettleOrder } from '../../../../domain/order/orderLifecycle';

export interface ModalityAction {
  label: string;
  nextStatus?: string;
  actionType?: 'assign_driver' | 'settlement' | 'details' | 'update_status';
  isModalTrigger?: boolean;
  bg: string;
  isTerminal?: boolean;
}

/**
 * Retorna o texto padronizado do status visual de acordo com a modalidade
 */
export function getModalityStatusText(order: any): string {
  if (!order) return '';

  const modality = getOrderModality(order);
  const rawStatus = String(order.status || order.status_pedido || '').toLowerCase().trim();
  const canonical = getCanonicalOrderState(order);

  // 1. GARÇOM / MESA & BALCÃO + MESA (e TOTEM com atendimento Mesa)
  if (modality === 'GARCOM_MESA' || modality === 'BALCAO_MESA' || (modality === 'TOTEM' && getTotemRealModality(order) === 'MESA')) {
    if (['pendente', 'novo', 'new'].includes(rawStatus) || canonical.orderStatus === 'NEW') {
      return 'Novo pedido';
    }
    if (['aceito', 'confirmado', 'confirmed'].includes(rawStatus) || canonical.orderStatus === 'CONFIRMED') {
      return 'Aceito';
    }
    if (['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(rawStatus) || canonical.orderStatus === 'PREPARING') {
      return 'Em preparo';
    }
    if (['pronto', 'ready'].includes(rawStatus) || canonical.orderStatus === 'READY') {
      return 'Pronto';
    }
    if (['entregue', 'delivered', 'servido', 'finalizado', 'completed', 'finalized'].includes(rawStatus) || canonical.orderStatus === 'DELIVERED' || canonical.orderStatus === 'FINALIZED') {
      return 'Servido';
    }
    if (['cancelado', 'cancelled', 'rejeitado'].includes(rawStatus) || canonical.orderStatus === 'CANCELLED') {
      return 'Cancelado';
    }
    return 'Servido';
  }

  // 2. BALCÃO + RETIRADA (e TOTEM com atendimento Retirada)
  if (modality === 'BALCAO_RETIRADA' || (modality === 'TOTEM' && getTotemRealModality(order) === 'RETIRADA')) {
    if (['pendente', 'novo', 'new'].includes(rawStatus) || canonical.orderStatus === 'NEW') {
      return 'Novo pedido';
    }
    if (['aceito', 'confirmado', 'confirmed'].includes(rawStatus) || canonical.orderStatus === 'CONFIRMED') {
      return 'Aceito';
    }
    if (['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(rawStatus) || canonical.orderStatus === 'PREPARING') {
      return 'Em preparo';
    }
    if (['pronto', 'ready'].includes(rawStatus) || canonical.orderStatus === 'READY') {
      return 'PRONTO PARA RETIRADA';
    }
    if (['entregue', 'delivered', 'retirado', 'finalizado', 'completed', 'finalized'].includes(rawStatus) || canonical.orderStatus === 'DELIVERED' || canonical.orderStatus === 'FINALIZED') {
      return 'Retirado';
    }
    if (['cancelado', 'cancelled', 'rejeitado'].includes(rawStatus) || canonical.orderStatus === 'CANCELLED') {
      return 'Cancelado';
    }
    return 'Retirado';
  }

  // 3. BALCÃO + ENTREGA, DELIVERY & TOTEM (com atendimento Entrega)
  if (['pendente', 'novo', 'new'].includes(rawStatus) || canonical.orderStatus === 'NEW') {
    return 'Novo pedido';
  }
  if (['aceito', 'confirmado', 'confirmed'].includes(rawStatus) || canonical.orderStatus === 'CONFIRMED') {
    return 'Aceito';
  }
  if (['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(rawStatus) || canonical.orderStatus === 'PREPARING') {
    return 'Em preparo';
  }
  if (['pronto', 'ready'].includes(rawStatus) || canonical.orderStatus === 'READY') {
    if (canonical.deliveryStatus === 'ASSIGNED' || canonical.deliveryStatus === 'ACCEPTED' || Boolean(order.driverId || order.entregador_id || order.assignedDriverName || order.deliveredByDriverName)) {
      return 'Aguardando entregador';
    }
    return 'Pronto';
  }
  if (['entrega', 'saiu_entrega', 'saiu para entrega', 'saiu_para_entrega', 'despachado', 'em_entrega', 'out_for_delivery'].includes(rawStatus) || canonical.orderStatus === 'OUT_FOR_DELIVERY') {
    return 'Em rota';
  }
  if (['entregue', 'delivered'].includes(rawStatus) || canonical.orderStatus === 'DELIVERED') {
    return 'Entregue';
  }
  if (['finalizado', 'completed', 'finalized'].includes(rawStatus) || canonical.orderStatus === 'FINALIZED') {
    return 'Finalizado';
  }
  if (['cancelado', 'cancelled', 'rejeitado'].includes(rawStatus) || canonical.orderStatus === 'CANCELLED') {
    return 'Cancelado';
  }

  return 'Novo pedido';
}

/**
 * Determina a próxima ação padronizada do pedido baseada em:
 * Origem + Modalidade / Atendimento + Status Atual
 */
export function getModalityNextAction(order: any): ModalityAction {
  if (!order) {
    return { label: 'Ver Detalhes', isModalTrigger: true, isTerminal: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
  }

  const modality = getOrderModality(order);
  const rawStatus = String(order.status || order.status_pedido || '').toLowerCase().trim();
  const canonical = getCanonicalOrderState(order);
  const isPendingSettlement = canRestaurantSettleOrder(order);
  const hasDriver = Boolean(
    order.driverId || 
    order.entregador_id || 
    order.entregadorId || 
    order.assignedDriverName || 
    order.deliveredByDriverName || 
    order.driverName || 
    order.entregador_nome
  );

  // Status terminais
  if (
    ['finalizado', 'completed', 'finalized', 'cancelado', 'cancelled', 'rejeitado'].includes(rawStatus) ||
    canonical.orderStatus === 'FINALIZED' ||
    canonical.orderStatus === 'CANCELLED'
  ) {
    return { label: 'Ver Detalhes', isModalTrigger: true, isTerminal: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
  }

  // 1. GARÇOM / MESA
  if (modality === 'GARCOM_MESA') {
    if (['pendente', 'novo', 'new'].includes(rawStatus) || canonical.orderStatus === 'NEW') {
      return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    if (['aceito', 'confirmado', 'confirmed'].includes(rawStatus) || canonical.orderStatus === 'CONFIRMED') {
      return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
    }
    if (['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(rawStatus) || canonical.orderStatus === 'PREPARING') {
      return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
    }
    if (['pronto', 'ready'].includes(rawStatus) || canonical.orderStatus === 'READY') {
      return { label: 'MARCAR COMO SERVIDO', nextStatus: 'entregue', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    // Já servido (entregue / finalizado) -> Nenhuma ação operacional adicional
    return { label: 'Ver Detalhes', isModalTrigger: true, isTerminal: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
  }

  // 2. BALCÃO + MESA
  if (modality === 'BALCAO_MESA') {
    if (['pendente', 'novo', 'new'].includes(rawStatus) || canonical.orderStatus === 'NEW') {
      return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    if (['aceito', 'confirmado', 'confirmed'].includes(rawStatus) || canonical.orderStatus === 'CONFIRMED') {
      return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
    }
    if (['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(rawStatus) || canonical.orderStatus === 'PREPARING') {
      return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
    }
    if (['pronto', 'ready'].includes(rawStatus) || canonical.orderStatus === 'READY') {
      return { label: 'MARCAR COMO SERVIDO', nextStatus: 'entregue', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    // Já servido -> Nenhuma ação operacional adicional
    return { label: 'Ver Detalhes', isModalTrigger: true, isTerminal: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
  }

  // 3. BALCÃO + RETIRADA
  if (modality === 'BALCAO_RETIRADA') {
    if (['pendente', 'novo', 'new'].includes(rawStatus) || canonical.orderStatus === 'NEW') {
      return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    if (['aceito', 'confirmado', 'confirmed'].includes(rawStatus) || canonical.orderStatus === 'CONFIRMED') {
      return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
    }
    if (['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(rawStatus) || canonical.orderStatus === 'PREPARING') {
      return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
    }
    if (['pronto', 'ready'].includes(rawStatus) || canonical.orderStatus === 'READY') {
      return { label: 'MARCAR COMO RETIRADO', nextStatus: 'finalizado', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    // Já retirado -> Nenhuma ação operacional adicional
    return { label: 'Ver Detalhes', isModalTrigger: true, isTerminal: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
  }

  // 4. TOTEM (Resolve modalidade real)
  if (modality === 'TOTEM') {
    const totemReal = getTotemRealModality(order);
    if (totemReal === 'MESA') {
      if (['pendente', 'novo', 'new'].includes(rawStatus) || canonical.orderStatus === 'NEW') {
        return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      if (['aceito', 'confirmado', 'confirmed'].includes(rawStatus) || canonical.orderStatus === 'CONFIRMED') {
        return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
      }
      if (['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(rawStatus) || canonical.orderStatus === 'PREPARING') {
        return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
      }
      if (['pronto', 'ready'].includes(rawStatus) || canonical.orderStatus === 'READY') {
        return { label: 'MARCAR COMO SERVIDO', nextStatus: 'entregue', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      return { label: 'Ver Detalhes', isModalTrigger: true, isTerminal: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
    }
    if (totemReal === 'RETIRADA') {
      if (['pendente', 'novo', 'new'].includes(rawStatus) || canonical.orderStatus === 'NEW') {
        return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      if (['aceito', 'confirmado', 'confirmed'].includes(rawStatus) || canonical.orderStatus === 'CONFIRMED') {
        return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
      }
      if (['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(rawStatus) || canonical.orderStatus === 'PREPARING') {
        return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
      }
      if (['pronto', 'ready'].includes(rawStatus) || canonical.orderStatus === 'READY') {
        return { label: 'MARCAR COMO RETIRADO', nextStatus: 'finalizado', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      return { label: 'Ver Detalhes', isModalTrigger: true, isTerminal: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
    }
  }

  // 5. BALCÃO + ENTREGA & DELIVERY
  if (['pendente', 'novo', 'new'].includes(rawStatus) || canonical.orderStatus === 'NEW') {
    return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
  }
  if (['aceito', 'confirmado', 'confirmed'].includes(rawStatus) || canonical.orderStatus === 'CONFIRMED') {
    return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
  }
  if (['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(rawStatus) || canonical.orderStatus === 'PREPARING') {
    return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
  }
  if (['pronto', 'ready'].includes(rawStatus) || canonical.orderStatus === 'READY') {
    if (!hasDriver) {
      return {
        label: 'ENVIAR PARA ENTREGADOR',
        isModalTrigger: true,
        actionType: 'assign_driver',
        bg: 'bg-indigo-600 hover:bg-indigo-700 text-white'
      };
    }
    return {
      label: 'Despachar / Saiu',
      nextStatus: 'despachado',
      bg: 'bg-blue-600 hover:bg-blue-700 text-white'
    };
  }
  if (isPendingSettlement) {
    return {
      label: 'Conferir Recebimento',
      isModalTrigger: true,
      actionType: 'settlement',
      bg: 'bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold'
    };
  }
  if (
    ['entrega', 'saiu_entrega', 'saiu para entrega', 'saiu_para_entrega', 'despachado', 'em_entrega', 'out_for_delivery'].includes(rawStatus) ||
    canonical.orderStatus === 'OUT_FOR_DELIVERY'
  ) {
    return { label: 'Marcar Entregue', nextStatus: 'entregue', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
  }
  if (['entregue', 'delivered'].includes(rawStatus) || canonical.orderStatus === 'DELIVERED') {
    return { label: 'Finalizar Pedido', nextStatus: 'finalizado', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
  }

  return { label: 'Ver Detalhes', isModalTrigger: true, isTerminal: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
}

export interface StageTimeInfo {
  elapsedMinutes: number;
  displayText: string;
  isDelayed: boolean;
  delayText?: string;
  badgeBg: string;
  badgeText: string;
}

/**
 * SLA padrão em minutos por etapa
 */
const STAGE_SLA_MINUTES: Record<string, number> = {
  novo: 5,        // Aceitar em até 5 min
  confirmado: 10, // Iniciar preparo em até 10 min
  cozinha: 25,    // Preparar em até 25 min
  entrega: 45     // Entregar em até 45 min
};

/**
 * Calcula o tempo decorrido e status de atraso da etapa atual do pedido
 */
export function getOrderStageTimeInfo(order: any, columnId: string, nowMs: number = Date.now()): StageTimeInfo {
  let referenceTimestampMs = nowMs;

  const dateStr = order.data_criacao || order.createdAt || order.created_at;
  if (dateStr) {
    const parsed = new Date(dateStr).getTime();
    if (!isNaN(parsed)) {
      referenceTimestampMs = parsed;
    }
  }

  // Tenta timestamps mais específicos de etapa se existirem
  if (columnId === 'confirmado' && order.confirmedAt) {
    const t = new Date(order.confirmedAt).getTime();
    if (!isNaN(t)) referenceTimestampMs = t;
  } else if (columnId === 'cozinha' && order.preparingAt) {
    const t = new Date(order.preparingAt).getTime();
    if (!isNaN(t)) referenceTimestampMs = t;
  } else if (columnId === 'entrega' && (order.readyAt || order.dispatchedAt)) {
    const t = new Date(order.readyAt || order.dispatchedAt).getTime();
    if (!isNaN(t)) referenceTimestampMs = t;
  }

  const diffMs = Math.max(0, nowMs - referenceTimestampMs);
  const elapsedMinutes = Math.floor(diffMs / 60000);

  let displayText = `${elapsedMinutes} min`;
  if (elapsedMinutes === 0) {
    displayText = 'Agora';
  } else if (elapsedMinutes >= 60) {
    const h = Math.floor(elapsedMinutes / 60);
    const m = elapsedMinutes % 60;
    displayText = `${h}h ${m}m`;
  }

  const slaMinutes = STAGE_SLA_MINUTES[columnId] || 30;
  const isDelayed = elapsedMinutes > slaMinutes;

  if (isDelayed) {
    const delayMins = elapsedMinutes - slaMinutes;
    return {
      elapsedMinutes,
      displayText: `Há ${displayText}`,
      isDelayed: true,
      delayText: `Atrasado +${delayMins}m`,
      badgeBg: 'bg-rose-50 text-rose-700 border-rose-200/80',
      badgeText: 'text-rose-700'
    };
  }

  if (elapsedMinutes > Math.floor(slaMinutes * 0.7)) {
    return {
      elapsedMinutes,
      displayText: `Há ${displayText}`,
      isDelayed: false,
      badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
      badgeText: 'text-amber-800'
    };
  }

  return {
    elapsedMinutes,
    displayText: `Há ${displayText}`,
    isDelayed: false,
    badgeBg: 'bg-stone-100 text-stone-600 border-stone-200',
    badgeText: 'text-stone-600'
  };
}

/**
 * Extrai e formata com segurança o número ou nome da mesa
 */
export function extractOrderTableDisplay(order: any): string {
  if (!order) return '--';
  
  if (order.tableNumber !== undefined && order.tableNumber !== null && String(order.tableNumber).trim() !== '') {
    return String(order.tableNumber);
  }
  if (order.mesa_numero !== undefined && order.mesa_numero !== null && String(order.mesa_numero).trim() !== '') {
    return String(order.mesa_numero);
  }
  if (order.tableName && String(order.tableName).trim() !== '') {
    return String(order.tableName).replace(/^Mesa\s*/i, '');
  }
  if (order.table_name && String(order.table_name).trim() !== '') {
    return String(order.table_name).replace(/^Mesa\s*/i, '');
  }
  if (order.mesa && typeof order.mesa === 'object') {
    const val = order.mesa.number ?? order.mesa.numero ?? order.mesa.name ?? order.mesa.nome;
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).replace(/^Mesa\s*/i, '');
    }
  }
  if (order.mesa && typeof order.mesa === 'string' && order.mesa.trim() !== '') {
    return String(order.mesa).replace(/^Mesa\s*/i, '');
  }
  if (order.num_mesa !== undefined && order.num_mesa !== null && String(order.num_mesa).trim() !== '') {
    return String(order.num_mesa);
  }
  if (order.mesaNumero !== undefined && order.mesaNumero !== null && String(order.mesaNumero).trim() !== '') {
    return String(order.mesaNumero);
  }
  if (order.mesaNome && String(order.mesaNome).trim() !== '') {
    return String(order.mesaNome).replace(/^Mesa\s*/i, '');
  }
  // Try extracting from cliente_nome (e.g. "Mesa 02 - Comanda...")
  if (order.cliente_nome && typeof order.cliente_nome === 'string') {
    const match = order.cliente_nome.match(/^Mesa\s+([0-9a-zA-Z_-]+)/i);
    if (match) return match[1];
  }
  if (order.nome_cliente && typeof order.nome_cliente === 'string') {
    const match = order.nome_cliente.match(/^Mesa\s+([0-9a-zA-Z_-]+)/i);
    if (match) return match[1];
  }
  return '--';
}

/**
 * Extrai e formata de forma limpa e compacta o identificador ou número da comanda
 */
export function extractOrderComandaDisplay(order: any): string {
  if (!order) return '--';
  
  const comandaNum = order.comandaNumero || order.comanda_numero || order.tabNumber || order.comanda_identificador || order.identificador;
  if (comandaNum && String(comandaNum).trim() !== '') {
    return String(comandaNum);
  }
  
  const rawId = order.comanda_id || order.tabId || order.comandaId || order.comanda;
  if (rawId && typeof rawId === 'string') {
    const clean = rawId.trim();
    if (clean.length > 8) {
      return '#' + clean.slice(-4).toUpperCase();
    }
    return clean;
  }
  return '--';
}

/**
 * Extrai o nome do garçom responsável pelo lançamento
 */
export function extractOrderWaiterDisplay(order: any): string {
  if (!order) return '--';
  return (
    order.waiterName ||
    order.garcom_nome ||
    order.sentBy?.name ||
    order.garcom ||
    order.waiter ||
    '--'
  );
}

/**
 * Extrai e formata o número da rodada do pedido da comanda
 */
export function extractOrderRoundDisplay(order: any): string {
  if (!order) return '--';
  const val = order.roundNumber || order.numero_rodada || order.rodada || order.round_number || order.roundIndex;
  if (val !== undefined && val !== null && String(val).trim() !== '' && String(val) !== '--') {
    return String(val);
  }
  if (order.roundId && typeof order.roundId === 'string' && order.roundId.length <= 6) {
    return order.roundId;
  }
  // Se for pedido de garçom/comanda mas não tiver número de rodada explícito, padrão é a 1ª rodada
  if (order.comanda_id || order.tabId || order.origem === 'GARCOM' || order.source === 'GARCOM') {
    return '1';
  }
  return '--';
}

/**
 * Normaliza e calcula os valores de preço de um item de pedido de forma resiliente contra undefined/null/NaN
 */
export function extractOrderItemPriceInfo(item: any): {
  unitPrice: number;
  extrasTotal: number;
  quantity: number;
  totalPrice: number;
} {
  if (!item) {
    return { unitPrice: 0, extrasTotal: 0, quantity: 1, totalPrice: 0 };
  }

  const quantity = Number(item.quantidade ?? item.qty ?? item.quantity ?? 1) || 1;

  const rawUnitPrice = item.preco ??
    item.precoUnitario ??
    item.unitPrice ??
    item.price ??
    item.valor ??
    (item.unitPriceCents !== undefined && item.unitPriceCents !== null ? Number(item.unitPriceCents) / 100 : undefined) ??
    (item.totalPriceCents !== undefined && item.totalPriceCents !== null && quantity > 0 ? (Number(item.totalPriceCents) / 100) / quantity : undefined) ??
    (item.valorTotal !== undefined && item.valorTotal !== null && quantity > 0 ? Number(item.valorTotal) / quantity : undefined) ??
    0;

  const unitPrice = isNaN(Number(rawUnitPrice)) ? 0 : Number(rawUnitPrice);

  const extrasList = item.adicionais || item.adicionaisSelecionados || item.options || [];
  const extrasTotal = Array.isArray(extrasList)
    ? extrasList.reduce((sum: number, extra: any) => {
        const extraPrice = Number(extra?.preco ?? extra?.price ?? extra?.valor ?? (extra?.priceCents ? Number(extra.priceCents) / 100 : 0) ?? 0) || 0;
        const extraQty = Number(extra?.quantidade ?? extra?.qty ?? 1) || 1;
        return sum + (extraPrice * extraQty);
      }, 0)
    : 0;

  let rawTotal = item.valorTotal !== undefined && item.valorTotal !== null
    ? Number(item.valorTotal)
    : (item.totalPriceCents !== undefined && item.totalPriceCents !== null
        ? Number(item.totalPriceCents) / 100
        : (unitPrice + extrasTotal) * quantity);

  if (isNaN(rawTotal)) {
    rawTotal = (unitPrice + extrasTotal) * quantity;
  }

  const totalPrice = isNaN(rawTotal) ? 0 : rawTotal;

  return {
    unitPrice,
    extrasTotal,
    quantity,
    totalPrice
  };
}

