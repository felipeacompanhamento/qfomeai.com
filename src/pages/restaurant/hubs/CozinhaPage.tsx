import React from 'react';
import { ChefHat, Clock, CheckCircle2, Flame, RefreshCw, User, Store, Bike, Utensils, Monitor } from 'lucide-react';
import { normalizeOrderOrigem } from '../../../domain/order/orderSource';

interface CozinhaPageProps {
  orders: any[];
  onUpdateStatus: (orderId: string, newStatus: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function CozinhaPage({ orders, onUpdateStatus, onRefresh, isRefreshing }: CozinhaPageProps) {
  const [selectedOrigin, setSelectedOrigin] = React.useState<'TODOS' | 'DELIVERY' | 'GARCOM' | 'BALCAO' | 'TOTEM'>('TODOS');

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

  // Filtered orders according to selected origin
  const displayedOrders = React.useMemo(() => {
    if (selectedOrigin === 'TODOS') return kitchenOrders;
    return kitchenOrders.filter(order => normalizeOrderOrigem(order) === selectedOrigin);
  }, [kitchenOrders, selectedOrigin]);

  const getTimeElapsed = (dataCriacao: string) => {
    if (!dataCriacao) return '0 min';
    const start = new Date(dataCriacao).getTime();
    const now = Date.now();
    const diffMins = Math.floor((now - start) / (1000 * 60));
    return `${diffMins} min`;
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 max-w-full">
      {/* Header Banner */}
      <div className="flex items-center justify-between bg-stone-900 text-white p-4 sm:p-6 rounded-3xl shadow-sm border border-stone-800">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
            <ChefHat className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-bold tracking-tight truncate">KDS - Monitor da Cozinha</h3>
            <p className="text-stone-400 text-xs sm:text-sm truncate">
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
          onClick={() => setSelectedOrigin('TODOS')}
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
              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
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
            Não há pedidos com a origem <strong>{selectedOrigin === 'GARCOM' ? 'GARÇOM' : selectedOrigin === 'BALCAO' ? 'BALCÃO' : selectedOrigin}</strong> em preparo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 w-full min-w-0">
          {displayedOrders.map(order => {
            const isPreparo = order.status === 'preparo' || order.status === 'cozinha' || order.orderStatus === 'PREPARING';
            const elapsed = getTimeElapsed(order.data_criacao || order.createdAt);
            const isDelayed = parseInt(elapsed) > 30;
            const origem = normalizeOrderOrigem(order);
            const rawMesa = order.mesa_numero || order.mesa || order.tableNumber || order.num_mesa || (order.table?.number || order.table?.name);
            const mesaDisplay = rawMesa 
              ? (String(rawMesa).toLowerCase().startsWith('mesa') 
                  ? String(rawMesa) 
                  : `Mesa ${!isNaN(Number(rawMesa)) ? String(rawMesa).padStart(2, '0') : rawMesa}`)
              : 'Mesa --';

            const rawComanda = order.comanda_id || order.comandaId || order.tabId || order.comanda || order.comandaNumero || order.tabNumber;
            const comandaDisplay = rawComanda
              ? (String(rawComanda).toLowerCase().startsWith('comanda')
                  ? String(rawComanda)
                  : `Comanda ${String(rawComanda).length > 8 ? String(rawComanda).slice(-4) : rawComanda}`)
              : 'Comanda --';

            const garcomResponsavel = order.waiterName || order.garcom_nome || order.garcom || order.waiter || order.garcomNome || order.sentBy?.name || order.createdBy?.name || 'Garçom';

            const rawRodada = order.roundNumber || order.round_number || order.numero_rodada || order.rodada || order.roundIndex || 1;
            const rodadaDisplay = typeof rawRodada === 'number' || typeof rawRodada === 'string'
              ? (String(rawRodada).toLowerCase().startsWith('rodada') ? String(rawRodada) : `Rodada ${rawRodada}`)
              : 'Rodada 1';

            return (
              <div
                key={order.id}
                className={`bg-white rounded-3xl border-2 overflow-hidden shadow-2xs flex flex-col justify-between transition-all w-full min-w-0 max-w-full ${
                  isPreparo ? 'border-amber-500' : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <div className="w-full min-w-0">
                  {/* Origin Visual Stripe */}
                  <div
                    className={`h-1.5 w-full ${
                      origem === 'GARCOM'
                        ? 'bg-emerald-600'
                        : origem === 'DELIVERY'
                        ? 'bg-blue-600'
                        : origem === 'BALCAO'
                        ? 'bg-amber-500'
                        : 'bg-stone-700'
                    }`}
                  />

                  {/* Card Header */}
                  {origem === 'GARCOM' ? (
                    <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-stone-50/80 border-stone-200'}`}>
                      <div className="space-y-2 flex-1 min-w-0">
                        {/* Top Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-stone-500">#{order.numero_pedido || (order.id ? order.id.substring(0, 6).toUpperCase() : '')}</span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black bg-stone-900 text-white shadow-2xs">
                            <Utensils className="w-3 h-3" />
                            GARÇOM
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                            {rodadaDisplay}
                          </span>
                        </div>

                        {/* High-contrast Mesa e Comanda Highlights */}
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <div className="bg-white border-2 border-stone-300 px-2.5 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-black text-stone-900 shadow-2xs flex items-center gap-1">
                            <span>{mesaDisplay}</span>
                          </div>
                          <div className="bg-white border-2 border-stone-300 px-2.5 sm:px-3 py-1 rounded-xl text-xs sm:text-sm font-black text-stone-900 shadow-2xs flex items-center gap-1">
                            <span>{comandaDisplay}</span>
                          </div>
                        </div>

                        {/* Garçom Responsável */}
                        <div className="flex items-center gap-1.5 text-xs text-stone-700 font-bold pt-0.5 min-w-0">
                          <User className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                          <span className="truncate">Garçom: <strong className="font-extrabold text-stone-900">{garcomResponsavel}</strong></span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                          }`}
                        >
                          {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                          <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                        </span>
                        <span className={`text-xs font-bold ${isDelayed ? 'text-rose-600 animate-pulse' : 'text-stone-500'}`}>
                          ⏱️ {elapsed}
                        </span>
                      </div>
                    </div>
                  ) : origem === 'DELIVERY' ? (
                    <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-blue-50/60 border-blue-100'}`}>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-stone-500">#{order.numero_pedido || (order.id ? order.id.substring(0, 6).toUpperCase() : '')}</span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black bg-blue-600 text-white shadow-2xs">
                            <Bike className="w-3 h-3" />
                            DELIVERY
                          </span>
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-black text-stone-900 text-xs sm:text-sm truncate">
                            {order.cliente_nome || 'Cliente Delivery'}
                          </h4>
                          {order.endereco_entrega && (
                            <p className="text-xs text-stone-500 truncate mt-0.5">
                              {typeof order.endereco_entrega === 'string' ? order.endereco_entrega : (order.endereco_entrega.endereco || order.endereco_entrega.bairro || '')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                          }`}
                        >
                          {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                          <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                        </span>
                        <span className={`text-xs font-bold ${isDelayed ? 'text-rose-600 animate-pulse' : 'text-stone-500'}`}>
                          ⏱️ {elapsed}
                        </span>
                      </div>
                    </div>
                  ) : origem === 'BALCAO' ? (
                    <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-50/60 border-amber-100'}`}>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-stone-500">#{order.numero_pedido || (order.id ? order.id.substring(0, 6).toUpperCase() : '')}</span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black bg-amber-600 text-white shadow-2xs">
                            <Store className="w-3 h-3" />
                            BALCÃO
                          </span>
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-black text-stone-900 text-xs sm:text-sm truncate">
                            {order.cliente_nome || 'Cliente Balcão'}
                          </h4>
                          <span className="inline-block text-xs font-bold text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded-md mt-0.5">
                            Retirada no Balcão / PDV
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                          }`}
                        >
                          {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                          <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                        </span>
                        <span className={`text-xs font-bold ${isDelayed ? 'text-rose-600 animate-pulse' : 'text-stone-500'}`}>
                          ⏱️ {elapsed}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* TOTEM */
                    <div className={`p-3.5 sm:p-4 flex items-start justify-between gap-2 border-b ${isPreparo ? 'bg-amber-50/70 border-amber-200' : 'bg-stone-50/80 border-stone-200'}`}>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-stone-500">#{order.numero_pedido || (order.id ? order.id.substring(0, 6).toUpperCase() : '')}</span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-black bg-stone-800 text-white shadow-2xs">
                            <Monitor className="w-3 h-3" />
                            TOTEM
                          </span>
                        </div>

                        <div className="min-w-0">
                          <h4 className="font-black text-stone-900 text-xs sm:text-sm truncate">
                            {order.cliente_nome || 'Cliente Totem'}
                          </h4>
                          <span className="inline-block text-xs font-bold text-stone-800 bg-stone-200/80 px-2 py-0.5 rounded-md mt-0.5">
                            Autoatendimento
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            isPreparo ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-stone-100 text-stone-700 border-stone-200'
                          }`}
                        >
                          {isPreparo ? <Flame className="w-3 h-3 text-amber-600" /> : <Clock className="w-3 h-3 text-stone-500" />}
                          <span>{isPreparo ? 'Em Preparo' : 'Aguardando'}</span>
                        </span>
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

                {/* Card Action */}
                <div className="p-3 sm:p-4 bg-stone-50/80 border-t border-stone-100 shrink-0">
                  {!isPreparo ? (
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(order.id, 'preparo')}
                      className="w-full min-h-[42px] sm:min-h-[44px] py-2.5 px-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-stone-950 font-extrabold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                    >
                      <Flame className="w-4 h-4 text-stone-950" />
                      <span>Iniciar Preparo</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onUpdateStatus(order.id, 'pronto')}
                      className="w-full min-h-[42px] sm:min-h-[44px] py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
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
  );
}
