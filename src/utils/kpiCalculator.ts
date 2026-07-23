export interface OrderItem {
  id?: string;
  produtoId?: string;
  productId?: string;
  nome?: string;
  name?: string;
  quantidade?: number;
  quantity?: number;
  preco?: number;
  price?: number;
  valor?: number;
  [key: string]: any;
}

export interface OrderData {
  valor_total?: number | string;
  status?: string;
  restaurantId?: string;
  items?: OrderItem[];
  produtos?: OrderItem[];
  [key: string]: any;
}

export interface RestaurantRankingItem {
  restaurantId: string;
  nome?: string;
  totalPedidos: number;
  faturamento: number;
}

export interface ProductRankingItem {
  produtoId: string;
  nome: string;
  restauranteNome?: string;
  quantidadeVendida: number;
  receitaTotal: number;
}

export interface HourlyVolumeItem {
  hora: number;
  horaFormatada: string;
  totalPedidos: number;
}

export interface FinancialSummary {
  faturamentoTotal: number;
  comissaoMarketplace: number;
  repasseRestaurantes: number;
}

/**
 * Retorna o total de pedidos.
 * @param pedidos Lista de pedidos
 * @returns Número total de pedidos
 */
export const calcularTotalPedidos = (pedidos: OrderData[]): number => {
  return pedidos.length;
};

/**
 * Calcula o faturamento total somando o valor_total de todos os pedidos.
 * @param pedidos Lista de pedidos
 * @returns Faturamento total
 */
export const calcularFaturamentoTotal = (pedidos: OrderData[]): number => {
  return pedidos.reduce((total, pedido) => {
    const valor = Number(pedido.valor_total) || 0;
    return total + valor;
  }, 0);
};

/**
 * Calcula o ticket médio (faturamento total / total de pedidos).
 * @param pedidos Lista de pedidos
 * @returns Ticket médio
 */
export const calcularTicketMedio = (pedidos: OrderData[]): number => {
  if (pedidos.length === 0) return 0;
  const faturamento = calcularFaturamentoTotal(pedidos);
  return faturamento / pedidos.length;
};

/**
 * Agrupa e conta a quantidade de pedidos por status.
 * @param pedidos Lista de pedidos
 * @returns Objeto com a contagem por status (ex: { "entregue": 10, "cancelado": 2 })
 */
