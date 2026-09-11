import * as qzTrayModule from 'qz-tray';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { generateKitchenTicketHtml } from '../components/orders/OrderThermalPrint';
import { 
  isDocumentAlreadyPrinted, 
  recordSuccessfulPrint, 
  recordFailedPrint, 
  acquirePrintLock, 
  releasePrintLock, 
  buildPrintCompositeKey,
  isAutoPrintEnabledForRestaurant,
  recordPrintHistoryItem,
  hasAutoPrintBeenAttempted,
  recordAutoPrintAttempt,
  isPrinterAvailable,
  showPrintContingencyNotice
} from './printCentralService';

// Interop seguro para ambientes ESM/Vite
const qz = (qzTrayModule as any).default || qzTrayModule;

export interface KitchenPrintRecord {
  orderId: string;
  printerId: string;
  rawName: string;
  printedAt: number;
}

/**
 * Storage key helper for persistent idempotency per restaurant (legacy fallback support)
 */
function getStorageKey(restaurantId: string): string {
  return `kitchen_autoprint_records_${restaurantId || 'default'}`;
}

/**
 * Checks if a specific order has already been successfully printed on a specific printer
 */
export function isOrderPrintedOnPrinter(restaurantId: string, orderId: string, printerId: string): boolean {
  if (!restaurantId || !orderId || !printerId) return false;
  // Consulta a camada central de segurança contra duplicidade
  if (isDocumentAlreadyPrinted(restaurantId, orderId, printerId, 'kitchen')) {
    return true;
  }
  // Suporte de compatibilidade com chave legada
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(getStorageKey(restaurantId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed[`${orderId}:::${printerId}`]) return true;
      }
    } catch {
      // Ignora erro de parse
    }
  }
  return false;
}

/**
 * Marks a specific (orderId, printerId) as successfully printed in localStorage
 */
export function markOrderPrintedOnPrinter(
  restaurantId: string, 
  orderId: string, 
  printerId: string, 
  rawName: string
): void {
  if (!restaurantId || !orderId || !printerId) return;
  // Grava na camada central de segurança
  recordSuccessfulPrint(restaurantId, orderId, printerId, rawName, 'kitchen', 'kitchen');

  // Grava também no formato legado para total retrocompatibilidade
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const key = getStorageKey(restaurantId);
      const raw = window.localStorage.getItem(key);
      const records = raw ? JSON.parse(raw) || {} : {};
      records[`${orderId}:::${printerId}`] = {
        orderId,
        printerId,
        rawName,
        printedAt: Date.now()
      };
      window.localStorage.setItem(key, JSON.stringify(records));
    } catch {
      // Ignora erro
    }
  }
}

/**
 * Filters the restaurant's configured printers having the 'kitchen' destination ("Produção da Cozinha")
 */
export function filterKitchenPrinters(configuredPrinters: any[]): any[] {
  if (!Array.isArray(configuredPrinters)) return [];
  return configuredPrinters.filter((p: any) => {
    if (!p || !p.rawName) return false;
    const dests = Array.isArray(p.destinations) ? p.destinations : [];
    return dests.some((d: string) => d === 'kitchen' || String(d).toLowerCase().includes('cozinha'));
  });
}

/**
 * Determines if an order belongs to the active kitchen queue (status: aceito, preparo, cozinha, etc.)
 */
export function isKitchenQueueOrder(order: any): boolean {
  if (!order) return false;
  const st = String(order.status || order.orderStatus || order.canonicalStatus || '').toLowerCase();
  return ['aceito', 'preparo', 'cozinha', 'preparing', 'em_preparo'].includes(st);
}

/**
 * Fetches the configured printers for a restaurant
 */
export async function getRestaurantPrinters(restaurantProfile?: any, profile?: any): Promise<any[]> {
  if (Array.isArray(restaurantProfile?.configuredPrinters) && restaurantProfile.configuredPrinters.length > 0) {
    return restaurantProfile.configuredPrinters;
  }
  if (Array.isArray(profile?.configuredPrinters) && profile.configuredPrinters.length > 0) {
    return profile.configuredPrinters;
  }

  const restId = restaurantProfile?.id || restaurantProfile?.restaurantId || profile?.restaurantId || profile?.id;
  if (restId) {
    try {
      const docRef = doc(db, 'restaurants', restId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.configuredPrinters)) {
          return data.configuredPrinters;
        }
      }
    } catch (dbErr) {
      console.warn('[KitchenAutoPrint] Erro ao buscar impressoras no Firestore:', dbErr);
    }
  }

  return [];
}

/**
 * Executes a single QZ print job for an order on a given printer
 */
