import React, { useState, useEffect } from 'react';
import { RestaurantSettlementModal } from './RestaurantSettlementModal';
import { 
  ShoppingBag, Clock, User, MapPin, CreditCard, Save, Edit2, ArrowLeft, Printer, X, Check, RefreshCcw, Bike, DollarSign, AlertCircle, ShieldCheck, FileText, CheckCircle2, Navigation, Store, Utensils, Monitor, MessageSquare
} from 'lucide-react';
import { getRestaurantStatusText, getStatusColor } from './OrderListItem';
import { db } from '../../../firebase';
import { collection, query, where, getDocs, doc } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { getPaymentStatusInfo } from '../../../utils/paymentStatus';
import {
  getCanonicalOrderState,
  getOrderStatusLabel,
  getDeliveryStatusLabel,
  getFinancialStatusLabel,
  canRestaurantSettleOrder,
  getDriverCashAccountability
} from '../../../domain/order/orderLifecycle';
import { PaymentsManager, PaymentItem } from './PaymentsManager';
import { processOrderPaymentsApi, processOrderRefundApi } from '../../../utils/financeIntegration';
import { isPixPaymentMethod } from '../../../services/paymentMethodsService';
import { isGarcomOrder, getOrderModality, getOrderModalityDetails, OrderModality } from '../orders/utils/orderSource';
import { 
  extractOrderTableDisplay, 
  extractOrderComandaDisplay, 
  extractOrderWaiterDisplay, 
  extractOrderRoundDisplay, 
  extractOrderItemPriceInfo 
} from '../orders/utils/orderPresentation';
import { FormField, TextInput, SelectInput, FormModal } from '../../../components/ui/FormComponents';
import { CancelOrderModal } from '../../../components/orders/CancelOrderModal';


interface OrderDetailsProps {
  selectedOrder: any;
  setSelectedOrder: (order: any) => void;
  customerData: any;
  addressData: any;
  loadingDetails: boolean;
  handlePrint: (order: any, paperSize?: '48mm' | '72mm' | '112mm') => void;
  isEditingAddress: boolean;
  handleSaveAddress: () => void;
  handleEditAddress: () => void;
  editAddress: any;
  setEditAddress: (addr: any) => void;
  onUpdate: (orderId: string, status: string, motivo?: string) => void;
  handleTogglePaid: () => void;
  onRefund?: (orderId: string, amount?: number, reason?: string) => void;
  isUpdating?: boolean;
  restaurantProfile?: any;
  initialOpenAssignDriver?: boolean;
}

const isDeliveryOrder = (order: any): boolean => {
  if (!order) return false;
  return getOrderModalityDetails(order).isDeliveryFlow;
};

