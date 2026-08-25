import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, ShoppingBag } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useSharedClock } from './hooks/useSharedClock';
import { OrdersHeader } from './components/OrdersHeader';
import { OrdersToolbar } from './components/OrdersToolbar';
import { OrdersKanban } from './components/OrdersKanban';
import { OrdersMobileTabs } from './components/OrdersMobileTabs';
import { OrdersHistoryPanel } from './components/OrdersHistoryPanel';
import OrderDetails from '../components/OrderDetails';
import { getCanonicalOrderState, getOrderKanbanColumn } from '../../../domain/order/orderLifecycle';
import { RestaurantOrderCard } from './components/RestaurantOrderCard';
import { printThermalOrder } from '../../../components/orders/OrderThermalPrint';
import { db } from '../../../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { cacheOrders } from '../../../utils/cacheOrders';
import { processOrderPaymentsApi, processOrderRefundApi, normalizePaymentMethodId } from '../../../utils/financeIntegration';
import { isPixPaymentMethod } from '../../../services/paymentMethodsService';
import { EmptyState, IconButton } from '../../../components/ui';

interface RestaurantOrdersPageProps {
  orders: any[];
  setOrders?: any;
  onUpdate: (orderId: string, status: string, motivo?: string) => void;
  restaurantProfile?: any;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isLoadingMore?: boolean;
  updatingOrderId?: string | null;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function RestaurantOrdersPage({
  orders,
  setOrders,
  onUpdate,
  restaurantProfile,
  onRefresh,
  isRefreshing = false,
  updatingOrderId = null
}: RestaurantOrdersPageProps) {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const nowMs = useSharedClock(30000);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [activeMobileTab, setActiveMobileTab] = useState<string>('novo');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilterColumn, setActiveFilterColumn] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Detail loading states
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [customerData, setCustomerData] = useState<any>(null);
  const [addressData, setAddressData] = useState<any>(null);

