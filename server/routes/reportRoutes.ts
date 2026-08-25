import { Router } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { createVerifyRestaurant } from '../middleware/auth';

export function createReportRouter(authAdmin: Auth, db: Firestore): Router {
  const router = Router();
  const verifyRestaurant = createVerifyRestaurant(authAdmin, db);

  // Auxiliar para obter e filtrar os pedidos do restaurante autenticado
  async function getFilteredOrders(restaurantId: string, startDateStr?: string, endDateStr?: string): Promise<any[]> {
    const ordersSnap = await db
      .collection('restaurants')
      .doc(restaurantId)
      .collection('orders')
      .get();

    let orders: any[] = ordersSnap.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data };
    });

    const startDate = startDateStr ? new Date(startDateStr) : null;
    const endDate = endDateStr ? new Date(endDateStr) : null;

    if (startDate && !isNaN(startDate.getTime())) {
      orders = orders.filter(o => {
        const created = o.data_criacao ? new Date(o.data_criacao) : null;
        return created && created >= startDate;
      });
    }

    if (endDate && !isNaN(endDate.getTime())) {
      orders = orders.filter(o => {
        const created = o.data_criacao ? new Date(o.data_criacao) : null;
        return created && created <= endDate;
      });
    }

    return orders;
  }

  // 1. Dashboard de Relatórios
  router.get('/dashboard', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);

      let totalRevenue = 0;
      const ordersByStatus: Record<string, number> = {};

      for (const order of orders) {
        if (order.status !== 'cancelado') {
          totalRevenue += Number(order.valor_total) || Number(order.total) || 0;
        }
        const status = order.status || 'desconhecido';
        ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
      }

      const totalOrders = orders.length;
      const ticketMedio = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      return res.json({
        success: true,
        restaurantId,
        totalOrders,
        totalRevenue,
        ticketMedio,
        ordersByStatus,
        period: { startDate: startDate || null, endDate: endDate || null }
      });
    } catch (error: any) {
      console.error('Error fetching dashboard report:', error);
      return res.status(500).json({ error: 'Erro ao carregar o dashboard de relatórios.' });
    }
  });

  // 2. Métricas
  router.get('/metrics', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);

      let revenue = 0;
      let costCents = 0;
      let deliveredCount = 0;
      let cancelledCount = 0;

      for (const o of orders) {
        if (o.status !== 'cancelado') {
          revenue += Number(o.valor_total) || Number(o.total) || 0;
        }
        if (o.status === 'entregue' || o.status === 'finalizado') {
          deliveredCount++;
        } else if (o.status === 'cancelado') {
          cancelledCount++;
        }
      }

      return res.json({
        success: true,
        totalOrders: orders.length,
        revenue,
        averageTicket: orders.length > 0 ? revenue / orders.length : 0,
        deliveredCount,
        cancelledCount
      });
    } catch (error: any) {
      console.error('Error fetching metrics:', error);
      return res.status(500).json({ error: 'Erro ao carregar métricas.' });
    }
  });

  // 3. KPIs
  router.get('/kpis', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);

      let activeTotal = 0;
      let cancelledTotal = 0;

      for (const o of orders) {
        const val = Number(o.valor_total) || Number(o.total) || 0;
        if (o.status !== 'cancelado') {
          activeTotal += val;
        } else {
          cancelledTotal += val;
        }
      }

      return res.json({
        success: true,
        kpis: {
          totalOrders: orders.length,
          activeRevenue: activeTotal,
          cancelledRevenue: cancelledTotal,
          ticketMedio: orders.length > 0 ? activeTotal / orders.length : 0
        }
      });
    } catch (error: any) {
      console.error('Error fetching KPIs:', error);
      return res.status(500).json({ error: 'Erro ao carregar KPIs.' });
    }
  });

  // 4. Vendas por Período
  router.get('/sales-by-period', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);
      const salesMap: Record<string, { count: number; revenue: number }> = {};

      for (const o of orders) {
        if (o.status === 'cancelado') continue;
        
        let dateKey = 'Sem Data';
        if (o.data_criacao) {
          const dateObj = new Date(o.data_criacao);
          if (!isNaN(dateObj.getTime())) {
            dateKey = dateObj.toISOString().split('T')[0];
          }
        }

        const amt = Number(o.valor_total) || Number(o.total) || 0;
        if (!salesMap[dateKey]) {
          salesMap[dateKey] = { count: 0, revenue: 0 };
        }
        salesMap[dateKey].count++;
        salesMap[dateKey].revenue += amt;
      }

      const salesByPeriod = Object.entries(salesMap).map(([date, data]) => ({
        date,
        ...data
      })).sort((a, b) => a.date.localeCompare(b.date));

      return res.json({
        success: true,
        salesByPeriod
      });
    } catch (error: any) {
      console.error('Error fetching sales by period:', error);
      return res.status(500).json({ error: 'Erro ao buscar vendas por período.' });
    }
  });

  // 5. Formas de Pagamento
  router.get('/payment-methods', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);
      const methodsMap: Record<string, { count: number; total: number }> = {};

      for (const o of orders) {
        if (o.status === 'cancelado') continue;

        const method = o.forma_pagamento || o.paymentMethod || 'não especificado';
        const value = Number(o.valor_total) || Number(o.total) || 0;

        if (!methodsMap[method]) {
          methodsMap[method] = { count: 0, total: 0 };
        }
        methodsMap[method].count++;
        methodsMap[method].total += value;
      }

      return res.json({
        success: true,
        paymentMethods: Object.entries(methodsMap).map(([method, data]) => ({
          method,
          ...data
        }))
      });
    } catch (error: any) {
      console.error('Error fetching payment methods report:', error);
      return res.status(500).json({ error: 'Erro ao buscar formas de pagamento.' });
    }
  });

  // 6. Produtos Vendidos
  router.get('/sold-products', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);
      const productsMap: Record<string, { nome: string; quantidade: number; receita: number }> = {};

      for (const o of orders) {
        if (o.status === 'cancelado') continue;

        const items = o.items || o.produtos || o.itens || [];
        for (const item of items) {
          const pId = item.id || item.produtoId || item.productId || 'desconhecido';
          const pNome = item.nome || item.name || 'Produto Desconhecido';
          const qty = Number(item.quantidade || item.quantity) || 1;
          const price = Number(item.preco || item.price || item.valor) || 0;

          if (!productsMap[pId]) {
            productsMap[pId] = { nome: pNome, quantidade: 0, receita: 0 };
          }
          productsMap[pId].quantidade += qty;
          productsMap[pId].receita += price * qty;
        }
      }

      const soldProducts = Object.entries(productsMap).map(([id, data]) => ({
        productId: id,
        ...data
      })).sort((a, b) => b.quantidade - a.quantidade);

      return res.json({
        success: true,
        soldProducts
      });
    } catch (error: any) {
      console.error('Error fetching sold products:', error);
      return res.status(500).json({ error: 'Erro ao buscar produtos vendidos.' });
    }
  });

  // 7. Movimentações de Caixa
  router.get('/cash-movements', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      
      // Busca os últimos caixas e consolida movimentações de entrada/saída
      const caixasSnap = await db
        .collection('restaurants')
        .doc(restaurantId)
        .collection('caixas')
        .orderBy('openedAt', 'desc')
        .limit(5)
        .get();

      const listCaixas: any[] = [];
      
      for (const doc of caixasSnap.docs) {
        const cxData = doc.data();
        const movementsSnap = await db
          .collection('restaurants')
          .doc(restaurantId)
          .collection('caixas')
          .doc(doc.id)
          .collection('movimentacoes')
          .get();

        const movements = movementsSnap.docs.map(mDoc => ({ id: mDoc.id, ...mDoc.data() }));

        listCaixas.push({
          id: doc.id,
          ...cxData,
          movements
        });
      }

      return res.json({
        success: true,
        caixas: listCaixas
      });
    } catch (error: any) {
      console.error('Error fetching cash movements report:', error);
      return res.status(500).json({ error: 'Erro ao carregar movimentações de caixa.' });
    }
  });

  // 8. Indicadores Financeiros
  router.get('/financial-indicators', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);

      let faturamentoTotal = 0;
      let validOrdersCount = 0;

      for (const o of orders) {
        if (o.status !== 'cancelado') {
          const val = Number(o.valor_total) || Number(o.total) || 0;
          faturamentoTotal += val;
          validOrdersCount++;
        }
      }

      const ticketMedio = validOrdersCount > 0 ? faturamentoTotal / validOrdersCount : 0;

      const contasReceberSnap = await db
        .collection('restaurants')
        .doc(restaurantId)
        .collection('contasReceber')
        .get();

      const contasPagarSnap = await db
        .collection('restaurants')
        .doc(restaurantId)
        .collection('contasPagar')
        .get();

      let totalToReceive = 0;
      let totalToPay = 0;
      let receivedAmount = 0;
      let paidAmount = 0;

      contasReceberSnap.forEach(doc => {
        const d = doc.data();
        const status = String(d.status || '').toUpperCase();
        const remCents = Number(d.remainingAmount) || 0;
        const paidCents = Number(d.paidAmount || d.amountInCents || 0);

        const remVal = remCents > 0 && Number.isInteger(remCents) && remCents >= 100 ? remCents / 100 : Number(d.remainingAmount || 0);
        const paidVal = paidCents > 0 && Number.isInteger(paidCents) && paidCents >= 100 ? paidCents / 100 : Number(d.paidAmount || d.amount || 0);

        if (status === 'OPEN' || status === 'PARTIALLY_PAID') {
          totalToReceive += remVal;
        }
        if (status === 'PAID' || status === 'PARTIALLY_PAID' || status === 'RECEIVED') {
          receivedAmount += paidVal;
        }
      });

      contasPagarSnap.forEach(doc => {
        const d = doc.data();
        const status = String(d.status || '').toUpperCase();
        const remCents = Number(d.remainingAmount) || 0;
        const paidCents = Number(d.paidAmount || d.amountInCents || 0);

        const remVal = remCents > 0 && Number.isInteger(remCents) && remCents >= 100 ? remCents / 100 : Number(d.remainingAmount || 0);
        const paidVal = paidCents > 0 && Number.isInteger(paidCents) && paidCents >= 100 ? paidCents / 100 : Number(d.paidAmount || d.amount || 0);

        if (status === 'OPEN' || status === 'PARTIALLY_PAID') {
          totalToPay += remVal;
        }
        if (status === 'PAID' || status === 'PARTIALLY_PAID') {
          paidAmount += paidVal;
        }
      });

      const receitasPagas = receivedAmount > 0 ? receivedAmount : faturamentoTotal;
      const despesasPagas = paidAmount;
      const saldoPeriodo = receitasPagas - despesasPagas;

      return res.json({
        success: true,
        financialIndicators: {
          faturamentoTotal,
          faturamentoBruto: faturamentoTotal,
          validOrdersCount,
          totalOrdersCount: validOrdersCount,
          ticketMedio,
          receitasPagas,
          despesasPagas,
          saldoPeriodo,
          totalToReceive,
          totalToPay,
          receivedAmount,
          paidAmount,
          netProjection: totalToReceive - totalToPay
        }
      });
    } catch (error: any) {
      console.error('Error fetching financial indicators:', error);
      return res.status(500).json({ error: 'Erro ao carregar indicadores financeiros.' });
    }
  });

  // 9. Indicadores Operacionais
  router.get('/operational-indicators', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);

      let totalDeliveryTime = 0;
      let deliveryCount = 0;
      let totalRating = 0;
      let ratingCount = 0;

      for (const o of orders) {
        if (o.deliveryTimeMinutes) {
          totalDeliveryTime += Number(o.deliveryTimeMinutes);
          deliveryCount++;
        }
        if (o.rating) {
          totalRating += Number(o.rating);
          ratingCount++;
        }
      }

      return res.json({
        success: true,
        operationalIndicators: {
          averageDeliveryTimeMinutes: deliveryCount > 0 ? totalDeliveryTime / deliveryCount : 0,
          averageRating: ratingCount > 0 ? totalRating / ratingCount : 5,
          ratingCount
        }
      });
    } catch (error: any) {
      console.error('Error fetching operational indicators:', error);
      return res.status(500).json({ error: 'Erro ao carregar indicadores operacionais.' });
    }
  });

  // 10. Gráficos
  router.get('/charts', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);

      const daysOfWeek = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const dayOfWeekMap = Array(7).fill(0);
      const hourOfDayMap = Array(24).fill(0);

      for (const o of orders) {
        if (o.status === 'cancelado') continue;

        if (o.data_criacao) {
          const date = new Date(o.data_criacao);
          if (!isNaN(date.getTime())) {
            dayOfWeekMap[date.getDay()]++;
            hourOfDayMap[date.getHours()]++;
          }
        }
      }

      const ordersByDayOfWeek = daysOfWeek.map((day, idx) => ({
        day,
        count: dayOfWeekMap[idx]
      }));

      const ordersByHourOfDay = hourOfDayMap.map((count, hour) => ({
        hour: `${String(hour).padStart(2, '0')}:00`,
        count
      }));

      return res.json({
        success: true,
        charts: {
          ordersByDayOfWeek,
          ordersByHourOfDay
        }
      });
    } catch (error: any) {
      console.error('Error generating chart data:', error);
      return res.status(500).json({ error: 'Erro ao gerar dados dos gráficos.' });
    }
  });

  // 11. Consultas Estatísticas
  router.get('/stats', verifyRestaurant, async (req: any, res: any) => {
    try {
      const restaurantId = req.user.restaurantId;
      const { startDate, endDate } = req.query;

      const orders = await getFilteredOrders(restaurantId, startDate as string, endDate as string);

      const values = orders
        .filter(o => o.status !== 'cancelado')
        .map(o => Number(o.valor_total) || Number(o.total) || 0);

      const maxVal = values.length > 0 ? Math.max(...values) : 0;
      const minVal = values.length > 0 ? Math.min(...values) : 0;
      const sumVal = values.reduce((sum, v) => sum + v, 0);
      const avgVal = values.length > 0 ? sumVal / values.length : 0;

      return res.json({
        success: true,
        stats: {
          maxOrderValue: maxVal,
          minOrderValue: minVal,
          averageOrderValue: avgVal,
          totalRevenue: sumVal
        }
      });
    } catch (error: any) {
      console.error('Error performing statistical query:', error);
      return res.status(500).json({ error: 'Erro ao executar consulta estatística.' });
    }
  });

  return router;
}
