import React, { useState } from 'react';
import { 
  ShoppingBag, Clock, User, MapPin, CreditCard, Save, Edit2, ArrowLeft, Printer, X, Check, RefreshCcw, Bike, DollarSign, AlertCircle, ShieldCheck, FileText
} from 'lucide-react';
import { getRestaurantStatusText, getStatusColor } from './OrderListItem';
import { db } from '../../../firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { getPaymentStatusInfo } from '../../../utils/paymentStatus';

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
  isEditingPayment: boolean;
  handleSavePayment: () => void;
  handleEditPayment: () => void;
  editPaymentMethod: string;
  setEditPaymentMethod: (method: string) => void;
  editTroco: string;
  setEditTroco: (troco: string) => void;
  onUpdate: (orderId: string, status: string, motivo?: string) => void;
  handleTogglePaid: () => void;
  onRefund?: (orderId: string, amount?: number) => void;
  isUpdating?: boolean;
}

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
  isEditingPayment,
  handleSavePayment,
  handleEditPayment,
  editPaymentMethod,
  setEditPaymentMethod,
  editTroco,
  setEditTroco,
  onUpdate,
  handleTogglePaid,
  onRefund,
  isUpdating = false
}: OrderDetailsProps) => {
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);

  // Settlement modal state
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementAmount, setSettlementAmount] = useState<string>('');
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [isSettling, setIsSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const { user } = useAuth();
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [restaurantDrivers, setRestaurantDrivers] = useState<any[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const paymentInfo = getPaymentStatusInfo(
    selectedOrder?.paymentStatus,
    selectedOrder?.pago,
    selectedOrder?.forma_pagamento,
    selectedOrder?.paymentCollectedByDriver
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
    if (!selectedOrder?.restaurant_id) return;
    setLoadingDrivers(true);
    setAssignError(null);
    try {
      const driversRef = collection(db, 'restaurants', selectedOrder.restaurant_id, 'drivers');
      const q = query(driversRef, where('status', '==', 'ACTIVE'));
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRestaurantDrivers(list);
    } catch (error: any) {
      console.error("Erro ao carregar entregadores:", error);
      setAssignError("Erro de acesso ao banco. Verifique suas regras ou permissões de leitura.");
    } finally {
      setLoadingDrivers(false);
    }
  };

  const handleAssignDriver = async (driver: any) => {
    if (!selectedOrder?.restaurant_id || !selectedOrder?.id) return;
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
    if (!onRefund) return;
    setIsRefunding(true);
    try {
      const amount = refundAmount ? parseFloat(refundAmount.replace(',', '.')) : undefined;
      await onRefund(selectedOrder.id, amount);
      setShowRefundModal(false);
      setRefundAmount('');
    } catch (error) {
      console.error("Erro ao estornar:", error);
      alert("Erro ao realizar estorno. Tente novamente.");
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
      <div className="shrink-0 p-6 border-b border-stone-100 bg-stone-50 flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSelectedOrder(null)}
              className="lg:hidden p-2 -ml-2 text-stone-500 hover:text-stone-800 hover:bg-stone-200 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-stone-800">Pedido #{selectedOrder.id.slice(-6).toUpperCase()}</h2>
              <p className="text-sm text-stone-500">Feito em {new Date(selectedOrder.data_criacao).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative group">
              <button className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-sm font-bold transition-colors" onClick={() => handlePrint(selectedOrder)}>
                <Printer className="w-4 h-4" /> Imprimir
              </button>
              <div className="absolute right-0 top-full mt-2 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden hidden group-hover:block z-10 w-32">
                <button onClick={() => handlePrint(selectedOrder, '48mm')} className="w-full text-left px-4 py-2 text-sm hover:bg-stone-50 font-bold text-stone-700">48mm</button>
                <button onClick={() => handlePrint(selectedOrder, '72mm')} className="w-full text-left px-4 py-2 text-sm hover:bg-stone-50 font-bold text-stone-700">72mm</button>
                <button onClick={() => handlePrint(selectedOrder, '112mm')} className="w-full text-left px-4 py-2 text-sm hover:bg-stone-50 font-bold text-stone-700">112mm</button>
              </div>
            </div>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-xl uppercase tracking-wider ${getStatusColor(selectedOrder.status)}`}>
              {getRestaurantStatusText(selectedOrder.status)}
            </span>
          </div>
        </div>

        {/* Status Badges Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1 border-t border-stone-200/60">
          <div className="bg-white p-2.5 rounded-xl border border-stone-200/80 flex items-center justify-between">
            <span className="text-stone-400 font-bold uppercase text-[10px]">Status Pedido:</span>
            <span className="font-extrabold text-stone-800 uppercase">{getRestaurantStatusText(selectedOrder.status)}</span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-stone-200/80 flex items-center justify-between">
            <span className="text-stone-400 font-bold uppercase text-[10px]">Entrega:</span>
            <span className={`font-extrabold uppercase ${
              selectedOrder.deliveryStatus === 'DELIVERED' ? 'text-emerald-700' :
              selectedOrder.deliveryStatus === 'PICKED_UP' ? 'text-blue-700' :
              selectedOrder.deliveryStatus === 'ACCEPTED' ? 'text-indigo-700' :
              selectedOrder.deliveryStatus === 'FAILED' ? 'text-rose-700' : 'text-stone-600'
            }`}>
              {selectedOrder.deliveryStatus === 'DELIVERED' ? 'Entregue' :
               selectedOrder.deliveryStatus === 'PICKED_UP' ? 'Em Rota' :
               selectedOrder.deliveryStatus === 'ACCEPTED' ? 'Aceito' :
               selectedOrder.deliveryStatus === 'FAILED' ? 'Falhou' :
               selectedOrder.assignedDriverId ? 'Atribuído' : 'Não Atribuído'}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded-xl border border-stone-200/80 flex items-center justify-between">
            <span className="text-stone-400 font-bold uppercase text-[10px]">Financeiro:</span>
            <span className={`font-extrabold uppercase ${paymentInfo.color}`}>
              {paymentInfo.label}
            </span>
          </div>
        </div>

        {/* Banner de Aguardando Baixa do Entregador */}
        {(selectedOrder.paymentStatus === 'AWAITING_DRIVER_SETTLEMENT' || (selectedOrder.paymentCollectedByDriver && !selectedOrder.pago)) && (
          <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5">
                <DollarSign className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-amber-950">Pagamento Recebido pelo Entregador</h4>
                <p className="text-xs text-amber-800 font-medium leading-relaxed mt-0.5">
                  O entregador <strong>{selectedOrder.assignedDriverName || selectedOrder.driverName || 'designado'}</strong> confirmou o recebimento na entrega. Aguardando repasse ao restaurante.
                </p>
              </div>
            </div>

            <button
              onClick={handleOpenSettlement}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-200 shrink-0 self-start sm:self-center"
            >
              Confirmar Baixa
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-6 pr-2 space-y-8 custom-scrollbar">
        {/* Delivery Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4" /> Cliente
            </h3>
            {loadingDetails ? (
              <div className="animate-pulse h-10 bg-stone-100 rounded-xl"></div>
            ) : (
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <p className="font-bold text-stone-800">{customerData?.nome || customerData?.displayName || selectedOrder.cliente_nome || 'Cliente não encontrado'}</p>
                {(customerData?.telefone || selectedOrder.cliente_telefone) && (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-stone-500">{customerData?.telefone || selectedOrder.cliente_telefone}</p>
                    <a 
                      href={`https://wa.me/55${(customerData?.telefone || selectedOrder.cliente_telefone).replace(/\D/g, '')}?text=Ol%C3%A1%20${encodeURIComponent(customerData?.nome || customerData?.displayName || selectedOrder.cliente_nome || '')},%20somos%20do%20restaurante%20e%20gostar%C3%ADamos%20de%20falar%20sobre%20o%20seu%20pedido%20%23${selectedOrder.id.slice(-6).toUpperCase()}.`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-emerald-500 hover:text-emerald-600 transition-colors bg-emerald-50 p-1.5 rounded-lg"
                      title="Chamar no WhatsApp"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4" /> {selectedOrder.tipo_entrega === 'retirada' ? 'Retirada' : 'Entrega'}
              </h3>
              {selectedOrder.tipo_entrega !== 'retirada' && !['entregue', 'finalizado', 'cancelado', 'rejeitado'].includes(selectedOrder.status) && (
                <button 
                  onClick={isEditingAddress ? handleSaveAddress : handleEditAddress}
                  className="text-emerald-600 hover:text-emerald-700 p-1"
                >
                  {isEditingAddress ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                </button>
              )}
            </div>
            {loadingDetails ? (
              <div className="animate-pulse h-16 bg-stone-100 rounded-xl"></div>
            ) : (
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                {selectedOrder.tipo_entrega === 'retirada' ? (
                  <p className="text-sm font-bold text-emerald-600">Cliente irá retirar no local</p>
                ) : isEditingAddress ? (
                  <div className="space-y-2">
                    <input 
                      type="text" 
                      placeholder="Rua" 
                      value={editAddress.rua || ''} 
                      onChange={e => setEditAddress({...editAddress, rua: e.target.value})}
                      className="w-full p-2 text-sm border border-stone-200 rounded-lg"
                    />
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Número" 
                        value={editAddress.numero || ''} 
                        onChange={e => setEditAddress({...editAddress, numero: e.target.value})}
                        className="w-1/3 p-2 text-sm border border-stone-200 rounded-lg"
                      />
                      <input 
                        type="text" 
                        placeholder="Bairro" 
                        value={editAddress.bairro || ''} 
                        onChange={e => setEditAddress({...editAddress, bairro: e.target.value})}
                        className="w-2/3 p-2 text-sm border border-stone-200 rounded-lg"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Cidade" 
                        value={editAddress.cidade || ''} 
                        onChange={e => setEditAddress({...editAddress, cidade: e.target.value})}
                        className="w-2/3 p-2 text-sm border border-stone-200 rounded-lg"
                      />
                      <input 
                        type="text" 
                        placeholder="UF" 
                        value={editAddress.estado || ''} 
                        onChange={e => setEditAddress({...editAddress, estado: e.target.value})}
                        className="w-1/3 p-2 text-sm border border-stone-200 rounded-lg"
                      />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Complemento" 
                      value={editAddress.complemento || ''} 
                      onChange={e => setEditAddress({...editAddress, complemento: e.target.value})}
                      className="w-full p-2 text-sm border border-stone-200 rounded-lg"
                    />
                  </div>
                ) : addressData ? (
                  <>
                    <p className="font-bold text-stone-800">{addressData.rua}, {addressData.numero}</p>
                    <p className="text-sm text-stone-500">{addressData.bairro}, {addressData.cidade} - {addressData.estado}</p>
                    {addressData.complemento && <p className="text-sm text-stone-500">Comp: {addressData.complemento}</p>}
                    {addressData.referencia && (
                      <p className="text-sm text-emerald-600 font-bold mt-1 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                        Ponto de Referência: {addressData.referencia}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-stone-500">Endereço não encontrado.</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Pagamento
              </h3>
              {!['entregue', 'finalizado', 'cancelado', 'rejeitado'].includes(selectedOrder.status) && !selectedOrder.mercadopago_payment_id && (
                <button 
                  onClick={isEditingPayment ? handleSavePayment : handleEditPayment}
                  className="text-emerald-600 hover:text-emerald-700 p-1"
                >
                  {isEditingPayment ? <Save className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                </button>
              )}
            </div>
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
              {isEditingPayment ? (
                <div className="space-y-2">
                  <select 
                    value={editPaymentMethod} 
                    onChange={e => setEditPaymentMethod(e.target.value)}
                    className="w-full p-2 text-sm border border-stone-200 rounded-lg"
                  >
                    <option value="dinheiro">Dinheiro</option>
                    <option value="credito">Crédito</option>
                    <option value="debito">Débito</option>
                    <option value="chave_pix">Chave Pix</option>
                    <option value="pix_copia_cola">Pix Copia e Cola</option>
                  </select>
                  {editPaymentMethod === 'dinheiro' && (
                    <input 
                      type="text" 
                      placeholder="Troco para (ex: 50)" 
                      value={editTroco} 
                      onChange={e => setEditTroco(e.target.value)}
                      className="w-full p-2 text-sm border border-stone-200 rounded-lg"
                    />
                  )}
                </div>
              ) : (
                <>
                  <p className="font-bold text-stone-800 uppercase">
                    {selectedOrder?.mercadopago_payment_id && selectedOrder?.forma_pagamento === 'pix' 
                      ? 'Pix Mercado Pago' 
                      : selectedOrder?.forma_pagamento === 'chave_pix'
                      ? 'Chave Pix'
                      : selectedOrder?.forma_pagamento === 'pix_copia_cola'
                      ? 'Pix Copia e Cola'
                      : selectedOrder?.forma_pagamento || 'Não informada'}
                  </p>
                  {selectedOrder?.forma_pagamento === 'dinheiro' && selectedOrder?.troco && (
                    <p className="text-sm text-emerald-600 font-bold mt-1">Troco para: {selectedOrder?.troco}</p>
                  )}
                  {selectedOrder?.estornado && (
                    <p className="text-sm text-red-600 font-bold mt-1">
                      Estornado: R$ {Number(selectedOrder.valor_estornado || selectedOrder.valor_total).toFixed(2)}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={selectedOrder.pago || false}
                      onChange={handleTogglePaid}
                      disabled={
                        ['entregue', 'finalizado', 'cancelado', 'rejeitado'].includes(selectedOrder.status) || 
                        (selectedOrder.forma_pagamento === 'pix' && !!selectedOrder.mercadopago_payment_id)
                      }
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm font-bold text-stone-700">Pedido Pago</span>
                  </div>
                  
                  {/* Botão de Estorno Mercado Pago */}
                  {selectedOrder?.mercadopago_payment_id && selectedOrder?.pago && !selectedOrder?.estornado && onRefund && (
                    <button
                      onClick={() => setShowRefundModal(true)}
                      className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-bold transition-colors"
                    >
                      <RefreshCcw className="w-4 h-4" /> Estornar Pagamento
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {selectedOrder.tipo_entrega !== 'retirada' && (
          <div className="bg-stone-50 p-6 rounded-2xl border border-stone-100 space-y-4">
            <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
              <Bike className="w-4 h-4" /> Status da Entrega
            </h3>
            {selectedOrder.assignedDriverId ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-stone-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                    <Bike className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-stone-800">{selectedOrder.assignedDriverName || selectedOrder.driverName || 'Entregador'}</h4>
                    {selectedOrder.assignedDriverPhone && (
                      <p className="text-sm text-stone-500 flex items-center gap-1.5 mt-0.5">
                        <span>Telefone: {selectedOrder.assignedDriverPhone}</span>
                        <a 
                          href={`https://wa.me/55${selectedOrder.assignedDriverPhone.replace(/\D/g, '')}`}
                          target="_blank" 
                          rel="noreferrer"
                          className="text-emerald-600 hover:underline font-bold text-xs"
                        >
                          (Chamar no WhatsApp)
                        </a>
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    selectedOrder.deliveryStatus === 'ACCEPTED' ? 'bg-indigo-50 text-indigo-600' :
                    selectedOrder.deliveryStatus === 'PICKED_UP' ? 'bg-amber-50 text-amber-600' :
                    selectedOrder.deliveryStatus === 'DELIVERED' ? 'bg-emerald-50 text-emerald-600' :
                    selectedOrder.deliveryStatus === 'REFUSED' ? 'bg-red-50 text-red-600' :
                    selectedOrder.deliveryStatus === 'FAILED' ? 'bg-stone-100 text-stone-600' :
                    'bg-yellow-50 text-yellow-600'
                  }`}>
                    {selectedOrder.deliveryStatus === 'ACCEPTED' ? 'Aceito' :
                     selectedOrder.deliveryStatus === 'PICKED_UP' ? 'Em Entrega' :
                     selectedOrder.deliveryStatus === 'DELIVERED' ? 'Entregue' :
                     selectedOrder.deliveryStatus === 'REFUSED' ? 'Recusado' :
                     selectedOrder.deliveryStatus === 'FAILED' ? 'Falhou / Devolvido' :
                     'Pendente Aceite'}
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
        )}

        {/* Items */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" /> Itens do Pedido
          </h3>
          <div className="bg-stone-50 rounded-2xl border border-stone-100 overflow-hidden">
            {selectedOrder.itens?.map((item: any, idx: number) => {
              const extrasTotal = (item.adicionais || []).reduce((sum: number, extra: any) => sum + (extra.preco * extra.quantidade), 0);
              const itemTotal = (item.preco + extrasTotal) * item.quantidade;

              return (
                <div key={idx} className="p-4 border-b border-stone-100 last:border-0 flex justify-between items-start">
                  <div>
                    <p className="font-bold text-stone-800"><span className="text-emerald-600 mr-2">{item.quantidade}x</span> {item.nome}</p>
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
                    {item.observacao && <p className="text-xs text-stone-500 mt-1 italic">Obs: {item.observacao}</p>}
                  </div>
                  <div className="flex flex-col items-end">
                    {item.preco_original && item.preco_original > item.preco && (
                      <span className="text-xs text-stone-400 line-through font-light">
                        R$ {((item.preco_original + extrasTotal) * item.quantidade).toFixed(2)}
                      </span>
                    )}
                    <p className="font-bold text-stone-800">R$ {itemTotal.toFixed(2)}</p>
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
      <div className="shrink-0 p-4 border-t border-stone-100 bg-white sticky bottom-0 z-10">
        {selectedOrder.status === 'pendente' && (
          <div className="flex gap-4">
            <button 
              onClick={() => {
                onUpdate(selectedOrder.id, 'rejeitado', 'Pedido cancelado pelo restaurante');
              }}
              disabled={isUpdating}
              className="flex-1 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5" /> Rejeitar Pedido
            </button>
            <button 
              onClick={() => {
                onUpdate(selectedOrder.id, 'aceito');
              }}
              disabled={isUpdating}
              className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:bg-emerald-400 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
            >
              {isUpdating ? <Clock className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
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
            className="w-full py-3 bg-yellow-500 text-white font-bold rounded-xl hover:bg-yellow-600 disabled:bg-yellow-300 shadow-lg shadow-yellow-200 transition-all flex items-center justify-center gap-2"
          >
            {isUpdating ? <Clock className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
            {isUpdating ? 'Processando...' : 'Iniciar Preparo'}
          </button>
        )}

        {selectedOrder.status === 'preparo' && (
          <button 
            onClick={() => {
              onUpdate(selectedOrder.id, 'pronto');
            }}
            disabled={isUpdating}
            className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 disabled:bg-emerald-300 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
          >
            {isUpdating ? <Clock className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {isUpdating ? 'Processando...' : 'Marcar como Pronto'}
          </button>
        )}

        {selectedOrder.status === 'pronto' && (
          <button 
            onClick={() => {
              const nextStatus = selectedOrder.tipo_entrega === 'retirada' ? 'entregue' : 'entrega';
              onUpdate(selectedOrder.id, nextStatus);
            }}
            disabled={isUpdating || (selectedOrder.tipo_entrega === 'retirada' && !selectedOrder.pago)}
            title={selectedOrder.tipo_entrega === 'retirada' && !selectedOrder.pago ? 'Marque o pedido como pago antes de finalizar' : ''}
            className={`w-full py-3 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              (isUpdating || (selectedOrder.tipo_entrega === 'retirada' && !selectedOrder.pago))
                ? 'bg-stone-300 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200'
            }`}
          >
            {isUpdating ? <Clock className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {isUpdating ? 'Processando...' : (selectedOrder.tipo_entrega === 'retirada' ? 'Marcar como Entregue' : 'Saiu para Entrega')}
          </button>
        )}

        {selectedOrder.status === 'entrega' && (
          <button 
            onClick={() => {
              onUpdate(selectedOrder.id, 'entregue');
            }}
            disabled={isUpdating || !selectedOrder.pago}
            title={!selectedOrder.pago ? 'Marque o pedido como pago antes de finalizar' : ''}
            className={`w-full py-3 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
              (isUpdating || !selectedOrder.pago)
                ? 'bg-stone-300 cursor-not-allowed' 
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200'
            }`}
          >
            {isUpdating ? <Clock className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {isUpdating ? 'Processando...' : 'Marcar como Entregue'}
          </button>
        )}

        {['aceito', 'preparo', 'pronto', 'entrega'].includes(selectedOrder.status) && (
          <button 
            onClick={() => {
              onUpdate(selectedOrder.id, 'cancelado', 'Cancelado pelo restaurante');
            }}
            disabled={isUpdating}
            className="w-full mt-3 py-3 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            <X className="w-5 h-5" /> Cancelar Pedido
          </button>
        )}

        {selectedOrder.tipo_entrega !== 'retirada' && ['aceito', 'preparo', 'pronto', 'entrega'].includes(selectedOrder.status) && (
          <button 
            onClick={() => {
              fetchDrivers();
              setIsAssignModalOpen(true);
            }}
            className="w-full mt-3 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
          >
            <Bike className="w-5 h-5" /> Enviar para Entregador
          </button>
        )}
        
        {['entregue', 'finalizado', 'cancelado', 'rejeitado'].includes(selectedOrder.status) && (
          <div className="text-center text-stone-400 font-bold py-2">
            Este pedido já foi {getRestaurantStatusText(selectedOrder.status).toLowerCase()}.
          </div>
        )}
      </div>
      {/* Modal de Estorno */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-stone-800">Estornar Pagamento</h3>
              <button 
                onClick={() => setShowRefundModal(false)}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                disabled={isRefunding}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-sm text-stone-600">
                O valor total do pedido é de <strong className="text-stone-800">R$ {Number(selectedOrder.valor_total).toFixed(2)}</strong>.
              </p>
              
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">
                  Valor do Estorno (R$)
                </label>
                <input
                  type="text"
                  placeholder={`Ex: ${Number(selectedOrder.valor_total).toFixed(2)}`}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full p-3 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  disabled={isRefunding}
                />
                <p className="text-xs text-stone-500 mt-1">
                  Deixe em branco para estornar o valor total. Use ponto ou vírgula para centavos.
                </p>
              </div>

              <div className="flex gap-3 pt-4">
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
            </div>
          </div>
        </div>
      )}

      {/* Modal de Baixa com Entregador */}
      {showSettlementModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fade-in text-left">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2 text-emerald-700">
                <DollarSign className="w-6 h-6 stroke-[2.5]" />
                <h3 className="text-lg font-bold text-stone-900">Baixa Financeira com Entregador</h3>
              </div>
              <button 
                onClick={() => setShowSettlementModal(false)}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                disabled={isSettling}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100 space-y-1.5 text-xs">
              <p className="text-stone-600">
                <strong className="text-stone-800">Pedido:</strong> #{selectedOrder.id.slice(-6).toUpperCase()}
              </p>
              <p className="text-stone-600">
                <strong className="text-stone-800">Entregador:</strong> {selectedOrder.assignedDriverName || selectedOrder.driverName || 'Não especificado'}
              </p>
              <p className="text-stone-600">
                <strong className="text-stone-800">Forma de Pagamento:</strong> <span className="uppercase font-bold">{selectedOrder.forma_pagamento || 'Dinheiro/Entrega'}</span>
              </p>
              <p className="text-stone-600">
                <strong className="text-stone-800">Valor Total do Pedido:</strong> <span className="font-extrabold text-emerald-700">R$ {Number(selectedOrder.valor_total || 0).toFixed(2)}</span>
              </p>
            </div>

            {settleError && (
              <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{settleError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Valor Repassado / Confirmado (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                  className="w-full p-3 border border-stone-200 rounded-xl font-bold text-stone-900 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  placeholder="0.00"
                  disabled={isSettling}
                />
                {parseFloat(settlementAmount || '0') !== Number(selectedOrder.valor_total || 0) && (
                  <p className="text-[11px] text-amber-700 font-medium mt-1">
                    ⚠️ Atenção: O valor digitado difere do valor total do pedido.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Observações de Baixa (opcional)
                </label>
                <textarea
                  rows={2}
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  className="w-full p-2.5 border border-stone-200 rounded-xl text-xs text-stone-800 focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder="Ex: Valor recebido integralmente em dinheiro no caixa..."
                  disabled={isSettling}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-stone-100">
              <button
                onClick={() => setShowSettlementModal(false)}
                className="flex-1 py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
                disabled={isSettling}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSettlement}
                disabled={isSettling}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSettling ? (
                  <>
                    <RefreshCcw className="w-4 h-4 animate-spin" />
                    Baixando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar Baixa
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Atribuição de Entregador */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in text-left">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-stone-100 flex-shrink-0">
              <div>
                <h3 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                  <Bike className="text-indigo-600" /> Atribuir Entregador
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">Pedido #{selectedOrder.id.slice(-6).toUpperCase()} • R$ {Number(selectedOrder.valor_total).toFixed(2)}</p>
              </div>
              <button 
                onClick={() => setIsAssignModalOpen(false)}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {assignError && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl font-medium flex items-center gap-2">
                <span className="font-bold">!</span> {assignError}
              </div>
            )}

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 py-2 custom-scrollbar min-h-0">
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

            <div className="pt-4 border-t border-stone-100 flex-shrink-0 flex justify-end gap-3">
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="py-2.5 px-5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl transition-colors text-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetails;
