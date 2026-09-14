import React from 'react';
import { normalizeOrderOrigem, OrderOrigem, getOrderModality, OrderModality } from '../../domain/order/orderSource';
import { getPaymentMethodLabel } from '../../services/paymentMethodsService';
import { markOrderPrintedOnPrinter } from '../../services/kitchenAutoPrintService';
import { 
  printViaCentralService, 
  resolveOrderDestination, 
  getRestaurantConfiguredPrinters,
  getRestaurantPrintStations,
  routeOrderItemsByStations,
  getPrintersForDestination,
  recordPrintHistoryItem,
  showDiscretePrintNotice,
  isDocumentAlreadyPrinted,
  recordSuccessfulPrint,
  recordFailedPrint,
  buildPrintCompositeKey,
  acquirePrintLock,
  releasePrintLock,
  PrintDestinationType,
  PaperSize 
} from '../../services/printCentralService';

// Simple HTML escape helper to prevent injection
export function escapeHtml(unsafe: any): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Map payment methods to clean Portuguese display
function formatPaymentMethod(method: string, configuredMethods?: any): string {
  if (!method) return 'A combinar';
  return getPaymentMethodLabel(method, configuredMethods);
}

export type OrderThermalPrintProps = {
  order: any;
  restaurant?: any;
};

// Helper: Formats items list for thermal receipts
function formatItemsHtml(items: any[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<div class="item-block text-center" style="font-style: italic;">Nenhum item listado</div>';
  }

  let itemsHtml = '';
  items.forEach((item: any) => {
    const itemPreco = Number(item.preco || item.price || 0);
    const itemQtd = Number(item.quantidade || item.quantity || 1);
    const itemSubtotal = itemPreco * itemQtd;
    const itemName = escapeHtml(item.nome || item.name || '');
    const itemObs = escapeHtml(item.observacao || item.notes || item.observation || '');
    const itemTamanho = escapeHtml(item.tamanho || item.variation || item.opcao_escolhida || '');
    const itemRemocoes = escapeHtml(item.remocoes || item.removidos || '');

    itemsHtml += `
      <div class="item-block">
        <div class="item-title flex">
          <span class="font-bold">${itemQtd}x ${itemName}</span>
          <span class="item-price">R$ ${itemSubtotal.toFixed(2)}</span>
        </div>
        ${itemTamanho ? `<div class="item-sub-info">• Tamanho: ${itemTamanho}</div>` : ''}
        ${itemRemocoes ? `<div class="item-sub-info">• Sem: ${itemRemocoes}</div>` : ''}
        ${itemObs ? `<div class="item-obs">Obs: ${itemObs}</div>` : ''}
    `;

    // Extras / Adicionais
    const extras = Array.isArray(item.adicionais) ? item.adicionais : Array.isArray(item.extras) ? item.extras : [];
    if (extras.length > 0) {
      extras.forEach((extra: any) => {
        const extraPreco = Number(extra.preco || extra.price || 0);
        const extraQtd = Number(extra.quantidade || extra.quantity || 1);
        const extraSubtotal = extraPreco * extraQtd;
        const extraName = escapeHtml(extra.nome || extra.name || '');

        itemsHtml += `
          <div class="item-extra flex">
            <span>+ ${extraQtd}x ${extraName}</span>
            <span>R$ ${extraSubtotal.toFixed(2)}</span>
          </div>
        `;
      });
    }

    itemsHtml += `</div>`;
  });

  return itemsHtml;
}

// Helper: Formats financial summary rows
function formatFinancialHtml(order: any, options: { showDeliveryFee?: boolean; showServiceFee?: boolean } = {}): { html: string; total: number } {
  const subtotal = Number(order.valor_produtos || order.subtotal || 0);
  const desconto = Number(order.valor_desconto || order.desconto || 0);
  const acrescimo = Number(order.valor_acrescimo || order.acrescimo || 0);
  const taxaEntrega = options.showDeliveryFee ? Number(order.taxa_entrega || order.deliveryFee || 0) : 0;
  const taxaServico = options.showServiceFee ? Number(order.taxa_servico || order.serviceFee || 0) : 0;
  const orderTotal = Number(order.total || order.valor_total || (subtotal - desconto + acrescimo + taxaEntrega + taxaServico));

  let financialHtml = `
    <div class="flex"><span>Subtotal:</span><span>R$ ${subtotal.toFixed(2)}</span></div>
  `;
  if (desconto > 0) {
    financialHtml += `
      <div class="flex"><span>Desconto:</span><span>- R$ ${desconto.toFixed(2)}</span></div>
    `;
  }
  if (acrescimo > 0) {
    financialHtml += `
      <div class="flex"><span>Acréscimo:</span><span>R$ ${acrescimo.toFixed(2)}</span></div>
    `;
  }
  if (taxaEntrega > 0) {
    financialHtml += `
      <div class="flex"><span>Taxa de Entrega:</span><span>R$ ${taxaEntrega.toFixed(2)}</span></div>
    `;
  }
  if (taxaServico > 0) {
    financialHtml += `
      <div class="flex"><span>Taxa de Serviço:</span><span>R$ ${taxaServico.toFixed(2)}</span></div>
    `;
  }

  return { html: financialHtml, total: orderTotal };
}

// Helper: Formats the payment box block
function formatPaymentBoxHtml(order: any, orderTotal: number, restaurant?: any, customTitle?: string): string {
  let amountAlreadyPaid = 0;
  if (order.pago === true) {
    amountAlreadyPaid = orderTotal;
  } else if (order.pago_parcial || order.valor_pago) {
    amountAlreadyPaid = Number(order.valor_pago || 0);
  } else {
    const isOnlinePayment = 
      order.forma_pagamento === 'pix_app' || 
      order.forma_pagamento === 'cartao_credito_online' ||
      order.pagoOnline === true ||
      !!order.mercadopago_payment_id;
    if (isOnlinePayment) {
      amountAlreadyPaid = orderTotal;
    }
  }

  const amountDue = Math.max(0, orderTotal - amountAlreadyPaid);
  const methodLabel = formatPaymentMethod(order.forma_pagamento || order.paymentMethod, restaurant?.formas_pagamento || restaurant?.payment_methods);

  if (amountDue <= 0) {
    return `
      <div class="payment-box">
        <div class="payment-title">${customTitle || 'PEDIDO JÁ PAGO'}</div>
        <div class="info-row"><b>Forma de pagamento:</b> ${methodLabel}</div>
        <div class="info-row"><b>Valor pago:</b> R$ ${orderTotal.toFixed(2)}</div>
        <div class="payment-notice">NÃO COBRAR DO CLIENTE</div>
      </div>
    `;
  }

  let changeHtml = '';
  if (order.troco) {
    const trocoParaNum = parseFloat(String(order.troco).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!isNaN(trocoParaNum) && trocoParaNum > amountDue) {
      const trocoAmount = trocoParaNum - amountDue;
      changeHtml = `
        <div class="info-row"><b>Cliente pagará com:</b> R$ ${trocoParaNum.toFixed(2)}</div>
        <div class="info-row font-bold"><b>Levar troco de:</b> R$ ${trocoAmount.toFixed(2)}</div>
      `;
    } else {
      changeHtml = `
        <div class="info-row"><b>Levar troco para:</b> ${escapeHtml(order.troco)}</div>
      `;
    }
  }

  const partialPaymentMsg = amountAlreadyPaid > 0 ? `
    <div class="info-row"><b>Valor já pago:</b> R$ ${amountAlreadyPaid.toFixed(2)}</div>
  ` : '';

  return `
    <div class="payment-box">
      <div class="payment-title">${customTitle || 'COBRAR NA ENTREGA'}</div>
      ${partialPaymentMsg}
      <div class="info-row font-bold" style="font-size: 11pt;"><b>Valor a cobrar:</b> R$ ${amountDue.toFixed(2)}</div>
      <div class="info-row"><b>Forma prevista:</b> ${methodLabel}</div>
      ${changeHtml}
    </div>
  `;
}

