import React, { useState, useEffect } from 'react';
import { Phone, MapPin, Navigation, CheckCircle, XCircle, DollarSign, MessageSquare, AlertTriangle, ArrowUp, ArrowDown, Clock, Package, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { AssignedOrder, LatLng } from '../types';
import { buildOrderAddressFormatted } from '../utils/deliveryAddress';
import { openSingleOrderInMaps } from '../services/driverMaps';
import { DriverConfirmDeliveryModal } from './DriverConfirmDeliveryModal';

interface DriverOrderCardProps {
  order: AssignedOrder;
  canonicalStatus: string;
  currentLocation?: LatLng | null;
  isLoading?: boolean;
  onAccept?: (order: AssignedOrder) => void;
  onReject?: (order: AssignedOrder) => void;
  onStartDelivery?: (order: AssignedOrder) => void;
  onCompleteDelivery?: (order: AssignedOrder, paymentReport?: any) => void;
  onFailDelivery?: (order: AssignedOrder, reason: string) => void;
  // Reorder controls for Route tab
  isRouteTab?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export const DriverOrderCard: React.FC<DriverOrderCardProps> = ({
  order,
  canonicalStatus,
  currentLocation,
  isLoading = false,
  onAccept,
  onReject,
  onStartDelivery,
  onCompleteDelivery,
  onFailDelivery,
  isRouteTab = false,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown
}) => {
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [showFailModal, setShowFailModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [failReason, setFailReason] = useState('');
  const [showItems, setShowItems] = useState(false);

  const [customerName, setCustomerName] = useState<string>(
    order.cliente_nome || order.customerName || order.nome_cliente || order.cliente?.nome || 'Cliente'
  );

  useEffect(() => {
    const nameFromOrder = order.cliente_nome || order.customerName || order.nome_cliente || order.cliente?.nome || 'Cliente';
    if (nameFromOrder === 'Cliente' && order.cliente_id) {
      const fetchClientName = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', order.cliente_id));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setCustomerName(userData.nome || userData.displayName || 'Cliente');
          }
        } catch {
          // Handled gracefully
        }
      };
      fetchClientName();
    } else {
      setCustomerName(nameFromOrder);
    }
  }, [order.cliente_id, order.cliente_nome, order.customerName, order.nome_cliente, order.cliente?.nome]);

  const formattedAddress = buildOrderAddressFormatted(order);
  const customerPhone = order.cliente_telefone_whatsapp || order.cliente_telefone || order.customerPhone || order.telefone_cliente || order.telefone || order.cliente?.telefone || '';
  const cleanPhone = customerPhone.replace(/\D/g, '');

  const paymentMethod = order.paymentMethod || order.forma_pagamento || order.metodo_pagamento || 'Não informado';
  const totalValue = Number(order.total || order.valor_total || order.totalValue || 0);
  const isPaid = Boolean(order.pago || order.paymentStatus === 'PAID' || order.paymentStatus === 'SETTLED');
  const isCollectPayment = order.paymentCollectedByDriver || !isPaid;

  const orderNumber = order.numero_pedido || order.orderNumber || (typeof order.numero === 'number' || (typeof order.numero === 'string' && /^\d+$/.test(order.numero)) ? order.numero : (order.id || '').slice(-6).toUpperCase());

  const orderItems = Array.isArray(order.items) ? order.items : (Array.isArray(order.itens) ? order.itens : []);
  const orderNotes = order.observacoes || order.observacao || order.notes || order.observation || '';
  const orderReference = order.ponto_referencia || order.referencia || (typeof order.endereco_entrega === 'object' ? (order.endereco_entrega?.ponto_referencia || order.endereco_entrega?.referencia) : '');

  const getStatusBadge = () => {
    switch (canonicalStatus) {
      case 'DELIVERED_PENDING_SETTLEMENT':
        return { label: 'Entregue', bg: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'FINALIZED':
      case 'DELIVERED':
        return { label: 'Finalizado', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'IN_TRANSIT':
        return { label: 'Em Entrega', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'ACCEPTED':
        return { label: 'Na Rota', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'FAILED':
        return { label: 'Não Entregue', bg: 'bg-red-50 text-red-700 border-red-200' };
      case 'CANCELLED':
        return { label: 'Cancelado', bg: 'bg-stone-100 text-stone-600 border-stone-200' };
      case 'ASSIGNED':
      default:
        return { label: 'Novo Pedido', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden transition-all hover:shadow-md mb-3">
      {/* Top bar with Order ID & Status */}
      <div className="bg-stone-50/80 px-4 py-2.5 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-stone-900 tracking-tight">
            #{orderNumber}
          </span>
          {order.origem && (
            <span className="text-[10px] font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded-md uppercase">
              {order.origem}
            </span>
          )}
          {order.distancia_km && (
            <span className="text-[11px] font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
              {order.distancia_km} km
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Move Up/Down Controls in Route Tab */}
          {isRouteTab && (
            <div className="flex items-center gap-1 mr-1">
              {onMoveUp && (
                <button
                  type="button"
                  onClick={onMoveUp}
                  disabled={!canMoveUp}
                  className="p-1 rounded-lg border border-stone-200 bg-white text-stone-600 disabled:opacity-30 disabled:pointer-events-none hover:bg-stone-100 active:scale-95"
                  title="Mover para cima"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
              )}
              {onMoveDown && (
                <button
                  type="button"
                  onClick={onMoveDown}
                  disabled={!canMoveDown}
                  className="p-1 rounded-lg border border-stone-200 bg-white text-stone-600 disabled:opacity-30 disabled:pointer-events-none hover:bg-stone-100 active:scale-95"
                  title="Mover para baixo"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full border ${badge.bg}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Main card details */}
      <div className="p-4 space-y-3">
        {/* Customer & Address */}
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-stone-900 tracking-tight">
              {customerName}
            </h3>
            {customerPhone && (
              <span className="text-[11px] text-stone-500 font-medium">{customerPhone}</span>
            )}
          </div>

          <div className="flex items-start gap-1.5 mt-1.5 text-xs text-stone-600 leading-snug">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-stone-800">{formattedAddress}</p>
              {orderReference && (
                <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md inline-block mt-1 border border-amber-200/60 font-medium">
                  Ref: {orderReference}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Order Observations */}
        {orderNotes && (
          <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200/70 text-xs text-amber-900 flex items-start gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Obs:</span> {orderNotes}
            </div>
          </div>
        )}

        {/* Order Items Expandable */}
        {orderItems.length > 0 && (
          <div className="pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setShowItems(prev => !prev)}
              className="flex items-center justify-between w-full text-xs font-bold text-stone-700 hover:text-stone-900 py-0.5"
            >
              <span className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-stone-500" />
                Itens do Pedido ({orderItems.reduce((acc: number, i: any) => acc + (Number(i.quantity || i.quantidade || 1)), 0)})
              </span>
              <span className="text-[11px] text-stone-500 font-semibold flex items-center gap-0.5">
                {showItems ? <>Ocultar <ChevronUp className="w-3.5 h-3.5" /></> : <>Ver itens <ChevronDown className="w-3.5 h-3.5" /></>}
              </span>
            </button>

            {showItems && (
              <div className="mt-2 space-y-1.5 bg-stone-50 p-2.5 rounded-xl border border-stone-100 text-xs text-stone-700">
                {orderItems.map((item: any, idx: number) => {
                  const qty = item.quantity || item.quantidade || 1;
                  const name = item.name || item.productName || item.nome || item.nome_produto || 'Item';
                  const itemNotes = item.notes || item.observacoes || item.observacao || '';
                  const itemPrice = Number(item.price || item.preco || item.unitPrice || 0);

                  return (
                    <div key={idx} className="flex flex-col border-b border-stone-200/50 pb-1.5 last:border-b-0 last:pb-0">
                      <div className="flex justify-between items-baseline">
                        <span className="font-semibold text-stone-900">{qty}x {name}</span>
                        {itemPrice > 0 && (
                          <span className="text-stone-500 text-[11px]">R$ {(itemPrice * qty).toFixed(2)}</span>
                        )}
                      </div>
                      {itemNotes && (
                        <span className="text-[11px] text-stone-500 italic pl-3">Obs: {itemNotes}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Payment details & phone controls */}
        <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 text-stone-700">
            <DollarSign className="w-4 h-4 text-stone-400 shrink-0" />
            <div>
              <span className="font-semibold text-stone-800">{paymentMethod}</span>
              {isPaid ? (
                <span className="ml-1.5 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 text-[11px]">
                  Pago Online
                </span>
              ) : isCollectPayment && totalValue > 0 ? (
                <span className="ml-1.5 font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[11px]">
                  Cobrar R$ {totalValue.toFixed(2)}
                </span>
              ) : null}
            </div>
          </div>

          {/* Call & WhatsApp buttons */}
          {cleanPhone && (
            <div className="flex items-center gap-1.5">
              <a
                href={`tel:${cleanPhone}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition-all active:scale-95"
              >
                <Phone className="w-3.5 h-3.5 text-stone-600" />
                <span>Ligar</span>
              </a>
              <a
                href={`https://wa.me/55${cleanPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold border border-emerald-200 transition-all active:scale-95"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Whats</span>
              </a>
            </div>
          )}
        </div>

        {/* Failure reason if FAILED */}
        {canonicalStatus === 'FAILED' && (order.failureReason || order.motivo_falha) && (
          <div className="p-2.5 bg-red-50 rounded-xl border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Motivo do insucesso:</span> {order.failureReason || order.motivo_falha}
            </div>
          </div>
        )}

        {/* Action buttons by Status */}
        <div className="pt-2 border-t border-stone-100">
          {canonicalStatus === 'ASSIGNED' && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => setShowRejectConfirm(true)}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-bold transition-all active:scale-95 text-center"
                >
                  Recusar
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => onAccept?.(order)}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold transition-all active:scale-95 text-center flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Aceitar
                </button>
              </div>
              <button
                type="button"
                onClick={() => openSingleOrderInMaps(order, currentLocation)}
                className="w-full min-h-[40px] py-2 px-3 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-700 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-4 h-4 text-emerald-600" />
                Ver no Maps
              </button>
            </div>
          )}

          {canonicalStatus === 'ACCEPTED' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openSingleOrderInMaps(order, currentLocation)}
                className="min-h-[44px] py-2.5 px-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-4 h-4 text-emerald-600" />
                Abrir Maps
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => onStartDelivery?.(order)}
                className="min-h-[44px] py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-xs"
              >
                Iniciar Entrega
              </button>
            </div>
          )}

          {canonicalStatus === 'IN_TRANSIT' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => openSingleOrderInMaps(order, currentLocation)}
                className="w-full min-h-[44px] py-2.5 px-3 rounded-xl border border-stone-300 bg-stone-50 hover:bg-stone-100 text-stone-800 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Navigation className="w-4 h-4 text-emerald-600" />
                Navegar no Google Maps
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => setShowFailModal(true)}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1"
                >
                  <XCircle className="w-4 h-4 text-red-600" />
                  Não Entregue
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => setShowCompleteModal(true)}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 shadow-xs"
                >
                  <CheckCircle className="w-4 h-4 text-white" />
                  Entregue
                </button>
              </div>
            </div>
          )}

          {canonicalStatus === 'DELIVERED_PENDING_SETTLEMENT' && (
            <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-semibold">Aguardando conferência do restaurante</span>
            </div>
          )}

          {(canonicalStatus === 'FINALIZED' || (canonicalStatus === 'DELIVERED' && order.financialSettlementStatus === 'SETTLED')) && (
            <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-semibold">Conferência financeira concluída pelo restaurante</span>
            </div>
          )}
        </div>
      </div>

      {/* Driver Confirm Delivery Payment Modal */}
      <DriverConfirmDeliveryModal
        order={order}
        isOpen={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        isLoading={isLoading}
        onConfirm={(paymentReport) => {
          setShowCompleteModal(false);
          onCompleteDelivery?.(order, paymentReport);
        }}
      />

      {/* Fail Modal */}
      {showFailModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2 bg-red-100 rounded-xl">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">Não foi possível entregar</h4>
                <p className="text-xs text-stone-500">Informe o motivo da não entrega</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-700 uppercase tracking-wider block">
                Motivo *
              </label>
              <textarea
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                placeholder="Ex: Cliente ausente, endereço não localizado, recusado pelo cliente..."
                rows={3}
                className="w-full bg-stone-50 border border-stone-300 rounded-xl text-xs text-stone-900 p-3 focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setShowFailModal(false)}
                className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isLoading || !failReason.trim()}
                onClick={() => {
                  setShowFailModal(false);
                  onFailDelivery?.(order, failReason.trim());
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {showRejectConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-stone-900">
              <div className="p-2 bg-stone-100 rounded-xl text-stone-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-stone-900 text-sm">Recusar Entrega</h4>
                <p className="text-xs text-stone-500">Deseja realmente recusar esta entrega?</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setShowRejectConfirm(false)}
                className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-colors"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setShowRejectConfirm(false);
                  onReject?.(order);
                }}
                className="flex-1 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs rounded-xl transition-colors"
              >
                Sim, Recusar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

