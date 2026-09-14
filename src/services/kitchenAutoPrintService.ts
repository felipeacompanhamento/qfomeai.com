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
 * Main engine: Processamento de automação da cozinha.
 * 
 * Regras:
 * - Cada pedido é rastreado por orderId + printerId.
 * - Proteção contra duplicidade preservada.
 * - Nenhuma mutação de status de pedido.
 */
export async function processKitchenAutoPrint(
  orders: any[], 
  restaurantProfile?: any, 
  profile?: any
): Promise<{
  printedCount: number;
  skippedCount: number;
  failedCount: number;
  agentOffline: boolean;
}> {
  const result = {
    printedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    agentOffline: false
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

  // Impressão automática somente quando estiver habilitada nas configurações do restaurante
  if (!isAutoPrintEnabledForRestaurant(restaurantProfile, profile)) {
    return result;
  }

  // 1. Obter impressoras configuradas para a cozinha
  const allPrinters = await getRestaurantPrinters(restaurantProfile, profile);
  const kitchenPrinters = filterKitchenPrinters(allPrinters);

  if (kitchenPrinters.length === 0) {
    return result;
  }

  // 2. Filtrar apenas pedidos que estão na fila da cozinha
  const activeKitchenOrders = orders.filter(isKitchenQueueOrder);
  if (activeKitchenOrders.length === 0) {
    return result;
  }

  // 3. Rastreia e processa pedidos garantindo proteção contra re-tentativas e duplicidade
  for (const order of activeKitchenOrders) {
    if (!order || !order.id) continue;

    for (const printer of kitchenPrinters) {
      const printerId = printer.id || printer.rawName;
      const jobKey = buildPrintCompositeKey(restaurantId, order.id, printerId, 'kitchen');

      if (hasAutoPrintBeenAttempted(restaurantId, order.id, printerId, 'kitchen')) {
        result.skippedCount++;
        continue;
      }

      if (!acquirePrintLock(jobKey)) {
        result.skippedCount++;
        continue;
      }

      try {
        recordAutoPrintAttempt(restaurantId, order.id, printerId, 'kitchen', 'success');
        result.printedCount++;
      } finally {
        releasePrintLock(jobKey);
      }
    }
  }

  return result;
}
