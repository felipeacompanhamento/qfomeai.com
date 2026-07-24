import React, { useState, useMemo, useEffect } from 'react';
import { Check, X, Clock, MapPin, CreditCard, ShoppingBag, ChevronRight, Phone, User, Bike, CheckCircle2, Megaphone, List, LayoutGrid, DollarSign } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import ReportModal from '../../components/ReportModal';
import { RestaurantSettlementModal } from './components/RestaurantSettlementModal';

interface OrderItem {
  id: string;
  nome: string;
  preco: number;
  preco_original?: number;
  desconto_aplicado?: number;
  quantidade: number;
  observacao?: string;
  adicionais?: any[];
}

interface Order {
  id: string;
  status: string;
  cliente_id: string;
  cliente_nome?: string;
  cliente_telefone?: string;
  valor_produtos: number;
  taxa_entrega: number;
  valor_desconto?: number;
  cupom_codigo?: string;
  valor_total: number;
  forma_pagamento: string;
  data_criacao: string;
  itens: OrderItem[];
  endereco_entrega?: {
    rua: string;
    numero: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
    complemento?: string;
    referencia?: string;
  };
}

interface OrdersManagerProps {
  orders: Order[];
  onUpdate: (orderId: string, newStatus: string, motivo?: string) => void;
}

const statusKanbanMap: Record<string, string> = {
  pendente: "novo",
  aceito: "confirmado",
  preparo: "cozinha",
  pronto: "cozinha",
  entrega: "entrega",
  entregue: "entrega",
  delivered_pending_settlement: "entrega",
  finalizado: "finalizado",
  cancelado: "finalizado",
  rejeitado: "finalizado"
};

const KanbanCard = React.memo(({ order, onUpdate, onOpenSettlement }: { order: Order, onUpdate: (id: string, status: string) => void, onOpenSettlement?: (order: Order) => void }) => {
  const [clientName, setClientName] = useState<string>(order.cliente_nome || 'Cliente');

  useEffect(() => {
    if ((!order.cliente_nome || order.cliente_nome === 'Cliente') && order.cliente_id) {
      const fetchClientName = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', order.cliente_id));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setClientName(userData.nome || userData.displayName || 'Cliente');
          }
        } catch (error) {
          console.error("Error fetching client name:", error);
        }
      };
      fetchClientName();
    } else if (order.cliente_nome) {
      setClientName(order.cliente_nome);
    }
  }, [order.cliente_id, order.cliente_nome]);

  const isPendingSettlement =
    order.status === 'entregue' ||
    order.status === 'delivered_pending_settlement' ||
    (order as any).deliveryStatus === 'DELIVERED_PENDING_SETTLEMENT' ||
    (order as any).financialSettlementStatus === 'PENDING_RESTAURANT_CONFIRMATION';

  const getNextStatus = (currentStatus: string) => {
    switch (currentStatus) {
      case 'pendente': return 'aceito';
      case 'aceito': return 'preparo';
      case 'preparo': return 'pronto';
      case 'pronto': return 'entrega';
      default: return null;
    }
  };

  const nextStatus = getNextStatus(order.status);

  return (
    <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-2">
      <div className="flex justify-between items-start">
        <span className="text-xs font-bold text-stone-500">#{order.id.slice(-5).toUpperCase()}</span>
        <span className="text-xs font-bold text-stone-400">{new Date(order.data_criacao).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <h4 className="font-bold text-stone-800 truncate">{clientName}</h4>
      <p className="text-sm font-bold text-emerald-600">R$ {order.valor_total.toFixed(2)}</p>
      
      {isPendingSettlement ? (
        <div className="space-y-2 pt-1 border-t border-stone-100">
          <p className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
            Entregue — aguardando conferência
          </p>
          <button
            onClick={() => onOpenSettlement?.(order)}
            className="w-full text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
          >
            <DollarSign className="w-3.5 h-3.5" />
            Conferir Recebimento
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-stone-500 capitalize">{order.status}</p>
          {nextStatus && (
            <button
              onClick={() => onUpdate(order.id, nextStatus)}
              className="w-full mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 rounded-xl border border-emerald-200"
            >
              Avançar
            </button>
          )}
        </>
      )}
    </div>
  );
});

