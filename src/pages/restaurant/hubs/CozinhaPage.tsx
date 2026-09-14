import React from 'react';
import { ChefHat, Clock, CheckCircle2, Flame, RefreshCw, User, Store, Bike, Utensils, Monitor, Tag, Printer, Loader2, Check } from 'lucide-react';
import { normalizeOrderOrigem, OrderOrigem } from '../../../domain/order/orderSource';
import { printThermalKitchenTicket } from '../../../components/orders/OrderThermalPrint';
import { useAuth } from '../../../contexts/AuthContext';
import { useKitchenAutoPrint } from '../../../hooks/useKitchenAutoPrint';

interface CozinhaPageProps {
  orders: any[];
  onUpdateStatus: (orderId: string, newStatus: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  restaurantProfile?: any;
}

export type BalcaoModalidade = 'RETIRADA' | 'ENTREGA' | 'MESA';

export function getBalcaoModalidade(order: any): BalcaoModalidade {
  const atendimento = String(
    order.tipo_atendimento || 
    order.tipoAtendimento || 
    order.atendimento || 
    order.modalidade || 
    ''
  ).toUpperCase().trim();

  const serviceMode = String(order.serviceMode || '').toUpperCase().trim();
  const tipoEntrega = String(order.tipo_entrega || '').toLowerCase().trim();

  if (
    atendimento === 'ENTREGA' || 
    atendimento === 'DELIVERY' ||
    serviceMode === 'DELIVERY' || 
    tipoEntrega === 'entrega' || 
    Boolean(order.deliverySnapshot || order.driverId || order.entregador_id || order.entregadorId)
  ) {
    return 'ENTREGA';
  }

  if (
    atendimento === 'MESA' || 
    atendimento === 'DINE_IN' ||
    serviceMode === 'DINE_IN' || 
    tipoEntrega === 'consumo_local' || 
    Boolean(
      (order.mesa_numero !== undefined && order.mesa_numero !== null && order.mesa_numero !== '') ||
      order.tableId || 
      order.tableNumber || 
      (order.mesa && String(order.mesa).toLowerCase().startsWith('mesa'))
    )
  ) {
    return 'MESA';
  }

  return 'RETIRADA';
}

export default function CozinhaPage({ orders, onUpdateStatus, onRefresh, isRefreshing, restaurantProfile }: CozinhaPageProps) {
  const { profile } = useAuth();
  const [selectedOrigin, setSelectedOrigin] = React.useState<'TODOS' | 'DELIVERY' | 'GARCOM' | 'BALCAO' | 'TOTEM'>('TODOS');
  const [balcaoFilter, setBalcaoFilter] = React.useState<'TODOS' | 'RETIRADA' | 'ENTREGA' | 'MESA'>('TODOS');
  const [printingOrderId, setPrintingOrderId] = React.useState<string | null>(null);
  const [printNotice, setPrintNotice] = React.useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Impressão automática de novos pedidos destinados à cozinha via Print Agent (idempotente por orderId + printerId)
  useKitchenAutoPrint({
    orders,
    restaurantProfile,
    profile
  });

  const handlePrintKitchenOrder = async (order: any) => {
    if (printingOrderId) return;
    setPrintingOrderId(order.id);
    try {
      const result = await printThermalKitchenTicket(order, restaurantProfile, profile);
      if (result.method === 'agent' && result.success) {
        setPrintNotice({
          type: 'success',
          message: (result.printerCount && result.printerCount > 1)
            ? `Pedido #${order.numero_pedido || order.orderNumber || ''} enviado para ${result.printerCount} impressoras da cozinha via Print Agent.`
            : `Pedido #${order.numero_pedido || order.orderNumber || ''} impresso com sucesso via Print Agent.`
        });
        setTimeout(() => setPrintNotice(null), 4000);
      }
    } catch (err) {
      console.error('Erro ao imprimir pedido na cozinha:', err);
    } finally {
      setPrintingOrderId(null);
    }
  };

  // Filter active kitchen orders: 'aceito' (confirmed, to prepare), 'preparo' (in kitchen), 'cozinha'
  const kitchenOrders = React.useMemo(() => {
    return (orders || []).filter(o => {
      const st = String(o.status || o.orderStatus || o.canonicalStatus || '').toLowerCase();
      return ['aceito', 'preparo', 'cozinha', 'preparing', 'em_preparo'].includes(st);
    });
  }, [orders]);

  // Counts by origin
  const originCounts = React.useMemo(() => {
    const counts = {
      TODOS: kitchenOrders.length,
      DELIVERY: 0,
      GARCOM: 0,
      BALCAO: 0,
      TOTEM: 0
    };

    kitchenOrders.forEach(order => {
      const orig = normalizeOrderOrigem(order);
      if (orig === 'DELIVERY') counts.DELIVERY++;
      else if (orig === 'GARCOM') counts.GARCOM++;
      else if (orig === 'BALCAO') counts.BALCAO++;
      else if (orig === 'TOTEM') counts.TOTEM++;
    });

    return counts;
  }, [kitchenOrders]);

  // Balcao modalidade counts
  const balcaoCounts = React.useMemo(() => {
    const counts = {
      TODOS: 0,
      RETIRADA: 0,
      ENTREGA: 0,
      MESA: 0
    };

    kitchenOrders.forEach(order => {
      if (normalizeOrderOrigem(order) === 'BALCAO') {
        counts.TODOS++;
        const mod = getBalcaoModalidade(order);
        if (mod === 'RETIRADA') counts.RETIRADA++;
        else if (mod === 'ENTREGA') counts.ENTREGA++;
        else if (mod === 'MESA') counts.MESA++;
      }
    });

    return counts;
  }, [kitchenOrders]);

  // Filtered orders according to selected origin and sub-filters
  const displayedOrders = React.useMemo(() => {
    let list = kitchenOrders;
    if (selectedOrigin !== 'TODOS') {
      list = list.filter(order => normalizeOrderOrigem(order) === selectedOrigin);
    }
    if (selectedOrigin === 'BALCAO' && balcaoFilter !== 'TODOS') {
      list = list.filter(order => getBalcaoModalidade(order) === balcaoFilter);
    }
    return list;
  }, [kitchenOrders, selectedOrigin, balcaoFilter]);

  const getTimeElapsed = (dataCriacao: string) => {
    if (!dataCriacao) return '0 min';
    const start = new Date(dataCriacao).getTime();
    const now = Date.now();
    const diffMins = Math.floor((now - start) / (1000 * 60));
    return `${diffMins} min`;
  };

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 min-w-0 max-w-full h-full overflow-hidden space-y-2.5 sm:space-y-3 font-sans">
      {/* Print Feedback Notification Toast */}
      {printNotice && (
        <div className={`shrink-0 p-3 rounded-xl border flex items-center justify-between gap-2 shadow-sm transition-all animate-fadeIn ${
          printNotice.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-300' 
            : printNotice.type === 'error'
            ? 'bg-rose-50 text-rose-900 border-rose-300'
            : 'bg-stone-100 text-stone-900 border-stone-300'
        }`}>
          <div className="flex items-center gap-2 min-w-0 text-xs sm:text-sm font-bold">
            <Printer className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="truncate">{printNotice.message}</span>
          </div>
          <button 
            type="button" 
            onClick={() => setPrintNotice(null)}
            className="text-stone-500 hover:text-stone-800 text-xs font-bold px-2 py-1 rounded-lg"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner & Origin Filters - Fixed at Top */}
      <div className="shrink-0 space-y-2 sm:space-y-2.5">
        {/* Header Banner */}
        <div className="flex items-center justify-between bg-stone-900 text-white p-3.5 sm:p-4 rounded-2xl shadow-xs border border-stone-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center shrink-0">
              <ChefHat className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold tracking-tight truncate">KDS - Monitor da Cozinha</h3>
              <p className="text-stone-400 text-xs truncate">
                {kitchenOrders.length} {kitchenOrders.length === 1 ? 'pedido em preparo' : 'pedidos em preparo'}
              </p>
            </div>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-stone-800 hover:bg-stone-700 active:scale-[0.98] text-stone-200 text-xs font-bold rounded-xl transition-all border border-stone-700 min-h-[38px] cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          )}
        </div>

