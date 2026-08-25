import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { PermissionGuard } from '../../components/PermissionGuard';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { 
  collection, query, where, doc, updateDoc, orderBy, getDoc, getDocs, limit, startAfter, onSnapshot 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { authApi } from '../../services/authApi';
import { normalizeRestaurantFeatures } from '../../domain/restaurant/restaurantFeatures';
import { isRestaurantTeamMember } from '../../utils/authResolution';
import {
  PageHeader,
  SectionHeader,
  Card,
  StatCard as UiStatCard,
  Badge,
  Button,
  EmptyState,
  LoadingState,
} from '../../components/ui';
import { 
  LayoutDashboard, ShoppingBag, Utensils, Clock, Settings, 
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
import { processOrderPaymentsApi, processOrderRefundApi, normalizePaymentMethodId, registerClientOrderPaymentMovement, registerClientOrderRefundMovement } from '../../utils/financeIntegration';
import { isPixPaymentMethod } from '../../services/paymentMethodsService';
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
import TeamSettings from './settings/TeamSettings';
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
import CounterPage from './Counter';
import WaitersPage from './Waiters';
import RestaurantHalls from './Halls';
import RestaurantTables from './Tables';
import OperationalTablesMap from './TablesMap';
import { UnpaidOrderAlertDialog } from '../../components/orders/UnpaidOrderAlertDialog';

import { registerPushNotifications } from '../../firebaseMessaging';
import RestaurantLayout from '../../layouts/RestaurantLayout';
import { printThermalOrder } from '../../components/orders/OrderThermalPrint';

import OrderListItem, { getOrderCardStyle } from './components/OrderListItem';
import OrderDetails from './components/OrderDetails';
import RestaurantOrdersPage from './orders/RestaurantOrdersPage';
import { RestaurantOrderCard } from './orders/components/RestaurantOrderCard';
import { getOrderKanbanColumn } from '../../domain/order/orderLifecycle';
import {
  OperacaoHubWrapper,
  CardapioHubWrapper,
  GestaoHubWrapper,
  FinanceiroHubWrapper,
  ConfiguracoesHubWrapper
} from './hubs/RestaurantHubs';

import FinanceiroPage from './financeiro/FinanceiroPage';
import CaixaPage from './financeiro/CaixaPage';
import { ContasReceberPage } from './financeiro/ContasReceberPage';
import { ContasPagarPage } from './financeiro/ContasPagarPage';
import { LancamentosPage } from './financeiro/LancamentosPage';
import { EmptyModule } from './financeiro/EmptyModule';

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
          const isMpPix = isPixPaymentMethod(order.forma_pagamento) && order.mercadopago_payment_id;
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
          const isMpPix = isPixPaymentMethod(order.forma_pagamento) && order.mercadopago_payment_id;
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
    
    if (process.env.NODE_ENV !== 'production') {
      const maskedId = restaurantId ? `${restaurantId.slice(0, 4)}***` : 'none';
      console.log(`[Dashboard] Restaurant ${maskedId} config: ${statusConfig}, isOpen: ${isRestaurantOpen}`);
    }

    console.log('[Firestore] Iniciando listener em tempo real para pedidos da operação/cozinha...');
    
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
          const isMpPix = isPixPaymentMethod(order.forma_pagamento) && order.mercadopago_payment_id;
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
  }, [restaurantId, user?.uid]);

  useEffect(() => {
    const handleNewOrder = () => {
      console.log('DEBUG: handleNewOrder capturado no Dashboard (via evento)');
      fetchOrders(true, true);
    };

    window.addEventListener('new-order-received', handleNewOrder);

    return () => {
      window.removeEventListener('new-order-received', handleNewOrder);
    };
  }, [fetchOrders]);

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

  const [unpaidOrderDialog, setUnpaidOrderDialog] = useState<{ open: boolean; orderNumber?: string }>({ open: false });

  const handleUpdateStatus = React.useCallback(async (orderId: string, newStatus: string, motivo?: string, customClientActionId?: string) => {
    if (!profile?.restaurantId || updatingOrdersRef.current.has(orderId)) return;
    
    // Busca o pedido atual para verificar o status de pagamento
    const currentOrder = orders.find(o => o.id === orderId);
    
    // Se o status já for o mesmo, não faz nada
    if (currentOrder?.status === newStatus) return;
    
    // Regra de negócio: Pedido só pode ser finalizado/entregue se estiver quitado financeiramente
    const isSettled = currentOrder && (
      currentOrder.pago === true ||
      currentOrder.financialSettlementStatus === 'SETTLED'
    );

    if ((newStatus === 'entregue' || newStatus === 'finalizado') && currentOrder && !isSettled) {
      setUnpaidOrderDialog({
        open: true,
        orderNumber: currentOrder.numero_pedido || currentOrder.id
      });
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

      const oldOrder = orders.find(o => o.id === orderId);
      
      const isKitchenAction = ['aceito', 'preparo', 'pronto'].includes(newStatus);
      const idToken = await user?.getIdToken();
      let updatedOrderFromBackend: any = null;

      if (isKitchenAction) {
        let actionPath = 'accept';
        if (newStatus === 'preparo') actionPath = 'start-prepare';
        if (newStatus === 'pronto') actionPath = 'conclude';

        const clientActionId = customClientActionId || `act_ktc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const res = await fetch(`/api/restaurant/orders/${orderId}/kitchen/${actionPath}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ clientActionId })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 409 && (errData.code === 'DUPLICATE_ACTION' || errData.error === 'DUPLICATE_ACTION')) {
            console.log('[Kitchen Idempotency] Ação já processada anteriormente');
          } else {
            throw new Error(errData.message || errData.error || 'Erro ao processar ação na cozinha');
          }
        } else {
          const resData = await res.json().catch(() => ({}));
          updatedOrderFromBackend = resData.order;
        }
      } else {
        const clientActionId = customClientActionId || `act_ord_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const res = await fetch(`/api/restaurant/orders/${orderId}/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            status: newStatus,
            motivo,
            clientActionId
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (res.status === 409 && (errData.code === 'DUPLICATE_ACTION' || errData.error === 'DUPLICATE_ACTION')) {
            console.log('[Order Status Idempotency] Ação já processada anteriormente');
          } else {
            throw new Error(errData.message || errData.error || 'Erro ao atualizar status do pedido');
          }
        } else {
          const resData = await res.json().catch(() => ({}));
          updatedOrderFromBackend = resData.order;
        }
      }

      if (oldOrder) {
        if (newStatus === 'finalizado') {
          await registerClientOrderPaymentMovement(
            profile.restaurantId,
            orderId,
            oldOrder,
            profile.nome || 'Operador'
          );
        } else if ((newStatus === 'cancelado' || newStatus === 'rejeitado') && oldOrder.pago) {
          await registerClientOrderRefundMovement(
            profile.restaurantId,
            orderId,
            oldOrder,
            profile.nome || 'Operador'
          );
        }
      }
      
      // Atualiza o estado local e o cache imediatamente com os dados do backend
      setOrders(prevOrders => {
        const updatedOrders = prevOrders.map(o => {
          if (o.id === orderId) {
            return updatedOrderFromBackend ? { ...o, ...updatedOrderFromBackend } : { ...o, ...updateData };
          }
          return o;
        });
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
            try {
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
            } catch {
              // Notification fallback handled silently
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
      <UnpaidOrderAlertDialog
        open={unpaidOrderDialog.open}
        orderNumber={unpaidOrderDialog.orderNumber}
        onClose={() => setUnpaidOrderDialog({ open: false })}
      />
      {isLive && (
        <div className="fixed top-4 right-4 z-[9999]">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        </div>
      )}
      {user && !user.emailVerified && !isRestaurantTeamMember(profile) && (
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

      <Routes>
        <Route path="/" element={<PermissionGuard module="dashboard" allowedRoles={["MANAGER"]}><DashboardStats orders={orders} /></PermissionGuard>} />
        <Route path="dashboard" element={<PermissionGuard module="dashboard" allowedRoles={["MANAGER"]}><DashboardStats orders={orders} /></PermissionGuard>} />
        <Route path="balcao" element={
          <PermissionGuard module="balcao">
            {normalizeRestaurantFeatures(restaurantProfile).counterEnabled ? (
              <CounterPage restaurantProfile={restaurantProfile} />
            ) : (
              <Navigate to="/restaurant/dashboard" replace />
            )}
          </PermissionGuard>
        } />
        <Route path="waiters/*" element={
          <PermissionGuard module="waiters">
            {normalizeRestaurantFeatures(restaurantProfile).waiterEnabled ? (
              <WaitersPage />
            ) : (
              <Navigate to="/restaurant/dashboard" replace />
            )}
          </PermissionGuard>
        } />
        <Route path="desempenho" element={<PermissionGuard module="desempenho"><PerformanceDashboard orders={orders} /></PermissionGuard>} />
        <Route path="clientes" element={<PermissionGuard module="clientes"><Navigate to="/restaurant/gestao/clientes?subtab=clientes" replace /></PermissionGuard>} />
        <Route path="customers" element={<PermissionGuard module="clientes"><Navigate to="/restaurant/gestao/clientes?subtab=clientes" replace /></PermissionGuard>} />
        <Route path="relatorios" element={<PermissionGuard module="relatorios"><Navigate to="/restaurant/gestao/relatorios?subtab=relatorios" replace /></PermissionGuard>} />
        <Route path="reports" element={<PermissionGuard module="relatorios"><Navigate to="/restaurant/gestao/relatorios?subtab=relatorios" replace /></PermissionGuard>} />
        <Route path="waiters" element={<PermissionGuard module="equipe"><Navigate to="/restaurant/gestao/equipe?subtab=equipe" replace /></PermissionGuard>} />
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
        
        {/* Hubs da Arquitetura Base (Fase 8) */}
        <Route path="operacao/*" element={
          <OperacaoHubWrapper 
            restaurantProfile={restaurantProfile} 
            orders={orders}
            setOrders={setOrders}
            handleUpdateStatus={handleUpdateStatus}
            fetchOrders={fetchOrders}
            isRefreshing={isRefreshing}
            isLoadingMore={isLoadingMore}
            updatingOrderId={updatingOrderId}
            fetchMoreOrders={fetchMoreOrders}
            hasMore={hasMore}
          />
        } />
        <Route path="cardapio/*" element={<CardapioHubWrapper restaurantProfile={restaurantProfile} />} />
        <Route path="gestao/*" element={<GestaoHubWrapper restaurantProfile={restaurantProfile} orders={orders} />} />
        
        {/* Financeiro Subroutes and Aliases */}
        <Route path="financeiro/caixa" element={<PermissionGuard module="caixa"><Navigate to="/restaurant/financeiro?subtab=caixa" replace /></PermissionGuard>} />
        <Route path="financeiro/contas-receber" element={<PermissionGuard module="financeiro"><Navigate to="/restaurant/financeiro?subtab=receber" replace /></PermissionGuard>} />
        <Route path="financeiro/contas-pagar" element={<PermissionGuard module="financeiro"><Navigate to="/restaurant/financeiro?subtab=pagar" replace /></PermissionGuard>} />
        <Route path="financeiro/faturas" element={<PermissionGuard module="financeiro"><Navigate to="/restaurant/financeiro?subtab=faturas" replace /></PermissionGuard>} />
        <Route path="financeiro/visao" element={<PermissionGuard module="financeiro"><Navigate to="/restaurant/financeiro?subtab=visao" replace /></PermissionGuard>} />
        <Route path="finances" element={<PermissionGuard module="financeiro"><Navigate to="/restaurant/financeiro?subtab=visao" replace /></PermissionGuard>} />
        <Route path="finances/cash" element={<PermissionGuard module="caixa"><Navigate to="/restaurant/financeiro?subtab=caixa" replace /></PermissionGuard>} />
        <Route path="finances/receivables" element={<PermissionGuard module="financeiro"><Navigate to="/restaurant/financeiro?subtab=receber" replace /></PermissionGuard>} />
        <Route path="finances/payables" element={<PermissionGuard module="financeiro"><Navigate to="/restaurant/financeiro?subtab=pagar" replace /></PermissionGuard>} />
        <Route path="finances/invoice" element={<PermissionGuard module="financeiro"><Navigate to="/restaurant/financeiro?subtab=faturas" replace /></PermissionGuard>} />

        <Route path="financeiro/*" element={<FinanceiroHubWrapper restaurantProfile={restaurantProfile} />} />
        <Route path="configuracoes/*" element={<ConfiguracoesHubWrapper restaurantProfile={restaurantProfile} />} />

        {/* Legacy Routes as Aliases (Fase 8) */}
        <Route path="saloes" element={<PermissionGuard module="saloes"><Navigate to="/restaurant/operacao/mesas?subtab=saloes" replace /></PermissionGuard>} />
        <Route path="halls" element={<PermissionGuard module="saloes"><Navigate to="/restaurant/operacao/mesas?subtab=saloes" replace /></PermissionGuard>} />
        
        <Route path="mesas" element={<PermissionGuard module="mesas"><Navigate to="/restaurant/operacao/mesas?subtab=mesas" replace /></PermissionGuard>} />
        <Route path="tables" element={<PermissionGuard module="mesas"><Navigate to="/restaurant/operacao/mesas?subtab=mesas" replace /></PermissionGuard>} />
        <Route path="mapa-mesas" element={<PermissionGuard module="mesas"><Navigate to="/restaurant/operacao/mesas?subtab=mapa" replace /></PermissionGuard>} />
        <Route path="tables/map" element={<PermissionGuard module="mesas"><Navigate to="/restaurant/operacao/mesas?subtab=mapa" replace /></PermissionGuard>} />
        <Route path="mesas/mapa" element={<PermissionGuard module="mesas"><Navigate to="/restaurant/operacao/mesas?subtab=mapa" replace /></PermissionGuard>} />
        
        <Route path="menu/categories" element={<PermissionGuard module="menu"><Navigate to="/restaurant/cardapio/categorias?subtab=categorias" replace /></PermissionGuard>} />
        <Route path="menu/items" element={<PermissionGuard module="menu"><Navigate to="/restaurant/cardapio/produtos?subtab=produtos" replace /></PermissionGuard>} />
        <Route path="menu/sizes" element={<PermissionGuard module="menu"><Navigate to="/restaurant/cardapio/tamanhos?subtab=tamanhos" replace /></PermissionGuard>} />
        <Route path="fatura" element={<PermissionGuard module="financeiro"><Navigate to="/restaurant/financeiro?subtab=faturas" replace /></PermissionGuard>} />
        <Route path="menu/extras" element={<PermissionGuard module="menu"><Navigate to="/restaurant/cardapio/adicionais?subtab=adicionais" replace /></PermissionGuard>} />
        <Route path="menu/grupos" element={<PermissionGuard module="menu"><Navigate to="/restaurant/cardapio/grupos?subtab=grupos" replace /></PermissionGuard>} />
        <Route path="delivery-areas" element={<PermissionGuard module="settings"><Navigate to="/restaurant/configuracoes/entrega?subtab=entrega" replace /></PermissionGuard>} />
        <Route path="schedules" element={<PermissionGuard module="settings"><Navigate to="/restaurant/configuracoes/horarios?subtab=horarios" replace /></PermissionGuard>} />
        <Route path="menu/promotions" element={<PermissionGuard module="menu"><Navigate to="/restaurant/cardapio/promocoes?subtab=promocoes" replace /></PermissionGuard>} />
        <Route path="estoque" element={<PermissionGuard module="stock"><Navigate to="/restaurant/cardapio/estoque?subtab=estoque" replace /></PermissionGuard>} />
        <Route path="inventory" element={<PermissionGuard module="stock"><Navigate to="/restaurant/cardapio/estoque?subtab=estoque" replace /></PermissionGuard>} />

        {/* Entregadores / Drivers Routes as Aliases */}
        <Route path="drivers" element={<PermissionGuard module="delivery"><Navigate to="/restaurant/operacao/entregas?subtab=entregadores" replace /></PermissionGuard>} />
        <Route path="drivers/new" element={<PermissionGuard module="delivery"><Navigate to="/restaurant/gestao/equipe" replace /></PermissionGuard>} />
        <Route path="drivers/deliveries" element={<PermissionGuard module="delivery"><Navigate to="/restaurant/operacao/entregas?subtab=ativas" replace /></PermissionGuard>} />
        <Route path="drivers/settings" element={<PermissionGuard module="delivery"><Navigate to="/restaurant/operacao/entregas?subtab=configuracoes" replace /></PermissionGuard>} />
        
        {/* Financeiro is now managed by FinanceiroHubWrapper under financeiro/* */}
        
        {/* Configurações Subroutes as Aliases */}
        <Route path="settings/payments" element={<PermissionGuard module="settings"><Navigate to="/restaurant/configuracoes/pagamentos?subtab=pagamentos" replace /></PermissionGuard>} />
        <Route path="settings/account" element={<PermissionGuard module="settings"><Navigate to="/restaurant/configuracoes/dados?subtab=dados" replace /></PermissionGuard>} />
        <Route path="settings/team" element={<PermissionGuard module="equipe"><Navigate to="/restaurant/gestao/equipe?subtab=equipe" replace /></PermissionGuard>} />
        <Route path="settings/password" element={<PermissionGuard module="settings"><Navigate to="/restaurant/configuracoes/seguranca?subtab=seguranca" replace /></PermissionGuard>} />
        <Route path="settings/print" element={<PermissionGuard module="settings"><Navigate to="/restaurant/configuracoes/impressao?subtab=impressao" replace /></PermissionGuard>} />
        <Route path="settings/integration" element={<PermissionGuard module="settings"><Navigate to="/restaurant/configuracoes/integracoes?subtab=integracoes" replace /></PermissionGuard>} />
        <Route path="settings/whatsapp" element={<PermissionGuard module="settings"><Navigate to="/restaurant/configuracoes/whatsapp?subtab=whatsapp" replace /></PermissionGuard>} />
        
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

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const todayOrders = orders.filter(o => new Date(o.data_criacao) >= today);
    const monthOrders = orders.filter(o => new Date(o.data_criacao) >= startOfMonth);

    const pendingOrders = todayOrders.filter(o => o.status === 'pendente');
    const openOrdersCount = todayOrders.filter(o => ['pendente', 'aceito', 'preparo', 'pronto', 'entrega'].includes(o.status)).length;
    const completedOrdersCount = todayOrders.filter(o => ['entregue', 'finalizado'].includes(o.status)).length;

    const cancelledOrders = todayOrders.filter(o => ['cancelado', 'rejeitado'].includes(o.status));
    const cancelledCount = cancelledOrders.length;
    const cancelledPercent = todayOrders.length > 0 ? (cancelledCount / todayOrders.length) * 100 : 0;

    const totalRevenueToday = todayOrders.reduce((acc, o) => acc + (o.valor_total || 0), 0);
    const avgTicketToday = todayOrders.length > 0 ? totalRevenueToday / todayOrders.length : 0;

    const productSales: Record<string, { nome: string, qtd: number }> = {};
    todayOrders.forEach(o => {
      (o.items || o.itens)?.forEach((i: any) => {
        if (!productSales[i.nome]) productSales[i.nome] = { nome: i.nome, qtd: 0 };
        productSales[i.nome].qtd += i.quantidade;
      });
    });
    const topProducts = Object.values(productSales).sort((a, b) => b.qtd - a.qtd).slice(0, 5);

    const clientOrders: Record<string, number> = {};
    todayOrders.forEach(o => {
      if (o.cliente_id) {
        clientOrders[o.cliente_id] = (clientOrders[o.cliente_id] || 0) + 1;
      }
    });
    const recurringClientsToday = Object.values(clientOrders).filter(count => count > 1).length;

    const hourlyVolume = Array.from({ length: 24 }, (_, i) => ({ hour: `${i}h`, count: 0 }));
    todayOrders.forEach(o => {
      const hour = new Date(o.data_criacao).getHours();
      hourlyVolume[hour].count += 1;
    });

    const delayedOrders = todayOrders.filter(o => {
      const created = new Date(o.data_criacao);
      const diffMins = (now.getTime() - created.getTime()) / (1000 * 60);
      if (o.status === 'pendente' && diffMins > 15) return true;
      if (o.status === 'aceito' && diffMins > 45) return true;
      return false;
    });
    const delayedPercent = todayOrders.length > 0 ? (delayedOrders.length / todayOrders.length) * 100 : 0;

    const totalRevenueMonth = monthOrders.reduce((acc, o) => acc + (o.valor_total || 0), 0);

    return {
      todayOrders,
      pendingCount: pendingOrders.length,
      delayedCount: delayedOrders.length,
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
    return <LoadingState message="Carregando dados do restaurante..." />;
  }

  const shortcuts = [
    { title: 'Pedidos', subtitle: 'Gerenciar fila e status', path: '/restaurant/operacao/pedidos', icon: ShoppingBag },
    { title: 'Balcão', subtitle: 'Atendimento e caixa rápido', path: '/restaurant/balcao', icon: Utensils },
    { title: 'Mesas & Comandas', subtitle: 'Gestão de salão e mapa', path: '/restaurant/operacao/mesas', icon: LayoutGrid },
    { title: 'Caixa', subtitle: 'Abertura, sangria e fecho', path: '/restaurant/financeiro?subtab=caixa', icon: DollarSign },
    { title: 'Entregas', subtitle: 'Despacho e entregadores', path: '/restaurant/operacao/entregas', icon: MapPin },
  ];

  return (
    <div className="space-y-6">
      {/* 1. CABEÇALHO CANÔNICO */}
      <PageHeader
        title="Visão Geral"
        description="Resumo da operação e desempenho do restaurante."
        icon={LayoutDashboard}
      />

      {/* 2. PRIMEIRO: ALERTAS OPERACIONAIS E SITUAÇÕES QUE EXIGEM AÇÃO */}
      {(metrics.pendingCount > 0 || metrics.delayedCount > 0) && (
        <Card className="bg-amber-50/70 border-amber-200 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-amber-950 text-sm sm:text-base">Atenção Necessária na Operação</h3>
                  {metrics.pendingCount > 0 && (
                    <Badge variant="warning">{metrics.pendingCount} aguardando aceite</Badge>
                  )}
                  {metrics.delayedCount > 0 && (
                    <Badge variant="danger">{metrics.delayedCount} atrasado(s)</Badge>
                  )}
                </div>
                <p className="text-xs text-amber-800 font-medium mt-1">
                  {metrics.pendingCount > 0 && `${metrics.pendingCount} pedido(s) pendente(s) de confirmação. `}
                  {metrics.delayedCount > 0 && `${metrics.delayedCount} pedido(s) ultrapassaram o tempo limite recomendado.`}
                </p>
              </div>
            </div>
            <Link to="/restaurant/operacao/pedidos" className="w-full sm:w-auto shrink-0">
              <Button variant="primary" size="sm" icon={<ShoppingBag className="w-4 h-4" />} className="w-full sm:w-auto min-h-[44px]">
                Atender Pedidos
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* 3. SEGUNDO: KPIS PRINCIPAIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <UiStatCard 
          title="Faturamento Hoje" 
          value={`R$ ${metrics.totalRevenueToday.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
          icon={DollarSign} 
          iconBgColor="bg-emerald-50"
          iconTextColor="text-emerald-600"
        />
        <UiStatCard 
          title="Ticket Médio" 
          value={`R$ ${metrics.avgTicketToday.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
          icon={TrendingUp} 
          iconBgColor="bg-blue-50"
          iconTextColor="text-blue-600"
        />
        <UiStatCard 
          title="Pedidos Hoje" 
          value={metrics.todayOrders.length} 
          icon={ShoppingBag} 
          iconBgColor="bg-amber-50"
          iconTextColor="text-amber-600"
        />
        <UiStatCard 
          title="Faturamento Mês" 
          value={`R$ ${metrics.totalRevenueMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
          icon={BarChart3} 
          iconBgColor="bg-purple-50"
          iconTextColor="text-purple-600"
        />
      </div>

      {/* 4. TERCEIRO: VISÃO OPERACIONAL RESUMIDA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pedidos em Aberto vs Concluídos */}
        <Card className="space-y-4">
          <SectionHeader 
            title="Operação Hoje" 
            description="Status e andamento dos pedidos no dia"
          />
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/60">
              <span className="text-stone-500 text-xs font-bold uppercase tracking-wider">Em Andamento</span>
              <p className="text-2xl font-black text-stone-800 mt-1">{metrics.openOrdersCount}</p>
            </div>
            <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
              <span className="text-emerald-700 text-xs font-bold uppercase tracking-wider">Concluídos</span>
              <p className="text-2xl font-black text-emerald-800 mt-1">{metrics.completedOrdersCount}</p>
            </div>
          </div>
          <div className="w-full overflow-hidden flex items-center justify-center min-h-[200px]">
            {metrics.openOrdersCount + metrics.completedOrdersCount > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <RePieChart>
                  <Pie
                    data={[
                      { name: 'Em Andamento', value: metrics.openOrdersCount },
                      { name: 'Concluídos', value: metrics.completedOrdersCount }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    <Cell fill="#059669" />
                    <Cell fill="#10b981" />
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                  />
                </RePieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="Sem pedidos registrados hoje"
                description="Os pedidos do dia aparecerão aqui conforme forem criados."
                icon={ShoppingBag}
              />
            )}
          </div>
        </Card>

        {/* Alertas e Métricas do Dia */}
        <Card className="space-y-4">
          <SectionHeader 
            title="Indicadores Operacionais" 
            description="Métricas de qualidade e reincidência"
          />
          <div className="space-y-3.5">
            <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-stone-800 text-sm">Cancelamentos</p>
                  <p className="text-xs text-stone-500">{metrics.cancelledCount} pedido(s) hoje</p>
                </div>
              </div>
              <Badge variant={metrics.cancelledCount > 0 ? 'danger' : 'neutral'}>
                {metrics.cancelledPercent.toFixed(1)}%
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-stone-800 text-sm">Pedidos Atrasados</p>
                  <p className="text-xs text-stone-500">Fora do tempo estimado</p>
                </div>
              </div>
              <Badge variant={metrics.delayedCount > 0 ? 'warning' : 'neutral'}>
                {metrics.delayedPercent.toFixed(1)}%
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-200/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-stone-800 text-sm">Clientes Recorrentes</p>
                  <p className="text-xs text-stone-500">Compraram mais de uma vez hoje</p>
                </div>
              </div>
              <Badge variant="success">
                {metrics.recurringClientsToday} cliente(s)
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      {/* 5. QUARTO: GRÁFICOS E INDICADORES SECUNDÁRIOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Horários de Pico */}
        <Card className="space-y-4">
          <SectionHeader 
            title="Horários de Pico" 
            description="Distribuição de volume de pedidos por hora"
          />
          <div className="w-full overflow-hidden min-h-[220px] flex items-center justify-center">
            {metrics.hourlyVolume.some(h => h.count > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={metrics.hourlyVolume.filter(h => h.count > 0)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                  <XAxis dataKey="hour" axisLine={false} tickLine={false} fontSize={11} stroke="#a8a29e" />
                  <YAxis axisLine={false} tickLine={false} fontSize={11} stroke="#a8a29e" />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e7e5e4', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                    cursor={{ fill: '#f5f5f4' }}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="Sem dados de horário"
                description="O fluxo por horário será exibido conforme novos pedidos forem feitos."
                icon={BarChart3}
              />
            )}
          </div>
        </Card>

        {/* Top Produtos */}
        <Card className="space-y-4">
          <SectionHeader 
            title="Top Produtos Hoje" 
            description="Itens mais vendidos no dia"
          />
          <div className="space-y-2.5">
            {metrics.topProducts.length > 0 ? (
              metrics.topProducts.map((product, index) => (
                <div key={product.nome} className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-200/60">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-white border border-stone-200 text-stone-600 font-bold text-xs flex items-center justify-center shrink-0">
                      {index + 1}
                    </div>
                    <p className="font-bold text-stone-800 text-sm truncate">{product.nome}</p>
                  </div>
                  <Badge variant="neutral" className="shrink-0">
                    {product.qtd} unidade(s)
                  </Badge>
                </div>
              ))
            ) : (
              <EmptyState
                title="Sem produtos vendidos hoje"
                description="Os produtos mais vendidos aparecerão aqui."
                icon={Utensils}
              />
            )}
          </div>
        </Card>
      </div>

      {/* 6. QUINTO: ATALHOS ÚTEIS */}
      <Card>
        <SectionHeader 
          title="Atalhos da Operação" 
          description="Acesso rápido aos principais módulos de trabalho"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {shortcuts.map((shortcut) => {
            const Icon = shortcut.icon;
            return (
              <Link
                key={shortcut.title}
                to={shortcut.path}
                className="p-3.5 bg-stone-50 hover:bg-emerald-50/60 border border-stone-200/80 hover:border-emerald-200 rounded-2xl flex items-center gap-3 transition-all group min-h-[44px]"
              >
                <div className="w-9 h-9 rounded-xl bg-white border border-stone-200 group-hover:border-emerald-300 text-stone-600 group-hover:text-emerald-600 flex items-center justify-center shrink-0 transition-colors shadow-2xs">
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-stone-800 group-hover:text-emerald-900 truncate">{shortcut.title}</p>
                  <p className="text-[10px] text-stone-500 font-medium truncate">{shortcut.subtitle}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </Card>
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

const KanbanBoard = ({ 
  orders, 
  onUpdateStatus, 
  onOrderClick, 
  updatingOrderId,
  selectedOrder,
  onPrintOrder
}: { 
  orders: any[], 
  onUpdateStatus: (id: string, status: string) => void, 
  onOrderClick: (order: any) => void, 
  updatingOrderId: string | null,
  selectedOrder?: any,
  onPrintOrder?: (order: any) => void
}) => {
  const pedidosPorColuna = useMemo(() => {
    const colunas: Record<string, any[]> = {
      novo: [],
      confirmado: [],
      cozinha: [],
      entrega: [],
      finalizado: []
    };
    orders.forEach(pedido => {
      const coluna = getOrderKanbanColumn(pedido) || "novo";
      if (colunas[coluna]) {
        colunas[coluna].push(pedido);
      } else {
        colunas.novo.push(pedido);
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
              <RestaurantOrderCard 
                key={pedido.id} 
                order={pedido} 
                isSelected={selectedOrder?.id === pedido.id}
                isUpdating={updatingOrderId === pedido.id}
                onOrderClick={onOrderClick} 
                onUpdateStatus={onUpdateStatus} 
                onPrintOrder={onPrintOrder}
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
      const pmId = normalizePaymentMethodId(editPaymentMethod) || editPaymentMethod || 'dinheiro';
      const totalCents = Math.round(Number(selectedOrder.valor_total || selectedOrder.total || 0) * 100);
      const clientActionId = `act_pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const res = await processOrderPaymentsApi({
        restaurantId: profile.restaurantId,
        orderId: selectedOrder.id,
        payments: [{
          paymentMethodId: pmId,
          amount: totalCents,
          status: 'PAID'
        }],
        operatorName: profile.nome || 'Operador',
        clientActionId
      });

      if (!res.ok) {
        alert(res.error || 'Erro ao salvar alteração de pagamento.');
        return;
      }

      const updatedOrder = res.order || {
        ...selectedOrder,
        forma_pagamento: pmId,
        troco: pmId === 'dinheiro' ? editTroco : null
      };

      setOrders((prevOrders: any[]) => {
        const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? updatedOrder : o);
        cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
        return updatedOrders;
      });

      setIsEditingPayment(false);
      setSelectedOrder(updatedOrder);
    } catch (error: any) {
      console.error("Error updating payment", error);
      alert(error?.message || "Erro ao atualizar pagamento.");
    }
  }, [profile?.restaurantId, profile?.nome, selectedOrder, editPaymentMethod, editTroco, setOrders]);

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
        const customer = selectedOrder.cliente || (selectedOrder.cliente_nome ? {
          nome: selectedOrder.cliente_nome,
          telefone: selectedOrder.cliente_telefone || selectedOrder.telefone || '',
          email: selectedOrder.cliente_email || selectedOrder.email || ''
        } : null);

        const address = selectedOrder.endereco_entrega || selectedOrder.endereco || null;

        setCustomerData(customer || { nome: selectedOrder.cliente_nome || 'Cliente' });
        setAddressData(address);

        if (!customer && selectedOrder.cliente_id) {
          try {
            const userDoc = await getDoc(doc(db, 'users', selectedOrder.cliente_id));
            if (userDoc.exists()) {
              setCustomerData(userDoc.data());
            }
          } catch {
            // Handled gracefully
          }
        }
        
        if (!address && selectedOrder.endereco_id && selectedOrder.cliente_id) {
          try {
            const addrDoc = await getDoc(doc(db, 'users', selectedOrder.cliente_id, 'enderecos', selectedOrder.endereco_id));
            if (addrDoc.exists()) {
              setAddressData(addrDoc.data());
            }
          } catch {
            // Handled gracefully
          }
        }
      } catch {
        setCustomerData(selectedOrder.cliente || { nome: selectedOrder.cliente_nome || 'Cliente' });
        setAddressData(selectedOrder.endereco_entrega || selectedOrder.endereco || null);
      } finally {
        setLoadingDetails(false);
      }
    };
    fetchDetails();
  }, [selectedOrder]);

  const handleTogglePaid = React.useCallback(async () => {
    if (!profile?.restaurantId || !selectedOrder) return;
    
    // Prevent manual toggle for Mercado Pago PIX orders
    if (isPixPaymentMethod(selectedOrder.forma_pagamento) && selectedOrder.mercadopago_payment_id) {
      alert("O status de pagamento de pedidos via Mercado Pago é atualizado automaticamente.");
      return;
    }

    try {
      if (!selectedOrder.pago) {
        const totalCents = Math.round(Number(selectedOrder.valor_total || selectedOrder.total || 0) * 100);
        const pmId = normalizePaymentMethodId(selectedOrder.forma_pagamento) || 'dinheiro';
        const clientActionId = `act_pay_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const res = await processOrderPaymentsApi({
          restaurantId: profile.restaurantId,
          orderId: selectedOrder.id,
          payments: [{
            paymentMethodId: pmId,
            amount: totalCents,
            status: 'PAID'
          }],
          operatorName: profile.nome || 'Operador',
          clientActionId
        });

        if (!res.ok) {
          alert(res.error || 'Erro ao marcar pedido como pago.');
          return;
        }

        const updatedOrder = res.order || { ...selectedOrder, pago: true };
        setOrders((prevOrders: any[]) => {
          const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? updatedOrder : o);
          cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
          return updatedOrders;
        });
        setSelectedOrder(updatedOrder);
      } else {
        const reasonInput = window.prompt("Informe o motivo do estorno para desmarcar o pagamento:");
        if (reasonInput === null) return;

        let targetPaymentId = 'legacy';
        if (Array.isArray(selectedOrder.payments) && selectedOrder.payments.length > 0) {
          const paid = selectedOrder.payments.find((p: any) => p.status === 'PAID');
          if (paid) targetPaymentId = paid.id;
        }

        const clientActionId = `act_ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const res = await processOrderRefundApi({
          restaurantId: profile.restaurantId,
          orderId: selectedOrder.id,
          paymentId: targetPaymentId,
          reason: reasonInput,
          operatorName: profile.nome || 'Operador',
          clientActionId
        });

        if (!res.ok) {
          alert(res.error || 'Erro ao estornar pagamento do pedido.');
          return;
        }

        const updatedOrder = res.order || { ...selectedOrder, pago: false };
        setOrders((prevOrders: any[]) => {
          const updatedOrders = prevOrders.map(o => o.id === selectedOrder.id ? updatedOrder : o);
          cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
          return updatedOrders;
        });
        setSelectedOrder(updatedOrder);
      }
    } catch (error: any) {
      console.error("Error updating payment status", error);
      alert(error?.message || "Erro ao atualizar status de pagamento.");
    }
  }, [profile?.restaurantId, profile?.nome, selectedOrder, setOrders]);

  const handleRefund = React.useCallback(async (orderId: string, amount?: number, reason?: string) => {
    if (!profile?.restaurantId) return;
    try {
      const currentOrder = orders.find((o: any) => o.id === orderId) || selectedOrder;
      let targetPaymentId = 'legacy';
      if (Array.isArray(currentOrder?.payments) && currentOrder.payments.length > 0) {
        const paid = currentOrder.payments.find((p: any) => p.status === 'PAID');
        if (paid) targetPaymentId = paid.id;
      }

      const clientActionId = `act_ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await processOrderRefundApi({
        restaurantId: profile.restaurantId,
        orderId,
        paymentId: targetPaymentId,
        reason: reason || 'Estorno solicitado no painel',
        operatorName: profile.nome || 'Operador',
        clientActionId
      });

      if (!res.ok) {
        throw new Error(res.error || 'Erro ao realizar estorno.');
      }

      const updatedOrder = res.order || {
        ...currentOrder,
        estornado: true,
        pago: false
      };

      setOrders((prevOrders: any[]) => {
        const updatedOrders = prevOrders.map(o => o.id === orderId ? updatedOrder : o);
        cacheOrders.set(`orders_${profile.restaurantId}`, updatedOrders);
        return updatedOrders;
      });

      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updatedOrder);
      }

      alert('Estorno realizado com sucesso!');
    } catch (error: any) {
      console.error("Erro ao realizar estorno:", error);
      alert(error.message || "Erro ao realizar estorno.");
      throw error;
    }
  }, [profile?.restaurantId, profile?.nome, orders, selectedOrder, setOrders]);

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
              selectedOrder={selectedOrder}
              onPrintOrder={handlePrint}
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
            onUpdate={onUpdate}
            handleTogglePaid={handleTogglePaid}
            onRefund={handleRefund}
            isUpdating={updatingOrderId === selectedOrder?.id}
            restaurantProfile={restaurantProfile}
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
              onUpdate={onUpdate}
              handleTogglePaid={handleTogglePaid}
              onRefund={handleRefund}
              isUpdating={updatingOrderId === selectedOrder.id}
              restaurantProfile={restaurantProfile}
            />
          </div>
        </div>
      )}
    </div>
  );
}
