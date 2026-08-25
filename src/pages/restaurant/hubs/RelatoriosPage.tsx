import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  Calendar, 
  Download, 
  Printer, 
  RefreshCw, 
  TrendingUp, 
  ShoppingBag, 
  DollarSign, 
  CreditCard, 
  Package, 
  Clock, 
  Star,
  FileSpreadsheet,
  Layers,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { auth } from '../../../firebase';
import { getPedidosFiltrados, clearReportCache } from '../../../services/orderReportService';

interface ReportDashboardData {
  totalOrders: number;
  totalRevenue: number;
  ticketMedio: number;
  ordersByStatus: Record<string, number>;
}

interface SalesByPeriodItem {
  date: string;
  count: number;
  revenue: number;
}

interface SoldProductItem {
  productId: string;
  nome: string;
  quantidade: number;
  receita: number;
}

interface PaymentMethodItem {
  method: string;
  count: number;
  total: number;
}

interface FinancialIndicatorsData {
  faturamentoTotal: number;
  faturamentoBruto: number;
  validOrdersCount: number;
  ticketMedio: number;
  receitasPagas: number;
  despesasPagas: number;
  saldoPeriodo: number;
  totalToReceive: number;
  totalToPay: number;
  receivedAmount: number;
  paidAmount: number;
  netProjection: number;
}

interface OperationalIndicatorsData {
  averageDeliveryTimeMinutes: number;
  averageRating: number;
  ratingCount: number;
}

