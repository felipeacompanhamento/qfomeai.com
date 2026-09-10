export type OrderOrigem = 'DELIVERY' | 'BALCAO' | 'GARCOM' | 'TOTEM';

export enum OrderOrigemEnum {
  DELIVERY = 'DELIVERY',
  BALCAO = 'BALCAO',
  GARCOM = 'GARCOM',
  TOTEM = 'TOTEM'
}

export type OrderSource =
  | 'DELIVERY'
  | 'TAKEAWAY'
  | 'COUNTER'
  | 'WAITER'
  | 'TABLE'
  | 'ONLINE_APP'
  | 'MANUAL'
  | 'BALCAO'
  | 'GARCOM'
  | 'TOTEM';

export type OrderModality = 
  | 'GARCOM_MESA'
  | 'BALCAO_RETIRADA'
  | 'BALCAO_ENTREGA'
  | 'BALCAO_MESA'
  | 'DELIVERY'
  | 'TOTEM';

/**
 * Normaliza e resolve a origem do pedido garantindo compatibilidade com pedidos legados e novos.
 * Valores padronizados: DELIVERY, BALCAO, GARCOM, TOTEM
 */
export function normalizeOrderOrigem(order: any): OrderOrigem {
  if (!order) return 'DELIVERY';

  const rawOrigem = String(
    order.origem || 
    order.origin || 
    order.source || 
    order.tipo_pedido || 
    order.orderType || 
    ''
  ).toUpperCase().trim();

  if (rawOrigem === 'DELIVERY') return 'DELIVERY';
  if (rawOrigem === 'BALCAO' || rawOrigem === 'BALCÃO' || rawOrigem === 'COUNTER') return 'BALCAO';
  if (rawOrigem === 'GARCOM' || rawOrigem === 'GARÇOM' || rawOrigem === 'WAITER' || rawOrigem === 'TABLE' || rawOrigem === 'MESA') return 'GARCOM';
  if (rawOrigem === 'TOTEM' || rawOrigem === 'KIOSK' || rawOrigem === 'AUTOATENDIMENTO') return 'TOTEM';

  // Fallback seguro para pedidos legados sem campo de origem
  if (Boolean(order.mesa || order.tableNumber || order.num_mesa || order.tabId || order.comanda_id)) {
    return 'GARCOM';
  }

  if (order.counterContext || order.tipo_entrega === 'balcao' || order.tipo_entrega === 'consumo_local') {
    return 'BALCAO';
  }

  return 'DELIVERY';
}

/**
 * Identifica com precisão a modalidade operacional e modelo de impressão do pedido
 * usando os campos de origem (source/origem) e tipo de atendimento/fulfillment (serviceMode/tipo_atendimento)
 */
export function getOrderModality(order: any): OrderModality {
  if (!order) return 'DELIVERY';

  const rawOrigem = String(
    order.origem || 
    order.origin || 
    order.source || 
    order.tipo_pedido || 
    order.orderType || 
    ''
  ).toUpperCase().trim();

  // 1. Totem / Autoatendimento
  if (
    rawOrigem === 'TOTEM' || 
    rawOrigem === 'KIOSK' || 
    rawOrigem === 'AUTOATENDIMENTO' || 
    rawOrigem.includes('TOTEM')
  ) {
    return 'TOTEM';
  }

  // 2. Garçom / Mesa
  if (
    rawOrigem === 'GARCOM' || 
    rawOrigem === 'GARÇOM' || 
    rawOrigem === 'WAITER' ||
    Boolean(order.waiterName || order.garcom_nome || order.sentBy?.name || order.garcom || order.waiter)
  ) {
    return 'GARCOM_MESA';
  }

  const rawAtendimento = String(
    order.atendimento ||
    order.tipo_atendimento ||
    order.tipoAtendimento ||
    order.modalidade ||
    ''
  ).toUpperCase().trim();

  const rawTipoEntrega = String(
    order.tipo_entrega || 
    order.tipoEntrega ||
    order.delivery_type ||
    order.deliveryType ||
    order.fulfillment_type || 
    order.fulfillmentType || 
    ''
  ).toLowerCase().trim();

  const rawServiceMode = String(order.serviceMode || '').toUpperCase().trim();

  const hasTableOrComanda = Boolean(
    (order.tableNumber !== undefined && order.tableNumber !== null && String(order.tableNumber).trim() !== '' && String(order.tableNumber) !== '--') ||
    (order.mesa_numero !== undefined && order.mesa_numero !== null && String(order.mesa_numero).trim() !== '' && String(order.mesa_numero) !== '--') ||
    order.tableName ||
    order.table_name ||
    order.mesaNome ||
    (order.num_mesa !== undefined && order.num_mesa !== null && String(order.num_mesa).trim() !== '') ||
    (order.mesaNumero !== undefined && order.mesaNumero !== null && String(order.mesaNumero).trim() !== '') ||
    (order.mesa && String(order.mesa).trim() !== '' && String(order.mesa) !== '--') ||
    order.comanda_id ||
    order.comandaId ||
    order.tabId ||
    order.tabNumber ||
    order.comandaNumero ||
    order.comanda_numero
  );

  // 3. Balcão
  const isBalcao = (
    rawOrigem === 'BALCAO' || 
    rawOrigem === 'BALCÃO' || 
    rawOrigem === 'COUNTER' ||
    rawOrigem.includes('BALCAO') ||
    rawOrigem.includes('BALCÃO') ||
    Boolean(order.counterContext) ||
    rawTipoEntrega === 'balcao'
  );

  if (isBalcao) {
    // 3a. Balcão + Entrega -> Usar modelo de Entrega
    if (
      rawAtendimento === 'ENTREGA' || 
      rawAtendimento === 'DELIVERY' || 
      rawServiceMode === 'DELIVERY' || 
      rawTipoEntrega === 'entrega' || 
      rawTipoEntrega === 'delivery' ||
      Boolean(order.deliverySnapshot || order.driverId || order.entregador_id || order.entregadorId)
    ) {
      return 'BALCAO_ENTREGA';
    }

    // 3b. Balcão + Mesa -> Usar modelo de Mesa
    if (
      rawAtendimento === 'MESA' || 
      rawAtendimento === 'DINE_IN' || 
      rawServiceMode === 'DINE_IN' || 
      rawTipoEntrega === 'consumo_local' || 
      rawTipoEntrega === 'mesa' ||
      hasTableOrComanda
    ) {
      return 'BALCAO_MESA';
    }

    // 3c. Balcão + Retirada -> Balcão / Retirada
    return 'BALCAO_RETIRADA';
  }

  // Se não for explicitamente Balcão, mas possuir mesa/comanda e não for entrega:
  if (hasTableOrComanda && !['entrega', 'delivery'].includes(rawTipoEntrega) && !['ENTREGA', 'DELIVERY'].includes(rawAtendimento) && rawServiceMode !== 'DELIVERY') {
    return 'GARCOM_MESA';
  }

  // 4. Delivery (Padrão)
  return 'DELIVERY';
}