// Global base CSS template for 58mm / 80mm / 100mm printers
export function getThermalStyles(paperSize: string = '80mm'): string {
  const maxWidth = paperSize === '48mm' || paperSize === '58mm' ? '58mm' : paperSize === '112mm' || paperSize === '100mm' ? '100mm' : '80mm';

  return `
    @page {
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #000;
      font-family: 'Courier New', Courier, monospace, Arial, Helvetica, sans-serif;
      font-size: 9.5pt;
      line-height: 1.35;
    }
    .receipt {
      width: 100%;
      max-width: ${maxWidth};
      margin: 0 auto;
      padding: 4mm 3mm;
      box-sizing: border-box;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .mb-1 { margin-bottom: 4px; }
    .mb-2 { margin-bottom: 8px; }
    .mt-1 { margin-top: 4px; }
    .mt-2 { margin-top: 8px; }
    .divider { 
      border-top: 1px dashed #000; 
      margin: 8px 0; 
    }
    .divider-solid {
      border-top: 1px solid #000;
      margin: 8px 0;
    }
    .flex { 
      display: flex; 
      justify-content: space-between; 
    }
    .info-row {
      margin-bottom: 2px;
    }
    .badge-modalidade {
      font-size: 11pt;
      font-weight: bold;
      border: 1.5px solid #000;
      padding: 3px 0;
      text-align: center;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .item-block {
      margin-bottom: 6px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .item-title {
      font-size: 10pt;
    }
    .item-sub-info {
      font-size: 8.5pt;
      padding-left: 12px;
      color: #222;
    }
    .item-obs {
      font-size: 8.5pt;
      padding-left: 12px;
      font-style: italic;
      font-weight: bold;
    }
    .item-extra {
      font-size: 8.5pt;
      padding-left: 12px;
    }
    .kitchen-obs-box {
      border: 1px solid #000;
      padding: 6px;
      margin: 8px 0;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .payment-box {
      border: 1px dashed #000;
      padding: 8px;
      margin-top: 10px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .payment-title {
      font-size: 11pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .payment-notice {
      font-size: 10pt;
      font-weight: bold;
      text-align: center;
      margin-top: 4px;
    }
    .footer {
      font-size: 8pt;
      text-align: center;
      margin-top: 14px;
      color: #444;
    }
    
    /* Adaptability for 58mm small thermal printers */
    @media print and (max-width: 60mm) {
      .receipt {
        padding: 2mm 1.5mm;
        font-size: 8.5pt;
      }
      .item-title {
        font-size: 9pt;
      }
      .payment-title {
        font-size: 10pt;
      }
      .badge-modalidade {
        font-size: 9.5pt;
      }
    }

    @media print {
      html, body {
        width: auto;
        height: auto;
      }
      .receipt {
        width: 100%;
        max-width: none;
        margin: 0;
      }
    }
  `;
}

// ============================================================================
// MODELO 1: DELIVERY (Entrega)
// ============================================================================
function generateDeliveryReceiptHtml(order: any, restaurant?: any, profile?: any): string {
  const restName = escapeHtml(restaurant?.nome_fantasia || restaurant?.nome || profile?.nome || '');

  const orderCode = escapeHtml((order.id || '').slice(-6).toUpperCase());
  const clientName = escapeHtml(order.nome_cliente || order.customerName || order.cliente?.nome || 'Cliente');
  const clientPhone = escapeHtml(order.telefone_cliente || order.customerPhone || order.cliente?.telefone || order.telefone || '');

  const rua = escapeHtml(order.endereco?.rua || order.rua || order.endereco_entrega?.rua || '');
  const numero = escapeHtml(order.endereco?.numero || order.numero || order.endereco_entrega?.numero || 'S/N');
  const complemento = escapeHtml(order.endereco?.complemento || order.complemento || order.endereco_entrega?.complemento || '');
  const bairro = escapeHtml(order.endereco?.bairro || order.bairro || order.endereco_entrega?.bairro || '');
  const cidade = escapeHtml(order.endereco?.cidade || order.cidade || order.endereco_entrega?.cidade || '');
  const referencia = escapeHtml(order.endereco?.referencia || order.referencia || order.endereco_entrega?.referencia || '');

  let enderecoFormatado = '';
  if (rua) {
    enderecoFormatado = `${rua}, ${numero}`;
    if (complemento) enderecoFormatado += ` (${complemento})`;
    if (bairro) enderecoFormatado += ` - ${bairro}`;
    if (cidade) enderecoFormatado += ` / ${cidade}`;
  } else {
    enderecoFormatado = escapeHtml(order.enderecoCompleto || order.endereco_completo || order.endereco || 'Não informado');
  }

  // Financial calculations
  const subtotal = Number(order.valor_produtos || order.subtotal || 0);
  const taxaEntrega = Number(order.taxa_entrega || order.deliveryFee || 0);
  const desconto = Number(order.valor_desconto || order.desconto || 0);
  const acrescimo = Number(order.valor_acrescimo || order.acrescimo || 0);
  const orderTotal = Number(order.total || order.valor_total || (subtotal - desconto + acrescimo + taxaEntrega));

  // Payment status calculation
  let amountAlreadyPaid = 0;
  if (order.pago === true) {
    amountAlreadyPaid = orderTotal;
  } else if (order.pago_parcial || order.valor_pago) {
    amountAlreadyPaid = Number(order.valor_pago || 0);
  } else {
    const isOnlinePayment = 
      order.forma_pagamento === 'pix_app' || 
      order.forma_pagamento === 'cartao_credito_online' ||
      order.pagoOnline === true ||
      !!order.mercadopago_payment_id;
    if (isOnlinePayment) {
      amountAlreadyPaid = orderTotal;
    }
  }

  const amountDue = Math.max(0, orderTotal - amountAlreadyPaid);
  const paymentMethodStr = formatPaymentMethod(order.forma_pagamento || order.paymentMethod, restaurant?.formas_pagamento || restaurant?.payment_methods);

  let paymentStatusHtml = '';
  if (amountDue <= 0) {
    paymentStatusHtml = `
      <div class="info-row font-bold" style="font-size: 11pt; color: #000; margin-top: 2px;">
        <b>Status:</b> PAGO (NÃO COBRAR)
      </div>
    `;
  } else {
    let trocoHtml = '';
    if (order.troco) {
      const trocoParaNum = parseFloat(String(order.troco).replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!isNaN(trocoParaNum) && trocoParaNum > amountDue) {
        const trocoVal = trocoParaNum - amountDue;
        trocoHtml = ` (Troco para R$ ${trocoParaNum.toFixed(2)} -> Levar R$ ${trocoVal.toFixed(2)})`;
      } else {
        trocoHtml = ` (Troco para: ${escapeHtml(order.troco)})`;
      }
    }
    paymentStatusHtml = `
      <div class="info-row font-bold" style="font-size: 11pt; color: #000; margin-top: 2px;">
        <b>Status:</b> RECEBER NA ENTREGA: R$ ${amountDue.toFixed(2)}${trocoHtml}
      </div>
    `;
  }

  const items = Array.isArray(order.itens) ? order.itens : Array.isArray(order.items) ? order.items : [];
  const itemsHtml = formatItemsHtml(items);

  const obsGeral = escapeHtml(order.observacao || order.observacoes || order.notes || '');

  return `
    ${restName ? `<div class="text-center font-bold mb-1" style="font-size: 11pt;">${restName}</div>` : ''}

    <!-- Top Highlight -->
    <div class="text-center font-bold" style="font-size: 14pt; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; letter-spacing: 0.5px;">
      DELIVERY
    </div>

    <!-- Header / Highlight Details -->
    <div class="info-row" style="font-size: 12pt; font-weight: bold;"><b>Número do Pedido:</b> #${orderCode}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Cliente:</b> ${clientName}</div>
    ${clientPhone ? `<div class="info-row" style="font-size: 10.5pt;"><b>Telefone:</b> ${clientPhone}</div>` : ''}
    <div class="info-row" style="font-size: 10.5pt;"><b>Endereço:</b> ${enderecoFormatado}</div>
    ${referencia ? `<div class="info-row" style="font-size: 10.5pt;"><b>Referência:</b> ${referencia}</div>` : ''}
    <div class="info-row" style="font-size: 10.5pt;"><b>Forma de Pagamento:</b> ${paymentMethodStr}</div>
    ${paymentStatusHtml}

    <div class="divider-solid"></div>

    <!-- Items List -->
    <div class="font-bold mb-2" style="font-size: 10.5pt;">ITENS DO PEDIDO:</div>
    ${itemsHtml}

    <!-- Observations -->
    ${obsGeral ? `
      <div class="divider"></div>
      <div class="kitchen-obs-box">
        <div class="font-bold text-center" style="font-size: 10pt;">OBSERVAÇÕES</div>
        <div class="mt-1 font-bold text-center" style="font-size: 10.5pt;">${obsGeral}</div>
      </div>
    ` : ''}

    <div class="divider-solid"></div>

    <!-- Financial Breakdown -->
    <div class="flex" style="font-size: 10pt;"><span>Subtotal:</span><span>R$ ${subtotal.toFixed(2)}</span></div>
    ${desconto > 0 ? `<div class="flex" style="font-size: 10pt;"><span>Desconto:</span><span>- R$ ${desconto.toFixed(2)}</span></div>` : ''}
    ${acrescimo > 0 ? `<div class="flex" style="font-size: 10pt;"><span>Acréscimo:</span><span>R$ ${acrescimo.toFixed(2)}</span></div>` : ''}
    <div class="flex" style="font-size: 10pt;"><span>Entrega:</span><span>R$ ${taxaEntrega.toFixed(2)}</span></div>
    <div class="flex font-bold mt-1" style="font-size: 12pt; border-top: 1px solid #000; padding-top: 4px;">
      <span>TOTAL:</span>
      <span>R$ ${orderTotal.toFixed(2)}</span>
    </div>
  `;
}