export const calcularPedidosPorStatus = (pedidos: OrderData[]): Record<string, number> => {
  return pedidos.reduce((acc, pedido) => {
    const status = pedido.status || 'desconhecido';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

/**
 * Função BÔNUS de Alta Performance:
 * Calcula todos os KPIs em uma única iteração (O(n)), ideal para listas muito grandes.
 * @param pedidos Lista de pedidos
 * @returns Objeto contendo todos os KPIs calculados
 */
export const calcularTodosKPIs = (pedidos: OrderData[]) => {
  let faturamentoTotal = 0;
  const pedidosPorStatus: Record<string, number> = {};
  
  for (let i = 0; i < pedidos.length; i++) {
    const pedido = pedidos[i];
    
    // Soma faturamento
    faturamentoTotal += Number(pedido.valor_total) || 0;
    
    // Agrupa status
    const status = pedido.status || 'desconhecido';
    pedidosPorStatus[status] = (pedidosPorStatus[status] || 0) + 1;
  }
  
  const totalPedidos = pedidos.length;
  const ticketMedio = totalPedidos > 0 ? faturamentoTotal / totalPedidos : 0;
  
  return {
    totalPedidos,
    faturamentoTotal,
    ticketMedio,
    pedidosPorStatus
  };
};

/**
 * Calcula o ranking dos 5 melhores restaurantes com base nos pedidos filtrados.
 * Agrupa por restaurantId, conta pedidos e soma o faturamento.
 * Ordena pelo faturamento (decrescente) e retorna os 5 primeiros.
 * 
 * @param pedidos Lista de pedidos
 * @returns Array com o Top 5 restaurantes
 */
export const calcularRankingRestaurantes = (pedidos: OrderData[]): RestaurantRankingItem[] => {
  const agrupado: Record<string, RestaurantRankingItem> = {};

  for (let i = 0; i < pedidos.length; i++) {
    const pedido = pedidos[i];
    const restaurantId = pedido.restaurant_id || pedido.restaurantId || 'desconhecido';
    const restaurantNome = pedido.restaurant_nome || pedido.restaurantNome || `Restaurante ${restaurantId}`;

    if (!agrupado[restaurantId]) {
      agrupado[restaurantId] = {
        restaurantId,
        nome: restaurantNome,
        totalPedidos: 0,
        faturamento: 0
      };
    }

    agrupado[restaurantId].totalPedidos += 1;
    agrupado[restaurantId].faturamento += Number(pedido.valor_total) || 0;
  }

  // Converter para array, ordenar por faturamento (maior para menor) e pegar os 5 primeiros
  return Object.values(agrupado)
    .sort((a, b) => {
      // Critério principal: Faturamento
      if (b.faturamento !== a.faturamento) {
        return b.faturamento - a.faturamento;
      }
      // Critério de desempate: Quantidade de pedidos
      return b.totalPedidos - a.totalPedidos;
    })
    .slice(0, 5);
};

/**
 * Calcula o ranking dos 10 produtos mais vendidos com base nos pedidos filtrados.
 * Agrupa por produto, soma a quantidade vendida e calcula a receita total gerada.
 * Ordena pela quantidade vendida (decrescente) e retorna os 10 primeiros.
 * 
 * @param pedidos Lista de pedidos completos com itens
 * @returns Array com o Top 10 produtos mais vendidos
 */
export const calcularProdutosMaisVendidos = (pedidos: OrderData[]): ProductRankingItem[] => {
  const agrupado: Record<string, ProductRankingItem> = {};

  for (let i = 0; i < pedidos.length; i++) {
    const pedido = pedidos[i];
    const restauranteNome = pedido.restaurant_nome || pedido.restaurantNome || pedido.restaurante_nome || 'Restaurante Desconhecido';
    
    // Suporta diferentes nomes de propriedades para a lista de itens (items ou produtos)
    const itens = pedido.items || pedido.produtos || pedido.itens || [];

    for (let j = 0; j < itens.length; j++) {
      const item = itens[j];
      
      // Extrair identificador e nome (suporta variações comuns de nomenclatura)
      const produtoId = item.id || item.produtoId || item.productId || 'desconhecido';
      const nome = item.nome || item.name || 'Produto Desconhecido';
      
      // Extrair quantidade
      const quantidade = Number(item.quantidade || item.quantity) || 1;
      
      // Extrair receita (tenta valor total do item, senão calcula preco * quantidade)
      let receita = 0;
      if (item.valor !== undefined) {
        receita = Number(item.valor);
      } else if (item.preco !== undefined) {
        receita = Number(item.preco) * quantidade;
      } else if (item.price !== undefined) {
        receita = Number(item.price) * quantidade;
      }

      if (!agrupado[produtoId]) {
        agrupado[produtoId] = {
          produtoId,
          nome,
          restauranteNome,
          quantidadeVendida: 0,
          receitaTotal: 0
        };
      }

      agrupado[produtoId].quantidadeVendida += quantidade;
      agrupado[produtoId].receitaTotal += receita;
    }
  }

  // Converter para array, ordenar por quantidade vendida (maior para menor) e pegar os 10 primeiros
  return Object.values(agrupado)
    .sort((a, b) => {
      // Critério principal: Quantidade vendida
      if (b.quantidadeVendida !== a.quantidadeVendida) {
        return b.quantidadeVendida - a.quantidadeVendida;
      }
      // Critério de desempate: Receita total gerada
      return b.receitaTotal - a.receitaTotal;
    })
    .slice(0, 10);
};

/**
 * Calcula o volume de pedidos por hora do dia (0 a 23) para análise de horários de pico.
 * Agrupa os pedidos pela hora de criação.
 * 
 * @param pedidos Lista de pedidos completos
 * @returns Array com 24 posições representando o volume de cada hora
 */
export const calcularHorariosDePico = (pedidos: OrderData[]): HourlyVolumeItem[] => {
  // Inicializa um array com 24 horas (0 a 23)
  const volumePorHora: HourlyVolumeItem[] = Array.from({ length: 24 }, (_, i) => ({
    hora: i,
    horaFormatada: `${String(i).padStart(2, '0')}:00`,
    totalPedidos: 0
  }));

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

    if (dataObj && !isNaN(dataObj.getTime())) {
      // Pega a hora local (0 a 23)
      const hora = dataObj.getHours();
      volumePorHora[hora].totalPedidos += 1;
    }
  }

  return volumePorHora;
};

/**
 * Calcula a comissão total do marketplace com base em uma taxa percentual.
 * 
 * @param pedidos Lista de pedidos
 * @param taxaPercentual Taxa cobrada pelo marketplace (ex: 10 para 10%)
 * @returns Valor total da comissão
 */
export const calcularComissaoMarketplace = (pedidos: OrderData[], taxaPercentual: number): number => {
  const faturamento = calcularFaturamentoTotal(pedidos);
  return faturamento * (taxaPercentual / 100);
};

/**
 * Calcula o valor total a ser repassado aos restaurantes (faturamento - comissão).
 * 
 * @param pedidos Lista de pedidos
 * @param taxaPercentual Taxa cobrada pelo marketplace (ex: 10 para 10%)
 * @returns Valor total do repasse
 */
export const calcularRepasseRestaurantes = (pedidos: OrderData[], taxaPercentual: number): number => {
  const faturamento = calcularFaturamentoTotal(pedidos);
  const comissao = faturamento * (taxaPercentual / 100);
  return faturamento - comissao;
};

/**
 * Calcula o resumo financeiro completo (faturamento, comissão e repasse) de forma otimizada.
 * Ideal para exibir os 3 KPIs na mesma tela sem precisar recalcular o faturamento.
 * 
 * @param pedidos Lista de pedidos
 * @param taxaPercentual Taxa cobrada pelo marketplace (ex: 10 para 10%)
 * @returns Objeto com o resumo financeiro (faturamentoTotal, comissaoMarketplace, repasseRestaurantes)
 */
export const calcularResumoFinanceiro = (pedidos: OrderData[], taxaPercentual: number): FinancialSummary => {
  const faturamentoTotal = calcularFaturamentoTotal(pedidos);
  const comissaoMarketplace = faturamentoTotal * (taxaPercentual / 100);
  const repasseRestaurantes = faturamentoTotal - comissaoMarketplace;

  return {
    faturamentoTotal,
    comissaoMarketplace,
    repasseRestaurantes
  };
};
