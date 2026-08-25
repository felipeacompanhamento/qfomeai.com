import { 
  ShoppingBag, Utensils, LayoutGrid, Clock, MapPin, 
  Tags, List, PlusCircle, Layers, Ticket, Archive,
  Users, UserCheck, BarChart3,
  PieChart, DollarSign, TrendingUp, CreditCard, FileText,
  Store, Printer, Sliders, MessageSquare, Lock
} from 'lucide-react';

export interface HubTabConfig {
  id: string;
  label: string;
  path: string;
  module: string;
  allowedRoles?: string[];
  featureFlagKey?: string; // Optional feature flag check on restaurantProfile
  icon: any;
}

export interface HubConfig {
  id: string;
  title: string;
  description: string;
  basePath: string;
  defaultTabId: string;
  tabs: HubTabConfig[];
}

export const RESTAURANT_HUBS: Record<string, HubConfig> = {
  operacao: {
    id: 'operacao',
    title: 'Operação',
    description: 'Gestão operacional em tempo real do restaurante.',
    basePath: '/restaurant/operacao',
    defaultTabId: 'pedidos',
    tabs: [
      { id: 'pedidos', label: 'Pedidos', path: '/restaurant/operacao/pedidos', module: 'pedidos', icon: ShoppingBag },
      { id: 'balcao', label: 'Venda no Balcão', path: '/restaurant/operacao/balcao', module: 'balcao', featureFlagKey: 'counterEnabled', icon: Utensils },
      { id: 'mesas', label: 'Mesas e Comandas', path: '/restaurant/operacao/mesas', module: 'mesas', icon: LayoutGrid },
      { id: 'cozinha', label: 'Cozinha', path: '/restaurant/operacao/cozinha', module: 'cozinha', icon: Clock },
      { id: 'entregas', label: 'Entregas', path: '/restaurant/operacao/entregas', module: 'delivery', icon: MapPin },
    ]
  },
  cardapio: {
    id: 'cardapio',
    title: 'Cardápio',
    description: 'Gestão de produtos, categorias, adicionais e estoque.',
    basePath: '/restaurant/cardapio',
    defaultTabId: 'produtos',
    tabs: [
      { id: 'produtos', label: 'Produtos', path: '/restaurant/cardapio/produtos', module: 'menu', icon: ShoppingBag },
      { id: 'categorias', label: 'Categorias', path: '/restaurant/cardapio/categorias', module: 'menu', icon: Tags },
      { id: 'tamanhos', label: 'Tamanhos', path: '/restaurant/cardapio/tamanhos', module: 'menu', icon: List },
      { id: 'adicionais', label: 'Adicionais', path: '/restaurant/cardapio/adicionais', module: 'menu', icon: PlusCircle },
      { id: 'grupos', label: 'Grupos de Opções', path: '/restaurant/cardapio/grupos', module: 'menu', icon: Layers },
      { id: 'promocoes', label: 'Promoções', path: '/restaurant/cardapio/promocoes', module: 'menu', icon: Ticket },
      { id: 'estoque', label: 'Estoque', path: '/restaurant/cardapio/estoque', module: 'stock', icon: Archive },
    ]
  },
  gestao: {
    id: 'gestao',
    title: 'Gestão',
    description: 'Relatórios de desempenho, clientes e equipe.',
    basePath: '/restaurant/gestao',
    defaultTabId: 'clientes',
    tabs: [
      { id: 'clientes', label: 'Clientes', path: '/restaurant/gestao/clientes', module: 'clientes', icon: Users },
      { id: 'equipe', label: 'Equipe', path: '/restaurant/gestao/equipe', module: 'equipe', icon: UserCheck },
      { id: 'relatorios', label: 'Relatórios', path: '/restaurant/gestao/relatorios', module: 'relatorios', icon: BarChart3 },
    ]
  },
  financeiro: {
    id: 'financeiro',
    title: 'Financeiro',
    description: 'Visão financeira, fluxo de caixa, lançamentos e faturas.',
    basePath: '/restaurant/financeiro',
    defaultTabId: 'visao',
    tabs: [
      { id: 'visao', label: 'Visão Financeira', path: '/restaurant/financeiro/visao', module: 'financeiro', icon: PieChart },
      { id: 'caixa', label: 'Caixa', path: '/restaurant/financeiro/caixa', module: 'caixa', icon: DollarSign },
      { id: 'contas-receber', label: 'Contas a Receber', path: '/restaurant/financeiro/contas-receber', module: 'financeiro', icon: TrendingUp },
      { id: 'contas-pagar', label: 'Contas a Pagar', path: '/restaurant/financeiro/contas-pagar', module: 'financeiro', icon: CreditCard },
      { id: 'lancamentos', label: 'Lançamentos', path: '/restaurant/financeiro/lancamentos', module: 'financeiro', icon: FileText },
      { id: 'faturas', label: 'Faturas QFomeAI', path: '/restaurant/financeiro/faturas', module: 'financeiro', icon: FileText },
    ]
  },
  configuracoes: {
    id: 'configuracoes',
    title: 'Configurações',
    description: 'Dados da empresa, horários, taxas, formas de pagamento e integrações.',
    basePath: '/restaurant/configuracoes',
    defaultTabId: 'dados',
    tabs: [
      { id: 'dados', label: 'Dados do Restaurante', path: '/restaurant/configuracoes/dados', module: 'settings', icon: Store },
      { id: 'horarios', label: 'Horários', path: '/restaurant/configuracoes/horarios', module: 'settings', icon: Clock },
      { id: 'entrega', label: 'Entrega e Taxas', path: '/restaurant/configuracoes/entrega', module: 'settings', icon: MapPin },
      { id: 'pagamentos', label: 'Formas de Pagamento', path: '/restaurant/configuracoes/pagamentos', module: 'settings', icon: CreditCard },
      { id: 'impressao', label: 'Impressão', path: '/restaurant/configuracoes/impressao', module: 'settings', icon: Printer },
      { id: 'integracoes', label: 'Integrações', path: '/restaurant/configuracoes/integracoes', module: 'settings', icon: Sliders },
      { id: 'whatsapp', label: 'WhatsApp', path: '/restaurant/configuracoes/whatsapp', module: 'settings', icon: MessageSquare },
      { id: 'seguranca', label: 'Segurança da Conta', path: '/restaurant/configuracoes/seguranca', module: 'settings', icon: Lock },
    ]
  }
};
