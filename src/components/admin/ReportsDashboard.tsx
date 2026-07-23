import React, { useState } from 'react';
import { ReportFilters } from './ReportFilters';
import { ReportsCharts } from './ReportsCharts';
import { getPedidosFiltrados, clearReportCache, OrderReportFilters } from '../../services/orderReportService';
import { 
  calcularResumoFinanceiro, 
  calcularTotalPedidos, 
  calcularTicketMedio,
  calcularRankingRestaurantes,
  calcularProdutosMaisVendidos,
  OrderData
} from '../../utils/kpiCalculator';

export const ReportsDashboard: React.FC = () => {
  const [pedidos, setPedidos] = useState<OrderData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFilters, setLastFilters] = useState<OrderReportFilters | null>(null);

  // Função que será chamada ao aplicar os filtros no componente ReportFilters
  const handleApplyFilters = async (filtros: OrderReportFilters) => {
    setIsLoading(true);
    setError(null);
    setLastFilters(filtros);

    try {
      // 1. Integração com o Service: Busca os pedidos no Firestore
      const dados = await getPedidosFiltrados(filtros);
      setPedidos(dados);
    } catch (err: any) {
      console.error("Erro ao buscar relatórios:", err);
      setError("Ocorreu um erro ao buscar os dados. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearCacheAndRefresh = () => {
    clearReportCache();
    if (lastFilters) {
      handleApplyFilters(lastFilters);
    }
  };

  // 2. Cálculo dos KPIs usando as funções puras criadas anteriormente
  // A taxa do marketplace pode vir de uma configuração global, aqui usamos 10% como exemplo
  const TAXA_MARKETPLACE = 10; 
  
  const resumoFinanceiro = calcularResumoFinanceiro(pedidos, TAXA_MARKETPLACE);
  const totalPedidos = calcularTotalPedidos(pedidos);
  const ticketMedio = calcularTicketMedio(pedidos);
  const topRestaurantes = calcularRankingRestaurantes(pedidos);
  const topProdutos = calcularProdutosMaisVendidos(pedidos);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-stone-800">Dashboard de Relatórios</h1>
        {pedidos.length > 0 && (
          <button 
            onClick={handleClearCacheAndRefresh}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading ? 'Atualizando...' : 'Limpar Cache e Atualizar'}
          </button>
        )}
      </div>

      {/* 3. Componente de Filtros */}
      <ReportFilters 
        onApplyFilters={handleApplyFilters} 
        isLoading={isLoading} 
        // restaurantes={listaDeRestaurantes} // Passe a lista de restaurantes se tiver
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl mb-6">
          {error}
        </div>
      )}

      {/* 4. Exibição dos KPIs (Só mostra se houver pedidos) */}
      {pedidos.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <KpiCard title="Total de Pedidos" value={totalPedidos.toString()} />
            <KpiCard title="Faturamento Total" value={`R$ ${resumoFinanceiro.faturamentoTotal.toFixed(2)}`} />
            <KpiCard title="Ticket Médio" value={`R$ ${ticketMedio.toFixed(2)}`} />
          </div>

          {/* Gráficos */}
          <ReportsCharts pedidos={pedidos} />

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <h3 className="text-lg font-bold text-stone-800 mb-4">Top 5 Restaurantes</h3>
              <ul className="space-y-3">
                {topRestaurantes.map((rest, index) => (
                  <li key={rest.restaurantId} className="flex justify-between items-center p-3 bg-stone-50 rounded-xl">
                    <span className="font-medium text-stone-700">{index + 1}. {rest.nome || `Restaurante ${rest.restaurantId}`}</span>
                    <span className="text-emerald-600 font-bold">R$ {rest.faturamento.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
              <h3 className="text-lg font-bold text-stone-800 mb-4">Top 10 Produtos</h3>
              <ul className="space-y-3">
                {topProdutos.map((prod, index) => (
                  <li key={prod.produtoId} className="flex justify-between items-center p-3 bg-stone-50 rounded-xl">
                    <div className="flex flex-col">
                      <span className="font-medium text-stone-700">{index + 1}. {prod.nome} ({prod.quantidadeVendida}x)</span>
                      {prod.restauranteNome && (
                        <span className="text-xs text-stone-500 font-medium">{prod.restauranteNome}</span>
                      )}
                    </div>
                    <span className="text-blue-600 font-bold">R$ {prod.receitaTotal.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      ) : (
        !isLoading && (
          <div className="text-center p-12 bg-stone-50 rounded-3xl border border-stone-200 text-stone-500">
            Selecione um período e clique em "Gerar Relatório" para visualizar os dados.
          </div>
        )
      )}
    </div>
  );
};

// Componente auxiliar para os cards de KPI
const KpiCard = ({ title, value }: { title: string, value: string }) => (
  <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-center">
    <h4 className="text-sm font-medium text-stone-500 mb-2">{title}</h4>
    <p className="text-2xl font-bold text-stone-800">{value}</p>
  </div>
);