// Helper: Formats items list for Garcom thermal receipts
function formatGarcomItemsHtml(items: any[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<div class="item-block text-center" style="font-style: italic;">Nenhum item listado</div>';
  }

  let html = '';
  items.forEach((item: any) => {
    const itemQtd = Number(item.quantidade || item.quantity || 1);
    const itemName = escapeHtml(item.nome || item.name || '');
    const itemTamanho = escapeHtml(item.tamanho || item.variation || item.opcao_escolhida || item.tamanho_nome || '');
    const itemRemocoes = escapeHtml(item.remocoes || item.removidos || '');
    const itemObs = escapeHtml(item.observacao || item.notes || item.observation || '');

    html += `
      <div class="item-block" style="margin-bottom: 8px;">
        <div class="item-title" style="font-size: 11pt; font-weight: bold;">
          <span>${itemQtd}x ${itemName}</span>
        </div>
        ${itemTamanho ? `<div class="item-sub-info" style="font-size: 9pt; padding-left: 8px;">• Tamanho/Variação: ${itemTamanho}</div>` : ''}
        ${itemRemocoes ? `<div class="item-sub-info" style="font-size: 9pt; padding-left: 8px;">• Sem: ${itemRemocoes}</div>` : ''}
    `;

    const extras = Array.isArray(item.adicionais) ? item.adicionais : Array.isArray(item.extras) ? item.extras : [];
    if (extras.length > 0) {
      extras.forEach((extra: any) => {
        const extraQtd = Number(extra.quantidade || extra.quantity || 1);
        const extraName = escapeHtml(extra.nome || extra.name || '');
        html += `
          <div class="item-extra" style="font-size: 9pt; padding-left: 8px;">
            + ${extraQtd}x ${extraName}
          </div>
        `;
      });
    }

    if (itemObs) {
      html += `
        <div class="item-obs" style="font-size: 9pt; padding-left: 8px; font-weight: bold; font-style: italic; margin-top: 2px;">
          Obs: ${itemObs}
        </div>
      `;
    }

    html += `</div>`;
  });

  return html;
}

// ============================================================================
// MODELO 2: GARÇOM (Mesa / Comanda / Atendimento de Salão)
// ============================================================================
function generateGarcomReceiptHtml(order: any, restaurant?: any, profile?: any): string {
  const restName = escapeHtml(restaurant?.nome_fantasia || restaurant?.nome || profile?.nome || '');

  const rawOrderNum = order.number || order.numero || order.numero_pedido || order.orderNumber || order.displayId || order.id || '';
  const orderCode = escapeHtml(String(rawOrderNum).length > 8 ? String(rawOrderNum).slice(-6).toUpperCase() : String(rawOrderNum));

  const rawDate = order.data_criacao || order.createdAt ? new Date(order.data_criacao || order.createdAt) : new Date();
  const horarioStr = rawDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Table, Tab & Waiter identification
  const tableName = escapeHtml(
    order.tableName || 
    (order.tableNumber !== undefined && order.tableNumber !== null ? `Mesa ${order.tableNumber}` : '') || 
    (order.numero_mesa !== undefined && order.numero_mesa !== null ? `Mesa ${order.numero_mesa}` : '') || 
    order.mesa || 
    order.num_mesa || 
    'Mesa'
  );

  const rawTab = order.tabId || order.comandaId || order.comanda_id || order.tabNumber || order.tab_id;
  const tabDisplay = rawTab ? escapeHtml(String(rawTab).startsWith('#') ? rawTab : `#${String(rawTab).slice(-6).toUpperCase()}`) : 'Comanda';

  const rawWaiter = order.waiterName || order.garcom_nome || order.garcom || order.nome_garcom || '';
  const waiterName = rawWaiter ? escapeHtml(rawWaiter) : '';

  const roundNum = order.roundNumber || order.numero_rodada || order.round || order.rodada;
  const roundDisplay = roundNum ? `${escapeHtml(String(roundNum))}ª Rodada` : '1ª Rodada';

  const items = Array.isArray(order.itens) ? order.itens : Array.isArray(order.items) ? order.items : [];
  const itemsHtml = formatGarcomItemsHtml(items);

  const obsGeral = escapeHtml(order.observacao || order.observacoes || order.notes || '');

  return `
    ${restName ? `<div class="text-center font-bold mb-1" style="font-size: 11pt;">${restName}</div>` : ''}

    <!-- Top Highlight -->
    <div class="text-center font-bold" style="font-size: 14pt; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; letter-spacing: 0.5px;">
      PEDIDO DE MESA
    </div>

    <!-- Header Details -->
    <div class="info-row" style="font-size: 12pt; font-weight: bold;"><b>Pedido:</b> #${orderCode}</div>
    <div class="info-row" style="font-size: 12pt; font-weight: bold;"><b>Mesa:</b> ${tableName}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Comanda:</b> ${tabDisplay}</div>
    ${waiterName ? `<div class="info-row" style="font-size: 10.5pt;"><b>Garçom:</b> ${waiterName}</div>` : ''}
    <div class="info-row" style="font-size: 10.5pt;"><b>Rodada:</b> ${roundDisplay}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Horário:</b> ${horarioStr}</div>

    <div class="divider-solid"></div>

    <!-- Items List -->
    <div class="font-bold mb-2" style="font-size: 10.5pt;">ITENS:</div>
    ${itemsHtml}

    ${obsGeral ? `
      <div class="divider"></div>
      <div class="kitchen-obs-box">
        <div class="font-bold text-center" style="font-size: 10pt;">OBSERVAÇÃO GERAL</div>
        <div class="mt-1 font-bold text-center" style="font-size: 10.5pt;">${obsGeral}</div>
      </div>
    ` : ''}
  `;
}