const OrderDetails = ({
  selectedOrder,
  setSelectedOrder,
  customerData,
  addressData,
  loadingDetails,
  handlePrint,
  isEditingAddress,
  handleSaveAddress,
  handleEditAddress,
  editAddress,
  setEditAddress,
  onUpdate,
  handleTogglePaid,
  onRefund,
  isUpdating = false,
  restaurantProfile,
  initialOpenAssignDriver
}: OrderDetailsProps) => {
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Settlement modal state
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [isSettling, setIsSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const { user, profile } = useAuth();

  const handleUpdatePayments = async (newPayments: PaymentItem[], pago: boolean) => {
    if (!profile?.restaurantId || !selectedOrder) return;
    try {
      const isMpPix = isPixPaymentMethod(selectedOrder.forma_pagamento) && !!selectedOrder.mercadopago_payment_id;
      if (isMpPix) {
        throw new Error("Pedidos pagos via Mercado Pago não podem ter o pagamento alterado manualmente.");
      }

      const oldPayments = Array.isArray(selectedOrder.payments) ? selectedOrder.payments : [];
      const newPaidPayments = newPayments.filter(p => p.status === 'PAID' && !oldPayments.find((op: any) => op.id === p.id && op.status === 'PAID'));

      if (newPaidPayments.length === 0) {
        return;
      }

      const clientActionId = `act_pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const res = await processOrderPaymentsApi({
        restaurantId: profile.restaurantId,
        orderId: selectedOrder.id,
        payments: newPaidPayments.map(p => ({
          id: p.id,
          paymentMethodId: p.paymentMethodId,
          amount: p.amount,
          status: 'PAID'
        })),
        operatorName: profile.nome || 'Operador',
        clientActionId
      });

      if (!res.ok) {
        throw new Error(res.error || 'Erro ao atualizar pagamentos.');
      }

      if (res.order) {
        setSelectedOrder(res.order);
      }
    } catch (err: any) {
      console.error(err);
      throw new Error(err?.message || 'Erro ao atualizar pagamentos.');
    }
  };

  const handleRefundPaymentItem = async (paymentToRefund: PaymentItem) => {
    if (!profile?.restaurantId || !selectedOrder) return;
    try {
      const reasonInput = window.prompt("Informe o motivo do estorno:");
      if (reasonInput === null) return;

      const clientActionId = `act_ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const res = await processOrderRefundApi({
        restaurantId: profile.restaurantId,
        orderId: selectedOrder.id,
        paymentId: paymentToRefund.id || 'legacy',
        reason: reasonInput,
        operatorName: profile.nome || 'Operador',
        clientActionId
      });

      if (!res.ok) {
        alert(res.error || 'Erro ao estornar pagamento.');
        return;
      }

      if (res.order) {
        setSelectedOrder(res.order);
        alert('Estorno realizado com sucesso!');
      }
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Erro ao estornar pagamento.');
    }
  };
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [restaurantDrivers, setRestaurantDrivers] = useState<any[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    if (initialOpenAssignDriver && isDeliveryOrder(selectedOrder)) {
      setIsAssignModalOpen(true);
      fetchDrivers();
    }
  }, [initialOpenAssignDriver, selectedOrder?.id]);

  const paymentInfo = getPaymentStatusInfo(
    selectedOrder?.paymentStatus,
    selectedOrder?.pago
  );

  const handleOpenSettlement = () => {
    setSettlementAmount(selectedOrder?.valor_total?.toFixed(2) || '0.00');
    setSettlementNotes('');
    setSettleError(null);
    setShowSettlementModal(true);
  };

  const handleConfirmSettlement = async () => {
    if (!selectedOrder?.id || !user) return;

    const parsedVal = parseFloat(settlementAmount.replace(',', '.'));
    if (isNaN(parsedVal) || parsedVal < 0) {
      setSettleError('Informe um valor de baixa válido (não pode ser negativo).');
      return;
    }

    setIsSettling(true);
    setSettleError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/restaurant/orders/${selectedOrder.id}/settle-driver-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          settlementNotes: settlementNotes.trim(),
          receivedAmount: parsedVal
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar baixa com entregador.');
      }

      setSelectedOrder({
        ...selectedOrder,
        pago: true,
        paymentStatus: 'SETTLED',
        financialSettlementStatus: 'SETTLED',
        orderStatus: 'FINALIZED',
        deliveryStatus: 'DELIVERED',
        canonicalStatus: 'FINALIZED',
        status: 'finalizado',
        status_entrega: 'delivered',
        settledAt: new Date().toISOString()
      });

      setShowSettlementModal(false);
    } catch (err: any) {
      console.error('Error settling driver payment:', err);
      setSettleError(err.message || 'Erro ao realizar baixa.');
    } finally {
      setIsSettling(false);
    }
  };

  const fetchDrivers = async () => {
    const restId = selectedOrder?.restaurant_id || selectedOrder?.restaurante_id || selectedOrder?.restaurantId || profile?.restaurantId;
    if (!restId) return;
    setLoadingDrivers(true);
    setAssignError(null);
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) throw new Error('Autenticação expirada.');
      const response = await fetch('/api/restaurant/drivers', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar entregadores');
      }
      const list = (data.drivers || []).filter((d: any) => d.status === 'ACTIVE');
      setRestaurantDrivers(list);
    } catch (error: any) {
      console.error("Erro ao carregar entregadores:", error);
      setAssignError("Não foi possível buscar a lista de entregadores.");
    } finally {
      setLoadingDrivers(false);
    }
  };

  const handleAssignDriver = async (driver: any) => {
    const restId = selectedOrder?.restaurant_id || selectedOrder?.restaurante_id || selectedOrder?.restaurantId || profile?.restaurantId;
    if (!restId || !selectedOrder?.id) return;
    setAssigningDriverId(driver.id);
    setAssignError(null);
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`/api/restaurant/orders/${selectedOrder.id}/assign-driver`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          driverId: driver.userId || driver.id
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atribuir entregador');
      }

      // Update local state reactive propagation immediately
      setSelectedOrder({
        ...selectedOrder,
        assignedDriverId: driver.userId || driver.id,
        assignedDriverName: driver.name,
        assignedDriverPhone: driver.phone,
        driverId: driver.userId || driver.id,
        driverName: driver.name,
        deliveryStatus: "ASSIGNED",
        canonicalStatus: "ASSIGNED",
        status_entrega: "waiting"
      });

      setIsAssignModalOpen(false);
    } catch (err: any) {
      console.error("Erro ao atribuir entregador:", err);
      setAssignError(err.message || "Erro de conexão ao atribuir.");
    } finally {
      setAssigningDriverId(null);
    }
  };

  const handleRefundSubmit = async () => {
    if (!selectedOrder) return;
    setIsRefunding(true);
    try {
      const amount = refundAmount ? parseFloat(refundAmount.replace(',', '.')) : undefined;
      if (onRefund) {
        await onRefund(selectedOrder.id, amount, refundReason);
      } else if (profile?.restaurantId) {
        let targetPaymentId = 'legacy';
        if (Array.isArray(selectedOrder.payments) && selectedOrder.payments.length > 0) {
          const paid = selectedOrder.payments.find((p: any) => p.status === 'PAID');
          if (paid) targetPaymentId = paid.id;
        }
        const clientActionId = `act_ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const res = await processOrderRefundApi({
          restaurantId: profile.restaurantId,
          orderId: selectedOrder.id,
          paymentId: targetPaymentId,
          reason: refundReason,
          operatorName: profile.nome || 'Operador',
          clientActionId
        });
        if (!res.ok) {
          throw new Error(res.error || 'Erro ao realizar estorno.');
        }
        if (res.order) {
          setSelectedOrder(res.order);
          alert('Estorno realizado com sucesso!');
        }
      }
      setShowRefundModal(false);
      setRefundAmount('');
      setRefundReason('');
    } catch (error: any) {
      console.error("Erro ao estornar:", error);
      alert(error?.message || "Erro ao realizar estorno. Tente novamente.");
    } finally {
      setIsRefunding(false);
    }
  };
  if (!selectedOrder) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mb-4">
          <ShoppingBag className="w-10 h-10 text-stone-300" />
        </div>
        <h3 className="text-xl font-bold text-stone-800 mb-2">Nenhum pedido selecionado</h3>
        <p className="text-stone-500 max-w-sm">
          Selecione um pedido na lista ao lado para ver os detalhes, endereço de entrega e itens.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full flex-1 min-h-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 p-3.5 sm:p-6 border-b border-stone-100 bg-stone-50 flex flex-col gap-3 sm:gap-4">
        <div className="flex flex-wrap sm:flex-nowrap justify-between items-start sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-8 sm:pr-0">
            <button 
              onClick={() => setSelectedOrder(null)}
              className="lg:hidden p-1.5 -ml-1 text-stone-500 hover:text-stone-800 hover:bg-stone-200 rounded-xl transition-colors shrink-0"
              aria-label="Voltar"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-stone-800 truncate">Pedido #{selectedOrder.numero_pedido || selectedOrder.numeroPedido || String(selectedOrder.id || selectedOrder._id || '').slice(-6).toUpperCase() || '------'}</h2>
              <p className="text-xs sm:text-sm text-stone-500 truncate">Feito em {selectedOrder.data_criacao || selectedOrder.createdAt ? new Date(selectedOrder.data_criacao || selectedOrder.createdAt).toLocaleString('pt-BR') : 'Data não informada'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(() => {
              const modDetails = getOrderModalityDetails(selectedOrder);
              return (
                <span className={`text-[10px] sm:text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl uppercase tracking-wider border ${modDetails.badgeBg} ${modDetails.badgeText} ${modDetails.badgeBorder}`}>
                  {modDetails.label}
                </span>
              );
            })()}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs sm:text-sm font-bold transition-colors min-h-[34px]" onClick={() => handlePrint(selectedOrder)}>
                <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span>Imprimir</span>
              </button>
              <div className="absolute right-0 top-full mt-2 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden hidden group-hover:block z-10 w-32">
                <button onClick={() => handlePrint(selectedOrder, '48mm')} className="w-full text-left px-4 py-2 text-xs sm:text-sm hover:bg-stone-50 font-bold text-stone-700">48mm</button>
                <button onClick={() => handlePrint(selectedOrder, '72mm')} className="w-full text-left px-4 py-2 text-xs sm:text-sm hover:bg-stone-50 font-bold text-stone-700">72mm</button>
                <button onClick={() => handlePrint(selectedOrder, '112mm')} className="w-full text-left px-4 py-2 text-xs sm:text-sm hover:bg-stone-50 font-bold text-stone-700">112mm</button>
              </div>
            </div>
            <span className={`text-[10px] sm:text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-xl uppercase tracking-wider ${getStatusColor(selectedOrder.status)}`}>
              {getRestaurantStatusText(selectedOrder.status, isGarcomOrder(selectedOrder))}
            </span>
          </div>
        </div>

        {/* Status Badges Breakdown */}
        {(() => {
          const canonicalState = getCanonicalOrderState(selectedOrder);
          const modDetails = getOrderModalityDetails(selectedOrder);
          const pendingSettlement = modDetails.isDeliveryFlow && canRestaurantSettleOrder(selectedOrder);

          return (
            <>
              <div className={`grid grid-cols-1 ${modDetails.isDeliveryFlow ? 'sm:grid-cols-3' : 'sm:grid-cols-1'} gap-2 text-xs pt-1 border-t border-stone-200/60`}>
                <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-stone-200/80 flex items-center justify-between">
                  <span className="text-stone-400 font-bold uppercase text-[10px]">Status Pedido:</span>
                  <span className="font-extrabold text-stone-800 uppercase">{getOrderStatusLabel(selectedOrder)}</span>
                </div>

                {modDetails.isDeliveryFlow && (
                  <>
                    <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-stone-200/80 flex items-center justify-between">
                      <span className="text-stone-400 font-bold uppercase text-[10px]">Entrega:</span>
                      <span className={`font-extrabold uppercase ${
                        canonicalState.deliveryStatus === 'DELIVERED' ? 'text-emerald-700' :
                        canonicalState.deliveryStatus === 'IN_TRANSIT' ? 'text-blue-700' :
                        canonicalState.deliveryStatus === 'ACCEPTED' ? 'text-indigo-700' :
                        canonicalState.deliveryStatus === 'FAILED' ? 'text-rose-700' : 'text-stone-600'
                      }`}>
                        {getDeliveryStatusLabel(selectedOrder)}
                      </span>
                    </div>

                    <div className="bg-white p-2 sm:p-2.5 rounded-xl border border-stone-200/80 flex items-center justify-between">
                      <span className="text-stone-400 font-bold uppercase text-[10px]">Financeiro:</span>
                      <span className={`font-extrabold uppercase px-2 py-0.5 rounded-md text-[10px] ${
                        canonicalState.financialSettlementStatus === 'SETTLED' ? 'bg-emerald-100 text-emerald-800' :
                        canonicalState.financialSettlementStatus === 'PENDING_RESTAURANT_CONFIRMATION' ? 'bg-amber-100 text-amber-800' :
                        'bg-stone-100 text-stone-700'
                      }`}>
                        {getFinancialStatusLabel(selectedOrder)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Banner de Aguardando Conferência Financeira */}
              {pendingSettlement && (
                <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-3 sm:p-4 text-amber-900 flex items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5">
                      <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs sm:text-sm text-amber-950">Entregue — Aguardando Conferência Financeira</h4>
                      <p className="text-[11px] sm:text-xs text-amber-800 font-medium leading-relaxed mt-0.5">
                        O entregador <strong>{selectedOrder.deliveredByDriverName || selectedOrder.assignedDriverName || selectedOrder.driverName || 'designado'}</strong> confirmou a entrega. Use o botão no rodapé para conferir e dar baixa.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3.5 sm:p-6 pr-2 space-y-6 sm:space-y-8 custom-scrollbar">
        {/* Modality Specific Panels */}
        {(() => {
          const modDetails = getOrderModalityDetails(selectedOrder);
          const modality = modDetails.modality;

          if (modality === 'GARCOM_MESA') {
            return (
              <div className="bg-stone-50 p-4 sm:p-5 rounded-2xl border border-stone-200/80 space-y-3">
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-emerald-600" /> Detalhes do Pedido (Garçom • Mesa)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                    <span className="text-stone-400 font-semibold text-[11px] block">Mesa</span>
                    <span className="font-black text-stone-900 text-sm mt-0.5 block">
                      {extractOrderTableDisplay(selectedOrder)}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                    <span className="text-stone-400 font-semibold text-[11px] block">Comanda</span>
                    <span className="font-black text-stone-900 text-sm mt-0.5 block">
                      {extractOrderComandaDisplay(selectedOrder)}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                    <span className="text-stone-400 font-semibold text-[11px] block">Garçom</span>
                    <span className="font-black text-stone-900 text-sm mt-0.5 block truncate">
                      {extractOrderWaiterDisplay(selectedOrder)}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                    <span className="text-stone-400 font-semibold text-[11px] block">Rodada</span>
                    <span className="font-black text-stone-900 text-sm mt-0.5 block">
                      {extractOrderRoundDisplay(selectedOrder)}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-stone-500 italic mt-1">
                  * Pedido de consumo em mesa. O pagamento é gerenciado diretamente pela comanda do cliente.
                </p>
              </div>
            );
          }

          if (modality === 'BALCAO_MESA') {
            return (
              <div className="bg-stone-50 p-4 sm:p-5 rounded-2xl border border-stone-200/80 space-y-3">
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <Store className="w-4 h-4 text-amber-600" /> Detalhes do Pedido (Balcão • Mesa)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                    <span className="text-stone-400 font-semibold text-[11px] block">Mesa</span>
                    <span className="font-black text-stone-900 text-sm mt-0.5 block">
                      {extractOrderTableDisplay(selectedOrder)}
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                    <span className="text-stone-400 font-semibold text-[11px] block">Comanda</span>
                    <span className="font-black text-stone-900 text-sm mt-0.5 block">
                      {extractOrderComandaDisplay(selectedOrder)}
                    </span>
                  </div>
                  {customerData?.nome && customerData?.nome !== 'Cliente' && (
                    <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                      <span className="text-stone-400 font-semibold text-[11px] block">Cliente</span>
                      <span className="font-black text-stone-900 text-sm mt-0.5 block truncate">
                        {customerData.nome}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-stone-500 italic mt-1">
                  * Pedido lançado no balcão para consumo em mesa. O pagamento pertence à comanda.
                </p>
              </div>
            );
          }

          if (modality === 'TOTEM') {
            return (
              <div className="bg-stone-50 p-4 sm:p-5 rounded-2xl border border-stone-200/80 space-y-3">
                <h3 className="text-xs font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-indigo-600" /> Detalhes do Pedido (Totem Autoatendimento)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                    <span className="text-stone-400 font-semibold text-[11px] block">Origem</span>
                    <span className="font-black text-stone-900 text-sm mt-0.5 block">Totem Autoatendimento</span>
                  </div>
                  {(selectedOrder.pickupNumber || selectedOrder.senha || selectedOrder.numero_retirada) && (
                    <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                      <span className="text-stone-400 font-semibold text-[11px] block">Número de Retirada / Senha</span>
                      <span className="font-black text-indigo-700 text-base mt-0.5 block">
                        #{selectedOrder.pickupNumber || selectedOrder.senha || selectedOrder.numero_retirada}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (modality === 'BALCAO_RETIRADA') {
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
                    <User className="w-4 h-4" /> Cliente
                  </h3>
                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                    <p className="font-bold text-stone-800">{customerData?.nome || selectedOrder.cliente_nome || 'Cliente no Balcão'}</p>
                    {(customerData?.telefone || selectedOrder.cliente_telefone) && (
                      <p className="text-sm text-stone-500 mt-1">{customerData?.telefone || selectedOrder.cliente_telefone}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                    <CreditCard className="w-4 h-4" /> Pagamento
                  </h3>
                  {selectedOrder?.mercadopago_payment_id && isPixPaymentMethod(selectedOrder?.forma_pagamento) ? (
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                      <p className="font-bold text-stone-800 uppercase mb-2">Pix Mercado Pago</p>
                      <div className="flex items-center gap-2 mt-2">
                        <div className={`w-3 h-3 rounded-full ${selectedOrder.pago ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span className="text-sm font-bold text-stone-700">{selectedOrder.pago ? 'Pedido Pago' : 'Pendente'}</span>
                      </div>
                    </div>
                  ) : (
                    <PaymentsManager
                      order={selectedOrder}
                      configuredMethods={restaurantProfile?.formas_pagamento || restaurantProfile?.payment_methods}
                      restaurantProfile={restaurantProfile}
                      restaurantId={profile?.restaurantId || restaurantProfile?.id || selectedOrder?.restaurantId}
                      onUpdatePayments={handleUpdatePayments}
                      onRefundPayment={handleRefundPaymentItem}
                    />
                  )}
                </div>
              </div>
            );
          }

          /* BALCAO_ENTREGA & DELIVERY */
          const cleanPhone = (customerData?.telefone || selectedOrder.cliente_telefone || '').replace(/\D/g, '');
          const rawAddr = addressData?.rua || selectedOrder.endereco?.rua || (typeof selectedOrder.endereco === 'string' ? selectedOrder.endereco : '');
          const addrNum = addressData?.numero || selectedOrder.endereco?.numero || '';
          const addrBairro = addressData?.bairro || selectedOrder.endereco?.bairro || '';
          const addrCidade = addressData?.cidade || selectedOrder.endereco?.cidade || '';
          const addrState = addressData?.estado || selectedOrder.endereco?.estado || '';
          const fullMapsAddr = `${rawAddr}, ${addrNum}, ${addrBairro}, ${addrCidade} - ${addrState}`.trim();

          return (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Customer */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4" /> Cliente
                </h3>
                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                  <p className="font-bold text-stone-800">{customerData?.nome || customerData?.displayName || selectedOrder.cliente_nome || 'Cliente'}</p>
                  {cleanPhone && (
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-stone-500">{customerData?.telefone || selectedOrder.cliente_telefone}</p>
                      <a 
                        href={`https://wa.me/55${cleanPhone}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-emerald-500 hover:text-emerald-600 transition-colors bg-emerald-50 p-1.5 rounded-lg"
                        title="Chamar no WhatsApp"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="w-4 h-4" /> Endereço de Entrega
                  </h3>
                  {!['entregue', 'finalizado', 'cancelado', 'rejeitado'].includes(selectedOrder.status) && (
                    <button 
                      onClick={isEditingAddress ? handleSaveAddress : handleEditAddress}
                      className="text-emerald-600 hover:text-emerald-700 p-1"
                    >
                      {isEditingAddress ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                  {isEditingAddress ? (
                    <div className="space-y-2">
                      <input type="text" placeholder="Rua" value={editAddress.rua || ''} onChange={e => setEditAddress({...editAddress, rua: e.target.value})} className="w-full p-2 text-sm border border-stone-200 rounded-lg" />
                      <div className="flex gap-2">
                        <input type="text" placeholder="Número" value={editAddress.numero || ''} onChange={e => setEditAddress({...editAddress, numero: e.target.value})} className="w-1/3 p-2 text-sm border border-stone-200 rounded-lg" />
                        <input type="text" placeholder="Bairro" value={editAddress.bairro || ''} onChange={e => setEditAddress({...editAddress, bairro: e.target.value})} className="w-2/3 p-2 text-sm border border-stone-200 rounded-lg" />
                      </div>
                      <div className="flex gap-2">
                        <input type="text" placeholder="Cidade" value={editAddress.cidade || ''} onChange={e => setEditAddress({...editAddress, cidade: e.target.value})} className="w-2/3 p-2 text-sm border border-stone-200 rounded-lg" />
                        <input type="text" placeholder="UF" value={editAddress.estado || ''} onChange={e => setEditAddress({...editAddress, estado: e.target.value})} className="w-1/3 p-2 text-sm border border-stone-200 rounded-lg" />
                      </div>
                      <input type="text" placeholder="Complemento" value={editAddress.complemento || ''} onChange={e => setEditAddress({...editAddress, complemento: e.target.value})} className="w-full p-2 text-sm border border-stone-200 rounded-lg" />
                    </div>
                  ) : (
                    <div>
                      <p className="font-bold text-stone-800">
                        {rawAddr}{addrNum ? `, ${addrNum}` : ''}
                      </p>
                      {(addrBairro || addrCidade) && (
                        <p className="text-sm text-stone-500">{addrBairro}{addrCidade ? `, ${addrCidade}` : ''} {addrState ? `- ${addrState}` : ''}</p>
                      )}
                      {(addressData?.complemento || selectedOrder.endereco?.complemento) && (
                        <p className="text-sm text-stone-500">Comp: {addressData?.complemento || selectedOrder.endereco?.complemento}</p>
                      )}
                      {(addressData?.referencia || addressData?.ponto_referencia || selectedOrder.ponto_referencia) && (
                        <p className="text-sm text-emerald-600 font-bold mt-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                          Ref: {addressData?.referencia || addressData?.ponto_referencia || selectedOrder.ponto_referencia}
                        </p>
                      )}

                      {/* Botão de abrir no Google Maps */}
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullMapsAddr)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200/80 transition-colors"
                      >
                        <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                        Abrir no Google Maps
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4" /> Pagamento
                </h3>
                {selectedOrder?.mercadopago_payment_id && isPixPaymentMethod(selectedOrder?.forma_pagamento) ? (
                  <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                    <p className="font-bold text-stone-800 uppercase mb-2">Pix Mercado Pago</p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className={`w-3 h-3 rounded-full ${selectedOrder.pago ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="text-sm font-bold text-stone-700">{selectedOrder.pago ? 'Pedido Pago' : 'Pendente'}</span>
                    </div>
                  </div>
                ) : (
                  <PaymentsManager
                    order={selectedOrder}
                    configuredMethods={restaurantProfile?.formas_pagamento || restaurantProfile?.payment_methods}
                    restaurantProfile={restaurantProfile}
                    restaurantId={profile?.restaurantId || restaurantProfile?.id || selectedOrder?.restaurantId}
                    onUpdatePayments={handleUpdatePayments}
                    onRefundPayment={handleRefundPaymentItem}
                  />
                )}
              </div>
            </div>
          );
        })()}

        {isDeliveryOrder(selectedOrder) && (() => {

          const canonicalState = getCanonicalOrderState(selectedOrder);
          const driverName = selectedOrder.deliveredByDriverName || selectedOrder.assignedDriverName || selectedOrder.driverName || 'Entregador';
          const driverPhone = selectedOrder.assignedDriverPhone;
          const report = selectedOrder.driverPaymentReport || null;

          return (
            <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100 space-y-4">
              <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
                <Bike className="w-4 h-4" /> Status da Entrega
              </h3>
              {(canonicalState.deliveryStatus === 'DELIVERED' || selectedOrder.assignedDriverId || report) ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-stone-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0">
                      <Bike className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-stone-800">{driverName}</h4>
                      {driverPhone && (
                        <p className="text-sm text-stone-500 flex items-center gap-1.5 mt-0.5">
                          <span>Telefone: {driverPhone}</span>
                          <a 
                            href={`https://wa.me/55${driverPhone.replace(/\D/g, '')}`}
                            target="_blank" 
                            rel="noreferrer"
                            className="text-emerald-600 hover:underline font-bold text-xs"
                          >
                            (Chamar no WhatsApp)
                          </a>
                        </p>
                      )}
                      {(selectedOrder.deliveredAt || selectedOrder.horario_entrega) && (
                        <p className="text-xs text-stone-400 mt-1">
                          Entregue em: {new Date(selectedOrder.deliveredAt || selectedOrder.horario_entrega).toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      canonicalState.deliveryStatus === 'DELIVERED' 
                        ? (canonicalState.financialSettlementStatus === 'SETTLED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900') 
                        : canonicalState.deliveryStatus === 'IN_TRANSIT' ? 'bg-amber-50 text-amber-600'
                        : canonicalState.deliveryStatus === 'ACCEPTED' ? 'bg-indigo-50 text-indigo-600'
                        : 'bg-yellow-50 text-yellow-600'
                    }`}>
                      {canonicalState.deliveryStatus === 'DELIVERED' 
                        ? (canonicalState.financialSettlementStatus === 'SETTLED' ? 'Entregue e Conferido' : 'Entregue — Aguardando Conferência') 
                        : getDeliveryStatusLabel(selectedOrder)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-sm">!</span>
                  </div>
                  <div>
                    <p className="text-sm text-amber-800 font-bold">Nenhum entregador atribuído</p>
                    <p className="text-xs text-amber-600 mt-1">Este pedido é para entrega, mas ainda não foi repassado ao seu time de entregadores. Clique no botão de enviar ao entregador no rodapé de ações para designar um profissional da sua frota.</p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Seção Obrigatória de Conferência do Recebimento */}
        {(() => {
          if (isGarcomOrder(selectedOrder)) {
            return null;
          }

          const canonicalState = getCanonicalOrderState(selectedOrder);
          const isSettled = canonicalState.financialSettlementStatus === 'SETTLED' ||
                            canonicalState.orderStatus === 'FINALIZED' ||
                            selectedOrder.financialSettlementStatus === 'SETTLED' ||
                            selectedOrder.status === 'finalizado';
          const isPendingSettlement = canRestaurantSettleOrder(selectedOrder);

          if (!isPendingSettlement && !isSettled && !selectedOrder.driverPaymentReport) {
            return null;
          }

          const report = selectedOrder.driverPaymentReport || {};
          const orderTotal = Number(selectedOrder.valor_total || selectedOrder.total || selectedOrder.valor_produtos || 0);

          // Histórico de parcelas / pagamentos registrados
          const paymentsList = Array.isArray(selectedOrder.payments) ? selectedOrder.payments : [];
          const installmentsPaidTotal = paymentsList
            .filter((p: any) => p.status === 'PAID')
            .reduce((acc: number, p: any) => acc + ((Number(p.amount) || 0) / 100), 0);

          const isOrderPrepaid = selectedOrder.pago === true ||
                                 selectedOrder.pagoOnline === true ||
                                 selectedOrder.forma_pagamento === 'pix_app' ||
                                 (installmentsPaidTotal >= orderTotal && orderTotal > 0);

          const amountAlreadyPaid = isOrderPrepaid
            ? orderTotal
            : (installmentsPaidTotal > 0 ? installmentsPaidTotal : Number(report.amountAlreadyPaid || 0));

          const amountDue = Math.max(0, orderTotal - amountAlreadyPaid);
          const reportedTotal = isOrderPrepaid ? 0 : Number(report.totalReported || amountDue);
          const changeAmount = Number(report.changeAmount || 0);
          const netAmount = isOrderPrepaid ? 0 : Number(report.netAmountReceived || (reportedTotal - changeAmount));

          return (
            <div className={`rounded-2xl p-5 space-y-4 border-2 transition-all ${
              isSettled 
                ? 'bg-emerald-50/80 border-emerald-500/30' 
                : 'bg-amber-500/10 border-amber-500/30'
            }`}>
              <div className="flex items-center justify-between border-b border-stone-200/60 pb-3">
                <div className="flex items-center gap-2 text-stone-900 font-extrabold text-sm uppercase tracking-wider">
                  {isSettled ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <DollarSign className="w-5 h-5 text-amber-600" />
                  )}
                  Conferência do Recebimento
                </div>
                {isSettled ? (
                  <span className="bg-emerald-600 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">
                    CONFERIDO E BAIXADO
                  </span>
                ) : (
                  <span className="bg-amber-500 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">
                    PENDENTE DE CONFERÊNCIA
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                  <span className="text-stone-400 font-semibold text-[10px] uppercase block">Valor do Pedido</span>
                  <span className="font-extrabold text-stone-800 text-sm">R$ {orderTotal.toFixed(2)}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                  <span className="text-stone-400 font-semibold text-[10px] uppercase block">Já Pago (Parcelas/Online)</span>
                  <span className="font-extrabold text-emerald-600 text-sm">R$ {amountAlreadyPaid.toFixed(2)}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                  <span className="text-stone-400 font-semibold text-[10px] uppercase block">Saldo Pendente na Entrega</span>
                  <span className="font-extrabold text-amber-700 text-sm">R$ {amountDue.toFixed(2)}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-stone-200/80">
                  <span className="text-stone-400 font-semibold text-[10px] uppercase block">Valor Informado</span>
                  <span className="font-extrabold text-indigo-700 text-sm">R$ {reportedTotal.toFixed(2)}</span>
                </div>
              </div>

              {report.paymentMethods && report.paymentMethods.length > 0 && !isOrderPrepaid && (
                <div className="bg-white p-3 rounded-xl border border-stone-200/80 space-y-1 text-xs">
                  <span className="text-stone-400 font-semibold text-[10px] uppercase block mb-1">
                    Formas de Pagamento Informadas pelo Entregador:
                  </span>
                  {report.paymentMethods.map((pm: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-stone-700 font-medium">
                      <span>• {pm.methodName || pm.methodId}:</span>
                      <span className="font-bold">R$ {Number(pm.amount || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs font-semibold text-stone-700">
                {changeAmount > 0 && (
                  <span className="bg-amber-100 text-amber-900 px-3 py-1.5 rounded-lg border border-amber-200">
                    Troco Devolvido: <strong>R$ {changeAmount.toFixed(2)}</strong>
                  </span>
                )}
                <span className="bg-emerald-100 text-emerald-900 px-3 py-1.5 rounded-lg border border-emerald-200">
                  Valor Líquido Recebido na Entrega: <strong>R$ {netAmount.toFixed(2)}</strong>
                </span>
              </div>

              {report.observation && (
                <div className="bg-white p-3 rounded-xl border border-stone-200/80 text-xs text-stone-600 italic">
                  <strong>Observação do entregador:</strong> "{report.observation}"
                </div>
              )}
            </div>
          );
        })()}

        {/* Items */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" /> Itens do Pedido
          </h3>
          <div className="bg-stone-50 rounded-2xl border border-stone-100 overflow-hidden">
            {(selectedOrder.items || selectedOrder.itens)?.map((item: any, idx: number) => {
              const priceInfo = extractOrderItemPriceInfo(item);
              const { unitPrice, extrasTotal, quantity, totalPrice } = priceInfo;

              const extrasList = item.adicionais || item.adicionaisSelecionados || item.options || [];

              return (
                <div key={idx} className="p-4 border-b border-stone-100 last:border-0 flex justify-between items-start">
                  <div>
                    <p className="font-bold text-stone-800">
                      <span className="text-emerald-600 mr-2">{quantity}x</span> {item.nome || item.name || item.produtoNome || 'Item'}
                    </p>
                    {item.tamanhoSelecionado && (
                      <p className="text-xs font-semibold text-stone-500 mt-0.5">
                        Tamanho: {item.tamanhoSelecionado.nome || item.tamanhoSelecionado}
                      </p>
                    )}
                    {item.desconto_aplicado && item.desconto_aplicado > 0 && (
                      <p className="text-xs font-bold text-emerald-600 mt-0.5">
                        Desconto de R$ {(Number(item.desconto_aplicado) * quantity).toFixed(2)} aplicado
                      </p>
                    )}
                    {Array.isArray(extrasList) && extrasList.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {extrasList.map((extra: any, eIdx: number) => {
                          const exPrice = Number(extra?.preco ?? extra?.price ?? extra?.valor ?? (extra?.priceCents ? Number(extra.priceCents) / 100 : 0) ?? 0);
                          const exQty = Number(extra?.quantidade ?? extra?.qty ?? 1) || 1;
                          return (
                            <p key={eIdx} className="text-xs text-stone-500">
                              + {exQty}x {extra.nome || extra.name || 'Adicional'} {exPrice > 0 ? `(R$ ${(exPrice * exQty).toFixed(2)})` : ''}
                            </p>
                          );
                        })}
                      </div>
                    )}
                    {(item.observacao || item.observacoes || item.observation) && (
                      <p className="text-xs text-stone-500 mt-1 italic">
                        Obs: {item.observacao || item.observacoes || item.observation}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    {item.preco_original && Number(item.preco_original) > unitPrice && (
                      <span className="text-xs text-stone-400 line-through font-light">
                        R$ {((Number(item.preco_original) + extrasTotal) * quantity).toFixed(2)}
                      </span>
                    )}
                    <p className="font-bold text-stone-800">R$ {totalPrice.toFixed(2)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals */}
        <div className="bg-stone-800 text-white p-6 rounded-3xl space-y-3">
          <div className="flex justify-between text-stone-400">
            <span>Subtotal</span>
            <span>R$ {selectedOrder.valor_produtos?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="flex justify-between text-stone-400">
            <span>Taxa de Entrega</span>
            <span>R$ {selectedOrder.taxa_entrega?.toFixed(2) || '0.00'}</span>
          </div>
          {selectedOrder.valor_desconto > 0 && (
            <div className="flex justify-between text-emerald-400">
              <span>Desconto {selectedOrder.cupom_codigo ? `(${selectedOrder.cupom_codigo})` : ''}</span>
              <span>- R$ {selectedOrder.valor_desconto.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-xl font-bold pt-3 border-t border-stone-700">
            <span>Total</span>
            <span className="text-emerald-400">R$ {selectedOrder.valor_total?.toFixed(2) || '0.00'}</span>
          </div>
        </div>
      </div>

      {/* Actions Footer */}
      <div className="shrink-0 p-4 border-t border-stone-100 bg-white sticky bottom-0 z-10 space-y-2.5">
        {selectedOrder.status === 'pendente' && (
          <div className="flex gap-3">
            <button 
              onClick={() => setIsCancelModalOpen(true)}
              disabled={isUpdating}
              className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <X className="w-4 h-4" /> Rejeitar Pedido
            </button>
            <button 
              onClick={() => {
                onUpdate(selectedOrder.id, 'aceito');
              }}
              disabled={isUpdating}
              className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:bg-emerald-400 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 text-sm"
            >
              {isUpdating ? <Clock className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {isUpdating ? 'Processando...' : 'Aceitar Pedido'}
            </button>
          </div>
        )}

        {selectedOrder.status === 'aceito' && (
          <button 
            onClick={() => {
              onUpdate(selectedOrder.id, 'preparo');
            }}
            disabled={isUpdating}
            className="w-full py-3 bg-yellow-500 text-white font-bold rounded-xl hover:bg-yellow-600 disabled:bg-yellow-300 shadow-lg shadow-yellow-200 transition-all flex items-center justify-center gap-2 text-sm"
          >
            {isUpdating ? <Clock className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            {isUpdating ? 'Processando...' : 'Iniciar Preparo'}
          </button>
        )}

        {['preparo', 'cozinha', 'preparing', 'em preparo', 'em_preparo'].includes(selectedOrder.status) && (
          <button 
            onClick={() => {
              onUpdate(selectedOrder.id, 'pronto');
            }}
            disabled={isUpdating}
            className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 disabled:bg-emerald-300 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 text-sm"
          >
            {isUpdating ? <Clock className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isUpdating ? 'Processando...' : 'Marcar como Pronto'}
          </button>
        )}

        {(['pronto', 'ready'].includes(selectedOrder.status) || getCanonicalOrderState(selectedOrder).orderStatus === 'READY') && (
          <button 
            onClick={() => {
              const mod = getOrderModalityDetails(selectedOrder).modality;
              if (mod === 'GARCOM_MESA' || mod === 'BALCAO_MESA') {
                onUpdate(selectedOrder.id, 'entregue');
                return;
              }
              if (mod === 'BALCAO_RETIRADA' || mod === 'TOTEM') {
                onUpdate(selectedOrder.id, 'finalizado');
                return;
              }
              onUpdate(selectedOrder.id, 'despachado');
            }}
            disabled={isUpdating}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 text-sm cursor-pointer"
          >
            {isUpdating ? <Clock className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isUpdating ? 'Processando...' : (() => {
              const mod = getOrderModalityDetails(selectedOrder).modality;
              if (mod === 'GARCOM_MESA') return 'MARCAR COMO SERVIDO';
              if (mod === 'BALCAO_MESA') return 'Entregar na Mesa';
              if (mod === 'BALCAO_RETIRADA') return 'Entregar e Finalizar';
              if (mod === 'TOTEM') return 'Chamar Senha / Entregar';
              return 'Despachar / Saiu para Entrega';
            })()}
          </button>
        )}

        {['entrega', 'saiu_entrega', 'saiu para entrega', 'saiu_para_entrega', 'despachado', 'em_entrega', 'out_for_delivery'].includes(selectedOrder.status) && (
          <button 
            onClick={() => {
              onUpdate(selectedOrder.id, 'entregue');
            }}
            disabled={isUpdating}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 text-sm"
          >
            {isUpdating ? <Clock className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isUpdating ? 'Processando...' : 'Marcar como Entregue'}
          </button>
        )}

        {isDeliveryOrder(selectedOrder) && ['aceito', 'preparo', 'cozinha', 'pronto'].includes(selectedOrder.status) && (
          <button 
            onClick={() => {
              fetchDrivers();
              setIsAssignModalOpen(true);
            }}
            className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 text-xs"
          >
            <Bike className="w-4 h-4" /> Enviar para Entregador
          </button>
        )}
        
        {/* Settlement / Finalization Buttons */}
        {canRestaurantSettleOrder(selectedOrder) ? (
          <div className="space-y-2">
            <button 
              onClick={handleOpenSettlement}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-stone-950 font-extrabold rounded-xl shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-xs sm:text-sm"
            >
              <DollarSign className="w-4 h-4" />
              Conferir Recebimento e Baixar
            </button>
            <button 
              onClick={() => onUpdate(selectedOrder.id, 'finalizado')}
              disabled={isUpdating}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 text-xs"
            >
              {isUpdating ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Finalizar Pedido Diretamente
            </button>
          </div>
        ) : (['entregue', 'delivered'].includes(selectedOrder.status) || getCanonicalOrderState(selectedOrder).orderStatus === 'DELIVERED') && !['finalizado', 'cancelado', 'rejeitado', 'completed'].includes(selectedOrder.status) ? (
          <button 
            onClick={() => onUpdate(selectedOrder.id, 'finalizado')}
            disabled={isUpdating}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-sm cursor-pointer"
          >
            {isUpdating ? <Clock className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isUpdating ? 'Processando...' : 'Finalizar Pedido'}
          </button>
        ) : !['finalizado', 'cancelado', 'rejeitado', 'completed'].includes(selectedOrder.status) && selectedOrder.status !== 'pendente' ? (
          <button 
            onClick={() => onUpdate(selectedOrder.id, 'finalizado')}
            disabled={isUpdating}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
          >
            {isUpdating ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Finalizar Pedido Agora
          </button>
        ) : ['finalizado', 'cancelado', 'rejeitado', 'completed'].includes(selectedOrder.status) || getCanonicalOrderState(selectedOrder).orderStatus === 'FINALIZED' || getCanonicalOrderState(selectedOrder).orderStatus === 'CANCELLED' ? (
          <div className="text-center text-stone-400 font-bold py-2 text-xs">
            Este pedido já foi {String(getRestaurantStatusText(selectedOrder.status) || '').toLowerCase()}.
          </div>
        ) : null}

        {/* Universal Cancel Button for any non-terminal order */}
        {!['finalizado', 'cancelado', 'rejeitado', 'completed'].includes(selectedOrder.status) && selectedOrder.status !== 'pendente' && (
          <button 
            onClick={() => setIsCancelModalOpen(true)}
            disabled={isUpdating}
            className="w-full py-2 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 text-xs cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Cancelar Pedido
          </button>
        )}
      </div>

      {/* Modal de Cancelamento / Rejeição */}
      <CancelOrderModal
        isOpen={isCancelModalOpen}
        order={selectedOrder}
        isUpdating={isUpdating}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirmCancel={(orderId, reason) => {
          onUpdate(orderId, selectedOrder.status === 'pendente' ? 'rejeitado' : 'cancelado', reason);
          setIsCancelModalOpen(false);
        }}
      />

      {/* Modal de Estorno */}
      <FormModal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        title="Estornar Pagamento"
        subtitle="O estorno devolverá o saldo ao cliente."
        icon={DollarSign}
        iconBgColor="bg-red-50"
        iconTextColor="text-red-600"
        footer={
          <div className="flex gap-3 w-full">
            <button
              onClick={() => setShowRefundModal(false)}
              className="flex-1 py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-colors"
              disabled={isRefunding}
            >
              Cancelar
            </button>
            <button
              onClick={handleRefundSubmit}
              disabled={isRefunding}
              className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isRefunding ? 'Processando...' : 'Confirmar Estorno'}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-left">
          <p className="text-sm text-stone-600">
            O valor total do pedido é de <strong className="text-stone-800">R$ {Number(selectedOrder.valor_total || selectedOrder.total || 0).toFixed(2)}</strong>.
          </p>
          
          <FormField label="Valor do Estorno (R$)">
            <TextInput
              placeholder={`Ex: ${Number(selectedOrder.valor_total || selectedOrder.total || 0).toFixed(2)}`}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              disabled={isRefunding}
            />
            <p className="text-xs text-stone-500 mt-1">
              Deixe em branco para estornar o valor total. Use ponto ou vírgula para centavos.
            </p>
          </FormField>

          <FormField label="Motivo do Estorno">
            <TextInput
              placeholder="Informe o motivo do estorno (obrigatório)"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              disabled={isRefunding}
            />
          </FormField>
        </div>
      </FormModal>

      {/* Modal de Baixa / Conferência Financeira com Entregador */}
      <RestaurantSettlementModal
        order={selectedOrder}
        isOpen={showSettlementModal}
        onClose={() => setShowSettlementModal(false)}
        onSuccess={() => {
          setSelectedOrder({
            ...selectedOrder,
            status: 'finalizado',
            deliveryStatus: 'FINALIZED',
            pago: true,
            paymentStatus: 'SETTLED',
            financialSettlementStatus: 'SETTLED',
            settledAt: new Date().toISOString()
          });
          setShowSettlementModal(false);
        }}
      />

      {/* Modal de Atribuição de Entregador */}
      <FormModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Atribuir Entregador"
        subtitle={`Pedido #${String(selectedOrder?.id || selectedOrder?._id || '').slice(-6).toUpperCase() || '------'} • R$ ${Number(selectedOrder?.valor_total || selectedOrder?.total || 0).toFixed(2)}`}
        icon={Bike}
        iconBgColor="bg-indigo-50"
        iconTextColor="text-indigo-600"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <button
              onClick={() => setIsAssignModalOpen(false)}
              className="py-2.5 px-5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-colors text-sm"
            >
              Fechar
            </button>
          </div>
        }
      >
        <div className="text-left">
          {assignError && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl font-medium flex items-center gap-2">
              <span className="font-bold">!</span> {assignError}
            </div>
          )}

          <div className="overflow-y-auto pr-1 space-y-4 py-2 custom-scrollbar max-h-[50vh]">
            {loadingDrivers ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <RefreshCcw className="w-8 h-8 text-indigo-600 animate-spin" />
                <p className="text-sm text-stone-500 font-medium">Buscando entregadores...</p>
              </div>
            ) : restaurantDrivers.length === 0 ? (
              <div className="text-center py-12 p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-3">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto">
                  <Bike className="w-6 h-6" />
                </div>
                <p className="text-stone-700 font-bold">Nenhum entregador ativo disponível</p>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Não existem entregadores com conta ativa cadastrados para sua loja. Cadastre e ative-os no menu <strong className="text-stone-700">Entregador</strong> para começar a emitir corridas.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-indigo-50 text-indigo-800 rounded-xl text-xs font-semibold">
                  Selecione um dos entregadores ativos de sua frota externa para realizar a entrega:
                </div>
                {restaurantDrivers.map((driver) => {
                  const isOffline = driver.availabilityStatus === 'OFFLINE' || !driver.availabilityStatus;
                  const isOnDelivery = driver.availabilityStatus === 'ON_DELIVERY';
                  const isOnline = driver.availabilityStatus === 'ONLINE';

                  return (
                    <div 
                      key={driver.id} 
                      className={`p-4 rounded-2xl border border-stone-100 hover:border-indigo-100 transition-all bg-stone-50 flex flex-col gap-3 ${
                        assigningDriverId === driver.id ? 'ring-2 ring-indigo-500 bg-white' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            isOnline ? 'bg-emerald-50 text-emerald-600' :
                            isOnDelivery ? 'bg-indigo-50 text-indigo-600' :
                            'bg-stone-200 text-stone-500'
                          }`}>
                            <Bike className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-stone-800 flex items-center gap-2">
                              {driver.name}
                              {driver.nickname && <span className="text-xs text-stone-400 font-normal">({driver.nickname})</span>}
                            </h4>
                            <p className="text-xs text-stone-500 mt-0.5">Telefone: {driver.phone}</p>
                            {driver.vehiclePlate && (
                              <p className="text-xs text-stone-400 font-mono mt-0.5 uppercase">{driver.vehicleType || 'veículo'}: {driver.vehiclePlate}</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isOnline ? 'bg-emerald-100 text-emerald-800' :
                            isOnDelivery ? 'bg-indigo-100 text-indigo-800' :
                            'bg-stone-200 text-stone-700'
                          }`}>
                            {isOnline ? 'Online' : isOnDelivery ? 'Em Entrega' : 'Offline'}
                          </span>
                          {driver.totalDeliveries > 0 && (
                            <p className="text-[10px] text-stone-400 mt-1">{driver.totalDeliveries} entregas completadas</p>
                          )}
                        </div>
                      </div>

                      {/* Aviso de Offline */}
                      {isOffline && (
                        <div className="p-2 bg-amber-50 text-amber-800 rounded-lg text-xs font-medium border border-amber-100">
                          <strong>⚠️ Entregador offline!</strong> Ele receberá a atribuição no momento em que alterar seu status para online no aplicativo de entregas.
                        </div>
                      )}

                      <button
                        onClick={() => handleAssignDriver(driver)}
                        disabled={assigningDriverId !== null}
                        className="w-full mt-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
                      >
                        {assigningDriverId === driver.id ? (
                          <>
                            <RefreshCcw className="w-4 h-4 animate-spin" /> Atribuindo...
                          </>
                        ) : (
                          'Atribuir para este entregador'
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </FormModal>
    </div>
  );
};

export default OrderDetails;
