import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatCurrency as canonicalFormatCurrency, formatTime as canonicalFormatTime, formatDateTime as canonicalFormatDateTime } from '../../lib/utils';
import { db, auth } from '../../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Table, Tab, TabItem } from '../../types/mesas';
import { tabRoundService } from '../../services/tabRoundService';
import { tabRepository } from '../../domain/tab/tabRepository';
import { useAuth } from '../../contexts/AuthContext';
import { printThermalPreConta } from '../orders/OrderThermalPrint';
import { 
  X, 
  UtensilsCrossed, 
  Users, 
  Clock, 
  User, 
  Building, 
  Plus, 
  Printer, 
  RefreshCw, 
  MoreVertical, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  CookingPot, 
  ShoppingBag, 
  Layers, 
  FileText,
  DollarSign,
  Tag,
  MessageSquare,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  ArrowRightLeft,
  GitMerge,
  CreditCard,
  Banknote,
  QrCode,
  Wallet,
  Receipt,
  Check
} from 'lucide-react';
import {
  Button,
  IconButton,
  TextInput,
  TextareaInput,
  ConfirmDialog
} from '../ui';

interface TabDetailsModalProps {
  isOpen: boolean;
  table: Table | null;
  tab: Tab | null;
  hallName?: string;
  waiterName?: string;
  canViewPrices?: boolean;
  canAddItems?: boolean;
  canCloseAccount?: boolean;
  onClose: () => void;
  onOpenCatalog: (table: Table, tab: Tab | null) => void;
  onOpenTransferTable?: (table: Table, tab: Tab) => void;
  onOpenTransferItems?: (table: Table, tab: Tab) => void;
  onOpenMergeTabs?: (table: Table, tab: Tab) => void;
  onOpenSplitTabs?: (table: Table, tab: Tab) => void;
  onSuccessClose?: () => void;
}

export interface RoundGroup {
  id: string;
  roundNumber: number;
  orderId?: string;
  sentAt?: string;
  sentBy?: string;
  origin?: string;
  status: string;
  totalCents: number;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
    status: string;
    size?: string | null;
    options?: Array<{
      groupName?: string;
      optionName: string;
      priceCents?: number;
    }>;
    observation?: string;
    cancellationReason?: string;
    cancelledAt?: string;
    cancelledBy?: any;
    cancellationRequest?: any;
    orderId?: string;
  }>;
}

