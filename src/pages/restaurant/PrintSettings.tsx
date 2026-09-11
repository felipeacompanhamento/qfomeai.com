import React, { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, updateDoc, collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Printer, 
  Save, 
  Loader2, 
  AlertCircle, 
  Check, 
  RefreshCw, 
  Download, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  Laptop, 
  Smartphone,
  Tag,
  Pencil,
  Trash2,
  Plus,
  AlertTriangle,
  X,
  Activity,
  RotateCcw,
  History,
  Clock,
  Layers,
  ChefHat,
  Wine,
  Sparkles,
  CheckSquare,
  Square,
  Search,
  Store,
  Info,
  Zap,
  ShoppingBag,
  Utensils
} from 'lucide-react';
import * as qzTrayModule from 'qz-tray';
import { 
  getPrintHistory, 
  recordPrintHistoryItem, 
  reprintLastJob, 
  executeReprintJob,
  PrintHistoryItem,
  PrintStation
} from '../../services/printCentralService';
import { ReprintConfirmModal } from '../../components/printing/ReprintConfirmModal';

// Interop seguro para ambientes ESM/Vite
const qz = (qzTrayModule as any).default || qzTrayModule;

export type PaperSize = '58mm' | '80mm' | '100mm';

export interface AutoPrintSettings {
  delivery: boolean;
  counter: boolean;
  table: boolean;
  kitchen: boolean;
}

export type PrintDestinationType =
  | 'delivery'        // Pedidos Delivery
  | 'counter'         // Pedidos Balcão
  | 'dine_in'         // Pedidos Garçom/Mesa
  | 'kitchen'         // Produção da Cozinha
  | 'pre_bill'        // Pré-conta
  | 'cash_open'       // Abertura de Caixa
  | 'cash_close';     // Fechamento de Caixa