async function printOrderToPrinter(
  order: any, 
  printer: any, 
  restaurantProfile?: any, 
  profile?: any
): Promise<boolean> {
  const rawPaperSize = printer.paperSize || '80mm';
  const paperSize = rawPaperSize === '58mm' ? '58mm' : rawPaperSize === '100mm' ? '100mm' : '80mm';
  const paperWidthMm = paperSize === '58mm' ? 58 : paperSize === '100mm' ? 100 : 80;

  const config = qz.configs.create(printer.rawName, {
    size: { width: paperWidthMm },
    units: 'mm',
    margins: 0,
    scaleContent: true,
    rasterize: false,
    copies: 1
  });

  // Gera o layout térmico oficial da cozinha respeitando a largura do papel
  const htmlContent = generateKitchenTicketHtml(
    order,
    { ...(restaurantProfile || {}), defaultPaperSize: paperSize, paperSize },
    profile
  );

  // Remove tags <script> para evitar disparo de window.print() no interpretador interno do QZ Tray
  const cleanHtml = htmlContent.replace(/<script[\s\S]*?<\/script>/gi, '');

  const printData = [
    {
      type: 'pixel',
      format: 'html',
      flavor: 'plain',
      data: cleanHtml
    }
  ];

  await qz.print(config, printData);
  return true;
}

/**
 * Main engine: Scans active kitchen orders and automatically prints any new/unprinted orders
 * strictly to the printers configured for "Produção da Cozinha" via QZ Tray.
 * 
 * Rules:
 * - Each order is printed ONLY ONCE per printer (tracked by orderId + printerId).
 * - If QZ Tray is offline, the orders are NOT lost and NOT marked as printed.
 * - If multiple kitchen printers exist, 1 copy is printed on each.
 * - No timers used for deduplication.
 * - No mutation of order or order status.
 */
