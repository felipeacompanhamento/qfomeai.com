import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
  collection, query, where, orderBy, collectionGroup, doc, updateDoc, getDoc, addDoc, getDocs, limit, startAfter, onSnapshot 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { cache } from '../../utils/cache';
import { cacheOrders } from '../../utils/cacheOrders';
import { useAuth } from '../../contexts/AuthContext';
import { useAppLoading } from '../../contexts/AppLoadingContext';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { X, Star as StarIcon, ChevronLeft, ShoppingBag, Clock, CheckCircle2, XCircle, AlertCircle, Star, RefreshCw, Copy, Check, Bike, Home as HomeIcon, Receipt, ShoppingCart, User } from 'lucide-react';
import { motion } from 'motion/react';
import { invalidateReviewsCache } from '../../services/dashboardService';
import { playNotificationSound, registerPushNotifications, playChefBell } from '../../firebaseMessaging';
import ReportModal from '../../components/ReportModal';
import QRCode from 'qrcode';
import { gerarPix } from '../../utils/pixUtils';
import CustomerDeliveryTrackingBlock from '../../components/delivery/CustomerDeliveryTrackingBlock';

function PixPaymentInfo({ order }: { order: any }) {
  const [pixData, setPixData] = useState<{
    code: string | null;
    qrCode: string | null;
    key: string | null;
    type: 'chave' | 'qrcode';
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchPixData = async () => {
      if (order.forma_pagamento !== 'pix' || order.pago || ['cancelado', 'rejeitado'].includes(order.status)) {
        if (isMounted) {
          setLoading(false);
          setPixData(null);
        }
        return;
      }

      if (!order.restaurant_id) {
        if (isMounted) setLoading(false);
        return;
      }

      if (isMounted) setLoading(true);
      
      try {
        // Fetch latest restaurant data to check for Mercado Pago integration
        const restDoc = await getDoc(doc(db, 'restaurants', order.restaurant_id));
        if (!restDoc.exists()) {
          if (isMounted) setLoading(false);
          return;
        }
        
        const restData = restDoc.data();
        
        // Check if Mercado Pago is enabled and selected as display type
        if (restData.pix_display_type === 'mercadopago' && restData.mercadopago_enabled && restData.mercadopago_access_token) {
          // If order already has MP data, use it
          if (order.pix_copia_cola && order.pix_qr_code_base64) {
            if (isMounted) {
              setPixData({
                code: order.pix_copia_cola,
                qrCode: `data:image/png;base64,${order.pix_qr_code_base64}`,
                key: null,
                type: 'qrcode'
              });
            }
          } else {
            // Otherwise, call backend to create payment (fallback)
            try {
              const response = await fetch('/api/payments/mercadopago/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId: order.id,
                  restaurantId: order.restaurant_id
                })
              });
              
              if (response.ok) {
                const data = await response.json();
                if (isMounted) {
                  setPixData({
                    code: data.qr_code,
                    qrCode: `data:image/png;base64,${data.qr_code_base64}`,
                    key: null,
                    type: 'qrcode'
                  });
                }
              } else {
                const errData = await response.json();
                console.error("Failed to create Mercado Pago payment:", errData);
              }
            } catch (err) {
              console.error("Error calling Mercado Pago API:", err);
            }
          }
        } else {
          // Manual PIX flow (QR Code or Key)
          let key = restData.chave_pix || restData.pixKey || order.chave_pix;
          let type = restData.pix_display_type || order.pix_display_type;

          const finalType = type === 'qrcode' ? 'qrcode' : 'chave';
          const finalKey = key || null;
          
          let code = null;
          let qrCode = null;

          if (finalKey && finalType === 'qrcode') {
            const description = `Qfomeai:-${order.id.slice(-6).toUpperCase()}-${order.cliente_nome}`;
            code = gerarPix(
              finalKey,
              order.valor_total,
              order.restaurant_nome || 'Restaurante',
              order.cidade || 'Brasil',
              description
            );
            
            qrCode = await QRCode.toDataURL(code, {
              width: 200,
              margin: 2,
              color: {
                dark: '#065f46', // emerald-800
                light: '#ffffff'
              }
            });
          }

          if (isMounted) {
            setPixData({ 
              code, 
              qrCode, 
              key: finalKey, 
              type: finalType 
            });
          }
        }
      } catch (error) {
        console.error("Error generating PIX:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPixData();
    return () => { isMounted = false; };
  }, [order.id, order.restaurant_id, order.forma_pagamento, order.pago, order.status, order.chave_pix, order.pix_display_type, order.pix_copia_cola, order.pix_qr_code_base64]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (order.forma_pagamento !== 'pix' || order.pago || ['cancelado', 'rejeitado'].includes(order.status)) return null;
  if (loading) return <div className="mt-4 p-4 bg-stone-50 rounded-2xl text-center text-xs text-stone-400">Carregando PIX...</div>;
  if (!pixData || (!pixData.key && !pixData.code)) return null;

  return (
    <div className="mt-4 p-6 bg-emerald-50 border border-emerald-100 rounded-3xl flex flex-col items-center">
      <p className="text-xs font-bold text-emerald-800 uppercase tracking-widest mb-4">Pagamento via PIX</p>
      
      {pixData.type === 'qrcode' ? (
        <>
          {pixData.qrCode && (
            <div className="bg-white p-3 rounded-2xl shadow-sm mb-4">
              <img src={pixData.qrCode} alt="QR Code PIX" className="w-40 h-40" />
            </div>
          )}

          <div className="w-full space-y-3">
            <div className="bg-white p-3 rounded-xl border border-emerald-200 overflow-hidden">
              <p className="text-[10px] text-stone-400 uppercase font-bold mb-1">Código Copia e Cola</p>
              <p className="text-[10px] font-mono text-stone-600 break-all line-clamp-2">{pixData.code}</p>
            </div>

            <button 
              onClick={() => pixData.code && handleCopy(pixData.code)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>PIX Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar PIX</span>
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        <div className="w-full space-y-3">
          <div className="bg-white p-4 rounded-2xl border border-emerald-200 text-center">
            <p className="text-[10px] text-stone-400 uppercase font-bold mb-2">Chave PIX do Restaurante</p>
            <p className="text-lg font-bold text-stone-800 break-all">{pixData.key}</p>
          </div>

          <button 
            onClick={() => pixData.key && handleCopy(pixData.key)}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all active:scale-95"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Chave Copiada!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar Chave PIX</span>
              </>
            )}
          </button>
        </div>
      )}
      
      <p className="text-[10px] text-emerald-600 mt-3 text-center">O restaurante iniciará o preparo após a confirmação do pagamento.</p>
    </div>
  );
}

