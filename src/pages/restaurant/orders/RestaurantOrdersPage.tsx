import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Loader2 } from 'lucide-react';
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

  // Address & Payment Edit States for OrderDetails Modal
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editAddress, setEditAddress] = useState<any>({});
  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editTroco, setEditTroco] = useState('');

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
        (counts as any)[col] += 1;
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
    if (typeof window !== 'undefined') {
      window.print();
    }
  }, []);

  // Filtered orders for active mobile tab
  const mobileTabOrders = useMemo(() => {
    return filteredOrders.filter(o => getOrderKanbanColumn(o) === activeMobileTab);
  }, [filteredOrders, activeMobileTab]);

  return (
    <div className="flex-1 h-full w-full max-w-full min-w-0 flex flex-col bg-stone-100 overflow-hidden select-none font-sans">
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
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {/* Desktop Kanban View */}
        <div className="hidden md:block h-full w-full overflow-hidden">
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
            <div className="p-4 h-full overflow-y-auto space-y-2 custom-scrollbar">
              {filteredOrders.length === 0 ? (
                <div className="p-12 text-center text-stone-400 bg-white rounded-2xl border border-stone-200">
                  Nenhum pedido operacional encontrado.
                </div>
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
        <div className="md:hidden flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
          {mobileTabOrders.length === 0 ? (
            <div className="p-8 text-center text-stone-400 bg-white rounded-2xl border border-stone-200">
              Nenhum pedido na etapa "{activeMobileTab.toUpperCase()}"
            </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-3 sm:p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl relative border border-stone-200">
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="absolute top-4 right-4 p-2 bg-stone-100 hover:bg-stone-200 rounded-full z-10 transition-colors"
            >
              <X className="w-5 h-5 text-stone-600" />
            </button>
            <OrderDetails
              selectedOrder={selectedOrder}
              setSelectedOrder={setSelectedOrder}
              customerData={selectedOrder.cliente || {}}
              addressData={selectedOrder.endereco || {}}
              loadingDetails={false}
              handlePrint={handlePrint}
              isEditingAddress={isEditingAddress}
              handleSaveAddress={() => setIsEditingAddress(false)}
              handleEditAddress={() => setIsEditingAddress(true)}
              editAddress={editAddress}
              setEditAddress={setEditAddress}
              isEditingPayment={isEditingPayment}
              handleSavePayment={() => setIsEditingPayment(false)}
              handleEditPayment={() => setIsEditingPayment(true)}
              editPaymentMethod={editPaymentMethod}
              setEditPaymentMethod={setEditPaymentMethod}
              editTroco={editTroco}
              setEditTroco={setEditTroco}
              onUpdate={onUpdate}
              handleTogglePaid={() => {}}
              isUpdating={updatingOrderId === selectedOrder.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default RestaurantOrdersPage;