// ============================================================================
// MODELO 3: BALCÃO (Takeaway / Retirada / Consumo no Caixa)
// ============================================================================
function generateBalcaoReceiptHtml(order: any, restaurant?: any, profile?: any): string {
  const restName = escapeHtml(restaurant?.nome_fantasia || restaurant?.nome || profile?.nome || '');

  const rawOrderNum = order.number || order.numero || order.numero_pedido || order.orderNumber || order.displayId || order.id || '';
  const orderCode = escapeHtml(String(rawOrderNum).length > 8 ? String(rawOrderNum).slice(-6).toUpperCase() : String(rawOrderNum));
  const rawDate = order.data_criacao || order.createdAt ? new Date(order.data_criacao || order.createdAt) : new Date();
  const horarioStr = rawDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Senha / comanda de retirada se existir
  const senhaRetirada = order.senha || order.pickupCode || order.retiradaCode || order.senhaRetirada || order.codigoRetirada || order.comandaRetirada || order.tabId || order.comandaId;
  const senhaDisplay = senhaRetirada ? escapeHtml(String(senhaRetirada).startsWith('#') ? senhaRetirada : `#${String(senhaRetirada).slice(-6).toUpperCase()}`) : '';

  // Cliente se informado
  const rawClientName = order.nome_cliente || order.customerName || order.cliente?.nome || '';
  const clientName = rawClientName ? escapeHtml(rawClientName) : '';

  const items = Array.isArray(order.itens) ? order.itens : Array.isArray(order.items) ? order.items : [];
  const itemsHtml = formatItemsHtml(items);

  const obsGeral = escapeHtml(order.observacao || order.observacoes || order.notes || '');

  return `
    ${restName ? `<div class="text-center font-bold mb-1" style="font-size: 11pt;">${restName}</div>` : ''}

    <!-- Top Highlight -->
    <div class="text-center font-bold" style="font-size: 14pt; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; letter-spacing: 0.5px;">
      BALCÃO / RETIRADA
    </div>

    <!-- Header Details -->
    <div class="info-row" style="font-size: 12pt; font-weight: bold;"><b>Número do Pedido:</b> #${orderCode}</div>
    ${senhaDisplay ? `<div class="info-row" style="font-size: 11pt; font-weight: bold;"><b>Senha/Retirada:</b> ${senhaDisplay}</div>` : ''}
    ${clientName ? `<div class="info-row" style="font-size: 10.5pt;"><b>Cliente:</b> ${clientName}</div>` : ''}
    <div class="info-row" style="font-size: 10.5pt;"><b>Horário:</b> ${horarioStr}</div>

    <div class="divider-solid"></div>

    <!-- Items List -->
    <div class="font-bold mb-2" style="font-size: 10.5pt;">ITENS DO PEDIDO:</div>
    ${itemsHtml}

    <!-- Observations -->
    ${obsGeral ? `
      <div class="divider"></div>
      <div class="kitchen-obs-box">
        <div class="font-bold text-center" style="font-size: 10pt;">OBSERVAÇÕES</div>
        <div class="mt-1 font-bold text-center" style="font-size: 10.5pt;">${obsGeral}</div>
      </div>
    ` : ''}
  `;
}

// ============================================================================
// MODELO 4: TOTEM (Autoatendimento / Kiosk)
// ============================================================================
function generateTotemReceiptHtml(order: any, restaurant?: any, profile?: any): string {
  const restName = escapeHtml(restaurant?.nome_fantasia || restaurant?.nome || profile?.nome || '');

  const rawOrderNum = order.number || order.numero || order.numero_pedido || order.orderNumber || order.displayId || order.id || '';
  const orderCode = escapeHtml(String(rawOrderNum).length > 8 ? String(rawOrderNum).slice(-6).toUpperCase() : String(rawOrderNum));
  const rawDate = order.data_criacao || order.createdAt ? new Date(order.data_criacao || order.createdAt) : new Date();
  const horarioStr = rawDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Senha destacada para chamada de autoatendimento
  const rawSenha = order.senha || order.pickupCode || order.retiradaCode || order.senhaRetirada || order.codigoRetirada || orderCode;
  const senhaDisplay = escapeHtml(String(rawSenha).startsWith('#') ? rawSenha : `#${String(rawSenha).slice(-6).toUpperCase()}`);

  const items = Array.isArray(order.itens) ? order.itens : Array.isArray(order.items) ? order.items : [];
  const itemsHtml = formatItemsHtml(items);

  const obsGeral = escapeHtml(order.observacao || order.observacoes || order.notes || '');

  return `
    ${restName ? `<div class="text-center font-bold mb-1" style="font-size: 11pt;">${restName}</div>` : ''}

    <!-- Top Highlight -->
    <div class="text-center font-bold" style="font-size: 14pt; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; letter-spacing: 0.5px;">
      TOTEM
    </div>

    <!-- Header Details -->
    <div class="info-row" style="font-size: 12pt; font-weight: bold;"><b>Número do Pedido:</b> #${orderCode}</div>
    <div class="info-row" style="font-size: 12pt; font-weight: bold;"><b>Senha:</b> ${senhaDisplay}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Horário:</b> ${horarioStr}</div>

    <div class="divider-solid"></div>

    <!-- Items List -->
    <div class="font-bold mb-2" style="font-size: 10.5pt;">ITENS DO PEDIDO:</div>
    ${itemsHtml}

    <!-- Observations -->
    ${obsGeral ? `
      <div class="divider"></div>
      <div class="kitchen-obs-box">
        <div class="font-bold text-center" style="font-size: 10pt;">OBSERVAÇÕES</div>
        <div class="mt-1 font-bold text-center" style="font-size: 10.5pt;">${obsGeral}</div>
      </div>
    ` : ''}
  `;
}

// ============================================================================
// FORMATTER: Kitchen Ticket Items (Simple, large, legible, strictly production)
// NO prices, NO currency values, NO financial info
// ============================================================================
function formatKitchenTicketItemsHtml(items: any[]): string {
  if (!Array.isArray(items) || items.length === 0) {
    return '<div style="text-align: center; font-weight: bold; padding: 8px 0; font-size: 11pt;">SEM ITENS LISTADOS</div>';
  }

  let html = '';
  items.forEach((item: any) => {
    const qtd = Number(item.quantidade || item.quantity || 1);
    const nome = escapeHtml(item.nome || item.name || item.produto || '');
    const tamanho = escapeHtml(item.tamanho || item.variation || item.opcao_escolhida || item.tamanho_nome || '');
    const remocoes = escapeHtml(item.remocoes || item.removidos || '');
    const obsItem = escapeHtml(item.observacao || item.observacoes || item.notes || item.observation || '');

    html += `
      <div style="margin-bottom: 8px; border-bottom: 1px dashed #444; padding-bottom: 6px; break-inside: avoid; page-break-inside: avoid;">
        <div style="font-size: 13pt; font-weight: 900; line-height: 1.25;">
          <span>${qtd}x ${nome}</span>
        </div>
        ${tamanho ? `<div style="font-size: 11pt; font-weight: bold; margin-top: 2px; padding-left: 10px;">• ${tamanho}</div>` : ''}
        ${remocoes ? `<div style="font-size: 11pt; font-weight: 900; margin-top: 2px; padding-left: 10px; color: #000;">• SEM: ${remocoes}</div>` : ''}
    `;

    const extras = Array.isArray(item.adicionais) ? item.adicionais : Array.isArray(item.extras) ? item.extras : Array.isArray(item.subitens) ? item.subitens : [];
    if (extras.length > 0) {
      extras.forEach((extra: any) => {
        const extraQtd = Number(extra.quantidade || extra.quantity || 1);
        const extraNome = escapeHtml(extra.nome || extra.name || extra.produto || extra);
        html += `
          <div style="font-size: 10.5pt; font-weight: bold; padding-left: 10px; margin-top: 1px;">
            + ${extraQtd > 1 ? `${extraQtd}x ` : ''}${extraNome}
          </div>
        `;
      });
    }

    if (obsItem) {
      html += `
        <div style="font-size: 11.5pt; font-weight: 900; padding: 4px 6px; margin-top: 4px; background: #eee; border: 1.5px solid #000; border-radius: 4px;">
          OBS: ${obsItem}
        </div>
      `;
    }

    html += `</div>`;
  });

  return html;
}

