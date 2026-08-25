import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, TrendingUp, ShoppingBag, Utensils, LayoutGrid, Clock, MapPin, 
  Tags, List, PlusCircle, Layers, Ticket, Archive,
  Users, UserCheck, BarChart3,
  PieChart, DollarSign, CreditCard, FileText,
  Store, Printer, Sliders, MessageSquare, Lock,
  Wallet, Settings, ChevronDown, ChevronRight, ChevronLeft, Menu, X, LogOut, Home,
  Mail, RefreshCw, AlertTriangle
} from 'lucide-react';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { normalizeRestaurantFeatures, RestaurantFeatures, DEFAULT_RESTAURANT_FEATURES } from '../domain/restaurant/restaurantFeatures';
import { hasPermission } from '../domain/permissions/canonicalPermissions';
import { AccountType } from '../types';
import { isRestaurantTeamMember } from '../utils/authResolution';

interface RestaurantLayoutProps {
  children: React.ReactNode;
  pendingOrdersCount: number;
}

interface MenuItemConfig {
  id: string;
  title: string;
  path: string;
  canonicalPermission?: string;
  featureFlagKey?: string;
  allowedRoles?: string[];
  icon: any;
  aliases?: string[];
}

interface MenuGroupConfig {
  id: string;
  title: string;
  icon: any;
  items: MenuItemConfig[];
}