  // Address & Payment Edit States for OrderDetails Modal
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editAddress, setEditAddress] = useState<any>({});
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editTroco, setEditTroco] = useState('');

  // Fetch client and address details when an order is selected
  useEffect(() => {
    if (!selectedOrder) return;
    const fetchDetails = async () => {
      setLoadingDetails(true);
      try {
        // First check embedded customer data in order
        const customer = selectedOrder.cliente || (selectedOrder.cliente_nome ? {
          nome: selectedOrder.cliente_nome,
          telefone: selectedOrder.cliente_telefone || selectedOrder.telefone || '',
          email: selectedOrder.cliente_email || selectedOrder.email || ''
        } : null);

        const address = selectedOrder.endereco_entrega || selectedOrder.endereco || null;

        setCustomerData(customer || { nome: selectedOrder.cliente_nome || 'Cliente' });
        setAddressData(address);

        // Fetch from Firestore only if data is not already embedded in the order
        if (!customer && selectedOrder.cliente_id) {
          try {
            const userDoc = await getDoc(doc(db, 'users', selectedOrder.cliente_id));
            if (userDoc.exists()) {
              setCustomerData(userDoc.data());
            }
          } catch {
            // Handled gracefully without logging permission errors
          }
        }

        if (!address && selectedOrder.cliente_id && selectedOrder.endereco_id) {
          try {
            const addrDoc = await getDoc(doc(db, 'users', selectedOrder.cliente_id, 'enderecos', selectedOrder.endereco_id));
            if (addrDoc.exists()) {
              setAddressData(addrDoc.data());
            }
          } catch {
            // Handled gracefully without logging permission errors
          }
        }
      } catch {
        setCustomerData(selectedOrder.cliente || { nome: selectedOrder.cliente_nome || 'Cliente' });
        setAddressData(selectedOrder.endereco_entrega || selectedOrder.endereco || null);
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchDetails();
  }, [selectedOrder]);

  // Handle Edit Payment
  const handleEditPayment = useCallback(() => {
    if (!selectedOrder) return;
    setEditPaymentMethod(selectedOrder?.forma_pagamento || '');
    setEditTroco(selectedOrder?.troco || '');
    setIsEditingPayment(true);
  }, [selectedOrder]);

  // Handle Save Payment
  const handleSavePayment = useCallback(async () => {
    if (!profile?.restaurantId || !selectedOrder || !setOrders) return;
    try {
      const pmId = normalizePaymentMethodId(editPaymentMethod) || editPaymentMethod || 'dinheiro';
      const totalCents = Math.round(Number(selectedOrder.valor_total || selectedOrder.total || 0) * 100);
      const clientActionId = `act_pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const res = await processOrderPaymentsApi({
        restaurantId: profile.restaurantId,
        orderId: selectedOrder.id,
        payments: [{
          paymentMethodId: pmId,
          amount: totalCents,
          status: 'PAID'
        }],
        operatorName: profile.nome || 'Operador',
        clientActionId
      });

      if (!res.ok) {
        alert(res.error || 'Erro ao salvar alteração de pagamento.');
        return;
      }

      const updatedOrder = res.order || {
        ...selectedOrder,
        forma_pagamento: pmId,
        troco: pmId === 'dinheiro' ? editTroco : null
      };

      setOrders((prevOrders: any[]) => {
        const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? updatedOrder : o);
        cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
        return updatedOrders;
      });

      setIsEditingPayment(false);
      setSelectedOrder(updatedOrder);
    } catch (error: any) {
      console.error("Error updating payment", error);
      alert(error?.message || "Erro ao atualizar pagamento.");
    }
  }, [profile?.restaurantId, profile?.nome, selectedOrder, editPaymentMethod, editTroco, setOrders]);

  // Handle Toggle Paid Status
  const handleTogglePaid = useCallback(async () => {
    if (!profile?.restaurantId || !selectedOrder || !setOrders) return;
    
    // Prevent manual toggle for Mercado Pago PIX orders
    if (isPixPaymentMethod(selectedOrder.forma_pagamento) && selectedOrder.mercadopago_payment_id) {
      alert("O status de pagamento de pedidos via Mercado Pago é atualizado automaticamente.");
      return;
    }

    try {
      if (!selectedOrder.pago) {
        const totalCents = Math.round(Number(selectedOrder.valor_total || selectedOrder.total || 0) * 100);
        const pmId = normalizePaymentMethodId(selectedOrder.forma_pagamento) || 'dinheiro';
        const clientActionId = `act_pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const res = await processOrderPaymentsApi({
          restaurantId: profile.restaurantId,
          orderId: selectedOrder.id,
          payments: [{
            paymentMethodId: pmId,
            amount: totalCents,
            status: 'PAID'
          }],
          operatorName: profile.nome || 'Operador',
          clientActionId
        });

        if (!res.ok) {
          alert(res.error || 'Erro ao marcar pedido como pago.');
          return;
        }

        const updatedOrder = res.order || { ...selectedOrder, pago: true };
        setOrders((prevOrders: any[]) => {
          const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? updatedOrder : o);
          cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
          return updatedOrders;
        });
        setSelectedOrder(updatedOrder);
      } else {
        const reasonInput = window.prompt("Informe o motivo do estorno para desmarcar o pagamento:");
        if (reasonInput === null) return;

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
          reason: reasonInput,
          operatorName: profile.nome || 'Operador',
          clientActionId
        });

        if (!res.ok) {
          alert(res.error || 'Erro ao estornar pagamento do pedido.');
          return;
        }

        const updatedOrder = res.order || { ...selectedOrder, pago: false };
        setOrders((prevOrders: any[]) => {
          const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? updatedOrder : o);
          cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
          return updatedOrders;
        });
        setSelectedOrder(updatedOrder);
      }
    } catch (error: any) {
      console.error("Error updating payment status", error);
      alert(error?.message || "Erro ao atualizar status de pagamento.");
    }
  }, [profile?.restaurantId, profile?.nome, selectedOrder, setOrders]);

  // Handle Edit Address
  const handleEditAddress = useCallback(() => {
    if (!selectedOrder) return;
    setEditAddress(addressData || selectedOrder.endereco_entrega || selectedOrder.endereco || { rua: '', numero: '', bairro: '', cidade: '', estado: '', complemento: '', referencia: '' });
    setIsEditingAddress(true);
  }, [selectedOrder, addressData]);

  // Handle Save Address
  const handleSaveAddress = useCallback(async () => {
    if (!profile?.restaurantId || !selectedOrder || !setOrders) return;
    try {
      const updateData = { endereco_entrega: editAddress };
      await updateDoc(doc(db, 'restaurants', profile.restaurantId, 'orders', selectedOrder.id), updateData);
      
      setOrders((prevOrders: any[]) => {
        const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? { ...o, ...updateData } : o);
        cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
        return updatedOrders;
      });
      
      setIsEditingAddress(false);
      setAddressData(editAddress);
      setSelectedOrder((prev: any) => ({
        ...prev,
        ...updateData
      }));
    } catch (error) {
      console.error("Error updating address", error);
    }
  }, [profile?.restaurantId, selectedOrder, editAddress, setOrders]);

  // Handle URL query parameter orderId
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orderId = params.get('orderId');
    if (orderId && orders.length > 0) {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setSelectedOrder(order);
      }
    }
  }, [orders, location.search]);

  // Keep selected order state synchronized with orders prop updates
  useEffect(() => {
    if (selectedOrder && orders.length > 0) {
      const updatedOrder = orders.find(o => o.id === selectedOrder.id);
      if (updatedOrder && updatedOrder !== selectedOrder) {
        setSelectedOrder(updatedOrder);
      }
    }
  }, [orders, selectedOrder]);

  // Filter operational orders: Exclude orders that are in 'finalizado' column (FINALIZED / CANCELLED)
  const operationalOrders = useMemo(() => {
    return orders.filter(order => {
      const col = getOrderKanbanColumn(order);
      return col !== 'finalizado';
    });
  }, [orders]);

  // Filtered operational orders based on search & column filter
  const filteredOrders = useMemo(() => {
    let result = operationalOrders;

    if (activeFilterColumn) {
      result = result.filter(o => getOrderKanbanColumn(o) === activeFilterColumn);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter(o => {
        const id = (o.id || '').toLowerCase();
        const customer = (o.nome_cliente || o.customerName || '').toLowerCase();
        const phone = (o.telefone_cliente || o.customerPhone || '').toLowerCase();
        return id.includes(term) || customer.includes(term) || phone.includes(term);
      });
    }

    return result;
  }, [operationalOrders, activeFilterColumn, searchTerm]);

  // Status counters for toolbar & mobile tabs
  const statusCounts = useMemo(() => {
    const counts = {
      novo: 0,
      confirmado: 0,
      cozinha: 0,
      entrega: 0,
      pendingSettlement: 0
    };

    operationalOrders.forEach(o => {
      const col = getOrderKanbanColumn(o);
      if (col in counts) {
        counts[col as keyof typeof counts] += 1;
      }

      const { deliveryStatus, financialSettlementStatus } = getCanonicalOrderState(o);
      if (deliveryStatus === 'DELIVERED' && financialSettlementStatus === 'PENDING_RESTAURANT_CONFIRMATION') {
        counts.pendingSettlement += 1;
      }
    });

    return counts;
  }, [operationalOrders]);

  // Print Handler
  const handlePrint = useCallback((order: any) => {
    printThermalOrder(order, restaurantProfile, profile);
  }, [restaurantProfile, profile]);

  // Filtered orders for active mobile tab
  const mobileTabOrders = useMemo(() => {
    return filteredOrders.filter(o => getOrderKanbanColumn(o) === activeMobileTab);
  }, [filteredOrders, activeMobileTab]);

  return (
    <div className="flex-1 h-full max-h-full w-full max-w-full min-w-0 min-h-0 flex flex-col bg-stone-100 overflow-hidden select-none font-sans">
      {/* Top Header */}
      <OrdersHeader
        restaurantName={restaurantProfile?.nome || profile?.nome}
        isOpen={true}
        isLive={true}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onRefresh={() => onRefresh && onRefresh()}
        isRefreshing={isRefreshing}
      />

      {/* Toolbar / Search & Quick Filters */}
      <OrdersToolbar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusCounts={statusCounts}
        activeFilterColumn={activeFilterColumn}
        onSelectFilterColumn={setActiveFilterColumn}
      />

      {/* Mobile Kanban Column Selector Tabs */}
      <OrdersMobileTabs
        activeTab={activeMobileTab}
        onTabChange={setActiveMobileTab}
        statusCounts={statusCounts}
      />

      {/* Main Operational Area */}
      <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col p-1.5 sm:p-3">
        {/* Desktop Kanban View */}
        <div className="hidden md:flex flex-col h-full max-h-full w-full overflow-hidden min-h-0 flex-1">
          {viewMode === 'kanban' ? (
            <OrdersKanban
              orders={filteredOrders}
              nowMs={nowMs}
              selectedOrder={selectedOrder}
              updatingOrderId={updatingOrderId}
              onOrderClick={setSelectedOrder}
              onUpdateStatus={onUpdate}
              onPrintOrder={handlePrint}
            />
          ) : (
            /* Desktop List View Fallback */
            <div className="p-3 sm:p-4 h-full max-h-full overflow-y-auto space-y-2.5 custom-scrollbar min-h-0 flex-1">
              {filteredOrders.length === 0 ? (
                <EmptyState
                  title="Nenhum pedido operacional encontrado"
                  description="Aguarde novos pedidos ou ajuste seus filtros de busca."
                  icon={ShoppingBag}
                />
              ) : (
                filteredOrders.map(order => (
                  <RestaurantOrderCard
                    key={order.id}
                    order={order}
                    nowMs={nowMs}
                    isSelected={selectedOrder?.id === order.id}
                    isUpdating={updatingOrderId === order.id}
                    onOrderClick={setSelectedOrder}
                    onUpdateStatus={onUpdate}
                    onPrintOrder={handlePrint}
                  />
                ))
              )}
            </div>
          )}
        </div>

        {/* Mobile View: Vertical list for active tab */}
        <div className="md:hidden flex-1 min-h-0 overflow-y-auto p-2 sm:p-3 space-y-2.5 custom-scrollbar">
          {mobileTabOrders.length === 0 ? (
            <EmptyState
              title={`Nenhum pedido na etapa "${activeMobileTab.toUpperCase()}"`}
              description="Nenhum pedido nesta coluna no momento."
              icon={ShoppingBag}
            />
          ) : (
            mobileTabOrders.map(order => (
              <RestaurantOrderCard
                key={order.id}
                order={order}
                nowMs={nowMs}
                isSelected={selectedOrder?.id === order.id}
                isUpdating={updatingOrderId === order.id}
                onOrderClick={setSelectedOrder}
                onUpdateStatus={onUpdate}
                onPrintOrder={handlePrint}
              />
            ))
          )}
        </div>
      </div>

      {/* Slide-over History Drawer */}
      <OrdersHistoryPanel
        isOpen={isHistoryOpen}
        restaurantId={profile?.restaurantId}
        onClose={() => setIsHistoryOpen(false)}
        onSelectOrder={setSelectedOrder}
      />

      {/* Order Details Modal when clicked */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/60 backdrop-blur-xs p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-3xl h-[95vh] sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative border border-stone-200/80">
            <IconButton
              variant="ghost"
              aria-label="Fechar detalhes"
              onClick={() => setSelectedOrder(null)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 bg-stone-100 hover:bg-stone-200 rounded-full"
            >
              <X className="w-5 h-5 text-stone-600" />
            </IconButton>
            <OrderDetails
              selectedOrder={selectedOrder}
              setSelectedOrder={setSelectedOrder}
              customerData={customerData}
              addressData={addressData}
              loadingDetails={loadingDetails}
              handlePrint={handlePrint}
              isEditingAddress={isEditingAddress}
              handleSaveAddress={handleSaveAddress}
              handleEditAddress={handleEditAddress}
              editAddress={editAddress}
              setEditAddress={setEditAddress}
              onUpdate={onUpdate}
              handleTogglePaid={handleTogglePaid}
              isUpdating={updatingOrderId === selectedOrder.id}
              restaurantProfile={restaurantProfile}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default RestaurantOrdersPage;