        {/* Origin Filters */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar touch-pan-x w-full min-w-0 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSelectedOrigin('TODOS');
              setBalcaoFilter('TODOS');
            }}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all whitespace-nowrap border cursor-pointer shrink-0 active:scale-[0.98] ${
              selectedOrigin === 'TODOS'
                ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <span>TODOS</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                selectedOrigin === 'TODOS' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'
              }`}
            >
              {originCounts.TODOS}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedOrigin('DELIVERY')}
            className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all whitespace-nowrap border cursor-pointer shrink-0 active:scale-[0.98] ${
              selectedOrigin === 'DELIVERY'
                ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>DELIVERY</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                selectedOrigin === 'DELIVERY' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'
              }`}
            >
              {originCounts.DELIVERY}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedOrigin('GARCOM')}
            className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all whitespace-nowrap border cursor-pointer shrink-0 active:scale-[0.98] ${
              selectedOrigin === 'GARCOM'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>GARÇOM</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                selectedOrigin === 'GARCOM' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'
              }`}
            >
              {originCounts.GARCOM}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedOrigin('BALCAO')}
            className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all whitespace-nowrap border cursor-pointer shrink-0 active:scale-[0.98] ${
              selectedOrigin === 'BALCAO'
                ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>BALCÃO</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                selectedOrigin === 'BALCAO' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'
              }`}
            >
              {originCounts.BALCAO}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedOrigin('TOTEM')}
            className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 min-h-[38px] rounded-xl text-xs font-bold transition-all whitespace-nowrap border cursor-pointer shrink-0 active:scale-[0.98] ${
              selectedOrigin === 'TOTEM'
                ? 'bg-stone-800 text-white border-stone-800 shadow-2xs'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>TOTEM</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                selectedOrigin === 'TOTEM' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-700'
              }`}
            >
              {originCounts.TOTEM}
            </span>
          </button>
        </div>

        {/* Sub-modality filter if BALCÃO is selected */}
        {selectedOrigin === 'BALCAO' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar touch-pan-x bg-amber-50/70 p-1.5 rounded-xl border border-amber-200/80">
            <span className="text-xs font-bold text-amber-900 px-2 py-1">Modalidade Balcão:</span>
            <button
              type="button"
              onClick={() => setBalcaoFilter('TODOS')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                balcaoFilter === 'TODOS'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white/80 text-amber-900 hover:bg-white border border-amber-200'
              }`}
            >
              Todos ({balcaoCounts.TODOS})
            </button>
            <button
              type="button"
              onClick={() => setBalcaoFilter('RETIRADA')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                balcaoFilter === 'RETIRADA'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white/80 text-amber-900 hover:bg-white border border-amber-200'
              }`}
            >
              Retirada ({balcaoCounts.RETIRADA})
            </button>
            <button
              type="button"
              onClick={() => setBalcaoFilter('ENTREGA')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                balcaoFilter === 'ENTREGA'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white/80 text-blue-900 hover:bg-white border border-blue-200'
              }`}
            >
              Entrega ({balcaoCounts.ENTREGA})
            </button>
            <button
              type="button"
              onClick={() => setBalcaoFilter('MESA')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                balcaoFilter === 'MESA'
                  ? 'bg-teal-700 text-white shadow-2xs'
                  : 'bg-white/80 text-teal-900 hover:bg-white border border-teal-200'
              }`}
            >
              Mesa ({balcaoCounts.MESA})
            </button>
          </div>
        )}
      </div>

      {/* Scrollable Kitchen Orders Grid Area */}
      <div className="w-full flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-0.5 pb-6">
        {kitchenOrders.length === 0 ? (
          <div className="p-10 sm:p-16 bg-white rounded-3xl border border-stone-200 text-center text-stone-400 shadow-2xs">
            <ChefHat className="w-10 h-10 sm:w-12 sm:h-12 text-stone-300 mx-auto mb-3" />
            <h4 className="text-base font-bold text-stone-700 mb-1">Cozinha sem pedidos pendentes</h4>
            <p className="text-stone-500 text-xs sm:text-sm">Novos pedidos confirmados aparecerão aqui automaticamente.</p>
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="p-8 sm:p-12 bg-white rounded-3xl border border-stone-200 text-center text-stone-400 shadow-2xs">
            <ChefHat className="w-8 h-8 sm:w-10 sm:h-10 text-stone-300 mx-auto mb-2" />
            <h4 className="text-base font-bold text-stone-700 mb-1">Nenhum pedido encontrado</h4>
            <p className="text-stone-500 text-xs sm:text-sm">
              Não há pedidos em preparo para o filtro selecionado.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 w-full min-w-0">
            {displayedOrders.map(order => {
              const isPreparo = order.status === 'preparo' || order.status === 'cozinha' || order.orderStatus === 'PREPARING';
              const elapsed = getTimeElapsed(order.data_criacao || order.createdAt);
              const isDelayed = parseInt(elapsed) > 30;
              const origem = normalizeOrderOrigem(order);

              // Standardized Order Number
              const orderNum = order.numero_pedido || order.orderNumber || order.numeroPedido || (typeof order.numero === 'number' || (typeof order.numero === 'string' && /^\d+$/.test(order.numero)) ? order.numero : (order.id ? order.id.slice(-6).toUpperCase() : ''));

              // Standardized Mesa Display
              const rawMesa = order.mesa_numero !== undefined && order.mesa_numero !== null && order.mesa_numero !== ''
                ? order.mesa_numero
                : (order.mesa || order.tableNumber || order.num_mesa || order.table?.number || order.table?.name);
              const mesaDisplay = rawMesa 
                ? (String(rawMesa).toLowerCase().startsWith('mesa') 
                    ? String(rawMesa) 
                    : `Mesa ${!isNaN(Number(rawMesa)) ? String(rawMesa).padStart(2, '0') : rawMesa}`)
                : 'Mesa --';

              // Standardized Comanda Display
              const rawComanda = order.comanda_id || order.comandaId || order.tabId || order.comanda || order.comandaNumero || order.tabNumber;
              const comandaDisplay = rawComanda
                ? (String(rawComanda).toLowerCase().startsWith('comanda')
                    ? String(rawComanda)
                    : `Comanda ${String(rawComanda).length > 8 ? String(rawComanda).slice(-4) : rawComanda}`)
                : 'Comanda --';

              // Standardized Garçom Name
              const garcomResponsavel = order.waiterName || order.garcom_nome || order.garcom || order.waiter || order.garcomNome || order.sentBy?.name || order.createdBy?.name || 'Garçom';

              // Standardized Rodada
              const rawRodada = order.roundNumber || order.round_number || order.numero_rodada || order.rodada || order.roundIndex || 1;
              const rodadaDisplay = typeof rawRodada === 'number' || typeof rawRodada === 'string'
                ? (String(rawRodada).toLowerCase().startsWith('rodada') ? String(rawRodada) : `Rodada ${rawRodada}`)
                : 'Rodada 1';

              // Standardized Client Name
              const clienteNome = order.cliente_nome || order.customerName || order.nome_cliente || order.cliente?.nome || (order.createdBy?.name !== 'RESTAURANT' ? order.createdBy?.name : '') || '';

              // Totem Pickup / Senha
              const rawPickup = order.pickupNumber || order.numero_retirada || order.senha || order.password || order.ticketNumber || order.retirada || '';

              // BALCAO sub-modality
              const balcaoModalidade = getBalcaoModalidade(order);

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-3xl border-2 overflow-hidden shadow-2xs flex flex-col justify-between transition-all w-full min-w-0 max-w-full ${
                    isPreparo ? 'border-amber-500' : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="w-full min-w-0">
                    {/* Origin & Modality Visual Stripe */}
                    <div
                      className={`h-1.5 w-full ${
                        origem === 'GARCOM'
                          ? 'bg-emerald-600'
                          : origem === 'DELIVERY'
                          ? 'bg-sky-600'
                          : origem === 'BALCAO'
                          ? balcaoModalidade === 'ENTREGA'
                            ? 'bg-blue-600'
                            : balcaoModalidade === 'MESA'
                            ? 'bg-teal-600'
                            : 'bg-amber-500'
                          : 'bg-stone-700'
                      }`}
                    />

                    {/* Card Header by Order Type */}
                    {origem === 'GARCOM' ? (
                      /* 1. GARCOM / MESA */
                      <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-emerald-50/40 border-stone-200'}`}>
                        <div className="space-y-2 flex-1 min-w-0">
                          {/* Top Tag & Pedido #numero */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-700 text-white shadow-2xs">
                              <Utensils className="w-3.5 h-3.5" />
                              GARÇOM • MESA
                            </span>
                            <span className="font-mono text-xs font-black text-stone-900 bg-white border border-stone-300 px-2 py-0.5 rounded-lg shadow-2xs">
                              Pedido #{orderNum}
                            </span>
                          </div>

                          {/* Mesa, Comanda e Rodada */}
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap pt-0.5">
                            <div className="bg-white border-2 border-stone-300 px-2.5 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-black text-stone-900 shadow-2xs flex items-center gap-1">
                              <span>{mesaDisplay}</span>
                            </div>
                            <div className="bg-white border-2 border-stone-300 px-2.5 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-black text-stone-900 shadow-2xs flex items-center gap-1">
                              <span>{comandaDisplay}</span>
                            </div>
                            <div className="bg-amber-100 border border-amber-300 px-2.5 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-extrabold text-amber-900 shadow-2xs flex items-center gap-1">
                              <span>{rodadaDisplay}</span>
                            </div>
                          </div>

                          {/* Garçom */}
                          <div className="flex items-center gap-1.5 text-xs text-stone-700 font-bold pt-0.5 min-w-0">
                            <User className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                            <span className="truncate">Garçom: <strong className="font-extrabold text-stone-900">{garcomResponsavel}</strong></span>
                          </div>
                        </div>

                        {/* Status & Timer */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintKitchenOrder(order);
                              }}
                              disabled={printingOrderId === order.id}
                              className="p-1.5 bg-white hover:bg-stone-100 active:scale-95 border border-stone-200 text-stone-700 hover:text-stone-900 rounded-lg transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                              title="Imprimir ticket da cozinha"
                              aria-label="Imprimir ticket da cozinha"
                            >
                              {printingOrderId === order.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                              ) : (
                                <Printer className="w-3.5 h-3.5 text-stone-700" />
                              )}
                            </button>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                              }`}
                            >
                              {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                              <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                            </span>
                          </div>
                          <span className={`text-xs font-bold ${isDelayed ? 'text-rose-600 animate-pulse' : 'text-stone-500'}`}>
                            ⏱️ {elapsed}
                          </span>
                        </div>
                      </div>
                    ) : origem === 'BALCAO' ? (
                      balcaoModalidade === 'RETIRADA' ? (
                        /* 2. BALCAO + RETIRADA */
                        <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-50/50 border-amber-100'}`}>
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-600 text-white shadow-2xs">
                                <Store className="w-3.5 h-3.5" />
                                BALCÃO • RETIRADA
                              </span>
                              <span className="font-mono text-xs font-black text-stone-900 bg-white border border-stone-300 px-2 py-0.5 rounded-lg shadow-2xs">
                                Pedido #{orderNum}
                              </span>
                            </div>

                            {clienteNome ? (
                              <div className="min-w-0 pt-0.5">
                                <span className="text-xs text-stone-500 font-bold block">Cliente:</span>
                                <h4 className="font-black text-stone-900 text-xs sm:text-sm truncate">
                                  {clienteNome}
                                </h4>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrintKitchenOrder(order);
                                }}
                                disabled={printingOrderId === order.id}
                                className="p-1.5 bg-white hover:bg-stone-100 active:scale-95 border border-stone-200 text-stone-700 hover:text-stone-900 rounded-lg transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                                title="Imprimir ticket da cozinha"
                                aria-label="Imprimir ticket da cozinha"
                              >
                                {printingOrderId === order.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                ) : (
                                  <Printer className="w-3.5 h-3.5 text-stone-700" />
                                )}
                              </button>
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                  isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                                }`}
                              >
                                {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                                <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                              </span>
                            </div>
                            <span className={`text-xs font-bold ${isDelayed ? 'text-rose-600 animate-pulse' : 'text-stone-500'}`}>
                              ⏱️ {elapsed}
                            </span>
                          </div>
                        </div>
                      ) : balcaoModalidade === 'ENTREGA' ? (
                        /* 3. BALCAO + ENTREGA */
                        <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-blue-50/50 border-blue-100'}`}>
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-blue-600 text-white shadow-2xs">
                                <Bike className="w-3.5 h-3.5" />
                                BALCÃO • ENTREGA
                              </span>
                              <span className="font-mono text-xs font-black text-stone-900 bg-white border border-stone-300 px-2 py-0.5 rounded-lg shadow-2xs">
                                Pedido #{orderNum}
                              </span>
                            </div>

                            <div className="min-w-0 pt-0.5">
                              <span className="text-xs text-stone-500 font-bold block">Cliente:</span>
                              <h4 className="font-black text-stone-900 text-xs sm:text-sm truncate">
                                {clienteNome || 'Cliente'}
                              </h4>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrintKitchenOrder(order);
                                }}
                                disabled={printingOrderId === order.id}
                                className="p-1.5 bg-white hover:bg-stone-100 active:scale-95 border border-stone-200 text-stone-700 hover:text-stone-900 rounded-lg transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                                title="Imprimir ticket da cozinha"
                                aria-label="Imprimir ticket da cozinha"
                              >
                                {printingOrderId === order.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                ) : (
                                  <Printer className="w-3.5 h-3.5 text-stone-700" />
                                )}
                              </button>
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                  isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                                }`}
                              >
                                {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                                <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                              </span>
                            </div>
                            <span className={`text-xs font-bold ${isDelayed ? 'text-rose-600 animate-pulse' : 'text-stone-500'}`}>
                              ⏱️ {elapsed}
                            </span>
                          </div>
                        </div>
                      ) : (
                        /* 4. BALCAO + MESA */
                        <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-teal-50/50 border-teal-100'}`}>
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-teal-700 text-white shadow-2xs">
                                <Utensils className="w-3.5 h-3.5" />
                                BALCÃO • MESA
                              </span>
                              <span className="font-mono text-xs font-black text-stone-900 bg-white border border-stone-300 px-2 py-0.5 rounded-lg shadow-2xs">
                                Pedido #{orderNum}
                              </span>
                            </div>

                            {/* Mesa e Comanda */}
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap pt-0.5">
                              <div className="bg-white border-2 border-stone-300 px-2.5 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-black text-stone-900 shadow-2xs flex items-center gap-1">
                                <span>{mesaDisplay}</span>
                              </div>
                              <div className="bg-white border-2 border-stone-300 px-2.5 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-black text-stone-900 shadow-2xs flex items-center gap-1">
                                <span>{comandaDisplay}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePrintKitchenOrder(order);
                                }}
                                disabled={printingOrderId === order.id}
                                className="p-1.5 bg-white hover:bg-stone-100 active:scale-95 border border-stone-200 text-stone-700 hover:text-stone-900 rounded-lg transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                                title="Imprimir ticket da cozinha"
                                aria-label="Imprimir ticket da cozinha"
                              >
                                {printingOrderId === order.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                                ) : (
                                  <Printer className="w-3.5 h-3.5 text-stone-700" />
                                )}
                              </button>
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                  isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                                }`}
                              >
                                {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                                <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                              </span>
                            </div>
                            <span className={`text-xs font-bold ${isDelayed ? 'text-rose-600 animate-pulse' : 'text-stone-500'}`}>
                              ⏱️ {elapsed}
                            </span>
                          </div>
                        </div>
                      )
                    ) : origem === 'DELIVERY' ? (
                      /* 5. DELIVERY */
                      <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-sky-50/50 border-sky-100'}`}>
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-sky-600 text-white shadow-2xs">
                              <Bike className="w-3.5 h-3.5" />
                              DELIVERY
                            </span>
                            <span className="font-mono text-xs font-black text-stone-900 bg-white border border-stone-300 px-2 py-0.5 rounded-lg shadow-2xs">
                              Pedido #{orderNum}
                            </span>
                          </div>

                          <div className="min-w-0 pt-0.5">
                            <span className="text-xs text-stone-500 font-bold block">Cliente:</span>
                            <h4 className="font-black text-stone-900 text-xs sm:text-sm truncate">
                              {clienteNome || 'Cliente'}
                            </h4>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintKitchenOrder(order);
                              }}
                              disabled={printingOrderId === order.id}
                              className="p-1.5 bg-white hover:bg-stone-100 active:scale-95 border border-stone-200 text-stone-700 hover:text-stone-900 rounded-lg transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                              title="Imprimir ticket da cozinha"
                              aria-label="Imprimir ticket da cozinha"
                            >
                              {printingOrderId === order.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                              ) : (
                                <Printer className="w-3.5 h-3.5 text-stone-700" />
                              )}
                            </button>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                              }`}
                            >
                              {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                              <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                            </span>
                          </div>
                          <span className={`text-xs font-bold ${isDelayed ? 'text-rose-600 animate-pulse' : 'text-stone-500'}`}>
                            ⏱️ {elapsed}
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* 6. TOTEM */
                      <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-stone-50/80 border-stone-200'}`}>
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-stone-800 text-white shadow-2xs">
                              <Monitor className="w-3.5 h-3.5" />
                              TOTEM
                            </span>
                            <span className="font-mono text-xs font-black text-stone-900 bg-white border border-stone-300 px-2 py-0.5 rounded-lg shadow-2xs">
                              Pedido #{orderNum}
                            </span>
                          </div>

                          {rawPickup ? (
                            <div className="min-w-0 pt-0.5">
                              <span className="inline-flex items-center gap-1 text-xs font-black text-stone-900 bg-stone-200/90 px-2.5 py-1 rounded-lg">
                                <Tag className="w-3 h-3" />
                                Retirada / Senha: #{rawPickup}
                              </span>
                            </div>
                          ) : clienteNome ? (
                            <div className="min-w-0 pt-0.5">
                              <span className="text-xs text-stone-500 font-bold block">Cliente:</span>
                              <h4 className="font-black text-stone-900 text-xs sm:text-sm truncate">
                                {clienteNome}
                              </h4>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintKitchenOrder(order);
                              }}
                              disabled={printingOrderId === order.id}
                              className="p-1.5 bg-white hover:bg-stone-100 active:scale-95 border border-stone-200 text-stone-700 hover:text-stone-900 rounded-lg transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                              title="Imprimir ticket da cozinha"
                              aria-label="Imprimir ticket da cozinha"
                            >
                              {printingOrderId === order.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                              ) : (
                                <Printer className="w-3.5 h-3.5 text-stone-700" />
                              )}
                            </button>
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                              }`}
                            >
                              {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                              <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                            </span>
                          </div>
                          <span className={`text-xs font-bold ${isDelayed ? 'text-rose-600 animate-pulse' : 'text-stone-500'}`}>
                            ⏱️ {elapsed}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Order Items */}
                    <div className="p-3.5 sm:p-4 space-y-3 min-w-0">
                      <ul className="divide-y divide-stone-100">
                        {(order.items || order.itens || []).map((item: any, idx: number) => (
                          <li key={idx} className="py-2 flex items-start justify-between gap-2 min-w-0">
                            <div className="min-w-0">
                              <span className="font-bold text-stone-900 text-xs sm:text-sm">{item.quantidade}x </span>
                              <span className="font-medium text-stone-800 text-xs sm:text-sm">{item.nome}</span>
                              {item.observacao && (
                                <p className="text-xs text-amber-800 font-bold mt-0.5 bg-amber-50 border border-amber-200/60 px-2 py-0.5 rounded-md inline-block break-words">
                                  Obs: {item.observacao}
                                </p>
                              )}
                              {item.subitens && item.subitens.length > 0 && (
                                <ul className="text-xs text-stone-500 ml-3 mt-1 space-y-0.5">
                                  {item.subitens.map((sub: any, sIdx: number) => (
                                    <li key={sIdx} className="truncate">+ {sub.nome || sub}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>

                      {order.observacao && (
                        <div className="p-2.5 sm:p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs text-stone-700 break-words">
                          <strong className="font-bold text-stone-900">Observações do Pedido:</strong> {order.observacao}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Action - Production Only */}
                  <div className="p-3 sm:p-4 bg-stone-50/80 border-t border-stone-100 shrink-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintKitchenOrder(order)}
                      disabled={printingOrderId === order.id}
                      className="min-h-[42px] sm:min-h-[44px] px-3.5 py-2.5 bg-white hover:bg-stone-100 border border-stone-300 text-stone-800 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer shrink-0 active:scale-[0.98]"
                      title="Imprimir ticket de produção da cozinha"
                    >
                      {printingOrderId === order.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                      ) : (
                        <Printer className="w-4 h-4 text-stone-700" />
                      )}
                      <span className="hidden sm:inline">Imprimir</span>
                    </button>
                    {!isPreparo ? (
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(order.id, 'preparo')}
                        className="flex-1 min-h-[42px] sm:min-h-[44px] py-2.5 px-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-stone-950 font-extrabold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                      >
                        <Flame className="w-4 h-4 text-stone-950" />
                        <span>Iniciar Preparo</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onUpdateStatus(order.id, 'pronto')}
                        className="flex-1 min-h-[42px] sm:min-h-[44px] py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4 text-white" />
                        <span>Marcar como Pronto</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