export const OFFICIAL_NAV_GROUPS: MenuGroupConfig[] = [
  {
    id: 'visao_geral',
    title: 'VISÃO GERAL',
    icon: LayoutDashboard,
    items: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        path: '/restaurant/dashboard',
        aliases: ['/restaurant/dashboard'],
        canonicalPermission: 'dashboard.visualizar',
        icon: LayoutDashboard,
      },
      {
        id: 'desempenho',
        title: 'Desempenho',
        path: '/restaurant/desempenho',
        aliases: ['/restaurant/desempenho'],
        canonicalPermission: 'dashboard.visualizar',
        icon: TrendingUp,
      },
    ]
  },
  {
    id: 'operacao',
    title: 'OPERAÇÃO',
    icon: ShoppingBag,
    items: [
      {
        id: 'pedidos',
        title: 'Pedidos',
        path: '/restaurant/operacao/pedidos',
        aliases: ['/restaurant/operacao/pedidos', '/restaurant/orders', '/restaurant/operacao'],
        canonicalPermission: 'pedidos.visualizar',
        icon: ShoppingBag,
      },
      {
        id: 'balcao',
        title: 'Venda no Balcão',
        path: '/restaurant/operacao/balcao',
        aliases: ['/restaurant/operacao/balcao', '/restaurant/balcao'],
        canonicalPermission: 'balcao.visualizar',
        featureFlagKey: 'counterEnabled',
        icon: Store,
      },
      {
        id: 'mesas',
        title: 'Mesas e Comandas',
        path: '/restaurant/operacao/mesas',
        aliases: ['/restaurant/operacao/mesas', '/restaurant/mesas', '/restaurant/mapa-mesas', '/restaurant/saloes'],
        canonicalPermission: 'mesas.visualizar',
        icon: LayoutGrid,
      },
      {
        id: 'cozinha',
        title: 'Cozinha',
        path: '/restaurant/operacao/cozinha',
        aliases: ['/restaurant/operacao/cozinha', '/restaurant/cozinha'],
        canonicalPermission: 'cozinha.visualizar',
        icon: Clock,
      },
      {
        id: 'entregas',
        title: 'Entregas',
        path: '/restaurant/operacao/entregas',
        aliases: ['/restaurant/operacao/entregas', '/restaurant/drivers', '/restaurant/drivers/deliveries', '/restaurant/drivers/settings'],
        canonicalPermission: 'entregas.visualizar',
        icon: MapPin,
      },
    ]
  },
  {
    id: 'cardapio',
    title: 'CARDÁPIO',
    icon: Utensils,
    items: [
      {
        id: 'produtos',
        title: 'Produtos',
        path: '/restaurant/cardapio/produtos',
        aliases: ['/restaurant/cardapio/produtos', '/restaurant/menu/items'],
        canonicalPermission: 'produtos.visualizar',
        icon: ShoppingBag,
      },
      {
        id: 'categorias',
        title: 'Categorias',
        path: '/restaurant/cardapio/categorias',
        aliases: ['/restaurant/cardapio/categorias', '/restaurant/menu/categories'],
        canonicalPermission: 'produtos.visualizar',
        icon: Tags,
      },
      {
        id: 'tamanhos',
        title: 'Tamanhos',
        path: '/restaurant/cardapio/tamanhos',
        aliases: ['/restaurant/cardapio/tamanhos', '/restaurant/menu/sizes'],
        canonicalPermission: 'produtos.visualizar',
        icon: List,
      },
      {
        id: 'adicionais',
        title: 'Adicionais',
        path: '/restaurant/cardapio/adicionais',
        aliases: ['/restaurant/cardapio/adicionais', '/restaurant/menu/extras'],
        canonicalPermission: 'produtos.visualizar',
        icon: PlusCircle,
      },
      {
        id: 'grupos',
        title: 'Grupos de Opções',
        path: '/restaurant/cardapio/grupos',
        aliases: ['/restaurant/cardapio/grupos', '/restaurant/menu/grupos'],
        canonicalPermission: 'produtos.visualizar',
        icon: Layers,
      },
      {
        id: 'promocoes',
        title: 'Promoções',
        path: '/restaurant/cardapio/promocoes',
        aliases: ['/restaurant/cardapio/promocoes', '/restaurant/menu/promotions'],
        canonicalPermission: 'produtos.visualizar',
        icon: Ticket,
      },
      {
        id: 'estoque',
        title: 'Estoque',
        path: '/restaurant/cardapio/estoque',
        aliases: ['/restaurant/cardapio/estoque', '/restaurant/estoque'],
        canonicalPermission: 'estoque.visualizar',
        icon: Archive,
      },
    ]
  },
  {
    id: 'gestao',
    title: 'GESTÃO',
    icon: Users,
    items: [
      {
        id: 'clientes',
        title: 'Clientes',
        path: '/restaurant/gestao/clientes',
        aliases: ['/restaurant/gestao/clientes', '/restaurant/clientes'],
        canonicalPermission: 'clientes.visualizar',
        icon: Users,
      },
      {
        id: 'equipe',
        title: 'Equipe',
        path: '/restaurant/gestao/equipe',
        aliases: ['/restaurant/gestao/equipe', '/restaurant/settings/team', '/restaurant/waiters'],
        canonicalPermission: 'equipe.visualizar',
        icon: UserCheck,
      },
      {
        id: 'relatorios',
        title: 'Relatórios',
        path: '/restaurant/gestao/relatorios',
        aliases: ['/restaurant/gestao/relatorios', '/restaurant/relatorios'],
        canonicalPermission: 'relatorios.visualizar',
        icon: BarChart3,
      },
    ]
  },
  {
    id: 'financeiro',
    title: 'FINANCEIRO',
    icon: Wallet,
    items: [
      {
        id: 'visao',
        title: 'Visão Financeira',
        path: '/restaurant/financeiro?subtab=visao',
        aliases: ['/restaurant/financeiro/visao', '/restaurant/financeiro', '/restaurant/finances'],
        canonicalPermission: 'financeiro.visualizar',
        icon: PieChart,
      },
      {
        id: 'caixa',
        title: 'Caixa',
        path: '/restaurant/financeiro?subtab=caixa',
        aliases: ['/restaurant/financeiro/caixa', '/restaurant/finances/cash'],
        canonicalPermission: 'caixa.visualizar',
        icon: DollarSign,
      },
      {
        id: 'contas-receber',
        title: 'Contas a Receber',
        path: '/restaurant/financeiro?subtab=receber',
        aliases: ['/restaurant/financeiro/contas-receber', '/restaurant/finances/receivables'],
        canonicalPermission: 'financeiro.visualizar',
        icon: TrendingUp,
      },
      {
        id: 'contas-pagar',
        title: 'Contas a Pagar',
        path: '/restaurant/financeiro?subtab=pagar',
        aliases: ['/restaurant/financeiro/contas-pagar', '/restaurant/finances/payables'],
        canonicalPermission: 'financeiro.visualizar',
        icon: CreditCard,
      },
      {
        id: 'faturas',
        title: 'Faturas QFomeAI',
        path: '/restaurant/financeiro?subtab=faturas',
        aliases: ['/restaurant/financeiro/faturas', '/restaurant/fatura', '/restaurant/finances/invoice'],
        canonicalPermission: 'financeiro.visualizar',
        icon: FileText,
      },
    ]
  },
  {
    id: 'configuracoes',
    title: 'CONFIGURAÇÕES',
    icon: Settings,
    items: [
      {
        id: 'dados',
        title: 'Dados do Restaurante',
        path: '/restaurant/configuracoes/dados',
        aliases: ['/restaurant/configuracoes/dados', '/restaurant/settings/account'],
        canonicalPermission: 'configuracoes.visualizar',
        icon: Store,
      },
      {
        id: 'horarios',
        title: 'Horários',
        path: '/restaurant/configuracoes/horarios',
        aliases: ['/restaurant/configuracoes/horarios', '/restaurant/schedules'],
        canonicalPermission: 'configuracoes.visualizar',
        icon: Clock,
      },
      {
        id: 'entrega',
        title: 'Entrega e Taxas',
        path: '/restaurant/configuracoes/entrega',
        aliases: ['/restaurant/configuracoes/entrega', '/restaurant/delivery-areas'],
        canonicalPermission: 'configuracoes.visualizar',
        icon: MapPin,
      },
      {
        id: 'pagamentos',
        title: 'Formas de Pagamento',
        path: '/restaurant/configuracoes/pagamentos',
        aliases: ['/restaurant/configuracoes/pagamentos', '/restaurant/settings/payments'],
        canonicalPermission: 'configuracoes.visualizar',
        icon: CreditCard,
      },
      {
        id: 'impressao',
        title: 'Impressão',
        path: '/restaurant/configuracoes/impressao',
        aliases: ['/restaurant/configuracoes/impressao', '/restaurant/settings/print'],
        canonicalPermission: 'configuracoes.visualizar',
        icon: Printer,
      },
      {
        id: 'integracoes',
        title: 'Integrações',
        path: '/restaurant/configuracoes/integracoes',
        aliases: ['/restaurant/configuracoes/integracoes', '/restaurant/settings/integration'],
        canonicalPermission: 'configuracoes.visualizar',
        icon: Sliders,
      },
      {
        id: 'whatsapp',
        title: 'WhatsApp',
        path: '/restaurant/configuracoes/whatsapp',
        aliases: ['/restaurant/configuracoes/whatsapp', '/restaurant/settings/whatsapp'],
        canonicalPermission: 'configuracoes.visualizar',
        icon: MessageSquare,
      },
      {
        id: 'seguranca',
        title: 'Segurança da Conta',
        path: '/restaurant/configuracoes/seguranca',
        aliases: ['/restaurant/configuracoes/seguranca', '/restaurant/settings/password'],
        canonicalPermission: 'configuracoes.visualizar',
        icon: Lock,
      },
    ]
  }
];