// ============================================================================
// GENERATOR: TICKET DE PRODUÇÃO DA COZINHA / KDS
// Simples, grande, legível e focado somente na PRODUÇÃO
// ============================================================================
export function generateKitchenTicketHtml(order: any, restaurant?: any, profile?: any): string {
  if (!order) return '';

  const modality: OrderModality = getOrderModality(order);
  const paperSize = profile?.impressora_tamanho || restaurant?.impressora_tamanho || restaurant?.defaultPaperSize || restaurant?.paperSize || '80mm';

  // Número do pedido padronizado
  const rawOrderNum = order.number || order.numero || order.numero_pedido || order.orderNumber || order.displayId || order.id || '';
  const orderNumStr = String(rawOrderNum).length > 8 ? String(rawOrderNum).slice(-6).toUpperCase() : String(rawOrderNum);

  // Mesa padronizada
  const rawMesa = order.tableNumber !== undefined && order.tableNumber !== null && String(order.tableNumber).trim() !== ''
    ? order.tableNumber
    : (order.mesa_numero !== undefined && order.mesa_numero !== null && String(order.mesa_numero).trim() !== ''
        ? order.mesa_numero
        : (order.tableName || order.mesa || order.num_mesa || ''));
  const mesaNumStr = String(rawMesa).replace(/^mesa\s*/i, '').trim();
  const mesaDisplay = mesaNumStr ? (isNaN(Number(mesaNumStr)) ? mesaNumStr : `MESA ${mesaNumStr.padStart(2, '0')}`) : 'MESA --';

  // Comanda padronizada
  const rawTab = order.tabId || order.comandaId || order.comanda_id || order.tabNumber || order.comandaNumero || order.tab_id;
  const tabNumStr = rawTab ? String(rawTab).replace(/^comanda\s*/i, '').trim() : '';
  const tabDisplay = tabNumStr ? (String(tabNumStr).startsWith('#') ? tabNumStr : `#${String(tabNumStr).length > 6 ? String(tabNumStr).slice(-6).toUpperCase() : tabNumStr}`) : '';

  // Garçom: Para GARCOM, usar waiterName gravado no momento da criação do pedido. NÃO consultar cadastro de funcionário.
  const waiterName = order.waiterName || order.garcom_nome || order.garcom || order.nome_garcom || '';

  // Rodada
  const roundNum = order.roundNumber || order.numero_rodada || order.round || order.rodada;
  const roundDisplay = roundNum ? `${roundNum}` : (order.currentRound ? `${order.currentRound}` : '');

  // Horário
  const orderDate = order.data_criacao || order.createdAt ? new Date(order.data_criacao || order.createdAt) : new Date();
  const horarioStr = orderDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Cliente
  const rawClient = order.cliente_nome || order.nome_cliente || order.customerName || order.cliente?.nome || order.customer?.name || '';
  const clientName = rawClient ? escapeHtml(String(rawClient)) : '';

  // Número de retirada / senha (se existir)
  const rawPickup = order.senha || order.pickupCode || order.retiradaCode || order.senhaRetirada || order.codigoRetirada || order.pickupNumber;
  const pickupCode = rawPickup ? escapeHtml(String(rawPickup)) : '';

  // Observações gerais do pedido
  const rawObsGeral = order.observacao || order.observacoes || order.notes || order.observation || order.observacao_cozinha || order.observacoes_cozinha || '';
  const obsGeral = rawObsGeral ? escapeHtml(String(rawObsGeral)) : '';

  // Itens
  const items = order.items || order.itens || [];
  const itemsHtml = formatKitchenTicketItemsHtml(items);

  let headerHtml = '';

  switch (modality) {
    case 'GARCOM_MESA':
      // 1. GARCOM / MESA
      // Cabeçalho em destaque:
      // MESA 04
      // Pedido #numero
      // Comanda #numero
      // Garçom: nome
      // Rodada: numero
      // Horário
      headerHtml = `
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 22pt; font-weight: 900; line-height: 1.1; letter-spacing: 0.5px;">${mesaDisplay}</div>
          <div style="font-size: 16pt; font-weight: 900; margin-top: 3px;">Pedido #${orderNumStr}</div>
        </div>
        <div style="font-size: 11pt; line-height: 1.4; margin-bottom: 6px;">
          ${tabDisplay ? `<div><b>Comanda:</b> ${tabDisplay}</div>` : ''}
          ${waiterName ? `<div><b>Garçom:</b> ${escapeHtml(waiterName)}</div>` : ''}
          ${roundDisplay ? `<div><b>Rodada:</b> ${roundDisplay}</div>` : ''}
          <div><b>Horário:</b> ${horarioStr}</div>
        </div>
      `;
      break;

    case 'BALCAO_MESA':
      // 2. BALCAO + MESA
      // BALCÃO • MESA
      // Mesa
      // Pedido #numero
      // Comanda
      // Horário
      headerHtml = `
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 14pt; font-weight: 900; letter-spacing: 0.5px;">BALCÃO • MESA</div>
          <div style="font-size: 20pt; font-weight: 900; margin-top: 2px; line-height: 1.1;">${mesaDisplay}</div>
          <div style="font-size: 15pt; font-weight: 900; margin-top: 2px;">Pedido #${orderNumStr}</div>
        </div>
        <div style="font-size: 11pt; line-height: 1.4; margin-bottom: 6px;">
          ${tabDisplay ? `<div><b>Comanda:</b> ${tabDisplay}</div>` : ''}
          <div><b>Horário:</b> ${horarioStr}</div>
        </div>
      `;
      break;

    case 'BALCAO_RETIRADA':
      // 3. BALCAO + RETIRADA
      // BALCÃO • RETIRADA
      // Pedido #numero
      // Cliente, se existir
      // Horário
      headerHtml = `
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 14pt; font-weight: 900; letter-spacing: 0.5px;">BALCÃO • RETIRADA</div>
          <div style="font-size: 17pt; font-weight: 900; margin-top: 3px;">Pedido #${orderNumStr}</div>
          ${pickupCode ? `<div style="font-size: 13pt; font-weight: 900; margin-top: 2px;">Retirada: #${pickupCode}</div>` : ''}
        </div>
        <div style="font-size: 11pt; line-height: 1.4; margin-bottom: 6px;">
          ${clientName ? `<div><b>Cliente:</b> ${clientName}</div>` : ''}
          <div><b>Horário:</b> ${horarioStr}</div>
        </div>
      `;
      break;

    case 'BALCAO_ENTREGA':
      // 4. BALCAO + ENTREGA
      // BALCÃO • ENTREGA
      // Pedido #numero
      // Cliente
      // Horário
      headerHtml = `
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 14pt; font-weight: 900; letter-spacing: 0.5px;">BALCÃO • ENTREGA</div>
          <div style="font-size: 17pt; font-weight: 900; margin-top: 3px;">Pedido #${orderNumStr}</div>
        </div>
        <div style="font-size: 11pt; line-height: 1.4; margin-bottom: 6px;">
          <div><b>Cliente:</b> ${clientName || 'Cliente'}</div>
          <div><b>Horário:</b> ${horarioStr}</div>
        </div>
      `;
      break;

    case 'DELIVERY':
      // 5. DELIVERY
      // DELIVERY
      // Pedido #numero
      // Cliente
      // Horário
      headerHtml = `
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 14pt; font-weight: 900; letter-spacing: 0.5px;">DELIVERY</div>
          <div style="font-size: 17pt; font-weight: 900; margin-top: 3px;">Pedido #${orderNumStr}</div>
        </div>
        <div style="font-size: 11pt; line-height: 1.4; margin-bottom: 6px;">
          <div><b>Cliente:</b> ${clientName || 'Cliente'}</div>
          <div><b>Horário:</b> ${horarioStr}</div>
        </div>
      `;
      break;

    case 'TOTEM':
    default:
      // 6. TOTEM
      // TOTEM
      // Pedido #numero
      // Número de retirada, se existir
      // Horário
      headerHtml = `
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px;">
          <div style="font-size: 14pt; font-weight: 900; letter-spacing: 0.5px;">TOTEM</div>
          <div style="font-size: 17pt; font-weight: 900; margin-top: 3px;">Pedido #${orderNumStr}</div>
          ${pickupCode ? `<div style="font-size: 14pt; font-weight: 900; margin-top: 2px;">SENHA: #${pickupCode}</div>` : ''}
        </div>
        <div style="font-size: 11pt; line-height: 1.4; margin-bottom: 6px;">
          <div><b>Horário:</b> ${horarioStr}</div>
        </div>
      `;
      break;
  }

  const obsHtml = obsGeral ? `
    <div style="margin-top: 8px; border: 2px solid #000; padding: 6px; border-radius: 4px; background: #fff; break-inside: avoid; page-break-inside: avoid;">
      <div style="font-size: 10pt; font-weight: 900; text-align: center; border-bottom: 1px dashed #000; padding-bottom: 2px; margin-bottom: 4px;">OBSERVAÇÕES DO PEDIDO</div>
      <div style="font-size: 11pt; font-weight: bold; text-align: center;">${obsGeral}</div>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Ticket Cozinha #${orderNumStr}</title>
      <style>
        ${getThermalStyles(paperSize)}
      </style>
    </head>
    <body>
      <div class="receipt">
        <div style="text-align: center; font-size: 9pt; font-weight: 900; letter-spacing: 1px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 6px;">
          ${order?.stationName ? `*** PRODUÇÃO / ${escapeHtml(String(order.stationName).toUpperCase())} ***` : '*** PRODUÇÃO / COZINHA ***'}
        </div>
        ${headerHtml}
        <div style="border-top: 2px solid #000; margin: 6px 0 8px 0;"></div>
        <div style="font-size: 10pt; font-weight: 900; text-transform: uppercase; margin-bottom: 6px;">ITENS:</div>
        ${itemsHtml}
        ${obsHtml}
        <div style="margin-top: 10px; border-top: 2px solid #000; padding-top: 4px; text-align: center; font-weight: 900; font-size: 9pt; letter-spacing: 0.5px;">
          FIM DO TICKET DE PRODUÇÃO
        </div>
        <!-- Cutter Spacer (12mm) -->
        <div style="height: 12mm;"></div>
      </div>

      <script>
        window.onload = () => {
          window.focus();
          window.print();
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {}
          }, 800);
        };
      </script>
    </body>
    </html>
  `;
}

// ============================================================================
// MAIN GENERATOR: Automatic Model Dispatcher by source/origem + service mode
// ============================================================================
export function generateThermalReceiptHtml(order: any, restaurant?: any, profile?: any): string {
  if (!order) return '';

  if (order.type === 'PRE_CONTA' || order.isPreConta || order.isPreBill) {
    return generatePreContaReceiptHtml(order, restaurant, profile);
  }

  if (order.type === 'KITCHEN_TICKET' || order.type === 'COZINHA' || order.isKitchenTicket || order.isKitchen || order.forKitchen) {
    return generateKitchenTicketHtml(order, restaurant, profile);
  }

  // Identifica automaticamente a modalidade operacional do pedido
  const modality: OrderModality = getOrderModality(order);
  const paperSize = restaurant?.defaultPaperSize || restaurant?.paperSize || '80mm';

  let bodyContent = '';
  switch (modality) {
    case 'GARCOM_MESA':
    case 'BALCAO_MESA':
      bodyContent = generateGarcomReceiptHtml(order, restaurant, profile);
      break;
    case 'BALCAO_RETIRADA':
      bodyContent = generateBalcaoReceiptHtml(order, restaurant, profile);
      break;
    case 'TOTEM':
      bodyContent = generateTotemReceiptHtml(order, restaurant, profile);
      break;
    case 'BALCAO_ENTREGA':
    case 'DELIVERY':
    default:
      bodyContent = generateDeliveryReceiptHtml(order, restaurant, profile);
      break;
  }

  const rawOrderNum = order.number || order.numero || order.numero_pedido || order.orderNumber || order.displayId || order.id || '';
  const orderCode = escapeHtml(String(rawOrderNum).length > 8 ? String(rawOrderNum).slice(-6).toUpperCase() : String(rawOrderNum));

  // Complete HTML document containing the adapted styles and cut spacer
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Comprovante #${orderCode} - ${modality}</title>
      <style>
        ${getThermalStyles(paperSize)}
      </style>
    </head>
    <body>
      <div class="receipt">
        ${bodyContent}
        <!-- Cutter Spacer (12mm) -->
        <div style="height: 12mm;"></div>
      </div>

      <script>
        window.onload = () => {
          window.focus();
          window.print();
          // Auto close for popups after brief delay
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {}
          }, 800);
        };
      </script>
    </body>
    </html>
  `;
}

