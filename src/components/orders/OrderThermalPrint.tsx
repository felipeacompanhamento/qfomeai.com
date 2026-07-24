import React from 'react';
import { getCanonicalOrderState } from '../../domain/order/orderLifecycle';
import { getOrderSourceDetails } from '../../pages/restaurant/orders/utils/orderSource';

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
function formatPaymentMethod(method: string): string {
  if (!method) return 'A combinar';
  const m = method.toLowerCase();
  if (m === 'dinheiro') return 'Dinheiro';
  if (m === 'pix' || m === 'chave_pix' || m === 'pix_copia_cola' || m === 'pix_app') return 'Pix';
  if (m === 'cartao_credito' || m === 'cartao_credito_online') return 'Cartão de Crédito';
  if (m === 'cartao_debito') return 'Cartão de Débito';
  if (m === 'maquininha') return 'Cartão na Maquininha';
  return method.toUpperCase();
}

export type OrderThermalPrintProps = {
  order: any;
  restaurant?: any;
};

// Generates the clean thermal printer HTML
export function generateThermalReceiptHtml(order: any, restaurant?: any, profile?: any): string {
  if (!order) return '';

  const { deliveryStatus, financialSettlementStatus } = getCanonicalOrderState(order);
  const sourceDetails = getOrderSourceDetails(order);

  // Restaurant details
  const restName = escapeHtml(restaurant?.nome_fantasia || restaurant?.nome || profile?.nome || 'Restaurante');
  const restCnpj = restaurant?.cnpj || restaurant?.CNPJ ? `CNPJ: ${escapeHtml(restaurant?.cnpj || restaurant?.CNPJ)}` : '';
  const restPhone = restaurant?.telefone || restaurant?.phone || profile?.telefone ? `Tel: ${escapeHtml(restaurant?.telefone || restaurant?.phone || profile?.telefone)}` : '';
  
  let restAddressStr = '';
  if (restaurant?.endereco || restaurant?.address) {
    restAddressStr = escapeHtml(restaurant.endereco || restaurant.address);
  }
  const restCity = restaurant?.cidade || restaurant?.city ? escapeHtml(restaurant?.cidade || restaurant?.city) : '';
  const restUnit = restaurant?.unidade || restaurant?.id_unidade ? `Unidade: ${escapeHtml(restaurant?.unidade || restaurant?.id_unidade)}` : '';

  // Order code and dates
  const orderCode = escapeHtml((order.id || '').slice(-6).toUpperCase());
  const orderDate = order.data_criacao || order.createdAt ? new Date(order.data_criacao || order.createdAt).toLocaleString('pt-BR') : '';

  // Order origin
  const orderSourceLabel = sourceDetails.label || 'Delivery';

  // Customer info
  const clientName = escapeHtml(order.nome_cliente || order.customerName || order.cliente?.nome || 'Cliente');
  const clientPhone = escapeHtml(order.telefone_cliente || order.customerPhone || order.cliente?.telefone || '');
  const clientCpf = escapeHtml(order.cliente?.cpf || order.cpf || order.cliente_cpf || '');

  // Address fields
  const rua = escapeHtml(order.endereco?.rua || order.rua || order.endereco_entrega?.rua || '');
  const numero = escapeHtml(order.endereco?.numero || order.numero || order.endereco_entrega?.numero || '');
  const complemento = escapeHtml(order.endereco?.complemento || order.complemento || order.endereco_entrega?.complemento || '');
  const bairro = escapeHtml(order.endereco?.bairro || order.bairro || order.endereco_entrega?.bairro || '');
  const cidade = escapeHtml(order.endereco?.cidade || order.cidade || order.endereco_entrega?.cidade || '');
  const referencia = escapeHtml(order.endereco?.referencia || order.referencia || order.endereco_entrega?.referencia || '');
  const obsEntrega = escapeHtml(order.endereco?.observacao || order.observacao_entrega || '');

  // Service type info display
  let serviceHeader = '';
  let serviceDetailsHtml = '';

  if (sourceDetails.source === 'DELIVERY') {
    serviceHeader = 'ENTREGA';
    serviceDetailsHtml = `
      <div class="info-row"><b>Cliente:</b> ${clientName}</div>
      ${clientPhone ? `<div class="info-row"><b>Tel:</b> ${clientPhone}</div>` : ''}
      <div class="info-row"><b>Endereço:</b> ${rua}, ${numero}</div>
      ${complemento ? `<div class="info-row"><b>Compl:</b> ${complemento}</div>` : ''}
      ${bairro ? `<div class="info-row"><b>Bairro:</b> ${bairro}</div>` : ''}
      ${cidade ? `<div class="info-row"><b>Cidade:</b> ${cidade}</div>` : ''}
      ${referencia ? `<div class="info-row"><b>Ref:</b> ${referencia}</div>` : ''}
      ${obsEntrega ? `<div class="info-row mt-1" style="font-style: italic;"><b>Obs. Entrega:</b> ${obsEntrega}</div>` : ''}
    `;
  } else if (sourceDetails.source === 'TAKEAWAY') {
    serviceHeader = 'RETIRADA';
    serviceDetailsHtml = `
      <div class="info-row text-center"><b>RETIRADA NO RESTAURANTE</b></div>
      <div class="info-row"><b>Cliente:</b> ${clientName}</div>
      ${clientPhone ? `<div class="info-row"><b>Tel:</b> ${clientPhone}</div>` : ''}
    `;
  } else if (sourceDetails.source === 'TABLE') {
    const tableNum = escapeHtml(order.mesa || order.tableNumber || order.num_mesa || '');
    const waiterName = escapeHtml(order.garcom || order.waiterName || order.nome_garcom || '');
    serviceHeader = tableNum ? `MESA ${tableNum}` : 'MESA';
    serviceDetailsHtml = `
      <div class="info-row"><b>Atendimento:</b> Mesa</div>
      ${tableNum ? `<div class="info-row"><b>Mesa:</b> ${tableNum}</div>` : ''}
      ${waiterName ? `<div class="info-row"><b>Garçom:</b> ${waiterName}</div>` : ''}
      <div class="info-row"><b>Cliente:</b> ${clientName}</div>
    `;
  } else {
    // Balcão or other manual
    serviceHeader = sourceDetails.label.toUpperCase();
    serviceDetailsHtml = `
      <div class="info-row"><b>Tipo:</b> ${orderSourceLabel}</div>
      <div class="info-row"><b>Cliente:</b> ${clientName}</div>
      ${clientPhone ? `<div class="info-row"><b>Tel:</b> ${clientPhone}</div>` : ''}
    `;
  }

  // Items formatting
  const items = Array.isArray(order.itens) ? order.itens : Array.isArray(order.items) ? order.items : [];
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

    // Extras/Adicionais
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

  // Financial values
  const subtotal = Number(order.valor_produtos || order.subtotal || 0);
  const desconto = Number(order.valor_desconto || order.desconto || 0);
  const acrescimo = Number(order.valor_acrescimo || order.acrescimo || 0);
  const taxaEntrega = Number(order.taxa_entrega || order.deliveryFee || 0);
  const taxaServico = Number(order.taxa_servico || order.serviceFee || 0);
  const orderTotal = Number(order.total || order.valor_total || 0);

  // Financial rows HTML
  let financialHtml = '';
  financialHtml += `
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

  // Payment box logic (Scenario A, B, C, D)
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

  let paymentBoxHtml = '';
  const methodLabel = formatPaymentMethod(order.forma_pagamento || order.paymentMethod);

  if (amountDue <= 0) {
    // Scenario B: Already fully paid
    paymentBoxHtml = `
      <div class="payment-box">
        <div class="payment-title">PEDIDO JÁ PAGO</div>
        <div class="info-row"><b>Forma de pagamento:</b> ${methodLabel}</div>
        <div class="info-row"><b>Valor pago:</b> R$ ${orderTotal.toFixed(2)}</div>
        <div class="payment-notice">NÃO COBRAR DO CLIENTE</div>
      </div>
    `;
  } else {
    // Scenario A or C: Balance due on delivery
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

    paymentBoxHtml = `
      <div class="payment-box">
        <div class="payment-title">COBRAR NA ENTREGA</div>
        ${partialPaymentMsg}
        <div class="info-row font-bold" style="font-size: 11pt;"><b>Valor a cobrar:</b> R$ ${amountDue.toFixed(2)}</div>
        <div class="info-row"><b>Forma prevista:</b> ${methodLabel}</div>
        ${changeHtml}
      </div>
    `;
  }

  // Delivery driver assignment info
  const driverName = escapeHtml(order.assignedDriverName || order.driverName || order.entregador_nome || '');
  const driverInfoHtml = driverName ? `
    <div class="info-row"><b>Entregador:</b> ${driverName}</div>
  ` : '';

  // Order general observations
  const obsGeral = escapeHtml(order.observacao || order.observacoes || order.notes || '');
  const obsGeralHtml = obsGeral ? `
    <div class="divider"></div>
    <div class="kitchen-obs-box">
      <div class="font-bold text-center">OBSERVAÇÕES DO PEDIDO</div>
      <div class="mt-1" style="font-size: 11pt; font-weight: bold; text-align: center;">${obsGeral}</div>
    </div>
  ` : '';

  // Current print date and bottom margin spacer
  const printDateStr = new Date().toLocaleString('pt-BR');

  // Let's bundle everything into the raw compliant HTML string!
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Pedido #${orderCode}</title>
      <style>
        @page {
          margin: 0;
        }
        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 9.5pt;
          line-height: 1.35;
        }
        .receipt {
          width: 100%;
          max-width: 80mm;
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
        .flex { 
          display: flex; 
          justify-content: space-between; 
        }
        .info-row {
          margin-bottom: 2px;
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
          color: #333;
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
          margin-top: 15px;
          color: #555;
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
      </style>
    </head>
    <body>
      <div class="receipt">
        <!-- Restaurant Header -->
        <div class="text-center font-bold" style="font-size: 13pt; line-height: 1.2;">
          ${restName}
        </div>
        ${restUnit ? `<div class="text-center font-bold mt-1">${restUnit}</div>` : ''}
        ${restCnpj ? `<div class="text-center" style="font-size: 8.5pt;">${restCnpj}</div>` : ''}
        ${restPhone ? `<div class="text-center" style="font-size: 8.5pt;">${restPhone}</div>` : ''}
        ${restAddressStr ? `<div class="text-center" style="font-size: 8.5pt;">${restAddressStr}${restCity ? `, ${restCity}` : ''}</div>` : ''}
        
        <div class="divider"></div>
        
        <!-- Order Identification -->
        <div class="text-center font-bold" style="font-size: 12pt;">
          PEDIDO #${orderCode}
        </div>
        <div class="text-center" style="font-size: 9pt;">
          Data: ${orderDate}
        </div>
        <div class="text-center font-bold mt-1" style="font-size: 11pt; border: 1px solid #000; padding: 2px 0;">
          TIPO: ${serviceHeader}
        </div>
        
        <div class="divider"></div>
        
        <!-- Service Details / Client Address / Info -->
        ${serviceDetailsHtml}
        ${clientCpf ? `<div class="info-row"><b>CPF:</b> ${clientCpf}</div>` : ''}
        ${driverInfoHtml}
        
        <div class="divider"></div>
        
        <!-- Items List -->
        <div class="font-bold mb-2">ITENS DO PEDIDO</div>
        ${itemsHtml}
        
        <div class="divider"></div>
        
        <!-- Financial Summary -->
        ${financialHtml}
        <div class="flex font-bold mt-2" style="font-size: 11.5pt; border-top: 1px solid #000; padding-top: 4px;">
          <span>TOTAL:</span>
          <span>R$ ${orderTotal.toFixed(2)}</span>
        </div>
        
        <!-- Observations Section -->
        ${obsGeralHtml}
        
        <!-- Payment Details -->
        ${paymentBoxHtml}
        
        <!-- Footer / Printer info -->
        <div class="footer">
          Gerado por Qfomeai<br>
          Impresso em ${printDateStr}
        </div>
        
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
