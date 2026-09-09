import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, MapPin, Phone, Printer, MoreVertical, DollarSign, User, Truck, 
  Store, ShoppingBag, Utensils, Monitor, CheckCircle2, AlertTriangle, ArrowRight,
  Eye, Ban, Bike
} from 'lucide-react';
import { Button, IconButton } from '../../../../components/ui';
import { getCanonicalOrderState, getOrderKanbanColumn } from '../../../../domain/order/orderLifecycle';
import { getOrderModalityDetails } from '../utils/orderSource';
import { 
  getOrderStageTimeInfo,
  extractOrderTableDisplay,
  extractOrderComandaDisplay,
  extractOrderWaiterDisplay,
  extractOrderRoundDisplay
} from '../utils/orderPresentation';

interface RestaurantOrderCardProps {
  order: any;
  nowMs?: number;
  isSelected?: boolean;
  isUpdating?: boolean;
  onOrderClick: (order: any) => void;
  onUpdateStatus?: (orderId: string, status: string) => void;
  onCancelOrder?: (order: any) => void;
  onPrintOrder?: (order: any) => void;
  onAssignDriver?: (order: any) => void;
}

export const RestaurantOrderCard: React.FC<RestaurantOrderCardProps> = ({
  order,
  nowMs = Date.now(),
  isSelected = false,
  isUpdating = false,
  onOrderClick,
  onUpdateStatus,
  onCancelOrder,
  onPrintOrder,
  onAssignDriver
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const modDetails = getOrderModalityDetails(order);
  const modality = modDetails.modality;
  const isDeliveryFlow = modDetails.isDeliveryFlow;
  const isTableModality = modDetails.isTableModality;

  const columnId = getOrderKanbanColumn(order);
  const { orderStatus, deliveryStatus, financialSettlementStatus } = getCanonicalOrderState(order);
  const timeInfo = getOrderStageTimeInfo(order, columnId, nowMs);

  const orderCode = String(order?.id || order?._id || '').slice(-6).toUpperCase() || '------';
  const orderNum = order?.numero_pedido || order?.numeroPedido || orderCode;
  const mesaNum = extractOrderTableDisplay(order);
  const comandaNum = extractOrderComandaDisplay(order);
  const waiterName = extractOrderWaiterDisplay(order);
  const roundNum = extractOrderRoundDisplay(order);

  const rawCustomerName = order?.cliente_nome || order?.nome_cliente || order?.customerName || order?.cliente?.nome || '';
  const customerName = rawCustomerName ? rawCustomerName.trim().split(' ')[0] : '';
  const customerPhone = String(order?.cliente_telefone || order?.telefone_cliente || order?.customerPhone || order?.cliente?.telefone || order?.telefone || '');
  
  // Endereço resumido para Delivery e Balcão + Entrega
  const addressStreet = order?.endereco?.rua || order?.endereco_entrega?.rua || order?.rua || '';
  const addressNum = order?.endereco?.numero || order?.endereco_entrega?.numero || order?.numero || '';
  const neighborhood = order?.endereco?.bairro || order?.endereco_entrega?.bairro || order?.bairro || order?.bairro_entrega || '';
  const addressSummary = addressStreet ? `${addressStreet}${addressNum ? `, ${addressNum}` : ''}${neighborhood ? ` - ${neighborhood}` : ''}` : neighborhood;

  const total = Number(order?.total || order?.valor_total || 0);
  const paymentMethod = order?.forma_pagamento || order?.paymentMethod || order?.metodo_pagamento || 'A combinar';

  const isPendingSettlement = isDeliveryFlow && deliveryStatus === 'DELIVERED' && financialSettlementStatus === 'PENDING_RESTAURANT_CONFIRMATION';
  const driverName = isDeliveryFlow ? (order.deliveredByDriverName || order.assignedDriverName || order.driverName || order.entregador_nome || '') : '';

  const getModalityIcon = () => {
    switch (modDetails.iconName) {
      case 'Utensils': return <Utensils className="w-3 h-3 shrink-0" />;
      case 'Store': return <Store className="w-3 h-3 shrink-0" />;
      case 'Bike': return <Bike className="w-3 h-3 shrink-0" />;
      case 'Monitor': return <Monitor className="w-3 h-3 shrink-0" />;
      default: return <ShoppingBag className="w-3 h-3 shrink-0" />;
    }
  };

  const getPrimaryAction = () => {
    const rawStatus = String(order.status || order.status_pedido || '').toLowerCase().trim();

    // 1. GARÇOM / MESA
    if (modality === 'GARCOM_MESA') {
      if (rawStatus === 'novo' || rawStatus === 'new' || orderStatus === 'NEW') {
        return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      if (rawStatus === 'confirmado' || rawStatus === 'aceito' || orderStatus === 'CONFIRMED') {
        return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
      }
      if (rawStatus === 'preparo' || rawStatus === 'cozinha' || rawStatus === 'preparing' || orderStatus === 'PREPARING') {
        return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
      }
      if (rawStatus === 'pronto' || rawStatus === 'ready' || orderStatus === 'READY') {
        return { label: 'MARCAR COMO SERVIDO', nextStatus: 'entregue', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      return { label: 'Ver Detalhes', isModalTrigger: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
    }

    // 2. BALCÃO + RETIRADA
    if (modality === 'BALCAO_RETIRADA') {
      if (rawStatus === 'novo' || rawStatus === 'new' || orderStatus === 'NEW') {
        return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      if (rawStatus === 'confirmado' || rawStatus === 'aceito' || orderStatus === 'CONFIRMED') {
        return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
      }
      if (rawStatus === 'preparo' || rawStatus === 'cozinha' || rawStatus === 'preparing' || orderStatus === 'PREPARING') {
        return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
      }
      if (rawStatus === 'pronto' || rawStatus === 'ready' || orderStatus === 'READY') {
        return { label: 'Entregar ao Cliente', nextStatus: 'finalizado', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      if (rawStatus === 'entregue' || orderStatus === 'DELIVERED') {
        return { label: 'Finalizar Pedido', nextStatus: 'finalizado', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      return { label: 'Ver Detalhes', isModalTrigger: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
    }

    // 3. BALCÃO + MESA
    if (modality === 'BALCAO_MESA') {
      if (rawStatus === 'novo' || rawStatus === 'new' || orderStatus === 'NEW') {
        return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      if (rawStatus === 'confirmado' || rawStatus === 'aceito' || orderStatus === 'CONFIRMED') {
        return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
      }
      if (rawStatus === 'preparo' || rawStatus === 'cozinha' || rawStatus === 'preparing' || orderStatus === 'PREPARING') {
        return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
      }
      if (rawStatus === 'pronto' || rawStatus === 'ready' || orderStatus === 'READY') {
        return { label: 'Servir na Mesa', nextStatus: 'finalizado', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      return { label: 'Ver Detalhes', isModalTrigger: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
    }

    // 4. TOTEM
    if (modality === 'TOTEM') {
      if (rawStatus === 'novo' || rawStatus === 'new' || orderStatus === 'NEW') {
        return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      if (rawStatus === 'confirmado' || rawStatus === 'aceito' || orderStatus === 'CONFIRMED') {
        return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
      }
      if (rawStatus === 'preparo' || rawStatus === 'cozinha' || rawStatus === 'preparing' || orderStatus === 'PREPARING') {
        return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
      }
      if (rawStatus === 'pronto' || rawStatus === 'ready' || orderStatus === 'READY') {
        return { label: 'Entregar ao Cliente', nextStatus: 'finalizado', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
      }
      return { label: 'Ver Detalhes', isModalTrigger: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
    }

    // 5. BALCÃO + ENTREGA & DELIVERY
    if (orderStatus === 'NEW') {
      return { label: 'Aceitar Pedido', nextStatus: 'aceito', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    if (orderStatus === 'CONFIRMED') {
      return { label: 'Iniciar Preparo', nextStatus: 'preparo', bg: 'bg-stone-900 hover:bg-stone-800 text-white' };
    }
    if (orderStatus === 'PREPARING') {
      return { label: 'Marcar Pronto', nextStatus: 'pronto', bg: 'bg-amber-600 hover:bg-amber-700 text-white' };
    }
    if (orderStatus === 'READY') {
      if (!driverName) {
        return {
          label: 'Enviar para entregador',
          isModalTrigger: true,
          actionType: 'assign_driver',
          bg: 'bg-indigo-600 hover:bg-indigo-700 text-white'
        };
      }
      return {
        label: 'Despachar / Saiu',
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
      return { label: 'Marcar Entregue', nextStatus: 'entregue', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    if (orderStatus === 'DELIVERED') {
      return { label: 'Finalizar Pedido', nextStatus: 'finalizado', bg: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }

    return { label: 'Ver Detalhes', isModalTrigger: true, bg: 'bg-stone-100 hover:bg-stone-200 text-stone-800' };
  };

  const primaryAction = getPrimaryAction();

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if ((primaryAction as any).actionType === 'assign_driver') {
      if (onAssignDriver) {
        onAssignDriver(order);
      } else {
        onOrderClick(order);
      }
    } else if (primaryAction.isModalTrigger || !primaryAction.nextStatus) {
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
          ? 'border-rose-200 hover:border-rose-300'
          : isPendingSettlement
          ? 'border-amber-300 bg-amber-50/20 hover:border-amber-400'
          : 'border-stone-200 hover:border-stone-300'
      }`}
    >
      {/* Top Header Row: Modality Badge & Order # */}
      <div className="bg-stone-50/90 px-2.5 sm:px-3 py-1.5 border-b border-stone-200/80 flex items-center justify-between gap-1.5 min-w-0 overflow-hidden">
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          {/* Tag de Destaque da Modalidade */}
          <span className={`text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-lg border shadow-2xs flex items-center gap-1 shrink-0 ${modDetails.badgeBg} ${modDetails.badgeBorder}`}>
            {getModalityIcon()}
            <span>{modDetails.label}</span>
          </span>

          <span className="text-xs font-black text-stone-900 tracking-tight shrink-0 font-mono">
            #{orderCode}
          </span>
        </div>

        {/* Stage Timer / Delay Badge & Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-md border flex items-center gap-1 ${timeInfo.badgeBg}`}>
            <Clock className="w-2.5 h-2.5 shrink-0" />
            <span>{timeInfo.isDelayed ? timeInfo.delayText : timeInfo.displayText}</span>
          </span>

          {/* Quick Print Button */}
          {onPrintOrder && (
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Imprimir pedido"
              title="Imprimir pedido"
              onClick={(e) => {
                e.stopPropagation();
                onPrintOrder(order);
              }}
              className="p-1 h-6 w-6 text-stone-400 hover:text-stone-800 hover:bg-stone-200/60 transition-colors shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
            </IconButton>
          )}

          {/* Action Menu (3 dots) */}
          <div className="relative shrink-0" ref={menuRef}>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Mais ações"
              title="Mais ações"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(prev => !prev);
              }}
              className="p-1 h-6 w-6 text-stone-400 hover:text-stone-800 hover:bg-stone-200/60 transition-colors shrink-0"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </IconButton>

            {showMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-xl border border-stone-200 py-1 z-30 animate-in fade-in zoom-in-95 duration-100 text-xs font-semibold text-stone-700"
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onOrderClick(order);
                  }}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-stone-50 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-stone-500" />
                  Ver Detalhes
                </button>

                {onUpdateStatus && !['finalizado', 'completed'].includes(order.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onUpdateStatus(order.id, 'finalizado');
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-emerald-50 text-emerald-700 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Finalizar Pedido
                  </button>
                )}

                {onCancelOrder && !['finalizado', 'cancelado', 'rejeitado', 'completed'].includes(order.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onCancelOrder(order);
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-rose-50 text-rose-600 cursor-pointer border-t border-stone-100"
                  >
                    <Ban className="w-3.5 h-3.5 text-rose-500" />
                    Cancelar Pedido
                  </button>
                )}

                {onPrintOrder && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      onPrintOrder(order);
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-stone-50 text-stone-600 cursor-pointer border-t border-stone-100"
                  >
                    <Printer className="w-3.5 h-3.5 text-stone-500" />
                    Imprimir Pedido
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Card Body - Adapted per Modality */}
      <div className="p-2.5 space-y-2 min-w-0 overflow-hidden">
        {modality === 'GARCOM_MESA' ? (
          /* 1. GARÇOM / MESA */
          <div className="bg-emerald-50/40 p-2.5 rounded-xl border border-emerald-100/80 space-y-1.5 text-xs min-w-0">
            <div className="flex items-center justify-between gap-1 font-extrabold text-stone-900">
              <span className="font-mono text-stone-900">Pedido #{orderNum}</span>
              <span className="bg-emerald-100 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px] font-black">
                Mesa {mesaNum}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-stone-600 pt-1 font-medium border-t border-emerald-100/60 min-w-0">
              <div className="truncate">
                <span className="text-stone-400">Comanda: </span>
                <strong className="font-bold text-stone-900">{comandaNum}</strong>
              </div>
              <div className="truncate">
                <span className="text-stone-400">Garçom: </span>
                <strong className="font-bold text-stone-900">{waiterName}</strong>
              </div>
              <div className="col-span-2 truncate">
                <span className="text-stone-400">Rodada: </span>
                <strong className="font-bold text-stone-900">{roundNum}</strong>
              </div>
            </div>
          </div>
        ) : modality === 'BALCAO_MESA' ? (
          /* 4. BALCÃO + MESA */
          <div className="bg-teal-50/40 p-2.5 rounded-xl border border-teal-100/80 space-y-1.5 text-xs min-w-0">
            <div className="flex items-center justify-between gap-1 font-extrabold text-stone-900">
              <span className="font-mono text-stone-900">Pedido #{orderNum}</span>
              <span className="bg-teal-100 text-teal-900 border border-teal-200 px-2 py-0.5 rounded-md text-[11px] font-black">
                Mesa {mesaNum}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-stone-600 pt-1 font-medium border-t border-teal-100/60 min-w-0">
              <div className="truncate">
                <span className="text-stone-400">Comanda: </span>
                <strong className="font-bold text-stone-900">{comandaNum}</strong>
              </div>
              <div className="truncate text-teal-700 font-bold">
                <span>Comanda</span>
              </div>
            </div>
          </div>
        ) : modality === 'BALCAO_RETIRADA' ? (
          /* 2. BALCÃO + RETIRADA */
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1 font-bold text-xs text-stone-900">
              <span className="font-mono text-stone-800">Pedido #{orderNum}</span>
              <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                Retirada no Balcão
              </span>
            </div>
            {customerName && (
              <h3 className="text-xs sm:text-sm font-extrabold text-stone-900 tracking-tight truncate mt-1">
                Cliente: {customerName}
              </h3>
            )}
          </div>
        ) : modality === 'BALCAO_ENTREGA' ? (
          /* 3. BALCÃO + ENTREGA */
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1 font-bold text-xs text-stone-900">
              <span className="font-mono text-stone-800">Pedido #{orderNum}</span>
              <span className="text-[10px] font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                Entrega Balcão
              </span>
            </div>
            <h3 className="text-xs sm:text-sm font-extrabold text-stone-900 tracking-tight truncate mt-1">
              {customerName || 'Cliente'}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-stone-500 min-w-0 flex-wrap">
              {addressSummary && (
                <span className="flex items-center gap-0.5 truncate min-w-0">
                  <MapPin className="w-2.5 h-2.5 text-stone-400 shrink-0" />
                  <span className="truncate">{addressSummary}</span>
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
        ) : modality === 'TOTEM' ? (
          /* 6. TOTEM */
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1 font-bold text-xs text-stone-900">
              <span className="font-mono text-stone-800">Pedido #{orderNum}</span>
              <span className="text-[10px] font-bold text-stone-800 bg-stone-100 px-2 py-0.5 rounded-md border border-stone-200">
                Autoatendimento
              </span>
            </div>
            {customerName && (
              <h3 className="text-xs sm:text-sm font-extrabold text-stone-900 tracking-tight truncate mt-1">
                {customerName}
              </h3>
            )}
          </div>
        ) : (
          /* 5. DELIVERY (Padrão) */
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1 font-bold text-xs text-stone-900">
              <span className="font-mono text-stone-800">Pedido #{orderNum}</span>
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-stone-900 tracking-tight truncate mt-0.5">
              {customerName || 'Cliente'}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs text-stone-500 min-w-0 flex-wrap sm:flex-nowrap">
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
        )}

        {/* Items Summary Preview */}
        {order.items && Array.isArray(order.items) && order.items.length > 0 && (
          <div className="bg-stone-50/70 p-1.5 rounded-lg text-xs text-stone-700 border border-stone-100 space-y-0.5 min-w-0 overflow-hidden">
            {order.items.slice(0, 2).map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between gap-1 min-w-0">
                <span className="font-medium text-stone-800 truncate">
                  {item.quantidade || item.quantity || 1}x {item.nome || item.name}
                </span>
              </div>
            ))}
            {order.items.length > 2 && (
              <p className="text-[11px] text-stone-400 font-medium pt-0.5 truncate">
                + {order.items.length - 2} {order.items.length - 2 === 1 ? 'outro item' : 'outros itens'}
              </p>
            )}
          </div>
        )}

        {/* Driver Assigned Info (SOMENTE para modalidades com fluxo de entrega: DELIVERY e BALCÃO + ENTREGA) */}
        {isDeliveryFlow && driverName && (
          <div className="flex items-center gap-1 text-xs text-indigo-900 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-100 min-w-0">
            <Truck className="w-3 h-3 text-indigo-600 shrink-0" />
            <span className="font-semibold truncate">Entregador: {driverName}</span>
          </div>
        )}

        {/* Pending Settlement Alert Banner (SOMENTE para fluxo de entrega) */}
        {isDeliveryFlow && isPendingSettlement && (
          <div className="flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-100/90 px-2 py-1 rounded-lg border border-amber-300 min-w-0">
            <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0 animate-bounce" />
            <span className="truncate">Aguardando baixa do recebimento</span>
          </div>
        )}

        {/* Bottom Row: Payment & Primary Action Button */}
        <div className="pt-1.5 border-t border-stone-100 flex items-center justify-between gap-1.5 min-w-0 overflow-hidden">
          <div className="min-w-0 flex-1">
            {isTableModality ? (
              <span className="text-[10px] font-bold text-stone-500 block truncate max-w-[110px]" title="Pagamento na Comanda">
                Na Comanda
              </span>
            ) : (
              <span className="text-[11px] font-medium text-stone-500 block truncate max-w-[100px]">
                {paymentMethod}
              </span>
            )}
            <span className="text-xs sm:text-sm font-black text-stone-900 truncate block">
              R$ {total.toFixed(2)}
            </span>
          </div>

          <Button
            size="sm"
            loading={isUpdating}
            onClick={handleActionClick}
            icon={<ArrowRight className="w-3 h-3" />}
            iconPosition="right"
            className={`min-h-[34px] sm:min-h-[32px] px-2.5 py-1 text-xs font-extrabold max-w-[170px] sm:max-w-[195px] truncate shadow-2xs shrink-0 ${primaryAction.bg}`}
          >
            <span className="truncate">{primaryAction.label}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

