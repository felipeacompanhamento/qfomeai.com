import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingBag, XCircle, TrendingUp, DollarSign, BarChart3, Star, 
  AlertTriangle, Clock, ChevronUp, ChevronDown, Users, CheckCircle2, 
  ArrowDownRight, Timer, Calendar
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { dashboardService } from '../../services/dashboardService';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { cache } from '../../utils/cache';

export default function PerformanceDashboard({ orders: initialOrders }: { orders?: any[] }) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<any[]>(initialOrders || []);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'today' | 'yesterday' | '7days' | '30days'>('today');

  const [allProducts, setAllProducts] = useState<any[]>([]);
  const isFetching = useRef(false);

  useEffect(() => {
    if (!profile?.restaurantId) return;

    const fetchProducts = async () => {
      try {
        const q = query(collection(db, 'restaurants', profile.restaurantId, 'products'));
        const snapshot = await getDocs(q);
        setAllProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching products for performance:", error);
      }
    };
    fetchProducts();
  }, [profile?.restaurantId]);

  useEffect(() => {
    if (!profile?.restaurantId) return;

    const fetchReviews = async () => {
      try {
        const reviewsData = await dashboardService.getReviewsByRestaurantId(profile.restaurantId);
        setReviews(reviewsData);
      } catch (error) {
        console.error("Error loading reviews:", error);
      }
    };
    fetchReviews();
  }, [profile?.restaurantId]);

  useEffect(() => {
    if (!profile?.restaurantId) return;

    const loadData = async () => {
      if (isFetching.current) return;
      isFetching.current = true;
      setLoading(true);
      const now = new Date();
      let startDate = new Date();
      let endDate = new Date();
      
      if (filter === 'today') {
        startDate.setHours(0, 0, 0, 0);
      } else if (filter === 'yesterday') {
        startDate.setDate(now.getDate() - 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(now.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);
      } else if (filter === '7days') {
        startDate.setDate(now.getDate() - 7);
      } else if (filter === '30days') {
        startDate.setDate(now.getDate() - 30);
      }

      // Se temos pedidos iniciais, filtramos localmente para evitar nova query
      if (initialOrders) {
        const filtered = initialOrders.filter(o => {
          const orderDate = new Date(o.data_criacao);
          return orderDate >= startDate && orderDate <= endDate;
        });
        setOrders(filtered);
        setLoading(false);
        isFetching.current = false;
        return;
      }

      const cacheKey = `dashboard_orders_${profile.restaurantId}_${filter}`;
      const cached = cache.get(cacheKey);
      
      if (cached) {
        setOrders(cached);
        setLoading(false);
        isFetching.current = false;
      } else {
        try {
          const ordersData = await dashboardService.getOrdersByDateRange(profile.restaurantId, startDate, now);
          setOrders(ordersData);
          cache.set(cacheKey, ordersData, 30); // 30 seconds cache
        } catch (error) {
          console.error("Error loading performance data:", error);
        } finally {
          setLoading(false);
          isFetching.current = false;
        }
      }
    };

    loadData();
  }, [profile?.restaurantId, filter, initialOrders]);

  const metrics = useMemo(() => {
    const delivered = orders.filter(o => o.status === 'entregue' || o.status === 'finalizado');
    const totalFaturado = delivered.reduce((acc, o) => acc + (o.valor_total || 0), 0);
    const ticketMedio = delivered.length > 0 ? totalFaturado / delivered.length : 0;
    const cancelados = orders.filter(o => o.status === 'cancelado' || o.status === 'rejeitado');
    
    const statusCounts = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as any);

    const productSales: any = {};
    orders.forEach(o => {
      const orderItems = o.itens || o.items || o.produtos || [];
      orderItems.forEach((i: any) => {
        const key = i.produto_id || i.id || i.productId || i.nome;
        if (!productSales[key]) productSales[key] = { nome: i.nome || i.name || 'Produto Desconhecido', qtd: 0, receita: 0 };
        const quantidade = Number(i.quantidade || i.quantity) || 1;
        let receita = 0;
        if (i.valor !== undefined) {
          receita = Number(i.valor);
        } else if (i.preco !== undefined) {
          receita = Number(i.preco) * quantidade;
        } else if (i.price !== undefined) {
          receita = Number(i.price) * quantidade;
        }
        productSales[key].qtd += quantidade;
        productSales[key].receita += receita;
      });
    });
    const topProducts = Object.entries(productSales)
      .sort((a: any, b: any) => b[1].receita - a[1].receita)
      .slice(0, 10);

    const hourlyVolume = orders.reduce((acc, o) => {
      const hour = new Date(o.data_criacao).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as any);

    const avgRating = reviews.length > 0 ? reviews.reduce((acc, r) => acc + (r.nota || 0), 0) / reviews.length : 0;

    const sortedHourly = Object.entries(hourlyVolume)
      .map(([hour, count]) => ({ hour: parseInt(hour), count: count as number }))
      .sort((a: any, b: any) => b.count - a.count);

    // --- NOVOS INDICADORES ---

    // 1. Taxa de conversão de pedidos (concluídos / iniciados)
    const completedCount = orders.filter(o => ['entregue', 'finalizado'].includes(o.status)).length;
    const conversionRate = orders.length > 0 ? (completedCount / orders.length) * 100 : 0;

    // 4. Tempo médio de preparo (aceito -> finalizado)
    const prepTimes = orders
      .filter(o => o.data_aceite && o.data_finalizado)
      .map(o => (new Date(o.data_finalizado).getTime() - new Date(o.data_aceite).getTime()) / (1000 * 60));
    const avgPrepTime = prepTimes.length > 0 ? prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length : 0;

    // 5. Tempo total do pedido (criacao -> finalizado)
    const totalTimes = orders
      .filter(o => o.data_criacao && o.data_finalizado)
      .map(o => (new Date(o.data_finalizado).getTime() - new Date(o.data_criacao).getTime()) / (1000 * 60));
    const avgTotalTime = totalTimes.length > 0 ? totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length : 0;

    // Histórico de tempo total para gráfico
    const timeHistory = orders
      .filter(o => o.data_criacao && o.data_finalizado)
      .map(o => ({
        time: new Date(o.data_criacao).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: Math.round((new Date(o.data_finalizado).getTime() - new Date(o.data_criacao).getTime()) / (1000 * 60)),
        date: new Date(o.data_criacao).toLocaleDateString()
      }))
      .slice(-20); // Últimos 20 pedidos

    // 7. Produtos menos vendidos
    const productSalesCount: Record<string, number> = {};
    orders.forEach(o => {
      const orderItems = o.itens || o.items || o.produtos || [];
      orderItems.forEach((i: any) => {
        const name = i.nome || i.name || 'Produto Desconhecido';
        const quantidade = Number(i.quantidade || i.quantity) || 1;
        productSalesCount[name] = (productSalesCount[name] || 0) + quantidade;
      });
    });

    const bottomProducts = allProducts
      .map(p => ({
        nome: p.nome,
        qtd: productSalesCount[p.nome] || 0
      }))
      .sort((a, b) => a.qtd - b.qtd)
      .slice(0, 5);

    // 9. Clientes recorrentes
    const clientOrderCounts: Record<string, number> = {};
    orders.forEach(o => {
      if (o.cliente_id) {
        clientOrderCounts[o.cliente_id] = (clientOrderCounts[o.cliente_id] || 0) + 1;
      }
    });
    const totalClients = Object.keys(clientOrderCounts).length;
    const recurringClientsCount = Object.values(clientOrderCounts).filter(count => count > 1).length;
    const recurringPercent = totalClients > 0 ? (recurringClientsCount / totalClients) * 100 : 0;

    // 10. Faturamento por período (Histórico para gráfico)
    const revenueHistory: Record<string, number> = {};
    orders.forEach(o => {
      const dateKey = filter === 'today' || filter === 'yesterday' 
        ? new Date(o.data_criacao).getHours() + 'h'
        : new Date(o.data_criacao).toLocaleDateString();
      revenueHistory[dateKey] = (revenueHistory[dateKey] || 0) + (o.valor_total || 0);
    });

    const formattedRevenueHistory = Object.entries(revenueHistory).map(([name, value]) => ({ name, value }));

    return { 
      totalFaturado, 
      ticketMedio, 
      cancelados, 
      statusCounts, 
      topProducts, 
      hourlyVolume, 
      sortedHourly, 
      avgRating,
      conversionRate,
      avgPrepTime,
      avgTotalTime,
      timeHistory,
      bottomProducts,
      recurringClientsCount,
      recurringPercent,
      formattedRevenueHistory
    };
  }, [orders, reviews, allProducts, filter]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-stone-800">Dashboard de Desempenho</h2>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value as any)}
          className="p-2 rounded-xl border border-stone-200 bg-white"
        >
          <option value="today">Hoje</option>
          <option value="yesterday">Ontem</option>
          <option value="7days">Últimos 7 dias</option>
          <option value="30days">Últimos 30 dias</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center p-12">Carregando...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard label="Total de Pedidos" value={orders.length} icon={ShoppingBag} color="text-blue-600" />
            <StatCard label="Faturamento" value={`R$ ${metrics.totalFaturado.toFixed(2)}`} icon={DollarSign} color="text-emerald-600" />
            <StatCard label="Ticket Médio" value={`R$ ${metrics.ticketMedio.toFixed(2)}`} icon={TrendingUp} color="text-purple-600" />
            <StatCard label="Cancelados" value={`${metrics.cancelados.length} (${((metrics.cancelados.length / (orders.length || 1)) * 100).toFixed(1)}%)`} icon={XCircle} color="text-red-600" />
          </div>

          {/* NOVOS INDICADORES DE TOPO */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              label="Taxa de Conversão" 
              value={`${metrics.conversionRate.toFixed(1)}%`} 
              icon={CheckCircle2} 
              color="text-emerald-500" 
            />
            <StatCard 
              label="Tempo Médio Preparo" 
              value={`${Math.round(metrics.avgPrepTime)} min`} 
              icon={Timer} 
              color="text-orange-500" 
            />
            <StatCard 
              label="Clientes Recorrentes" 
              value={`${metrics.recurringClientsCount} (${metrics.recurringPercent.toFixed(1)}%)`} 
              icon={Users} 
              color="text-blue-500" 
            />
            <StatCard 
              label="Tempo Total Médio" 
              value={`${Math.round(metrics.avgTotalTime)} min`} 
              icon={Clock} 
              color="text-stone-600" 
            />
          </div>

          {/* GRÁFICO DE FATURAMENTO POR PERÍODO */}
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-500" /> Faturamento por Período
            </h3>
            <div className="w-full overflow-hidden" style={{ minHeight: 250 }}>
              {metrics.formattedRevenueHistory?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={metrics.formattedRevenueHistory}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                    <YAxis axisLine={false} tickLine={false} fontSize={12} tickFormatter={(value) => `R$${value}`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: any) => [`R$ ${value.toFixed(2)}`, 'Faturamento']}
                    />
                    <Area type="monotone" dataKey="value" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-stone-400 text-sm">
                  Nenhum faturamento registrado no período.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <h3 className="font-bold text-stone-800 mb-4">Status dos Pedidos</h3>
              <div className="space-y-2">
                {Object.entries(metrics.statusCounts).map(([status, count]: any) => (
                  <div key={status} className="flex justify-between">
                    <span className="capitalize text-stone-600">{status}</span>
                    <span className="font-bold text-stone-800">{count}</span>
                  </div>
                ))}
              </div>
              {metrics.statusCounts['em_preparo'] > 10 && <p className="text-red-500 text-xs mt-2 flex items-center gap-1"><AlertTriangle size={14}/> Cozinha lenta!</p>}
            </div>
            
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <h3 className="font-bold text-stone-800 mb-4">Produtos Mais Vendidos (Receita)</h3>
              <div className="space-y-2">
                {metrics.topProducts.map(([key, data]: any) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-stone-600">{data.nome} ({data.qtd})</span>
                    <span className="font-bold text-stone-800">R$ {data.receita.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* PRODUTOS MENOS VENDIDOS */}
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                <ArrowDownRight className="w-5 h-5 text-red-500" /> Produtos Menos Vendidos
              </h3>
              <div className="space-y-2">
                {metrics.bottomProducts.map((product: any) => (
                  <div key={product.nome} className="flex justify-between items-center p-2 hover:bg-stone-50 rounded-xl transition-colors">
                    <span className="text-stone-600 text-sm">{product.nome}</span>
                    <span className={`font-bold text-sm ${product.qtd === 0 ? 'text-red-500' : 'text-stone-800'}`}>
                      {product.qtd} vendas
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-stone-400 mt-4 italic">* Identifica produtos com baixa ou nenhuma saída no período selecionado.</p>
            </div>
          </div>

          {/* GRÁFICO DE TEMPO TOTAL DO PEDIDO */}
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
              <Timer className="w-5 h-5 text-purple-500" /> Histórico de Tempo Total do Pedido (min)
            </h3>
            <div className="w-full overflow-hidden" style={{ minHeight: 250 }}>
              {metrics.timeHistory?.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={metrics.timeHistory}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f5" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} fontSize={10} />
                    <YAxis axisLine={false} tickLine={false} fontSize={12} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(value: any) => [`${value} min`, 'Duração']}
                    />
                    <Line type="monotone" dataKey="duration" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-stone-400 text-sm">
                  Nenhum dado de tempo disponível para o período.
                </div>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-2 text-center">Tempo médio entre a criação do pedido e a entrega finalizada.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <h3 className="font-bold text-stone-800 mb-4">Horários de Pico</h3>
              <div className="space-y-2">
                {metrics.sortedHourly.map(({ hour, count }, index) => (
                  <div key={hour} className={`flex justify-between items-center ${index < 3 ? 'font-bold' : ''}`}>
                    <span className={index < 3 ? 'text-emerald-600' : 'text-stone-600'}>{hour}h - {hour + 1}h</span>
                    <div className="flex-1 mx-4 bg-stone-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${index < 3 ? 'bg-emerald-500' : 'bg-stone-300'}`} style={{ width: `${(count / (orders.length || 1)) * 100}%` }} />
                    </div>
                    <span className="text-stone-800">{count} pedidos</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <h3 className="font-bold text-stone-800 mb-4">Avaliações</h3>
              <div className="flex items-center gap-2 mb-4">
                <Star className="text-yellow-500 fill-yellow-500" />
                <span className="text-2xl font-bold">{metrics.avgRating.toFixed(1)}</span>
                <span className="text-stone-500">({reviews.length} avaliações)</span>
              </div>
              <div className="space-y-4 max-h-60 overflow-y-auto">
                {reviews.map((review: any) => (
                  <div key={review.id} className="border-b border-stone-100 pb-2">
                    <div className="flex justify-between">
                      <span className="font-bold text-stone-800">{review.nome_cliente}</span>
                      <span className="text-stone-500 text-sm">{new Date(review.data).toLocaleDateString()}</span>
                    </div>
                    <p className="text-stone-600 text-sm">{review.comentario}</p>
                    <div className="flex items-center text-yellow-500">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < review.nota ? 'fill-yellow-500' : 'text-stone-300'}`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
      <div className={`mb-4 ${color}`}>
        <Icon className="w-8 h-8" />
      </div>
      <p className="text-stone-500 font-bold text-sm uppercase tracking-wider">{label}</p>
      <h3 className="text-2xl font-bold text-stone-800 mt-1">{value}</h3>
    </div>
  );
}
