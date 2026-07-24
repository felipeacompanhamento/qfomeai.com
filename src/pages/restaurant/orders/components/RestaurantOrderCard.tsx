import React, { useState } from 'react';
import { 
  Clock, MapPin, Phone, Printer, MoreVertical, DollarSign, User, Truck, 
  Store, ShoppingBag, UtensilsCrossed, CheckCircle2, AlertTriangle, ArrowRight 
} from 'lucide-react';
import { getCanonicalOrderState, getOrderKanbanColumn, normalizeOrderStatus, normalizeDeliveryStatus, normalizeFinancialSettlementStatus } from '../../../../domain/order/orderLifecycle';
import { getOrderSourceDetails } from '../utils/orderSource';
import { getOrderStageTimeInfo } from '../utils/orderPresentation';

interface RestaurantOrderCardProps {
  order: any;
  nowMs: number;
  isSelected?: boolean;
  isUpdating?: boolean;
  onOrderClick: (order: any) => void;
  onUpdateStatus?: (orderId: string, status: string) => void;
  onPrintOrder?: (order: any) => void;
}

export const RestaurantOrderCard: React.FC<RestaurantOrderCardProps> = ({
  order,
  nowMs,
  isSelected = false,
  isUpdating = false,
  onOrderClick,
  onUpdateStatus,
  onPrintOrder
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const columnId = getOrderKanbanColumn(order);
  const { orderStatus, deliveryStatus, financialSettlementStatus } = getCanonicalOrderState(order);
  const source = getOrderSourceDetails(order);
  const timeInfo = getOrderStageTimeInfo(order, columnId, nowMs);

  const orderCode = (order.id || '').slice(-6).toUpperCase();
  const customerName = order.nome_cliente || order.customerName || order.cliente?.nome || 'Cliente';
  const customerPhone = order.telefone_cliente || order.customerPhone || order.cliente?.telefone || '';
  const neighborhood = order.endereco?.bairro || order.bairro || order.bairro_entrega || '';
  const total = Number(order.total || order.valor_total || 0);
  const paymentMethod = order.forma_pagamento || order.paymentMethod || order.metodo_pagamento || 'A combinar';

  const isPendingSettlement = deliveryStatus === 'DELIVERED' && financialSettlementStatus === 'PENDING_RESTAURANT_CONFIRMATION';
  const driverName = order.assignedDriverName || order.driverName || order.entregador_nome || '';

  const getPrimaryAction = () => {
    if (orderStatus === 'NEW') {
      return {
        label: 'Aceitar Pedido',
        nextStatus: 'aceito',
        bg: 'bg-emerald-600 hover:bg-emerald-700 text-white'
      };
    }

    if (orderStatus === 'CONFIRMED') {
      return {
        label: 'Enviar p/ Cozinha',
        nextStatus: 'preparo',
        bg: 'bg-indigo-600 hover:bg-indigo-700 text-white'
      };
    }

    if (orderStatus === 'PREPARING') {
      return {
        label: 'Marcar Pronto',
        nextStatus: 'pronto',
        bg: 'bg-amber-600 hover:bg-amber-700 text-white'
      };
    }

    if (orderStatus === 'READY') {
      if (source.source === 'TAKEAWAY' || source.source === 'COUNTER' || source.source === 'TABLE') {
        return {
          label: 'Entregar ao Cliente',
          nextStatus: 'finalizado',
          bg: 'bg-emerald-600 hover:bg-emerald-700 text-white'
        };
      }
      return {
        label: 'Despachar / Em Entrega',
        nextStatus: 'despachado',
        bg: 'bg-blue-600 hover:bg-blue-700 text-white'
      };
    }

    if (isPendingSettlement) {
      return {
        label: 'Conferir Recebimento',
        isModalTrigger: true,
        bg: 'bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold'
      };
    }

    if (orderStatus === 'OUT_FOR_DELIVERY') {
      return {
        label: 'Ver Detalhes',
        isModalTrigger: true,
        bg: 'bg-stone-800 hover:bg-stone-900 text-white'
      };
    }

    return {
      label: 'Ver Detalhes',
      isModalTrigger: true,
      bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800'
    };
  };

  const primaryAction = getPrimaryAction();

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (primaryAction.isModalTrigger || !primaryAction.nextStatus) {
      onOrderClick(order);
    } else if (onUpdateStatus) {
      onUpdateStatus(order.id, primaryAction.nextStatus);
    }
  };

  return (
    <div
      onClick={() => onOrderClick(order)}
      className={`group relative bg-white rounded-xl sm:rounded-2xl border transition-all duration-150 cursor-pointer overflow-hidden shadow-2xs hover:shadow-md w-full max-w-full min-w-0 ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/20'
          : timeInfo.isDelayed
          ? 'border-red-200 hover:border-red-300'
          : isPendingSettlement
          ? 'border-amber-300 bg-amber-50/20 hover:border-amber-400'
          : 'border-stone-200 hover:border-stone-300'
      }`}
    >
      {/* Top Header Row */}
      <div className="bg-stone-50/80 px-2.5 py-1.5 border-b border-stone-100 flex items-center justify-between gap-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-black text-stone-900 tracking-tight shrink-0">
            #{orderCode}
          </span>

          {/* Origin Badge */}
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${source.badgeBg} ${source.badgeText} ${source.badgeBorder}`}>
            {source.shortLabel}
          </span>
        </div>

        {/* Stage Timer / Delay Badge */}
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border flex items-center gap-0.5 ${timeInfo.badgeBg}`}>
            <Clock className="w-2.5 h-2.5 shrink-0" />
            <span>{timeInfo.isDelayed ? timeInfo.delayText : timeInfo.displayText}</span>
          </span>

          {/* Quick Print Button */}
          {onPrintOrder && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPrintOrder(order);
              }}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors shrink-0"
              title="Imprimir pedido"
            >
              <Printer className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main Card Body */}
      <div className="p-2.5 space-y-2 min-w-0 overflow-hidden">
        {/* Customer & Location */}
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-stone-900 tracking-tight truncate">
            {customerName}
          </h3>

          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-stone-500 min-w-0">
            {neighborhood && (
              <span className="flex items-center gap-0.5 truncate min-w-0">
                <MapPin className="w-2.5 h-2.5 text-stone-400 shrink-0" />
                <span className="truncate">{neighborhood}</span>
              </span>
            )}
            {customerPhone && (
              <span className="flex items-center gap-0.5 shrink-0 text-stone-400">
                <Phone className="w-2.5 h-2.5 shrink-0" />
                <span>{customerPhone.slice(-4)}</span>
              </span>
            )}
          </div>
        </div>

        {/* Items Summary Preview */}
        {order.items && Array.isArray(order.items) && order.items.length > 0 && (
          <div className="bg-stone-50/70 p-1.5 rounded-lg text-[10px] text-stone-700 border border-stone-100 space-y-0.5 min-w-0 overflow-hidden">
            {order.items.slice(0, 2).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between gap-1 min-w-0">
                <span className="font-medium text-stone-800 truncate">
                  {item.quantidade || item.quantity || 1}x {item.nome || item.name}
                </span>
              </div>
            ))}
            {order.items.length > 2 && (
              <p className="text-[9px] text-stone-400 font-medium pt-0.5 truncate">
                + {order.items.length - 2} {order.items.length - 2 === 1 ? 'outro item' : 'outros itens'}
              </p>
            )}
          </div>
        )}

        {/* Driver Assigned Info (if delivery) */}
        {driverName && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-100 min-w-0">
            <Truck className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="font-semibold truncate">Entregador: {driverName}</span>
          </div>
        )}

        {/* Pending Settlement Alert Banner */}
        {isPendingSettlement && (
          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-100/90 px-2 py-1 rounded-lg border border-amber-300 min-w-0">
            <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0 animate-bounce" />
            <span className="truncate">Aguardando baixa do recebimento</span>
          </div>
        )}

        {/* Bottom Row: Payment & Action Button */}
        <div className="pt-1.5 border-t border-stone-100 flex items-center justify-between gap-1 min-w-0 overflow-hidden">
          <div className="min-w-0">
            <span className="text-[9px] font-medium text-stone-400 uppercase tracking-wider block truncate max-w-[80px]">
              {paymentMethod}
            </span>
            <span className="text-xs font-black text-stone-900 truncate block">
              R$ {total.toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleActionClick}
            disabled={isUpdating}
            className={`min-h-[28px] px-2 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 flex items-center justify-center gap-1 shrink-0 max-w-[130px] truncate shadow-2xs ${primaryAction.bg} ${
              isUpdating ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <span className="truncate">{isUpdating ? 'Salvando...' : primaryAction.label}</span>
            <ArrowRight className="w-3 h-3 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
