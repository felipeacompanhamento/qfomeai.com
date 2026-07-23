import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { agruparPedidosPorDia, agruparPedidosPorHora } from '../../utils/chartDataFormatter';
import { OrderData } from '../../utils/kpiCalculator';

// Registrando os componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ReportsChartsProps {
  pedidos: OrderData[];
}

export const ReportsCharts: React.FC<ReportsChartsProps> = ({ pedidos }) => {
  // Agrupa os dados apenas quando a lista de pedidos mudar
  const dadosDiarios = useMemo(() => agruparPedidosPorDia(pedidos), [pedidos]);
  const dadosHorarios = useMemo(() => agruparPedidosPorHora(pedidos), [pedidos]);

  // Formatar rótulos do eixo X (ex: de "2023-10-25" para "25/10")
  const labels = dadosDiarios.map(d => {
    const [ano, mes, dia] = d.date.split('-');
    return `${dia}/${mes}`;
  });

  // Configuração do Gráfico de Barras (Pedidos por Dia)
  const dadosPedidos = {
    labels,
    datasets: [
      {
        label: 'Quantidade de Pedidos',
        data: dadosDiarios.map(d => d.totalPedidos),
        backgroundColor: 'rgba(16, 185, 129, 0.8)', // emerald-500
        borderRadius: 4,
      },
    ],
  };

  // Configuração do Gráfico de Linha (Faturamento por Dia)
  const dadosFaturamento = {
    labels,
    datasets: [
      {
        label: 'Faturamento (R$)',
        data: dadosDiarios.map(d => d.faturamento),
        borderColor: 'rgb(59, 130, 246)', // blue-500
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        tension: 0.3, // Curva suave
        fill: true,
        pointBackgroundColor: 'rgb(59, 130, 246)',
      },
    ],
  };

  // Configuração do Gráfico de Horários de Pico
  const dadosPico = {
    labels: dadosHorarios.map(d => d.label),
    datasets: [
      {
        label: 'Quantidade de Pedidos',
        data: dadosHorarios.map(d => d.totalPedidos),
        backgroundColor: 'rgba(245, 158, 11, 0.8)', // amber-500
        borderRadius: 4,
      },
    ],
  };

  const opcoesComuns = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  if (pedidos.length === 0) {
    return (
      <div className="w-full p-8 text-center bg-stone-50 rounded-2xl border border-stone-200 text-stone-500 mt-6">
        Não há dados suficientes para gerar os gráficos.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* Gráfico 0: Horários de Pico */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm lg:col-span-2">
        <h3 className="text-lg font-bold text-stone-800 mb-6">Horários de Pico</h3>
        <div className="h-64">
          <Bar data={dadosPico} options={opcoesComuns} />
        </div>
      </div>

      {/* Gráfico 1: Pedidos por Dia */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <h3 className="text-lg font-bold text-stone-800 mb-6">Pedidos por Dia</h3>
        <div className="h-64">
          <Bar data={dadosPedidos} options={opcoesComuns} />
        </div>
      </div>

      {/* Gráfico 2: Faturamento por Dia */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <h3 className="text-lg font-bold text-stone-800 mb-6">Faturamento por Dia</h3>
        <div className="h-64">
          <Line 
            data={dadosFaturamento} 
            options={{
              ...opcoesComuns,
              plugins: {
                ...opcoesComuns.plugins,
                tooltip: {
                  ...opcoesComuns.plugins.tooltip,
                  callbacks: {
                    label: function(context: any) {
                      let label = context.dataset.label || '';
                      if (label) {
                        label += ': ';
                      }
                      if (context.parsed.y !== null) {
                        label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                      }
                      return label;
                    }
                  }
                }
              }
            }} 
          />
        </div>
      </div>
    </div>
  );
};