// Helper: Formats items grouped by rounds for Pre-Conta
function formatPreContaItemsByRound(data: any): { roundsHtml: string; totalSubtotalCents: number } {
  let roundsHtml = '';
  let totalSubtotalCents = 0;

  const formatBrlCents = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

  let groups: Array<{
    roundNumber: number;
    sentAt?: string;
    items: any[];
  }> = [];

  if (Array.isArray(data.roundGroups) && data.roundGroups.length > 0) {
    groups = data.roundGroups.map((rg: any) => ({
      roundNumber: rg.roundNumber || 1,
      sentAt: rg.sentAt ? new Date(rg.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : undefined,
      items: Array.isArray(rg.items) ? rg.items : []
    }));
  } else if (Array.isArray(data.orders) && data.orders.length > 0) {
    groups = data.orders.map((ord: any, idx: number) => ({
      roundNumber: ord.roundNumber || ord.numero_rodada || (idx + 1),
      sentAt: (ord.createdAt || ord.data_criacao) ? new Date(ord.createdAt || ord.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : undefined,
      items: Array.isArray(ord.itens) ? ord.itens : (Array.isArray(ord.items) ? ord.items : [])
    }));
  } else {
    const tabItems = Array.isArray(data.tab?.items) ? data.tab.items : (Array.isArray(data.items) ? data.items : []);
    if (tabItems.length > 0) {
      const groupMap = new Map<string, any[]>();
      tabItems.forEach((item: any) => {
        const key = item.orderId || item.sentAt || 'default_round';
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(item);
      });

      let rIndex = 1;
      groupMap.forEach((itemsInGroup) => {
        groups.push({
          roundNumber: rIndex++,
          items: itemsInGroup
        });
      });
    }
  }

  if (groups.length === 0) {
    return {
      roundsHtml: '<div class="item-block text-center mt-2" style="font-style: italic;">Nenhum item consumido</div>',
      totalSubtotalCents: 0
    };
  }

  groups.forEach((group) => {
    roundsHtml += `
      <div class="divider-solid"></div>
      <div class="font-bold mb-1" style="font-size: 10.5pt; text-transform: uppercase;">RODADA ${group.roundNumber}${group.sentAt ? ` (${group.sentAt})` : ''}</div>
    `;

    group.items.forEach((item: any) => {
      const statusStr = String(item.status || '').toLowerCase();
      const isCancelled = ['cancelled', 'cancelado', 'canceled', 'removed', 'removido'].includes(statusStr);

      const qty = Number(item.quantity || item.quantidade || 1);
      const productName = escapeHtml(item.productName || item.produtoNome || item.nome || item.name || 'Item');

      let unitCents = 0;
      if (typeof item.unitPriceCents === 'number') {
        unitCents = item.unitPriceCents;
      } else if (typeof item.precoUnitario === 'number') {
        unitCents = Math.round(item.precoUnitario * 100);
      } else if (typeof item.price === 'number') {
        unitCents = Math.round(item.price * 100);
      } else if (typeof item.preco === 'number') {
        unitCents = Math.round(item.preco * 100);
      }

      let totalCents = 0;
      if (typeof item.totalPriceCents === 'number') {
        totalCents = item.totalPriceCents;
      } else if (typeof item.total === 'number') {
        totalCents = Math.round(item.total * 100);
      } else if (typeof item.valorTotal === 'number') {
        totalCents = Math.round(item.valorTotal * 100);
      } else {
        totalCents = unitCents * qty;
      }

      if (!isCancelled) {
        totalSubtotalCents += totalCents;
      }

      const unitFormatted = formatBrlCents(unitCents);
      const totalFormatted = formatBrlCents(totalCents);

      let sizeStr = '';
      if (item.size) {
        sizeStr = escapeHtml(item.size);
      } else if (item.tamanho) {
        sizeStr = escapeHtml(item.tamanho);
      } else if (item.pedidosAdicionais?.size?.nome) {
        sizeStr = escapeHtml(item.pedidosAdicionais.size.nome);
      } else if (item.opcao_escolhida || item.variation) {
        sizeStr = escapeHtml(item.opcao_escolhida || item.variation);
      }

      const optionsList: Array<{ name: string; priceFormatted?: string }> = [];
      const rawOptions = item.options || item.adicionais || item.extras || item.adicionaisSelecionados || [];
      if (Array.isArray(rawOptions)) {
        rawOptions.forEach((opt: any) => {
          const name = opt.optionName || opt.itemNome || opt.nome || opt.name;
          const pCents = opt.priceCents ?? (opt.precoCents ?? (opt.preco ? Math.round(opt.preco * 100) : 0));
          if (name) {
            optionsList.push({
              name: escapeHtml(name),
              priceFormatted: pCents > 0 ? formatBrlCents(pCents) : undefined
            });
          }
        });
      }

      const obs = escapeHtml(item.observation || item.observacao || item.observacoes || item.notes || '');

      roundsHtml += `
        <div class="item-block" style="${isCancelled ? 'opacity: 0.65;' : ''}">
          <div class="item-title flex">
            <span class="font-bold ${isCancelled ? 'line-through' : ''}">${qty}x ${productName} ${isCancelled ? '<b>[CANCELADO]</b>' : ''}</span>
            <span class="item-price ${isCancelled ? 'line-through' : ''}">R$ ${totalFormatted}</span>
          </div>
          ${sizeStr ? `<div class="item-sub-info">• Tamanho: ${sizeStr}</div>` : ''}
          ${optionsList.map(o => `<div class="item-extra flex"><span>+ ${o.name}</span>${o.priceFormatted ? `<span>R$ ${o.priceFormatted}</span>` : ''}</div>`).join('')}
          ${obs ? `<div class="item-obs">Obs: ${obs}</div>` : ''}
          <div class="item-sub-info">• Valor unitário: R$ ${unitFormatted}</div>
        </div>
      `;
    });
  });

  return { roundsHtml, totalSubtotalCents };
}

// ============================================================================
// MODELO PRÉ-CONTA (Mesa / Comanda - Consolidação para Conferência)
// ============================================================================
export function generatePreContaReceiptHtml(data: any, restaurant?: any, profile?: any): string {
  if (!data) return '';

  const formatBrlCents = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');

  const tab = data.tab || data;
  const table = data.table || tab.table;
  const rest = restaurant || data.restaurant;
  const paperSize = rest?.defaultPaperSize || rest?.paperSize || '80mm';

  const restName = escapeHtml(rest?.nome_fantasia || rest?.nome || profile?.nome || '');

  // Mesa format: Mesa: 04
  let rawMesa = table?.number !== undefined && table?.number !== null
    ? String(table.number)
    : (tab?.tableNumber !== undefined && tab?.tableNumber !== null
        ? String(tab.tableNumber)
        : (table?.name || tab?.tableName || ''));

  if (!rawMesa) {
    rawMesa = '01';
  } else if (/^\d+$/.test(rawMesa)) {
    rawMesa = rawMesa.padStart(2, '0');
  } else {
    rawMesa = rawMesa.replace(/^mesa\s*/i, '');
    if (/^\d+$/.test(rawMesa)) {
      rawMesa = rawMesa.padStart(2, '0');
    }
  }
  const tableName = escapeHtml(rawMesa);

  // Comanda format: Comanda: 23
  let rawTab = tab?.number !== undefined && tab?.number !== null
    ? String(tab.number)
    : (tab?.id || tab?.comandaId || tab?.comandaNumero || data?.tabId || '');

  if (!rawTab) {
    rawTab = '--';
  } else if (typeof rawTab === 'string') {
    rawTab = rawTab.replace(/^#/, '');
    if (rawTab.length > 8) {
      rawTab = rawTab.slice(-4).toUpperCase();
    }
  }
  const tabDisplay = escapeHtml(String(rawTab));

  // Garçom: Must come from waiterName on comanda
  const waiterName = escapeHtml(
    tab?.waiterName ||
    tab?.garcomNome ||
    tab?.waiter_name ||
    data?.waiterName ||
    (Array.isArray(data?.orders) && data.orders[0]?.waiterName) ||
    'Não informado'
  );

  const peopleCount = Number(tab?.peopleCount || tab?.quantidade_pessoas || table?.peopleCount || table?.capacity || 1);

  const openedAtRaw = tab?.openedAt || tab?.createdAt || tab?.data_abertura;
  const openedAtDate = openedAtRaw ? new Date(openedAtRaw) : new Date();
  const openedAtStr = openedAtDate.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(',', '');

  const printDateStr = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(',', '');

  // Body: Grouped by rounds
  const { roundsHtml, totalSubtotalCents } = formatPreContaItemsByRound(data);

  // Summary
  const subtotalCents = totalSubtotalCents;
  const discountCents = tab?.discountInCents ?? Math.round(Number(tab?.discount || tab?.valor_desconto || tab?.desconto || 0) * 100);
  const serviceFeeCents = tab?.serviceFeeInCents ?? Math.round(Number(tab?.taxaServico || tab?.taxa_servico || 0) * 100);
  const totalCents = Math.max(0, subtotalCents - discountCents + serviceFeeCents);
  const paidCents = tab?.paidInCents ?? Math.round(Number(tab?.paidAmount || tab?.valor_pago || tab?.paid || 0) * 100);
  const balanceDueCents = Math.max(0, totalCents - paidCents);

  const bodyContent = `
    ${restName ? `<div class="text-center font-bold mb-1" style="font-size: 11pt;">${restName}</div>` : ''}

    <!-- Top Title Header -->
    <div class="text-center font-bold" style="font-size: 14pt; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; letter-spacing: 0.5px; text-transform: uppercase;">
      PRÉ-CONTA
    </div>

    <!-- Header Info Block -->
    <div class="info-row" style="font-size: 10.5pt;"><b>Mesa:</b> ${tableName}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Comanda:</b> ${tabDisplay}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Garçom:</b> ${waiterName}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Pessoas:</b> ${peopleCount}</div>
    <div class="info-row mt-1" style="font-size: 10.5pt;"><b>Abertura:</b> ${openedAtStr}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Impressão:</b> ${printDateStr}</div>

    <!-- Items Grouped by Round -->
    ${roundsHtml}

    <!-- Summary / Resumo -->
    <div class="divider-solid"></div>
    <div class="font-bold mb-1 text-center" style="font-size: 11pt; text-transform: uppercase;">RESUMO</div>
    <div class="flex"><span>Subtotal:</span><span>R$ ${formatBrlCents(subtotalCents)}</span></div>
    ${discountCents > 0 ? `<div class="flex"><span>Desconto:</span><span>- R$ ${formatBrlCents(discountCents)}</span></div>` : ''}
    ${serviceFeeCents > 0 ? `<div class="flex"><span>Taxa de Serviço:</span><span>R$ ${formatBrlCents(serviceFeeCents)}</span></div>` : ''}
    <div class="flex font-bold" style="font-size: 11pt; margin-top: 4px; border-top: 1px dashed #000; padding-top: 4px;">
      <span>Total da comanda:</span><span>R$ ${formatBrlCents(totalCents)}</span>
    </div>
    ${paidCents > 0 ? `<div class="flex" style="margin-top: 2px;"><span>Valor pago:</span><span>R$ ${formatBrlCents(paidCents)}</span></div>` : ''}
    <div class="flex font-bold" style="font-size: 12pt; margin-top: 4px; border-top: 1px solid #000; padding-top: 4px;">
      <span>SALDO A PAGAR:</span><span>R$ ${formatBrlCents(balanceDueCents)}</span>
    </div>

    <!-- Footer -->
    <div class="divider-solid"></div>
    <div class="text-center font-bold" style="font-size: 10pt; margin-top: 8px; text-transform: uppercase;">
      PRÉ-CONTA — NÃO É DOCUMENTO FISCAL
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Pré-Conta ${tabDisplay} - Mesa ${tableName}</title>
      <style>
        ${getThermalStyles(paperSize)}
      </style>
    </head>
    <body>
      <div class="receipt">
        ${bodyContent}
        <!-- Cutter Spacer (12mm) -->
        <div style="height: 12mm;"></div>
      </div>

      <script>
        window.onload = () => {
          window.focus();
          window.print();
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {}
          }, 800);
        };
      </script>
    </body>
    </html>
  `;
}

// ============================================================================
// THERMAL PRINT EXECUTION: Uses existing popup or hidden iframe mechanism
// ============================================================================
export function executeThermalPrint(htmlContent: string) {
  if (!htmlContent) return;

  // Attempt to open in a popup window
  let printWindow: Window | null = null;
  try {
    printWindow = window.open('', '_blank', 'width=420,height=700');
  } catch (e) {
    console.warn('Popup blocked, attempting iframe fallback approach.', e);
  }

  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  } else {
    // Fallback: create and append hidden iframe to guarantee print triggers without popup blockade
    const iframeId = 'qfomeai-thermal-print-iframe';
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    
    if (iframe) {
      document.body.removeChild(iframe);
    }
    
    iframe = document.createElement('iframe') as HTMLIFrameElement;
    iframe.id = iframeId;
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      
      iframe.onload = () => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            // Cleanup iframe after some delay
            setTimeout(() => {
              if (document.getElementById(iframeId)) {
                document.body.removeChild(iframe);
              }
            }, 5000);
          } catch (err) {
            console.error('Error printing through hidden iframe:', err);
            if (document.getElementById(iframeId)) {
              document.body.removeChild(iframe);
            }
          }
        }, 500);
      };
    } else {
      console.error('Could not construct printable document context inside hidden iframe');
    }
  }
}

