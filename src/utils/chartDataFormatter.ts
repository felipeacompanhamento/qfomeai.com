import { OrderData } from './kpiCalculator';

export interface DailyData {
  date: string; // Formato YYYY-MM-DD
  totalPedidos: number;
  faturamento: number;
}

export interface HourlyData {
  hour: number; // 0-23
  label: string; // "00h", "01h", etc.
  totalPedidos: number;
}

/**
 * Agrupa a lista de pedidos por dia.
 * @param pedidos Lista de pedidos
 * @returns Array de dados diários ordenados por data
 */
export const agruparPedidosPorDia = (pedidos: OrderData[]): DailyData[] => {
  const agrupado: Record<string, DailyData> = {};

  for (let i = 0; i < pedidos.length; i++) {
    const pedido = pedidos[i];
    
    // Extrair a data (lidando com Firestore Timestamp ou string/Date)
    let dataObj: Date | null = null;
    
    if (pedido.data_criacao) {
      if (typeof pedido.data_criacao.toDate === 'function') {
        dataObj = pedido.data_criacao.toDate(); // Firestore Timestamp
      } else {
        dataObj = new Date(pedido.data_criacao); // String ou Date object
      }
    }

    if (!dataObj || isNaN(dataObj.getTime())) {
      continue; // Pula se não tiver data válida
    }

    // Formatar a data como YYYY-MM-DD para usar como chave de agrupamento
    const ano = dataObj.getFullYear();
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
    const dia = String(dataObj.getDate()).padStart(2, '0');
    const dataKey = `${ano}-${mes}-${dia}`;

    if (!agrupado[dataKey]) {
      agrupado[dataKey] = {
        date: dataKey,
        totalPedidos: 0,
        faturamento: 0,
      };
    }

    agrupado[dataKey].totalPedidos += 1;
    agrupado[dataKey].faturamento += Number(pedido.valor_total) || 0;
  }

  // Converter o objeto em array e ordenar por data crescente
  return Object.values(agrupado).sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * Agrupa a lista de pedidos por hora do dia.
 * @param pedidos Lista de pedidos
 * @returns Array de 24 posições com a quantidade de pedidos por hora
 */
export const agruparPedidosPorHora = (pedidos: OrderData[]): HourlyData[] => {
  const horas: HourlyData[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    label: `${String(i).padStart(2, '0')}h`,
    totalPedidos: 0,
  }));

  for (let i = 0; i < pedidos.length; i++) {
    const pedido = pedidos[i];
    let dataObj: Date | null = null;

    if (pedido.data_criacao) {
      if (typeof pedido.data_criacao.toDate === 'function') {
        dataObj = pedido.data_criacao.toDate();
      } else {
        dataObj = new Date(pedido.data_criacao);
      }
    }

    if (dataObj && !isNaN(dataObj.getTime())) {
      const hora = dataObj.getHours();
      horas[hora].totalPedidos += 1;
    }
  }

  return horas;
};
