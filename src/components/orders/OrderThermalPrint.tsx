import React from 'react';
import { normalizeOrderOrigem, OrderOrigem } from '../../domain/order/orderSource';
import { getPaymentMethodLabel } from '../../services/paymentMethodsService';

// Simple HTML escape helper to prevent injection
function escapeHtml(unsafe: any): string {
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
function getThermalStyles(paperSize: string = '80mm'): string {
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

  const waiterName = escapeHtml(order.waiterName || order.garcom_nome || order.garcom || order.nome_garcom || profile?.nome || 'Garçom');

  const roundNum = order.roundNumber || order.numero_rodada || order.round || order.rodada;
  const roundDisplay = roundNum ? `${escapeHtml(String(roundNum))}ª Rodada` : '1ª Rodada';

  const items = Array.isArray(order.itens) ? order.itens : Array.isArray(order.items) ? order.items : [];
  const itemsHtml = formatGarcomItemsHtml(items);

  const obsGeral = escapeHtml(order.observacao || order.observacoes || order.notes || '');

  return `
    ${restName ? `<div class="text-center font-bold mb-1" style="font-size: 11pt;">${restName}</div>` : ''}

    <!-- Top Highlight -->
    <div class="text-center font-bold" style="font-size: 14pt; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; letter-spacing: 0.5px;">
      GARÇOM / MESA
    </div>

    <!-- Header Details -->
    <div class="info-row" style="font-size: 12pt; font-weight: bold;"><b>Mesa:</b> ${tableName}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Comanda:</b> ${tabDisplay}</div>
    <div class="info-row" style="font-size: 10.5pt;"><b>Garçom:</b> ${waiterName}</div>
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

  const orderCode = escapeHtml((order.id || '').slice(-6).toUpperCase());
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
      BALCÃO
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

  const orderCode = escapeHtml((order.id || '').slice(-6).toUpperCase());
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
// MAIN GENERATOR: Automatic Model Dispatcher by source/origem
// ============================================================================
export function generateThermalReceiptHtml(order: any, restaurant?: any, profile?: any): string {
  if (!order) return '';

  // Automatically resolve the order origin model (GARCOM, DELIVERY, BALCAO, TOTEM)
  const modelType: OrderOrigem = normalizeOrderOrigem(order);
  const paperSize = restaurant?.defaultPaperSize || restaurant?.paperSize || '80mm';

  let bodyContent = '';
  switch (modelType) {
    case 'GARCOM':
      bodyContent = generateGarcomReceiptHtml(order, restaurant, profile);
      break;
    case 'BALCAO':
      bodyContent = generateBalcaoReceiptHtml(order, restaurant, profile);
      break;
    case 'TOTEM':
      bodyContent = generateTotemReceiptHtml(order, restaurant, profile);
      break;
    case 'DELIVERY':
    default:
      bodyContent = generateDeliveryReceiptHtml(order, restaurant, profile);
      break;
  }

  const orderCode = escapeHtml((order.id || '').slice(-6).toUpperCase());

  // Complete HTML document containing the adapted styles and cut spacer
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Comprovante #${orderCode} - ${modelType}</title>
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

// Global print handler used by all buttons in the system
export function printThermalOrder(order: any, restaurant?: any, profile?: any) {
  if (!order) return;

  const htmlContent = generateThermalReceiptHtml(order, restaurant, profile);

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

// React component wrapping the HTML representation just in case
export function OrderThermalPrint({ order, restaurant }: OrderThermalPrintProps) {
  const html = generateThermalReceiptHtml(order, restaurant);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
