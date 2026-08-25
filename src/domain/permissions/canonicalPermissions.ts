export type RiskLevel = 'baixo' | 'medio' | 'alto' | 'critico';

export interface CanonicalPermission {
  chave: string; // "pedidos.visualizar"
  id: string; // alias for chave
  modulo: string; // "pedidos"
  module: string; // alias for modulo
  acao: string; // "visualizar"
  titulo: string; // "Visualizar Pedidos"
  label: string; // alias for titulo
  descricao: string; // "Acesso à lista e acompanhamento de pedidos"
  description: string; // alias for descricao
  nivelRisco: RiskLevel;
  perfisCompativeis: string[]; // ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', ...]
  exigeConfirmacaoReforcada: boolean;
  podeSerPersonalizada: boolean;
  dependeDe: string[]; // prerequisites
}

export interface PermissionModuleGroup {
  id: string;
  name: string;
  icon: string;
  permissions: CanonicalPermission[];
}

export const ALL_CANONICAL_PERMISSIONS: CanonicalPermission[] = [
  // 1. DASHBOARD
  {
    chave: 'dashboard.visualizar',
    id: 'dashboard.visualizar',
    modulo: 'dashboard',
    module: 'dashboard',
    acao: 'visualizar',
    titulo: 'Visualizar Dashboard',
    label: 'Visualizar Dashboard',
    descricao: 'Acesso às métricas principais, faturamento e indicadores operacionais.',
    description: 'Acesso às métricas principais, faturamento e indicadores operacionais.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },

  // 2. PEDIDOS
  {
    chave: 'pedidos.visualizar',
    id: 'pedidos.visualizar',
    modulo: 'pedidos',
    module: 'pedidos',
    acao: 'visualizar',
    titulo: 'Visualizar Pedidos',
    label: 'Visualizar Pedidos',
    descricao: 'Acesso à lista, acompanhamento e histórico de pedidos.',
    description: 'Acesso à lista, acompanhamento e histórico de pedidos.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'DRIVER', 'CASHIER', 'KITCHEN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'pedidos.criar',
    id: 'pedidos.criar',
    modulo: 'pedidos',
    module: 'pedidos',
    acao: 'criar',
    titulo: 'Criar Pedidos',
    label: 'Criar Pedidos',
    descricao: 'Abertura e lançamento de novos pedidos no sistema.',
    description: 'Abertura e lançamento de novos pedidos no sistema.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['pedidos.visualizar']
  },
  {
    chave: 'pedidos.editar',
    id: 'pedidos.editar',
    modulo: 'pedidos',
    module: 'pedidos',
    acao: 'editar',
    titulo: 'Editar Pedidos',
    label: 'Editar Pedidos',
    descricao: 'Alteração de itens, adicionais e observações antes do encerramento.',
    description: 'Alteração de itens, adicionais e observações antes do encerramento.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['pedidos.visualizar']
  },
  {
    chave: 'pedidos.cancelar',
    id: 'pedidos.cancelar',
    modulo: 'pedidos',
    module: 'pedidos',
    acao: 'cancelar',
    titulo: 'Cancelar Pedidos',
    label: 'Cancelar Pedidos',
    descricao: 'Cancelamento definitivo de pedidos e liberação de itens.',
    description: 'Cancelamento definitivo de pedidos e liberação de itens.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['pedidos.visualizar']
  },
  {
    chave: 'pedidos.alterar_status',
    id: 'pedidos.alterar_status',
    modulo: 'pedidos',
    module: 'pedidos',
    acao: 'alterar_status',
    titulo: 'Alterar Status do Pedido',
    label: 'Alterar Status do Pedido',
    descricao: 'Avançar etapas do fluxo (recebido, aceito, em preparo, pronto, entregue).',
    description: 'Avançar etapas do fluxo (recebido, aceito, em preparo, pronto, entregue).',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN', 'CASHIER', 'DRIVER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['pedidos.visualizar']
  },
  {
    chave: 'pedidos.aplicar_desconto',
    id: 'pedidos.aplicar_desconto',
    modulo: 'pedidos',
    module: 'pedidos',
    acao: 'aplicar_desconto',
    titulo: 'Aplicar Desconto em Pedidos',
    label: 'Aplicar Desconto em Pedidos',
    descricao: 'Conceder abatimentos no valor total ou em itens da conta.',
    description: 'Conceder abatimentos no valor total ou em itens da conta.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER', 'WAITER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['pedidos.visualizar']
  },

  // 3. BALCÃO
  {
    chave: 'balcao.visualizar',
    id: 'balcao.visualizar',
    modulo: 'balcao',
    module: 'balcao',
    acao: 'visualizar',
    titulo: 'Visualizar Vendas de Balcão',
    label: 'Visualizar Vendas de Balcão',
    descricao: 'Acesso à tela de PDV e balcão de vendas rápidas.',
    description: 'Acesso à tela de PDV e balcão de vendas rápidas.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'balcao.criar_venda',
    id: 'balcao.criar_venda',
    modulo: 'balcao',
    module: 'balcao',
    acao: 'criar_venda',
    titulo: 'Criar Venda no Balcão',
    label: 'Criar Venda no Balcão',
    descricao: 'Lançar novas vendas diretas de balcão e para viagem.',
    description: 'Lançar novas vendas diretas de balcão e para viagem.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['balcao.visualizar']
  },
  {
    chave: 'balcao.cancelar_venda',
    id: 'balcao.cancelar_venda',
    modulo: 'balcao',
    module: 'balcao',
    acao: 'cancelar_venda',
    titulo: 'Cancelar Venda no Balcão',
    label: 'Cancelar Venda no Balcão',
    descricao: 'Anulação de vendas diretas lançadas no balcão.',
    description: 'Anulação de vendas diretas lançadas no balcão.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['balcao.visualizar']
  },

  // 4. MESAS
  {
    chave: 'mesas.visualizar',
    id: 'mesas.visualizar',
    modulo: 'mesas',
    module: 'mesas',
    acao: 'visualizar',
    titulo: 'Visualizar Mesas e Comandas',
    label: 'Visualizar Mesas e Comandas',
    descricao: 'Acompanhar mapa de mesas do salão e comandas em aberto.',
    description: 'Acompanhar mapa de mesas do salão e comandas em aberto.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'mesas.abrir_comanda',
    id: 'mesas.abrir_comanda',
    modulo: 'mesas',
    module: 'mesas',
    acao: 'abrir_comanda',
    titulo: 'Abrir Mesa ou Comanda',
    label: 'Abrir Mesa ou Comanda',
    descricao: 'Iniciar atendimento de nova mesa ou abrir comanda individual.',
    description: 'Iniciar atendimento de nova mesa ou abrir comanda individual.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['mesas.visualizar']
  },
  {
    chave: 'mesas.transferir',
    id: 'mesas.transferir',
    modulo: 'mesas',
    module: 'mesas',
    acao: 'transferir',
    titulo: 'Transferir Mesas ou Itens',
    label: 'Transferir Mesas ou Itens',
    descricao: 'Mover itens, agrupar ou trocar de mesa/comanda.',
    description: 'Mover itens, agrupar ou trocar de mesa/comanda.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['mesas.visualizar']
  },
  {
    chave: 'mesas.encerrar',
    id: 'mesas.encerrar',
    modulo: 'mesas',
    module: 'mesas',
    acao: 'encerrar',
    titulo: 'Encerrar Conta da Mesa',
    label: 'Encerrar Conta da Mesa',
    descricao: 'Emitir conferência de conta e liberar mesa para pagamento.',
    description: 'Emitir conferência de conta e liberar mesa para pagamento.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['mesas.visualizar']
  },

  // 5. GARÇOM
  {
    chave: 'garcom.atender',
    id: 'garcom.atender',
    modulo: 'garcom',
    module: 'garcom',
    acao: 'atender',
    titulo: 'Atendimento pelo Garçom',
    label: 'Atendimento pelo Garçom',
    descricao: 'Operações de lançamento de atendimento via aplicativo de garçom.',
    description: 'Operações de lançamento de atendimento via aplicativo de garçom.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['pedidos.visualizar']
  },
  {
    chave: 'garcom.cancelar_item',
    id: 'garcom.cancelar_item',
    modulo: 'garcom',
    module: 'garcom',
    acao: 'cancelar_item',
    titulo: 'Cancelar Item da Comanda',
    label: 'Cancelar Item da Comanda',
    descricao: 'Solicitar ou realizar cancelamento de item lançado no atendimento.',
    description: 'Solicitar ou realizar cancelamento de item lançado no atendimento.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['garcom.atender']
  },

  // 6. ENTREGAS
  {
    chave: 'entregas.visualizar',
    id: 'entregas.visualizar',
    modulo: 'entregas',
    module: 'entregas',
    acao: 'visualizar',
    titulo: 'Visualizar Entregas e Rotas',
    label: 'Visualizar Entregas e Rotas',
    descricao: 'Acesso à lista de entregas pendentes, rotas e painel do entregador.',
    description: 'Acesso à lista de entregas pendentes, rotas e painel do entregador.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'DRIVER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'entregas.atribuir',
    id: 'entregas.atribuir',
    modulo: 'entregas',
    module: 'entregas',
    acao: 'atribuir',
    titulo: 'Atribuir / Aceitar Entregas',
    label: 'Atribuir / Aceitar Entregas',
    descricao: 'Atribuir corrida a entregador ou aceitar pedido para entrega.',
    description: 'Atribuir corrida a entregador ou aceitar pedido para entrega.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'DRIVER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['entregas.visualizar']
  },
  {
    chave: 'entregas.confirmar',
    id: 'entregas.confirmar',
    modulo: 'entregas',
    module: 'entregas',
    acao: 'confirmar',
    titulo: 'Confirmar Coleta e Entrega',
    label: 'Confirmar Coleta e Entrega',
    descricao: 'Confirmar saída para entrega e conclusão com o cliente.',
    description: 'Confirmar saída para entrega e conclusão com o cliente.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'DRIVER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['entregas.visualizar']
  },
  {
    chave: 'entregas.receber_pagamento',
    id: 'entregas.receber_pagamento',
    modulo: 'entregas',
    module: 'entregas',
    acao: 'receber_pagamento',
    titulo: 'Receber Pagamento da Entrega',
    label: 'Receber Pagamento da Entrega',
    descricao: 'Registrar o recebimento de valor referente à própria entrega.',
    description: 'Registrar o recebimento de valor referente à própria entrega.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'DRIVER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['entregas.confirmar']
  },

  // 7. COZINHA
  {
    chave: 'cozinha.visualizar',
    id: 'cozinha.visualizar',
    modulo: 'cozinha',
    module: 'cozinha',
    acao: 'visualizar',
    titulo: 'Visualizar KDS / Tela da Cozinha',
    label: 'Visualizar KDS / Tela da Cozinha',
    descricao: 'Visualizar fila de preparo de pratos em tempo real.',
    description: 'Visualizar fila de preparo de pratos em tempo real.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'cozinha.aceitar',
    id: 'cozinha.aceitar',
    modulo: 'cozinha',
    module: 'cozinha',
    acao: 'aceitar',
    titulo: 'Aceitar Pedido na Cozinha',
    label: 'Aceitar Pedido na Cozinha',
    descricao: 'Confirmar recebimento do pedido na estação de preparo.',
    description: 'Confirmar recebimento do pedido na estação de preparo.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['cozinha.visualizar']
  },
  {
    chave: 'cozinha.iniciar_preparo',
    id: 'cozinha.iniciar_preparo',
    modulo: 'cozinha',
    module: 'cozinha',
    acao: 'iniciar_preparo',
    titulo: 'Iniciar Preparo do Prato',
    label: 'Iniciar Preparo do Prato',
    descricao: 'Marcar o item como em andamento na produção.',
    description: 'Marcar o item como em andamento na produção.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['cozinha.visualizar']
  },
  {
    chave: 'cozinha.concluir_item',
    id: 'cozinha.concluir_item',
    modulo: 'cozinha',
    module: 'cozinha',
    acao: 'concluir_item',
    titulo: 'Concluir Prato na Cozinha',
    label: 'Concluir Prato na Cozinha',
    descricao: 'Marcar item como pronto para entrega ou expedição.',
    description: 'Marcar item como pronto para entrega ou expedição.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['cozinha.visualizar']
  },
  {
    chave: 'cozinha.alterar_prioridade',
    id: 'cozinha.alterar_prioridade',
    modulo: 'cozinha',
    module: 'cozinha',
    acao: 'alterar_prioridade',
    titulo: 'Alterar Prioridade da Fila',
    label: 'Alterar Prioridade da Fila',
    descricao: 'Reordenar a fila de produção de pedidos no KDS.',
    description: 'Reordenar a fila de produção de pedidos no KDS.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['cozinha.visualizar']
  },

  // 8. CAIXA
  {
    chave: 'caixa.visualizar',
    id: 'caixa.visualizar',
    modulo: 'caixa',
    module: 'caixa',
    acao: 'visualizar',
    titulo: 'Visualizar Frente de Caixa',
    label: 'Visualizar Frente de Caixa',
    descricao: 'Acessar status do caixa, resumos e saldo operacional.',
    description: 'Acessar status do caixa, resumos e saldo operacional.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'caixa.abrir',
    id: 'caixa.abrir',
    modulo: 'caixa',
    module: 'caixa',
    acao: 'abrir',
    titulo: 'Abrir Caixa',
    label: 'Abrir Caixa',
    descricao: 'Efetuar abertura de turno e informar fundo de troco.',
    description: 'Efetuar abertura de turno e informar fundo de troco.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['caixa.visualizar']
  },
  {
    chave: 'caixa.fechar',
    id: 'caixa.fechar',
    modulo: 'caixa',
    module: 'caixa',
    acao: 'fechar',
    titulo: 'Fechar Caixa',
    label: 'Fechar Caixa',
    descricao: 'Efetuar fechamento de turno de caixa e conferência de valores.',
    description: 'Efetuar fechamento de turno de caixa e conferência de valores.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['caixa.visualizar']
  },
  {
    chave: 'caixa.sangria',
    id: 'caixa.sangria',
    modulo: 'caixa',
    module: 'caixa',
    acao: 'sangria',
    titulo: 'Realizar Sangrias',
    label: 'Realizar Sangrias',
    descricao: 'Lançar retiradas parciais em dinheiro do caixa.',
    description: 'Lançar retiradas parciais em dinheiro do caixa.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['caixa.visualizar']
  },
  {
    chave: 'caixa.suprimento',
    id: 'caixa.suprimento',
    modulo: 'caixa',
    module: 'caixa',
    acao: 'suprimento',
    titulo: 'Realizar Suprimentos',
    label: 'Realizar Suprimentos',
    descricao: 'Lançar aportes extras de dinheiro no caixa.',
    description: 'Lançar aportes extras de dinheiro no caixa.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['caixa.visualizar']
  },
  {
    chave: 'caixa.estornar',
    id: 'caixa.estornar',
    modulo: 'caixa',
    module: 'caixa',
    acao: 'estornar',
    titulo: 'Estornar Pagamentos',
    label: 'Estornar Pagamentos',
    descricao: 'Anular recebimentos incorretos no caixa.',
    description: 'Anular recebimentos incorretos no caixa.',
    nivelRisco: 'critico',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['caixa.visualizar']
  },

  // 9. FINANCEIRO
  {
    chave: 'financeiro.visualizar',
    id: 'financeiro.visualizar',
    modulo: 'financeiro',
    module: 'financeiro',
    acao: 'visualizar',
    titulo: 'Visualizar Relatórios Financeiros',
    label: 'Visualizar Relatórios Financeiros',
    descricao: 'Acesso a faturamento, DRE, conciliação e relatórios financeiros.',
    description: 'Acesso a faturamento, DRE, conciliação e relatórios financeiros.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'financeiro.editar',
    id: 'financeiro.editar',
    modulo: 'financeiro',
    module: 'financeiro',
    acao: 'editar',
    titulo: 'Editar Lançamentos Financeiros',
    label: 'Editar Lançamentos Financeiros',
    descricao: 'Cadastrar, alterar e dar baixa em contas a pagar e receber.',
    description: 'Cadastrar, alterar e dar baixa em contas a pagar e receber.',
    nivelRisco: 'critico',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['financeiro.visualizar']
  },

  // 10. PRODUTOS
  {
    chave: 'produtos.visualizar',
    id: 'produtos.visualizar',
    modulo: 'produtos',
    module: 'produtos',
    acao: 'visualizar',
    titulo: 'Visualizar Cardápio e Produtos',
    label: 'Visualizar Cardápio e Produtos',
    descricao: 'Consultar preços, adicionais e disponibilidade dos itens.',
    description: 'Consultar preços, adicionais e disponibilidade dos itens.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'CASHIER', 'KITCHEN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'produtos.gerenciar',
    id: 'produtos.gerenciar',
    modulo: 'produtos',
    module: 'produtos',
    acao: 'gerenciar',
    titulo: 'Gerenciar Produtos e Cardápio',
    label: 'Gerenciar Produtos e Cardápio',
    descricao: 'Cadastrar novos produtos, alterar preços, adicionais e pausar itens.',
    description: 'Cadastrar novos produtos, alterar preços, adicionais e pausar itens.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['produtos.visualizar']
  },

  // 11. ESTOQUE
  {
    chave: 'estoque.visualizar',
    id: 'estoque.visualizar',
    modulo: 'estoque',
    module: 'estoque',
    acao: 'visualizar',
    titulo: 'Visualizar Níveis de Estoque',
    label: 'Visualizar Níveis de Estoque',
    descricao: 'Consultar quantidades de insumos e fichas técnicas.',
    description: 'Consultar quantidades de insumos e fichas técnicas.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'KITCHEN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'estoque.movimentar',
    id: 'estoque.movimentar',
    modulo: 'estoque',
    module: 'estoque',
    acao: 'movimentar',
    titulo: 'Movimentar Estoque',
    label: 'Movimentar Estoque',
    descricao: 'Lançar entradas de compras ou baixas manuais de perda.',
    description: 'Lançar entradas de compras ou baixas manuais de perda.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['estoque.visualizar']
  },
  {
    chave: 'estoque.ajustar',
    id: 'estoque.ajustar',
    modulo: 'estoque',
    module: 'estoque',
    acao: 'ajustar',
    titulo: 'Ajustar Inventário de Estoque',
    label: 'Ajustar Inventário de Estoque',
    descricao: 'Efetuar acertos gerais e inventário do estoque.',
    description: 'Efetuar acertos gerais e inventário do estoque.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['estoque.visualizar']
  },

  // 12. RELATÓRIOS
  {
    chave: 'relatorios.visualizar',
    id: 'relatorios.visualizar',
    modulo: 'relatorios',
    module: 'relatorios',
    acao: 'visualizar',
    titulo: 'Visualizar Relatórios Operacionais',
    label: 'Visualizar Relatórios Operacionais',
    descricao: 'Consultar relatórios de vendas, garçons, horários e canais.',
    description: 'Consultar relatórios de vendas, garçons, horários e canais.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },

  // 13. CLIENTES
  {
    chave: 'clientes.visualizar',
    id: 'clientes.visualizar',
    modulo: 'clientes',
    module: 'clientes',
    acao: 'visualizar',
    titulo: 'Visualizar Cadastro de Clientes',
    label: 'Visualizar Cadastro de Clientes',
    descricao: 'Consultar contatos, endereços e histórico de clientes.',
    description: 'Consultar contatos, endereços e histórico de clientes.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER', 'WAITER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'clientes.gerenciar',
    id: 'clientes.gerenciar',
    modulo: 'clientes',
    module: 'clientes',
    acao: 'gerenciar',
    titulo: 'Gerenciar Cadastro de Clientes',
    label: 'Gerenciar Cadastro de Clientes',
    descricao: 'Cadastrar novos clientes e atualizar dados de contato.',
    description: 'Cadastrar novos clientes e atualizar dados de contato.',
    nivelRisco: 'baixo',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'CASHIER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: ['clientes.visualizar']
  },

  // 14. EQUIPE
  {
    chave: 'equipe.visualizar',
    id: 'equipe.visualizar',
    modulo: 'equipe',
    module: 'equipe',
    acao: 'visualizar',
    titulo: 'Visualizar Membros da Equipe',
    label: 'Visualizar Membros da Equipe',
    descricao: 'Consultar lista e detalhes dos colaboradores do restaurante.',
    description: 'Consultar lista e detalhes dos colaboradores do restaurante.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'equipe.criar',
    id: 'equipe.criar',
    modulo: 'equipe',
    module: 'equipe',
    acao: 'criar',
    titulo: 'Cadastrar Membro na Equipe',
    label: 'Cadastrar Membro na Equipe',
    descricao: 'Adicionar novo colaborador à equipe.',
    description: 'Adicionar novo colaborador à equipe.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['equipe.visualizar']
  },
  {
    chave: 'equipe.editar',
    id: 'equipe.editar',
    modulo: 'equipe',
    module: 'equipe',
    acao: 'editar',
    titulo: 'Editar Membro e Permissões',
    label: 'Editar Membro e Permissões',
    descricao: 'Alterar perfil, permissões e dados cadastrais de colaboradores.',
    description: 'Alterar perfil, permissões e dados cadastrais de colaboradores.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['equipe.visualizar']
  },
  {
    chave: 'equipe.desativar',
    id: 'equipe.desativar',
    modulo: 'equipe',
    module: 'equipe',
    acao: 'desativar',
    titulo: 'Desativar / Bloquear Membro',
    label: 'Desativar / Bloquear Membro',
    descricao: 'Inativar temporariamente o acesso do colaborador.',
    description: 'Inativar temporariamente o acesso do colaborador.',
    nivelRisco: 'critico',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['equipe.visualizar']
  },
  {
    chave: 'equipe.excluir',
    id: 'equipe.excluir',
    modulo: 'equipe',
    module: 'equipe',
    acao: 'excluir',
    titulo: 'Excluir Membro da Equipe',
    label: 'Excluir Membro da Equipe',
    descricao: 'Remover definitivamente a conta de um colaborador.',
    description: 'Remover definitivamente a conta de um colaborador.',
    nivelRisco: 'critico',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['equipe.visualizar']
  },
  {
    chave: 'equipe.redefinir_senha',
    id: 'equipe.redefinir_senha',
    modulo: 'equipe',
    module: 'equipe',
    acao: 'redefinir_senha',
    titulo: 'Redefinir Senha de Colaborador',
    label: 'Redefinir Senha de Colaborador',
    descricao: 'Alterar a senha de acesso de membros da equipe.',
    description: 'Alterar a senha de acesso de membros da equipe.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['equipe.visualizar']
  },

  // 15. CONFIGURAÇÕES
  {
    chave: 'configuracoes.visualizar',
    id: 'configuracoes.visualizar',
    modulo: 'configuracoes',
    module: 'configuracoes',
    acao: 'visualizar',
    titulo: 'Visualizar Configurações',
    label: 'Visualizar Configurações',
    descricao: 'Consultar dados do restaurante, horários e preferências.',
    description: 'Consultar dados do restaurante, horários e preferências.',
    nivelRisco: 'medio',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  },
  {
    chave: 'configuracoes.editar',
    id: 'configuracoes.editar',
    modulo: 'configuracoes',
    module: 'configuracoes',
    acao: 'editar',
    titulo: 'Editar Configurações da Loja',
    label: 'Editar Configurações da Loja',
    descricao: 'Alterar dados cadastrais, taxas de serviço, impressoras e integrações.',
    description: 'Alterar dados cadastrais, taxas de serviço, impressoras e integrações.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN'],
    exigeConfirmacaoReforcada: true,
    podeSerPersonalizada: true,
    dependeDe: ['configuracoes.visualizar']
  },

  // 16. AUDITORIA
  {
    chave: 'auditoria.visualizar',
    id: 'auditoria.visualizar',
    modulo: 'auditoria',
    module: 'auditoria',
    acao: 'visualizar',
    titulo: 'Visualizar Logs de Auditoria',
    label: 'Visualizar Logs de Auditoria',
    descricao: 'Consultar histórico de ações administrativas, acessos e alterações.',
    description: 'Consultar histórico de ações administrativas, acessos e alterações.',
    nivelRisco: 'alto',
    perfisCompativeis: ['OWNER', 'RESTAURANT_ADMIN'],
    exigeConfirmacaoReforcada: false,
    podeSerPersonalizada: true,
    dependeDe: []
  }
];

// Module Groupings for UI Rendering
export const CANONICAL_MODULES: { id: string; name: string; icon: string }[] = [
  { id: 'dashboard', name: 'Dashboard & Indicadores', icon: 'BarChart3' },
  { id: 'pedidos', name: 'Pedidos & Atendimento', icon: 'ShoppingBag' },
  { id: 'balcao', name: 'Balcão & Vendas Rápidas', icon: 'Store' },
  { id: 'mesas', name: 'Mesas & Comandas', icon: 'Grid' },
  { id: 'garcom', name: 'Operação de Garçom', icon: 'UserCheck' },
  { id: 'entregas', name: 'Entregas & Delivery', icon: 'Truck' },
  { id: 'cozinha', name: 'Cozinha & KDS', icon: 'UtensilsCrossed' },
  { id: 'caixa', name: 'Caixa & Suprimentos', icon: 'DollarSign' },
  { id: 'financeiro', name: 'Financeiro & Contas', icon: 'Receipt' },
  { id: 'produtos', name: 'Produtos & Cardápio', icon: 'BookOpen' },
  { id: 'estoque', name: 'Controle de Estoque', icon: 'Package' },
  { id: 'relatorios', name: 'Relatórios Operacionais', icon: 'FileText' },
  { id: 'clientes', name: 'Gestão de Clientes', icon: 'Users' },
  { id: 'equipe', name: 'Gestão de Equipe', icon: 'ShieldAlert' },
  { id: 'configuracoes', name: 'Configurações da Loja', icon: 'Settings' },
  { id: 'auditoria', name: 'Auditoria & Segurança', icon: 'Lock' }
];

export const CANONICAL_PERMISSIONS_CATALOG: PermissionModuleGroup[] = CANONICAL_MODULES.map(mod => ({
  id: mod.id,
  name: mod.name,
  icon: mod.icon,
  permissions: ALL_CANONICAL_PERMISSIONS.filter(p => p.modulo === mod.id)
}));

// Quick Map for O(1) lookup
export const CANONICAL_PERMISSIONS_MAP = new Map<string, CanonicalPermission>(
  ALL_CANONICAL_PERMISSIONS.map(p => [p.chave, p])
);

// Map Legacy Perm Strings and Legacy Object Keys to Canonical Keys
export const LEGACY_PERMISSION_MAP: Record<string, string[]> = {
  'finance:view': ['financeiro.visualizar'],
  'caixa:open': ['caixa.abrir'],
  'caixa:close': ['caixa.fechar'],
  'caixa:sangria': ['caixa.sangria'],
  'caixa:suprimento': ['caixa.suprimento'],
  'caixa:discount': ['pedidos.aplicar_desconto', 'caixa.sangria'],
  'caixa:refund': ['caixa.estornar'],
  'orders:view': ['pedidos.visualizar'],
  'orders:create': ['pedidos.criar'],
  'orders:edit_own': ['pedidos.editar'],
  'orders:edit_others': ['pedidos.editar'],
  'orders:cancel_item': ['garcom.cancelar_item', 'pedidos.cancelar'],
  'orders:apply_discount': ['pedidos.aplicar_desconto'],
  'orders:transfer_table': ['mesas.transferir'],
  'orders:close_tab': ['mesas.encerrar'],
  'kitchen:view': ['cozinha.visualizar'],
  'kitchen:accept_order': ['cozinha.aceitar'],
  'kitchen:start_prep': ['cozinha.iniciar_preparo'],
  'kitchen:finish_item': ['cozinha.concluir_item'],
  'kitchen:change_priority': ['cozinha.alterar_prioridade'],
  'driver:view': ['entregas.visualizar'],
  'driver:accept_delivery': ['entregas.atribuir'],
  'driver:status_update': ['entregas.confirmar'],
  'products:view': ['produtos.visualizar'],
  'products:manage': ['produtos.gerenciar'],
  'stock:view': ['estoque.visualizar'],
  'stock:manage': ['estoque.movimentar', 'estoque.ajustar'],
  'team:manage': ['equipe.visualizar', 'equipe.criar', 'equipe.editar', 'equipe.redefinir_senha'],
  'settings:manage': ['configuracoes.visualizar', 'configuracoes.editar'],

  // Legacy waiter boolean keys
  'createOrders': ['pedidos.criar'],
  'editOwnOrders': ['pedidos.editar'],
  'editOtherWaitersOrders': ['pedidos.editar'],
  'cancelUnsentItems': ['garcom.cancelar_item'],
  'cancelSentItems': ['garcom.cancelar_item', 'pedidos.cancelar'],
  'applyDiscount': ['pedidos.aplicar_desconto'],
  'transferTable': ['mesas.transferir'],
  'mergeTables': ['mesas.transferir'],
  'receivePayment': ['caixa.visualizar', 'entregas.receber_pagamento'],
  'closeTable': ['mesas.encerrar'],
  'viewFinancialTotals': ['financeiro.visualizar']
};

// Standard Default Permissions Matrices By Role
export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  OWNER: ALL_CANONICAL_PERMISSIONS.map(p => p.chave),
  RESTAURANT_ADMIN: ALL_CANONICAL_PERMISSIONS
    .filter(p => p.perfisCompativeis.includes('RESTAURANT_ADMIN'))
    .map(p => p.chave),
  MANAGER: [
    'dashboard.visualizar',
    'pedidos.visualizar', 'pedidos.criar', 'pedidos.editar', 'pedidos.cancelar', 'pedidos.alterar_status', 'pedidos.aplicar_desconto',
    'balcao.visualizar', 'balcao.criar_venda', 'balcao.cancelar_venda',
    'mesas.visualizar', 'mesas.abrir_comanda', 'mesas.transferir', 'mesas.encerrar',
    'garcom.atender', 'garcom.cancelar_item',
    'cozinha.visualizar', 'cozinha.aceitar', 'cozinha.iniciar_preparo', 'cozinha.concluir_item', 'cozinha.alterar_prioridade',
    'caixa.visualizar', 'caixa.abrir', 'caixa.fechar', 'caixa.sangria', 'caixa.suprimento',
    'produtos.visualizar', 'produtos.gerenciar',
    'estoque.visualizar', 'estoque.movimentar', 'estoque.ajustar',
    'relatorios.visualizar',
    'clientes.visualizar', 'clientes.gerenciar'
  ],
  WAITER: [
    'pedidos.visualizar', 'pedidos.criar', 'pedidos.editar', 'pedidos.aplicar_desconto',
    'mesas.visualizar', 'mesas.abrir_comanda', 'mesas.transferir', 'mesas.encerrar',
    'garcom.atender', 'garcom.cancelar_item',
    'produtos.visualizar',
    'clientes.visualizar'
  ],
  DRIVER: [
    'pedidos.visualizar', 'pedidos.alterar_status',
    'entregas.visualizar', 'entregas.atribuir', 'entregas.confirmar', 'entregas.receber_pagamento'
  ],
  CASHIER: [
    'pedidos.visualizar', 'pedidos.criar', 'pedidos.editar', 'pedidos.alterar_status', 'pedidos.aplicar_desconto',
    'balcao.visualizar', 'balcao.criar_venda', 'balcao.cancelar_venda',
    'mesas.visualizar', 'mesas.abrir_comanda', 'mesas.transferir', 'mesas.encerrar',
    'caixa.visualizar', 'caixa.abrir', 'caixa.fechar', 'caixa.sangria', 'caixa.suprimento', 'caixa.estornar',
    'produtos.visualizar',
    'clientes.visualizar', 'clientes.gerenciar'
  ],
  KITCHEN: [
    'pedidos.visualizar', 'pedidos.alterar_status',
    'cozinha.visualizar', 'cozinha.aceitar', 'cozinha.iniciar_preparo', 'cozinha.concluir_item', 'cozinha.alterar_prioridade',
    'produtos.visualizar',
    'estoque.visualizar'
  ]
};

