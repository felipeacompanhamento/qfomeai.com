import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Wallet, Receipt, 
  CreditCard, Calendar, ArrowUpRight, ArrowDownRight,
  PieChart, FileText, ShoppingBag, Award, AlertCircle, RefreshCw
} from 'lucide-react';
import { auth } from '../../../firebase';
import { useAuth } from '../../../contexts/AuthContext';
import { formatCurrency } from '../../../utils/currencyUtils';
import { LoadingState } from '../../../components/ui/Feedback';
import { Select } from '../../../components/ui/InputComponents';
import { SecondaryButton } from '../../../components/ui/FormComponents';

interface VisaoFinanceiraProps {
  onSelectTab?: (tabId: string) => void;
}

export default function VisaoFinanceiraTab({ onSelectTab }: VisaoFinanceiraProps) {
  const { profile, user } = useAuth();
  const restaurantId = profile?.restaurantId || profile?.uid || user?.uid || null;

  const [period, setPeriod] = useState<'today' | 'yesterday' | '7days' | '30days' | 'month'>('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculated Metrics from canonical backend source
  const [faturamentoTotal, setFaturamentoTotal] = useState(0);
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [ticketMedio, setTicketMedio] = useState(0);
  const [receitasPagas, setReceitasPagas] = useState(0);
  const [despesasPagas, setDespesasPagas] = useState(0);
  const [saldoPeriodo, setSaldoPeriodo] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchFinancialData = async () => {
      if (!restaurantId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const now = new Date();
        let startDate = new Date();
        let endDate = new Date();

        if (period === 'today') {
          startDate.setHours(0, 0, 0, 0);
        } else if (period === 'yesterday') {
          startDate.setDate(now.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
          endDate.setDate(now.getDate() - 1);
          endDate.setHours(23, 59, 59, 999);
        } else if (period === '7days') {
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
        } else if (period === '30days') {
          startDate.setDate(now.getDate() - 30);
          startDate.setHours(0, 0, 0, 0);
        } else if (period === 'month') {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error('Usuário não autenticado.');
        }

        const queryParams = new URLSearchParams({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });

        const response = await fetch(`/api/restaurant/reports/financial-indicators?${queryParams.toString()}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Erro ao carregar indicadores financeiros.');
        }

        const data = await response.json();
        if (!data.success || !data.financialIndicators) {
          throw new Error(data.error || 'Resposta inválida do servidor.');
        }

        if (isMounted) {
          const fi = data.financialIndicators;
          setFaturamentoTotal(fi.faturamentoTotal || fi.faturamentoBruto || 0);
          setTotalOrdersCount(fi.validOrdersCount || fi.totalOrdersCount || 0);
          setTicketMedio(fi.ticketMedio || 0);
          setReceitasPagas(fi.receitasPagas || 0);
          setDespesasPagas(fi.despesasPagas || 0);
          setSaldoPeriodo(fi.saldoPeriodo || 0);
        }
      } catch (err: any) {
        console.error('Erro ao carregar dados da visão financeira:', err);
        if (isMounted) {
          setError(err.message || 'Erro ao carregar os dados financeiros do servidor.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchFinancialData();

    return () => {
      isMounted = false;
    };
  }, [restaurantId, period]);

  const cardsNav = [
    {
      id: 'caixa',
      title: 'Caixa Diário',
      description: 'Abertura, fechamento, suprimentos e sangrias.',
      icon: Wallet,
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/80',
    },
    {
      id: 'receber',
      title: 'Contas a Receber',
      description: 'Vendas a prazo, cartões, PIX e entradas futuras.',
      icon: TrendingUp,
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/80',
    },
    {
      id: 'pagar',
      title: 'Contas a Pagar',
      description: 'Controle de despesas, fornecedores e boletos.',
      icon: CreditCard,
      color: 'bg-rose-50 text-rose-800 border-rose-200/80 hover:bg-rose-100/80',
    },
    {
      id: 'faturas',
      title: 'Faturas QFomeAI',
      description: 'Mensalidade da plataforma e cobranças.',
      icon: FileText,
      color: 'bg-amber-50 text-amber-800 border-amber-200/80 hover:bg-amber-100/80',
    },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* Header with period filter */}
      <div className="bg-white p-5 rounded-3xl border border-stone-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-stone-850">Visão Financeira Geral</h2>
          <p className="text-stone-500 text-xs sm:text-sm mt-0.5">Resumo de vendas, receitas, despesas e fluxo de caixa.</p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Calendar className="w-4 h-4 text-stone-400 shrink-0" />
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="w-full md:w-auto min-w-[160px]"
          >
            <option value="today">Hoje</option>
            <option value="yesterday">Ontem</option>
            <option value="7days">Últimos 7 dias</option>
            <option value="30days">Últimos 30 dias</option>
            <option value="month">Este Mês</option>
          </Select>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-2xl flex items-center justify-between text-xs font-bold shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <SecondaryButton
            onClick={() => setPeriod((prev) => prev)}
            className="text-xs py-1 px-3"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1 inline" />
            Tentar novamente
          </SecondaryButton>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-3xl border border-stone-200/80 p-12">
          <LoadingState message="Carregando indicadores financeiros..." />
        </div>
      ) : (
        <>
          {/* Main Financial KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-400 block">Faturamento</span>
              <p className="text-lg sm:text-xl font-black text-stone-900">
                {formatCurrency(faturamentoTotal)}
              </p>
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> Vendas válidas
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-400 block">Total Pedidos</span>
              <p className="text-lg sm:text-xl font-black text-stone-900">{totalOrdersCount}</p>
              <span className="text-xs text-stone-500 font-medium block">Pedidos concluídos</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-400 block">Ticket Médio</span>
              <p className="text-lg sm:text-xl font-black text-stone-900">{formatCurrency(ticketMedio)}</p>
              <span className="text-xs text-stone-500 font-medium block">Por pedido</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 block">Receitas</span>
              <p className="text-lg sm:text-xl font-black text-emerald-700">{formatCurrency(receitasPagas)}</p>
              <span className="text-xs text-emerald-600 font-medium block">Entradas confirmadas</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-500 block">Despesas</span>
              <p className="text-lg sm:text-xl font-black text-rose-600">{formatCurrency(despesasPagas)}</p>
              <span className="text-xs text-rose-500 font-medium block">Saídas registradas</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-400 block">Saldo Geral</span>
              <p className={`text-lg sm:text-xl font-black ${saldoPeriodo >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {formatCurrency(saldoPeriodo)}
              </p>
              <span className="text-xs text-stone-500 font-medium block">Receitas - Despesas</span>
            </div>
          </div>

          {/* Direct Navigation Cards */}
          <div>
            <h3 className="text-xs font-extrabold text-stone-400 uppercase tracking-wider mb-3">Módulos Financeiros</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {cardsNav.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.id}
                    onClick={() => onSelectTab && onSelectTab(card.id)}
                    className={`p-5 rounded-2xl border ${card.color} transition-all cursor-pointer shadow-xs hover:shadow-sm space-y-3 flex flex-col justify-between active:scale-[0.99]`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-white shadow-xs">
                        <Icon className="w-5 h-5" />
                      </div>
                      <ArrowUpRight className="w-4 h-4 opacity-50" />
                    </div>

                    <div>
                      <h4 className="font-extrabold text-sm sm:text-base">{card.title}</h4>
                      <p className="text-xs opacity-80 mt-1 leading-relaxed">{card.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