export const PRINT_DESTINATIONS: {
  id: PrintDestinationType;
  label: string;
  badgeColor: string;
}[] = [
  { id: 'delivery', label: 'Pedidos Delivery', badgeColor: 'bg-blue-50 text-blue-800 border-blue-200' },
  { id: 'counter', label: 'Pedidos Balcão', badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { id: 'dine_in', label: 'Pedidos Garçom/Mesa', badgeColor: 'bg-purple-50 text-purple-800 border-purple-200' },
  { id: 'kitchen', label: 'Produção da Cozinha', badgeColor: 'bg-amber-50 text-amber-900 border-amber-200' },
  { id: 'pre_bill', label: 'Pré-conta', badgeColor: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  { id: 'cash_open', label: 'Abertura de Caixa', badgeColor: 'bg-teal-50 text-teal-800 border-teal-200' },
  { id: 'cash_close', label: 'Fechamento de Caixa', badgeColor: 'bg-rose-50 text-rose-800 border-rose-200' },
];

export interface ConfiguredPrinter {
  id: string;
  rawName: string; // Nome real da impressora no Windows
  nickname: string; // Apelido (ex: Caixa, Cozinha, Balcão, Expedição)
  paperSize: PaperSize; // 58mm, 80mm, 100mm
  destinations?: PrintDestinationType[]; // Destinos de impressão marcados
  updatedAt?: string;
}

const NICKNAME_SUGGESTIONS = ['Caixa', 'Cozinha', 'Balcão', 'Expedição'] as const;
const PAPER_SIZES: PaperSize[] = ['58mm', '80mm', '100mm'];

export default function PrintSettings() {
  const { profile, user } = useAuth();
  
  // Estados do QZ Tray e Impressoras Físicas Detectadas
  const [qzStatus, setQzStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [qzVersion, setQzVersion] = useState<string | null>(null);
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([]);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qzError, setQzError] = useState<string | null>(null);
  const hasAttemptedMount = useRef(false);

  // Estado de Automação de Impressão por Canal (Iniciam DESLIGADAS por padrão: false)
  const [autoPrintSettings, setAutoPrintSettings] = useState<AutoPrintSettings>({
    delivery: false,
    counter: false,
    table: false,
    kitchen: false,
  });

  // Estados de Configurações Salvas do Restaurante
  const [configuredPrinters, setConfiguredPrinters] = useState<ConfiguredPrinter[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);

  // Estados de Diagnóstico de Impressão e Reimpressão Manual Segura
  const [printHistory, setPrintHistory] = useState<PrintHistoryItem[]>([]);
  const [isReprinting, setIsReprinting] = useState(false);
  const [reprintFeedback, setReprintFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [reprintTargetItem, setReprintTargetItem] = useState<PrintHistoryItem | null>(null);
  const [isReprintModalOpen, setIsReprintModalOpen] = useState(false);

  const operatorName = profile?.name || profile?.displayName || user?.displayName || user?.email || 'Operador';

  const reloadPrintHistory = useCallback(() => {
    const list = getPrintHistory();
    setPrintHistory(list);
  }, []);

  useEffect(() => {
    reloadPrintHistory();
    const handleHistoryEvent = () => {
      reloadPrintHistory();
    };
    window.addEventListener('qfomeai:print-history-updated', handleHistoryEvent);
    return () => {
      window.removeEventListener('qfomeai:print-history-updated', handleHistoryEvent);
    };
  }, [reloadPrintHistory]);

  const handleOpenReprintModal = (item?: PrintHistoryItem | null) => {
    if (item && item.lastHtml) {
      setReprintTargetItem(item);
      setIsReprintModalOpen(true);
      return;
    }
    // Se não passou item específico, seleciona o último documento que possua layout
    const lastWithHtml = printHistory.find(h => h.lastHtml && h.lastHtml.trim().length > 0);
    if (lastWithHtml) {
      setReprintTargetItem(lastWithHtml);
      setIsReprintModalOpen(true);
    } else {
      setReprintFeedback({
        type: 'error',
        message: 'Nenhum cupom anterior com layout disponível para reimpressão.'
      });
      setTimeout(() => setReprintFeedback(null), 5000);
    }
  };

  const handleConfirmReprint = async (reason: string, operator: string) => {
    if (!reprintTargetItem || isReprinting) return;
    setIsReprinting(true);
    setReprintFeedback(null);
    try {
      const res = await executeReprintJob({
        historyItem: reprintTargetItem,
        reason,
        reprintedBy: operator || operatorName
      });
      setReprintFeedback({
        type: res.success ? 'success' : 'error',
        message: res.message
      });
      setIsReprintModalOpen(false);
      setReprintTargetItem(null);
      reloadPrintHistory();
      setTimeout(() => {
        setReprintFeedback(null);
      }, 6000);
    } catch (err: any) {
      setReprintFeedback({
        type: 'error',
        message: `Falha ao reimprimir: ${err?.message || 'Erro desconhecido'}`
      });
    } finally {
      setIsReprinting(false);
    }
  };

  // Estados para Adição/Edição de Impressora
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editPaperSize, setEditPaperSize] = useState<PaperSize>('80mm');
  const [editDestinations, setEditDestinations] = useState<PrintDestinationType[]>([]);

  // Estado para formulário de configuração de uma impressora detectada
  const [configuringRawName, setConfiguringRawName] = useState<string | null>(null);
  const [newNickname, setNewNickname] = useState('');
  const [newPaperSize, setNewPaperSize] = useState<PaperSize>('80mm');
  const [newDestinations, setNewDestinations] = useState<PrintDestinationType[]>([]);

  // Estados de Estações de Impressão (Roteamento de Produção)
  const [printStations, setPrintStations] = useState<PrintStation[]>([]);
  const [categories, setCategories] = useState<{ id: string; nome: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [isAddingStation, setIsAddingStation] = useState(false);
  const [editingStationId, setEditingStationId] = useState<string | null>(null);

  // Form de Estação
  const [formStationName, setFormStationName] = useState('');
  const [formStationPrinterId, setFormStationPrinterId] = useState('');
  const [formStationCategoryIds, setFormStationCategoryIds] = useState<string[]>([]);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  const STATION_NAME_PRESETS = ['Cozinha', 'Bar', 'Caixa', 'Expedição', 'Pizzaria', 'Churrasqueira'] as const;

  /**
   * Conecta ao QZ Tray e lista as impressoras instaladas no sistema operacional
   */
  const connectAndFetchPrinters = useCallback(async (isUserInitiated = false) => {
    if (isUserInitiated) {
      setIsRefreshing(true);
    } else {
      setQzStatus('checking');
    }
    setQzError(null);

    try {
      const isActive = typeof qz.websocket?.isActive === 'function' && qz.websocket.isActive();
      if (!isActive) {
        await qz.websocket.connect({
          retries: 0,
          delay: 0,
        });
      }

      if (qz.version) {
        setQzVersion(qz.version);
      }

      const printersResult = await qz.printers.find();
      let printerList: string[] = [];
      if (Array.isArray(printersResult)) {
        printerList = printersResult;
      } else if (typeof printersResult === 'string' && printersResult.trim()) {
        printerList = [printersResult];
      }

      try {
        const def = await qz.printers.getDefault();
        if (def && typeof def === 'string') {
          setDefaultPrinter(def);
        }
      } catch {
        // Padrão opcional
      }

      setDetectedPrinters(printerList);
      setQzStatus('connected');
    } catch (err: any) {
      console.warn('[Central de Impressão] Não foi possível conectar ao QZ Tray:', err);
      setQzStatus('disconnected');
      setDetectedPrinters([]);
      setDefaultPrinter(null);
      
      const errMsg = err?.message || '';
      if (errMsg.includes('WebSocket not supported')) {
        setQzError('Seu navegador não suporta WebSockets locais.');
      } else if (errMsg.includes('Connection refused') || errMsg.includes('Unable to establish') || errMsg.includes('Closed without status code')) {
        setQzError('O aplicativo QZ Tray não está em execução neste computador.');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Detecção automática na montagem do componente
  useEffect(() => {
    if (!hasAttemptedMount.current) {
      hasAttemptedMount.current = true;
      connectAndFetchPrinters(false);
    }

    if (qz.websocket && typeof qz.websocket.setClosedCallbacks === 'function') {
      qz.websocket.setClosedCallbacks(() => {
        setQzStatus('disconnected');
      });
    }

    if (qz.websocket && typeof qz.websocket.setErrorCallbacks === 'function') {
      qz.websocket.setErrorCallbacks((err: any) => {
        console.warn('[QZ Tray WebSocket Error]', err);
      });
    }
  }, [connectAndFetchPrinters]);

  // Carregar impressoras e estações de impressão configuradas salvas no Firestore para este restaurante
  useEffect(() => {
    const fetchSettings = async () => {
      if (!profile?.restaurantId) return;
      setLoadingConfig(true);
      try {
        const docRef = doc(db, 'restaurants', profile.restaurantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data.configuredPrinters)) {
            setConfiguredPrinters(data.configuredPrinters);
          } else {
            setConfiguredPrinters([]);
          }

          if (Array.isArray(data.printStations)) {
            setPrintStations(data.printStations);
          } else {
            setPrintStations([]);
          }

          // Carregar configurações de automação de impressão (por padrão iniciam DESLIGADAS)
          if (data.autoPrintSettings) {
            setAutoPrintSettings({
              delivery: Boolean(data.autoPrintSettings.delivery ?? false),
              counter: Boolean(data.autoPrintSettings.counter ?? false),
              table: Boolean(data.autoPrintSettings.table ?? data.autoPrintSettings.dine_in ?? false),
              kitchen: Boolean(data.autoPrintSettings.kitchen ?? false),
            });
          } else {
            setAutoPrintSettings({
              delivery: Boolean(data.autoPrintDelivery ?? false),
              counter: Boolean(data.autoPrintCounter ?? data.autoPrintBalcao ?? false),
              table: Boolean(data.autoPrintTable ?? data.autoPrintMesa ?? false),
              kitchen: Boolean(data.autoPrintKitchen ?? data.kitchenAutoPrint ?? false),
            });
          }
        }
      } catch (error) {
        console.error('Erro ao carregar configurações de impressoras do restaurante:', error);
      } finally {
        setLoadingConfig(false);
      }
    };
    fetchSettings();
  }, [profile?.restaurantId]);

  /**
   * Alterna a chave ligar/desligar de automação de impressão por canal
   */
  const handleToggleAutoPrint = async (key: keyof AutoPrintSettings) => {
    if (!profile?.restaurantId) {
      setStatusMessage({ type: 'error', message: 'Restaurante não identificado. Faça login novamente.' });
      return;
    }
    const newSettings = {
      ...autoPrintSettings,
      [key]: !autoPrintSettings[key],
    };
    setAutoPrintSettings(newSettings);

    try {
      const docRef = doc(db, 'restaurants', profile.restaurantId);
      await updateDoc(docRef, {
        autoPrintSettings: newSettings,
        autoPrintDelivery: newSettings.delivery,
        autoPrintCounter: newSettings.counter,
        autoPrintTable: newSettings.table,
        autoPrintKitchen: newSettings.kitchen,
        kitchenAutoPrint: newSettings.kitchen,
        updatedAt: new Date().toISOString()
      });
      setStatusMessage({
        type: 'success',
        message: `Automação de impressão atualizada: ${newSettings[key] ? 'AUTOMÁTICA' : 'MANUAL'}`
      });
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      console.error('Erro ao atualizar automação de impressão:', err);
      setAutoPrintSettings(autoPrintSettings); // Reverte estado local se falhar
      setStatusMessage({
        type: 'error',
        message: 'Erro ao salvar configuração no servidor.'
      });
    }
  };

  /**
   * Identifica o nome da impressora responsável para um destino/canal específico
   */
  const getResponsiblePrinter = (destId: PrintDestinationType): string => {
    const matching = configuredPrinters.filter(p => p.destinations && p.destinations.includes(destId));
    if (matching.length > 0) {
      return matching.map(p => p.nickname || p.rawName).join(', ');
    }
    if (destId === 'kitchen' && printStations.length > 0) {
      const stationPrinters = Array.from(new Set(printStations.map(s => s.printerNickname || s.printerRawName))).filter(Boolean);
      if (stationPrinters.length > 0) {
        return stationPrinters.join(', ');
      }
    }
    if (configuredPrinters.length === 1) {
      return `${configuredPrinters[0].nickname || configuredPrinters[0].rawName} (Geral)`;
    }
    if (defaultPrinter) {
      return `${defaultPrinter} (Padrão OS)`;
    }
    return 'Navegador / Padrão do Sistema';
  };

  // Carregar categorias de produtos do restaurante
  useEffect(() => {
    const fetchCategories = async () => {
      if (!profile?.restaurantId) return;
      setLoadingCategories(true);
      try {
        const q = query(collection(db, 'restaurants', profile.restaurantId, 'categories'));
        const snap = await getDocs(q);
        let catList = snap.docs.map(d => ({
          id: d.id,
          nome: d.data().nome || d.data().name || d.data().title || d.id
        }));

        if (catList.length === 0) {
          try {
            const globalSnap = await getDocs(collection(db, 'categories'));
            catList = globalSnap.docs.map(d => ({
              id: d.id,
              nome: d.data().nome || d.data().name || d.data().title || d.id
            }));
          } catch (e) {
            // Coleção raiz opcional
          }
        }

        setCategories(catList);
      } catch (err) {
        console.warn('Erro ao carregar categorias do restaurante:', err);
      } finally {
        setLoadingCategories(false);
      }
    };
    fetchCategories();
  }, [profile?.restaurantId]);

  /**
   * Salva a lista de estações de impressão no Firestore do restaurante
   */
  const persistStationsConfig = async (newList: PrintStation[], successText: string) => {
    if (!profile?.restaurantId) {
      setStatusMessage({ type: 'error', message: 'Restaurante não identificado. Faça login novamente.' });
      return;
    }
    setSavingConfig(true);
    setStatusMessage(null);
    try {
      const docRef = doc(db, 'restaurants', profile.restaurantId);
      await updateDoc(docRef, {
        printStations: newList,
        updatedAt: new Date().toISOString()
      });
      setPrintStations(newList);
      setStatusMessage({ type: 'success', message: successText });
      setTimeout(() => {
        setStatusMessage(null);
      }, 4000);
    } catch (error) {
      console.error('Erro ao salvar estações de impressão no Firestore:', error);
      setStatusMessage({ type: 'error', message: 'Erro ao salvar as estações de impressão no servidor.' });
    } finally {
      setSavingConfig(false);
    }
  };

  /**
   * Handlers para criação e edição de Estações de Impressão
   */
  const handleOpenAddStation = () => {
    setIsAddingStation(true);
    setEditingStationId(null);
    setFormStationName('Cozinha');
    setFormStationPrinterId(configuredPrinters[0]?.id || configuredPrinters[0]?.rawName || '');
    setFormStationCategoryIds([]);
    setCategorySearchQuery('');
  };

  const handleStartEditStation = (station: PrintStation) => {
    setIsAddingStation(false);
    setEditingStationId(station.id);
    setFormStationName(station.name);
    setFormStationPrinterId(station.printerId);
    setFormStationCategoryIds(Array.isArray(station.categoryIds) ? station.categoryIds : []);
    setCategorySearchQuery('');
  };

  const handleCancelStationForm = () => {
    setIsAddingStation(false);
    setEditingStationId(null);
    setFormStationName('');
    setFormStationPrinterId('');
    setFormStationCategoryIds([]);
    setCategorySearchQuery('');
  };

  const handleToggleCategoryInStation = (catId: string) => {
    setFormStationCategoryIds(prev => {
      if (prev.includes(catId)) {
        return prev.filter(id => id !== catId);
      } else {
        return [...prev, catId];
      }
    });
  };

  const handleSelectAllCategories = () => {
    setFormStationCategoryIds(categories.map(c => c.id));
  };

  const handleClearAllCategories = () => {
    setFormStationCategoryIds([]);
  };

  const handleSaveStation = async () => {
    const trimmedName = formStationName.trim();
    if (!trimmedName) {
      setStatusMessage({ type: 'error', message: 'Informe o nome da estação de impressão (ex: Cozinha, Bar, Caixa, Expedição).' });
      return;
    }

    if (!formStationPrinterId) {
      setStatusMessage({ type: 'error', message: 'Selecione uma impressora configurada para esta estação.' });
      return;
    }

    if (formStationCategoryIds.length === 0) {
      setStatusMessage({ type: 'error', message: 'Selecione ao menos 1 categoria de produtos para esta estação.' });
      return;
    }

    const selectedPrinter = configuredPrinters.find(p => p.id === formStationPrinterId || p.rawName === formStationPrinterId);
    const selectedCategoryNames = formStationCategoryIds.map(catId => {
      const cat = categories.find(c => c.id === catId);
      return cat ? cat.nome : catId;
    });

    const stationData: PrintStation = {
      id: editingStationId || `station_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: trimmedName,
      printerId: formStationPrinterId,
      printerNickname: selectedPrinter?.nickname || 'Impressora',
      printerRawName: selectedPrinter?.rawName || formStationPrinterId,
      categoryIds: formStationCategoryIds,
      categoryNames: selectedCategoryNames,
      updatedAt: new Date().toISOString()
    };

    let updatedList: PrintStation[];
    if (editingStationId) {
      updatedList = printStations.map(s => s.id === editingStationId ? stationData : s);
    } else {
      updatedList = [...printStations, stationData];
    }

    await persistStationsConfig(
      updatedList, 
      editingStationId ? `Estação "${trimmedName}" atualizada com sucesso!` : `Estação "${trimmedName}" criada com sucesso!`
    );
    handleCancelStationForm();
  };

  const handleDeleteStation = async (station: PrintStation) => {
    const confirmDelete = window.confirm(`Deseja realmente remover a estação "${station.name}"?`);
    if (!confirmDelete) return;

    const updatedList = printStations.filter(s => s.id !== station.id);
    await persistStationsConfig(updatedList, `Estação "${station.name}" removida.`);
  };

  /**
   * Salva a lista de impressoras configuradas no Firestore do restaurante
   */
  const persistPrintersConfig = async (newList: ConfiguredPrinter[], successText: string) => {
    if (!profile?.restaurantId) {
      setStatusMessage({ type: 'error', message: 'Restaurante não identificado. Faça login novamente.' });
      return;
    }
    setSavingConfig(true);
    setStatusMessage(null);
    try {
      const docRef = doc(db, 'restaurants', profile.restaurantId);
      await updateDoc(docRef, {
        configuredPrinters: newList,
        updatedAt: new Date().toISOString()
      });
      setConfiguredPrinters(newList);
      setStatusMessage({ type: 'success', message: successText });
      setTimeout(() => {
        setStatusMessage(null);
      }, 4000);
    } catch (error) {
      console.error('Erro ao salvar configuração de impressoras no Firestore:', error);
      setStatusMessage({ type: 'error', message: 'Erro ao salvar as configurações no servidor.' });
    } finally {
      setSavingConfig(false);
    }
  };

  /**
   * Sugere destinos recomendados de acordo com o apelido
   */
  const getSuggestedDestinations = (nickname: string): PrintDestinationType[] => {
    const lower = nickname.toLowerCase();
    if (lower.includes('cozinha')) {
      return ['kitchen', 'dine_in'];
    }
    if (lower.includes('caixa')) {
      return ['delivery', 'counter', 'pre_bill', 'cash_open', 'cash_close'];
    }
    if (lower.includes('balcão') || lower.includes('balcao')) {
      return ['counter', 'pre_bill'];
    }
    if (lower.includes('expedição') || lower.includes('expedicao')) {
      return ['delivery'];
    }
    return ['delivery', 'counter'];
  };

  /**
   * Iniciar configuração de uma nova impressora detectada
   */
  const handleStartConfiguring = (rawName: string) => {
    setConfiguringRawName(rawName);
    // Sugere o próximo apelido ainda não utilizado
    const usedNicknames = configuredPrinters.map(p => p.nickname.toLowerCase());
    const firstAvailable = NICKNAME_SUGGESTIONS.find(s => !usedNicknames.includes(s.toLowerCase())) || 'Caixa';
    setNewNickname(firstAvailable);
    setNewPaperSize('80mm');
    setNewDestinations(getSuggestedDestinations(firstAvailable));
  };

  /**
   * Salvar nova configuração de impressora
   */
  const handleSaveNewPrinter = async () => {
    if (!configuringRawName) return;
    const trimmedNickname = newNickname.trim();
    if (!trimmedNickname) {
      setStatusMessage({ type: 'error', message: 'Informe um apelido para a impressora (ex: Caixa, Cozinha).' });
      return;
    }

    // Criar novo objeto mantendo o nome real intacto
    const newEntry: ConfiguredPrinter = {
      id: `${configuringRawName}-${Date.now()}`,
      rawName: configuringRawName,
      nickname: trimmedNickname,
      paperSize: newPaperSize,
      destinations: newDestinations,
      updatedAt: new Date().toISOString()
    };

    // Se já existir uma configuração para este rawName, atualiza ou adiciona
    const existingIndex = configuredPrinters.findIndex(p => p.rawName.toLowerCase() === configuringRawName.toLowerCase());
    let updatedList: ConfiguredPrinter[];
    if (existingIndex >= 0) {
      updatedList = [...configuredPrinters];
      updatedList[existingIndex] = {
        ...updatedList[existingIndex],
        nickname: trimmedNickname,
        paperSize: newPaperSize,
        destinations: newDestinations,
        updatedAt: new Date().toISOString()
      };
    } else {
      updatedList = [...configuredPrinters, newEntry];
    }

    await persistPrintersConfig(updatedList, `Impressora "${trimmedNickname}" configurada com sucesso!`);
    setConfiguringRawName(null);
    setNewNickname('');
    setNewDestinations([]);
  };

  /**
   * Iniciar edição de uma impressora já salva
   */
  const handleStartEditing = (printer: ConfiguredPrinter) => {
    setEditingPrinterId(printer.id);
    setEditNickname(printer.nickname);
    setEditPaperSize(printer.paperSize);
    setEditDestinations(printer.destinations || []);
  };

  /**
   * Salvar edição de apelido, papel e destinos de uma impressora configurada
   */
  const handleSaveEdit = async (printerId: string) => {
    const trimmedNickname = editNickname.trim();
    if (!trimmedNickname) {
      setStatusMessage({ type: 'error', message: 'O apelido não pode ficar em branco.' });
      return;
    }

    const updatedList = configuredPrinters.map(p => {
      if (p.id === printerId) {
        return {
          ...p,
          nickname: trimmedNickname,
          paperSize: editPaperSize,
          destinations: editDestinations,
          updatedAt: new Date().toISOString()
        };
      }
      return p;
    });

    await persistPrintersConfig(updatedList, `Configuração de "${trimmedNickname}" atualizada com sucesso!`);
    setEditingPrinterId(null);
  };

  /**
   * Remover configuração de uma impressora do QFomeAI
   */
  const handleRemovePrinter = async (printer: ConfiguredPrinter) => {
    if (!window.confirm(`Deseja remover a configuração da impressora "${printer.nickname}" (${printer.rawName}) do QFomeAI?`)) {
      return;
    }
    const updatedList = configuredPrinters.filter(p => p.id !== printer.id);
    await persistPrintersConfig(updatedList, `Configuração da impressora "${printer.nickname}" removida.`);
  };

  /**
   * Envia uma única impressão de teste para a impressora escolhida via QZ Tray
   */
  const handleTestPrint = async (printer: ConfiguredPrinter) => {
    if (testingPrinterId) return; // Garante que cada clique gere EXATAMENTE 1 impressão
    setTestingPrinterId(printer.id);
    setStatusMessage(null);

    try {
      // 1. Garantir que o WebSocket do QZ Tray esteja ativo
      const isActive = typeof qz.websocket?.isActive === 'function' && qz.websocket.isActive();
      if (!isActive) {
        await qz.websocket.connect({ retries: 0, delay: 0 });
        setQzStatus('connected');
      }

      // 2. Configurar o tamanho de papel de acordo com a bobina configurada (58mm, 80mm, 100mm)
      const paperWidthMm = printer.paperSize === '58mm' ? 58 : printer.paperSize === '100mm' ? 100 : 80;
      const config = qz.configs.create(printer.rawName, {
        size: { width: paperWidthMm },
        units: 'mm',
        margins: 0,
        scaleContent: true,
        rasterize: false,
        copies: 1
      });

      // 3. Montar o cupom simples do teste conforme solicitado:
      // QFomeAI
      // Teste de impressão
      // Impressora: [apelido]
      // Nome real: [nome da impressora]
      // Papel: [tamanho]
      // Data e hora do teste
      const maxPixelWidth = printer.paperSize === '58mm' ? 220 : printer.paperSize === '100mm' ? 380 : 280;
      const fontSize = printer.paperSize === '58mm' ? '12px' : printer.paperSize === '100mm' ? '14px' : '13px';

      const now = new Date();
      const formattedDate = now.toLocaleDateString('pt-BR');
      const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dataHoraTexto = `${formattedDate} às ${formattedTime}`;

      const printHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { margin: 0; size: auto; }
    body {
      font-family: 'Courier New', Courier, monospace, sans-serif;
      margin: 0;
      padding: 6px 4px 18px 4px;
      color: #000;
      background: #fff;
      font-size: ${fontSize};
      line-height: 1.35;
      width: 100%;
      max-width: ${maxPixelWidth}px;
      box-sizing: border-box;
    }
    .center { text-align: center; }
    .title { font-size: 1.2em; font-weight: bold; margin-bottom: 2px; }
    .subtitle { font-size: 1em; margin-bottom: 6px; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .row { margin: 4px 0; word-break: break-word; }
    .bold { font-weight: bold; }
    .footer { font-size: 0.85em; text-align: center; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="center title">QFomeAI</div>
  <div class="center subtitle">Teste de impressão</div>
  
  <div class="divider"></div>
  
  <div class="row"><span class="bold">Impressora:</span> ${printer.nickname}</div>
  <div class="row"><span class="bold">Nome real:</span> ${printer.rawName}</div>
  <div class="row"><span class="bold">Papel:</span> ${printer.paperSize}</div>
  <div class="row"><span class="bold">Data e hora do teste:</span> ${dataHoraTexto}</div>
  
  <div class="divider"></div>
  
  <div class="footer">*** Fim do Teste ***</div>
</body>
</html>
      `.trim();

      const printData = [
        {
          type: 'pixel',
          format: 'html',
          flavor: 'plain',
          data: printHtml
        }
      ];

      // 4. Enviar EXATAMENTE uma impressão para a impressora escolhida
      await qz.print(config, printData);

      recordPrintHistoryItem({
        timestamp: Date.now(),
        printerName: printer.nickname || printer.rawName,
        rawPrinterName: printer.rawName,
        documentType: 'Teste de Impressão',
        destination: 'test',
        status: 'success',
        method: 'qz',
        paperSize: printer.paperSize,
        lastHtml: printHtml
      });

      setStatusMessage({
        type: 'success',
        message: 'Impressão enviada com sucesso.'
      });
      setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
    } catch (err: any) {
      console.error('[Teste de Impressão] Erro ao enviar para impressora:', err);
      const rawMsg = err?.message || (typeof err === 'string' ? err : 'Falha na comunicação com o QZ Tray.');
      let friendly = rawMsg;
      if (rawMsg.includes('Connection refused') || rawMsg.includes('Unable to establish') || rawMsg.includes('Closed without status code')) {
        friendly = 'O QZ Tray não está aberto neste computador. Inicie o QZ Tray e tente novamente.';
        setQzStatus('disconnected');
      } else if (rawMsg.includes('Printer not found') || rawMsg.includes('Cannot find printer')) {
        friendly = `A impressora "${printer.rawName}" não foi localizada no Windows. Verifique se o cabo está conectado e o driver instalado.`;
      }

      recordPrintHistoryItem({
        timestamp: Date.now(),
        printerName: printer.nickname || printer.rawName,
        rawPrinterName: printer.rawName,
        documentType: 'Teste de Impressão',
        destination: 'test',
        status: 'error',
        errorMessage: friendly,
        method: 'qz',
        paperSize: printer.paperSize,
        lastHtml: ''
      });

      setStatusMessage({
        type: 'error',
        message: `Erro ao enviar teste para "${printer.nickname}": ${friendly}`
      });
    } finally {
      setTestingPrinterId(null);
    }
  };

  /**
   * Verifica se o nome real da impressora está atualmente detectado no computador
   */
  const isPrinterDetected = (rawName: string) => {
    if (qzStatus !== 'connected') return false;
    return detectedPrinters.some(p => p.toLowerCase() === rawName.toLowerCase());
  };

  return (
    <div className="space-y-6 w-full font-sans">
      {/* Cabeçalho da Central de Impressão */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-stone-800">Central de Impressão</h2>
              <p className="text-stone-500 text-xs sm:text-sm">
                Gerencie as impressoras térmicas configuradas para o seu restaurante.
              </p>
            </div>
          </div>
        </div>

        {/* Badge de Status do QZ Tray e Botão de Atualizar */}
        <div className="flex items-center flex-wrap gap-2.5">
          {qzStatus === 'checking' && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm font-bold animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
              <span>Detectando QZ Tray...</span>
            </div>
          )}

          {qzStatus === 'connected' && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold shadow-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>🟢 QZ Tray Ativo</span>
              {qzVersion && <span className="text-[11px] font-medium text-emerald-600">v{qzVersion}</span>}
            </div>
          )}

          {qzStatus === 'disconnected' && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-bold shadow-xs">
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              <span>🔴 QZ Tray Não Conectado</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => connectAndFetchPrinters(true)}
            disabled={isRefreshing || qzStatus === 'checking'}
            className="min-h-[44px] px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            title="Sincronizar e atualizar lista de impressoras detectadas no computador"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar impressoras</span>
          </button>
        </div>
      </div>

      {/* Mensagem de Feedback de Salvamento/Operação */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 border text-sm font-semibold transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.message}</span>
        </div>
      )}

      {/* SEÇÃO: DIAGNÓSTICO DE IMPRESSÃO */}
      {(() => {
        const todayPrintsCount = printHistory.filter((item) => {
          try {
            const itemDate = new Date(item.timestamp);
            const today = new Date();
            return (
              itemDate.getDate() === today.getDate() &&
              itemDate.getMonth() === today.getMonth() &&
              itemDate.getFullYear() === today.getFullYear() &&
              item.status === 'success'
            );
          } catch {
            return false;
          }
        }).length;

        const lastPrintJob = printHistory.length > 0 ? printHistory[0] : null;
        const lastPrintError = printHistory.find(
          (item) => item.status === 'error' || (item.errorMessage && !item.errorMessage.includes('QZ Tray desconectado'))
        );
        const canReprint = printHistory.some((item) => item.lastHtml && item.lastHtml.trim().length > 0);
        const last20History = printHistory.slice(0, 20);

        return (
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
            {/* Cabeçalho do Diagnóstico */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-800 flex items-center justify-center border border-stone-200 shrink-0">
                  <Activity className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-stone-800 flex items-center gap-2">
                    <span>Diagnóstico de Impressão</span>
                    <span className="text-xs bg-stone-100 text-stone-700 px-2.5 py-0.5 rounded-full font-bold">
                      Tempo Real
                    </span>
                  </h3>
                  <p className="text-stone-500 text-xs sm:text-sm">
                    Monitoramento de conectividade, status dos dispositivos e histórico de impressões.
                  </p>
                </div>
              </div>

              {/* Botão Reimprimir Último Cupom */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenReprintModal()}
                  disabled={!canReprint || isReprinting}
                  className="min-h-[40px] px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-bold rounded-2xl transition-all shadow-sm flex items-center gap-2 cursor-pointer shrink-0"
                  title={canReprint ? 'Reimprimir o último documento emitido' : 'Nenhum cupom anterior disponível para reimpressão'}
                >
                  {isReprinting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  ) : (
                    <RotateCcw className="w-4 h-4 text-amber-400" />
                  )}
                  <span>{isReprinting ? 'Reimprimindo...' : 'Reimprimir último cupom'}</span>
                </button>
              </div>
            </div>

            {/* Feedback de Reimpressão */}
            {reprintFeedback && (
              <div
                className={`p-3.5 rounded-2xl flex items-center gap-2.5 text-xs sm:text-sm font-semibold border ${
                  reprintFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                {reprintFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{reprintFeedback.message}</span>
              </div>
            )}

            {/* Painel de Indicadores (KPIs do Diagnóstico) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* 1. Status do QZ Tray */}
              <div className="p-4 rounded-2xl border border-stone-200 bg-stone-50/70 space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Status do QZ Tray</span>
                  {qzStatus === 'connected' ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>
                  )}
                </div>
                <div>
                  <div className="text-base font-extrabold text-stone-900 flex items-center gap-1.5">
                    {qzStatus === 'connected' ? (
                      <span className="text-emerald-700">Conectado</span>
                    ) : qzStatus === 'checking' ? (
                      <span className="text-amber-700">Verificando...</span>
                    ) : (
                      <span className="text-rose-700">Desconectado</span>
                    )}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {qzStatus === 'connected'
                      ? `Comunicação local ativa ${qzVersion ? `(v${qzVersion})` : ''}`
                      : 'Modo de fallback pelo navegador'}
                  </p>
                </div>
              </div>

              {/* 2. Quantidade de Impressões do Dia */}
              <div className="p-4 rounded-2xl border border-stone-200 bg-stone-50/70 space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Impressões do Dia</span>
                  <Printer className="w-4 h-4 text-stone-400" />
                </div>
                <div>
                  <div className="text-xl font-black text-stone-900">
                    {todayPrintsCount} <span className="text-xs font-bold text-stone-500">{todayPrintsCount === 1 ? 'cupom' : 'cupons'}</span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Total impresso hoje ({new Date().toLocaleDateString('pt-BR')})
                  </p>
                </div>
              </div>

              {/* 3. Última Impressão Realizada */}
              <div className="p-4 rounded-2xl border border-stone-200 bg-stone-50/70 space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Última Impressão</span>
                  <Clock className="w-4 h-4 text-stone-400" />
                </div>
                <div>
                  {lastPrintJob ? (
                    <>
                      <div className="text-xs font-bold text-stone-900 truncate" title={`${lastPrintJob.documentType} - ${lastPrintJob.printerName}`}>
                        {lastPrintJob.documentType}
                      </div>
                      <p className="text-[11px] text-stone-500 mt-0.5 truncate">
                        {new Date(lastPrintJob.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} • {lastPrintJob.printerName}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-semibold text-stone-600">Nenhuma ainda</div>
                      <p className="text-[11px] text-stone-400 mt-0.5">Aguardando emissões</p>
                    </>
                  )}
                </div>
              </div>

              {/* 4. Último Erro de Impressão */}
              <div className="p-4 rounded-2xl border border-stone-200 bg-stone-50/70 space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Último Erro</span>
                  {lastPrintError ? (
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                  ) : (
                    <Check className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <div>
                  {lastPrintError ? (
                    <>
                      <div className="text-xs font-bold text-rose-700 truncate" title={lastPrintError.errorMessage || 'Erro no envio'}>
                        {lastPrintError.errorMessage || 'Falha na comunicação'}
                      </div>
                      <p className="text-[11px] text-rose-600/80 mt-0.5 truncate">
                        {new Date(lastPrintError.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {lastPrintError.printerName}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-bold text-emerald-700">Nenhum erro</div>
                      <p className="text-[11px] text-stone-500 mt-0.5">Sistema operando normalmente</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Status de Cada Impressora Configurada (Online / Não encontrada) */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Status das Impressoras Configuradas ({configuredPrinters.length})
                </h4>
              </div>

              {configuredPrinters.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {configuredPrinters.map((printer) => {
                    const isDetected = isPrinterDetected(printer.rawName);
                    return (
                      <div
                        key={`diag-${printer.id}`}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-2 transition-all ${
                          isDetected
                            ? 'bg-emerald-50/30 border-emerald-200'
                            : 'bg-amber-50/30 border-amber-200'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-stone-900 truncate">
                              {printer.nickname}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-600 font-semibold rounded">
                              {printer.paperSize}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500 font-mono truncate max-w-[200px]" title={printer.rawName}>
                            {printer.rawName}
                          </p>
                        </div>

                        <div className="shrink-0">
                          {isDetected ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-extrabold rounded-xl border border-emerald-200">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              <span>Online</span>
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-900 text-xs font-bold rounded-xl border border-amber-200"
                              title="Esta impressora não foi localizada no Windows via QZ Tray."
                            >
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <span>Não encontrada</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-center text-xs text-stone-500">
                  Nenhuma impressora configurada ainda. Configure os dispositivos abaixo.
                </div>
              )}
            </div>

            {/* Histórico das Últimas 20 Impressões */}
            <div className="space-y-3 pt-3 border-t border-stone-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-stone-500" />
                  <h4 className="text-xs sm:text-sm font-bold text-stone-800 uppercase tracking-wider">
                    Histórico das Últimas 20 Impressões
                  </h4>
                </div>
                {last20History.length > 0 && (
                  <span className="text-xs text-stone-400 font-medium">
                    Mostrando {last20History.length} registros
                  </span>
                )}
              </div>

              {last20History.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-600 font-bold">
                        <th className="py-2.5 px-3.5 whitespace-nowrap">Data / Hora</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap">Tipo do Documento</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap">Impressora</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap text-center">Status</th>
                        <th className="py-2.5 px-3.5 whitespace-nowrap text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {last20History.map((item) => {
                        const isSuccess = item.status === 'success';
                        const dateFormatted = new Date(item.timestamp).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        });

                        return (
                          <tr key={item.id} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-2.5 px-3.5 text-stone-700 font-medium whitespace-nowrap font-mono text-[11px]">
                              {dateFormatted}
                            </td>
                            <td className="py-2.5 px-3.5 font-bold text-stone-800 whitespace-nowrap">
                              <div className="flex flex-col gap-1 items-start">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-stone-800 text-[11px]">
                                    {item.documentType}
                                  </span>
                                  {item.isReprint && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-bold">
                                      <RotateCcw className="w-2.5 h-2.5" />
                                      <span>Reimpressão</span>
                                    </span>
                                  )}
                                  {item.documentId && (
                                    <span className="text-[10px] text-stone-400 font-mono font-normal">
                                      #{item.documentId.replace(/^(order_|tab_|kitchen_)/, '')}
                                    </span>
                                  )}
                                </div>
                                {item.reprintReason && (
                                  <div className="text-[10px] text-amber-800 font-normal">
                                    <span className="font-semibold">Motivo:</span> {item.reprintReason}
                                    {item.reprintedBy && (
                                      <span className="text-stone-500 ml-1.5">
                                        • Por: {item.reprintedBy}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3.5 text-stone-700 whitespace-nowrap">
                              <span className="font-semibold">{item.printerName}</span>
                              {item.method === 'browser' && (
                                <span className="ml-1 text-[10px] text-stone-400 font-normal">(Navegador)</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                              {isSuccess ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-lg text-[11px]">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Sucesso</span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 border border-rose-200 text-rose-800 font-bold rounded-lg text-[11px]"
                                  title={item.errorMessage || 'Erro no envio'}
                                >
                                  <XCircle className="w-3 h-3 text-rose-600" />
                                  <span>Erro</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              {item.lastHtml ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReprintModal(item)}
                                  disabled={isReprinting}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-[11px] font-bold border border-stone-300 transition-colors cursor-pointer disabled:opacity-50"
                                  title="Solicitar reimpressão deste documento com auditoria"
                                >
                                  <RotateCcw className="w-3 h-3 text-stone-600" />
                                  <span>Reimprimir</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-stone-300">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-center space-y-1">
                  <Printer className="w-6 h-6 text-stone-400 mx-auto" />
                  <p className="text-xs font-bold text-stone-700">Nenhuma impressão registrada ainda</p>
                  <p className="text-[11px] text-stone-500">
                    As impressões de pedidos, cozinha, pré-conta, caixa e testes aparecerão aqui em tempo real.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* SEÇÃO: AUTOMAÇÃO DE IMPRESSÃO */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center border border-amber-200 shrink-0">
              <Zap className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-stone-800 flex items-center gap-2">
                <span>Automação de Impressão</span>
                <span className="text-xs bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full font-bold">
                  Ligar / Desligar por Canal
                </span>
              </h3>
              <p className="text-stone-500 text-xs sm:text-sm">
                Configure quais canais possuem disparo automático de cupons térmicos e fichas de produção.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            {
              key: 'delivery' as const,
              destId: 'delivery' as const,
              title: 'Novos pedidos Delivery',
              description: 'Impressão automática dos pedidos recebidos via Delivery.',
              icon: ShoppingBag,
            },
            {
              key: 'counter' as const,
              destId: 'counter' as const,
              title: 'Novos pedidos Balcão',
              description: 'Impressão automática dos pedidos criados no Balcão.',
              icon: Store,
            },
            {
              key: 'table' as const,
              destId: 'dine_in' as const,
              title: 'Novos pedidos Garçom/Mesa',
              description: 'Impressão automática dos pedidos de Mesas e Comandas.',
              icon: Utensils,
            },
            {
              key: 'kitchen' as const,
              destId: 'kitchen' as const,
              title: 'Produção da Cozinha',
              description: 'Impressão automática das fichas de produção da Cozinha/Bar.',
              icon: ChefHat,
            },
          ].map((item) => {
            const isAuto = autoPrintSettings[item.key];
            const printerName = getResponsiblePrinter(item.destId);
            const IconComp = item.icon;

            return (
              <div
                key={item.key}
                className={`p-4 sm:p-5 rounded-2xl border transition-all space-y-3.5 ${
                  isAuto
                    ? 'bg-emerald-50/40 border-emerald-300 shadow-2xs'
                    : 'bg-stone-50/70 border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9.5 h-9.5 rounded-xl flex items-center justify-center border shrink-0 ${
                        isAuto
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                          : 'bg-stone-200/80 border-stone-300 text-stone-600'
                      }`}
                    >
                      <IconComp className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-stone-900">{item.title}</h4>
                      <p className="text-xs text-stone-500">{item.description}</p>
                    </div>
                  </div>

                  {/* Chave Ligar/Desligar (Toggle Switch) */}
                  <button
                    type="button"
                    onClick={() => handleToggleAutoPrint(item.key)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
                      isAuto ? 'bg-emerald-600' : 'bg-stone-300'
                    }`}
                    role="switch"
                    aria-checked={isAuto}
                    title={isAuto ? 'Automação Ativa (Clique para mudar para Manual)' : 'Automação Desligada (Clique para ativar Automático)'}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isAuto ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Impressora Responsável e Status (Automático / Manual) */}
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-stone-200/80 text-xs">
                  <div className="flex items-center gap-1.5 text-stone-600 truncate max-w-[65%]">
                    <Printer className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    <span className="text-stone-500 font-medium">Impressora:</span>
                    <span className="font-bold text-stone-800 truncate" title={printerName}>
                      {printerName}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-stone-500 font-medium">Status:</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-extrabold text-[11px] inline-flex items-center gap-1.5 ${
                        isAuto
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-stone-200/80 text-stone-700 border border-stone-300'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isAuto ? 'bg-emerald-600 animate-pulse' : 'bg-stone-500'
                        }`}
                      />
                      {isAuto ? 'Automático' : 'Manual'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SEÇÃO 1: IMPRESSORAS CONFIGURADAS DO RESTAURANTE (Persistidas no Firestore) */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-stone-800 flex items-center gap-2.5">
              <span>Impressoras Configuradas no Restaurante</span>
              <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-extrabold">
                {configuredPrinters.length} {configuredPrinters.length === 1 ? 'configurada' : 'configuradas'}
              </span>
            </h3>
            <p className="text-stone-500 text-xs sm:text-sm mt-0.5">
              Impressoras salvas com apelidos operacionais e tamanho de papel configurado para este estabelecimento.
            </p>
          </div>
        </div>

        {loadingConfig ? (
          <div className="p-8 text-center bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-center gap-3 text-stone-600 font-medium">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>Carregando configurações salvas do restaurante...</span>
          </div>
        ) : configuredPrinters.length > 0 ? (
          <div className="space-y-3.5">
            {configuredPrinters.map((printer) => {
              const isDetected = isPrinterDetected(printer.rawName);
              const isEditing = editingPrinterId === printer.id;

              return (
                <div
                  key={printer.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                    isEditing
                      ? 'border-emerald-400 bg-emerald-50/30 ring-2 ring-emerald-100'
                      : isDetected
                      ? 'border-stone-200 bg-white hover:border-stone-300'
                      : 'border-amber-200 bg-amber-50/40 hover:border-amber-300'
                  }`}
                >
                  {isEditing ? (
                    /* Modo de Edição */
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                        <div className="flex items-center gap-2 text-stone-800 font-bold text-sm">
                          <Pencil className="w-4 h-4 text-emerald-600" />
                          <span>Editando Configuração da Impressora</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingPrinterId(null)}
                          className="text-stone-400 hover:text-stone-600 p-1 rounded-lg cursor-pointer"
                          title="Cancelar edição"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Nome real no Windows (apenas visualização) */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-stone-500 uppercase tracking-wide">
                            Nome Real no Windows (Fixado)
                          </label>
                          <div className="p-3 bg-stone-100 border border-stone-200 rounded-xl text-stone-700 text-sm font-semibold select-all">
                            {printer.rawName}
                          </div>
                          <p className="text-[11px] text-stone-400">
                            O nome do driver no sistema operacional não é alterado.
                          </p>
                        </div>

                        {/* Apelido no QFomeAI */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                            Apelido no QFomeAI *
                          </label>
                          <input
                            type="text"
                            value={editNickname}
                            onChange={(e) => setEditNickname(e.target.value)}
                            placeholder="Ex: Caixa, Cozinha, Balcão, Expedição"
                            className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                          />
                          {/* Sugestões rápidas de apelido */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            <span className="text-[11px] text-stone-400 font-medium">Sugestões:</span>
                            {NICKNAME_SUGGESTIONS.map((sug) => (
                              <button
                                key={sug}
                                type="button"
                                onClick={() => setEditNickname(sug)}
                                className={`text-[11px] px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                                  editNickname === sug
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-stone-100 hover:bg-stone-200 text-stone-600'
                                }`}
                              >
                                {sug}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Tamanho do Papel */}
                      <div className="space-y-1.5 pt-1">
                        <label className="text-xs font-bold text-stone-700 uppercase tracking-wide">
                          Tamanho da Bobina / Papel *
                        </label>
                        <div className="grid grid-cols-3 gap-2.5 max-w-md">
                          {PAPER_SIZES.map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => setEditPaperSize(size)}
                              className={`py-2 px-3 rounded-xl border text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                editPaperSize === size
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-400'
                                  : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                              }`}
                            >
                              <span>{size}</span>
                              {editPaperSize === size && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Destinos de Impressão (Responsabilidades da Impressora) */}
                      <div className="space-y-2 pt-2 border-t border-stone-200">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <div>
                            <label className="text-xs font-bold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">
                              <span>O que esta impressora poderá imprimir? (Destinos)</span>
                            </label>
                            <p className="text-[12px] text-stone-500">
                              Marque uma ou mais opções. O sistema enviará cada tipo de documento para as impressoras marcadas.
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              onClick={() => setEditDestinations(PRINT_DESTINATIONS.map(d => d.id))}
                              className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline cursor-pointer"
                            >
                              Marcar todos
                            </button>
                            <span className="text-stone-300">•</span>
                            <button
                              type="button"
                              onClick={() => setEditDestinations([])}
                              className="text-stone-500 hover:text-stone-700 font-bold hover:underline cursor-pointer"
                            >
                              Desmarcar todos
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                          {PRINT_DESTINATIONS.map((dest) => {
                            const isSelected = editDestinations.includes(dest.id);
                            return (
                              <button
                                key={dest.id}
                                type="button"
                                onClick={() => {
                                  setEditDestinations(prev =>
                                    prev.includes(dest.id) ? prev.filter(id => id !== dest.id) : [...prev, dest.id]
                                  );
                                }}
                                className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                  isSelected
                                    ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 ring-1 ring-emerald-400 font-bold shadow-xs'
                                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 font-medium'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                                      isSelected
                                        ? 'bg-emerald-600 border-emerald-600 text-white'
                                        : 'bg-white border-stone-300'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                  </div>
                                  <span className="text-xs sm:text-sm truncate">{dest.label}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Botões de Ação do Modo de Edição */}
                      <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-200">
                        <button
                          type="button"
                          onClick={() => setEditingPrinterId(null)}
                          className="px-4 py-2 text-stone-600 hover:text-stone-800 hover:bg-stone-100 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(printer.id)}
                          disabled={savingConfig}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          <span>Salvar Alterações</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Visualização Normal */
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                              isDetected
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-amber-50 border-amber-200 text-amber-700'
                            }`}
                          >
                            <Printer className="w-5 h-5" />
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-extrabold text-stone-900">
                                {printer.nickname}
                              </span>
                              <span className="px-2.5 py-0.5 bg-stone-100 border border-stone-200 text-stone-700 text-xs font-bold rounded-lg">
                                Bobina {printer.paperSize}
                              </span>

                              {/* Status de Presença no Computador */}
                              {isDetected ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold rounded-lg">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Disponível no PC</span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-100/80 border border-amber-300 text-amber-900 text-[11px] font-bold rounded-lg"
                                  title="Esta impressora está configurada no restaurante, mas não foi detectada no computador atual pelo QZ Tray."
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-700" />
                                  <span>Não encontrada</span>
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-stone-500">
                              <span className="font-semibold text-stone-400">Nome no Windows:</span>
                              <code className="text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded font-mono text-[11px] truncate max-w-xs sm:max-w-md" title={printer.rawName}>
                                {printer.rawName}
                              </code>
                            </div>
                          </div>
                        </div>

                        {/* Botões de Ação na Linha */}
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {/* Botão Testar impressão */}
                          <button
                            type="button"
                            onClick={() => handleTestPrint(printer)}
                            disabled={testingPrinterId === printer.id}
                            className="min-h-[38px] px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title={`Enviar impressão de teste para ${printer.nickname} (${printer.paperSize})`}
                          >
                            {testingPrinterId === printer.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                            ) : (
                              <Printer className="w-3.5 h-3.5 text-emerald-700" />
                            )}
                            <span>{testingPrinterId === printer.id ? 'Imprimindo...' : 'Testar impressão'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStartEditing(printer)}
                            disabled={savingConfig}
                            className="min-h-[38px] px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                            title="Editar apelido, papel ou destinos de impressão"
                          >
                            <Pencil className="w-3.5 h-3.5 text-stone-600" />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemovePrinter(printer)}
                            disabled={savingConfig}
                            className="min-h-[38px] px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer border border-rose-200/60"
                            title="Remover configuração do QFomeAI"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Remover</span>
                          </button>
                        </div>
                      </div>

                      {/* Destinos de Impressão Configurados */}
                      <div className="pt-2.5 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mr-1">
                            Destinos:
                          </span>
                          {printer.destinations && printer.destinations.length > 0 ? (
                            printer.destinations.map((destId) => {
                              const dest = PRINT_DESTINATIONS.find((d) => d.id === destId);
                              if (!dest) return null;
                              return (
                                <span
                                  key={destId}
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${dest.badgeColor}`}
                                >
                                  <Check className="w-3 h-3 stroke-[2.5]" />
                                  <span>{dest.label}</span>
                                </span>
                              );
                            })
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/70 font-medium">
                              <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Nenhum destino atribuído (clique em <strong>Editar</strong> para selecionar)</span>
                            </span>
                          )}
                        </div>

                        {printer.destinations && printer.destinations.length > 0 && (
                          <span className="text-[11px] text-stone-400 shrink-0">
                            {printer.destinations.length} {printer.destinations.length === 1 ? 'destino' : 'destinos'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {!isDetected && !isEditing && (
                    <div className="mt-2.5 pt-2.5 border-t border-amber-200/60 flex items-start gap-2 text-[11px] text-amber-800">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        A impressora física <strong className="font-semibold">{printer.rawName}</strong> não foi encontrada nesta máquina pelo QZ Tray. A configuração continua salva no QFomeAI e voltará a ficar disponível quando o computador com ela instalada estiver conectado.
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 space-y-2">
            <Printer className="w-8 h-8 text-stone-400 mx-auto" />
            <p className="text-sm font-bold text-stone-700">Nenhuma impressora configurada ainda</p>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Escolha uma das impressoras detectadas abaixo e clique em <strong>"+ Configurar"</strong> para definir seu apelido (Caixa, Cozinha, Balcão, etc.) e tamanho do papel.
            </p>
          </div>
        )}
      </div>

      {/* SEÇÃO: ESTAÇÕES DE IMPRESSÃO (ROTEAMENTO POR CATEGORIA) */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-stone-800 flex items-center gap-2.5">
              <Layers className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Estações de Impressão</span>
              <span className="text-xs bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full font-extrabold">
                {printStations.length} {printStations.length === 1 ? 'estação' : 'estações'}
              </span>
            </h3>
            <p className="text-stone-500 text-xs sm:text-sm mt-0.5">
              Separa automaticamente os itens do ticket de produção por categorias (ex: Cozinha, Bar, Caixa, Expedição).
            </p>
          </div>

          {!isAddingStation && !editingStationId && (
            <button
              onClick={handleOpenAddStation}
              disabled={configuredPrinters.length === 0}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-sm shrink-0 ${
                configuredPrinters.length === 0
                  ? 'bg-stone-100 text-stone-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow'
              }`}
              title={configuredPrinters.length === 0 ? 'Configure ao menos 1 impressora acima antes de criar estações' : 'Adicionar nova estação'}
            >
              <Plus className="w-4 h-4" />
              <span>Nova Estação</span>
            </button>
          )}
        </div>

        {/* Formulário de Adição / Edição de Estação */}
        {(isAddingStation || editingStationId) && (
          <div className="p-5 rounded-2xl border-2 border-indigo-500 bg-indigo-50/30 space-y-5 shadow-sm animate-fadeIn">
            <div className="flex items-center justify-between border-b border-indigo-200/80 pb-3">
              <div className="flex items-center gap-2 text-indigo-950 font-extrabold text-sm sm:text-base">
                <Layers className="w-5 h-5 text-indigo-600" />
                <span>{editingStationId ? 'Editar Estação de Impressão' : 'Nova Estação de Impressão'}</span>
              </div>
              <button
                onClick={handleCancelStationForm}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-lg hover:bg-stone-100 transition-colors"
                title="Cancelar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome da Estação */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Nome da Estação
                </label>
                <input
                  type="text"
                  value={formStationName}
                  onChange={(e) => setFormStationName(e.target.value)}
                  placeholder="Ex: Cozinha, Bar, Pizzaria, Bebidas"
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                />
                
                {/* Sugestões Rápidas */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-stone-400 font-medium">Sugestões:</span>
                  {STATION_NAME_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormStationName(preset)}
                      className={`text-[11px] px-2 py-0.5 rounded-lg border font-semibold transition ${
                        formStationName === preset
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Impressora Vinculada */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                  Impressora Configurada
                </label>
                <select
                  value={formStationPrinterId}
                  onChange={(e) => setFormStationPrinterId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-stone-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                >
                  <option value="">Selecione a impressora...</option>
                  {configuredPrinters.map((p) => {
                    const isDetected = isPrinterDetected(p.rawName);
                    return (
                      <option key={p.id} value={p.id}>
                        {p.nickname} — {p.paperSize} {isDetected ? '(Disponível no PC)' : '(Offline/Remota)'} [{p.rawName}]
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-stone-500">
                  Os itens desta estação serão enviados para esta impressora física.
                </p>
              </div>
            </div>

            {/* Seleção de Categorias */}
            <div className="space-y-2 pt-2 border-t border-indigo-200/60">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
                    Categorias de Produtos Recebidas por esta Estação
                  </label>
                  <p className="text-[11px] text-stone-500">
                    Selecione quais categorias serão impressas nesta estação quando um pedido for produzido.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllCategories}
                    className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-white px-2.5 py-1 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition"
                  >
                    Selecionar Todas
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllCategories}
                    className="text-[11px] font-bold text-stone-500 hover:text-stone-700 bg-white px-2.5 py-1 rounded-lg border border-stone-200 hover:bg-stone-50 transition"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              {/* Filtro de Busca de Categorias */}
              {categories.length > 6 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                    placeholder="Filtrar categorias por nome..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs outline-none focus:border-indigo-400"
                  />
                </div>
              )}

              {loadingCategories ? (
                <div className="p-4 text-center bg-white rounded-xl border border-stone-200 flex items-center justify-center gap-2 text-stone-500 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Carregando categorias do cardápio...</span>
                </div>
              ) : categories.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-2 bg-white rounded-xl border border-stone-200">
                  {categories
                    .filter((c) => c.nome.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                    .map((category) => {
                      const isSelected = formStationCategoryIds.includes(category.id);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => handleToggleCategoryInStation(category.id)}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs font-semibold transition ${
                            isSelected
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-bold shadow-xs'
                              : 'bg-white border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50'
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-stone-300 shrink-0" />
                          )}
                          <span className="truncate">{category.nome}</span>
                        </button>
                      );
                    })}
                </div>
              ) : (
                <div className="p-4 text-center bg-white rounded-xl border border-dashed border-stone-200 text-stone-500 text-xs">
                  Nenhuma categoria encontrada no cardápio do restaurante.
                </div>
              )}

              <div className="flex items-center justify-between text-[11px] text-stone-500 px-1">
                <span>
                  <strong>{formStationCategoryIds.length}</strong> de {categories.length} {categories.length === 1 ? 'categoria selecionada' : 'categorias selecionadas'}
                </span>
                {formStationCategoryIds.length === 0 && (
                  <span className="text-amber-600 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Selecione ao menos 1 categoria
                  </span>
                )}
              </div>
            </div>

            {/* Ações do Formulário */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-indigo-200/80">
              <button
                type="button"
                onClick={handleCancelStationForm}
                className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-stone-600 hover:bg-stone-200/60 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveStation}
                disabled={savingConfig || !formStationName.trim() || !formStationPrinterId || formStationCategoryIds.length === 0}
                className={`inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-white transition-all shadow-sm ${
                  savingConfig || !formStationName.trim() || !formStationPrinterId || formStationCategoryIds.length === 0
                    ? 'bg-stone-400 cursor-not-allowed opacity-70'
                    : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow'
                }`}
              >
                {savingConfig ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{editingStationId ? 'Salvar Alterações' : 'Criar Estação'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Lista de Estações Existentes */}
        {printStations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {printStations.map((station) => {
              const linkedPrinter = configuredPrinters.find(
                p => p.id === station.printerId || p.rawName === station.printerId
              );
              const isDetected = linkedPrinter ? isPrinterDetected(linkedPrinter.rawName) : false;
              const isEditingThis = editingStationId === station.id;

              // Seleção de ícone contextual
              const lowerName = station.name.toLowerCase();
              let StationIcon = Layers;
              let iconColor = 'text-indigo-600 bg-indigo-50 border-indigo-100';
              if (lowerName.includes('bar') || lowerName.includes('drink') || lowerName.includes('bebida')) {
                StationIcon = Wine;
                iconColor = 'text-purple-600 bg-purple-50 border-purple-100';
              } else if (lowerName.includes('cozinha') || lowerName.includes('pizza') || lowerName.includes('massa') || lowerName.includes('burger')) {
                StationIcon = ChefHat;
                iconColor = 'text-amber-700 bg-amber-50 border-amber-100';
              } else if (lowerName.includes('caixa') || lowerName.includes('balc')) {
                StationIcon = Store;
                iconColor = 'text-emerald-700 bg-emerald-50 border-emerald-100';
              }

              return (
                <div
                  key={station.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    isEditingThis
                      ? 'border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50/20'
                      : 'border-stone-200 bg-stone-50/40 hover:bg-stone-50 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-stone-200/70">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${iconColor}`}>
                        <StationIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-stone-900">{station.name}</h4>
                        <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-0.5">
                          <Printer className="w-3.5 h-3.5 text-stone-400" />
                          <span className="font-semibold text-stone-700">
                            {linkedPrinter?.nickname || station.printerNickname || station.printerId}
                          </span>
                          {linkedPrinter?.paperSize && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-stone-200/80 text-stone-700 font-bold">
                              {linkedPrinter.paperSize}
                            </span>
                          )}
                          {isDetected ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-100/70 px-1.5 py-0.2 rounded-md">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              PC
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-stone-500 bg-stone-200/60 px-1.5 py-0.2 rounded-md font-medium">
                              Remota
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEditStation(station)}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                        title="Editar Estação"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteStation(station)}
                        className="p-1.5 rounded-lg text-stone-500 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Excluir Estação"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Categorias Vinculadas */}
                  <div className="pt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span className="font-bold uppercase tracking-wider text-stone-600">Categorias recebidas:</span>
                      <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                        {station.categoryIds?.length || 0} {station.categoryIds?.length === 1 ? 'categoria' : 'categorias'}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-0.5">
                      {Array.isArray(station.categoryIds) && station.categoryIds.length > 0 ? (
                        station.categoryIds.map((catId) => {
                          const cat = categories.find(c => c.id === catId);
                          const catName = cat?.nome || (station.categoryNames && station.categoryNames[station.categoryIds.indexOf(catId)]) || catId;
                          return (
                            <span
                              key={catId}
                              className="text-[11px] font-semibold bg-white text-stone-700 px-2 py-0.5 rounded-md border border-stone-200/80 shadow-2xs"
                            >
                              {catName}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-[11px] text-amber-700 italic">Nenhuma categoria atribuída</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          !isAddingStation && (
            <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 space-y-3">
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto border border-indigo-100">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-stone-800">Nenhuma estação de impressão criada</p>
                <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                  Crie estações para separar a produção por impressora. Por exemplo, envie <strong>Hambúrgueres e Porções</strong> para a <em>Cozinha</em> e <strong>Bebidas e Drinks</strong> para o <em>Bar</em>.
                </p>
              </div>
              {configuredPrinters.length > 0 ? (
                <button
                  onClick={handleOpenAddStation}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar Primeira Estação</span>
                </button>
              ) : (
                <p className="text-[11px] text-amber-700 font-semibold bg-amber-50 inline-block px-3 py-1 rounded-lg border border-amber-200">
                  Configure ao menos 1 impressora acima para habilitar a criação de estações.
                </p>
              )}
            </div>
          )
        )}

        {/* Guia explicativo rápido do roteamento */}
        <div className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 text-xs text-stone-600 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-stone-800 text-[11px] uppercase tracking-wider">
            <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>Regras do Roteamento por Estação:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-[11px] text-stone-500 pl-1 leading-relaxed">
            <li>Ao imprimir ticket de produção, cada item é enviado somente para a impressora da sua estação correspondente.</li>
            <li>O mesmo item nunca é impresso em duplicidade na mesma estação.</li>
            <li>Itens de categorias que não possuam estação cadastrada continuam sendo impressos no fluxo geral da impressora de cozinha.</li>
          </ul>
        </div>
      </div>

      {/* SEÇÃO 2: IMPRESSORAS DETECTADAS NO COMPUTADOR VIA QZ TRAY */}
      {qzStatus === 'connected' && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-stone-800 flex items-center gap-2">
                <span>Impressoras Detectadas no Computador (Windows)</span>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-extrabold">
                  {detectedPrinters.length} {detectedPrinters.length === 1 ? 'dispositivo' : 'dispositivos'}
                </span>
              </h3>
              <p className="text-stone-500 text-xs sm:text-sm mt-0.5">
                Nomes reais lidos diretamente do Windows via QZ Tray. Clique para configurar ou alterar o apelido de cada uma.
              </p>
            </div>
          </div>

          {/* Painel aberto de configuração de uma nova impressora */}
          {configuringRawName && (
            <div className="p-5 rounded-2xl border-2 border-emerald-500 bg-emerald-50/40 space-y-4 shadow-sm animate-fadeIn">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-3">
                <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-sm sm:text-base">
                  <Tag className="w-5 h-5 text-emerald-700" />
                  <span>Configurar Impressora: {configuringRawName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setConfiguringRawName(null)}
                  className="text-stone-400 hover:text-stone-600 p-1 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nome real no Windows */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-600 uppercase tracking-wide">
                    Nome Real do Dispositivo
                  </label>
                  <div className="p-3 bg-white border border-stone-200 rounded-xl text-stone-800 text-sm font-semibold select-all">
                    {configuringRawName}
                  </div>
                  <p className="text-[11px] text-stone-400">
                    O nome real do Windows é preservado e não sofrerá modificação.
                  </p>
                </div>

                {/* Definir Apelido no QFomeAI */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-stone-800 uppercase tracking-wide">
                    Definir Apelido no QFomeAI *
                  </label>
                  <input
                    type="text"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                    placeholder="Ex: Caixa, Cozinha, Balcão, Expedição"
                    className="w-full px-3.5 py-2.5 border border-stone-300 rounded-xl text-sm font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                  />
                  {/* Sugestões rápidas de apelido */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[11px] text-stone-500 font-medium">Sugestões:</span>
                    {NICKNAME_SUGGESTIONS.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => {
                          setNewNickname(sug);
                          setNewDestinations(getSuggestedDestinations(sug));
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          newNickname === sug
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-white border border-stone-200 hover:bg-stone-100 text-stone-700'
                        }`}
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tamanho da Bobina */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-stone-800 uppercase tracking-wide">
                  Tamanho da Bobina / Papel *
                </label>
                <div className="grid grid-cols-3 gap-3 max-w-md">
                  {PAPER_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setNewPaperSize(size)}
                      className={`py-2.5 px-3 rounded-xl border-2 text-xs sm:text-sm font-bold transition-all flex items-center justify-between cursor-pointer ${
                        newPaperSize === size
                          ? 'border-emerald-600 bg-white text-emerald-800 shadow-xs'
                          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      <span>Bobina {size}</span>
                      {newPaperSize === size && <Check className="w-4 h-4 text-emerald-600" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Destinos de Impressão para a nova impressora */}
              <div className="space-y-2 pt-2 border-t border-emerald-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div>
                    <label className="text-xs font-bold text-stone-800 uppercase tracking-wide flex items-center gap-1.5">
                      <span>O que esta impressora poderá imprimir? (Destinos)</span>
                    </label>
                    <p className="text-[12px] text-stone-600">
                      Marque as funções desta impressora. Você pode marcar várias opções ou alterá-las mais tarde.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setNewDestinations(PRINT_DESTINATIONS.map(d => d.id))}
                      className="text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer"
                    >
                      Marcar todos
                    </button>
                    <span className="text-stone-300">•</span>
                    <button
                      type="button"
                      onClick={() => setNewDestinations([])}
                      className="text-stone-600 hover:text-stone-800 font-bold hover:underline cursor-pointer"
                    >
                      Desmarcar todos
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                  {PRINT_DESTINATIONS.map((dest) => {
                    const isSelected = newDestinations.includes(dest.id);
                    return (
                      <button
                        key={dest.id}
                        type="button"
                        onClick={() => {
                          setNewDestinations(prev =>
                            prev.includes(dest.id) ? prev.filter(id => id !== dest.id) : [...prev, dest.id]
                          );
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'border-emerald-600 bg-white text-emerald-950 ring-2 ring-emerald-500 font-bold shadow-xs'
                            : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                              isSelected
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-white border-stone-300'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span className="text-xs sm:text-sm truncate">{dest.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Botões do Formulário */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-emerald-200">
                <button
                  type="button"
                  onClick={() => setConfiguringRawName(null)}
                  className="px-4 py-2 text-stone-600 hover:text-stone-800 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewPrinter}
                  disabled={savingConfig}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md shadow-emerald-200 flex items-center gap-2 cursor-pointer"
                >
                  {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>Salvar Configuração no QFomeAI</span>
                </button>
              </div>
            </div>
          )}

          {detectedPrinters.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {detectedPrinters.map((printerName, index) => {
                const isDefault = defaultPrinter && defaultPrinter.toLowerCase() === printerName.toLowerCase();
                const configured = configuredPrinters.find(
                  (p) => p.rawName.toLowerCase() === printerName.toLowerCase()
                );

                return (
                  <div
                    key={`${printerName}-${index}`}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                      configured
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-stone-50/70 border-stone-200 hover:bg-stone-50 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-white border border-stone-200 text-emerald-600 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
                          <Printer className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-bold text-stone-800 truncate" title={printerName}>
                            {printerName}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-stone-500 font-medium">Dispositivo Windows</span>
                            {isDefault && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                                Padrão
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Badge de status de configuração */}
                      {configured && (
                        <span className="shrink-0 px-2.5 py-1 bg-emerald-600 text-white text-xs font-extrabold rounded-lg whitespace-nowrap shadow-2xs">
                          {configured.nickname} ({configured.paperSize})
                        </span>
                      )}
                    </div>

                    {/* Ação: Configurar ou Editar */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200/70">
                      {configured ? (
                        <button
                          type="button"
                          onClick={() => handleStartEditing(configured)}
                          className="px-3.5 py-1.5 bg-white hover:bg-stone-100 text-stone-700 text-xs font-bold rounded-xl transition-all border border-stone-200 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-stone-500" />
                          <span>Alterar apelido / papel</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartConfiguring(printerName)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Configurar no QFomeAI</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 space-y-2">
              <Printer className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="text-sm font-bold text-stone-700">Nenhuma impressora encontrada no sistema operacional</p>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                O QZ Tray está conectado, mas não detectou impressoras configuradas no Painel de Controle do computador. Verifique se os cabos e drivers estão instalados.
              </p>
            </div>
          )}
        </div>
      )}

      {/* SEÇÃO 3: INSTRUÇÕES QUANDO QZ TRAY NÃO ESTÁ CONECTADO */}
      {qzStatus === 'disconnected' && (
        <div className="space-y-6">
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-rose-200/80 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                  <XCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-stone-800">
                    QZ Tray Não Detectado neste Computador
                  </h3>
                  <p className="text-stone-600 text-xs sm:text-sm max-w-2xl leading-relaxed">
                    Para detectar e se comunicar com as impressoras térmicas físicas (EPSON, Elgin, Bematech, Daruma, etc.), o aplicativo QZ Tray precisa estar em execução no computador.
                  </p>
                  {qzError && (
                    <p className="text-xs text-rose-600 font-semibold mt-1">
                      Detalhe: {qzError}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <a
                  href="https://qz.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-2xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2 text-center"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar QZ Tray Oficial</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>

                <button
                  type="button"
                  onClick={() => connectAndFetchPrinters(true)}
                  disabled={isRefreshing}
                  className="min-h-[44px] px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs sm:text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Verificar Novamente</span>
                </button>
              </div>
            </div>
          </div>

          {/* Guia Rápido de Instalação */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
            <div className="flex items-center gap-2.5 border-b border-stone-100 pb-4">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-base font-bold text-stone-800">
                  Instruções Simples de Instalação no Windows
                </h4>
                <p className="text-stone-500 text-xs">
                  Siga os 5 passos rápidos para habilitar suas impressoras no QFomeAI:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">1</div>
                <p className="text-xs font-bold text-stone-800">Baixe o Instalador</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Baixe a versão para Windows no site oficial <span className="font-semibold text-stone-700">qz.io/download</span>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">2</div>
                <p className="text-xs font-bold text-stone-800">Execute o Instalador</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Abra o executável baixado (<span className="font-semibold text-stone-700">.exe</span>) e conclua a instalação padrão.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">3</div>
                <p className="text-xs font-bold text-stone-800">Inicie o QZ Tray</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Abra o aplicativo pelo menu Iniciar. Ele ficará minimizado com um ícone verde ao lado do relógio.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">4</div>
                <p className="text-xs font-bold text-stone-800">Permita o Acesso</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  No aviso do navegador, clique em <span className="font-semibold text-emerald-700">"Permitir"</span> (Allow) e marque para lembrar.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">5</div>
                <p className="text-xs font-bold text-stone-800">Atualizar</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Volte aqui e clique em <span className="font-semibold text-stone-800">"Atualizar impressoras"</span> para carregar os dispositivos.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
              <Smartphone className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Acessando pelo celular ou tablet?</span> As configurações salvas acima continuam salvas no seu restaurante. O QZ Tray é necessário apenas no computador físico onde as impressoras estão conectadas.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reimpressão Segura com Confirmação e Auditoria */}
      <ReprintConfirmModal
        isOpen={isReprintModalOpen}
        onClose={() => {
          if (!isReprinting) {
            setIsReprintModalOpen(false);
            setReprintTargetItem(null);
          }
        }}
        onConfirm={handleConfirmReprint}
        historyItem={reprintTargetItem}
        operatorName={operatorName}
        isProcessing={isReprinting}
      />
    </div>
  );
}