export function isGarcomOrder(order: any): boolean {
  if (!order) return false;
  const modality = getOrderModality(order);
  if (modality === 'GARCOM_MESA' || modality === 'BALCAO_MESA') return true;
  if (modality === 'TOTEM') {
    return getTotemRealModality(order) === 'MESA';
  }
  if (normalizeOrderOrigem(order) === 'GARCOM') return true;
  return Boolean(order.waiterName || order.garcom_nome || order.sentBy?.name);
}

/**
 * Identifica o tipo de atendimento real de um pedido de TOTEM
 */
export function getTotemRealModality(order: any): 'MESA' | 'ENTREGA' | 'RETIRADA' {
  if (!order) return 'RETIRADA';

  const rawAtendimento = String(
    order.atendimento ||
    order.tipo_atendimento ||
    order.tipoAtendimento ||
    order.modalidade ||
    ''
  ).toUpperCase().trim();

  const rawTipoEntrega = String(
    order.tipo_entrega || 
    order.tipoEntrega ||
    order.delivery_type ||
    order.deliveryType ||
    order.fulfillment_type || 
    order.fulfillmentType || 
    ''
  ).toLowerCase().trim();

  const rawServiceMode = String(order.serviceMode || '').toUpperCase().trim();

  const hasTableOrComanda = Boolean(
    (order.tableNumber !== undefined && order.tableNumber !== null && String(order.tableNumber).trim() !== '' && String(order.tableNumber) !== '--') ||
    (order.mesa_numero !== undefined && order.mesa_numero !== null && String(order.mesa_numero).trim() !== '' && String(order.mesa_numero) !== '--') ||
    order.tableName ||
    order.table_name ||
    order.mesaNome ||
    (order.num_mesa !== undefined && order.num_mesa !== null && String(order.num_mesa).trim() !== '') ||
    (order.mesaNumero !== undefined && order.mesaNumero !== null && String(order.mesaNumero).trim() !== '') ||
    (order.mesa && String(order.mesa).trim() !== '' && String(order.mesa) !== '--') ||
    order.comanda_id ||
    order.comandaId ||
    order.tabId ||
    order.tabNumber ||
    order.comandaNumero ||
    order.comanda_numero
  );

  if (
    rawAtendimento === 'ENTREGA' || 
    rawAtendimento === 'DELIVERY' || 
    rawServiceMode === 'DELIVERY' || 
    rawTipoEntrega === 'entrega' || 
    rawTipoEntrega === 'delivery' ||
    Boolean(order.endereco_entrega || order.endereco || order.deliverySnapshot || order.driverId || order.entregador_id || order.entregadorId)
  ) {
    return 'ENTREGA';
  }

  if (
    rawAtendimento === 'MESA' || 
    rawAtendimento === 'DINE_IN' || 
    rawServiceMode === 'DINE_IN' || 
    rawTipoEntrega === 'consumo_local' || 
    rawTipoEntrega === 'mesa' ||
    hasTableOrComanda
  ) {
    return 'MESA';
  }

  return 'RETIRADA';
}

export function isRetiradaOrder(order: any): boolean {
  if (!order) return false;
  const modality = getOrderModality(order);
  if (modality === 'BALCAO_RETIRADA') return true;
  if (modality === 'TOTEM') {
    return getTotemRealModality(order) === 'RETIRADA';
  }
  return false;
}

