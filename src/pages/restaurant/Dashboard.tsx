import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  collection, query, where, doc, updateDoc, orderBy, getDoc, getDocs, limit, startAfter, onSnapshot 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/authApi';
import { 
  LayoutDashboard, ShoppingBag, Utensils, Clock, Settings, Bell, BellRing, 
  Check, X, LogOut, ChevronDown, ChevronRight, Tags, PlusCircle, Plus, 
  Percent, Ticket, Users, CreditCard, MapPin, User, Lock, Menu, Edit2, Save, ArrowLeft, Printer,
  TrendingUp, XCircle, CheckCircle2, BarChart3, AlertTriangle, DollarSign, PieChart, Mail, RefreshCw, List, LayoutGrid, Search, Loader2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart as RePieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { cache } from '../../utils/cache';
import { cacheOrders } from '../../utils/cacheOrders';
import { scheduleService, Schedule } from '../../services/scheduleService';
import PerformanceDashboard from './PerformanceDashboard';
import RestaurantCategories from './Categories';
import RestaurantExtras from './Extras';
import RestaurantProducts from './Products';
import RestaurantSizes from './Sizes';
import RestaurantInvoicePage from './Invoice';
import DeliveryAreas from './DeliveryAreas';
import Schedules from './Schedules';
import RestaurantPayments from './Payments';
import AccountSettings from './AccountSettings';
import PasswordSettings from './PasswordSettings';
import PrintSettings from './PrintSettings';
import Promotions from './Promotions';
import OptionGroups from './OptionGroups';
import MercadoPagoIntegration from './Integration';
import WhatsAppIntegration from './WhatsAppIntegration';
import DriversList from './drivers/DriversList';
import RegisterDriver from './drivers/RegisterDriver';
import AssignedDeliveries from './drivers/AssignedDeliveries';
import DeliverySettings from './drivers/DeliverySettings';

import { registerPushNotifications } from '../../firebaseMessaging';
import RestaurantLayout from '../../layouts/RestaurantLayout';
import { printThermalOrder } from '../../components/orders/OrderThermalPrint';

import OrderListItem, { getOrderCardStyle } from './components/OrderListItem';
import OrderDetails from './components/OrderDetails';
import RestaurantOrdersPage from './orders/RestaurantOrdersPage';

export default function RestaurantDashboard() {
  const { user, profile, refreshUser } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [restaurantProfile, setRestaurantProfile] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [lastAlertedOrderId, setLastAlertedOrderId] = useState<string | null>(null);

  useEffect(() => {
    // Push a state to history to prevent back button from exiting the app
    window.history.pushState(null, '', window.location.pathname);

    const handlePopState = () => {
      // When back is pressed, push the state again to stay on Home
      window.history.pushState(null, '', window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!profile?.restaurantId) return;
    
    const fetchSchedules = async () => {
      const data = await scheduleService.getSchedulesByRestaurant(profile.restaurantId);
      setSchedules(data as Schedule[]);
    };
    
    fetchSchedules();
  }, [profile?.restaurantId]);

  const [resendingEmail, setResendingEmail] = useState(false);
  const [emailSentMessage, setEmailSentMessage] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isFetchingOrders = useRef(false);
  const isInitialLoad = useRef(true);
  const isUpdatingRef = useRef(false);
  const hasPendingUpdateRef = useRef(false);
  const lastFetchTime = useRef(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const updatingOrdersRef = useRef<Set<string>>(new Set());
  const location = useLocation();
  const navigate = useNavigate();
  const isOrdersPage = location.pathname.includes('/orders');

  const handleResendVerification = async () => {
    if (!user || !user.email) return;
    setResendingEmail(true);
    setEmailSentMessage('');
    try {
      const result = await authApi.sendActivationEmail(user.email);
      if (result.success) {
        setEmailSentMessage('E-mail de ativação reenviado com sucesso! Verifique sua caixa de entrada e também a pasta de SPAM.');
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      console.error("Erro ao reenviar e-mail:", error);
      setEmailSentMessage('Erro ao enviar e-mail. ' + (error.message || 'Tente novamente mais tarde.'));
    } finally {
      setResendingEmail(false);
    }
  };

  const restaurantId = profile?.restaurantId;

  const fetchOrders = React.useCallback(async (isAutoPoll = false, force = false) => {
    if (!restaurantId || isFetchingOrders.current) return;
    
    const cacheKey = `orders_${restaurantId}`;
    const cached = cacheOrders.get(cacheKey, 30);
    
    const now = Date.now();

    if (!force && !isAutoPoll && cached) {
      console.log(`[Cache] Pedidos do restaurante ${restaurantId} carregados do cache em memória.`);
      setOrders(cached);
      lastFetchTime.current = now;
      return;
    }

    if (!isAutoPoll) setIsRefreshing(true);
    isFetchingOrders.current = true;
    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'orders'), 
        orderBy('data_criacao', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      
      // Filter out Mercado Pago PIX orders that are not yet approved
      const docs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(order => {
          // If it's a PIX order with MP integration, it must be paid to be visible
          // UNLESS it's already cancelled or rejected (so it doesn't disappear if it fails)
          const isMpPix = order.forma_pagamento === 'pix' && order.mercadopago_payment_id;
          if (isMpPix && !order.pago && order.status === 'pendente') {
            return false;
          }
          return true;
        });
      
      setOrders(docs);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 20);
      
      lastFetchTime.current = Date.now();
      cacheOrders.set(cacheKey, docs);
    } catch (error) {
      console.error("Error fetching restaurant orders:", error);
    } finally {
      isFetchingOrders.current = false;
      if (!isAutoPoll) setIsRefreshing(false);
    }
  }, [restaurantId]);

  const fetchMoreOrders = React.useCallback(async () => {
    if (!restaurantId || isFetchingOrders.current || !hasMore || !lastDoc) return;
    
    setIsLoadingMore(true);
    isFetchingOrders.current = true;
    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'orders'), 
        orderBy('data_criacao', 'desc'),
        startAfter(lastDoc),
        limit(20)
      );
      const snapshot = await getDocs(q);
      
      const newDocs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(order => {
          const isMpPix = order.forma_pagamento === 'pix' && order.mercadopago_payment_id;
          if (isMpPix && !order.pago && order.status === 'pendente') {
            return false;
          }
          return true;
        });
      
      setOrders(prev => [...prev, ...newDocs]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === 20);
    } catch (error) {
      console.error("Error fetching more restaurant orders:", error);
    } finally {
      isFetchingOrders.current = false;
      setIsLoadingMore(false);
    }
  }, [restaurantId, hasMore, lastDoc]);

  useEffect(() => {
    if (user?.uid) {
      registerPushNotifications(user.uid);
    }
    if (!restaurantId) return;

    // Só ativa o listener em tempo real se o restaurante estiver aberto
    const isWithinOperatingHours = () => {
      if (!schedules || schedules.length === 0) return true;
      const now = new Date();
      const day = now.getDay();
      const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const currentDayName = days[day];
      
      const todaySchedule = schedules.find(s => s.dia_semana === currentDayName);
      if (!todaySchedule || todaySchedule.status === 'fechado') return false;
      
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [openH, openM] = todaySchedule.hora_abertura.split(':').map(Number);
      const [closeH, closeM] = todaySchedule.hora_fechamento.split(':').map(Number);
      
      const openTime = openH * 60 + openM;
      const closeTime = closeH * 60 + closeM;
      
      return currentTime >= openTime && currentTime <= closeTime;
    };

    const statusAprovacao = restaurantProfile?.status_aprovacao;
    const statusConfig = (restaurantProfile?.status_operacao_config || 'automatico').toLowerCase();
    
    // Check if restaurant is blocked from opening
    const isBlocked = statusAprovacao === 'pendente_aprovacao' || statusConfig === 'fechado';

    let isRestaurantOpen = false;
    if (!isBlocked) {
      if (statusConfig === 'aberto') {
        isRestaurantOpen = true;
      } else if (statusConfig === 'automatico') {
        isRestaurantOpen = isWithinOperatingHours();
      }
    }
    
    console.log('[Firestore] restaurantProfile:', restaurantProfile);
    console.log('[Firestore] Config:', statusConfig, 'Aprovacao:', statusAprovacao, 'isRestaurantOpen:', isRestaurantOpen);

    if (!isRestaurantOpen) {
      console.log('[Firestore] Restaurante fechado. Listener de pedidos em tempo real desativado.');
      // Se estiver fechado, podemos fazer um fetch inicial apenas para mostrar o que já tem, 
      // mas não mantemos o listener ativo.
      if (isInitialLoad.current) {
        fetchOrders(true);
        isInitialLoad.current = false;
      }
      return;
    }

    console.log('[Firestore] Restaurante aberto. Iniciando listener em tempo real para pedidos...');
    
    const q = query(
      collection(db, 'restaurants', restaurantId, 'orders'), 
      orderBy('data_criacao', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('[Firestore] Snapshot de pedidos recebido/atualizado.');
      
      const firstPageDocs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter(order => {
          const isMpPix = order.forma_pagamento === 'pix' && order.mercadopago_payment_id;
          if (isMpPix && !order.pago && order.status === 'pendente') {
            return false;
          }
          return true;
        });

      setOrders(prevOrders => {
        // Se é a carga inicial ou não temos pedidos carregados, apenas definimos
        if (prevOrders.length === 0 || isInitialLoad.current) {
          return firstPageDocs;
        }

        // Mesclagem inteligente: atualiza existentes e adiciona novos no topo
        const updatedOrders = [...prevOrders];
        let hasChanges = false;

        firstPageDocs.forEach(newOrder => {
          const index = updatedOrders.findIndex(o => o.id === newOrder.id);
          if (index !== -1) {
            // Verifica se houve mudança real nos dados para evitar re-renders desnecessários
            if (JSON.stringify(updatedOrders[index]) !== JSON.stringify(newOrder)) {
              updatedOrders[index] = newOrder;
              hasChanges = true;
            }
          } else {
            // Novo pedido! Adiciona no topo
            updatedOrders.unshift(newOrder);
            hasChanges = true;
          }
        });

        if (!hasChanges && prevOrders.length === updatedOrders.length) {
          return prevOrders;
        }

        // Ordena por data_criacao desc para garantir consistência
        return updatedOrders.sort((a, b) => {
          const dateA = a.data_criacao ? new Date(a.data_criacao).getTime() : 0;
          const dateB = b.data_criacao ? new Date(b.data_criacao).getTime() : 0;
          return dateB - dateA;
        });
      });

      // Atualiza o lastDoc para paginação (baseado no snapshot da primeira página)
      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
      setHasMore(snapshot.docs.length === 20);
      
      const cacheKey = `orders_${restaurantId}`;
      cacheOrders.set(cacheKey, firstPageDocs);
      lastFetchTime.current = Date.now();
      isInitialLoad.current = false;
    }, (error) => {
      console.error("Error in orders snapshot:", error);
      // Fallback para fetch manual se o snapshot falhar
      fetchOrders(true, true);
    });

    setIsLive(true);

    return () => {
      console.log('[Firestore] Removendo listener de pedidos.');
      setIsLive(false);
      unsubscribe();
    };
  }, [restaurantId, user?.uid, restaurantProfile?.status_operacao, restaurantProfile?.status_operacao_config]);

  useEffect(() => {
    const handleNewOrder = () => {
      console.log('DEBUG: handleNewOrder capturado no Dashboard (via evento)');
      // Com onSnapshot, o pedido novo já deve estar sendo carregado automaticamente.
      // O evento serve principalmente para logs ou se quisermos forçar algo extra.
      // fetchOrders(false, true); // Removido para evitar buscas duplicadas
    };

    window.addEventListener('new-order-received', handleNewOrder);

    return () => {
      window.removeEventListener('new-order-received', handleNewOrder);
    };
  }, []);

  const hasNewOrder = React.useMemo(() => {
    const pending = orders.filter(o => o.status === 'pendente');
    if (pending.length === 0) return false;
    
    // Só considera "novo" se o ID do pedido mais recente for diferente do último que alertamos
    const newest = pending[0];
    return newest.id !== lastAlertedOrderId;
  }, [orders, lastAlertedOrderId]);

  useEffect(() => {
    if (!profile?.restaurantId) return;
    
    console.log('[Firestore] Iniciando listener para perfil do restaurante...');
    const docRef = doc(db, 'restaurants', profile.restaurantId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setRestaurantProfile(docSnap.data());
      }
    }, (error) => {
      console.error("Error in restaurant profile snapshot:", error);
    });

    return () => unsubscribe();
  }, [profile?.restaurantId]);

  useEffect(() => {
    const hasPendingOrders = orders.some(o => o.status === 'pendente');
    if (hasPendingOrders) {
      if (!audioRef.current) {
        audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audioRef.current.loop = true;
      }
      audioRef.current.play().catch(e => console.log("Audio play blocked by browser"));
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    }
  }, [orders]);

  const handleUpdateStatus = React.useCallback(async (orderId: string, newStatus: string, motivo?: string) => {
    if (!profile?.restaurantId || updatingOrdersRef.current.has(orderId)) return;
    
    // Busca o pedido atual para verificar o status de pagamento
    const currentOrder = orders.find(o => o.id === orderId);
    
    // Se o status já for o mesmo, não faz nada
    if (currentOrder?.status === newStatus) return;
    
    // Regra de negócio: Pedido só pode ser finalizado/entregue se estiver pago
    if ((newStatus === 'entregue' || newStatus === 'finalizado') && currentOrder && !currentOrder.pago) {
      alert('Este pedido ainda não foi marcado como PAGO. Por favor, confirme o pagamento antes de finalizar.');
      return;
    }

    // Alerta de estorno para Mercado Pago
    if ((newStatus === 'cancelado' || newStatus === 'rejeitado') && currentOrder?.pago && currentOrder?.mercadopago_payment_id) {
      const confirmRefund = window.confirm(
        "Este pedido foi pago via Mercado Pago. Ao cancelar ou rejeitar, um estorno TOTAL será solicitado automaticamente para o cliente. Deseja prosseguir?"
      );
      if (!confirmRefund) return;
      
      // Solicita estorno ao servidor (não bloqueia o fluxo principal)
      fetch('/api/payments/mercadopago/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: profile.restaurantId,
          orderId: orderId,
          amount: currentOrder.total // Estorno total
        })
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          console.error('Erro ao solicitar estorno:', err);
          alert(`Aviso: O status do pedido mudou, mas houve um erro ao processar o estorno automático: ${err.error || 'Erro desconhecido'}. Por favor, verifique no painel do Mercado Pago.`);
        } else {
          console.log('Estorno solicitado com sucesso');
        }
      }).catch(err => {
        console.error('Erro de rede ao solicitar estorno:', err);
        alert('Aviso: O status do pedido mudou, mas houve um erro de rede ao processar o estorno automático. Verifique no painel do Mercado Pago.');
      });
    }

    updatingOrdersRef.current.add(orderId);
    setUpdatingOrderId(orderId);

    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'aceito') updateData.data_aceite = new Date().toISOString();
      if (newStatus === 'rejeitado' && motivo) updateData.motivo_cancelamento = motivo;
      if (newStatus === 'finalizado') updateData.data_finalizado = new Date().toISOString();

      // Atualiza diretamente no Firestore
      const orderRef = doc(db, 'restaurants', profile.restaurantId, 'orders', orderId);
      const oldOrder = orders.find(o => o.id === orderId);
      
      await updateDoc(orderRef, updateData);
      
      // Atualiza o estado local e o cache imediatamente (evita nova leitura e não espera a notificação)
      setOrders(prevOrders => {
        const updatedOrders = prevOrders.map(o => o.id === orderId ? { ...o, ...updateData } : o);
        cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
        
        // Se o status mudou para algo que não seja 'pendente', paramos o som para este ciclo
        if (newStatus !== 'pendente') {
          const pending = updatedOrders.filter(o => o.status === 'pendente');
          if (pending.length > 0) {
            setLastAlertedOrderId(pending[0].id);
          } else {
            setLastAlertedOrderId(null);
          }
        }
        return updatedOrders;
      });
      
      // Enviar notificação push para o cliente apenas se o status mudou
      if (oldOrder && oldOrder.status !== newStatus && oldOrder.cliente_id) {
        try {
          const restName = restaurantProfile?.nome_fantasia || profile?.nome || 'Restaurante';
          const statusNames: Record<string, { title: string, body: string }> = {
            'aceito': { 
              title: `Pedido Confirmado! 🥳`, 
              body: `Ótimas notícias! O *${restName}* acabou de aceitar seu pedido. Já estamos organizando tudo por aqui para começar o preparo! ✨` 
            },
            'preparo': { 
              title: `Mão na massa! 🍔`, 
              body: `O cheirinho está ficando bom! 😋 O *${restName}* já começou a preparar seu pedido com todo carinho.` 
            },
            'pronto': { 
              title: `Tudo pronto! 🚀`, 
              body: `Seu pedido no *${restName}* está prontinho e te esperando! Logo, logo ele estará com você.` 
            },
            'entrega': { 
              title: `Saiu para entrega! 🚴`, 
              body: `Aqueça o coração (e o estômago)! ❤️ O entregador do *${restName}* já saiu e está a caminho do seu endereço.` 
            },
            'entregue': { 
              title: `Pedido entregue! 😋`, 
              body: `Seu pedido do *${restName}* chegou! 🎉 Esperamos que aproveite cada mordida. Bom apetite!` 
            },
            'cancelado': { 
              title: `Pedido cancelado 😔`, 
              body: `Poxa, o seu pedido no *${restName}* precisou ser cancelado. Se tiver dúvidas, entre em contato conosco.` 
            },
            'rejeitado': { 
              title: `Pedido não aceito 😕`, 
              body: `Infelizmente o *${restName}* não pôde aceitar seu pedido no momento. Tente novamente mais tarde ou escolha outro item delicioso!` 
            }
          };
          const statusMessage = statusNames[newStatus];
          if (statusMessage) {
            const userDoc = await getDoc(doc(db, 'users', oldOrder.cliente_id));
            const userData = userDoc.data();
            if (userData?.fcmToken) {
              // Não usamos await aqui para não bloquear a UI caso a requisição demore
              fetch('/api/notifications/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  token: userData.fcmToken,
                  title: statusMessage.title,
                  body: statusMessage.body,
                  orderId: orderId,
                  restaurantId: profile.restaurantId,
                  type: 'status_update'
                })
              }).catch(err => console.error('Erro ao enviar notificação:', err));
            }
          }
        } catch (notifError) {
          console.error("Erro ao processar notificação:", notifError);
          // Não interrompe o fluxo pois o status já foi atualizado
        }
      }
    } catch (error) {
      console.error("Error updating order:", error);
      alert('Erro ao atualizar status do pedido. Verifique sua conexão.');
    } finally {
      updatingOrdersRef.current.delete(orderId);
      setUpdatingOrderId(null);
    }
  }, [profile?.restaurantId, profile?.nome, restaurantProfile, orders]);

  const pendingOrdersCount = orders.filter(o => o.status === 'pendente').length;

  return (
    <RestaurantLayout pendingOrdersCount={pendingOrdersCount}>
      {isLive && (
        <div className="fixed top-4 right-4 z-[9999]">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        </div>
      )}
      {user && !user.emailVerified && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-stone-800 text-sm">E-mail não verificado</p>
              <p className="text-stone-500 text-xs">Verifique seu e-mail para garantir a segurança da sua conta.</p>
              {emailSentMessage && <p className="text-emerald-600 text-xs font-bold mt-1">{emailSentMessage}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              onClick={handleResendVerification}
              disabled={resendingEmail}
              className="flex-1 sm:flex-none px-4 py-2 bg-orange-600 text-white text-xs font-bold rounded-xl hover:bg-orange-700 disabled:bg-orange-400 transition-all"
            >
              {resendingEmail ? 'Enviando...' : 'Reenviar E-mail'}
            </button>
            <button 
              onClick={() => refreshUser()}
              className="p-2 bg-white border border-stone-200 text-stone-600 rounded-xl hover:bg-stone-50 transition-all"
              title="Atualizar status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!isOrdersPage && (
        <header className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-stone-800">Olá, {profile?.nome}</h2>
            <p className="text-stone-500 text-sm">Gerencie seu restaurante em tempo real.</p>
          </div>
          
          <div className="hidden sm:flex items-center gap-4">
            <button
              onClick={async () => {
                if (user) {
                  const { registerPushNotifications } = await import('../../firebaseMessaging');
                  const token = await registerPushNotifications(user.uid);
                  if (token) {
                    alert('Notificações ativadas com sucesso!');
                  } else {
                    alert('Não foi possível ativar as notificações. Verifique as permissões do navegador.');
                  }
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-600 font-bold text-sm rounded-full hover:bg-stone-50 transition-all shadow-sm"
              title="Ativar Notificações"
            >
              <Bell className="w-4 h-4" />
              <span>Notificações</span>
            </button>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm ${hasNewOrder ? 'bg-red-100 text-red-600 animate-bounce' : 'bg-emerald-100 text-emerald-600'}`}>
              {hasNewOrder ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              <span>{hasNewOrder ? 'Novo Pedido!' : 'Tudo em dia'}</span>
            </div>
          </div>
        </header>
      )}

      <Routes>
        <Route path="/" element={<DashboardStats orders={orders} />} />
        <Route path="dashboard" element={<DashboardStats orders={orders} />} />
        <Route path="desempenho" element={<PerformanceDashboard orders={orders} />} />
        <Route path="orders" element={
          <RestaurantOrdersPage 
            orders={orders} 
            setOrders={setOrders} 
            onUpdate={handleUpdateStatus} 
            restaurantProfile={restaurantProfile}
            onRefresh={() => fetchOrders(false, true)}
            isRefreshing={isRefreshing}
            isLoadingMore={isLoadingMore}
            updatingOrderId={updatingOrderId}
            onLoadMore={fetchMoreOrders}
            hasMore={hasMore}
          />
        } />
        
        <Route path="menu/categories" element={<RestaurantCategories />} />
        <Route path="menu/items" element={<RestaurantProducts />} />
        <Route path="menu/sizes" element={<RestaurantSizes />} />
        <Route path="fatura" element={<RestaurantInvoicePage />} />
        <Route path="menu/extras" element={<RestaurantExtras />} />
        <Route path="menu/grupos" element={<OptionGroups />} />
        <Route path="delivery-areas" element={<DeliveryAreas />} />
        <Route path="schedules" element={<Schedules />} />
        <Route path="menu/promotions" element={<Promotions />} />

        {/* Entregadores / Drivers Routes */}
        <Route path="drivers" element={<DriversList />} />
        <Route path="drivers/new" element={<RegisterDriver />} />
        <Route path="drivers/deliveries" element={<AssignedDeliveries />} />
        <Route path="drivers/settings" element={<DeliverySettings />} />
        
        {/* Configurações Subroutes */}
        <Route path="settings/payments" element={<RestaurantPayments />} />
        <Route path="settings/account" element={<AccountSettings />} />
        <Route path="settings/password" element={<PasswordSettings />} />
        <Route path="settings/print" element={<PrintSettings />} />
        <Route path="settings/integration" element={<MercadoPagoIntegration />} />
        <Route path="settings/whatsapp" element={<WhatsAppIntegration />} />
        
        {/* Fallback for white screen prevention */}
        <Route path="*" element={
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-stone-200 text-center">
            <h3 className="text-lg font-bold text-stone-800 mb-2">Página não encontrada</h3>
            <p className="text-stone-500 mb-6">A página que você está tentando acessar não existe.</p>
            <button 
              onClick={() => navigate('/restaurant/dashboard')}
              className="px-6 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all"
            >
              Voltar para o Dashboard
            </button>
          </div>
        } />
      </Routes>
    </RestaurantLayout>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">{title}</h2>
          <p className="text-stone-500 text-sm">Gerenciamento de {title.toLowerCase()} em breve.</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl opacity-50 cursor-not-allowed">
          Novo {title}
        </button>
      </div>
      
      <div className="p-12 bg-white rounded-3xl border border-stone-200 text-center">
        <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-stone-300" />
        </div>
        <h3 className="text-lg font-bold text-stone-800 mb-2">Página em Construção</h3>
        <p className="text-stone-500 max-w-md mx-auto">
          Estamos trabalhando para trazer as melhores ferramentas de gestão para você. 
          Em breve esta funcionalidade estará disponível.
        </p>
      </div>
    </div>
  );
}

const StatCard = React.memo(({ label, value, icon: Icon, color }: { label: string, value: string | number, icon: any, color: string }) => {
  return (
    <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
      <div className={`w-12 h-12 ${color} text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg`}>
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-stone-500 font-bold text-sm uppercase tracking-wider">{label}</p>
      <h3 className="text-3xl font-bold text-stone-800 mt-1">{value}</h3>
    </div>
  );
});

const DashboardStats = React.memo(({ orders }: { orders: any[] }) => {
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (orders) {
      setLoading(false);
    }
  }, [orders]);

  const metrics = React.useMemo(() => {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Início do mês atual para cálculo de faturamento mensal
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Filtra pedidos de hoje e do mês atual
    const todayOrders = orders.filter(o => new Date(o.data_criacao) >= today);
    const monthOrders = orders.filter(o => new Date(o.data_criacao) >= startOfMonth);

    // 1. Pedidos em aberto (não finalizados/cancelados) vs concluídos (entregues/finalizados)
    const openOrdersCount = todayOrders.filter(o => ['pendente', 'aceito', 'preparo', 'pronto', 'entrega'].includes(o.status)).length;
    const completedOrdersCount = todayOrders.filter(o => ['entregue', 'finalizado'].includes(o.status)).length;

    // 2. Pedidos cancelados hoje (contagem e percentual sobre o total do dia)
    const cancelledOrders = todayOrders.filter(o => ['cancelado', 'rejeitado'].includes(o.status));
    const cancelledCount = cancelledOrders.length;
    const cancelledPercent = todayOrders.length > 0 ? (cancelledCount / todayOrders.length) * 100 : 0;

    // 3. Ticket médio do dia (faturamento total / total de pedidos)
    const totalRevenueToday = todayOrders.reduce((acc, o) => acc + (o.valor_total || 0), 0);
    const avgTicketToday = todayOrders.length > 0 ? totalRevenueToday / todayOrders.length : 0;

    // 4. Produtos mais vendidos do dia (agrupados por nome)
    const productSales: Record<string, { nome: string, qtd: number }> = {};
    todayOrders.forEach(o => {
      o.itens?.forEach((i: any) => {
        if (!productSales[i.nome]) productSales[i.nome] = { nome: i.nome, qtd: 0 };
        productSales[i.nome].qtd += i.quantidade;
      });
    });
    const topProducts = Object.values(productSales).sort((a, b) => b.qtd - a.qtd).slice(0, 5);

    // 5. Clientes recorrentes hoje (clientes que fizeram mais de 1 pedido no mesmo dia)
    const clientOrders: Record<string, number> = {};
    todayOrders.forEach(o => {
      if (o.cliente_id) {
        clientOrders[o.cliente_id] = (clientOrders[o.cliente_id] || 0) + 1;
      }
    });
    const recurringClientsToday = Object.values(clientOrders).filter(count => count > 1).length;

    // 6. Horários de pico (contagem de pedidos por hora do dia)
    const hourlyVolume = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}h`, count: 0 }));
    todayOrders.forEach(o => {
      const hour = new Date(o.data_criacao).getHours();
      hourlyVolume[hour].count += 1;
    });

    // 7. Percentual de pedidos atrasados
    // Regra: pendente há mais de 15min ou aceito há mais de 45min sem alteração de status
    const delayedOrders = todayOrders.filter(o => {
      const created = new Date(o.data_criacao);
      const diffMins = (now.getTime() - created.getTime()) / (1000 * 60);
      if (o.status === 'pendente' && diffMins > 15) return true;
      if (o.status === 'aceito' && diffMins > 45) return true;
      return false;
    });
    const delayedPercent = todayOrders.length > 0 ? (delayedOrders.length / todayOrders.length) * 100 : 0;

    // 8. Faturamento acumulado no mês
    const totalRevenueMonth = monthOrders.reduce((acc, o) => acc + (o.valor_total || 0), 0);

    return {
      todayOrders,
      openOrdersCount,
      completedOrdersCount,
      cancelledCount,
      cancelledPercent,
      avgTicketToday,
      topProducts,
      recurringClientsToday,
      hourlyVolume,
      delayedPercent,
      totalRevenueMonth,
      totalRevenueToday
    };
  }, [orders]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="space-y-6">
      {/* Principais Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Faturamento Hoje" 
          value={`R$ ${metrics.totalRevenueToday.toFixed(2)}`} 
          icon={DollarSign} 
          color="bg-emerald-500" 
        />
        <StatCard 
          label="Ticket Médio" 
          value={`R$ ${metrics.avgTicketToday.toFixed(2)}`} 
          icon={TrendingUp} 
          color="bg-blue-500" 
        />
        <StatCard 
          label="Pedidos Hoje" 
          value={metrics.todayOrders.length} 
          icon={ShoppingBag} 
          color="bg-orange-500" 
        />
        <StatCard 
          label="Faturamento Mês" 
          value={`R$ ${metrics.totalRevenueMonth.toFixed(2)}`} 
          icon={LayoutDashboard} 
          color="bg-purple-500" 
        />
      </div>

      {/* Detalhamento Operacional */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pedidos em Aberto vs Concluídos */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" /> Operação Hoje
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
              <p className="text-stone-500 text-xs font-bold uppercase">Em Aberto</p>
              <p className="text-2xl font-bold text-stone-800">{metrics.openOrdersCount}</p>
            </div>
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
              <p className="text-stone-500 text-xs font-bold uppercase">Concluídos</p>
              <p className="text-2xl font-bold text-stone-800">{metrics.completedOrdersCount}</p>
            </div>
          </div>
          <div className="w-full overflow-hidden" style={{ minHeight: 250 }}>
            {metrics.openOrdersCount + metrics.completedOrdersCount > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <RePieChart>
                  <Pie
                    data={[
                      { name: 'Em Aberto', value: metrics.openOrdersCount },
                      { name: 'Concluídos', value: metrics.completedOrdersCount }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    <Cell fill="#3b82f6" />
                    <Cell fill="#10b981" />
                  </Pie>
                  <Tooltip />
                </RePieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-stone-400 text-sm">
                Nenhum dado para exibir hoje.
              </div>
            )}
          </div>
        </div>

        {/* Cancelamentos e Atrasos */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" /> Alertas do Dia
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
              <div className="flex items-center gap-3">
                <XCircle className="w-6 h-6 text-red-500" />
                <div>
                  <p className="font-bold text-stone-800">Cancelados</p>
                  <p className="text-xs text-stone-500">{metrics.cancelledCount} pedidos hoje</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-red-600">{metrics.cancelledPercent.toFixed(1)}%</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-orange-50 rounded-2xl border border-orange-100">
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-orange-500" />
                <div>
                  <p className="font-bold text-stone-800">Atrasados</p>
                  <p className="text-xs text-stone-500">Pedidos fora do prazo</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-orange-600">{metrics.delayedPercent.toFixed(1)}%</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-2xl border border-blue-100">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-blue-500" />
                <div>
                  <p className="font-bold text-stone-800">Clientes Recorrentes</p>
                  <p className="text-xs text-stone-500">Pediram mais de uma vez hoje</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-blue-600">{metrics.recurringClientsToday}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos de Pico e Produtos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Horários de Pico */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" /> Horários de Pico
          </h3>
          <div className="w-full overflow-hidden" style={{ minHeight: 250 }}>
            {metrics.hourlyVolume.some(h => h.count > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={metrics.hourlyVolume.filter(h => h.count > 0)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                  <XAxis dataKey="hour" axisLine={false} tickLine={false} fontSize={12} />
                  <YAxis axisLine={false} tickLine={false} fontSize={12} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-stone-400 text-sm">
                Nenhuma atividade registrada hoje.
              </div>
            )}
          </div>
        </div>

        {/* Top Produtos */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
            <Utensils className="w-5 h-5 text-orange-500" /> Top Produtos Hoje
          </h3>
          <div className="space-y-3">
            {metrics.topProducts.length > 0 ? (
              metrics.topProducts.map((product, index) => (
                <div key={product.nome} className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-stone-400 text-xs border border-stone-200">
                      {index + 1}
                    </div>
                    <p className="font-bold text-stone-800 text-sm">{product.nome}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-stone-800">{product.qtd} vendas</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-stone-400">
                Nenhuma venda registrada hoje.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});



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

const KanbanCard = React.memo(({ order, onUpdate, onClick, isUpdating }: { order: any, onUpdate: (id: string, status: string) => void, onClick: () => void, isUpdating: boolean }) => {
  const [clientName, setClientName] = React.useState<string>(order.cliente_nome || 'Cliente');

  React.useEffect(() => {
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
    order.deliveryStatus === 'DELIVERED_PENDING_SETTLEMENT' ||
    order.financialSettlementStatus === 'PENDING_RESTAURANT_CONFIRMATION';

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
    <div 
      className={`p-4 rounded-2xl border shadow-sm space-y-2 cursor-pointer transition-colors ${getOrderCardStyle(order.status, false)}`}
      onClick={onClick}
    >
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
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="w-full text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
          >
            Conferir Recebimento
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-stone-500 capitalize">{order.status}</p>
          {nextStatus && (
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
                onUpdate(order.id, nextStatus); 
              }}
              disabled={isUpdating}
              className={`w-full mt-2 text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                isUpdating
                  ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
              }`}
            >
              {isUpdating ? 'Atualizando...' : 'Avançar'}
            </button>
          )}
        </>
      )}
    </div>
  );
});

const KanbanBoard = ({ orders, onUpdateStatus, onOrderClick, updatingOrderId }: { orders: any[], onUpdateStatus: (id: string, status: string) => void, onOrderClick: (order: any) => void, updatingOrderId: string | null }) => {
  const pedidosPorColuna = useMemo(() => {
    const colunas: Record<string, any[]> = {
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

  const coresColunas: Record<string, string> = {
    novo: "#facc15",          // amarelo
    confirmado: "#3b82f6",    // azul
    cozinha: "#f97316",       // laranja
    entrega: "#8b5cf6",       // roxo
    finalizado: "#22c55e"     // verde
  };

  return (
    <div className="flex w-full h-full gap-2">
      {Object.entries(pedidosPorColuna).map(([coluna, pedidos]) => (
        <div 
          key={coluna} 
          className="flex-1 min-w-0 h-full overflow-y-auto rounded-2xl p-4 flex flex-col gap-4"
          style={{
            backgroundColor: `${coresColunas[coluna]}10`,
            borderTop: `4px solid ${coresColunas[coluna]}`
          }}
        >
          <h3 className="font-bold capitalize" style={{ color: coresColunas[coluna] }}>{coluna}</h3>
          <div className="flex-1 space-y-4">
            {pedidos.map(pedido => (
              <KanbanCard 
                key={pedido.id} 
                order={pedido} 
                onUpdate={onUpdateStatus} 
                onClick={() => onOrderClick(pedido)} 
                isUpdating={updatingOrderId === pedido.id}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

function OrdersList({ 
  orders, 
  setOrders, 
  onUpdate, 
  restaurantProfile, 
  onRefresh, 
  isRefreshing,
  isLoadingMore,
  updatingOrderId,
  onLoadMore,
  hasMore
}: { 
  orders: any[], 
  setOrders: any, 
  onUpdate: any, 
  restaurantProfile: any,
  onRefresh: () => void,
  isRefreshing: boolean,
  isLoadingMore: boolean,
  updatingOrderId: string | null,
  onLoadMore: () => void,
  hasMore: boolean
}) {
  const { profile } = useAuth();
  const location = useLocation();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastOrderElementRef = useCallback((node: any) => {
    if (isRefreshing || isLoadingMore) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        onLoadMore();
      }
    });
    if (node) observer.current.observe(node);
  }, [isRefreshing, isLoadingMore, hasMore, onLoadMore]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orderId = params.get('orderId');
    if (orderId && orders.length > 0) {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setSelectedOrder(order);
      }
    }
  }, [orders, location.search]);

  // Sincroniza o selectedOrder caso ele seja atualizado na lista de orders
  useEffect(() => {
    if (selectedOrder && orders.length > 0) {
      const updatedOrder = orders.find(o => o.id === selectedOrder.id);
      if (updatedOrder && updatedOrder !== selectedOrder) {
        setSelectedOrder(updatedOrder);
      }
    }
  }, [orders, selectedOrder]);

  const [customerData, setCustomerData] = useState<any>(null);
  const [addressData, setAddressData] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<'abertos' | 'concluidos'>('abertos');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');

  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (!desktop) {
        setViewMode('list');
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const filteredOrders = React.useMemo(() => {
    let result = orders;
    if (viewMode !== 'kanban') {
      result = orders.filter(order => {
        if (activeTab === 'abertos') {
          return ['pendente', 'aceito', 'preparo', 'pronto', 'entrega'].includes(order.status);
        } else {
          return ['entregue', 'finalizado', 'cancelado', 'rejeitado'].includes(order.status);
        }
      });
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(order => {
        const orderIdMatch = order.id.toLowerCase().includes(lowerSearch);
        const clientNameMatch = (order.cliente_nome || '').toLowerCase().includes(lowerSearch);
        const statusMatch = order.status.toLowerCase().includes(lowerSearch);
        const dateMatch = new Date(order.data_criacao).toLocaleDateString().includes(lowerSearch);
        return orderIdMatch || clientNameMatch || statusMatch || dateMatch;
      });
    }

    return result;
  }, [orders, activeTab, viewMode, searchTerm]);

  const pedidosPorColuna = useMemo(() => {
    const colunas: Record<string, any[]> = {
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

  const [isEditingPayment, setIsEditingPayment] = useState(false);
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editTroco, setEditTroco] = useState('');

  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editAddress, setEditAddress] = useState<any>({});

  const handleOrderClick = React.useCallback((order: any) => {
    setSelectedOrder(order);
  }, []);

  const handlePrint = React.useCallback((order: any) => {
    printThermalOrder(order, restaurantProfile, profile);
  }, [restaurantProfile, profile]);

  const handleEditPayment = React.useCallback(() => {
    if (!selectedOrder) return;
    setEditPaymentMethod(selectedOrder?.forma_pagamento || '');
    setEditTroco(selectedOrder?.troco || '');
    setIsEditingPayment(true);
  }, [selectedOrder]);

  const handleSavePayment = React.useCallback(async () => {
    if (!profile?.restaurantId || !selectedOrder) return;
    try {
      const updateData = {
        forma_pagamento: editPaymentMethod,
        troco: editPaymentMethod === 'dinheiro' ? editTroco : null
      };
      await updateDoc(doc(db, 'restaurants', profile.restaurantId, 'orders', selectedOrder.id), updateData);
      
      // Atualiza estado local e cache
      setOrders((prevOrders: any[]) => {
        const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? { ...o, ...updateData } : o);
        cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
        return updatedOrders;
      });
      
      setIsEditingPayment(false);
      setSelectedOrder((prev: any) => ({
        ...prev,
        ...updateData
      }));
    } catch (error) {
      console.error("Error updating payment", error);
    }
  }, [profile?.restaurantId, selectedOrder, editPaymentMethod, editTroco, setOrders]);

  const handleEditAddress = React.useCallback(() => {
    if (!selectedOrder) return;
    setEditAddress(addressData || { rua: '', numero: '', bairro: '', cidade: '', estado: '', complemento: '', referencia: '' });
    setIsEditingAddress(true);
  }, [selectedOrder, addressData]);

  const handleSaveAddress = React.useCallback(async () => {
    if (!profile?.restaurantId || !selectedOrder) return;
    try {
      const updateData = { endereco_entrega: editAddress };
      await updateDoc(doc(db, 'restaurants', profile.restaurantId, 'orders', selectedOrder.id), updateData);
      
      // Atualiza estado local e cache
      setOrders((prevOrders: any[]) => {
        const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? { ...o, ...updateData } : o);
        cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
        return updatedOrders;
      });
      
      setIsEditingAddress(false);
      setAddressData(editAddress);
      setSelectedOrder((prev: any) => ({
        ...prev,
        ...updateData
      }));
    } catch (error) {
      console.error("Error updating address", error);
    }
  }, [profile?.restaurantId, selectedOrder, editAddress, setOrders]);

  useEffect(() => {
    if (!selectedOrder) return;
    const fetchDetails = async () => {
      setLoadingDetails(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', selectedOrder.cliente_id));
        if (userDoc.exists()) {
          setCustomerData(userDoc.data());
        } else {
          setCustomerData(null);
        }
        
        if (selectedOrder.endereco_entrega) {
          setAddressData(selectedOrder.endereco_entrega);
        } else if (selectedOrder.endereco_id) {
          const addrDoc = await getDoc(doc(db, 'users', selectedOrder.cliente_id, 'enderecos', selectedOrder.endereco_id));
          if (addrDoc.exists()) {
            setAddressData(addrDoc.data());
          } else {
            setAddressData(null);
          }
        } else {
          setAddressData(null);
        }
      } catch (error) {
        console.error("Error fetching details", error);
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchDetails();
  }, [selectedOrder]);

  const handleTogglePaid = React.useCallback(async () => {
    if (!profile?.restaurantId || !selectedOrder) return;
    
    // Prevent manual toggle for Mercado Pago PIX orders
    if (selectedOrder.forma_pagamento === 'pix' && selectedOrder.mercadopago_payment_id) {
      alert("O status de pagamento de pedidos via Mercado Pago é atualizado automaticamente.");
      return;
    }

    try {
      const novoStatusPago = !selectedOrder.pago;
      const updateData = { pago: novoStatusPago };
      await updateDoc(doc(db, 'restaurants', profile.restaurantId, 'orders', selectedOrder.id), updateData);
      
      // Atualiza estado local e cache
      setOrders((prevOrders: any[]) => {
        const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? { ...o, ...updateData } : o);
        cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
        return updatedOrders;
      });
      
      setSelectedOrder((prev: any) => ({
        ...prev,
        ...updateData
      }));
    } catch (error) {
      console.error("Error updating payment status", error);
    }
  }, [profile?.restaurantId, selectedOrder, setOrders]);

  const handleRefund = React.useCallback(async (orderId: string, amount?: number) => {
    if (!profile?.restaurantId) return;
    try {
      const response = await fetch('/api/payments/mercadopago/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: profile.restaurantId,
          orderId,
          amount
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao realizar estorno');
      }

      const data = await response.json();
      
      // Update local state and cache
      setOrders((prevOrders: any[]) => {
        const updatedOrders = prevOrders.map(o => o.id === orderId ? { 
          ...o, 
          estornado: true,
          valor_estornado: data.refunded_amount || amount || o.valor_total
        } : o);
        cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
        return updatedOrders;
      });
      
      setSelectedOrder((prev: any) => {
        if (prev?.id === orderId) {
          return {
            ...prev,
            estornado: true,
            valor_estornado: data.refunded_amount || amount || prev.valor_total
          };
        }
        return prev;
      });
      
      alert(data.message || 'Estorno realizado com sucesso!');
    } catch (error: any) {
      console.error("Erro ao realizar estorno:", error);
      alert(error.message || "Erro ao realizar estorno.");
      throw error;
    }
  }, [profile?.restaurantId, setOrders]);

  if (orders.length === 0) {
    return (
      <div className="space-y-6">
        <h3 className="text-xl font-bold text-stone-800">Gestor de Pedidos</h3>
        <div className="p-12 bg-white rounded-3xl border border-stone-200 text-center text-stone-400">
          Nenhum pedido recebido ainda.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
      {/* Left side: Order List */}
      <div className={`${selectedOrder && viewMode !== 'kanban' ? 'hidden lg:flex' : 'flex'} w-full ${viewMode === 'kanban' ? '' : 'lg:w-1/3'} flex-col bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm`}>
        <div className="p-4 border-b border-stone-100 bg-stone-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-stone-800">Pedidos ({filteredOrders.length})</h3>
            <div className="flex items-center gap-2">
              {isDesktop && (
                <div className="flex border border-stone-200 rounded-xl overflow-hidden bg-white">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold ${viewMode === 'list' ? 'bg-emerald-50 text-emerald-700' : 'text-stone-600'}`}
                  >
                    <List className="w-3 h-3" /> Lista
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('kanban');
                      window.dispatchEvent(new CustomEvent('collapse-menu'));
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold ${viewMode === 'kanban' ? 'bg-emerald-50 text-emerald-700' : 'text-stone-600'}`}
                  >
                    <LayoutGrid className="w-3 h-3" /> Kanban
                  </button>
                </div>
              )}
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className={`p-2 rounded-xl transition-all ${
                  isRefreshing 
                    ? 'bg-stone-100 text-stone-400 cursor-not-allowed' 
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200 shadow-sm'
                }`}
                title="Atualizar pedidos"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <div className="mb-4 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-stone-400" />
            </div>
            <input
              type="text"
              placeholder="Pesquisar pedido, cliente, data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>
          {viewMode !== 'kanban' && (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('abertos')}
                className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
                  activeTab === 'abertos' 
                    ? 'bg-stone-800 text-white' 
                    : 'bg-white text-stone-500 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                Abertos
              </button>
              <button
                onClick={() => setActiveTab('concluidos')}
                className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${
                  activeTab === 'concluidos' 
                    ? 'bg-stone-800 text-white' 
                    : 'bg-white text-stone-500 border border-stone-200 hover:bg-stone-100'
                }`}
              >
                Concluídos
              </button>
            </div>
          )}
        </div>
        <div className={`flex-1 overflow-y-auto ${viewMode === 'kanban' ? 'p-4' : 'p-2'} space-y-2 custom-scrollbar`}>
          {viewMode === 'kanban' ? (
            <KanbanBoard 
              orders={filteredOrders} 
              onUpdateStatus={onUpdate} 
              onOrderClick={handleOrderClick} 
              updatingOrderId={updatingOrderId}
            />
          ) : (
            filteredOrders.length === 0 ? (
              <div className="p-8 text-center text-stone-400">
                Nenhum pedido {activeTab === 'abertos' ? 'aberto' : 'concluído'} no momento.
              </div>
            ) : (
              <>
                {filteredOrders.map((order, index) => {
                  if (filteredOrders.length === index + 1) {
                    return (
                      <div ref={lastOrderElementRef} key={order.id}>
                        <OrderListItem 
                          order={order} 
                          isSelected={selectedOrder?.id === order.id} 
                          onClick={handleOrderClick} 
                        />
                      </div>
                    );
                  } else {
                    return (
                      <OrderListItem 
                        key={order.id} 
                        order={order} 
                        isSelected={selectedOrder?.id === order.id} 
                        onClick={handleOrderClick} 
                      />
                    );
                  }
                })}
                {isLoadingMore && (
                  <div className="flex justify-center p-4">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>

      {/* Right side: Order Details */}
      {viewMode !== 'kanban' && (
        <div className={`${!selectedOrder ? 'hidden lg:flex' : 'flex'} w-full lg:w-2/3 flex-col bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm`}>
          <OrderDetails
            selectedOrder={selectedOrder}
            setSelectedOrder={setSelectedOrder}
            customerData={customerData}
            addressData={addressData}
            loadingDetails={loadingDetails}
            handlePrint={handlePrint}
            isEditingAddress={isEditingAddress}
            handleSaveAddress={handleSaveAddress}
            handleEditAddress={handleEditAddress}
            editAddress={editAddress}
            setEditAddress={setEditAddress}
            isEditingPayment={isEditingPayment}
            handleSavePayment={handleSavePayment}
            handleEditPayment={handleEditPayment}
            editPaymentMethod={editPaymentMethod}
            setEditPaymentMethod={setEditPaymentMethod}
            editTroco={editTroco}
            setEditTroco={setEditTroco}
            onUpdate={onUpdate}
            handleTogglePaid={handleTogglePaid}
            onRefund={handleRefund}
            isUpdating={updatingOrderId === selectedOrder?.id}
          />
        </div>
      )}

      {/* Modal: Order Details (Kanban Mode) */}
      {viewMode === 'kanban' && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
            <button 
              onClick={() => setSelectedOrder(null)}
              className="absolute top-4 right-4 p-2 bg-stone-100 hover:bg-stone-200 rounded-full z-10 transition-colors"
            >
              <X className="w-5 h-5 text-stone-600" />
            </button>
            <OrderDetails
              selectedOrder={selectedOrder}
              setSelectedOrder={setSelectedOrder}
              customerData={customerData}
              addressData={addressData}
              loadingDetails={loadingDetails}
              handlePrint={handlePrint}
              isEditingAddress={isEditingAddress}
              handleSaveAddress={handleSaveAddress}
              handleEditAddress={handleEditAddress}
              editAddress={editAddress}
              setEditAddress={setEditAddress}
              isEditingPayment={isEditingPayment}
              handleSavePayment={handleSavePayment}
              handleEditPayment={handleEditPayment}
              editPaymentMethod={editPaymentMethod}
              setEditPaymentMethod={setEditPaymentMethod}
              editTroco={editTroco}
              setEditTroco={setEditTroco}
              onUpdate={onUpdate}
              handleTogglePaid={handleTogglePaid}
              onRefund={handleRefund}
              isUpdating={updatingOrderId === selectedOrder.id}
            />
          </div>
        </div>
      )}
    </div>
  );
}