export async function processKitchenAutoPrint(
  orders: any[], 
  restaurantProfile?: any, 
  profile?: any
): Promise<{
  printedCount: number;
  skippedCount: number;
  failedCount: number;
  qzOffline: boolean;
}> {
  const result = {
    printedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    qzOffline: false
  };

  if (!Array.isArray(orders) || orders.length === 0) {
    return result;
  }

  const restaurantId = 
    restaurantProfile?.id || 
    restaurantProfile?.restaurantId || 
    profile?.restaurantId || 
    profile?.id || 
    orders[0]?.restaurantId;

  if (!restaurantId) {
    return result;
  }

  // REGRA 5: Impressão automática somente quando estiver habilitada nas configurações do restaurante
  if (!isAutoPrintEnabledForRestaurant(restaurantProfile, profile)) {
    return result;
  }

  // 1. Obter impressoras configuradas para a cozinha
  const allPrinters = await getRestaurantPrinters(restaurantProfile, profile);
  const kitchenPrinters = filterKitchenPrinters(allPrinters);

  if (kitchenPrinters.length === 0) {
    // Nenhuma impressora com a responsabilidade "Produção da Cozinha" configurada
    return result;
  }

  // 2. Filtrar apenas pedidos que estão na fila da cozinha
  const activeKitchenOrders = orders.filter(isKitchenQueueOrder);
  if (activeKitchenOrders.length === 0) {
    return result;
  }

  // 3. Identificar os trabalhos pendentes (order + printer)
  const pendingJobs: { order: any; printer: any; jobKey: string; printerId: string }[] = [];

  for (const order of activeKitchenOrders) {
    if (!order || !order.id) continue;

    for (const printer of kitchenPrinters) {
      const printerId = printer.id || printer.rawName;
      const jobKey = buildPrintCompositeKey(restaurantId, order.id, printerId, 'kitchen');

      // REGRA DE CONTINGÊNCIA: Se já foi impresso ou já foi tentado via auto-print (mesmo com falha), NUNCA reenviar automaticamente
      if (hasAutoPrintBeenAttempted(restaurantId, order.id, printerId, 'kitchen')) {
        result.skippedCount++;
        continue;
      }

      // REGRA: Verifica se já está em processamento assíncrono neste momento
      if (!acquirePrintLock(jobKey)) {
        result.skippedCount++;
        continue;
      }

      pendingJobs.push({ order, printer, jobKey, printerId });
    }
  }

  if (pendingJobs.length === 0) {
    return result;
  }

  // 4. Verificar se o QZ Tray está conectado/acessível
  const isQzActive = await (async () => {
    try {
      const isActive = typeof qz.websocket?.isActive === 'function' && qz.websocket.isActive();
      if (isActive) return true;
      await qz.websocket.connect({ retries: 0, delay: 0 });
      return typeof qz.websocket?.isActive === 'function' && qz.websocket.isActive();
    } catch {
      return false;
    }
  })();

  if (!isQzActive) {
    // QZ Tray offline: Registrar FALHA/PENDENTE para cada job e NUNCA reenviar automaticamente ao reconectar
    console.warn('[KitchenAutoPrint] QZ Tray offline ou inacessível. Registrando contingência (FALHA/PENDENTE).');

    for (const job of pendingJobs) {
      const { order, printer, jobKey, printerId } = job;

      recordFailedPrint(restaurantId, order.id, printerId, printer.rawName, 'kitchen', 'QZ Tray desconectado (FALHA/PENDENTE)');
      recordAutoPrintAttempt(restaurantId, order.id, printerId, 'kitchen', 'failed');

      const ticketHtml = generateKitchenTicketHtml(
        order,
        { ...(restaurantProfile || {}), defaultPaperSize: printer.paperSize || '80mm', paperSize: printer.paperSize || '80mm' },
        profile
      );

      recordPrintHistoryItem({
        timestamp: Date.now(),
        printerName: printer.nickname || printer.rawName,
        rawPrinterName: printer.rawName,
        documentType: 'Produção da Cozinha',
        documentId: order.id,
        destination: 'kitchen',
        status: 'error',
        errorMessage: 'QZ Tray desconectado — Impressão PENDENTE (Contingência)',
        method: 'qz',
        paperSize: printer.paperSize || '80mm',
        lastHtml: ticketHtml
      });

      showPrintContingencyNotice({
        message: `Impressão de Cozinha (Pedido #${order.numero_pedido || order.orderNumber || order.id}) retida: QZ Tray desconectado.`,
        documentId: order.id,
        documentTitle: `Pedido #${order.numero_pedido || order.orderNumber || order.id}`,
        htmlToPrint: ticketHtml
      });

      releasePrintLock(jobKey);
      result.failedCount++;
    }

    result.qzOffline = true;
    return result;
  }

  // 5. Executar as impressões pendentes
  for (const job of pendingJobs) {
    const { order, printer, jobKey, printerId } = job;

    try {
      // Checagem de disponibilidade da impressora no sistema
      const printerAvailable = await isPrinterAvailable(printer.rawName);
      if (!printerAvailable) {
        console.warn(`[KitchenAutoPrint] Impressora "${printer.rawName}" indisponível no sistema.`);
        recordFailedPrint(restaurantId, order.id, printerId, printer.rawName, 'kitchen', 'Impressora indisponível no sistema (FALHA/PENDENTE)');
        recordAutoPrintAttempt(restaurantId, order.id, printerId, 'kitchen', 'failed');

        const ticketHtml = generateKitchenTicketHtml(
          order,
          { ...(restaurantProfile || {}), defaultPaperSize: printer.paperSize || '80mm', paperSize: printer.paperSize || '80mm' },
          profile
        );

        recordPrintHistoryItem({
          timestamp: Date.now(),
          printerName: printer.nickname || printer.rawName,
          rawPrinterName: printer.rawName,
          documentType: 'Produção da Cozinha',
          documentId: order.id,
          destination: 'kitchen',
          status: 'error',
          errorMessage: `Impressora "${printer.rawName}" indisponível no sistema`,
          method: 'qz',
          paperSize: printer.paperSize || '80mm',
          lastHtml: ticketHtml
        });

        showPrintContingencyNotice({
          message: `Impressão de Cozinha retida: Impressora "${printer.rawName}" indisponível.`,
          documentId: order.id,
          documentTitle: `Pedido #${order.numero_pedido || order.orderNumber || order.id}`,
          htmlToPrint: ticketHtml
        });

        result.failedCount++;
        continue;
      }

      await printOrderToPrinter(order, printer, restaurantProfile, profile);

      // Sucesso comprovado: marcar como impresso
      markOrderPrintedOnPrinter(restaurantId, order.id, printerId, printer.rawName);
      recordAutoPrintAttempt(restaurantId, order.id, printerId, 'kitchen', 'success');
      result.printedCount++;
      console.log(`[KitchenAutoPrint] Pedido #${order.numero_pedido || order.orderNumber || order.id} impresso com sucesso em "${printer.rawName}" (${printer.paperSize || '80mm'})`);
    } catch (printErr: any) {
      // Falha: registrar erro e contingência
      console.error(`[KitchenAutoPrint] Falha ao imprimir pedido #${order.id} na impressora "${printer.rawName}":`, printErr);
      recordFailedPrint(restaurantId, order.id, printerId, printer.rawName, 'kitchen', printErr?.message);
      recordAutoPrintAttempt(restaurantId, order.id, printerId, 'kitchen', 'failed');

      const ticketHtml = generateKitchenTicketHtml(
        order,
        { ...(restaurantProfile || {}), defaultPaperSize: printer.paperSize || '80mm', paperSize: printer.paperSize || '80mm' },
        profile
      );

      recordPrintHistoryItem({
        timestamp: Date.now(),
        printerName: printer.nickname || printer.rawName,
        rawPrinterName: printer.rawName,
        documentType: 'Produção da Cozinha',
        documentId: order.id,
        destination: 'kitchen',
        status: 'error',
        errorMessage: printErr?.message || 'Falha no envio para impressora de cozinha',
        method: 'qz',
        paperSize: printer.paperSize || '80mm',
        lastHtml: ticketHtml
      });

      showPrintContingencyNotice({
        message: `Falha na impressão de Cozinha em "${printer.rawName}". Status: FALHA/PENDENTE.`,
        documentId: order.id,
        documentTitle: `Pedido #${order.numero_pedido || order.orderNumber || order.id}`,
        htmlToPrint: ticketHtml
      });

      result.failedCount++;
    } finally {
      releasePrintLock(jobKey);
    }
  }

  return result;
}