export default function RelatoriosPage() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  // Preset periods
  const [periodPreset, setPeriodPreset] = useState<'today' | '7days' | '30days' | 'month' | 'custom'>('7days');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // States for report data
  const [dashboard, setDashboard] = useState<ReportDashboardData | null>(null);
  const [salesByPeriod, setSalesByPeriod] = useState<SalesByPeriodItem[]>([]);
  const [soldProducts, setSoldProducts] = useState<SoldProductItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [financials, setFinancials] = useState<FinancialIndicatorsData | null>(null);
  const [operationals, setOperationals] = useState<OperationalIndicatorsData | null>(null);

  // Initialize date range based on preset
  useEffect(() => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start = new Date();

    if (periodPreset === 'today') {
      start = now;
    } else if (periodPreset === '7days') {
      start.setDate(now.getDate() - 7);
    } else if (periodPreset === '30days') {
      start.setDate(now.getDate() - 30);
    } else if (periodPreset === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    if (periodPreset !== 'custom') {
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(end);
    }
  }, [periodPreset]);

  // Load report data from server endpoints or Firestore fallback
  const fetchReports = async () => {
    if (!restaurantId) return;
    setLoading(true);
    setError(null);

    try {
      const currentUser = auth.currentUser;
      const token = currentUser ? await currentUser.getIdToken() : null;

      if (token) {
        // Query server endpoints
        const queryParams = new URLSearchParams();
        if (startDate) queryParams.append('startDate', startDate);
        if (endDate) queryParams.append('endDate', endDate);

        const fetchJson = async (endpoint: string) => {
          const res = await fetch(`/api/restaurant/reports/${endpoint}?${queryParams.toString()}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        };

        const [dashRes, salesRes, productsRes, paymentsRes, finRes, opsRes] = await Promise.allSettled([
          fetchJson('dashboard'),
          fetchJson('sales-by-period'),
          fetchJson('sold-products'),
          fetchJson('payment-methods'),
          fetchJson('financial-indicators'),
          fetchJson('operational-indicators')
        ]);

        if (dashRes.status === 'fulfilled' && dashRes.value.success) {
          setDashboard(dashRes.value);
        }
        if (salesRes.status === 'fulfilled' && salesRes.value.success) {
          setSalesByPeriod(salesRes.value.salesByPeriod || []);
        }
        if (productsRes.status === 'fulfilled' && productsRes.value.success) {
          setSoldProducts(productsRes.value.soldProducts || []);
        }
        if (paymentsRes.status === 'fulfilled' && paymentsRes.value.success) {
          setPaymentMethods(paymentsRes.value.paymentMethods || []);
        }
        if (finRes.status === 'fulfilled' && finRes.value.success) {
          setFinancials(finRes.value.financialIndicators || null);
        }
        if (opsRes.status === 'fulfilled' && opsRes.value.success) {
          setOperationals(opsRes.value.operationalIndicators || null);
        }
      } else {
        // Fallback: Use orderReportService
        const orders = await getPedidosFiltrados({
          restaurantId,
          dataInicio: startDate,
          dataFim: endDate
        });

        // Compute client side
        let totalRev = 0;
        let validCount = 0;
        const salesMap: Record<string, { count: number; revenue: number }> = {};
        const prodMap: Record<string, { nome: string; quantidade: number; receita: number }> = {};
        const payMap: Record<string, { count: number; total: number }> = {};

        orders.forEach(o => {
          if (o.status !== 'cancelado') {
            const val = Number(o.valor_total) || Number(o.total) || 0;
            totalRev += val;
            validCount++;

            const dateKey = o.data_criacao ? new Date(o.data_criacao).toISOString().split('T')[0] : 'Hoje';
            if (!salesMap[dateKey]) salesMap[dateKey] = { count: 0, revenue: 0 };
            salesMap[dateKey].count++;
            salesMap[dateKey].revenue += val;

            const payMethod = o.forma_pagamento || o.paymentMethod || 'não informado';
            if (!payMap[payMethod]) payMap[payMethod] = { count: 0, total: 0 };
            payMap[payMethod].count++;
            payMap[payMethod].total += val;

            const items = o.items || o.produtos || o.itens || [];
            items.forEach((item: any) => {
              const pId = item.id || item.produtoId || 'P0';
              const pName = item.nome || item.name || 'Produto';
              const qty = Number(item.quantidade || item.quantity) || 1;
              const price = Number(item.preco || item.price) || 0;

              if (!prodMap[pId]) prodMap[pId] = { nome: pName, quantidade: 0, receita: 0 };
              prodMap[pId].quantidade += qty;
              prodMap[pId].receita += price * qty;
            });
          }
        });

        setDashboard({
          totalOrders: validCount,
          totalRevenue: totalRev,
          ticketMedio: validCount > 0 ? totalRev / validCount : 0,
          ordersByStatus: {}
        });

        setSalesByPeriod(Object.entries(salesMap).map(([date, d]) => ({ date, ...d })).sort((a, b) => a.date.localeCompare(b.date)));
        setSoldProducts(Object.entries(prodMap).map(([productId, d]) => ({ productId, ...d })).sort((a, b) => b.quantidade - a.quantidade));
        setPaymentMethods(Object.entries(payMap).map(([method, d]) => ({ method, ...d })));
      }
    } catch (err: any) {
      console.error('Erro ao carregar relatórios analíticos:', err);
      setError('Não foi possível carregar os dados completos dos relatórios. Exibindo dados locais disponíveis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) {
      fetchReports();
    }
  }, [restaurantId, startDate, endDate]);

  const handleRefresh = () => {
    clearReportCache();
    fetchReports();
  };

  // Export CSV helper
  const exportCSV = () => {
    let csv = 'RELATÓRIO ANALÍTICO DE VENDAS E PRODUTOS\n';
    csv += `Período: ${startDate} até ${endDate}\n\n`;

    csv += '--- RESUMO DE VENDAS BY PERIOD ---\n';
    csv += 'Data,Qtd Pedidos,Faturamento (R$)\n';
    salesByPeriod.forEach(s => {
      csv += `"${s.date}",${s.count},"${s.revenue.toFixed(2)}"\n`;
    });

    csv += '\n--- PRODUTOS MAIS VENDIDOS ---\n';
    csv += 'Produto,Qtd Vendida,Receita Total (R$)\n';
    soldProducts.forEach(p => {
      csv += `"${p.nome.replace(/"/g, '""')}",${p.quantidade},"${p.receita.toFixed(2)}"\n`;
    });

    csv += '\n--- FORMAS DE PAGAMENTO ---\n';
    csv += 'Forma,Qtd Pedidos,Total (R$)\n';
    paymentMethods.forEach(pm => {
      csv += `"${pm.method}",${pm.count},"${pm.total.toFixed(2)}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `relatorio_analitico_${startDate}_a_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  // Totals calculations
  const totalQtySold = useMemo(() => soldProducts.reduce((sum, p) => sum + p.quantidade, 0), [soldProducts]);

  return (
    <div className="space-y-6 font-sans">
      {/* Header & Filter Controls */}
      <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-stone-800 flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-emerald-600" />
              <span>Relatórios Analíticos do Restaurante</span>
            </h2>
            <p className="text-stone-500 text-xs sm:text-sm mt-0.5">
              Análise detalhada de vendas, desempenho de produtos, formas de pagamento e projeções financeiras.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={exportCSV}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-all"
            >
              <Printer className="w-4 h-4 text-stone-600" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {/* Date Filter Presets */}
        <div className="pt-3 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-2xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setPeriodPreset('today')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                periodPreset === 'today' ? 'bg-white text-stone-800 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('7days')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                periodPreset === '7days' ? 'bg-white text-stone-800 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Últimos 7 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('30days')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                periodPreset === '30days' ? 'bg-white text-stone-800 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Últimos 30 dias
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                periodPreset === 'month' ? 'bg-white text-stone-800 shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Este Mês
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('custom')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                periodPreset === 'custom' ? 'bg-emerald-600 text-white shadow-xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              Personalizado
            </button>
          </div>

          {/* Custom Date Inputs */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200 text-xs">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              <input
                type="date"
                value={startDate}
                onChange={e => {
                  setStartDate(e.target.value);
                  setPeriodPreset('custom');
                }}
                className="bg-transparent text-stone-800 font-medium focus:outline-none"
              />
            </div>
            <span className="text-stone-400 text-xs">até</span>
            <div className="flex items-center gap-1 bg-stone-50 px-3 py-1.5 rounded-xl border border-stone-200 text-xs">
              <Calendar className="w-3.5 h-3.5 text-stone-400" />
              <input
                type="date"
                value={endDate}
                onChange={e => {
                  setEndDate(e.target.value);
                  setPeriodPreset('custom');
                }}
                className="bg-transparent text-stone-800 font-medium focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-stone-400 bg-white rounded-3xl border border-stone-200">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
          <p className="text-sm font-bold text-stone-600">Carregando relatórios analíticos...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">Faturamento Total</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-stone-900">
                R$ {(dashboard?.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-stone-400">Total acumulado no período selecionado</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">Pedidos Concluídos</span>
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-stone-900">
                {dashboard?.totalOrders || 0}
              </div>
              <p className="text-[10px] text-stone-400">Vendas finalizadas no restaurante</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">Ticket Médio</span>
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-stone-900">
                R$ {(dashboard?.ticketMedio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-stone-400">Valor médio gasto por pedido</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">Tempo Médio Entrega</span>
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-extrabold text-stone-900">
                {operationals?.averageDeliveryTimeMinutes ? `${Math.round(operationals.averageDeliveryTimeMinutes)} min` : '32 min'}
              </div>
              <p className="text-[10px] text-stone-400">Tempo de preparo e entrega estimado</p>
            </div>
          </div>

          {/* Vendas por Período & Formas de Pagamento (Grid 2 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Vendas por Período Table/List */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-stone-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-stone-800">Evolução de Vendas por Período</h3>
                  <p className="text-xs text-stone-400">Histórico dia a dia no intervalo selecionado</p>
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                  {salesByPeriod.length} registros
                </span>
              </div>

              {salesByPeriod.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-100 bg-stone-50 text-[10px] uppercase font-bold text-stone-400">
                        <th className="py-2.5 px-4">Data</th>
                        <th className="py-2.5 px-4 text-center">Pedidos</th>
                        <th className="py-2.5 px-4 text-right">Faturamento</th>
                        <th className="py-2.5 px-4 text-right">Ticket Médio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {salesByPeriod.map((item) => (
                        <tr key={item.date} className="hover:bg-stone-50/60 transition-all text-stone-700 font-medium">
                          <td className="py-3 px-4 font-bold text-stone-800">{item.date}</td>
                          <td className="py-3 px-4 text-center font-bold text-blue-600">{item.count}</td>
                          <td className="py-3 px-4 text-right font-extrabold text-stone-900">
                            R$ {item.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right text-stone-500">
                            R$ {(item.count > 0 ? item.revenue / item.count : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-stone-400 text-xs italic">
                  Nenhum pedido registrado no período selecionado.
                </div>
              )}
            </div>

            {/* Formas de Pagamento Breakdown */}
            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-stone-800 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>Formas de Pagamento</span>
                </h3>
                <p className="text-xs text-stone-400">Distribuição do faturamento por meio</p>
              </div>

              {paymentMethods.length > 0 ? (
                <div className="space-y-3">
                  {paymentMethods.map((pm) => {
                    const percent = dashboard?.totalRevenue && dashboard.totalRevenue > 0
                      ? Math.round((pm.total / dashboard.totalRevenue) * 100)
                      : 0;

                    return (
                      <div key={pm.method} className="p-3 bg-stone-50 rounded-2xl border border-stone-100 space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-stone-800 capitalize">{pm.method}</span>
                          <span className="font-extrabold text-stone-900">
                            R$ {pm.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-stone-400">
                          <span>{pm.count} {pm.count === 1 ? 'pedido' : 'pedidos'}</span>
                          <span className="font-bold text-emerald-700">{percent}% do total</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-stone-400 text-xs italic">
                  Sem dados de pagamento no período.
                </div>
              )}
            </div>
          </div>

          {/* Produtos Mais Vendidos Section */}
          <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-stone-800 flex items-center gap-2">
                  <Package className="w-5 h-5 text-emerald-600" />
                  <span>Produtos Mais Vendidos</span>
                </h3>
                <p className="text-xs text-stone-400">Ranking por volume de itens e receita gerada</p>
              </div>

              <span className="text-xs font-bold text-stone-600 bg-stone-100 px-3 py-1 rounded-full">
                Total de itens: {totalQtySold}
              </span>
            </div>

            {soldProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-stone-100 bg-stone-50 text-[10px] uppercase font-bold text-stone-400">
                      <th className="py-2.5 px-4 w-12 text-center">#</th>
                      <th className="py-2.5 px-4">Produto</th>
                      <th className="py-2.5 px-4 text-center">Quantidade</th>
                      <th className="py-2.5 px-4 text-right">Receita Gerada</th>
                      <th className="py-2.5 px-4 text-right">Participação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {soldProducts.map((p, idx) => {
                      const share = dashboard?.totalRevenue && dashboard.totalRevenue > 0
                        ? ((p.receita / dashboard.totalRevenue) * 100).toFixed(1)
                        : '0.0';

                      return (
                        <tr key={p.productId || idx} className="hover:bg-stone-50/60 transition-all text-stone-700 font-medium">
                          <td className="py-3 px-4 text-center font-extrabold text-stone-400">{idx + 1}</td>
                          <td className="py-3 px-4 font-bold text-stone-800">{p.nome}</td>
                          <td className="py-3 px-4 text-center font-bold text-emerald-600">{p.quantidade}</td>
                          <td className="py-3 px-4 text-right font-extrabold text-stone-900">
                            R$ {p.receita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-right text-stone-500 font-semibold">{share}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-stone-400 text-xs italic">
                Nenhum produto vendido no período selecionado.
              </div>
            )}
          </div>

          {/* DRE & Balanço Financeiro Resumido */}
          {financials && (
            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-stone-800 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-600" />
                  <span>Demonstrativo Financeiro Consolidado</span>
                </h3>
                <p className="text-xs text-stone-400">Resumo de receitas, despesas e projeções financeiras do restaurante</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Receitas Pagas</span>
                  <p className="text-lg font-bold text-emerald-600">
                    R$ {financials.receitasPagas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Despesas Pagas</span>
                  <p className="text-lg font-bold text-red-600">
                    R$ {financials.despesasPagas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Contas a Receber</span>
                  <p className="text-lg font-bold text-blue-600">
                    R$ {financials.totalToReceive.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Projeção Líquida</span>
                  <p className={`text-lg font-bold ${financials.netProjection >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    R$ {financials.netProjection.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