export default function OrdersManager({ orders, onUpdate }: OrdersManagerProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderForReport, setSelectedOrderForReport] = useState<Order | null>(null);
  const [settlementOrder, setSettlementOrder] = useState<Order | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'pendente' | 'aceito' | 'despachado' | 'finalizado'>('pendente');
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  const filteredOrders = useMemo(() => {
    return orders.filter(o => o.status === activeTab);
  }, [orders, activeTab]);

  const pedidosPorColuna = useMemo(() => {
    const colunas: Record<string, Order[]> = {
      novo: [],
      confirmado: [],
      cozinha: [],
      entrega: [],
      finalizado: []
    };
    orders.forEach(pedido => {
      const coluna = statusKanbanMap[pedido.status] || "novo";
      if (colunas[coluna]) {
        colunas[coluna].push(pedido);
      }
    });
    return colunas;
  }, [orders]);

  const selectedOrder = useMemo(() => {
    return orders.find(o => o.id === selectedOrderId) || null;
  }, [orders, selectedOrderId]);

  // Auto-select first order when tab changes if none selected
  React.useEffect(() => {
    if (viewMode === 'list') {
      if (filteredOrders.length > 0) {
        const firstOrderId = filteredOrders[0].id;
        if (!selectedOrderId || (selectedOrder && selectedOrder.status !== activeTab)) {
          setSelectedOrderId(firstOrderId);
        }
      } else if (selectedOrderId !== null) {
        setSelectedOrderId(null);
      }
    }
  }, [activeTab, filteredOrders, selectedOrderId, selectedOrder, viewMode]);

  const formatTime = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente': return <span className="bg-red-100 text-red-600 px-2 py-1 rounded-md text-xs font-bold uppercase">Novo</span>;
      case 'aceito': return <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded-md text-xs font-bold uppercase">Em Preparo</span>;
      case 'despachado': return <span className="bg-orange-100 text-orange-600 px-2 py-1 rounded-md text-xs font-bold uppercase">Em Rota</span>;
      case 'finalizado': return <span className="bg-emerald-100 text-emerald-600 px-2 py-1 rounded-md text-xs font-bold uppercase">Concluído</span>;
      case 'rejeitado': return <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded-md text-xs font-bold uppercase">Cancelado</span>;
      default: return <span className="bg-stone-100 text-stone-600 px-2 py-1 rounded-md text-xs font-bold uppercase">{status}</span>;
    }
  };

  const tabs = [
    { id: 'pendente', label: 'Novos', count: orders.filter(o => o.status === 'pendente').length },
    { id: 'aceito', label: 'Em Preparo', count: orders.filter(o => o.status === 'aceito').length },
    { id: 'despachado', label: 'Em Rota', count: orders.filter(o => o.status === 'despachado').length },
    { id: 'finalizado', label: 'Concluídos', count: orders.filter(o => o.status === 'finalizado').length },
  ] as const;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
      {/* Header with Toggle */}
      <div className="flex justify-between items-center border-b border-stone-200 p-4">
        <div className="flex border border-stone-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setViewMode('list')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold ${viewMode === 'list' ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-stone-600'}`}
          >
            <List className="w-4 h-4" /> Lista
          </button>
          <button
            onClick={() => {
              setViewMode('kanban');
              window.dispatchEvent(new CustomEvent('collapse-menu'));
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold ${viewMode === 'kanban' ? 'bg-emerald-50 text-emerald-700' : 'bg-white text-stone-600'}`}
          >
            <LayoutGrid className="w-4 h-4" /> Kanban
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          {/* Tabs Header */}
          <div className="flex border-b border-stone-200 overflow-x-auto custom-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-bold text-sm transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'text-emerald-600 border-b-2 border-emerald-600 bg-emerald-50/30' 
                    : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Orders List (Left Pane) */}
            <div className="w-full md:w-1/3 lg:w-1/4 border-r border-stone-200 flex flex-col bg-stone-50/50">
              <div className="p-4 border-b border-stone-200 bg-white">
                <h3 className="font-bold text-stone-800">
                  {tabs.find(t => t.id === activeTab)?.label} ({filteredOrders.length})
                </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                {filteredOrders.length === 0 ? (
                  <div className="p-8 text-center text-stone-400">
                    <ShoppingBag className="w-8 h-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Nenhum pedido nesta etapa.</p>
                  </div>
                ) : (
                  filteredOrders.map(order => (
                    <div
                      key={order.id}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${
                        selectedOrderId === order.id 
                          ? 'bg-white border-emerald-500 shadow-md ring-1 ring-emerald-500' 
                          : 'bg-white border-stone-200 hover:border-emerald-300 hover:shadow-sm'
                      }`}
                    >
                      <button
                        onClick={() => setSelectedOrderId(order.id)}
                        className="w-full text-left"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-stone-500">#{order.id.slice(-5).toUpperCase()}</span>
                          <span className="text-xs font-bold text-stone-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(order.data_criacao)}
                          </span>
                        </div>
                        <h4 className="font-bold text-stone-800 truncate">{order.cliente_nome || 'Cliente'}</h4>
                        <div className="flex justify-between items-center mt-3">
                          <span className="text-sm font-bold text-emerald-600">R$ {order.valor_total.toFixed(2)}</span>
                          <ChevronRight className={`w-4 h-4 ${selectedOrderId === order.id ? 'text-emerald-500' : 'text-stone-300'}`} />
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedOrderForReport(order);
                          setIsModalOpen(true);
                        }}
                        className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 px-3 py-2 rounded-xl border border-orange-200"
                      >
                        <Megaphone className="w-3 h-3 text-orange-500" />
                        Denunciar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Order Details (Right Pane) */}
            <div className="hidden md:flex flex-1 flex-col bg-white overflow-hidden">
              {selectedOrder ? (
                <>
                  {/* Details Header */}
                  <div className="p-6 border-b border-stone-200 flex justify-between items-start bg-stone-50/30">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h2 className="text-2xl font-bold text-stone-800">Pedido #{selectedOrder.id.slice(-5).toUpperCase()}</h2>
                        {getStatusBadge(selectedOrder.status)}
                      </div>
                      <p className="text-sm text-stone-500 flex items-center gap-1">
                        <Clock className="w-4 h-4" /> Realizado às {formatTime(selectedOrder.data_criacao)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-stone-500 uppercase font-bold tracking-wider mb-1">Total do Pedido</p>
                      <p className="text-3xl font-bold text-emerald-600">R$ {selectedOrder.valor_total.toFixed(2)}</p>
                      <button 
                        onClick={() => { 
                          setSelectedOrderForReport(selectedOrder); 
                          setIsModalOpen(true); 
                        }} 
                        className="mt-2 flex items-center justify-center gap-2 text-sm font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 px-4 py-2 rounded-xl border border-orange-200"
                      >
                        <Megaphone className="w-4 h-4 text-orange-500" />
                        Denunciar Cliente
                      </button>
                    </div>
                  </div>

                  {/* Details Content */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      
                      {/* Left Column: Items */}
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <ShoppingBag className="w-4 h-4" /> Itens do Pedido
                          </h3>
                          <div className="space-y-4">
                            {selectedOrder.itens?.map((item, idx) => (
                              <div key={idx} className="flex gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                                <div className="w-8 h-8 bg-stone-200 text-stone-700 rounded-lg flex items-center justify-center font-bold shrink-0">
                                  {item.quantidade}x
                                </div>
                                <div className="flex-1">
                                  <div className="flex justify-between items-start">
                                    <h4 className="font-bold text-stone-800">{item.nome}</h4>
                                    <div className="flex flex-col items-end">
                                      {item.preco_original && item.preco_original > item.preco && (
                                        <span className="text-xs text-stone-400 line-through font-light">
                                          R$ {((item.preco_original + (item.adicionais || []).reduce((sum: number, extra: any) => sum + (extra.preco * extra.quantidade), 0)) * item.quantidade).toFixed(2)}
                                        </span>
                                      )}
                                      <span className="font-bold text-stone-600">R$ {((item.preco + (item.adicionais || []).reduce((sum: number, extra: any) => sum + (extra.preco * extra.quantidade), 0)) * item.quantidade).toFixed(2)}</span>
                                    </div>
                                  </div>
                                  {item.desconto_aplicado && item.desconto_aplicado > 0 && (
                                    <p className="text-xs font-bold text-emerald-600 mt-0.5">
                                      Desconto de R$ {(item.desconto_aplicado * item.quantidade).toFixed(2)} aplicado
                                    </p>
                                  )}
                                  {item.adicionais && item.adicionais.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {item.adicionais.map((extra: any, eIdx: number) => (
                                        <p key={eIdx} className="text-xs text-stone-500">
                                          + {extra.quantidade}x {extra.nome} (R$ {(extra.preco * extra.quantidade).toFixed(2)})
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                  {item.observacao && (
                                    <p className="text-sm text-orange-600 mt-1 bg-orange-50 p-2 rounded-lg border border-orange-100">
                                      <span className="font-bold">Obs:</span> {item.observacao}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100 space-y-2">
                          <div className="flex justify-between text-sm text-stone-600">
                            <span>Subtotal</span>
                            <span>R$ {selectedOrder.valor_produtos.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-stone-600">
                            <span>Taxa de Entrega</span>
                            <span>R$ {selectedOrder.taxa_entrega.toFixed(2)}</span>
                          </div>
                          {selectedOrder.valor_desconto > 0 && (
                            <div className="flex justify-between text-sm text-emerald-600 font-bold">
                              <span>Desconto {selectedOrder.cupom_codigo ? `(${selectedOrder.cupom_codigo})` : ''}</span>
                              <span>- R$ {selectedOrder.valor_desconto.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="pt-2 border-t border-stone-200 flex justify-between font-bold text-lg text-stone-800">
                            <span>Total</span>
                            <span className="text-emerald-600">R$ {selectedOrder.valor_total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Customer & Delivery */}
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <User className="w-4 h-4" /> Cliente
                          </h3>
                          <div className="p-4 border border-stone-200 rounded-2xl space-y-3">
                            <p className="font-bold text-stone-800 text-lg">{selectedOrder.cliente_nome || 'Cliente não identificado'}</p>
                            {selectedOrder.cliente_telefone && (
                              <p className="text-stone-600 flex items-center gap-2">
                                <Phone className="w-4 h-4 text-stone-400" /> {selectedOrder.cliente_telefone}
                              </p>
                            )}
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <MapPin className="w-4 h-4" /> Entrega
                          </h3>
                          <div className="p-4 border border-stone-200 rounded-2xl">
                            {selectedOrder.endereco_entrega ? (
                              <div className="space-y-1">
                                <p className="font-bold text-stone-800">
                                  {selectedOrder.endereco_entrega.rua}, {selectedOrder.endereco_entrega.numero}
                                </p>
                                <p className="text-stone-600 text-sm">
                                  {selectedOrder.endereco_entrega.bairro} - {selectedOrder.endereco_entrega.cidade}/{selectedOrder.endereco_entrega.estado}
                                </p>
                                {selectedOrder.endereco_entrega.complemento && (
                                  <p className="text-stone-500 text-sm mt-2">
                                    <span className="font-bold">Complemento:</span> {selectedOrder.endereco_entrega.complemento}
                                  </p>
                                )}
                                {selectedOrder.endereco_entrega.referencia && (
                                  <p className="text-emerald-700 text-sm mt-2 font-bold bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 italic">
                                    Referência: {selectedOrder.endereco_entrega.referencia}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-stone-500 italic">Retirada no local ou endereço não informado.</p>
                            )}
                          </div>
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <CreditCard className="w-4 h-4" /> Pagamento
                          </h3>
                          <div className="p-4 border border-stone-200 rounded-2xl flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                              <CreditCard className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-bold text-stone-800 uppercase">{selectedOrder?.forma_pagamento || 'Não informada'}</p>
                              <p className="text-xs text-stone-500 uppercase tracking-wider">Pagamento na entrega</p>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="p-6 border-t border-stone-200 bg-stone-50">
                    {selectedOrder.status === 'pendente' && (
                      <div className="flex gap-4 justify-end">
                        <button 
                          onClick={() => onUpdate(selectedOrder.id, 'rejeitado', 'Cancelado pelo restaurante')}
                          className="px-6 py-3 bg-white border-2 border-red-100 text-red-600 font-bold rounded-xl hover:bg-red-50 hover:border-red-200 transition-all flex items-center gap-2"
                        >
                          <X className="w-5 h-5" /> Rejeitar Pedido
                        </button>
                        <button 
                          onClick={() => onUpdate(selectedOrder.id, 'aceito')}
                          className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                        >
                          <Check className="w-5 h-5" /> Aceitar Pedido
                        </button>
                      </div>
                    )}

                    {selectedOrder.status === 'aceito' && (
                      <div className="flex gap-4 justify-end">
                        <button 
                          onClick={() => onUpdate(selectedOrder.id, 'despachado')}
                          className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center gap-2"
                        >
                          <Bike className="w-5 h-5" /> Despachar Pedido
                        </button>
                      </div>
                    )}

                    {selectedOrder.status === 'despachado' && (
                      <div className="flex gap-4 justify-end">
                        <button 
                          onClick={() => onUpdate(selectedOrder.id, 'finalizado')}
                          className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2"
                        >
                          <CheckCircle2 className="w-5 h-5" /> Concluir Pedido
                        </button>
                      </div>
                    )}
                    
                    {selectedOrder.status === 'finalizado' && (
                      <div className="flex justify-end">
                        <p className="text-emerald-600 font-bold flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5" /> Pedido Finalizado
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-stone-400 p-12 text-center">
                  <div className="w-24 h-24 bg-stone-50 rounded-full flex items-center justify-center mb-6">
                    <ShoppingBag className="w-12 h-12 text-stone-300" />
                  </div>
                  <h3 className="text-xl font-bold text-stone-800 mb-2">Nenhum pedido selecionado</h3>
                  <p className="max-w-sm">Selecione um pedido na lista ao lado para ver os detalhes, itens e endereço de entrega.</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-x-auto p-4 bg-stone-50">
          <div className="flex gap-4 h-full">
            {[
              { id: 'novo', label: 'Novo' },
              { id: 'confirmado', label: 'Confirmado / Aguardando' },
              { id: 'cozinha', label: 'Na cozinha' },
              { id: 'entrega', label: 'Saiu para entrega' },
              { id: 'finalizado', label: 'Finalizado' }
            ].map(col => (
              <div key={col.id} className="w-[280px] flex-shrink-0 flex flex-col bg-stone-100 rounded-2xl p-4 h-full">
                <h3 className="font-bold text-stone-700 mb-4">{col.label}</h3>
                <div className="flex-1 overflow-y-auto space-y-4">
                  {pedidosPorColuna[col.id].map(order => (
                    <KanbanCard key={order.id} order={order} onUpdate={onUpdate} onOpenSettlement={(ord) => setSettlementOrder(ord)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Restaurant Settlement Modal */}
      <RestaurantSettlementModal
        order={settlementOrder}
        isOpen={!!settlementOrder}
        onClose={() => setSettlementOrder(null)}
        onSuccess={() => {
          if (settlementOrder) {
            onUpdate(settlementOrder.id, 'finalizado');
          }
          setSettlementOrder(null);
        }}
      />

      {/* Report Modal - Rendered only once outside loops */}
      {isModalOpen && selectedOrderForReport && (
        <ReportModal
          orderId={selectedOrderForReport.id}
          restaurantId={(selectedOrderForReport as any).restaurant_id}
          clientId={selectedOrderForReport.cliente_id}
          reporterId={(selectedOrderForReport as any).restaurant_id}
          reportedId={selectedOrderForReport.cliente_id}
          reporterType="restaurant"
          onClose={() => {
            setIsModalOpen(false);
            setSelectedOrderForReport(null);
          }}
        />
      )}
    </div>
  );
}