// Required Helper Functions

/**
 * 1. getDefaultPermissionsForRole(role)
 * Returns the baseline list of default canonical permission keys for a given role.
 */
export function getDefaultPermissionsForRole(role: string): string[] {
  const roleUpper = (role || '').toUpperCase();
  if (roleUpper === 'OWNER') {
    return ALL_CANONICAL_PERMISSIONS.map(p => p.chave);
  }
  return ROLE_DEFAULT_PERMISSIONS[roleUpper] || [];
}

/**
 * 2. getAllowedPermissionsForRole(role)
 * Returns all canonical permission keys compatible with a given role according to perfisCompativeis.
 */
export function getAllowedPermissionsForRole(role: string): string[] {
  const roleUpper = (role || '').toUpperCase();
  if (roleUpper === 'OWNER') {
    return ALL_CANONICAL_PERMISSIONS.map(p => p.chave);
  }
  return ALL_CANONICAL_PERMISSIONS
    .filter(p => p.perfisCompativeis.includes(roleUpper))
    .map(p => p.chave);
}

/**
 * 4. normalizeLegacyPermissions(legacyPermissions)
 * Converts legacy strings (e.g. "finance:view") or legacy boolean objects to canonical "modulo.acao" keys.
 */
export function normalizeLegacyPermissions(legacyInput: any): string[] {
  if (!legacyInput) return [];

  const canonicalSet = new Set<string>();

  if (Array.isArray(legacyInput)) {
    for (const item of legacyInput) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();

      // If already a valid canonical key
      if (CANONICAL_PERMISSIONS_MAP.has(trimmed)) {
        canonicalSet.add(trimmed);
        continue;
      }

      // Check if mapped in legacy dictionary
      const mapped = LEGACY_PERMISSION_MAP[trimmed];
      if (mapped && mapped.length > 0) {
        mapped.forEach(k => canonicalSet.add(k));
      }
    }
  } else if (typeof legacyInput === 'object') {
    for (const [key, val] of Object.entries(legacyInput)) {
      if (!val) continue; // Only truthy flags

      if (CANONICAL_PERMISSIONS_MAP.has(key)) {
        canonicalSet.add(key);
        continue;
      }

      const mapped = LEGACY_PERMISSION_MAP[key];
      if (mapped && mapped.length > 0) {
        mapped.forEach(k => canonicalSet.add(k));
      }
    }
  }

  return Array.from(canonicalSet);
}