// Global print handler for Pre-Conta da Mesa / Comanda (destination 'pre_bill')
export async function printThermalPreConta(
  data: any, 
  restaurant?: any, 
  profile?: any,
  options?: { isReprint?: boolean; forcePrint?: boolean }
) {
  if (!data) return { success: false, method: 'browser', error: 'Dados inválidos' };
  
  const restId = restaurant?.id || restaurant?.restaurantId || profile?.restaurantId || data?.tab?.restaurantId || data?.restaurantId;
  const docId = data?.tab?.id || data?.table?.id || String(data?.tab?.number || data?.tableNumber || data?.comandaId || 'pre_bill');

  return await printViaCentralService({
    destination: 'pre_bill',
    restaurantProfile: restaurant,
    profile,
    restaurantId: restId,
    documentId: docId,
    documentType: 'pre_bill',
    isReprint: options?.isReprint,
    forcePrint: options?.forcePrint,
    documentTitle: 'Pré-conta',
    htmlGenerator: (paperSize: PaperSize) => 
      generatePreContaReceiptHtml(data, { ...(restaurant || {}), defaultPaperSize: paperSize, paperSize }, profile),
    fallbackExecutor: () => {
      const fallbackHtml = generatePreContaReceiptHtml(data, restaurant, profile);
      executeThermalPrint(fallbackHtml);
    }
  });
}

