import * as qzTrayModule from 'qz-tray';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeOrderOrigem } from '../domain/order/orderSource';
import { getThermalStyles, executeThermalPrint } from '../components/orders/OrderThermalPrint';

// Interop seguro para ambientes ESM/Vite
const qz = (qzTrayModule as any).default || qzTrayModule;

export type PrintDestinationType =
  | 'delivery'        // Pedidos Delivery
  | 'counter'         // Pedidos Balcão
  | 'dine_in'         // Pedidos Garçom/Mesa
  | 'kitchen'         // Produção da Cozinha
  | 'pre_bill'        // Pré-conta
  | 'cash_open'       // Abertura de Caixa
  | 'cash_close';     // Fechamento de Caixa

export type PaperSize = '58mm' | '80mm' | '100mm';

export interface ConfiguredPrinter {
  id: string;
  rawName: string;
  nickname: string;
  paperSize: PaperSize;
  destinations?: PrintDestinationType[];
  updatedAt?: string;
}

export interface PrintStation {
  id: string;
  name: string; // Ex: "Cozinha", "Bar", "Caixa", "Expedição"
  printerId: string; // ID ou rawName da ConfiguredPrinter
  printerNickname?: string; // Apelido da impressora vinculada
  printerRawName?: string; // Nome real da impressora no Windows
  categoryIds: string[]; // Lista de IDs ou nomes das categorias
  categoryNames?: string[]; // Nomes das categorias para exibição amigável
  updatedAt?: string;
}

export interface CentralPrintJob {
  destination: PrintDestinationType;
  htmlGenerator: (paperSize: PaperSize) => string;
  fallbackHtml?: string;
  fallbackExecutor?: () => void;
  restaurantProfile?: any;
  profile?: any;
  restaurantId?: string;
  documentId?: string;       // Identificador único do documento (ex: order.id, tab.id, caixa.id)
  documentType?: string;     // Tipo do documento (ex: 'kitchen', 'order_receipt', 'pre_bill', 'cash_open', 'cash_close')
  documentTitle?: string;
  isReprint?: boolean;       // true se for clique explícito em "Reimprimir"
  reprintReason?: string;    // Motivo curto da reimpressão
  reprintedBy?: string;      // Operador / usuário que solicitou a reimpressão
  isAutoPrint?: boolean;     // true se disparado em background pelo auto-print
  forcePrint?: boolean;      // true se for ação manual explícita que ignora duplicidade
}

export interface CentralPrintResult {
  success: boolean;
  method: 'qz' | 'browser';
  printerCount: number;
  printersUsed: string[];
  qzOffline?: boolean;
  error?: string;
}

export interface PrintHistoryItem {
  id: string;
  timestamp: number;
  printerName: string;
  rawPrinterName?: string;
  documentType: string;
  destination?: PrintDestinationType | 'test';
  status: 'success' | 'error';
  errorMessage?: string;
  method: 'qz' | 'browser';
  paperSize?: PaperSize;
  lastHtml?: string;
  documentId?: string;       // ID do documento (pedido, caixa, mesa/comanda)
  isReprint?: boolean;       // Indicador de se é reimpressão
  reprintReason?: string;    // Motivo curto da reimpressão
  reprintedBy?: string;      // Operador que executou a reimpressão
  reprintedAt?: number;      // Data/Hora da reimpressão
}

const PRINT_HISTORY_KEY = 'qfomeai_print_history_log';

/**
 * Retorna o histórico das impressões registradas (mais recentes primeiro)
 */
export function getPrintHistory(): PrintHistoryItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(PRINT_HISTORY_KEY);
    if (!raw) return [];
    const parsed: PrintHistoryItem[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.warn('[PrintCentralService] Erro ao carregar histórico de impressão:', err);
    return [];
  }
}

/**
 * Registra um evento de impressão no histórico local
 */