/**
 * 3. validatePermissionsForRole(role, permissions)
 * Validates, normalizes, filters for compatibility, and applies dependency resolution automatically.
 */
export function validatePermissionsForRole(
  role: string,
  rawPermissions: any
): {
  validPermissions: string[];
  rejectedPermissions: string[];
  addedDependencies: string[];
  unknownPermissions: string[];
} {
  const roleUpper = (role || '').toUpperCase();
  const allowedForRole = new Set(getAllowedPermissionsForRole(roleUpper));

  const normalized = normalizeLegacyPermissions(rawPermissions);
  const unknownPermissions: string[] = [];
  const rejectedPermissions: string[] = [];
  const validSet = new Set<string>();

  // Check raw input for unknown strings before mapping if array
  if (Array.isArray(rawPermissions)) {
    for (const item of rawPermissions) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (!CANONICAL_PERMISSIONS_MAP.has(trimmed) && !LEGACY_PERMISSION_MAP[trimmed]) {
          unknownPermissions.push(trimmed);
        }
      }
    }
  }

  if (roleUpper === 'OWNER') {
    return {
      validPermissions: ALL_CANONICAL_PERMISSIONS.map(p => p.chave),
      rejectedPermissions: [],
      addedDependencies: [],
      unknownPermissions
    };
  }

  // 1. Filter normalized permissions against allowedForRole
  for (const permKey of normalized) {
    if (allowedForRole.has(permKey)) {
      validSet.add(permKey);
    } else {
      rejectedPermissions.push(permKey);
    }
  }

  // 2. Automatically resolve dependencies
  const addedDependenciesSet = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const permKey of Array.from(validSet)) {
      const permObj = CANONICAL_PERMISSIONS_MAP.get(permKey);
      if (permObj && permObj.dependeDe && permObj.dependeDe.length > 0) {
        for (const depKey of permObj.dependeDe) {
          if (!validSet.has(depKey) && allowedForRole.has(depKey)) {
            validSet.add(depKey);
            addedDependenciesSet.add(depKey);
            changed = true;
          }
        }
      }
    }
  }

  return {
    validPermissions: Array.from(validSet),
    rejectedPermissions,
    addedDependencies: Array.from(addedDependenciesSet),
    unknownPermissions
  };
}