export default function Orders() {
  const { user } = useAuth();
  const { triggerSplash } = useAppLoading();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const navigate = useNavigate();

  const userId = user?.uid;
  const isFetching = useRef(false);
  const [activeTab, setActiveTab] = useState<'andamento' | 'entregues' | 'cancelados'>('andamento');

  const fetchOrders = async () => {
    if (!userId || isFetching.current) return [];
    isFetching.current = true;
    setLoading(true);
    try {
      const q = query(
        collectionGroup(db, 'orders'),
        where('cliente_id', '==', userId),
        orderBy('data_criacao', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      setOrders(docs);
      setLoading(false);
      
      const cacheKey = `orders_${userId}`;
      cacheOrders.set(cacheKey, docs);
      return docs;
    } catch (error) {
      console.error("Error fetching orders:", error);
      setLoading(false);
      return [];
    } finally {
      isFetching.current = false;
    }
  };

  const filteredOrders = useMemo(() => {
    switch (activeTab) {
      case 'andamento':
        return orders.filter(o => !['entregue', 'cancelado', 'rejeitado'].includes(o.status));
      case 'entregues':
        return orders.filter(o => o.status === 'entregue');
      case 'cancelados':
        return orders.filter(o => ['cancelado', 'rejeitado'].includes(o.status));
      default:
        return orders;
    }
  }, [orders, activeTab]);

  // 1. Prompt for notification permission
  useEffect(() => {
    if (!userId) return;
    registerPushNotifications(userId);
  }, [userId]);

  // 2. Fetch all orders (initial load)
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    triggerSplash();
    fetchOrders();
  }, [userId, triggerSplash]);

  // 3. Setup individual onSnapshot listeners for active orders
  useEffect(() => {
    if (!userId) return;
    
    const unsubscribeMap = new Map<string, () => void>();
    const timeoutMap = new Map<string, NodeJS.Timeout>();

    const setupOrderListener = async (order: any) => {
      if (unsubscribeMap.has(order.id)) return;

      // 1. Get restaurant max delivery time
      let maxDeliveryTime = 60; // Default 60 mins
      try {
        const restDoc = await getDoc(doc(db, 'restaurants', order.restaurant_id));
        if (restDoc.exists()) {
          maxDeliveryTime = restDoc.data().tempo_max_entrega || 60;
        }
      } catch (e) {
        console.error("Error fetching restaurant for timeout:", e);
      }

      // 2. Calculate expiration
      const createdAt = new Date(order.data_criacao).getTime();
      const expirationTime = createdAt + (maxDeliveryTime * 60 * 1000);
      const now = Date.now();
      const remainingTime = expirationTime - now;

      if (remainingTime <= 0) {
        console.log(`[Firestore] Pedido ${order.id} já expirou.`);
        return;
      }

      // 3. Setup listener
      console.log(`[Firestore] Iniciando listener para pedido ${order.id}, expira em ${Math.round(remainingTime/1000/60)} min.`);
      const unsubscribe = onSnapshot(doc(db, 'restaurants', order.restaurant_id, 'orders', order.id), (docSnap) => {
        if (!docSnap.exists()) return;
        const updatedOrder = { id: docSnap.id, ...docSnap.data() } as any;
        
        setOrders(prev => {
          const oldOrder = prev.find(o => o.id === updatedOrder.id);
          if (oldOrder && oldOrder.status !== updatedOrder.status) {
            playChefBell();
          }
          return prev.map(o => o.id === updatedOrder.id ? updatedOrder : o);
        });

        setSelectedOrder((prevSelected: any) => {
          if (prevSelected && prevSelected.id === updatedOrder.id) {
            return updatedOrder;
          }
          return prevSelected;
        });

        if (['entregue', 'cancelado', 'rejeitado'].includes(updatedOrder.status)) {
          console.log(`[Firestore] Pedido ${updatedOrder.id} terminal, removendo listener.`);
          cleanupOrder(updatedOrder.id);
        }
      });

      unsubscribeMap.set(order.id, unsubscribe);

      // 4. Set timeout
      const timeout = setTimeout(() => {
        console.log(`[Firestore] Timeout atingido para pedido ${order.id}, removendo listener.`);
        cleanupOrder(order.id);
      }, remainingTime);

      timeoutMap.set(order.id, timeout);
    };

    const cleanupOrder = (orderId: string) => {
      if (unsubscribeMap.has(orderId)) {
        unsubscribeMap.get(orderId)!();
        unsubscribeMap.delete(orderId);
      }
      if (timeoutMap.has(orderId)) {
        clearTimeout(timeoutMap.get(orderId)!);
        timeoutMap.delete(orderId);
      }
    };

    // Fetch active orders to setup listeners
    const fetchActiveOrders = async () => {
        const q = query(
          collectionGroup(db, 'orders'),
          where('cliente_id', '==', userId),
          where('status', 'not-in', ['entregue', 'cancelado', 'rejeitado']),
          orderBy('status'),
          orderBy('data_criacao', 'desc')
        );
        const snapshot = await getDocs(q);
        const activeDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        activeDocs.forEach(setupOrderListener);
    };
    
    fetchActiveOrders();

    return () => {
      console.log('[Firestore] Removendo todos os listeners de pedidos.');
      unsubscribeMap.forEach(unsub => unsub());
      timeoutMap.forEach(timeout => clearTimeout(timeout));
    };
  }, [userId]);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'pendente': 'Pendente',
      'aceito': 'Aceito',
      'preparo': 'Em Preparo',
      'pronto': 'Pronto para Entrega',
      'entrega': 'Saiu para Entrega',
      'entregue': 'Entregue',
      'cancelado': 'Cancelado',
      'rejeitado': 'Rejeitado'
    };
    return labels[status] || status;
  };

  const handleRateOrder = async () => {
    if (!selectedOrder || rating === 0) return;
    try {
      // 1. Update order document
      await updateDoc(doc(db, 'restaurants', selectedOrder.restaurant_id, 'orders', selectedOrder.id), {
        avaliacao: {
          nota: rating,
          comentario: comment,
          data: new Date().toISOString()
        }
      });

      // 2. Add to ratings collection
      await addDoc(collection(db, 'restaurants', selectedOrder.restaurant_id, 'avaliacoes'), {
        pedido_id: selectedOrder.id,
        restaurant_id: selectedOrder.restaurant_id,
        cliente_id: user?.uid,
        nome_cliente: user?.displayName?.split(' ')[0] || 'Cliente',
        nota: rating,
        comentario: comment,
        data: new Date().toISOString()
      });

      invalidateReviewsCache(selectedOrder.restaurant_id);

      // 3. Update restaurant score
      const restaurantRef = doc(db, 'restaurants', selectedOrder.restaurant_id);
      const restaurantSnap = await getDoc(restaurantRef);
      if (restaurantSnap.exists()) {
        const data = restaurantSnap.data();
        const oldMedia = data.media_avaliacao || 0;
        const oldTotal = data.total_avaliacoes || 0;
        const newTotal = oldTotal + 1;
        const newMedia = ((oldMedia * oldTotal) + rating) / newTotal;
        await updateDoc(restaurantRef, {
            media_avaliacao: newMedia,
            total_avaliacoes: newTotal
        });
      }
      
      // Atualiza estado local e cache (evita nova leitura)
      const updateData = {
        avaliacao: {
          nota: rating,
          comentario: comment,
          data: new Date().toISOString()
        }
      };
      const updatedOrders = orders.map(o => o.id === selectedOrder.id ? { ...o, ...updateData } : o);
      setOrders(updatedOrders);
      cacheOrders.set(`orders_${userId}`, updatedOrders);
      
      setSelectedOrder(null);
      setRating(0);
      setComment('');
    } catch (error) {
      console.error("Error rating order:", error);
    }
  };

  const getStageIndex = (status: string) => {
    const map: Record<string, number> = {
      'pendente': 0,
      'aceito': 1,
      'preparo': 2,
      'pronto': 3,
      'entrega': 4,
      'entregue': 5
    };
    return map[status] ?? -1;
  };

  const getOrderCardStyle = (status: string) => {
    switch (status) {
      case 'pendente': return 'border-red-200 bg-red-50 hover:border-red-300';
      case 'aceito': return 'border-blue-200 bg-blue-50 hover:border-blue-300';
      case 'preparo': return 'border-yellow-200 bg-yellow-50 hover:border-yellow-300';
      case 'pronto': return 'border-emerald-200 bg-emerald-50 hover:border-emerald-300';
      case 'entrega': return 'border-purple-200 bg-purple-50 hover:border-purple-300';
      case 'entregue': 
      case 'finalizado': return 'border-emerald-100 bg-emerald-50/50 hover:border-emerald-200';
      case 'cancelado':
      case 'rejeitado': return 'border-stone-200 bg-stone-50 hover:border-stone-300';
      default: return 'border-stone-100 hover:border-stone-200 bg-white';
    }
  };

  const stages = ['Pendente', 'Aceito', 'Preparo', 'Pronto', 'Entrega', 'Entregue'];

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="bg-stone-900 text-white sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Meus Pedidos</h1>
          <button 
            onClick={() => {
              setLoading(true);
              fetchOrders();
            }} 
            disabled={loading}
            className="text-white hover:text-emerald-400 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        {/* Tabs */}
        <div className="max-w-4xl mx-auto flex px-4">
          <button onClick={() => setActiveTab('andamento')} className={`flex-1 font-bold text-sm py-4 border-b-2 ${activeTab === 'andamento' ? 'text-white border-white' : 'text-stone-400 border-transparent'}`}>Em andamento</button>
          <button onClick={() => setActiveTab('entregues')} className={`flex-1 font-bold text-sm py-4 border-b-2 ${activeTab === 'entregues' ? 'text-white border-white' : 'text-stone-400 border-transparent'}`}>Entregues</button>
          <button onClick={() => setActiveTab('cancelados')} className={`flex-1 font-bold text-sm py-4 border-b-2 ${activeTab === 'cancelados' ? 'text-white border-white' : 'text-stone-400 border-transparent'}`}>Cancelados</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        {loading ? (
          <div className="flex justify-center py-12">Carregando...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-stone-200">
            <Bike className="w-16 h-16 text-stone-200 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-stone-800 mb-2">
              {activeTab === 'andamento' ? 'Nenhum pedido em andamento' : activeTab === 'entregues' ? 'Nenhum pedido entregue' : 'Nenhum pedido cancelado'}
            </h2>
            <p className="text-stone-500 mb-6">
              {activeTab === 'andamento' ? 'Seus pedidos ativos aparecerão aqui.' : 'Seus pedidos correspondentes aparecerão aqui.'}
            </p>
            {activeTab === 'andamento' && <Link to="/" className="text-emerald-600 font-bold hover:underline">Ir para a Home</Link>}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map(order => {
              const stageIndex = getStageIndex(order.status);
              const isTerminal = ['entregue', 'cancelado', 'rejeitado'].includes(order.status);
              
              return (
                <div key={order.id} className={`p-6 rounded-3xl border shadow-sm transition-all ${getOrderCardStyle(order.status)}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-lg text-stone-800">{order.restaurant_nome}</h3>
                      <p className="text-xs text-stone-400"># {order.id.slice(-6).toUpperCase()} • {new Date(order.data_criacao).toLocaleDateString()}</p>
                    </div>
                    <span className="text-lg font-bold text-emerald-600">R$ {order.valor_total.toFixed(2)}</span>
                  </div>

                  {!isTerminal && (
                    <div className="py-4">
                      <div className="relative h-2 bg-stone-200 rounded-full w-full mb-4">
                        <motion.div
                          className="absolute top-0 left-0 h-full bg-emerald-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${(stageIndex / 5) * 100}%` }}
                          transition={{ duration: 0.5 }}
                        />
                        <motion.div
                          className="absolute top-[-10px]"
                          initial={{ left: 0 }}
                          animate={{ left: `${(stageIndex / 5) * 100}%` }}
                          transition={{ duration: 0.5 }}
                        >
                          <Bike className="w-6 h-6 text-emerald-600" />
                        </motion.div>
                      </div>
                      <div className="grid grid-cols-6 gap-1 text-[9px] text-stone-500 font-bold uppercase tracking-wider text-center">
                        {stages.map((s, i) => (
                          <span key={s} className={i <= stageIndex ? 'text-emerald-600' : 'text-stone-400'}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <CustomerDeliveryTrackingBlock 
                    restaurantId={order.restaurant_id} 
                    orderId={order.id} 
                    customerAddress={order.endereco_entrega} 
                  />

                  <div className="mt-4 flex justify-between items-center">
                    <button onClick={() => setSelectedOrder(order)} className="text-emerald-600 font-bold text-sm hover:underline">Ver Detalhes</button>
                    {isTerminal && <span className="text-xs font-bold text-stone-500 uppercase">{getStatusLabel(order.status)}</span>}
                  </div>

                  <PixPaymentInfo order={order} />
                </div>
              );
            })}
          </div>
        )}
      </main>

      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Detalhes do Pedido</h2>
              <button onClick={() => setSelectedOrder(null)}><X /></button>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <div>
                  <p className="text-xs text-stone-400 uppercase font-bold tracking-wider mb-1">Status Atual</p>
                  <p className="font-bold text-emerald-600">{getStatusLabel(selectedOrder.status)}</p>
                </div>
                <button 
                  onClick={async () => {
                    setLoading(true);
                    const freshOrders = await fetchOrders();
                    // Update selectedOrder with the new data from the fetched orders
                    const updated = freshOrders.find(o => o.id === selectedOrder.id);
                    if (updated) setSelectedOrder(updated);
                  }}
                  disabled={loading}
                  className="p-2 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-all disabled:opacity-50"
                  title="Atualizar status"
                >
                  <RefreshCw className={`w-5 h-5 text-stone-600 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <p><strong>Pedido:</strong> #{selectedOrder.id.slice(-6).toUpperCase()}</p>
              <p><strong>Data:</strong> {new Date(selectedOrder.data_criacao).toLocaleString()}</p>
              <div className="border-t pt-4">
                <h3 className="font-bold mb-2">Produtos:</h3>
                {selectedOrder.itens.map((item: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span>{item.quantidade}x {item.nome}</span>
                    <span>R$ {(item.preco * item.quantidade).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              
              <div className="border-t pt-4 mt-4 space-y-2">
                <div className="flex justify-between text-sm text-stone-500">
                  <span>Subtotal:</span>
                  <span>R$ {selectedOrder.subtotal?.toFixed(2) || selectedOrder.valor_total?.toFixed(2)}</span>
                </div>
                
                {selectedOrder.taxa_entrega > 0 && (
                  <div className="flex justify-between text-sm text-stone-500">
                    <span>Taxa de Entrega:</span>
                    <span>R$ {selectedOrder.taxa_entrega.toFixed(2)}</span>
                  </div>
                )}
                
                {selectedOrder.valor_desconto > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 font-medium">
                    <span>Desconto {selectedOrder.cupom_codigo ? `(${selectedOrder.cupom_codigo})` : ''}:</span>
                    <span>- R$ {selectedOrder.valor_desconto.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-stone-100">
                  <span>Total:</span>
                  <span>R$ {selectedOrder.valor_total.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t border-stone-100">
                <button onClick={() => setShowReportModal(true)} className="text-xs text-stone-400 hover:text-stone-600 underline">denunciar abuso</button>
              </div>

              {['entregue', 'finalizado'].includes(selectedOrder.status) && !selectedOrder.avaliacao && (
                <div className="border-t pt-4">
                  <h3 className="font-bold mb-2">Avalie seu pedido:</h3>
                  <div className="flex gap-2 mb-2">
                    {[1,2,3,4,5].map(n => <StarIcon key={n} className={`cursor-pointer ${n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-stone-300'}`} onClick={() => setRating(n)} />)}
                  </div>
                  <textarea className="w-full border rounded-xl p-2" placeholder="Comentário..." value={comment} onChange={e => setComment(e.target.value)} />
                  <button onClick={handleRateOrder} className="w-full bg-emerald-600 text-white rounded-xl py-2 mt-2 font-bold">Avaliar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showReportModal && selectedOrder && (
        <ReportModal
          orderId={selectedOrder.id}
          restaurantId={selectedOrder.restaurant_id}
          clientId={user?.uid || ''}
          reporterId={user?.uid || ''}
          reportedId={selectedOrder.restaurant_id}
          reporterType="client"
          onClose={() => setShowReportModal(false)}
        />
      )}

      <Navbar />
    </div>
  );
}
