import React, { useState } from 'react';
import { Phone, MapPin, Navigation, CheckCircle, XCircle, DollarSign, MessageSquare, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import { AssignedOrder, LatLng } from '../types';
import { buildOrderAddressFormatted } from '../utils/deliveryAddress';
import { openSingleOrderInMaps } from '../services/driverMaps';

interface DriverOrderCardProps {
  order: AssignedOrder;
  canonicalStatus: string;
  currentLocation?: LatLng | null;
  isLoading?: boolean;
  onAccept?: (order: AssignedOrder) => void;
  onReject?: (order: AssignedOrder) => void;
  onStartDelivery?: (order: AssignedOrder) => void;
  onCompleteDelivery?: (order: AssignedOrder) => void;
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
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [failReason, setFailReason] = useState('');

  const formattedAddress = buildOrderAddressFormatted(order);
  const customerName = order.customerName || order.nome_cliente || order.cliente?.nome || 'Cliente';
  const customerPhone = order.customerPhone || order.telefone_cliente || order.cliente?.telefone || '';
  const cleanPhone = customerPhone.replace(/\D/g, '');

  const paymentMethod = order.paymentMethod || order.forma_pagamento || order.metodo_pagamento || 'Não informado';
  const totalValue = Number(order.total || order.valor_total || order.totalValue || 0);
  const isCollectPayment = order.paymentCollectedByDriver || !order.pago;

  const orderNumber = (order.id || '').slice(-6).toUpperCase();

  const getStatusBadge = () => {
    switch (canonicalStatus) {
      case 'DELIVERED':
        return { label: 'Entregue', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
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
          <h3 className="text-sm font-bold text-stone-900 tracking-tight">
            {customerName}
          </h3>
          <div className="flex items-start gap-1.5 mt-1 text-xs text-stone-600 leading-snug">
            <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-stone-800">{formattedAddress}</p>
              {(order.ponto_referencia || order.referencia) && (
                <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md inline-block mt-1 border border-amber-200/60">
                  Ref: {order.ponto_referencia || order.referencia}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Payment details & phone controls */}
        <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 text-stone-700">
            <DollarSign className="w-4 h-4 text-stone-400 shrink-0" />
            <div>
              <span className="font-semibold text-stone-800">{paymentMethod}</span>
              {isCollectPayment && totalValue > 0 && (
                <span className="ml-1.5 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  Cobrar R$ {totalValue.toFixed(2)}
                </span>
              )}
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
                  onClick={() => setShowCompleteConfirm(true)}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 shadow-xs"
                >
                  <CheckCircle className="w-4 h-4 text-white" />
                  Entregue
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject Confirmation Modal */}
      {showRejectConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-900">Confirmar Recusa</h3>
            <p className="text-xs text-stone-600">
              Tem certeza que deseja recusar o pedido #{orderNumber}? Ele retornará para atribuição.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectConfirm(false)}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-bold text-stone-700 hover:bg-stone-50 min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRejectConfirm(false);
                  onReject?.(order);
                }}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 min-h-[44px]"
              >
                Recusar Pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-900">Confirmar Entrega</h3>
            <p className="text-xs text-stone-600">
              Confirma a entrega do pedido #{orderNumber} para {customerName}?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-bold text-stone-700 hover:bg-stone-50 min-h-[44px]"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCompleteConfirm(false);
                  onCompleteDelivery?.(order);
                }}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 min-h-[44px]"
              >
                Confirmar Entrega
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fail Reason Modal */}
      {showFailModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-stone-900">Motivo de Não Entrega</h3>
            <p className="text-xs text-stone-600">
              Informe o motivo pelo qual o pedido #{orderNumber} não pôde ser entregue:
            </p>
            <textarea
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder="Ex: Cliente ausente, Endereço incorreto..."
              className="w-full h-24 p-3 rounded-xl border border-stone-300 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowFailModal(false);
                  setFailReason('');
                }}
                className="px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-bold text-stone-700 hover:bg-stone-50 min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!failReason.trim()}
                onClick={() => {
                  if (!failReason.trim()) return;
                  setShowFailModal(false);
                  onFailDelivery?.(order, failReason.trim());
                  setFailReason('');
                }}
                className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
              >
                Registrar Insucesso
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
