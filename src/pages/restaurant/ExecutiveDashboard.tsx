import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  DollarSign, 
  ShoppingBag, 
  TrendingUp, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Truck, 
  Store, 
  Users, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCw, 
  ChevronRight, 
  CreditCard, 
  BarChart3, 
  Utensils,
  Maximize2,
  Sparkles
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { normalizeOrderOrigem, getOrderModality, OrderOrigem } from '../../domain/order/orderSource';
import { isPixPaymentMethod } from '../../services/paymentMethodsService';
import { cache } from '../../utils/cache';

export type DashboardPeriod = 'today' | 'yesterday' | '7days' | '30days' | 'month' | 'custom';

interface ExecutiveDashboardProps {
  liveOrders?: any[];
  restaurantProfile?: any;
}

export default function ExecutiveDashboard({ liveOrders = [], restaurantProfile }: ExecutiveDashboardProps) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const restaurantId = profile?.restaurantId;

  // 1. Período selecionado
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Estados de dados
  const [periodOrders, setPeriodOrders] = useState<any[]>([]);
  const [criticalProducts, setCriticalProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Função para calcular os limites de data (período atual e período anterior equivalente)
  const periodDates = useMemo(() => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();
    let prevStartDate = new Date();
    let prevEndDate = new Date();
    let comparisonLabel = 'vs período anterior';

    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      prevStartDate.setDate(now.getDate() - 1);
      prevStartDate.setHours(0, 0, 0, 0);
      prevEndDate.setDate(now.getDate() - 1);
      prevEndDate.setHours(23, 59, 59, 999);
      comparisonLabel = 'vs ontem';
    } else if (period === 'yesterday') {
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);

      prevStartDate.setDate(now.getDate() - 2);
      prevStartDate.setHours(0, 0, 0, 0);
      prevEndDate.setDate(now.getDate() - 2);
      prevEndDate.setHours(23, 59, 59, 999);
      comparisonLabel = 'vs anteontem';
    } else if (period === '7days') {
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      prevStartDate.setDate(now.getDate() - 13);
      prevStartDate.setHours(0, 0, 0, 0);
      prevEndDate.setDate(now.getDate() - 7);
      prevEndDate.setHours(23, 59, 59, 999);
      comparisonLabel = 'vs 7 dias anteriores';
    } else if (period === '30days') {
      startDate.setDate(now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      prevStartDate.setDate(now.getDate() - 59);
      prevStartDate.setHours(0, 0, 0, 0);
      prevEndDate.setDate(now.getDate() - 30);
      prevEndDate.setHours(23, 59, 59, 999);
      comparisonLabel = 'vs 30 dias anteriores';
    } else if (period === 'month') {
      // Período atual: do dia 1 deste mês até hoje
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      // Período equivalente no mês anterior: do dia 1 até o mesmo dia do mês anterior
      const currentDay = now.getDate();
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevYear = prevMonthDate.getFullYear();
      const prevMonth = prevMonthDate.getMonth();
      const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
      const targetPrevDay = Math.min(currentDay, daysInPrevMonth);

      prevStartDate = new Date(prevYear, prevMonth, 1, 0, 0, 0, 0);
      prevEndDate = new Date(prevYear, prevMonth, targetPrevDay, 23, 59, 59, 999);
      comparisonLabel = `vs mesmo período do mês anterior (dia 1 a ${targetPrevDay})`;
    } else if (period === 'custom' && customStart && customEnd) {
      startDate = new Date(`${customStart}T00:00:00`);
      endDate = new Date(`${customEnd}T23:59:59.999`);

      const durationMs = endDate.getTime() - startDate.getTime();
      prevEndDate = new Date(startDate.getTime() - 1);
      prevStartDate = new Date(prevEndDate.getTime() - durationMs);
      comparisonLabel = 'vs período anterior equivalente';
    }

    return { startDate, endDate, prevStartDate, prevEndDate, comparisonLabel };
  }, [period, customStart, customEnd]);

  // Carregamento de pedidos
  const loadDashboardData = useCallback(async (force = false) => {
    if (!restaurantId) return;

    const cacheKey = `exec_dash_${restaurantId}_${period}_${customStart}_${customEnd}`;
    if (!force) {
      const cached = cache.get(cacheKey);
      if (cached) {
        setPeriodOrders(cached.orders || []);
        setCriticalProducts(cached.criticalProducts || []);
        setLoading(false);
        return;
      }
    }

    try {
      if (force) setIsRefreshing(true);
      else setLoading(true);

      const { prevStartDate, endDate } = periodDates;

      // Busca pedidos do período atual + período anterior
      const ordersRef = collection(db, 'restaurants', restaurantId, 'orders');
      const q = query(
        ordersRef,
        where('data_criacao', '>=', prevStartDate.toISOString()),
        where('data_criacao', '<=', endDate.toISOString()),
        limit(600)
      );

      const [ordersSnap, productsSnap] = await Promise.allSettled([
        getDocs(q),
        getDocs(query(collection(db, 'restaurants', restaurantId, 'products'), limit(150)))
      ]);

      let docs: any[] = [];
      if (ordersSnap.status === 'fulfilled') {
        docs = ordersSnap.value.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(order => {
            const isMpPix = isPixPaymentMethod(order.forma_pagamento) && order.mercadopago_payment_id;
            if (isMpPix && !order.pago && order.status === 'pendente') return false;
            return true;
          });
      }

      // Mescla com liveOrders em memória para garantir novidades imediatas
      if (liveOrders && liveOrders.length > 0) {
        const docsMap = new Map(docs.map(o => [o.id, o]));
        liveOrders.forEach(lo => {
          if (!docsMap.has(lo.id)) {
            const cDate = new Date(lo.data_criacao || lo.createdAt);
            if (cDate >= prevStartDate && cDate <= endDate) {
              docsMap.set(lo.id, lo);
            }
          }
        });
        docs = Array.from(docsMap.values());
      }

      // Filtra produtos com estoque crítico
      let critical: any[] = [];
      if (productsSnap.status === 'fulfilled') {
        critical = productsSnap.value.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(p => {
            const ctrl = p.controlarEstoque === true;
            if (!ctrl) return false;
            const atual = p.estoqueAtual ?? p.estoque ?? p.stock ?? 0;
            const minimo = p.estoqueMinimo ?? 0;
            return atual <= minimo;
          });
      }

      setPeriodOrders(docs);
      setCriticalProducts(critical);

      cache.set(cacheKey, { orders: docs, criticalProducts: critical }, 30);
    } catch (err) {
      console.error('Erro ao carregar dados do dashboard executivo:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [restaurantId, period, customStart, customEnd, periodDates, liveOrders]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // CÁLCULOS ESTRUTURADOS E MÉTRICAS
  const metrics = useMemo(() => {
    const { startDate, endDate, prevStartDate, prevEndDate } = periodDates;
    const now = new Date();

    // 1. Separação entre período atual e período anterior
    const currentOrders = periodOrders.filter(o => {
      const d = new Date(o.data_criacao || o.createdAt);
      return d >= startDate && d <= endDate;
    });

    const previousOrders = periodOrders.filter(o => {
      const d = new Date(o.data_criacao || o.createdAt);
      return d >= prevStartDate && d <= prevEndDate;
    });

    // 2. Pedidos válidos (exclui cancelados e rejeitados do faturamento)
    const isValidOrder = (status: string) => !['cancelado', 'rejeitado'].includes(status);

    const currentValidOrders = currentOrders.filter(o => isValidOrder(o.status));
    const previousValidOrders = previousOrders.filter(o => isValidOrder(o.status));

    const currentRevenue = currentValidOrders.reduce((sum, o) => sum + (Number(o.valor_total) || Number(o.total) || 0), 0);
    const previousRevenue = previousValidOrders.reduce((sum, o) => sum + (Number(o.valor_total) || Number(o.total) || 0), 0);

    const revenuePercent = previousRevenue > 0 
      ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 
      : (currentRevenue > 0 ? 100 : 0);

    const ordersCount = currentOrders.length;
    const previousOrdersCount = previousOrders.length;
    const ordersPercent = previousOrdersCount > 0
      ? ((ordersCount - previousOrdersCount) / previousOrdersCount) * 100
      : (ordersCount > 0 ? 100 : 0);

    const currentTicket = currentValidOrders.length > 0 ? currentRevenue / currentValidOrders.length : 0;
    const previousTicket = previousValidOrders.length > 0 ? previousRevenue / previousValidOrders.length : 0;
    const ticketPercent = previousTicket > 0
      ? ((currentTicket - previousTicket) / previousTicket) * 100
      : (currentTicket > 0 ? 100 : 0);

    // 3. Situação dos pedidos (operacional no período)
    const statusCounts = {
      novos: 0,
      emPreparo: 0,
      prontos: 0,
      emEntrega: 0,
      finalizados: 0,
      cancelados: 0,
    };

    currentOrders.forEach(o => {
      const st = String(o.status || '').toLowerCase();
      if (st === 'pendente' || st === 'novo') {
        statusCounts.novos++;
      } else if (st === 'aceito' || st === 'preparo' || st === 'em_preparo') {
        statusCounts.emPreparo++;
      } else if (st === 'pronto') {
        statusCounts.prontos++;
      } else if (st === 'entrega' || st === 'em_entrega' || st === 'saiu_para_entrega') {
        statusCounts.emEntrega++;
      } else if (st === 'entregue' || st === 'finalizado' || st === 'delivered_pending_settlement') {
        statusCounts.finalizados++;
      } else if (st === 'cancelado' || st === 'rejeitado') {
        statusCounts.cancelados++;
      }
    });

    const completedRate = ordersCount > 0 ? (statusCounts.finalizados / ordersCount) * 100 : 0;

    // 4. Vendas por canal (normalizado e preciso)
    const channelsMap: Record<OrderOrigem, { count: number; revenue: number }> = {
      DELIVERY: { count: 0, revenue: 0 },
      BALCAO: { count: 0, revenue: 0 },
      GARCOM: { count: 0, revenue: 0 },
      TOTEM: { count: 0, revenue: 0 },
    };

    currentValidOrders.forEach(o => {
      const ch = normalizeOrderOrigem(o);
      const val = Number(o.valor_total) || Number(o.total) || 0;
      channelsMap[ch].count++;
      channelsMap[ch].revenue += val;
    });

    const channelsList = [
      { id: 'DELIVERY' as OrderOrigem, label: 'Delivery', icon: Truck, ...channelsMap.DELIVERY },
      { id: 'BALCAO' as OrderOrigem, label: 'Balcão / Retirada', icon: Store, ...channelsMap.BALCAO },
      { id: 'GARCOM' as OrderOrigem, label: 'Garçom / Salão', icon: Utensils, ...channelsMap.GARCOM },
      ...(channelsMap.TOTEM.count > 0 ? [{ id: 'TOTEM' as OrderOrigem, label: 'Totem', icon: Maximize2, ...channelsMap.TOTEM }] : [])
    ].map(ch => ({
      ...ch,
      share: currentRevenue > 0 ? (ch.revenue / currentRevenue) * 100 : 0
    }));

    // 5. Ranking de produtos mais vendidos
    const productSalesMap: Record<string, { nome: string; quantidade: number; receita: number }> = {};
    currentValidOrders.forEach(o => {
      const items = o.itens || o.items || o.produtos || [];
      items.forEach((item: any) => {
        const key = item.produto_id || item.id || item.productId || item.nome;
        const nome = item.nome || item.name || 'Produto';
        const qtd = Number(item.quantidade || item.quantity) || 1;
        let preco = Number(item.valor ?? item.preco ?? item.price ?? 0);
        if (preco === 0 && item.valor_total) {
          preco = Number(item.valor_total) / qtd;
        }

        if (!productSalesMap[key]) {
          productSalesMap[key] = { nome, quantidade: 0, receita: 0 };
        }
        productSalesMap[key].quantidade += qtd;
        productSalesMap[key].receita += (preco * qtd);
      });
    });

    const topProducts = Object.values(productSalesMap)
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);

    // 6. Gráfico de vendas (agrupamento inteligente)
    const isSingleDay = period === 'today' || period === 'yesterday';
    let chartData: { label: string; faturamento: number; pedidos: number }[] = [];

    if (isSingleDay) {
      // Agrupamento por hora (00h às 23h)
      const hourlyMap: Record<number, { faturamento: number; pedidos: number }> = {};
      for (let i = 0; i < 24; i++) hourlyMap[i] = { faturamento: 0, pedidos: 0 };

      currentValidOrders.forEach(o => {
        const h = new Date(o.data_criacao || o.createdAt).getHours();
        if (hourlyMap[h]) {
          hourlyMap[h].faturamento += (Number(o.valor_total) || Number(o.total) || 0);
          hourlyMap[h].pedidos += 1;
        }
      });

      // Filtra para exibir a janela relevante do dia (ou dia completo se já houver vendas)
      chartData = Object.entries(hourlyMap).map(([h, val]) => ({
        label: `${String(h).padStart(2, '0')}h`,
        faturamento: Math.round(val.faturamento * 100) / 100,
        pedidos: val.pedidos
      }));
    } else {
      // Agrupamento por data (dia a dia)
      const dailyMap: Record<string, { faturamento: number; pedidos: number; rawDate: Date }> = {};
      
      currentValidOrders.forEach(o => {
        const dateObj = new Date(o.data_criacao || o.createdAt);
        const dateKey = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = { faturamento: 0, pedidos: 0, rawDate: dateObj };
        }
        dailyMap[dateKey].faturamento += (Number(o.valor_total) || Number(o.total) || 0);
        dailyMap[dateKey].pedidos += 1;
      });

      chartData = Object.entries(dailyMap)
        .sort((a, b) => a[1].rawDate.getTime() - b[1].rawDate.getTime())
        .map(([label, val]) => ({
          label,
          faturamento: Math.round(val.faturamento * 100) / 100,
          pedidos: val.pedidos
        }));
    }

    // 7. Delivery: dados de desempenho
    const deliveryOrders = currentOrders.filter(o => normalizeOrderOrigem(o) === 'DELIVERY');
    const deliveryCompleted = deliveryOrders.filter(o => ['entregue', 'finalizado', 'delivered_pending_settlement'].includes(o.status));
    const deliveryWaitingDriver = deliveryOrders.filter(o => o.status === 'pronto' || (['aceito', 'preparo'].includes(o.status) && !o.entregador_id && !o.driverId));
    const deliveryInRoute = deliveryOrders.filter(o => ['entrega', 'em_entrega', 'saiu_para_entrega'].includes(o.status));
    const deliveryCancelled = deliveryOrders.filter(o => ['cancelado', 'rejeitado'].includes(o.status));

    // Tempo médio de entrega (somente se houver timestamps confiáveis)
    const deliveryTimes: number[] = [];
    deliveryCompleted.forEach(o => {
      const finishTime = o.data_finalizado || o.horario_entrega || o.deliveredAt;
      const startTime = o.data_saida_entrega || o.horario_saida || o.startedAt || o.data_criacao || o.createdAt;
      if (finishTime && startTime) {
        const diffMinutes = (new Date(finishTime).getTime() - new Date(startTime).getTime()) / (1000 * 60);
        if (diffMinutes > 1 && diffMinutes < 240) {
          deliveryTimes.push(diffMinutes);
        }
      }
    });

    const avgDeliveryTime = deliveryTimes.length > 0 
      ? Math.round(deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length) 
      : null;

    // 8. Formas de pagamento
    const paymentMap: Record<string, { total: number; count: number }> = {};
    currentValidOrders.forEach(o => {
      const rawMethod = String(o.forma_pagamento || o.paymentMethod || o.metodo_pagamento || 'Outro').toLowerCase();
      let groupName = 'Outros';

      if (rawMethod.includes('pix')) {
        groupName = 'Pix';
      } else if (rawMethod.includes('credito') || rawMethod.includes('crédito')) {
        groupName = 'Cartão de Crédito';
      } else if (rawMethod.includes('debito') || rawMethod.includes('débito')) {
        groupName = 'Cartão de Débito';
      } else if (rawMethod.includes('cartao') || rawMethod.includes('cartão') || rawMethod.includes('card')) {
        groupName = 'Cartão';
      } else if (rawMethod.includes('dinheiro') || rawMethod.includes('cash')) {
        groupName = 'Dinheiro';
      }

      if (!paymentMap[groupName]) paymentMap[groupName] = { total: 0, count: 0 };
      const val = Number(o.valor_total) || Number(o.total) || 0;
      paymentMap[groupName].total += val;
      paymentMap[groupName].count += 1;
    });

    const paymentMethodsList = Object.entries(paymentMap)
      .map(([method, data]) => ({
        method,
        total: data.total,
        count: data.count,
        share: currentRevenue > 0 ? (data.total / currentRevenue) * 100 : 0
      }))
      .sort((a, b) => b.total - a.total);

    // 4. Detalhamento de modalidades do Balcão
    const balcaoBreakdown = {
      retirada: { count: 0, revenue: 0 },
      mesa: { count: 0, revenue: 0 },
      entrega: { count: 0, revenue: 0 }
    };

    currentValidOrders.forEach(o => {
      if (normalizeOrderOrigem(o) === 'BALCAO') {
        const mod = getOrderModality(o);
        const val = Number(o.valor_total) || Number(o.total) || 0;
        if (mod === 'BALCAO_MESA') {
          balcaoBreakdown.mesa.count++;
          balcaoBreakdown.mesa.revenue += val;
        } else if (mod === 'BALCAO_ENTREGA') {
          balcaoBreakdown.entrega.count++;
          balcaoBreakdown.entrega.revenue += val;
        } else {
          balcaoBreakdown.retirada.count++;
          balcaoBreakdown.retirada.revenue += val;
        }
      }
    });

    // 9. Cancelamentos e comparação com período anterior (indicador onde aumento é RUIM)
    const currentCancelled = currentOrders.filter(o => ['cancelado', 'rejeitado'].includes(o.status));
    const previousCancelled = previousOrders.filter(o => ['cancelado', 'rejeitado'].includes(o.status));

    const currentCancelCount = currentCancelled.length;
    const previousCancelCount = previousCancelled.length;
    const cancelDiff = currentCancelCount - previousCancelCount;
    const cancelPercent = previousCancelCount > 0 
      ? ((currentCancelCount - previousCancelCount) / previousCancelCount) * 100
      : (currentCancelCount > 0 ? 100 : 0);
    const cancelledRevenueLost = currentCancelled.reduce((sum, o) => sum + (Number(o.valor_total) || Number(o.total) || 0), 0);
    const cancelRate = ordersCount > 0 ? (currentCancelCount / ordersCount) * 100 : 0;

    const cancelReasonsMap: Record<string, number> = {};
    currentCancelled.forEach(o => {
      const reason = o.motivo_cancelamento || o.motivo || o.reason || 'Motivo não especificado';
      cancelReasonsMap[reason] = (cancelReasonsMap[reason] || 0) + 1;
    });
    const cancelReasonsList = Object.entries(cancelReasonsMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // 10. Horários de Pico: maior movimento (pedidos) e maior faturamento (R$) usando timestamps reais
    const hourlyDistribution: Record<number, { ordersCount: number; revenue: number }> = {};
    for (let i = 0; i < 24; i++) {
      hourlyDistribution[i] = { ordersCount: 0, revenue: 0 };
    }

    currentOrders.forEach(o => {
      const d = new Date(o.data_criacao || o.createdAt);
      if (!isNaN(d.getTime())) {
        const h = d.getHours();
        if (hourlyDistribution[h]) {
          hourlyDistribution[h].ordersCount++;
          if (isValidOrder(o.status)) {
            hourlyDistribution[h].revenue += (Number(o.valor_total) || Number(o.total) || 0);
          }
        }
      }
    });

    let peakMovement = { hour: -1, count: 0 };
    let peakRevenue = { hour: -1, amount: 0 };

    for (let h = 0; h < 24; h++) {
      if (hourlyDistribution[h].ordersCount > peakMovement.count) {
        peakMovement = { hour: h, count: hourlyDistribution[h].ordersCount };
      }
      if (hourlyDistribution[h].revenue > peakRevenue.amount) {
        peakRevenue = { hour: h, amount: hourlyDistribution[h].revenue };
      }
    }

    const peakHours = Object.entries(hourlyDistribution)
      .map(([h, data]) => ({ hour: Number(h), count: data.ordersCount, revenue: data.revenue }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .filter(p => p.count > 0);

    // 11. Clientes atendidos (dados estruturados e confiáveis com cliente_id)
    const clientOrderCounts: Record<string, number> = {};
    currentValidOrders.forEach(o => {
      const cId = o.cliente_id || o.usuario_id || o.userId;
      if (cId) {
        clientOrderCounts[cId] = (clientOrderCounts[cId] || 0) + 1;
      }
    });

    const identifiedClientsCount = Object.keys(clientOrderCounts).length;
    const recurringClientsCount = Object.values(clientOrderCounts).filter(c => c > 1).length;
    const recurringRate = identifiedClientsCount > 0 ? (recurringClientsCount / identifiedClientsCount) * 100 : 0;

    // 12. Resumo Executivo do Período (frases compactas com cálculos determinísticos, sem IA)
    const periodSummaryBullets: string[] = [];

    // Frase 1: Faturamento
    if (previousRevenue > 0) {
      if (revenuePercent > 0) {
        periodSummaryBullets.push(`Faturamento aumentou ${revenuePercent.toFixed(1)}% em relação ao período anterior.`);
      } else if (revenuePercent < 0) {
        periodSummaryBullets.push(`Faturamento caiu ${Math.abs(revenuePercent).toFixed(1)}% em relação ao período anterior.`);
      } else {
        periodSummaryBullets.push(`Faturamento manteve-se estável em relação ao período anterior.`);
      }
    } else if (currentRevenue > 0) {
      periodSummaryBullets.push(`Faturamento totalizou R$ ${currentRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no período.`);
    }

    // Frase 2: Ticket Médio
    if (previousTicket > 0 && currentTicket > 0) {
      if (ticketPercent > 0) {
        periodSummaryBullets.push(`Ticket médio subiu ${ticketPercent.toFixed(1)}% (R$ ${currentTicket.toFixed(2)} por pedido).`);
      } else if (ticketPercent < 0) {
        periodSummaryBullets.push(`Ticket médio caiu ${Math.abs(ticketPercent).toFixed(1)}% (R$ ${currentTicket.toFixed(2)} por pedido).`);
      }
    }

    // Frase 3: Canal Líder
    const sortedChannels = [...channelsList].sort((a, b) => b.revenue - a.revenue);
    const topChannel = sortedChannels[0];
    if (topChannel && topChannel.revenue > 0 && currentRevenue > 0) {
      periodSummaryBullets.push(`${topChannel.label} representou ${topChannel.share.toFixed(0)}% das vendas.`);
    }

    // Frase 4: Horário de Pico ou Cancelamentos
    if (peakMovement.hour >= 0 && peakMovement.count > 0) {
      periodSummaryBullets.push(`${peakMovement.count} pedidos foram realizados entre ${peakMovement.hour}h e ${peakMovement.hour + 1}h, seu horário de maior movimento.`);
    } else if (currentCancelCount > 0 && cancelDiff > 0) {
      periodSummaryBullets.push(`Cancelamentos aumentaram (+${cancelDiff} pedido(s)), somando R$ ${cancelledRevenueLost.toFixed(2)} não faturados.`);
    }

    const periodSummary = periodSummaryBullets.slice(0, 4);

    // 13. Alertas Acionáveis (somente baseados em dados reais e apenas quando há problema)
    const actionableAlerts: { id: string; message: string; severity: 'warning' | 'danger'; link?: string; linkText?: string }[] = [];

    // Alerta 1: Pedidos aguardando preparo
    const pendingCount = statusCounts.novos;
    if (pendingCount > 0) {
      actionableAlerts.push({
        id: 'pending_prep',
        message: `${pendingCount} pedido${pendingCount > 1 ? 's estão' : ' está'} aguardando preparo.`,
        severity: pendingCount >= 5 ? 'danger' : 'warning',
        link: '/restaurant/operacao/pedidos',
        linkText: 'Atender Pedidos'
      });
    }

    // Alerta 2: Pedidos prontos aguardando entrega/saída
    const readyCount = statusCounts.prontos;
    if (readyCount > 0) {
      actionableAlerts.push({
        id: 'ready_delivery',
        message: `${readyCount} pedido${readyCount > 1 ? 's estão prontos' : ' está pronto'} aguardando entrega.`,
        severity: 'warning',
        link: '/restaurant/operacao/entregas',
        linkText: 'Ver Expedição'
      });
    }

    // Alerta 3: Cancelamentos aumentaram
    if (cancelDiff > 0 && currentCancelCount >= 2) {
      const percText = previousCancelCount > 0 ? ` (${cancelPercent > 0 ? `+${cancelPercent.toFixed(0)}%` : ''})` : '';
      actionableAlerts.push({
        id: 'cancellations_up',
        message: `Cancelamentos aumentaram (+${cancelDiff} pedido${cancelDiff > 1 ? 's' : ''}${percText}).`,
        severity: 'danger'
      });
    }

    // Alerta 4: Faturamento abaixo do período anterior
    if (previousRevenue > 50 && revenuePercent <= -10) {
      actionableAlerts.push({
        id: 'revenue_below',
        message: `Faturamento está ${Math.abs(revenuePercent).toFixed(1)}% abaixo do período anterior.`,
        severity: 'warning'
      });
    }

    // Alerta 5: Estoque crítico
    if (criticalProducts.length > 0) {
      actionableAlerts.push({
        id: 'critical_stock',
        message: `${criticalProducts.length} produto(s) com estoque crítico.`,
        severity: 'warning',
        link: '/restaurant/cardapio/produtos',
        linkText: 'Ver Estoque'
      });
    }

    return {
      currentRevenue,
      previousRevenue,
      revenuePercent,
      ordersCount,
      previousOrdersCount,
      ordersPercent,
      currentTicket,
      previousTicket,
      ticketPercent,
      completedRate,
      statusCounts,
      channelsList,
      balcaoBreakdown,
      topProducts,
      chartData,
      isSingleDay,
      deliveryStats: {
        completed: deliveryCompleted.length,
        waitingDriver: deliveryWaitingDriver.length,
        inRoute: deliveryInRoute.length,
        avgTime: avgDeliveryTime,
        cancelled: deliveryCancelled.length
      },
      paymentMethodsList,
      cancellations: {
        count: currentCancelCount,
        prevCount: previousCancelCount,
        diff: cancelDiff,
        percent: cancelPercent,
        revenueLost: cancelledRevenueLost,
        rate: cancelRate,
        reasons: cancelReasonsList
      },
      peakMovement,
      peakRevenue,
      peakHours,
      clients: {
        identifiedCount: identifiedClientsCount,
        recurringCount: recurringClientsCount,
        recurringRate
      },
      periodSummary,
      actionableAlerts
    };
  }, [periodOrders, periodDates, criticalProducts]);

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 space-y-4 sm:space-y-6 pb-12 overflow-x-hidden min-w-0">
      {/* ========================================================= */}
      {/* 1. CABEÇALHO COM SELETOR DE PERÍODO & COMPARAÇÃO          */}
      {/* ========================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3.5 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">Dashboard Executivo</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
              Ao Vivo
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Indicadores essenciais e consolidados para decisão do restaurante.
          </p>
        </div>

        {/* Controles de Período */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {(['today', 'yesterday', '7days', '30days', 'month'] as DashboardPeriod[]).map((p) => {
            const labels: Record<DashboardPeriod, string> = {
              today: 'Hoje',
              yesterday: 'Ontem',
              '7days': '7 dias',
              '30days': '30 dias',
              month: 'Este mês',
              custom: 'Personalizado'
            };
            const isSelected = period === p;
            return (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-2 text-xs font-bold rounded-xl transition-all min-h-[44px] flex items-center justify-center cursor-pointer active:scale-95 touch-manipulation ${
                  isSelected
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200/60'
                }`}
              >
                {labels[p]}
              </button>
            );
          })}

          <button
            onClick={() => setShowCustomModal(true)}
            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all min-h-[44px] flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation ${
              period === 'custom'
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200/60'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>Personalizado</span>
          </button>

          <button
            onClick={() => loadDashboardData(true)}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200/60 transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50 touch-manipulation shrink-0"
            title="Atualizar indicadores"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Modal / Painel de Período Personalizado */}
      {showCustomModal && (
        <div className="bg-stone-50 p-3.5 sm:p-4 rounded-2xl border border-stone-200 flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 animate-in fade-in min-w-0">
          <div className="w-full sm:w-auto min-w-0">
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Data Início</label>
            <input 
              type="date" 
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-800 min-h-[44px]"
            />
          </div>
          <div className="w-full sm:w-auto min-w-0">
            <label className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider mb-1">Data Fim</label>
            <input 
              type="date" 
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-800 min-h-[44px]"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto pt-1 sm:pt-0">
            <button
              onClick={() => {
                setPeriod('custom');
                setShowCustomModal(false);
              }}
              className="flex-1 sm:flex-initial px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all min-h-[44px] flex items-center justify-center cursor-pointer touch-manipulation"
            >
              Aplicar Período
            </button>
            <button
              onClick={() => setShowCustomModal(false)}
              className="flex-1 sm:flex-initial px-3 py-2 text-stone-500 hover:text-stone-700 text-xs font-medium min-h-[44px] flex items-center justify-center cursor-pointer touch-manipulation"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* ALERTAS ACIONÁVEIS (BASEADOS EM DADOS REAIS)              */}
      {/* ========================================================= */}
      {metrics.actionableAlerts.length > 0 && (
        <div className="space-y-2.5">
          {metrics.actionableAlerts.map((alert) => (
            <div 
              key={alert.id}
              className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0 ${
                alert.severity === 'danger'
                  ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                  : 'bg-amber-50/80 border-amber-200 text-amber-950'
              }`}
            >
              <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0 w-full sm:w-auto">
                <div className={`p-2 rounded-xl shrink-0 mt-0.5 sm:mt-0 ${
                  alert.severity === 'danger' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  <AlertTriangle className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/80 border border-stone-200/50 shrink-0">
                      Atenção
                    </span>
                    <h3 className="text-xs sm:text-sm font-bold break-words">{alert.message}</h3>
                  </div>
                </div>
              </div>
              {alert.link && (
                <Link
                  to={alert.link}
                  className={`w-full sm:w-auto justify-center shrink-0 px-3.5 py-2.5 rounded-xl text-xs font-bold text-white shadow-2xs transition-all flex items-center gap-1 min-h-[44px] touch-manipulation ${
                    alert.severity === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  <span>{alert.linkText || 'Atender'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. INDICADORES PRINCIPAIS COM COMPARAÇÃO AUTOMÁTICA       */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Faturamento */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs relative overflow-hidden min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider truncate">Faturamento</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 min-w-0">
            <h2 className="text-xl min-[380px]:text-2xl sm:text-3xl font-black text-stone-900 tracking-tight break-words">
              R$ {metrics.currentRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold shrink-0 ${
                metrics.revenuePercent > 0 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                  : metrics.revenuePercent < 0 
                    ? 'bg-rose-50 text-rose-700 border border-rose-200/60' 
                    : 'bg-stone-100 text-stone-600'
              }`}>
                {metrics.revenuePercent > 0 && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />}
                {metrics.revenuePercent < 0 && <ArrowDownRight className="w-3.5 h-3.5 text-rose-600" />}
                {metrics.revenuePercent > 0 ? `↑ ${metrics.revenuePercent.toFixed(1)}%` : metrics.revenuePercent < 0 ? `↓ ${Math.abs(metrics.revenuePercent).toFixed(1)}%` : '0,0%'}
              </span>
              <span className="text-[11px] text-stone-400 font-medium break-words leading-tight">
                {periodDates.comparisonLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Pedidos */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs relative overflow-hidden min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider truncate">Pedidos</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 min-w-0">
            <h2 className="text-xl min-[380px]:text-2xl sm:text-3xl font-black text-stone-900 tracking-tight break-words">
              {metrics.ordersCount}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold shrink-0 ${
                metrics.ordersPercent > 0 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                  : metrics.ordersPercent < 0 
                    ? 'bg-amber-50 text-amber-700 border border-amber-200/60' 
                    : 'bg-stone-100 text-stone-600'
              }`}>
                {metrics.ordersPercent > 0 && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />}
                {metrics.ordersPercent < 0 && <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />}
                {metrics.ordersPercent > 0 ? `↑ ${metrics.ordersPercent.toFixed(1)}%` : metrics.ordersPercent < 0 ? `↓ ${Math.abs(metrics.ordersPercent).toFixed(1)}%` : '0,0%'}
              </span>
              <span className="text-[11px] text-stone-400 font-medium break-words leading-tight">
                {metrics.previousOrdersCount} anterior
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Ticket Médio */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs relative overflow-hidden min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider truncate">Ticket Médio</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 min-w-0">
            <h2 className="text-xl min-[380px]:text-2xl sm:text-3xl font-black text-stone-900 tracking-tight break-words">
              R$ {metrics.currentTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold shrink-0 ${
                metrics.ticketPercent > 0 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                  : metrics.ticketPercent < 0 
                    ? 'bg-amber-50 text-amber-700 border border-amber-200/60' 
                    : 'bg-stone-100 text-stone-600'
              }`}>
                {metrics.ticketPercent > 0 && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />}
                {metrics.ticketPercent < 0 && <ArrowDownRight className="w-3.5 h-3.5 text-amber-600" />}
                {metrics.ticketPercent > 0 ? `↑ ${metrics.ticketPercent.toFixed(1)}%` : metrics.ticketPercent < 0 ? `↓ ${Math.abs(metrics.ticketPercent).toFixed(1)}%` : '0,0%'}
              </span>
              <span className="text-[11px] text-stone-400 font-medium break-words leading-tight">
                R$ {metrics.previousTicket.toFixed(2)} anterior
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Cancelamentos (Indicador negativo: aumento é ruim) */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs relative overflow-hidden min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider truncate">Cancelamentos</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 min-w-0">
            <h2 className="text-xl min-[380px]:text-2xl sm:text-3xl font-black text-stone-900 tracking-tight break-words">
              {metrics.cancellations.count}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs font-bold shrink-0 ${
                metrics.cancellations.diff > 0 
                  ? 'bg-rose-50 text-rose-700 border border-rose-200/60' 
                  : metrics.cancellations.diff < 0 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' 
                    : 'bg-stone-100 text-stone-600'
              }`}>
                {metrics.cancellations.diff > 0 && <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />}
                {metrics.cancellations.diff < 0 && <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />}
                {metrics.cancellations.diff > 0 
                  ? `↑ +${metrics.cancellations.diff}` 
                  : metrics.cancellations.diff < 0 
                    ? `↓ ${metrics.cancellations.diff}` 
                    : 'Estável'}
              </span>
              <span className="text-[11px] text-stone-400 font-medium break-words leading-tight">
                {metrics.cancellations.rate.toFixed(1)}% dos pedidos
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* ÁREA MUITO COMPACTA: RESUMO DO PERÍODO (DETERMINÍSTICO)   */}
      {/* ========================================================= */}
      {metrics.periodSummary.length > 0 && (
        <div className="bg-stone-50/90 border border-stone-200/80 rounded-2xl p-3 sm:p-4 shadow-2xs min-w-0">
          <div className="flex items-center gap-1.5 text-stone-600 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-wider text-stone-700">Resumo do período</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {metrics.periodSummary.map((text, idx) => (
              <div 
                key={idx} 
                className="bg-white px-3 py-2.5 rounded-xl border border-stone-200/60 text-xs text-stone-700 flex items-start gap-2 shadow-2xs min-w-0"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <span className="font-medium leading-relaxed break-words">{text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* HORÁRIOS DE PICO (VOLUME & FATURAMENTO POR TIMESTAMPS)     */}
      {/* ========================================================= */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs min-w-0">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-stone-900 truncate">Horários de Pico</h3>
              <p className="text-[11px] text-stone-400 truncate">Calculado a partir de timestamps reais dos pedidos</p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider hidden sm:inline shrink-0">
            Inteligência de Operação
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {/* Maior Movimento */}
          <div className="p-3 sm:p-3.5 bg-stone-50/70 rounded-2xl border border-stone-200/60 flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Maior Movimento</span>
              <p className="text-base min-[380px]:text-lg font-black text-stone-900 mt-0.5 break-words">
                {metrics.peakMovement.hour >= 0 && metrics.peakMovement.count > 0 
                  ? `${metrics.peakMovement.hour}h–${metrics.peakMovement.hour + 1}h` 
                  : 'Sem registros'}
              </p>
            </div>
            <div className="text-left min-[380px]:text-right shrink-0">
              <span className="inline-block text-xs font-black text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200/60">
                {metrics.peakMovement.count} pedido{metrics.peakMovement.count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Maior Faturamento */}
          <div className="p-3 sm:p-3.5 bg-stone-50/70 rounded-2xl border border-stone-200/60 flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">Maior Faturamento</span>
              <p className="text-base min-[380px]:text-lg font-black text-stone-900 mt-0.5 break-words">
                {metrics.peakRevenue.hour >= 0 && metrics.peakRevenue.amount > 0 
                  ? `${metrics.peakRevenue.hour}h–${metrics.peakRevenue.hour + 1}h` 
                  : 'Sem registros'}
              </p>
            </div>
            <div className="text-left min-[380px]:text-right shrink-0">
              <span className="inline-block text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200/60 break-words">
                R$ {metrics.peakRevenue.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. SITUAÇÃO DOS PEDIDOS (RESUMO OPERACIONAL INTEGRADO)     */}
      {/* ========================================================= */}
      <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs min-w-0">
        <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-2 mb-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-900">Situação Operacional dos Pedidos</h2>
            <p className="text-xs text-stone-500">Clique em qualquer etapa para acessar a fila correspondente</p>
          </div>
          <Link
            to="/restaurant/operacao/pedidos"
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 min-h-[44px] self-start min-[420px]:self-auto touch-manipulation shrink-0"
          >
            <span>Ver Todos</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {[
            { label: 'Novos', count: metrics.statusCounts.novos, color: 'border-blue-200 bg-blue-50/40 text-blue-900', badge: 'bg-blue-100 text-blue-800' },
            { label: 'Em preparo', count: metrics.statusCounts.emPreparo, color: 'border-amber-200 bg-amber-50/40 text-amber-900', badge: 'bg-amber-100 text-amber-800' },
            { label: 'Prontos', count: metrics.statusCounts.prontos, color: 'border-purple-200 bg-purple-50/40 text-purple-900', badge: 'bg-purple-100 text-purple-800' },
            { label: 'Em entrega', count: metrics.statusCounts.emEntrega, color: 'border-indigo-200 bg-indigo-50/40 text-indigo-900', badge: 'bg-indigo-100 text-indigo-800' },
            { label: 'Finalizados', count: metrics.statusCounts.finalizados, color: 'border-emerald-200 bg-emerald-50/40 text-emerald-900', badge: 'bg-emerald-100 text-emerald-800' },
            { label: 'Cancelados', count: metrics.statusCounts.cancelados, color: 'border-rose-200 bg-rose-50/40 text-rose-900', badge: 'bg-rose-100 text-rose-800' },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => navigate('/restaurant/operacao/pedidos')}
              className={`p-3 sm:p-3.5 rounded-2xl border text-left transition-all hover:scale-[1.02] cursor-pointer active:scale-95 touch-manipulation min-h-[44px] min-w-0 ${item.color}`}
            >
              <div className="flex items-center justify-between gap-1 min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-80 truncate">{item.label}</span>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${item.badge}`}>
                  status
                </span>
              </div>
              <p className="text-xl sm:text-2xl font-black mt-2">{item.count}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 6. DESEMPENHO DE VENDAS (UM GRÁFICO PRINCIPAL SIMPLES)    */}
      {/* ========================================================= */}
      <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 min-w-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <BarChart3 className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
              <span className="truncate">Desempenho de Faturamento</span>
            </h2>
            <p className="text-xs text-stone-500">
              {metrics.isSingleDay ? 'Distribuição das vendas por horário do dia' : 'Evolução diária das vendas no período'}
            </p>
          </div>
          <div className="text-xs font-bold text-stone-600 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200/60 self-start sm:self-auto shrink-0 max-w-full truncate">
            Total: R$ {metrics.currentRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="w-full h-56 sm:h-64 md:h-72 min-w-0 overflow-hidden">
          {metrics.chartData.length > 0 && metrics.chartData.some(d => d.faturamento > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                <XAxis 
                  dataKey="label" 
                  axisLine={false} 
                  tickLine={false} 
                  fontSize={10} 
                  stroke="#78716c" 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  fontSize={10} 
                  stroke="#78716c" 
                  tickFormatter={(v) => `R$${v}`} 
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '14px', 
                    border: '1px solid #e7e5e4', 
                    boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                    fontSize: '12px'
                  }}
                  formatter={(val: any) => [`R$ ${Number(val).toFixed(2)}`, 'Faturamento']}
                  labelFormatter={(lbl) => `Período: ${lbl}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="faturamento" 
                  stroke="#10b981" 
                  strokeWidth={2.5} 
                  fillOpacity={1} 
                  fill="url(#salesGrad)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-stone-400 gap-2">
              <DollarSign className="w-8 h-8 opacity-40" />
              <p className="text-xs font-medium text-center px-4">Nenhum faturamento registrado no intervalo selecionado.</p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. VENDAS POR CANAL + 5. PRODUTOS MAIS VENDIDOS            */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 4. Vendas por Canal */}
        <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-center justify-between mb-4 gap-2">
              <div>
                <h2 className="text-base font-bold text-stone-900">Vendas por Canal</h2>
                <p className="text-xs text-stone-500">Participação de cada modalidade de atendimento</p>
              </div>
            </div>

            <div className="space-y-3">
              {metrics.channelsList.map((ch) => {
                const Icon = ch.icon;
                return (
                  <div key={ch.id} className="p-3 sm:p-3.5 bg-stone-50/70 rounded-2xl border border-stone-200/60 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-700 shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-900 truncate">{ch.label}</p>
                          <p className="text-[11px] text-stone-500">{ch.count} pedido(s)</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-black text-stone-900">
                          R$ {ch.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[11px] font-bold text-emerald-600">{ch.share.toFixed(1)}%</p>
                      </div>
                    </div>
                    {/* Barra de progresso do canal */}
                    <div className="w-full bg-stone-200/60 rounded-full h-1.5 mt-2.5 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, ch.share)}%` }}
                      />
                    </div>

                    {/* Detalhamento compacto de modalidades do Balcão */}
                    {ch.id === 'BALCAO' && (metrics.balcaoBreakdown.retirada.count > 0 || metrics.balcaoBreakdown.mesa.count > 0 || metrics.balcaoBreakdown.entrega.count > 0) && (
                      <div className="mt-2.5 pt-2 border-t border-stone-200/50 flex flex-wrap gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-stone-200 text-stone-700 font-medium break-words">
                          Retirada: <strong>{metrics.balcaoBreakdown.retirada.count}</strong> (R$ {metrics.balcaoBreakdown.retirada.revenue.toFixed(2)})
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-stone-200 text-stone-700 font-medium break-words">
                          Mesa/Local: <strong>{metrics.balcaoBreakdown.mesa.count}</strong> (R$ {metrics.balcaoBreakdown.mesa.revenue.toFixed(2)})
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-stone-200 text-stone-700 font-medium break-words">
                          Entrega Balcão: <strong>{metrics.balcaoBreakdown.entrega.count}</strong> (R$ {metrics.balcaoBreakdown.entrega.revenue.toFixed(2)})
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-[10px] text-stone-400 mt-4 italic break-words">
            * Balcão com entrega física mantém origem Balcão. Mesas e comandas mantêm Garçom/Salão.
          </p>
        </div>

        {/* 5. Produtos Mais Vendidos */}
        <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs flex flex-col justify-between min-w-0">
          <div>
            <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-2 mb-4 min-w-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-stone-900">Produtos Mais Vendidos</h2>
                <p className="text-xs text-stone-500">Ranking por volume de itens no período</p>
              </div>
              <Link 
                to="/restaurant/gestao/relatorios" 
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 min-h-[44px] self-start min-[420px]:self-auto touch-manipulation shrink-0"
              >
                <span>Relatório Completo</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="space-y-2.5">
              {metrics.topProducts.length > 0 ? (
                metrics.topProducts.map((prod, idx) => (
                  <div key={prod.nome} className="flex items-center justify-between p-2.5 sm:p-3 bg-stone-50/70 rounded-2xl border border-stone-200/60 gap-2 min-w-0">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-white border border-stone-200 text-stone-700 font-black text-xs flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <p className="text-xs font-bold text-stone-800 truncate">{prod.nome}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black text-stone-900 block">
                        R$ {prod.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[11px] text-stone-500 block">
                        {prod.quantidade} unid.
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-stone-400 text-xs">
                  Nenhum produto registrado no período.
                </div>
              )}
            </div>
          </div>
          <Link
            to="/restaurant/cardapio/produtos"
            className="text-xs font-bold text-stone-600 hover:text-stone-800 flex items-center gap-1 mt-4 pt-3 border-t border-stone-100 min-h-[44px] touch-manipulation"
          >
            <span>Gerenciar Cardápio & Estoque</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 7. DELIVERY + 8. FORMAS DE PAGAMENTO                      */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 7. Desempenho de Entregas */}
        <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs min-w-0">
          <div className="flex items-center justify-between mb-4 gap-2 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Truck className="w-4.5 h-4.5 text-blue-600 shrink-0" />
                <span className="truncate">Desempenho de Entregas</span>
              </h2>
              <p className="text-xs text-stone-500">Métricas operacionais da frota e expedição</p>
            </div>
            <Link 
              to="/restaurant/operacao/entregas"
              className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1 min-h-[44px] shrink-0 touch-manipulation"
            >
              <span>Gerenciar</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
            <div className="p-3 sm:p-3.5 bg-stone-50 rounded-2xl border border-stone-200/60 min-w-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block truncate">Entregas Feitas</span>
              <p className="text-lg sm:text-xl font-black text-stone-800 mt-1">{metrics.deliveryStats.completed}</p>
            </div>
            <div className="p-3 sm:p-3.5 bg-stone-50 rounded-2xl border border-stone-200/60 min-w-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block truncate">Em Rota</span>
              <p className="text-lg sm:text-xl font-black text-indigo-700 mt-1">{metrics.deliveryStats.inRoute}</p>
            </div>
            <div className="p-3 sm:p-3.5 bg-stone-50 rounded-2xl border border-stone-200/60 min-w-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block truncate">Sem Entregador</span>
              <p className="text-lg sm:text-xl font-black text-amber-700 mt-1">{metrics.deliveryStats.waitingDriver}</p>
            </div>
            <div className="p-3 sm:p-3.5 bg-stone-50 rounded-2xl border border-stone-200/60 min-w-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block truncate">Tempo Médio</span>
              <p className="text-lg sm:text-xl font-black text-stone-800 mt-1 truncate">
                {metrics.deliveryStats.avgTime ? `${metrics.deliveryStats.avgTime} min` : 'Não reg.'}
              </p>
            </div>
            <div className="p-3 sm:p-3.5 bg-stone-50 rounded-2xl border border-stone-200/60 col-span-2 sm:col-span-2 min-w-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block truncate">Canceladas no Delivery</span>
              <p className="text-lg sm:text-xl font-black text-rose-700 mt-1">{metrics.deliveryStats.cancelled}</p>
            </div>
          </div>
        </div>

        {/* 8. Formas de Pagamento */}
        <div className="bg-white p-4 sm:p-5 md:p-6 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs min-w-0">
          <div className="flex items-center justify-between mb-4 gap-2 min-w-0">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <CreditCard className="w-4.5 h-4.5 text-purple-600 shrink-0" />
                <span className="truncate">Formas de Pagamento</span>
              </h2>
              <p className="text-xs text-stone-500">Distribuição financeira por modalidade</p>
            </div>
            <Link 
              to="/restaurant/financeiro?subtab=caixa"
              className="text-xs font-bold text-purple-700 hover:text-purple-800 flex items-center gap-1 min-h-[44px] shrink-0 touch-manipulation"
            >
              <span>Ver Caixa</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="space-y-2.5">
            {metrics.paymentMethodsList.length > 0 ? (
              metrics.paymentMethodsList.map((pm) => (
                <div key={pm.method} className="flex items-center justify-between p-2.5 sm:p-3 bg-stone-50/70 rounded-2xl border border-stone-200/60 gap-2 min-w-0">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-stone-900 truncate">{pm.method}</p>
                    <p className="text-[11px] text-stone-500">{pm.count} transações</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-stone-900 block">
                      R$ {pm.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[11px] font-bold text-purple-600 block">
                      {pm.share.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-stone-400 text-xs">
                Nenhum pagamento registrado no período.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 9. CANCELAMENTOS + 10. PICOS + 11. CLIENTES               */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* 9. Cancelamentos */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs min-w-0">
          <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5 min-w-0">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="truncate">Cancelamentos</span>
            </h3>
            <span className="text-[11px] font-black text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200/60 shrink-0">
              {metrics.cancellations.rate.toFixed(1)}% dos pedidos
            </span>
          </div>
          <div className="p-3 bg-rose-50/40 rounded-2xl border border-rose-100 mb-3 min-w-0">
            <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block truncate">Valor Não Faturado</span>
            <p className="text-lg min-[380px]:text-xl font-black text-rose-900 mt-0.5 break-words">
              R$ {metrics.cancellations.revenueLost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-rose-700 mt-1">{metrics.cancellations.count} pedido(s) cancelados</p>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider block">Principais Motivos</span>
            {metrics.cancellations.reasons.length > 0 ? (
              metrics.cancellations.reasons.slice(0, 3).map((r) => (
                <div key={r.reason} className="flex items-center justify-between text-xs py-1 border-b border-stone-100 last:border-none gap-2 min-w-0">
                  <span className="text-stone-600 truncate min-w-0">{r.reason}</span>
                  <span className="font-bold text-stone-800 shrink-0">{r.count}x</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-stone-400 italic">Nenhum cancelamento no período.</p>
            )}
          </div>
        </div>

        {/* 10. Horários de Maior Movimento */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs min-w-0">
          <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5 min-w-0">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="truncate">Horários de Pico</span>
            </h3>
            <span className="text-[10px] text-stone-400 font-bold uppercase shrink-0">Volume</span>
          </div>
          <p className="text-xs text-stone-500 mb-3">Faixas de maior concentração de pedidos:</p>
          
          <div className="space-y-2">
            {metrics.peakHours.length > 0 ? (
              metrics.peakHours.map((p, idx) => (
                <div key={p.hour} className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200/60 gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-stone-800 truncate">{p.hour}h às {p.hour + 1}h</span>
                  </div>
                  <span className="text-xs font-black text-amber-700 shrink-0">{p.count} pedidos</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-stone-400 italic py-4 text-center">Sem dados de horários de pico.</p>
            )}
          </div>
        </div>

        {/* 11. Clientes (Dados Confiáveis com cliente_id) */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-stone-200/80 shadow-xs min-w-0 md:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5 min-w-0">
              <Users className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">Clientes Cadastrados</span>
            </h3>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold shrink-0">
              Identificados
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-2.5 mb-3">
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/60 min-w-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block truncate">Atendidos</span>
              <p className="text-lg sm:text-xl font-black text-stone-800 mt-1">{metrics.clients.identifiedCount}</p>
            </div>
            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/60 min-w-0">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block truncate">Recorrentes</span>
              <p className="text-lg sm:text-xl font-black text-emerald-700 mt-1">{metrics.clients.recurringCount}</p>
            </div>
          </div>

          <div className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-100 text-xs flex items-center justify-between gap-2 min-w-0">
            <span className="text-emerald-900 font-medium truncate">Taxa de Recompra:</span>
            <span className="font-bold text-emerald-800 shrink-0">{metrics.clients.recurringRate.toFixed(1)}%</span>
          </div>
          <p className="text-[10px] text-stone-400 mt-3 italic break-words">
            * Considera clientes identificados com cadastro no período.
          </p>
        </div>
      </div>
    </div>
  );
}
