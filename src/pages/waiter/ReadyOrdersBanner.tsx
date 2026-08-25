import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle2, Utensils } from 'lucide-react';

export function ReadyOrdersBanner() {
  const { user, profile } = useAuth();
  const restaurantId = profile?.restaurantId;
  const [readyOrders, setReadyOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;

    const ordersRef = collection(db, 'restaurants', restaurantId, 'orders');
    const q = query(ordersRef, where('status', 'in', ['pronto', 'ready', 'PRONTO', 'READY']));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersList: any[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const orig = String(data.origem || data.source || data.origin || '').toUpperCase();
        // Consider order if origin is GARCOM/WAITER/TABLE or has waiter details
        const isGarcom = orig === 'GARCOM' || orig === 'GARÇOM' || orig === 'WAITER' || orig === 'TABLE' || orig === 'MESA' || Boolean(data.waiterName || data.garcom_nome);
        if (isGarcom) {
          ordersList.push({ id: docSnap.id, ...data });
        }
      });
      setReadyOrders(ordersList);
      setLoading(false);
    }, (err) => {
      console.warn('Erro ao carregar pedidos prontos no módulo garçom:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [restaurantId]);

  const handleMarkServed = async (order: any) => {
    if (!restaurantId || !order.id || submittingId) return;
    setSubmittingId(order.id);

    try {
      const clientActionId = `act_srv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const idToken = await user?.getIdToken();

      let success = false;
      if (idToken) {
        try {
          const res = await fetch(`/api/restaurant/orders/${order.id}/status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              status: 'entregue',
              clientActionId
            })
          });
          if (res.ok) success = true;
        } catch (err) {
          console.warn('Backend status update falhou, aplicando via Firestore:', err);
        }
      }

      if (!success) {
        const now = new Date().toISOString();
        const orderRef = doc(db, 'restaurants', restaurantId, 'orders', order.id);
        await updateDoc(orderRef, {
          status: 'entregue',
          deliveryStatus: 'DELIVERED',
          canonicalStatus: 'DELIVERED',
          orderStatus: 'DELIVERED',
          deliveredAt: now,
          updatedAt: now
        });
      }
    } catch (err: any) {
      console.error('Erro ao marcar pedido como servido:', err);
      alert(err.message || 'Erro ao alterar status do pedido.');
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading || readyOrders.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-2 text-emerald-800 bg-emerald-100/80 px-4 py-2.5 rounded-2xl border border-emerald-300 shadow-2xs">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 animate-bounce shrink-0" />
        <h3 className="font-extrabold text-xs sm:text-sm">
          Pedidos Prontos para Servir ({readyOrders.length})
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {readyOrders.map((order) => {
          const orderNum = order.numero_pedido || order.numeroPedido || (order.id ? order.id.substring(0, 6).toUpperCase() : '');
          const tableNum = order.mesa_numero || order.tableNumber || order.tableName || order.mesa || '--';
          const comandaNum = order.comanda_id || order.tabId || order.comandaId || order.comandaNumero || '';
          const waiter = order.waiterName || order.garcom_nome || order.sentBy?.name || '';
          const roundNum = order.roundNumber || order.numero_rodada;
          const itemsList = Array.isArray(order.items) ? order.items : (Array.isArray(order.itens) ? order.itens : []);

          return (
            <div 
              key={order.id}
              className="bg-white border-2 border-emerald-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all space-y-3 relative overflow-hidden flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black bg-stone-900 text-white">
                      Pedido #{orderNum}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-600 text-white">
                      PRONTO
                    </span>
                  </div>
                  {roundNum && (
                    <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg">
                      Rodada {roundNum}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs font-extrabold text-stone-900 flex-wrap">
                  <span className="bg-stone-100 px-2.5 py-1 rounded-xl border border-stone-300">
                    Mesa {tableNum}
                  </span>
                  {comandaNum && (
                    <span className="bg-stone-100 px-2.5 py-1 rounded-xl border border-stone-300">
                      Comanda {comandaNum}
                    </span>
                  )}
                  {waiter && (
                    <span className="text-stone-500 font-bold ml-auto text-[11px]">
                      Garçom: {waiter}
                    </span>
                  )}
                </div>

                {/* Items List */}
                <div className="space-y-1 text-xs text-stone-700 pt-1">
                  <span className="font-black text-stone-400 uppercase tracking-wider text-[10px] block">
                    Itens:
                  </span>
                  <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-200/80 space-y-1 max-h-32 overflow-y-auto">
                    {itemsList.map((item: any, idx: number) => {
                      const qty = item.quantidade || item.quantity || 1;
                      const name = item.nome || item.productName || item.produtoNome || 'Item';
                      const obs = item.observacao || item.observation || '';
                      const size = item.tamanhoSelecionado?.nome || item.size;

                      return (
                        <div key={idx} className="flex flex-col border-b border-stone-200/50 last:border-0 pb-1 last:pb-0">
                          <div className="flex items-center gap-1.5 font-extrabold text-stone-900">
                            <span className="bg-emerald-100 text-emerald-900 px-1.5 py-0.2 rounded text-[11px]">
                              {qty}x
                            </span>
                            <span className="truncate">{name}</span>
                            {size && <span className="text-stone-500 text-[11px] shrink-0">({size})</span>}
                          </div>
                          {obs && (
                            <span className="text-[11px] text-amber-700 italic pl-5 truncate">
                              Obs: {obs}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={() => handleMarkServed(order)}
                disabled={submittingId === order.id}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2 min-h-[44px]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submittingId === order.id ? 'Atualizando...' : 'SERVIDO NA MESA'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