/**
 * 5. hasPermission(user, permission)
 * Checks if a user profile has a specific permission.
 */
export function hasPermission(
  user: { role?: string; permissions?: any; accountType?: string; tipo_usuario?: string } | null | undefined,
  permissionKey: string
): boolean {
  if (!user) return false;

  const roleUpper = (user.role || user.tipo_usuario || '').toUpperCase();

  // OWNER has unrestricted access
  if (roleUpper === 'OWNER' || roleUpper === 'RESTAURANT' || roleUpper === 'RESTAURANTE') {
    return true;
  }

  // RESTAURANT_ADMIN has access to all admin-compatible permissions by default
  if (roleUpper === 'RESTAURANT_ADMIN') {
    const allowed = getAllowedPermissionsForRole('RESTAURANT_ADMIN');
    if (allowed.includes(permissionKey)) return true;
  }

  const normalized = normalizeLegacyPermissions(user.permissions);
  if (normalized.includes(permissionKey)) {
    return true;
  }

  // Fallback check for module prefix matching if user has module-level permission
  const [mod] = permissionKey.split('.');
  if (mod && normalized.some(p => p.startsWith(`${mod}.`))) {
    // If permission requested is basic view and user has any permission in that module
    if (permissionKey.endsWith('.visualizar') || permissionKey.endsWith('.view')) {
      return true;
    }
  }

  return false;
}

/**
 * 6. hasAnyPermission(user, permissions)
 * Checks if user has at least one of the specified permissions.
 */
export function hasAnyPermission(
  user: { role?: string; permissions?: any; accountType?: string; tipo_usuario?: string } | null | undefined,
  permissionKeys: string[]
): boolean {
  if (!permissionKeys || permissionKeys.length === 0) return true;
  return permissionKeys.some(perm => hasPermission(user, perm));
}

/**
 * 7. hasAllPermissions(user, permissions)
 * Checks if user has all of the specified permissions.
 */
export function hasAllPermissions(
  user: { role?: string; permissions?: any; accountType?: string; tipo_usuario?: string } | null | undefined,
  permissionKeys: string[]
): boolean {
  if (!permissionKeys || permissionKeys.length === 0) return true;
  return permissionKeys.every(perm => hasPermission(user, perm));
}

// Backwards compatibility alias
export function getRoleAllowedPermissions(role: string): string[] {
  return getAllowedPermissionsForRole(role);
}