export function recordPrintHistoryItem(item: Omit<PrintHistoryItem, 'id'>): PrintHistoryItem {
  const newItem: PrintHistoryItem = {
    ...item,
    id: `print_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const history = getPrintHistory();
      const updated = [newItem, ...history.filter(h => h.id !== newItem.id)].slice(0, 50);
      window.localStorage.setItem(PRINT_HISTORY_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('qfomeai:print-history-updated', { detail: newItem }));
    } catch (err) {
      console.warn('[PrintCentralService] Erro ao salvar histórico de impressão:', err);
    }
  }

  return newItem;
}

/**
 * Converte o tipo de destino em um rótulo legível
 */
export function getDestinationLabel(destination: PrintDestinationType | 'test'): string {
  switch (destination) {
    case 'delivery':
      return 'Pedidos Delivery';
    case 'counter':
      return 'Pedidos Balcão';
    case 'dine_in':
      return 'Pedidos Garçom/Mesa';
    case 'kitchen':
      return 'Produção da Cozinha';
    case 'pre_bill':
      return 'Pré-conta';
    case 'cash_open':
      return 'Abertura de Caixa';
    case 'cash_close':
      return 'Fechamento de Caixa';
    case 'test':
      return 'Teste de Impressão';
    default:
      return 'Documento';
  }
}

export interface ExecuteReprintParams {
  historyItem: PrintHistoryItem;
  reason: string;
  reprintedBy?: string;
}

/**
 * Executa uma reimpressão manual segura de exatamente 1 cópia, registrando motivo, operador, data/hora, impressora e documento
 */
export async function executeReprintJob(params: ExecuteReprintParams): Promise<{ success: boolean; message: string }> {
  const { historyItem, reason, reprintedBy } = params;

  if (!historyItem || !historyItem.lastHtml) {
    return { success: false, message: 'Nenhum layout disponível para este documento.' };
  }

  const shortReason = (reason || '').trim();
  if (!shortReason) {
    return { success: false, message: 'É obrigatório informar o motivo da reimpressão.' };
  }

  const operator = (reprintedBy || 'Operador').trim();
  const documentId = historyItem.documentId || historyItem.id || 'doc';
  const rawDocType = historyItem.documentType.replace(/\s*\(Reimpressão\)$/, '');
  const documentType = `${rawDocType} (Reimpressão)`;

  // Trava de concorrência / clique duplo para reimpressão
  const reprintLockKey = `reprint:::${documentId}:::${historyItem.rawPrinterName || historyItem.printerName || 'browser'}:::${rawDocType}`;
  if (!acquirePrintLock(reprintLockKey)) {
    return { success: false, message: 'Reimpressão já em andamento. Aguarde a conclusão.' };
  }

  try {
    if (historyItem.method === 'qz' && historyItem.rawPrinterName) {
      const isConnected = await ensureQzConnected();
      if (isConnected) {
        const paperSize = historyItem.paperSize || '80mm';
        const paperWidthMm = paperSize === '58mm' ? 58 : paperSize === '100mm' ? 100 : 80;
        const config = qz.configs.create(historyItem.rawPrinterName, {
          size: { width: paperWidthMm },
          units: 'mm',
          margins: 0,
          scaleContent: true,
          rasterize: false,
          copies: 1
        });
        const cleanHtml = historyItem.lastHtml.replace(/<script[\s\S]*?<\/script>/gi, '');
        const printData = [
          {
            type: 'pixel',
            format: 'html',
            flavor: 'plain',
            data: cleanHtml
          }
        ];
        await qz.print(config, printData);

        // Registra o evento de reimpressão no histórico sem sobrescrever o original
        recordPrintHistoryItem({
          timestamp: Date.now(),
          printerName: historyItem.printerName,
          rawPrinterName: historyItem.rawPrinterName,
          documentType,
          documentId,
          destination: historyItem.destination,
          status: 'success',
          method: 'qz',
          paperSize: historyItem.paperSize,
          lastHtml: historyItem.lastHtml,
          isReprint: true,
          reprintReason: shortReason,
          reprintedBy: operator,
          reprintedAt: Date.now()
        });

        return { 
          success: true, 
          message: `Reimpresso com sucesso na impressora "${historyItem.printerName}" (Motivo: ${shortReason})!` 
        };
      }
    }

    // Fallback via navegador (1 cópia aberta no visualizador térmico)
    executeThermalPrint(historyItem.lastHtml);

    recordPrintHistoryItem({
      timestamp: Date.now(),
      printerName: historyItem.printerName || 'Navegador',
      rawPrinterName: historyItem.rawPrinterName,
      documentType,
      documentId,
      destination: historyItem.destination,
      status: 'success',
      method: 'browser',
      paperSize: historyItem.paperSize,
      lastHtml: historyItem.lastHtml,
      isReprint: true,
      reprintReason: shortReason,
      reprintedBy: operator,
      reprintedAt: Date.now()
    });

    return { 
      success: true, 
      message: `Reimpressão aberta no navegador com sucesso (Motivo: ${shortReason})!` 
    };
  } catch (err: any) {
    console.error('[PrintCentralService] Erro ao executar reimpressão:', err);
    recordPrintHistoryItem({
      timestamp: Date.now(),
      printerName: historyItem.printerName || 'Impressora',
      rawPrinterName: historyItem.rawPrinterName,
      documentType,
      documentId,
      destination: historyItem.destination,
      status: 'error',
      errorMessage: err?.message || 'Falha ao reimprimir',
      method: historyItem.method || 'browser',
      paperSize: historyItem.paperSize,
      lastHtml: historyItem.lastHtml,
      isReprint: true,
      reprintReason: shortReason,
      reprintedBy: operator,
      reprintedAt: Date.now()
    });

    return { 
      success: false, 
      message: `Erro ao reimprimir: ${err?.message || 'Falha desconhecida'}` 
    };
  } finally {
    releasePrintLock(reprintLockKey);
  }
}

/**
 * Reimprime o último cupom registrado no sistema com motivo e operador
 */
export async function reprintLastJob(options?: { reason?: string; reprintedBy?: string }): Promise<{ success: boolean; message: string }> {
  const history = getPrintHistory();
  const lastItem = history.find(item => item.lastHtml && item.lastHtml.trim().length > 0);

  if (!lastItem || !lastItem.lastHtml) {
    return { success: false, message: 'Nenhuma impressão anterior encontrada para reimprimir.' };
  }

  return executeReprintJob({
    historyItem: lastItem,
    reason: options?.reason || 'Solicitação manual do operador',
    reprintedBy: options?.reprintedBy || 'Operador'
  });
}

// In-memory set para travar concorrência e evitar cliques duplos rápidos / jobs simultâneos
const inFlightPrintJobs = new Set<string>();

/**
 * Interface do registro de segurança contra impressões duplicadas
 */
export interface PrintSecurityRecord {
  compositeKey: string;
  documentId: string;
  printerId: string;
  rawName: string;
  documentType: string;
  destination: string;
  status: 'success' | 'error';
  printedAt: number;
}

/**
 * Constrói o identificador composto único para cada impressão:
 * documentId + printerId + tipoDocumento (+ restaurantId)
 */
export function buildPrintCompositeKey(
  restaurantId: string | undefined,
  documentId: string,
  printerId: string,
  documentType: string
): string {
  const normRest = String(restaurantId || 'global').trim().toLowerCase();
  const normDoc = String(documentId || 'doc_unknown').trim();
  const normPrinter = String(printerId || 'default').trim().toLowerCase();
  const normType = String(documentType || 'general').trim().toLowerCase();
  return `${normRest}:::${normDoc}:::${normPrinter}:::${normType}`;
}

/**
 * Retorna a chave do LocalStorage para os registros de segurança do restaurante
 */
function getSecurityStorageKey(restaurantId: string | undefined): string {
  return `qfomeai_print_security_records_${String(restaurantId || 'global').trim()}`;
}

/**
 * Carrega todos os registros de impressões bem-sucedidas do LocalStorage
 */
export function getPrintSecurityRecords(restaurantId: string | undefined): Record<string, PrintSecurityRecord> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(getSecurityStorageKey(restaurantId));
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (err) {
    console.warn('[PrintCentralService] Erro ao ler registros de segurança de impressão:', err);
    return {};
  }
}

/**
 * REGRA 2 & 3: Verifica se aquele mesmo documento já foi enviado e impresso com sucesso para aquela impressora
 */
export function isDocumentAlreadyPrinted(
  restaurantId: string | undefined,
  documentId: string,
  printerId: string,
  documentType: string
): boolean {
  if (!documentId || !printerId) return false;
  const compositeKey = buildPrintCompositeKey(restaurantId, documentId, printerId, documentType);
  const records = getPrintSecurityRecords(restaurantId);
  const record = records[compositeKey];
  return Boolean(record && record.status === 'success');
}

/**
 * REGRA 8: Se imprimir com sucesso, registrar sucesso e bloquear nova impressão automática
 */
export function recordSuccessfulPrint(
  restaurantId: string | undefined,
  documentId: string,
  printerId: string,
  rawName: string,
  documentType: string,
  destination: string = 'general'
): void {
  if (!documentId || !printerId) return;
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const compositeKey = buildPrintCompositeKey(restaurantId, documentId, printerId, documentType);
    const records = getPrintSecurityRecords(restaurantId);

    records[compositeKey] = {
      compositeKey,
      documentId,
      printerId,
      rawName,
      documentType,
      destination,
      status: 'success',
      printedAt: Date.now()
    };

    // Higienização: remover registros com mais de 7 dias para manter o storage leve e rápido
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const cleanedRecords: Record<string, PrintSecurityRecord> = {};
    for (const [k, v] of Object.entries(records)) {
      if (v && v.printedAt && v.printedAt > sevenDaysAgo) {
        cleanedRecords[k] = v;
      }
    }

    window.localStorage.setItem(getSecurityStorageKey(restaurantId), JSON.stringify(cleanedRecords));

    // Notificar listeners locais caso necessário
    window.dispatchEvent(new CustomEvent('qfomeai:print-security-updated', { 
      detail: { compositeKey, documentId, printerId, documentType, status: 'success' } 
    }));
  } catch (err) {
    console.warn('[PrintCentralService] Erro ao gravar registro de sucesso de impressão:', err);
  }
}

/**
 * REGRA 7: Se a impressão falhar, registrar erro e permitir nova tentativa
 */
export function recordFailedPrint(
  restaurantId: string | undefined,
  documentId: string,
  printerId: string,
  rawName: string,
  documentType: string,
  errorMessage?: string
): void {
  // Não gravamos 'success', portanto NÃO bloqueamos a próxima tentativa
  console.warn(`[PrintCentralService] Falha de impressão registrada para [Doc: ${documentId}, Impressora: ${printerId}, Tipo: ${documentType}]: ${errorMessage || 'Falha no envio'}`);
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('qfomeai:print-security-updated', { 
      detail: { documentId, printerId, documentType, status: 'error', errorMessage } 
    }));
  }
}

/**
 * Remove o bloqueio de segurança para um documento específico (caso necessário)
 */
export function clearPrintSecurityRecord(
  restaurantId: string | undefined,
  documentId: string,
  printerId: string,
  documentType: string
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const compositeKey = buildPrintCompositeKey(restaurantId, documentId, printerId, documentType);
    const records = getPrintSecurityRecords(restaurantId);
    if (records[compositeKey]) {
      delete records[compositeKey];
      window.localStorage.setItem(getSecurityStorageKey(restaurantId), JSON.stringify(records));
    }
  } catch (err) {
    console.warn('[PrintCentralService] Erro ao limpar registro de segurança:', err);
  }
}

/**
 * REGRA 9: Adquire trava atômica em memória para impedir múltiplos cliques rápidos ou jobs concorrentes
 */
export function acquirePrintLock(compositeKey: string): boolean {
  if (inFlightPrintJobs.has(compositeKey)) {
    return false;
  }
  inFlightPrintJobs.add(compositeKey);
  return true;
}

/**
 * Libera a trava atômica após término da tentativa (seja sucesso ou falha)
 */
export function releasePrintLock(compositeKey: string): void {
  inFlightPrintJobs.delete(compositeKey);
}

/**
 * REGRA: Verifica se a impressão automática está habilitada para o restaurante (por canal ou geral).
 * Por padrão, novas automações iniciam DESLIGADAS (false). Somente imprime automaticamente se a respectiva chave estiver ATIVA (true).
 */
export function isAutoPrintEnabledForRestaurant(
  restaurantProfile?: any, 
  profile?: any,
  destination?: PrintDestinationType | string
): boolean {
  const target = restaurantProfile || profile;
  if (!target) return false; // Desligado por padrão

  const autoConfig = target.autoPrintSettings || target.autoPrintConfig || {};

  if (destination) {
    if (destination === 'delivery') {
      return Boolean(autoConfig.delivery ?? target.autoPrintDelivery ?? false);
    }
    if (destination === 'counter' || destination === 'balcao') {
      return Boolean(autoConfig.counter ?? target.autoPrintCounter ?? target.autoPrintBalcao ?? false);
    }
    if (destination === 'dine_in' || destination === 'table' || destination === 'mesa') {
      return Boolean(autoConfig.table ?? target.autoPrintTable ?? target.autoPrintMesa ?? false);
    }
    if (destination === 'kitchen' || destination === 'cozinha') {
      return Boolean(autoConfig.kitchen ?? target.autoPrintKitchen ?? target.kitchenAutoPrint ?? false);
    }
  }

  // Verificação geral: retorna true se alguma automação estiver ligada
  const isDelivery = Boolean(autoConfig.delivery ?? target.autoPrintDelivery ?? false);
  const isCounter = Boolean(autoConfig.counter ?? target.autoPrintCounter ?? target.autoPrintBalcao ?? false);
  const isTable = Boolean(autoConfig.table ?? target.autoPrintTable ?? target.autoPrintMesa ?? false);
  const isKitchen = Boolean(autoConfig.kitchen ?? target.autoPrintKitchen ?? target.kitchenAutoPrint ?? false);

  return isDelivery || isCounter || isTable || isKitchen;
}

/**
 * Chave de armazenagem de tentativas de auto-impressão para impedir re-envio automático em reconexão ou reload
 */
const AUTOPRINT_ATTEMPTED_KEY = 'qfomeai_autoprint_attempted_records';

/**
 * Registra que uma impressão automática foi tentada (seja sucesso ou falha/pendente)
 * para que reconexões do QZ Tray, atualizações do Firestore ou reload de página NUNCA disparem auto-impressão repetida.
 */
export function recordAutoPrintAttempt(
  restaurantId: string | undefined,
  documentId: string,
  printerId: string,
  documentType: string,
  status: 'success' | 'failed' = 'failed'
): void {
  if (!documentId || !printerId || typeof window === 'undefined' || !window.localStorage) return;
  try {
    const compositeKey = buildPrintCompositeKey(restaurantId, documentId, printerId, documentType);
    const raw = window.localStorage.getItem(AUTOPRINT_ATTEMPTED_KEY);
    const records = raw ? JSON.parse(raw) : {};
    records[compositeKey] = {
      compositeKey,
      documentId,
      printerId,
      documentType,
      status,
      attemptedAt: Date.now()
    };
    window.localStorage.setItem(AUTOPRINT_ATTEMPTED_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('[PrintCentralService] Erro ao gravar registro de tentativa de auto-impressão:', err);
  }
}

/**
 * Verifica se uma impressão automática já foi tentada ou concluída para um documento + impressora
 */
export function hasAutoPrintBeenAttempted(
  restaurantId: string | undefined,
  documentId: string,
  printerId: string,
  documentType: string
): boolean {
  if (!documentId || !printerId) return false;
  // Se já foi concluída com sucesso na camada de segurança
  if (isDocumentAlreadyPrinted(restaurantId, documentId, printerId, documentType)) {
    return true;
  }
  // Se já foi tentada anteriormente (mesmo que tenha falhado ou ficado pendente)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const compositeKey = buildPrintCompositeKey(restaurantId, documentId, printerId, documentType);
      const raw = window.localStorage.getItem(AUTOPRINT_ATTEMPTED_KEY);
      if (raw) {
        const records = JSON.parse(raw);
        if (records[compositeKey]) return true;
      }
    } catch {
      // Ignora erro
    }
  }
  return false;
}

/**
 * Verifica se uma impressora específica está disponível no sistema via QZ Tray
 */
export async function isPrinterAvailable(rawName: string): Promise<boolean> {
  if (!rawName) return false;
  try {
    const isConnected = await ensureQzConnected();
    if (!isConnected) return false;
    const foundPrinter = await qz.printers.find(rawName);
    return Boolean(foundPrinter);
  } catch (err) {
    return false;
  }
}

export interface ContingencyNoticeOptions {
  message: string;
  reason?: string;
  documentId?: string;
  documentTitle?: string;
  htmlToPrint?: string;
  onManualPrint?: () => void;
  type?: 'warning' | 'error' | 'info';
}

/**
 * Exibe um aviso claro de CONTINGÊNCIA na tela com alternativa manual "Imprimir pelo navegador"
 */
export function showPrintContingencyNotice(options: ContingencyNoticeOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const noticeId = 'qfomeai-contingency-print-toast';
  let noticeEl = document.getElementById(noticeId);

  if (noticeEl && noticeEl.parentNode) {
    noticeEl.parentNode.removeChild(noticeEl);
  }

  noticeEl = document.createElement('div');
  noticeEl.id = noticeId;
  noticeEl.style.position = 'fixed';
  noticeEl.style.bottom = '24px';
  noticeEl.style.right = '24px';
  noticeEl.style.zIndex = '999999';
  noticeEl.style.padding = '14px 18px';
  noticeEl.style.borderRadius = '16px';
  noticeEl.style.fontSize = '13px';
  noticeEl.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  noticeEl.style.boxShadow = '0 20px 30px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.2)';
  noticeEl.style.transition = 'all 0.3s ease-in-out';
  noticeEl.style.maxWidth = '420px';
  noticeEl.style.backgroundColor = '#1c1917'; // Stone-900
  noticeEl.style.color = '#f5f5f4'; // Stone-100
  noticeEl.style.border = '1.5px solid #d97706'; // Amber-600 border
  noticeEl.style.display = 'flex';
  noticeEl.style.flexDirection = 'column';
  noticeEl.style.gap = '10px';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.justifyContent = 'space-between';
  titleRow.style.gap = '8px';

  const titleText = document.createElement('div');
  titleText.style.fontWeight = '700';
  titleText.style.color = '#fbbf24'; // Amber-400
  titleText.style.display = 'flex';
  titleText.style.alignItems = 'center';
  titleText.style.gap = '6px';
  titleText.innerHTML = `⚠️ <span>Contingência de Impressão</span> <span style="font-size:10px; background:#78350f; color:#fef3c7; padding:2px 6px; border-radius:4px; font-weight:800;">FALHA / PENDENTE</span>`;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.color = '#a8a29e';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontSize = '14px';
  closeBtn.onclick = () => {
    if (noticeEl && noticeEl.parentNode) noticeEl.parentNode.removeChild(noticeEl);
  };

  titleRow.appendChild(titleText);
  titleRow.appendChild(closeBtn);

  const msgText = document.createElement('div');
  msgText.style.color = '#e7e5e4';
  msgText.style.fontSize = '12px';
  msgText.style.lineHeight = '1.4';
  msgText.textContent = options.message || 'QZ Tray ou impressora indisponível para receber a impressão.';

  noticeEl.appendChild(titleRow);
  noticeEl.appendChild(msgText);

  if (options.htmlToPrint || typeof options.onManualPrint === 'function') {
    const actionRow = document.createElement('div');
    actionRow.style.display = 'flex';
    actionRow.style.alignItems = 'center';
    actionRow.style.justifyContent = 'flex-end';
    actionRow.style.gap = '8px';
    actionRow.style.marginTop = '4px';

    const printBtn = document.createElement('button');
    printBtn.textContent = '🖨️ Imprimir pelo navegador';
    printBtn.style.backgroundColor = '#d97706';
    printBtn.style.color = '#ffffff';
    printBtn.style.border = 'none';
    printBtn.style.padding = '7px 14px';
    printBtn.style.borderRadius = '8px';
    printBtn.style.fontSize = '12px';
    printBtn.style.fontWeight = '700';
    printBtn.style.cursor = 'pointer';
    printBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

    printBtn.onclick = () => {
      if (typeof options.onManualPrint === 'function') {
        options.onManualPrint();
      } else if (options.htmlToPrint) {
        executeThermalPrint(options.htmlToPrint);
      }
      if (noticeEl && noticeEl.parentNode) {
        noticeEl.parentNode.removeChild(noticeEl);
      }
    };

    actionRow.appendChild(printBtn);
    noticeEl.appendChild(actionRow);
  }

  document.body.appendChild(noticeEl);

  // Auto remove após 12 segundos se não clicado
  setTimeout(() => {
    if (noticeEl && noticeEl.parentNode) {
      noticeEl.style.opacity = '0';
      noticeEl.style.transform = 'translateY(8px)';
      setTimeout(() => {
        if (noticeEl && noticeEl.parentNode) {
          noticeEl.parentNode.removeChild(noticeEl);
        }
      }, 300);
    }
  }, 12000);
}

/**
 * Exibe um aviso discreto na tela quando o QZ Tray estiver offline ou inacessível.
 */
export function showDiscretePrintNotice(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const noticeId = 'qfomeai-discrete-print-toast';
  let noticeEl = document.getElementById(noticeId);

  if (!noticeEl) {
    noticeEl = document.createElement('div');
    noticeEl.id = noticeId;
    noticeEl.style.position = 'fixed';
    noticeEl.style.bottom = '24px';
    noticeEl.style.right = '24px';
    noticeEl.style.zIndex = '99999';
    noticeEl.style.padding = '10px 16px';
    noticeEl.style.borderRadius = '10px';
    noticeEl.style.fontSize = '13px';
    noticeEl.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    noticeEl.style.fontWeight = '600';
    noticeEl.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)';
    noticeEl.style.transition = 'all 0.25s ease-in-out';
    noticeEl.style.maxWidth = '360px';
    noticeEl.style.pointerEvents = 'none';
    document.body.appendChild(noticeEl);
  }

  if (type === 'warning' || type === 'info') {
    noticeEl.style.backgroundColor = '#292524'; // Stone-800
    noticeEl.style.color = '#f5f5f4'; // Stone-100
    noticeEl.style.border = '1px solid #44403c';
  } else {
    noticeEl.style.backgroundColor = '#991b1b'; // Red-800
    noticeEl.style.color = '#ffffff';
    noticeEl.style.border = '1px solid #7f1d1d';
  }

  noticeEl.textContent = message;
  noticeEl.style.opacity = '1';
  noticeEl.style.transform = 'translateY(0)';

  // Remove automaticamente após 4.5 segundos
  const existingTimeout = (noticeEl as any)._dismissTimeout;
  if (existingTimeout) clearTimeout(existingTimeout);

  (noticeEl as any)._dismissTimeout = setTimeout(() => {
    if (noticeEl) {
      noticeEl.style.opacity = '0';
      noticeEl.style.transform = 'translateY(8px)';
      setTimeout(() => {
        if (noticeEl && noticeEl.parentNode) {
          noticeEl.parentNode.removeChild(noticeEl);
        }
      }, 300);
    }
  }, 4500);
}

/**
 * Converte qualquer origem de pedido na destinação de impressão correspondente
 */
export function resolveOrderDestination(order: any): PrintDestinationType {
  const origem = normalizeOrderOrigem(order);
  if (origem === 'DELIVERY') return 'delivery';
  if (origem === 'BALCAO') return 'counter';
  if (origem === 'GARCOM') return 'dine_in';
  return 'delivery';
}

/**
 * Busca a lista completa de impressoras configuradas no restaurante
 */
export async function getRestaurantConfiguredPrinters(
  restaurantProfile?: any, 
  profile?: any, 
  explicitRestaurantId?: string
): Promise<ConfiguredPrinter[]> {
  if (Array.isArray(restaurantProfile?.configuredPrinters) && restaurantProfile.configuredPrinters.length > 0) {
    return restaurantProfile.configuredPrinters;
  }
  if (Array.isArray(profile?.configuredPrinters) && profile.configuredPrinters.length > 0) {
    return profile.configuredPrinters;
  }

  const restId = 
    explicitRestaurantId || 
    restaurantProfile?.id || 
    restaurantProfile?.restaurantId || 
    profile?.restaurantId || 
    profile?.id;

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
      console.warn('[PrintCentralService] Erro ao buscar impressoras configuradas no Firestore:', dbErr);
    }
  }

  return [];
}

/**
 * Busca a lista completa de estações de impressão configuradas no restaurante
 */
export async function getRestaurantPrintStations(
  restaurantProfile?: any,
  profile?: any,
  explicitRestaurantId?: string
): Promise<PrintStation[]> {
  if (Array.isArray(restaurantProfile?.printStations) && restaurantProfile.printStations.length > 0) {
    return restaurantProfile.printStations;
  }
  if (Array.isArray(profile?.printStations) && profile.printStations.length > 0) {
    return profile.printStations;
  }

  const restId =
    explicitRestaurantId ||
    restaurantProfile?.id ||
    restaurantProfile?.restaurantId ||
    profile?.restaurantId ||
    profile?.id;

  if (restId) {
    try {
      const docRef = doc(db, 'restaurants', restId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.printStations)) {
          return data.printStations;
        }
      }
    } catch (dbErr) {
      console.warn('[PrintCentralService] Erro ao buscar estações de impressão no Firestore:', dbErr);
    }
  }

  return [];
}

export interface StationPrintJob {
  station: PrintStation;
  printer: ConfiguredPrinter;
  items: any[];
}

/**
 * Roteamento por estação:
 * Separa os itens de produção pelas categorias cadastradas em cada estação.
 * 
 * Regras:
 * - Cada item é enviado somente para a estação correspondente à sua categoria.
 * - Não duplica o mesmo item na mesma estação.
 * - Itens de categorias sem estação configurada são agrupados em unassignedItems para o fluxo padrão da cozinha.
 */
export function routeOrderItemsByStations(
  order: any,
  stations: PrintStation[],
  configuredPrinters: ConfiguredPrinter[]
): {
  stationJobs: StationPrintJob[];
  unassignedItems: any[];
} {
  const items = Array.isArray(order?.items) ? order.items : Array.isArray(order?.itens) ? order.itens : [];
  if (!Array.isArray(stations) || stations.length === 0 || items.length === 0) {
    return { stationJobs: [], unassignedItems: items };
  }

  // Filtrar apenas estações válidas com impressora e categorias associadas
  const validStations = stations.filter(
    s => s && s.printerId && ((Array.isArray(s.categoryIds) && s.categoryIds.length > 0) || (Array.isArray(s.categoryNames) && s.categoryNames.length > 0))
  );

  if (validStations.length === 0) {
    return { stationJobs: [], unassignedItems: items };
  }

  const assignedStationMap = new Map<string, any[]>();
  validStations.forEach(st => assignedStationMap.set(st.id, []));
  const unassigned: any[] = [];

  for (const item of items) {
    const itemCatId = String(item.categoria_id || item.categoryId || item.categoriaId || '').trim();
    const itemCatNome = String(
      item.categoria_nome || item.categoria || item.category || item.categoryName || item.produto_categoria || ''
    ).trim().toLowerCase();

    let matchedStation: PrintStation | null = null;

    for (const station of validStations) {
      const stationCatIds = (station.categoryIds || []).map(id => String(id).trim());
      const stationCatNames = (station.categoryNames || []).map(n => String(n).trim().toLowerCase());

      const matchById = itemCatId && stationCatIds.includes(itemCatId);
      const matchByName = itemCatNome && (
        stationCatNames.includes(itemCatNome) ||
        stationCatIds.some(id => id.toLowerCase() === itemCatNome)
      );
      const matchWildcard = stationCatIds.includes('all') || stationCatIds.includes('*');

      if (matchById || matchByName || matchWildcard) {
        matchedStation = station;
        break; // Cada item vai exclusivamente para a primeira estação compatível (sem duplicação)
      }
    }

    if (matchedStation) {
      assignedStationMap.get(matchedStation.id)!.push(item);
    } else {
      unassigned.push(item);
    }
  }

  const stationJobs: StationPrintJob[] = [];

  for (const station of validStations) {
    const stationItems = assignedStationMap.get(station.id) || [];
    if (stationItems.length > 0) {
      // Localizar a impressora física configurada correspondente à estação
      const printer = configuredPrinters.find(p =>
        p.id === station.printerId ||
        p.rawName.toLowerCase() === station.printerId.toLowerCase() ||
        (station.printerRawName && p.rawName.toLowerCase() === station.printerRawName.toLowerCase()) ||
        p.nickname.toLowerCase() === station.printerId.toLowerCase()
      );

      if (printer) {
        stationJobs.push({
          station,
          printer,
          items: stationItems
        });
      } else {
        // Se a impressora da estação não estiver mais configurada, não perde os itens: transfere para o fluxo geral
        unassigned.push(...stationItems);
      }
    }
  }

  return {
    stationJobs,
    unassignedItems: unassigned
  };
}

/**
 * Filtra impressoras configuradas que atendem ao destino solicitado
 */
export function getPrintersForDestination(
  destination: PrintDestinationType, 
  configuredPrinters: ConfiguredPrinter[]
): ConfiguredPrinter[] {
  if (!Array.isArray(configuredPrinters) || configuredPrinters.length === 0) {
    return [];
  }

  return configuredPrinters.filter(printer => {
    if (!printer || !printer.rawName) return false;
    const dests = Array.isArray(printer.destinations) ? printer.destinations : [];
    
    // Correspondência direta com o ID do destino
    if (dests.includes(destination)) return true;

    // Compatibilidade semântica com termos legados
    if (destination === 'kitchen' && dests.some(d => String(d).toLowerCase().includes('cozinha'))) return true;
    if (destination === 'delivery' && dests.some(d => String(d).toLowerCase().includes('delivery'))) return true;
    if (destination === 'counter' && dests.some(d => String(d).toLowerCase().includes('balcao') || String(d).toLowerCase().includes('balcão'))) return true;
    if (destination === 'dine_in' && dests.some(d => String(d).toLowerCase().includes('garcom') || String(d).toLowerCase().includes('mesa'))) return true;
    if (destination === 'pre_bill' && dests.some(d => String(d).toLowerCase().includes('conta'))) return true;
    if (destination === 'cash_open' && dests.some(d => String(d).toLowerCase().includes('abertura'))) return true;
    if (destination === 'cash_close' && dests.some(d => String(d).toLowerCase().includes('fechamento'))) return true;

    return false;
  });
}

/**
 * Garante conexão ativa com o QZ Tray
 */
export async function ensureQzConnected(): Promise<boolean> {
  try {
    const isActive = typeof qz.websocket?.isActive === 'function' && qz.websocket.isActive();
    if (isActive) return true;

    await qz.websocket.connect({ retries: 0, delay: 0 });
    return typeof qz.websocket?.isActive === 'function' && qz.websocket.isActive();
  } catch (err) {
    return false;
  }
}

/**
 * SERVIÇO CENTRAL DE IMPRESSÃO
 * 
 * Regras implementadas:
 * 1. Sempre que existir impressora configurada para o destino, conecta e usa o QZ Tray diretamente.
 * 2. Respeita rigorosamente a largura de papel configurada: 58mm, 80mm ou 100mm.
 * 3. Se houver mais de 1 impressora configurada para o destino, envia 1 cópia para cada.
 * 4. Se o QZ Tray estiver offline ou falhar na conexão:
 *    - Emite aviso discreto informando que o QZ está desconectado.
 *    - Executa imediatamente o fallback pelo navegador.
 * 5. Se NENHUMA impressora estiver configurada para o destino:
 *    - Executa o fluxo padrão de impressão do navegador sem emitir erro.
 * 6. Protege contra cliques repetidos / duplicidade de impressão.
 */
export async function printViaCentralService(job: CentralPrintJob): Promise<CentralPrintResult> {
  const {
    destination,
    htmlGenerator,
    fallbackHtml,
    fallbackExecutor,
    restaurantProfile,
    profile,
    restaurantId,
    documentId: rawDocumentId,
    documentType: rawDocumentType,
    documentTitle,
    isReprint = false,
    isAutoPrint = false,
    forcePrint = false
  } = job;

  const restId = 
    restaurantId || 
    restaurantProfile?.id || 
    restaurantProfile?.restaurantId || 
    profile?.restaurantId || 
    profile?.id;

  const documentId = rawDocumentId || documentTitle || `${destination}_${Date.now()}`;
  const documentType = rawDocumentType || destination;

  // REGRA 5: Se for disparo automático, verificar se a impressão automática está ativa nas configurações
  if (isAutoPrint && !isAutoPrintEnabledForRestaurant(restaurantProfile, profile)) {
    console.info(`[PrintCentralService] Impressão automática desabilitada nas configurações do restaurante. Ignorando documento [${documentId}].`);
    return {
      success: false,
      method: 'qz',
      printerCount: 0,
      printersUsed: [],
      error: 'Impressão automática desabilitada nas configurações'
    };
  }

  // 1. Obter impressoras configuradas para este destino
  const allPrinters = await getRestaurantConfiguredPrinters(restaurantProfile, profile, restId);
  const targetPrinters = getPrintersForDestination(destination, allPrinters);

  // 2. Se existirem impressoras configuradas para este destino, tentar imprimir via QZ Tray
  if (targetPrinters.length > 0) {
    // Verificar se todos os destinos já foram previamente impressos (se não for reimpressão explícita)
    if (!isReprint && !forcePrint) {
      const allAlreadyPrinted = targetPrinters.every(printer => {
        const printerId = printer.id || printer.rawName;
        return isDocumentAlreadyPrinted(restId, documentId, printerId, documentType);
      });

      if (allAlreadyPrinted) {
        console.info(`[PrintCentralService] Documento [${documentId}] já impresso com sucesso em todas as impressoras de "${destination}". Bloqueando envio duplicado.`);
        return {
          success: true,
          method: 'qz',
          printerCount: 0,
          printersUsed: []
        };
      }
    }

    const isConnected = await ensureQzConnected();

    if (!isConnected) {
      // Registrar falha para todas as impressoras alvo para evitar re-tentativas em loop no auto-print
      for (const printer of targetPrinters) {
        const printerId = printer.id || printer.rawName;
        recordFailedPrint(restId, documentId, printerId, printer.rawName, documentType, 'QZ Tray desconectado (FALHA/PENDENTE)');
        if (isAutoPrint) {
          recordAutoPrintAttempt(restId, documentId, printerId, documentType, 'failed');
        }
      }

      const defaultHtml = fallbackHtml || htmlGenerator('80mm');

      recordPrintHistoryItem({
        timestamp: Date.now(),
        printerName: targetPrinters.map(p => p.nickname || p.rawName).join(', ') || 'QZ Tray Offline',
        documentType: `${getDestinationLabel(destination)}${isReprint ? ' (Reimpressão)' : ''}`,
        documentId,
        destination,
        status: 'error',
        errorMessage: 'QZ Tray desconectado — Impressão PENDENTE (Contingência)',
        method: 'qz',
        paperSize: '80mm',
        lastHtml: defaultHtml,
        isReprint,
        reprintReason: job.reprintReason,
        reprintedBy: job.reprintedBy,
        reprintedAt: isReprint ? Date.now() : undefined
      });

      // Exibir aviso claro de contingência com botão "Imprimir pelo navegador"
      showPrintContingencyNotice({
        message: `Impressão de "${documentTitle || getDestinationLabel(destination)}" retida: QZ Tray desconectado.`,
        documentId,
        documentTitle,
        htmlToPrint: defaultHtml,
        onManualPrint: () => {
          if (typeof fallbackExecutor === 'function') {
            fallbackExecutor();
          } else {
            executeThermalPrint(defaultHtml);
          }
        }
      });

      return {
        success: false,
        method: 'qz',
        printerCount: 0,
        printersUsed: [],
        qzOffline: true,
        error: 'QZ Tray desconectado (FALHA/PENDENTE)'
      };
    }

    // QZ Tray Online: Enviar 1 cópia em cada impressora configurada elegível
    const printedPrinters: string[] = [];
    let lastGeneratedHtml = '';
    let lastPaperSize: PaperSize = '80mm';

    for (const printer of targetPrinters) {
      const printerId = printer.id || printer.rawName;
      const compositeKey = buildPrintCompositeKey(restId, documentId, printerId, documentType);

      // REGRA 2 & 3: Verificar se aquele mesmo documento já foi enviado para aquela impressora
      if (!isReprint && !forcePrint) {
        if (isDocumentAlreadyPrinted(restId, documentId, printerId, documentType)) {
          console.info(`[PrintCentralService] Documento [${documentId}] já impresso em "${printer.rawName}" (${documentType}). Pulando.`);
          continue;
        }
      }

      // REGRA 9 & 10: Trava atômica em memória para evitar cliques duplos rápidos
      if (!acquirePrintLock(compositeKey)) {
        console.warn(`[PrintCentralService] Impressão já em andamento para a chave "${compositeKey}". Ignorando duplo disparo.`);
        continue;
      }

      // Checagem de disponibilidade da impressora no sistema
      const printerAvailable = await isPrinterAvailable(printer.rawName);
      if (!printerAvailable) {
        console.warn(`[PrintCentralService] Impressora "${printer.rawName}" não encontrada ou indisponível no sistema.`);
        recordFailedPrint(restId, documentId, printerId, printer.rawName, documentType, 'Impressora não encontrada ou indisponível (FALHA/PENDENTE)');
        if (isAutoPrint) {
          recordAutoPrintAttempt(restId, documentId, printerId, documentType, 'failed');
        }

        const rawHtml = htmlGenerator(printer.paperSize || '80mm');
        recordPrintHistoryItem({
          timestamp: Date.now(),
          printerName: printer.nickname || printer.rawName,
          rawPrinterName: printer.rawName,
          documentType: `${getDestinationLabel(destination)}${isReprint ? ' (Reimpressão)' : ''}`,
          documentId,
          destination,
          status: 'error',
          errorMessage: `Impressora "${printer.rawName}" indisponível no sistema`,
          method: 'qz',
          paperSize: printer.paperSize || '80mm',
          lastHtml: rawHtml,
          isReprint,
          reprintReason: job.reprintReason,
          reprintedBy: job.reprintedBy,
          reprintedAt: isReprint ? Date.now() : undefined
        });

        releasePrintLock(compositeKey);
        continue;
      }

      const rawPaperSize = printer.paperSize || '80mm';
      const paperSize: PaperSize = rawPaperSize === '58mm' ? '58mm' : rawPaperSize === '100mm' ? '100mm' : '80mm';
      const paperWidthMm = paperSize === '58mm' ? 58 : paperSize === '100mm' ? 100 : 80;

      // Gera o HTML formatado especificamente para o tamanho de papel desta impressora
      const rawHtml = htmlGenerator(paperSize);
      lastGeneratedHtml = rawHtml;
      lastPaperSize = paperSize;
      // Remove tags <script> para evitar que o interpretador HTML do QZ dispare window.print()
      const cleanHtml = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');

      const config = qz.configs.create(printer.rawName, {
        size: { width: paperWidthMm },
        units: 'mm',
        margins: 0,
        scaleContent: true,
        rasterize: false,
        copies: 1
      });

      const printData = [
        {
          type: 'pixel',
          format: 'html',
          flavor: 'plain',
          data: cleanHtml
        }
      ];

      try {
        await qz.print(config, printData);
        printedPrinters.push(printer.rawName);

        // REGRA 8: Se imprimir com sucesso, registrar sucesso e bloquear nova impressão automática
        recordSuccessfulPrint(restId, documentId, printerId, printer.rawName, documentType, destination);
        if (isAutoPrint) {
          recordAutoPrintAttempt(restId, documentId, printerId, documentType, 'success');
        }

        recordPrintHistoryItem({
          timestamp: Date.now(),
          printerName: printer.nickname || printer.rawName,
          rawPrinterName: printer.rawName,
          documentType: `${getDestinationLabel(destination)}${isReprint ? ' (Reimpressão)' : ''}`,
          documentId,
          destination,
          status: 'success',
          method: 'qz',
          paperSize,
          lastHtml: rawHtml,
          isReprint,
          reprintReason: job.reprintReason,
          reprintedBy: job.reprintedBy,
          reprintedAt: isReprint ? Date.now() : undefined
        });
      } catch (printErr: any) {
        // REGRA DE CONTINGÊNCIA: Se a impressão falhar, registrar FALHA/PENDENTE sem marcar como concluída
        console.error(`[PrintCentralService] Erro ao imprimir na impressora "${printer.rawName}":`, printErr);
        recordFailedPrint(restId, documentId, printerId, printer.rawName, documentType, printErr?.message);
        if (isAutoPrint) {
          recordAutoPrintAttempt(restId, documentId, printerId, documentType, 'failed');
        }

        recordPrintHistoryItem({
          timestamp: Date.now(),
          printerName: printer.nickname || printer.rawName,
          rawPrinterName: printer.rawName,
          documentType: `${getDestinationLabel(destination)}${isReprint ? ' (Reimpressão)' : ''}`,
          documentId,
          destination,
          status: 'error',
          errorMessage: printErr?.message || 'Falha no envio para a impressora (FALHA/PENDENTE)',
          method: 'qz',
          paperSize,
          lastHtml: rawHtml,
          isReprint,
          reprintReason: job.reprintReason,
          reprintedBy: job.reprintedBy,
          reprintedAt: isReprint ? Date.now() : undefined
        });
      } finally {
        releasePrintLock(compositeKey);
      }
    }

    if (printedPrinters.length > 0) {
      return {
        success: true,
        method: 'qz',
        printerCount: printedPrinters.length,
        printersUsed: printedPrinters
      };
    }

    // Se todas as impressoras foram puladas por já terem sido impressas com sucesso
    if (!isReprint && !forcePrint) {
      return {
        success: true,
        method: 'qz',
        printerCount: 0,
        printersUsed: []
      };
    }

    // Se a impressão via QZ falhou ou a impressora estava indisponível: exibir aviso claro + opção manual de navegador
    const defaultHtml = fallbackHtml || lastGeneratedHtml || htmlGenerator('80mm');
    showPrintContingencyNotice({
      message: `Impressão de "${documentTitle || getDestinationLabel(destination)}" não foi enviada à impressora. Status: FALHA/PENDENTE.`,
      documentId,
      documentTitle,
      htmlToPrint: defaultHtml,
      onManualPrint: () => {
        if (typeof fallbackExecutor === 'function') {
          fallbackExecutor();
        } else {
          executeThermalPrint(defaultHtml);
        }
      }
    });

    return {
      success: false,
      method: 'qz',
      printerCount: 0,
      printersUsed: [],
      error: 'Falha no envio para as impressoras QZ (Contingência ativada)'
    };
  }

  // 3. Se nenhuma impressora estiver configurada para este destino:
  // Se for auto-print, não abre navegador para evitar loops
  if (isAutoPrint) {
    return {
      success: true,
      method: 'browser',
      printerCount: 0,
      printersUsed: []
    };
  }

  // Manter comportamento padrão de impressão pelo navegador para ação manual do usuário
  const defaultHtml = fallbackHtml || htmlGenerator('80mm');
  if (typeof fallbackExecutor === 'function') {
    fallbackExecutor();
  } else {
    executeThermalPrint(defaultHtml);
  }

  recordPrintHistoryItem({
    timestamp: Date.now(),
    printerName: 'Navegador (Padrão)',
    documentType: `${getDestinationLabel(destination)}${isReprint ? ' (Reimpressão)' : ''}`,
    documentId,
    destination,
    status: 'success',
    method: 'browser',
    paperSize: '80mm',
    lastHtml: defaultHtml,
    isReprint,
    reprintReason: job.reprintReason,
    reprintedBy: job.reprintedBy,
    reprintedAt: isReprint ? Date.now() : undefined
  });

  return {
    success: true,
    method: 'browser',
    printerCount: 0,
    printersUsed: []
  };
}