export default function RestaurantLayout({ children, pendingOrdersCount }: RestaurantLayoutProps) {
  const { profile, user, refreshUser, isRestaurant, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>(['visao_geral', 'operacao']);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [restaurantSlug, setRestaurantSlug] = useState<string>('');
  const [restaurantFeatures, setRestaurantFeatures] = useState<RestaurantFeatures>(DEFAULT_RESTAURANT_FEATURES);

  useEffect(() => {
    if (!profile?.restaurantId) return;
    const fetchRestaurantData = async () => {
      try {
        const docRef = doc(db, 'restaurants', profile.restaurantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRestaurantSlug(data.slug || '');
          setRestaurantFeatures(normalizeRestaurantFeatures(data));
        }
      } catch (error) {
        console.error("Error fetching restaurant features:", error);
      }
    };
    fetchRestaurantData();
  }, [profile?.restaurantId]);

  useEffect(() => {
    if (!profile?.restaurantId) return;
    const fetchPendingInvoices = async () => {
      const q = query(
        collection(db, 'invoices'), 
        where('restaurante_id', '==', profile.restaurantId),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);
      setPendingInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchPendingInvoices();
  }, [profile?.restaurantId]);
  
  const isCheckingTimeoutRef = React.useRef(false);

  useEffect(() => {
    const restaurantId = profile?.restaurantId;
    if (!restaurantId || !user || (!isRestaurant && !isAdmin)) return;

    const checkTimeouts = async () => {
      if (document.hidden) return;
      if (isCheckingTimeoutRef.current) return;
      isCheckingTimeoutRef.current = true;

      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/orders/check-timeout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ restaurantId })
        });
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          console.warn('[Order Timeout Frontend] status:', response.status, errBody.error || response.statusText || 'check failed');
        }
      } catch (err) {
        console.error('[Order Timeout Frontend] error during check:', err);
      } finally {
        isCheckingTimeoutRef.current = false;
      }
    };

    checkTimeouts();
    const intervalId = setInterval(checkTimeouts, 60 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [profile?.restaurantId, user?.uid, isRestaurant, isAdmin]);

  // Helper to check if item is allowed for current user & features
  const isItemAllowed = (item: MenuItemConfig): boolean => {
    if (!profile) return false;
    const role = (profile.role || profile.tipo_usuario || '').toUpperCase();

    // DRIVER gets exclusive navigation in /entregador
    if (role === 'DRIVER') return false;

    // Feature flag check
    if (item.featureFlagKey) {
      if (restaurantFeatures[item.featureFlagKey as keyof RestaurantFeatures] === false) {
        return false;
      }
    }

    // Role level check
    if (profile.accountType === AccountType.RESTAURANT || role === 'OWNER' || role === 'RESTAURANT_ADMIN') {
      return true;
    }

    // CASHIER special allowed items check
    if (role === 'CASHIER') {
      const cashierAllowedIds = ['pedidos', 'balcao', 'mesas', 'entregas', 'caixa'];
      if (!cashierAllowedIds.includes(item.id)) return false;
    }

    // WAITER special check in restaurant panel
    if (role === 'WAITER') {
      const waiterAllowedIds = ['mesas', 'pedidos'];
      if (!waiterAllowedIds.includes(item.id)) return false;
    }

    // KITCHEN special check in restaurant panel
    if (role === 'KITCHEN') {
      const kitchenAllowedIds = ['cozinha', 'pedidos'];
      if (!kitchenAllowedIds.includes(item.id)) return false;
    }

    if (item.allowedRoles && item.allowedRoles.map(r => r.toUpperCase()).includes(role)) {
      return true;
    }

    if (item.canonicalPermission) {
      return hasPermission(profile, item.canonicalPermission);
    }

    return false;
  };

  // Helper to check if item is active
  const isItemActive = (item: MenuItemConfig): boolean => {
    const currPath = location.pathname;
    const currFull = location.pathname + location.search;

    if (currFull === item.path || currPath === item.path) return true;
    if (item.aliases && item.aliases.some(a => currFull === a || currPath === a || (a !== '/restaurant' && currPath.startsWith(a + '/')))) {
      return true;
    }
    return false;
  };

  // Preserve active group expanded on route change
  useEffect(() => {
    OFFICIAL_NAV_GROUPS.forEach(group => {
      const allowedItems = group.items.filter(isItemAllowed);
      const hasActiveChild = allowedItems.some(isItemActive);
      if (hasActiveChild) {
        setExpandedGroupIds(prev => prev.includes(group.id) ? prev : [...prev, group.id]);
      }
    });
    setIsMobileMenuOpen(false);
  }, [location.pathname, profile?.role, profile?.tipo_usuario, restaurantFeatures]);

  useEffect(() => {
    const handleCollapse = () => {
      setIsCollapsed(true);
      setIsMobileMenuOpen(false);
    };
    window.addEventListener('collapse-menu', handleCollapse);
    return () => window.removeEventListener('collapse-menu', handleCollapse);
  }, []);

  const toggleGroup = (groupId: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }

    // Accordion mode on mobile (only one group open at a time)
    if (isMobileMenuOpen || window.innerWidth < 1024) {
      setExpandedGroupIds(prev => prev.includes(groupId) ? [] : [groupId]);
    } else {
      setExpandedGroupIds(prev =>
        prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
      );
    }
  };

  // Filter groups to render
  const visibleGroups = OFFICIAL_NAV_GROUPS.map(group => {
    const allowedItems = group.items.filter(isItemAllowed);
    return {
      ...group,
      items: allowedItems
    };
  }).filter(group => group.items.length > 0);

  const isFixedOperationalRoute = location.pathname.includes('/orders') || location.pathname.includes('/operacao') || location.pathname.includes('/cozinha');

  return (
    <div className={`flex bg-stone-100 overflow-x-hidden ${isFixedOperationalRoute ? 'h-screen max-h-screen overflow-hidden' : 'min-h-screen'}`}>
      {user && !user.emailVerified && !isRestaurantTeamMember(profile) ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-screen text-center p-8 bg-stone-50">
          <div className="bg-white p-12 rounded-[2rem] border border-stone-200 shadow-xl max-w-lg w-full">
            <div className="bg-amber-100 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8">
              <Mail className="w-10 h-10 text-amber-600" />
            </div>
            <h2 className="text-3xl font-bold text-stone-800 mb-4">Confirme seu E-mail</h2>
            <p className="text-stone-500 mb-8 leading-relaxed">
              Para acessar o painel do seu restaurante, você precisa confirmar seu endereço de e-mail. 
              Verifique sua caixa de entrada e clique no link de confirmação que enviamos para <br/>
              <strong className="text-stone-800">{user.email}</strong>.
            </p>
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => refreshUser()}
                className="flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-[0.98]"
              >
                <RefreshCw className="w-5 h-5" />
                Já confirmei, atualizar página
              </button>
              <button
                type="button"
                onClick={() => auth.signOut()}
                className="text-stone-400 font-bold hover:text-stone-600 transition-all py-2"
              >
                Sair da conta
              </button>
            </div>
            <p className="mt-8 text-xs text-stone-400">
              Não recebeu o e-mail? Verifique sua pasta de spam ou lixo eletrônico.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Sidebar Overlay */}
          {isMobileMenuOpen && (
            <div 
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] lg:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}

          {/* Sidebar */}
          <aside className={`
            fixed inset-y-0 left-0 bg-white border-r border-stone-200 flex flex-col z-[70] transition-all duration-300 ease-in-out lg:sticky lg:top-0 lg:h-screen max-w-full overflow-x-hidden
            ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
            ${isCollapsed && !isMobileMenuOpen ? 'lg:w-20' : 'lg:w-64'}
          `}
          onMouseEnter={() => { if (isCollapsed) setIsCollapsed(false); }}
          onMouseLeave={() => { if (!isMobileMenuOpen) setIsCollapsed(true); }}
          >
            {/* Header */}
            <div className={`p-5 border-b border-stone-100 flex items-center ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : 'justify-between'} gap-2 shrink-0`}>
              {(!isCollapsed || isMobileMenuOpen) && (
                <div className="flex items-center gap-2 overflow-hidden">
                  <h1 className="text-xl font-extrabold text-emerald-600 truncate tracking-tight">Qfomeai <span className="text-stone-400 text-xs font-normal">Partner</span></h1>
                  <Link to={restaurantSlug ? `/${restaurantSlug}` : "/"} className="p-1.5 hover:bg-stone-100 rounded-xl transition-all text-stone-400 hover:text-emerald-600 shrink-0" title="Ver Loja">
                    <Home className="w-4 h-4" />
                  </Link>
                </div>
              )}
              {isCollapsed && !isMobileMenuOpen && (
                <Link to={restaurantSlug ? `/${restaurantSlug}` : "/"} className="p-1.5 hover:bg-stone-100 rounded-xl transition-all text-stone-400 hover:text-emerald-600" title="Ver Loja">
                  <Home className="w-5 h-5" />
                </Link>
              )}
              <button 
                type="button" 
                onClick={() => setIsMobileMenuOpen(false)} 
                className="lg:hidden p-2 hover:bg-stone-100 rounded-xl transition-all text-stone-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Nav Groups Container */}
            <nav className="flex-1 p-3 space-y-3 overflow-y-auto custom-scrollbar no-scrollbar min-h-0">
              {visibleGroups.map(group => {
                const GroupIcon = group.icon;
                const isGroupExpanded = expandedGroupIds.includes(group.id);
                const hasActiveItem = group.items.some(isItemActive);

                return (
                  <div key={group.id} className="space-y-1">
                    {/* Group Header Button */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      title={isCollapsed && !isMobileMenuOpen ? group.title : undefined}
                      className={`w-full flex items-center ${isCollapsed && !isMobileMenuOpen ? 'justify-center py-2.5' : 'justify-between px-3 py-2'} rounded-xl transition-all text-xs font-bold tracking-wider ${
                        hasActiveItem 
                          ? 'text-emerald-700 bg-emerald-50/60' 
                          : 'text-stone-500 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <GroupIcon className={`w-4 h-4 shrink-0 ${hasActiveItem ? 'text-emerald-600' : 'text-stone-400'}`} />
                        {(!isCollapsed || isMobileMenuOpen) && (
                          <span className="truncate uppercase text-[11px] font-bold">{group.title}</span>
                        )}
                      </div>
                      {(!isCollapsed || isMobileMenuOpen) && (
                        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-stone-400 transition-transform duration-200 ${isGroupExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </button>

                    {/* Submenu Items */}
                    {isGroupExpanded && (!isCollapsed || isMobileMenuOpen) && (
                      <div className="ml-3 pl-2.5 border-l-2 border-stone-100 space-y-0.5 mt-1">
                        {group.items.map(item => {
                          const ItemIcon = item.icon;
                          const active = isItemActive(item);
                          const isPedidos = item.id === 'pedidos';

                          return (
                            <Link
                              key={item.id}
                              to={item.path}
                              onClick={() => setIsMobileMenuOpen(false)}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all min-h-[40px] ${
                                active
                                  ? 'bg-emerald-600 text-white font-bold shadow-sm shadow-emerald-200'
                                  : 'text-stone-600 hover:text-emerald-600 hover:bg-stone-50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <ItemIcon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-stone-400'}`} />
                                <span className="truncate">{item.title}</span>
                              </div>
                              {isPedidos && pendingOrdersCount > 0 && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold animate-pulse ${
                                  active ? 'bg-white text-emerald-700' : 'bg-red-500 text-white'
                                }`}>
                                  {pendingOrdersCount}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Footer Buttons */}
            <div className="p-3 border-t border-stone-100 space-y-1 shrink-0">
              <button 
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={`hidden lg:flex w-full items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-3'} py-2 text-stone-400 font-semibold hover:text-emerald-600 transition-all rounded-xl hover:bg-stone-50 text-xs`}
                title={isCollapsed ? "Expandir menu" : "Recolher menu"}
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                {!isCollapsed && <span className="truncate">Recolher Menu</span>}
              </button>
              <button 
                type="button"
                onClick={() => auth.signOut()}
                title={isCollapsed && !isMobileMenuOpen ? "Sair" : undefined}
                className={`w-full flex items-center ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : 'gap-3 px-3'} py-2.5 text-stone-500 font-semibold hover:text-red-600 transition-all rounded-xl hover:bg-red-50 text-xs min-h-[44px]`}
              >
                <LogOut className="w-4 h-4 text-stone-400 group-hover:text-red-600" />
                {(!isCollapsed || isMobileMenuOpen) && <span className="truncate">Sair</span>}
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className={`flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden ${isFixedOperationalRoute ? 'h-full max-h-full min-h-0 overflow-hidden' : ''}`}>
            <EmailVerificationBanner />
            
            {/* Banner de Faturas */}
            {pendingInvoices.length > 0 && (
              (() => {
                const now = new Date();
                const overdue = pendingInvoices.some(inv => new Date(inv.vencimento) < now);
                
                if (overdue) {
                  return (
                    <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-800 shrink-0">
                      <AlertTriangle className="w-6 h-6 shrink-0" />
                      <p className="text-sm font-bold">
                        Atenção: Você possui faturas vencidas! O não pagamento poderá resultar no cancelamento do recebimento de pedidos. Por favor, regularize sua situação.
                      </p>
                    </div>
                  );
                }
                
                return (
                  <div className="mx-4 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-800 shrink-0">
                    <DollarSign className="w-6 h-6 shrink-0" />
                    <p className="text-sm font-bold">
                      Lembrete: Você possui faturas pendentes. Por favor, verifique e realize o pagamento para evitar interrupções.
                    </p>
                  </div>
                );
              })()
            )}

            <header className="bg-white border-b border-stone-200 p-3.5 sticky top-0 z-50 lg:hidden flex items-center justify-between shrink-0">
              <button 
                type="button"
                onClick={() => setIsMobileMenuOpen(true)} 
                className="p-2 hover:bg-stone-100 rounded-xl transition-all text-stone-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Abrir menu"
              >
                <Menu className="w-6 h-6" />
              </button>
              <h1 className="text-lg font-extrabold text-emerald-600">Qfomeai <span className="text-stone-400 text-xs font-normal">Partner</span></h1>
              <Link to={restaurantSlug ? `/${restaurantSlug}` : "/"} className="p-2 text-stone-500 hover:bg-stone-100 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center">
                <Home className="w-5 h-5" />
              </Link>
            </header>

            <div className={isFixedOperationalRoute ? "p-1 sm:p-2.5 flex-1 flex flex-col min-h-0 min-w-0 max-w-full h-full overflow-hidden" : "p-3 sm:p-4 lg:p-8"}>
              {children}
            </div>
          </main>
        </>
      )}
    </div>
  );
}