// Global print handler for Kitchen / KDS Production Ticket (destination 'kitchen')
export async function printThermalKitchenTicket(
  order: any, 
  restaurant?: any, 
  profile?: any,
  options?: { isReprint?: boolean; forcePrint?: boolean; isAutoPrint?: boolean }
): Promise<{ success: boolean; method: 'agent' | 'browser'; printerCount?: number; error?: string }> {
  if (!order) return { success: false, method: 'browser', error: 'Pedido inválido' };

  const restId = restaurant?.id || restaurant?.restaurantId || profile?.restaurantId || order?.restaurantId;
  const docId = order?.id || String(order?.numero_pedido || order?.orderNumber || 'kitchen_doc');

  try {
    // 1. Obter impressoras e estações de impressão configuradas
    const allPrinters = await getRestaurantConfiguredPrinters(restaurant, profile, restId);
    const stations = await getRestaurantPrintStations(restaurant, profile, restId);

    // 2. Se houver estações de impressão configuradas, realizar roteamento por categoria
    if (stations.length > 0) {
      const { stationJobs, unassignedItems } = routeOrderItemsByStations(order, stations, allPrinters);

      if (stationJobs.length > 0) {
        // Em ação manual: imprimir tickets das estações no visualizador do navegador
        if (!options?.isAutoPrint) {
          for (const job of stationJobs) {
            const subOrder = {
              ...order,
              items: job.items,
              itens: job.items,
              stationName: job.station.name
            };
            const rawPaperSize = job.printer?.paperSize || '80mm';
            const paperSize: PaperSize = rawPaperSize === '58mm' ? '58mm' : rawPaperSize === '100mm' ? '100mm' : '80mm';
            const stationHtml = generateKitchenTicketHtml(
              subOrder, 
              { ...(restaurant || {}), defaultPaperSize: paperSize, paperSize }, 
              profile
            );
            executeThermalPrint(stationHtml);
            recordPrintHistoryItem({
              timestamp: Date.now(),
              printerName: job.printer.nickname || job.printer.rawName || 'Navegador',
              documentType: `Ticket Produção — ${job.station.name}`,
              destination: 'kitchen',
              status: 'success',
              method: 'browser',
              paperSize,
              lastHtml: stationHtml
            });
          }

          if (unassignedItems.length > 0) {
            const unassignedOrder = {
              ...order,
              items: unassignedItems,
              itens: unassignedItems,
              stationName: 'Cozinha (Geral)'
            };
            const fallbackHtml = generateKitchenTicketHtml(unassignedOrder, restaurant, profile);
            executeThermalPrint(fallbackHtml);
          }
        }

        return {
          success: true,
          method: 'browser',
          printerCount: stationJobs.length
        };
      }
    }

    // 3. Sem estações configuradas: fluxo padrão da cozinha via central de impressão
    const result = await printViaCentralService({
      destination: 'kitchen',
      restaurantProfile: restaurant,
      profile,
      restaurantId: restId,
      documentId: docId,
      documentType: 'kitchen',
      isReprint: options?.isReprint,
      forcePrint: options?.forcePrint,
      isAutoPrint: options?.isAutoPrint,
      documentTitle: `Ticket Cozinha #${order?.numero_pedido || order?.orderNumber || order?.id || ''}`,
      htmlGenerator: (paperSize: PaperSize) => 
        generateKitchenTicketHtml(order, { ...(restaurant || {}), defaultPaperSize: paperSize, paperSize }, profile),
      fallbackExecutor: () => {
        const fallbackHtml = generateKitchenTicketHtml(order, restaurant, profile);
        executeThermalPrint(fallbackHtml);
      }
    });

    return {
      success: result.success,
      method: result.method,
      printerCount: result.printerCount,
      error: result.error
    };
  } catch (err: any) {
    console.error('[OrderThermalPrint] Erro no processamento da impressão da cozinha:', err);
    if (!options?.isAutoPrint) {
      const fallbackHtml = generateKitchenTicketHtml(order, restaurant, profile);
      executeThermalPrint(fallbackHtml);
    }
    return { success: false, method: 'browser', error: err?.message };
  }
}

// Global print handler used for order receipts (destination 'delivery' | 'counter' | 'dine_in')
export async function printThermalOrder(
  order: any, 
  restaurant?: any, 
  profile?: any,
  options?: { isReprint?: boolean; forcePrint?: boolean; isAutoPrint?: boolean }
) {
  if (!order) return { success: false, method: 'browser', error: 'Pedido inválido' };

  const destination = resolveOrderDestination(order);
  const restId = restaurant?.id || restaurant?.restaurantId || profile?.restaurantId || order?.restaurantId;
  const docId = order?.id || String(order?.numero_pedido || order?.orderNumber || 'order_receipt');

  return await printViaCentralService({
    destination,
    restaurantProfile: restaurant,
    profile,
    restaurantId: restId,
    documentId: docId,
    documentType: `order_${destination}`,
    isReprint: options?.isReprint,
    forcePrint: options?.forcePrint,
    isAutoPrint: options?.isAutoPrint,
    documentTitle: `Pedido #${order?.numero_pedido || order?.orderNumber || order?.id || ''}`,
    htmlGenerator: (paperSize: PaperSize) => 
      generateThermalReceiptHtml(order, { ...(restaurant || {}), defaultPaperSize: paperSize, paperSize }, profile),
    fallbackExecutor: () => {
      const fallbackHtml = generateThermalReceiptHtml(order, restaurant, profile);
      executeThermalPrint(fallbackHtml);
    }
  });
}

// React component wrapping the HTML representation just in case
export function OrderThermalPrint({ order, restaurant }: OrderThermalPrintProps) {
  const html = generateThermalReceiptHtml(order, restaurant);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