export function TabDetailsModal({
  isOpen,
  table,
  tab,
  hallName = 'Salão',
  waiterName = 'Garçom',
  canViewPrices = true,
  canAddItems = true,
  canCloseAccount = true,
  onClose,
  onOpenCatalog,
  onOpenTransferTable,
  onOpenTransferItems,
  onOpenMergeTabs,
  onOpenSplitTabs,
  onSuccessClose
}: TabDetailsModalProps) {
  const { profile, isAdmin, isRestaurant } = useAuth();

  const formatCurrency = (cents: number, showCents: boolean = true) => {
    if (!canViewPrices) return '***';
    return canonicalFormatCurrency(cents, showCents);
  };

  const [liveTab, setLiveTab] = useState<Tab | null>(tab);
  const [orders, setOrders] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [showSecondaryMenu, setShowSecondaryMenu] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<string>('0 min');

  const isAuthorized = useMemo(() => {
    const roleUpper = (profile?.role || profile?.tipo_usuario || profile?.perfil || '').toUpperCase();
    if (['WAITER', 'GARCOM', 'GARÇOM'].includes(roleUpper)) {
      return false;
    }
    const isAllowedRole = [
      'ADMIN', 'ADMINISTRADOR', 'OWNER', 'PROPRIETARIO', 'PROPRIETÁRIO',
      'RESTAURANT_ADMIN', 'RESTAURANT', 'RESTAURANTE',
      'MANAGER', 'GERENTE',
      'CASHIER', 'CAIXA', 'OPERATOR', 'OPERADOR'
    ].includes(roleUpper);

    return Boolean((isAdmin || isRestaurant || isAllowedRole) && !['WAITER', 'GARCOM', 'GARÇOM'].includes(roleUpper));
  }, [isAdmin, isRestaurant, profile]);

  // Payment & Close Account Flow State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('dinheiro');
  const [paymentAmountStr, setPaymentAmountStr] = useState<string>('');
  const [receivedCashStr, setReceivedCashStr] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isRequestingBill, setIsRequestingBill] = useState<boolean>(false);

  // Item Cancellation Modal State (Prompt 4.6.1 & 4.6.2)
  const [cancellingItem, setCancellingItem] = useState<{
    orderId?: string;
    itemId: string;
    productName: string;
    quantity: number;
    totalPriceCents: number;
    cancellationRequest?: any;
  } | null>(null);

  const [approvingItem, setApprovingItem] = useState<{
    orderId?: string;
    itemId: string;
    productName: string;
    quantity: number;
    totalPriceCents: number;
    cancellationRequest?: any;
  } | null>(null);

  const [refusingItem, setRefusingItem] = useState<{
    orderId?: string;
    itemId: string;
    productName: string;
    quantity: number;
    totalPriceCents: number;
    cancellationRequest?: any;
  } | null>(null);

  const [cancellationReason, setCancellationReason] = useState<string>('');
  const [approvalNote, setApprovalNote] = useState<string>('');
  const [refusalReason, setRefusalReason] = useState<string>('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState<boolean>(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccessMsg, setCancelSuccessMsg] = useState<string | null>(null);

  const fetchRounds = useCallback(async (targetTabId: string, targetRestaurantId: string) => {
    if (!targetTabId || !targetRestaurantId) return;
    try {
      const fetchedRounds = await tabRoundService.getRounds(targetTabId, targetRestaurantId);
      setOrders(fetchedRounds);
    } catch (err) {
      console.warn('Falha ao carregar rodadas da comanda via API:', err);
    }
  }, []);

  // Real-time synchronization for Tab & Orders
  useEffect(() => {
    setLiveTab(tab);
    if (!isOpen || !tab?.id || !tab?.restaurantId) return;

    const restaurantId = tab.restaurantId;
    const tabId = tab.id;

    // 1. Initial fetch of rounds via authenticated backend endpoint
    fetchRounds(tabId, restaurantId);

    // 2. Real-time listener for the Tab Document
    const rootTabRef = doc(db, 'tabs', tabId);
    let unsubscribeNested: (() => void) | null = null;

    const unsubscribeRoot = onSnapshot(rootTabRef, (snapshot) => {
      if (snapshot.exists()) {
        setLiveTab({
          id: snapshot.id,
          ...snapshot.data()
        } as Tab);
        // Refresh rounds when tab is updated
        fetchRounds(tabId, restaurantId);
      }
    }, (err) => {
      // Fallback for nested tab collection if root listener fails
      const nestedTabRef = doc(db, 'restaurants', restaurantId, 'tabs', tabId);
      unsubscribeNested = onSnapshot(nestedTabRef, (nestedSnap) => {
        if (nestedSnap.exists()) {
          setLiveTab({
            id: nestedSnap.id,
            ...nestedSnap.data()
          } as Tab);
          fetchRounds(tabId, restaurantId);
        }
      }, (nestedErr) => {
        console.warn('Erro ao atualizar comanda em tempo real:', nestedErr);
      });
    });

    return () => {
      unsubscribeRoot();
      if (unsubscribeNested) {
        unsubscribeNested();
      }
    };
  }, [isOpen, tab?.id, tab?.restaurantId, fetchRounds]);

  // Dynamic Service Timer (Tempo de Atendimento)
  useEffect(() => {
    if (!liveTab?.openedAt && !liveTab?.createdAt) {
      setElapsedTime('0 min');
      return;
    }

    const calculateElapsed = () => {
      const openTime = new Date(liveTab.openedAt || liveTab.createdAt).getTime();
      if (isNaN(openTime)) {
        setElapsedTime('--');
        return;
      }
      const now = Date.now();
      const diffMs = Math.max(0, now - openTime);
      const diffMinutes = Math.floor(diffMs / 60000);

      if (diffMinutes < 60) {
        setElapsedTime(`${diffMinutes} min`);
      } else {
        const hours = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        setElapsedTime(`${hours}h ${mins}min`);
      }
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 30000); // update every 30 sec

    return () => clearInterval(interval);
  }, [liveTab?.openedAt, liveTab?.createdAt]);

  // Group items into rounds (Rodadas)
  const roundGroups = useMemo<RoundGroup[]>(() => {
    const currentTab = liveTab || tab;
    if (!currentTab) return [];

    // If orders collection documents exist, use them as canonical rounds
    if (orders.length > 0) {
      return orders.map((ord, idx) => {
        const orderItems = Array.isArray(ord.items) ? ord.items : [];
        const normalizedItems = orderItems.map((item: any, iIdx: number) => {
          let sizeStr: string | null = null;
          if (item.tamanhoSelecionado?.nome) {
            sizeStr = item.tamanhoSelecionado.nome;
          } else if (item.pedidosAdicionais?.size?.nome) {
            sizeStr = item.pedidosAdicionais.size.nome;
          } else if (typeof item.size === 'string') {
            sizeStr = item.size;
          }

          let optionsArr: Array<{ groupName?: string; optionName: string; priceCents?: number }> = [];
          if (Array.isArray(item.adicionaisSelecionados)) {
            optionsArr = item.adicionaisSelecionados.map((opt: any) => ({
              groupName: opt.groupNome || opt.grupo,
              optionName: opt.itemNome || opt.nome || opt.name,
              priceCents: opt.precoCents
            }));
          } else if (Array.isArray(item.pedidosAdicionais?.options)) {
            optionsArr = item.pedidosAdicionais.options.map((opt: any) => ({
              groupName: opt.groupNome || opt.grupo,
              optionName: opt.itemNome || opt.nome || opt.name,
              priceCents: opt.precoCents
            }));
          } else if (Array.isArray(item.options)) {
            optionsArr = item.options.map((opt: any) => ({
              groupName: opt.groupName,
              optionName: opt.optionName || opt.name,
              priceCents: opt.priceCents
            }));
          }

          const unitCents = item.unitPriceCents ?? Math.round((Number(item.precoUnitario) || 0) * 100);
          const totalCents = item.totalPriceCents ?? Math.round((Number(item.valorTotal) || 0) * 100);

          return {
            id: item.id || `ord-${ord.id}-item-${iIdx}`,
            productName: item.nome || item.produtoNome || item.productName || 'Item',
            quantity: Number(item.quantidade) || 1,
            unitPriceCents: unitCents,
            totalPriceCents: totalCents,
            status: item.status || ord.status || ord.orderStatus || 'em_preparo',
            size: sizeStr,
            options: optionsArr,
            observation: item.observacao || item.observacoes || '',
            cancellationReason: item.cancellationReason || item.motivoCancelamento || '',
            cancelledAt: item.cancelledAt || '',
            cancelledBy: item.cancelledBy || null,
            cancellationRequest: item.cancellationRequest || (item as any).cancellationRequest || null,
            orderId: ord.id
          };
        });

        // Sum active non-cancelled items for round total
        const activeItems = normalizedItems.filter((i: any) => i.status !== 'CANCELLED' && i.status !== 'cancelado');
        const roundTotal = activeItems.reduce((sum: number, item: any) => sum + item.totalPriceCents, 0);

        return {
          id: ord.id,
          roundNumber: idx + 1,
          orderId: ord.id,
          sentAt: ord.createdAt || ord.data_criacao,
          sentBy: ord.sentBy?.name || ord.source || ord.origin || 'Sistema',
          origin: ord.source || ord.origin || 'TABLE',
          status: ord.status || ord.canonicalStatus || 'cozinha',
          totalCents: roundTotal,
          items: normalizedItems
        };
      });
    }

    // Fallback: Group items inside tab.items by orderId or sentAt if orders collection is empty
    const tabItems = Array.isArray(currentTab.items) ? currentTab.items : [];
    if (tabItems.length === 0) return [];

    const groupMap = new Map<string, TabItem[]>();
    tabItems.forEach((item) => {
      const groupKey = item.orderId || item.sentAt || 'default_round';
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }
      groupMap.get(groupKey)!.push(item);
    });

    const result: RoundGroup[] = [];
    let roundIndex = 1;

    groupMap.forEach((itemsInGroup, groupKey) => {
      let groupActiveTotal = 0;
      const normalizedItems = itemsInGroup.map((item, iIdx) => {
        const unitCents = item.unitPriceCents ?? Math.round((item.precoUnitario || 0) * 100);
        const totalCents = item.totalPriceCents ?? Math.round((item.total || 0) * 100);
        
        const isItemCancelled = item.status === 'CANCELLED' || item.status === 'cancelado';
        if (!isItemCancelled) {
          groupActiveTotal += totalCents;
        }

        let sizeStr: string | null = null;
        if (item.pedidosAdicionais?.size?.nome) {
          sizeStr = item.pedidosAdicionais.size.nome;
        }

        let optionsArr: Array<{ groupName?: string; optionName: string; priceCents?: number }> = [];
        if (Array.isArray(item.pedidosAdicionais?.options)) {
          optionsArr = item.pedidosAdicionais.options.map((opt) => ({
            groupName: opt.groupNome,
            optionName: opt.itemNome,
            priceCents: opt.precoCents
          }));
        }

        return {
          id: item.id || `tab-item-${iIdx}`,
          productName: item.produtoNome || item.productName || 'Item',
          quantity: item.quantidade || 1,
          unitPriceCents: unitCents,
          totalPriceCents: totalCents,
          status: item.status || 'em_preparo',
          size: sizeStr,
          options: optionsArr,
          observation: item.observacoes || (item as any).observation || '',
          cancellationReason: (item as any).cancellationReason || (item as any).motivoCancelamento || '',
          cancelledAt: (item as any).cancelledAt || '',
          cancelledBy: (item as any).cancelledBy || null,
          cancellationRequest: (item as any).cancellationRequest || null,
          orderId: item.orderId
        };
      });

      const firstItem = itemsInGroup[0];
      result.push({
        id: groupKey,
        roundNumber: roundIndex++,
        orderId: firstItem?.orderId,
        sentAt: firstItem?.sentAt || currentTab.openedAt || currentTab.createdAt,
        sentBy: currentTab.waiterName || currentTab.openedBy || 'Mesa',
        status: firstItem?.status || 'em_preparo',
        totalCents: groupActiveTotal,
        items: normalizedItems
      });
    });

    return result;
  }, [liveTab, tab, orders]);

  // Derived paid amount in cents with safe fallback
  const paidCents = useMemo(() => {
    const currentTab = liveTab || tab;
    if (typeof currentTab?.paidInCents === 'number') return currentTab.paidInCents;
    if (typeof (currentTab as any)?.paidAmount === 'number') return Math.round((currentTab as any).paidAmount * 100);
    return 0;
  }, [liveTab, tab]);

  // Handle opening item cancellation modal
  const handleOpenCancelModal = (orderId: string | undefined, item: any) => {
    if (item.cancellationRequest?.status === 'PENDING_APPROVAL') {
      setCancelError('Este item já possui uma solicitação de cancelamento pendente.');
      setTimeout(() => setCancelError(null), 5000);
      return;
    }

    setCancellingItem({
      orderId,
      itemId: item.id,
      productName: item.productName,
      quantity: item.quantity,
      totalPriceCents: item.totalPriceCents,
      cancellationRequest: item.cancellationRequest
    });
    setCancellationReason('');
    setCancelError(null);
  };

  const handleOpenApproveModal = (orderId: string | undefined, item: any) => {
    setApprovingItem({
      orderId,
      itemId: item.id,
      productName: item.productName,
      quantity: item.quantity,
      totalPriceCents: item.totalPriceCents,
      cancellationRequest: item.cancellationRequest
    });
    setApprovalNote('');
    setCancelError(null);
  };

  const handleOpenRefuseModal = (orderId: string | undefined, item: any) => {
    setRefusingItem({
      orderId,
      itemId: item.id,
      productName: item.productName,
      quantity: item.quantity,
      totalPriceCents: item.totalPriceCents,
      cancellationRequest: item.cancellationRequest
    });
    setRefusalReason('');
    setCancelError(null);
  };

  // Submit Item Cancellation (Direct or Request depending on role)
  const handleConfirmCancelItem = async () => {
    if (!cancellingItem) return;

    if (!cancellationReason.trim()) {
      setCancelError('O motivo do cancelamento é obrigatório.');
      return;
    }

    const currentTab = liveTab || tab;
    if (!currentTab?.restaurantId) {
      setCancelError('Restaurante não identificado.');
      return;
    }

    try {
      setIsSubmittingCancel(true);
      setCancelError(null);

      if (isAuthorized) {
        // Direct cancel by authorized manager
        const res = await tabRoundService.cancelItem({
          restaurantId: currentTab.restaurantId,
          tabId: currentTab.id,
          orderId: cancellingItem.orderId || null,
          itemId: cancellingItem.itemId,
          cancellationReason: cancellationReason.trim()
        });
        setCancelSuccessMsg(res.message || `Item "${cancellingItem.productName}" foi cancelado com sucesso.`);
      } else {
        // Request cancellation for item in production (waiter)
        const res = await tabRoundService.requestItemCancellation({
          restaurantId: currentTab.restaurantId,
          tabId: currentTab.id,
          orderId: cancellingItem.orderId || null,
          itemId: cancellingItem.itemId,
          cancellationReason: cancellationReason.trim()
        });
        setCancelSuccessMsg(res.message || 'Solicitação de cancelamento registrada. Aguardando aprovação do gerente.');
      }

      setCancellingItem(null);
      setCancellationReason('');

      setTimeout(() => {
        setCancelSuccessMsg(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro ao processar cancelamento:', err);
      setCancelError(err.message || 'Falha ao processar cancelamento do item.');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  // Confirm Approval of Cancellation Request (Authorized Profile)
  const handleConfirmApproveItem = async () => {
    if (!approvingItem) return;

    const currentTab = liveTab || tab;
    if (!currentTab?.restaurantId) return;

    try {
      setIsSubmittingAction(true);
      setCancelError(null);

      const res = await tabRoundService.approveItemCancellation({
        restaurantId: currentTab.restaurantId,
        tabId: currentTab.id,
        orderId: approvingItem.orderId || null,
        itemId: approvingItem.itemId,
        approvalNote: approvalNote.trim()
      });

      setCancelSuccessMsg(res.message || 'Solicitação de cancelamento APROVADA. Item cancelado.');
      setApprovingItem(null);
      setApprovalNote('');

      setTimeout(() => {
        setCancelSuccessMsg(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro ao aprovar cancelamento:', err);
      setCancelError(err.message || 'Falha ao aprovar cancelamento.');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Confirm Refusal of Cancellation Request (Authorized Profile)
  const handleConfirmRefuseItem = async () => {
    if (!refusingItem) return;

    const currentTab = liveTab || tab;
    if (!currentTab?.restaurantId) return;

    try {
      setIsSubmittingAction(true);
      setCancelError(null);

      const res = await tabRoundService.refuseItemCancellation({
        restaurantId: currentTab.restaurantId,
        tabId: currentTab.id,
        orderId: refusingItem.orderId || null,
        itemId: refusingItem.itemId,
        refusalReason: refusalReason.trim()
      });

      setCancelSuccessMsg(res.message || 'Solicitação de cancelamento RECUSADA. O item permanece ativo.');
      setRefusingItem(null);
      setRefusalReason('');

      setTimeout(() => {
        setCancelSuccessMsg(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro ao recusar cancelamento:', err);
      setCancelError(err.message || 'Falha ao recusar cancelamento.');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Format date helpers using canonical implementations
  const formatTimeOnly = (isoString?: string) => canonicalFormatTime(isoString);
  const formatDateWithTime = (isoString?: string) => canonicalFormatDateTime(isoString);

  // Helper for status badge styling
  const getProductionStatusBadge = (statusStr?: string) => {
    const s = (statusStr || '').toLowerCase();
    if (s === 'pronto' || s === 'ready') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Pronto</span>
        </span>
      );
    }
    if (s === 'entregue' || s === 'delivered') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
          <span>Entregue</span>
        </span>
      );
    }
    if (s === 'cancelado' || s === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
          <AlertCircle className="w-3.5 h-3.5 text-red-600" />
          <span>Cancelado</span>
        </span>
      );
    }
    // Default: Em preparo / Cozinha
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <CookingPot className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
        <span>Em Preparo</span>
      </span>
    );
  };

  // Derived active totals & balances
  const totalCents = roundGroups.reduce((acc, round) => acc + round.totalCents, 0);
  const totalQuantityItems = roundGroups.reduce((acc, r) => {
    const activeItemsInRound = r.items.filter(i => i.status !== 'CANCELLED' && i.status !== 'cancelado');
    return acc + activeItemsInRound.reduce((iAcc, item) => iAcc + item.quantity, 0);
  }, 0);

  const remainingCents = Math.max(0, totalCents - paidCents);

  const displayTableName = table?.name || (liveTab?.tableId ? `Mesa` : 'Comanda Avulsa');
  const displayHallName = hallName || 'Salão';
  const displayWaiterName = liveTab?.waiterName || waiterName || liveTab?.openedBy || 'Não atribuído';
  const displayPeopleCount = liveTab?.peopleCount || table?.capacity || 1;

  // Open Payment & Closing Modal
  const handleOpenPaymentModal = () => {
    const initialAmount = (remainingCents / 100).toFixed(2).replace('.', ',');
    setPaymentAmountStr(initialAmount);
    setReceivedCashStr('');
    setSelectedPaymentMethod('dinheiro');
    setPaymentNotes('');
    setPaymentError(null);
    setIsPaymentModalOpen(true);
  };

  // Submit Payment and/or Close Account
  const handleConfirmPayment = async () => {
    const currentTab = liveTab || tab;
    if (!currentTab?.restaurantId || !currentTab?.id) {
      setPaymentError('Identificador da comanda ou restaurante não encontrado.');
      return;
    }

    const cleanAmountStr = paymentAmountStr.replace(/\s+/g, '').replace(',', '.');
    const parsedAmountFloat = parseFloat(cleanAmountStr);

    if (isNaN(parsedAmountFloat) || parsedAmountFloat <= 0) {
      setPaymentError('Por favor, informe um valor de pagamento válido maior que R$ 0,00.');
      return;
    }

    const amountInCents = Math.round(parsedAmountFloat * 100);
    if (amountInCents > remainingCents) {
      setPaymentError(`O valor informado (${formatCurrency(amountInCents)}) é maior que o saldo restante da comanda (${formatCurrency(remainingCents)}).`);
      return;
    }

    try {
      setIsSubmittingPayment(true);
      setPaymentError(null);

      const res = await tabRepository.payAndCloseTab({
        restaurantId: currentTab.restaurantId,
        tabId: currentTab.id,
        payments: [
          {
            paymentMethodId: selectedPaymentMethod,
            amount: amountInCents,
            amountCents: amountInCents,
            isCents: true
          }
        ],
        observation: paymentNotes.trim() || undefined
      });

      if (res.isFullySettled) {
        setCancelSuccessMsg(res.message || 'Conta recebida com sucesso! Comanda encerrada e mesa liberada.');
        setIsPaymentModalOpen(false);
        setTimeout(() => {
          onSuccessClose?.();
          onClose();
        }, 1200);
      } else {
        setCancelSuccessMsg(res.message || 'Pagamento parcial registrado com sucesso!');
        setIsPaymentModalOpen(false);
        if (currentTab.id && currentTab.restaurantId) {
          fetchRounds(currentTab.id, currentTab.restaurantId);
        }
      }

      setTimeout(() => {
        setCancelSuccessMsg(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro ao processar pagamento da comanda:', err);
      setPaymentError(err.message || 'Falha ao processar pagamento. Verifique se o caixa está aberto.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Waiter Request Bill action (when canCloseAccount is false)
  const handleRequestBill = async () => {
    const currentTab = liveTab || tab;
    if (!currentTab?.restaurantId || !currentTab?.id) return;

    try {
      setIsRequestingBill(true);
      setCancelError(null);

      const res = await tabRepository.requestBillForTab({
        restaurantId: currentTab.restaurantId,
        tabId: currentTab.id
      });

      setCancelSuccessMsg(res.message || 'Conta solicitada com sucesso! Mesa marcada como Aguardando Pagamento.');
      handlePrintPreview();

      setTimeout(() => {
        setCancelSuccessMsg(null);
      }, 5000);
    } catch (err: any) {
      console.error('Erro ao solicitar conta:', err);
      setCancelError(err.message || 'Falha ao solicitar conta da mesa.');
    } finally {
      setIsRequestingBill(false);
    }
  };

  const [isReleasingTable, setIsReleasingTable] = useState<boolean>(false);
  const [isConfirmReleaseOpen, setIsConfirmReleaseOpen] = useState<boolean>(false);

  const isOccupiedOrWaiting = useMemo(() => {
    const currentTab = liveTab || tab;
    const tableStatus = (table?.status as string) || '';
    const tabStatus = (currentTab?.status as string) || '';

    return Boolean(
      tableStatus === 'OCCUPIED' || 
      tableStatus === 'WAITING_PAYMENT' || 
      tableStatus === 'ocupada' || 
      tableStatus === 'atendimento' ||
      tabStatus === 'OPEN' ||
      tabStatus === 'WAITING_ITEMS' ||
      tabStatus === 'WAITING_PAYMENT' ||
      tabStatus === 'PARTIALLY_PAID' ||
      tabStatus === 'aberta'
    );
  }, [table, liveTab, tab]);

  const handleConfirmReleaseTable = async () => {
    if (isReleasingTable) return;

    const tableIdToRelease = table?.id;
    if (!tableIdToRelease) {
      setCancelError('Identificador da mesa não encontrado.');
      setIsConfirmReleaseOpen(false);
      return;
    }

    try {
      setIsReleasingTable(true);
      setCancelError(null);

      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/restaurant/tab/release-table', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ tableId: tableIdToRelease })
      });

      if (response.status === 200) {
        setIsConfirmReleaseOpen(false);
        onClose();
        return;
      }

      if (response.status === 409) {
        setIsConfirmReleaseOpen(false);
        setCancelError('Esta mesa possui consumo, pedidos em aberto ou saldo devedor e não pode ser liberada.');
        return;
      }

      const data = await response.json().catch(() => ({}));
      setIsConfirmReleaseOpen(false);
      setCancelError(data.message || data.error || 'Erro ao tentar liberar a mesa.');
    } catch (err: any) {
      console.error('Erro ao comunicar com o servidor para liberar a mesa:', err);
      setIsConfirmReleaseOpen(false);
      setCancelError(err?.message || 'Erro ao comunicar com o servidor para liberar a mesa.');
    } finally {
      setIsReleasingTable(false);
    }
  };

  const handlePrintPreview = () => {
    const currentTab = liveTab || tab;
    if (!currentTab) return;

    printThermalPreConta({
      tab: currentTab,
      table,
      roundGroups,
      orders,
      waiterName: displayWaiterName
    }, profile);
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    if (tab?.id && tab?.restaurantId) {
      await fetchRounds(tab.id, tab.restaurantId);
    }
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };

  if (!isOpen || (!table && !tab)) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 overflow-hidden animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-3xl shadow-2xl border-0 sm:border border-stone-200 overflow-hidden flex flex-col my-0 sm:my-auto transition-all">
        
        {/* Modal Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-stone-900 text-white flex items-center justify-between shrink-0 border-b border-stone-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
              <UtensilsCrossed className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                  {displayHallName}
                </span>
                <span className="w-1 h-1 rounded-full bg-stone-600"></span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Comanda Aberta
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-white truncate">
                Detalhes da {displayTableName}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Refresh Button in Header */}
            <button
              type="button"
              onClick={handleManualRefresh}
              className="p-2 text-stone-400 hover:text-white hover:bg-stone-800 rounded-xl transition-colors shrink-0"
              title="Atualizar dados da comanda"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <IconButton
              aria-label="Fechar"
              onClick={onClose}
              variant="ghost"
              size="md"
              className="text-stone-400 hover:text-white hover:bg-stone-800 rounded-full shrink-0 animate-none"
            >
              <X className="w-5 h-5" />
            </IconButton>
          </div>
        </div>

        {/* Modal Scrollable Content Body */}
        <div className="p-3.5 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 flex-1 min-h-0 bg-stone-50/50">

          {/* Cancellation Success Toast Banner */}
          {cancelSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center gap-2 animate-in fade-in duration-150 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{cancelSuccessMsg}</span>
            </div>
          )}

          {/* Operational Error Toast Banner */}
          {cancelError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in duration-150 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="break-words">{cancelError}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setCancelError(null)}
                className="p-1 text-rose-500 hover:text-rose-700 rounded-lg shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Operational Header Metadata Card (Compact Grid) */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-xs space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
              
              {/* Garçom */}
              <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100 flex flex-col justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                  <User className="w-3 h-3 text-stone-500" /> Garçom
                </span>
                <span className="font-bold text-stone-800 text-xs sm:text-sm truncate mt-1">
                  {displayWaiterName}
                </span>
              </div>

              {/* Pessoas */}
              <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100 flex flex-col justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                  <Users className="w-3 h-3 text-stone-500" /> Ocupantes
                </span>
                <span className="font-bold text-stone-800 text-xs sm:text-sm truncate mt-1">
                  {displayPeopleCount} {displayPeopleCount === 1 ? 'pessoa' : 'pessoas'}
                </span>
              </div>

              {/* Horário de Abertura */}
              <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100 flex flex-col justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-stone-500" /> Abertura
                </span>
                <span className="font-bold text-stone-800 text-xs sm:text-sm truncate mt-1">
                  {formatTimeOnly(liveTab?.openedAt || liveTab?.createdAt)}
                </span>
              </div>

              {/* Tempo de Atendimento */}
              <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100 flex flex-col justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-rose-500" /> Duração
                </span>
                <span className="font-bold text-rose-700 text-xs sm:text-sm truncate mt-1">
                  {elapsedTime}
                </span>
              </div>

            </div>

            {/* Optional Customer Name or Observation */}
            {(liveTab?.customerName || liveTab?.observation) && (
              <div className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-stone-600">
                {liveTab.customerName && (
                  <div className="flex items-center gap-1.5 font-semibold text-stone-800">
                    <span className="text-stone-400">Cliente:</span>
                    <span className="px-2 py-0.5 bg-stone-100 rounded-md font-bold">{liveTab.customerName}</span>
                  </div>
                )}
                {liveTab.observation && (
                  <div className="flex items-center gap-1 text-stone-500 italic text-xs">
                    <FileText className="w-3 h-3 text-stone-400 shrink-0" />
                    <span className="truncate">"{liveTab.observation}"</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Unified Operational Actions Panel */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-stone-900 text-xs sm:text-sm uppercase tracking-wider text-stone-500">
                Ações da Mesa
              </h3>
              <span className="text-xs text-stone-400 font-medium">Acesso Rápido</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {/* Action 1: Adicionar Itens / Nova Rodada */}
              <button
                type="button"
                onClick={() => {
                  if (canAddItems === false) {
                    setCancelError('Seu perfil não possui permissão para lançar itens.');
                    return;
                  }
                  if (table || liveTab) {
                    onOpenCatalog(table || { id: liveTab?.tableId || '', name: 'Comanda' } as Table, liveTab);
                  }
                }}
                className="p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl transition-all flex items-center gap-2.5 text-left active:scale-98 cursor-pointer min-h-[44px] w-full"
              >
                <div className="p-1.5 bg-emerald-600 text-white rounded-lg shrink-0">
                  <Plus className="w-4 h-4 stroke-[3]" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs block leading-tight whitespace-normal">Nova Rodada</span>
                  <span className="text-[10px] text-emerald-600 block whitespace-normal">Lançar itens</span>
                </div>
              </button>

              {/* Action 2: Liberar Mesa (Somente quando OCCUPIED ou WAITING_PAYMENT) */}
              {isOccupiedOrWaiting && (
                <button
                  type="button"
                  onClick={() => {
                    const currentTab = liveTab || tab;
                    const items = Array.isArray(currentTab?.items) ? currentTab.items : [];
                    const activeItems = items.filter((i: any) => {
                      if (!i || typeof i !== 'object') return false;
                      const st = String(i.status || '').toLowerCase();
                      return !['cancelled', 'cancelado', 'canceled', 'removed', 'removido'].includes(st) && (Number(i.quantity || i.qtd || 1) > 0);
                    });
                    const totalCents = currentTab?.totalInCents ?? Math.round(Number(currentTab?.total || 0) * 100);
                    const paidCents = currentTab?.paidInCents ?? Math.round(Number((currentTab as any)?.paidAmount || 0) * 100);
                    const balanceDueCents = Math.max(totalCents - paidCents, 0);

                    if (activeItems.length > 0 || totalCents > 0 || balanceDueCents > 0) {
                      setCancelError('Não é permitido liberar a mesa pois ela possui consumo, pedidos em aberto ou saldo devedor. Solicite o fechamento ao caixa.');
                      return;
                    }
                    setIsConfirmReleaseOpen(true);
                  }}
                  disabled={isReleasingTable || !table?.id}
                  className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 rounded-xl transition-all flex items-center gap-2.5 text-left active:scale-98 cursor-pointer min-h-[44px] w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Liberar mesa (sem consumo)"
                >
                  <div className="p-1.5 bg-rose-600 text-white rounded-lg shrink-0">
                    <RefreshCw className={`w-4 h-4 ${isReleasingTable ? 'animate-spin' : ''}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-xs block leading-tight whitespace-normal">
                      {isReleasingTable ? 'Liberando...' : 'Liberar Mesa'}
                    </span>
                    <span className="text-[10px] text-rose-600 block whitespace-normal">
                      {isReleasingTable ? 'Aguarde a confirmação' : 'Encerrar sem consumo'}
                    </span>
                  </div>
                </button>
              )}

              {/* Action 3: Transferir Mesa */}
              {onOpenTransferTable && table && liveTab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTransferTable(table, liveTab);
                  }}
                  className="p-3 bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl transition-all flex items-center gap-2.5 text-left active:scale-98 cursor-pointer min-h-[44px] w-full"
                >
                  <div className="p-1.5 bg-rose-100 text-rose-700 rounded-lg shrink-0">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-xs block leading-tight whitespace-normal">Transferir Mesa</span>
                    <span className="text-[10px] text-stone-500 block whitespace-normal">Mudar de mesa</span>
                  </div>
                </button>
              )}

              {/* Action 4: Transferir Itens */}
              {onOpenTransferItems && table && liveTab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTransferItems(table, liveTab);
                  }}
                  className="p-3 bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl transition-all flex items-center gap-2.5 text-left active:scale-98 cursor-pointer min-h-[44px] w-full"
                >
                  <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-xs block leading-tight whitespace-normal">Transferir Itens</span>
                    <span className="text-[10px] text-stone-500 block whitespace-normal">Mover pedidos</span>
                  </div>
                </button>
              )}

              {/* Action 5: Unificar Mesas */}
              {onOpenMergeTabs && table && liveTab && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMergeTabs(table, liveTab);
                  }}
                  className="p-3 bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl transition-all flex items-center gap-2.5 text-left active:scale-98 cursor-pointer min-h-[44px] w-full"
                >
                  <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                    <GitMerge className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-xs block leading-tight whitespace-normal">Unir Mesas</span>
                    <span className="text-[10px] text-stone-500 block whitespace-normal">Juntar comandas</span>
                  </div>
                </button>
              )}

              {/* Action 6: Separar Mesas Unidas (if applicable) */}
              {onOpenSplitTabs && table && liveTab && liveTab.mergedTables && liveTab.mergedTables.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSplitTabs(table, liveTab);
                  }}
                  className="p-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl transition-all flex items-center gap-2.5 text-left active:scale-98 cursor-pointer min-h-[44px] w-full"
                >
                  <div className="p-1.5 bg-amber-600 text-white rounded-lg shrink-0">
                    <GitMerge className="w-4 h-4 rotate-180" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-xs block leading-tight whitespace-normal">Separar Mesas</span>
                    <span className="text-[10px] text-amber-700 block whitespace-normal">Desfazer junção</span>
                  </div>
                </button>
              )}

              {/* Action 7: Imprimir Prévia */}
              <button
                type="button"
                onClick={handlePrintPreview}
                className="p-3 bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl transition-all flex items-center gap-2.5 text-left active:scale-98 cursor-pointer min-h-[44px] w-full"
              >
                <div className="p-1.5 bg-stone-200 text-stone-700 rounded-lg shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs block leading-tight whitespace-normal">Imprimir Prévia</span>
                  <span className="text-[10px] text-stone-500 block whitespace-normal">Conferência</span>
                </div>
              </button>

              {/* Action 8: Atualizar Comanda */}
              <button
                type="button"
                onClick={handleManualRefresh}
                className="p-3 bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl transition-all flex items-center gap-2.5 text-left active:scale-98 cursor-pointer min-h-[44px] w-full"
              >
                <div className="p-1.5 bg-stone-200 text-stone-700 rounded-lg shrink-0">
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-xs block leading-tight whitespace-normal">Atualizar</span>
                  <span className="text-[10px] text-stone-500 block whitespace-normal">Sincronizar dados</span>
                </div>
              </button>
            </div>
          </div>

          {/* Section Header: Rodadas Enviadas */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-stone-200/70 text-stone-700 rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-stone-900 text-sm sm:text-base">
                Rodadas Enviadas ({roundGroups.length})
              </h3>
            </div>

            <span className="text-xs text-stone-500 font-medium">
              {totalQuantityItems} {totalQuantityItems === 1 ? 'item ativo' : 'itens ativos'}
            </span>
          </div>

          {/* List of Round Cards (Rodadas Agrupadas) */}
          {roundGroups.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-dashed border-stone-300 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-stone-800 text-sm">Nenhum item lançado ainda</h4>
                <p className="text-stone-500 text-xs max-w-xs mx-auto">
                  Esta comanda foi iniciada, mas ainda não possui nenhuma rodada de pedidos enviada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenCatalog(table!, liveTab)}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all active:scale-95 min-h-[44px]"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Adicionar Primeiro Item</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {roundGroups.map((round) => (
                <div 
                  key={round.id}
                  className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden transition-all hover:border-stone-300"
                >
                  {/* Round Card Header */}
                  <div className="bg-stone-100/80 px-4 py-3 border-b border-stone-200 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2.5 py-1 bg-stone-900 text-white rounded-lg text-xs font-black shrink-0">
                        Rodada {round.roundNumber}
                      </span>

                      <div className="flex items-center gap-2 text-xs text-stone-600 truncate">
                        <span className="font-semibold text-stone-800">
                          {formatTimeOnly(round.sentAt)}
                        </span>
                        <span className="text-stone-300">•</span>
                        <span className="text-stone-500 truncate">
                          Por: {round.sentBy}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {getProductionStatusBadge(round.status)}
                      <span className="font-extrabold text-stone-900 text-xs sm:text-sm">
                        {formatCurrency(round.totalCents)}
                      </span>
                    </div>
                  </div>

                  {/* Round Items List (Mobile First Card Items) */}
                  <div className="divide-y divide-stone-100">
                    {round.items.map((item) => {
                      const isItemCancelled = item.status === 'CANCELLED' || item.status === 'cancelado';
                      const isItemFinalized = item.status === 'DELIVERED' || item.status === 'FINALIZED' || item.status === 'entregue' || item.status === 'concluido';

                      return (
                        <div 
                          key={item.id} 
                          className={`p-3.5 sm:p-4 transition-colors space-y-2 ${
                            isItemCancelled 
                              ? 'bg-rose-50/40 border-l-4 border-l-rose-500' 
                              : 'hover:bg-stone-50/60'
                          }`}
                        >
                          
                          {/* Primary Item Row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span className={`px-2 py-0.5 rounded-md font-black text-xs shrink-0 mt-0.5 ${
                                isItemCancelled 
                                  ? 'bg-rose-200 text-rose-900 line-through' 
                                  : 'bg-emerald-100 text-emerald-900'
                              }`}>
                                {item.quantity}x
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className={`font-bold text-xs sm:text-sm break-words leading-snug ${
                                    isItemCancelled ? 'text-stone-500 line-through' : 'text-stone-900'
                                  }`}>
                                    {item.productName}
                                  </h4>

                                  {isItemCancelled && (
                                    <span className="px-2 py-0.5 bg-rose-600 text-white font-black text-xs rounded-md tracking-wider uppercase">
                                      CANCELADO
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-stone-400 mt-0.5">
                                  {formatCurrency(item.unitPriceCents)} cada
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <span className={`font-extrabold text-xs sm:text-sm block ${
                                isItemCancelled ? 'text-stone-400 line-through' : 'text-stone-900'
                              }`}>
                                {formatCurrency(item.totalPriceCents)}
                              </span>

                              {/* Action: Cancel Item button (Only for non-cancelled and non-finalized items) */}
                              {!isItemCancelled && !isItemFinalized && (
                                item.cancellationRequest?.status === 'PENDING_APPROVAL' ? (
                                  <span className="px-2 py-1 bg-amber-100 text-amber-900 font-extrabold text-xs rounded-lg border border-amber-300 flex items-center gap-1 shrink-0">
                                    <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                                    <span>Solicitado</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCancelModal(round.orderId || item.orderId, item)}
                                    className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 font-bold text-xs rounded-lg border border-stone-200 hover:border-rose-200 transition-all flex items-center gap-1 min-h-[32px] shadow-2xs active:scale-95"
                                    title={isAuthorized ? "Cancelar este item imediatamente" : "Solicitar cancelamento do item em produção"}
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">{isAuthorized ? "Cancelar" : "Solicitar Cancelamento"}</span>
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          {/* Variações (Size) */}
                          {item.size && (
                            <div className="pl-8 text-xs flex items-center gap-1.5 text-stone-600">
                              <Tag className="w-3 h-3 text-stone-400 shrink-0" />
                              <span className="font-semibold text-stone-700">Tamanho:</span>
                              <span className="px-1.5 py-0.2 bg-stone-100 rounded text-stone-800">{item.size}</span>
                            </div>
                          )}

                          {/* Adicionais (Options) */}
                          {item.options && item.options.length > 0 && (
                            <div className="pl-8 space-y-1">
                              {item.options.map((opt, oIdx) => (
                                <div key={oIdx} className="text-xs text-stone-600 flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1">
                                    <span className="text-emerald-600 font-bold">+</span>
                                    <span>{opt.groupName ? `${opt.groupName}: ` : ''}<strong>{opt.optionName}</strong></span>
                                  </span>
                                  {opt.priceCents && opt.priceCents > 0 ? (
                                    <span className="text-stone-500 font-medium">+ {formatCurrency(opt.priceCents)}</span>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Observações */}
                          {item.observation && item.observation.trim() && (
                            <div className="pl-8 pt-1">
                              <div className="p-2 bg-amber-50/80 border border-amber-200/60 rounded-xl text-amber-900 text-xs flex items-start gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                <span className="italic break-words">Obs: "{item.observation.trim()}"</span>
                              </div>
                            </div>
                          )}

                          {/* Pending Cancellation Request Banner (Prompt 4.6.2) */}
                          {item.cancellationRequest?.status === 'PENDING_APPROVAL' && (
                            <div className="mt-2 ml-8 p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2 shadow-xs">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                                  <Clock className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                                  <span>Status: Cancelamento solicitado</span>
                                </div>

                                {/* Manager Actions (Approve / Refuse) */}
                                {isAuthorized && (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenApproveModal(round.orderId || item.orderId, item)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-all flex items-center gap-1 min-h-[30px]"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>Aprovar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenRefuseModal(round.orderId || item.orderId, item)}
                                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-lg shadow-2xs transition-all flex items-center gap-1 min-h-[30px]"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>Recusar</span>
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="text-xs text-amber-800">
                                Motivo: <strong>"{item.cancellationRequest.reason}"</strong>
                              </div>

                              {(item.cancellationRequest.requestedBy?.name || item.cancellationRequest.requestedAt) && (
                                <div className="text-xs text-amber-700 flex items-center gap-2 flex-wrap pt-1 border-t border-amber-200/60">
                                  {item.cancellationRequest.requestedBy?.name && (
                                    <span>Solicitado por: <strong>{item.cancellationRequest.requestedBy.name}</strong></span>
                                  )}
                                  {item.cancellationRequest.requestedAt && (
                                    <span>em {formatDateWithTime(item.cancellationRequest.requestedAt)}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Cancellation Audit Details Box (Prompt 4.6.1) */}
                          {isItemCancelled && (
                            <div className="mt-2 ml-8 p-2.5 bg-rose-100/70 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                              <div className="flex items-center gap-1.5 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>Motivo: {item.cancellationReason || 'Não informado'}</span>
                              </div>
                              {(item.cancelledBy || item.cancelledAt) && (
                                <div className="text-xs text-rose-700 flex items-center gap-2 flex-wrap pt-0.5 border-t border-rose-200/60">
                                  {item.cancelledBy?.name && (
                                    <span>Cancelado por: <strong>{item.cancelledBy.name}</strong></span>
                                  )}
                                  {item.cancelledAt && (
                                    <span>em {formatDateWithTime(item.cancelledAt)}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>

                </div>
              ))}
            </div>
          )}

        </div>

        {/* Modal Sticky Footer / Summary with Safe-Area support */}
        <div className="p-3.5 sm:p-5 bg-white border-t border-stone-200 shadow-lg space-y-3 shrink-0 sticky bottom-0 z-20 pb-[max(1rem,env(safe-area-inset-bottom))]">
          
          {/* Subtotal & Total / Balance Display */}
          <div className="bg-stone-900 text-white p-3.5 sm:p-4 rounded-2xl shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400 block">
                  Total da Mesa / Comanda
                </span>
                <div className="text-xs text-stone-300">
                  {paidCents > 0 ? (
                    <span>
                      Já pago: <span className="font-semibold text-emerald-400">{formatCurrency(paidCents)}</span>
                    </span>
                  ) : (
                    <span>Subtotal dos itens ativos</span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span className="text-lg sm:text-2xl font-black text-white">
                  {formatCurrency(totalCents)}
                </span>
                {paidCents > 0 && (
                  <div className="text-xs font-bold text-amber-400">
                    Saldo Restante: {formatCurrency(remainingCents)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Operational Action Buttons Row */}
          <div className="flex items-center gap-2">
            {/* Main Action: Receber / Fechar Conta (ou Solicitar Conta se garçom sem permissão de fechar) */}
            {(!isAuthorized || canCloseAccount === false) ? (
              <button
                type="button"
                onClick={handleRequestBill}
                disabled={isRequestingBill || remainingCents === 0}
                className="flex-1 py-3.5 px-4 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 min-h-[48px] cursor-pointer"
                title="Solicitar conta da mesa para o caixa"
              >
                <Receipt className={`w-5 h-5 stroke-[2.5] ${isRequestingBill ? 'animate-spin' : ''}`} />
                <span>{isRequestingBill ? 'Solicitando...' : 'Solicitar Conta'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenPaymentModal}
                disabled={remainingCents === 0}
                className="flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:text-stone-500 disabled:cursor-not-allowed text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 min-h-[48px] cursor-pointer"
                title={remainingCents === 0 ? 'Conta já quitada' : 'Receber pagamento e fechar comanda'}
              >
                <DollarSign className="w-5 h-5 stroke-[2.5]" />
                <span>Receber / Fechar Conta</span>
              </button>
            )}

            {/* Add Items Action */}
            <button
              type="button"
              onClick={() => {
                if (canAddItems === false) {
                  setCancelError('Seu perfil não possui permissão para lançar itens.');
                  return;
                }
                if (table || liveTab) {
                  onOpenCatalog(table || { id: liveTab?.tableId || '', name: 'Comanda' } as Table, liveTab);
                }
              }}
              className="py-3.5 px-4 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 min-h-[48px] cursor-pointer shrink-0"
              title="Adicionar novos itens à comanda"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span className="hidden sm:inline">Adicionar Itens</span>
              <span className="sm:hidden">Itens</span>
            </button>

            {/* Print Preview Button */}
            <button
              type="button"
              onClick={handlePrintPreview}
              className="py-3.5 px-3 sm:px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs sm:text-sm rounded-2xl transition-all flex items-center justify-center gap-1.5 min-h-[48px] border border-stone-200 shrink-0 cursor-pointer"
              title="Imprimir Prévia da Conta"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden md:inline">Imprimir</span>
            </button>
          </div>

        </div>

      </div>

      {/* Payment & Close Account Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-70 bg-stone-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-stone-200 max-w-lg w-full p-4 sm:p-6 space-y-4 sm:space-y-5 animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-800">
                  <CreditCard className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-900 text-base sm:text-lg">
                    Receber / Fechar Conta
                  </h3>
                  <p className="text-stone-500 text-xs">
                    {displayTableName} • {displayHallName}
                  </p>
                </div>
              </div>

              <IconButton
                aria-label="Fechar modal de pagamento"
                type="button"
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  setPaymentError(null);
                }}
                disabled={isSubmittingPayment}
                variant="ghost"
                size="md"
                className="text-stone-400 hover:text-stone-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </IconButton>
            </div>

            {/* Financial Status Summary (3 columns) */}
            <div className="grid grid-cols-3 gap-2 bg-stone-50 p-3 rounded-2xl border border-stone-200 text-center">
              <div className="p-1">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400 block">Total</span>
                <span className="text-xs sm:text-sm font-extrabold text-stone-900 block mt-0.5">
                  {formatCurrency(totalCents)}
                </span>
              </div>
              <div className="p-1 border-x border-stone-200">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-400 block">Já Pago</span>
                <span className="text-xs sm:text-sm font-extrabold text-emerald-600 block mt-0.5">
                  {formatCurrency(paidCents)}
                </span>
              </div>
              <div className="p-1">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600 block">Saldo</span>
                <span className="text-xs sm:text-sm font-black text-amber-600 block mt-0.5">
                  {formatCurrency(remainingCents)}
                </span>
              </div>
            </div>

            {/* Error Message */}
            {paymentError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-stone-800">
                Forma de Pagamento <span className="text-rose-600">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'dinheiro', label: 'Dinheiro', icon: Banknote },
                  { id: 'pix', label: 'PIX', icon: QrCode },
                  { id: 'debito', label: 'Cartão Débito', icon: CreditCard },
                  { id: 'credito', label: 'Cartão Crédito', icon: CreditCard },
                  { id: 'voucher', label: 'Vale Refeição', icon: Wallet },
                  { id: 'outro', label: 'Outro', icon: DollarSign },
                ].map(method => {
                  const Icon = method.icon;
                  const isSelected = selectedPaymentMethod === method.id;
                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedPaymentMethod(method.id)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs' 
                          : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-600' : 'text-stone-400'}`} />
                      <span className="truncate">{method.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount to Pay Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-extrabold text-stone-800">
                  Valor a Receber (R$) <span className="text-rose-600">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentAmountStr((remainingCents / 100).toFixed(2).replace('.', ','));
                  }}
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-800 underline cursor-pointer"
                >
                  Pagar Saldo Restante ({formatCurrency(remainingCents)})
                </button>
              </div>

              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-sm">
                  R$
                </span>
                <TextInput
                  type="text"
                  value={paymentAmountStr}
                  onChange={(e) => setPaymentAmountStr(e.target.value)}
                  placeholder="0,00"
                  className="pl-10 font-black text-stone-900 text-base"
                  disabled={isSubmittingPayment}
                />
              </div>
            </div>

            {/* Cash Calculator (if method is Dinheiro) */}
            {selectedPaymentMethod === 'dinheiro' && (
              <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-stone-700">
                    Cálculo de Troco (Opcional)
                  </span>
                  <span className="text-xs text-stone-400">
                    Valor entregue pelo cliente
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs">
                      R$
                    </span>
                    <TextInput
                      type="text"
                      value={receivedCashStr}
                      onChange={(e) => setReceivedCashStr(e.target.value)}
                      placeholder="Ex: 50,00"
                      className="pl-8 text-xs font-bold"
                      disabled={isSubmittingPayment}
                    />
                  </div>

                  {/* Quick Cash Buttons */}
                  {[20, 50, 100].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setReceivedCashStr(val.toFixed(2).replace('.', ','))}
                      className="px-2.5 py-2 bg-white border border-stone-200 hover:bg-stone-100 rounded-xl text-xs font-bold text-stone-700 shrink-0 cursor-pointer shadow-2xs"
                    >
                      R$ {val}
                    </button>
                  ))}
                </div>

                {/* Troco Result */}
                {(() => {
                  const receivedNum = parseFloat(receivedCashStr.replace(',', '.')) || 0;
                  const payNum = parseFloat(paymentAmountStr.replace(',', '.')) || 0;
                  if (receivedNum > payNum && payNum > 0) {
                    const troco = receivedNum - payNum;
                    return (
                      <div className="flex items-center justify-between pt-1 border-t border-stone-200 text-xs">
                        <span className="font-extrabold text-stone-800">Troco a Devolver:</span>
                        <span className="font-black text-emerald-600 text-sm">
                          {formatCurrency(Math.round(troco * 100))}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {/* Optional Observation */}
            <div className="space-y-1">
              <label className="block text-xs font-bold text-stone-700">
                Observação (Opcional)
              </label>
              <TextInput
                type="text"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Ex: Comprovante #1234, dividiu com outra pessoa..."
                className="text-xs"
                disabled={isSubmittingPayment}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100">
              <Button
                type="button"
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  setPaymentError(null);
                }}
                disabled={isSubmittingPayment}
                variant="secondary"
              >
                Voltar
              </Button>

              <Button
                type="button"
                onClick={handleConfirmPayment}
                disabled={isSubmittingPayment || !paymentAmountStr}
                variant="primary"
                loading={isSubmittingPayment}
                icon={<Check className="w-4 h-4" />}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold"
              >
                {(() => {
                  const payCents = Math.round((parseFloat(paymentAmountStr.replace(',', '.')) || 0) * 100);
                  if (payCents >= remainingCents && remainingCents > 0) {
                    return 'Confirmar Recebimento e Finalizar';
                  }
                  return 'Registrar Pagamento Parcial';
                })()}
              </Button>
            </div>

          </div>
        </div>
      )}


      {/* Item Cancellation Modal (Prompt 4.6.1 & 4.6.2) */}
      {cancellingItem && (
        <div className="fixed inset-0 z-60 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${isAuthorized ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
                  {isAuthorized ? <XCircle className="w-6 h-6 stroke-[2.5]" /> : <Clock className="w-6 h-6 stroke-[2.5]" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-900 text-base">
                    {isAuthorized ? 'Cancelar Item da Comanda' : 'Solicitar Cancelamento do Item'}
                  </h3>
                  <p className="text-stone-500 text-xs">
                    Mesa {table?.name || table?.number || 'Comanda'} • {displayHallName}
                  </p>
                </div>
              </div>

              <IconButton
                aria-label="Fechar modal"
                type="button"
                onClick={() => {
                  setCancellingItem(null);
                  setCancelError(null);
                }}
                disabled={isSubmittingCancel}
                variant="ghost"
                size="md"
                className="text-stone-400 hover:text-stone-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </IconButton>
            </div>

            {/* Item Summary Box */}
            <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                <span>{cancellingItem.quantity}x {cancellingItem.productName}</span>
                <span className="text-rose-700">{formatCurrency(cancellingItem.totalPriceCents)}</span>
              </div>
              <p className="text-xs text-stone-500">
                {isAuthorized 
                  ? 'O item será cancelado imediatamente e seu valor será estornado do subtotal da comanda.' 
                  : 'Como o item já está em produção, uma solicitação será enviada para o gerente aprovar.'}
              </p>
            </div>

            {/* Error Alert */}
            {cancelError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{cancelError}</span>
              </div>
            )}

            {/* Mandatory Cancellation Reason Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-extrabold text-stone-800">
                Motivo do Cancelamento <span className="text-rose-600">*</span>
              </label>
              <TextareaInput
                rows={3}
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Ex: Cliente desistiu do pedido / Erro ao lançar no sistema..."
                className="bg-stone-50 border-stone-200"
                disabled={isSubmittingCancel}
                autoFocus
              />
              <p className="text-xs text-stone-400">
                O motivo, usuário e data/hora atual serão registrados para auditoria.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100">
              <Button
                type="button"
                onClick={() => {
                  setCancellingItem(null);
                  setCancelError(null);
                }}
                disabled={isSubmittingCancel}
                variant="secondary"
              >
                Voltar
              </Button>

              <Button
                type="button"
                onClick={handleConfirmCancelItem}
                disabled={isSubmittingCancel || !cancellationReason.trim()}
                variant={isAuthorized ? "destructive" : "primary"}
                loading={isSubmittingCancel}
                icon={isAuthorized ? <XCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              >
                {isAuthorized ? 'Confirmar Cancelamento' : 'Enviar Solicitação'}
              </Button>
            </div>

          </div>
        </div>
      )}

      {/* Approval Modal (Prompt 4.6.2 - Perfil Autorizado) */}
      {approvingItem && (
        <div className="fixed inset-0 z-60 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
                  <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-900 text-base">Aprovar Cancelamento</h3>
                  <p className="text-stone-500 text-xs">Perfil Autorizado (Gerência)</p>
                </div>
              </div>
              <IconButton
                aria-label="Fechar modal"
                type="button"
                onClick={() => {
                  setApprovingItem(null);
                  setCancelError(null);
                }}
                disabled={isSubmittingAction}
                variant="ghost"
                size="md"
                className="text-stone-400 hover:text-stone-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </IconButton>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2 text-xs">
              <div className="font-bold text-amber-900">
                Item: {approvingItem.quantity}x {approvingItem.productName} ({formatCurrency(approvingItem.totalPriceCents)})
              </div>
              <div className="text-amber-800">
                Motivo solicitado pelo garçom: <strong>"{approvingItem.cancellationRequest?.reason}"</strong>
              </div>
              {approvingItem.cancellationRequest?.requestedBy?.name && (
                <div className="text-xs text-amber-700">
                  Solicitante: {approvingItem.cancellationRequest.requestedBy.name}
                </div>
              )}
            </div>

            {/* Error Alert */}
            {cancelError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{cancelError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-stone-700">
                Observação de Aprovação (Opcional)
              </label>
              <TextInput
                type="text"
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Ex: Aprovado após verificação na cozinha..."
                className="bg-stone-50 border-stone-200"
                disabled={isSubmittingAction}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100">
              <Button
                type="button"
                onClick={() => {
                  setApprovingItem(null);
                  setCancelError(null);
                }}
                disabled={isSubmittingAction}
                variant="secondary"
              >
                Voltar
              </Button>

              <Button
                type="button"
                onClick={handleConfirmApproveItem}
                disabled={isSubmittingAction}
                variant="primary"
                loading={isSubmittingAction}
                icon={<CheckCircle2 className="w-4 h-4" />}
              >
                Confirmar Aprovação
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Refusal Modal (Prompt 4.6.2 - Perfil Autorizado) */}
      {refusingItem && (
        <div className="fixed inset-0 z-60 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-rose-100 text-rose-700 rounded-2xl">
                  <XCircle className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-900 text-base">Recusar Cancelamento</h3>
                  <p className="text-stone-500 text-xs">O item permanecerá ativo na comanda</p>
                </div>
              </div>
              <IconButton
                type="button"
                aria-label="Fechar modal"
                onClick={() => {
                  setRefusingItem(null);
                  setCancelError(null);
                }}
                disabled={isSubmittingAction}
                variant="ghost"
                size="md"
                className="text-stone-400 hover:text-stone-600 rounded-full"
              >
                <X className="w-5 h-5" />
              </IconButton>
            </div>

            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-2xl space-y-1.5 text-xs">
              <div className="font-bold text-stone-800">
                Item: {refusingItem.quantity}x {refusingItem.productName} ({formatCurrency(refusingItem.totalPriceCents)})
              </div>
              <div className="text-stone-600">
                Motivo solicitado pelo garçom: <strong>"{refusingItem.cancellationRequest?.reason}"</strong>
              </div>
            </div>

            {/* Error Alert */}
            {cancelError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{cancelError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-stone-700">
                Motivo da Recusa (Opcional)
              </label>
              <TextareaInput
                rows={2}
                value={refusalReason}
                onChange={(e) => setRefusalReason(e.target.value)}
                placeholder="Ex: Item já foi preparado e não pode ser descartado..."
                className="bg-stone-50 border-stone-200"
                disabled={isSubmittingAction}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100">
              <Button
                type="button"
                onClick={() => {
                  setRefusingItem(null);
                  setCancelError(null);
                }}
                disabled={isSubmittingAction}
                variant="secondary"
              >
                Voltar
              </Button>

              <Button
                type="button"
                onClick={handleConfirmRefuseItem}
                disabled={isSubmittingAction}
                variant="destructive"
                loading={isSubmittingAction}
                icon={<XCircle className="w-4 h-4" />}
              >
                Recusar Solicitação
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={isConfirmReleaseOpen}
        onClose={() => setIsConfirmReleaseOpen(false)}
        onConfirm={handleConfirmReleaseTable}
        title="Liberar mesa?"
        description="Esta ação só é permitida se a mesa não tiver nenhum consumo, pedidos em aberto ou saldo devedor."
        confirmLabel="Liberar mesa"
        cancelLabel="Cancelar"
        type="danger"
        loading={isReleasingTable}
      />

    </div>
  );
}

export default TabDetailsModal;
