import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingBag, Utensils, Clock, Settings, 
  X, LogOut, ChevronDown, ChevronRight, Tags, PlusCircle, Plus, 
  Percent, Users, CreditCard, MapPin, User, Lock, Menu, Printer, TrendingUp, ChevronLeft, Home, DollarSign, ExternalLink, MessageSquare, Bike
} from 'lucide-react';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import EmailVerificationBanner from '../components/EmailVerificationBanner';
import { Mail, AlertCircle, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

interface RestaurantLayoutProps {
  children: React.ReactNode;
  pendingOrdersCount: number;
}

export default function RestaurantLayout({ children, pendingOrdersCount }: RestaurantLayoutProps) {
  const { profile, user, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedMenus, setExpandedMenus] = useState<string[]>(['Cardápio', 'Configurações']);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState<any[]>([]);
  const [restaurantSlug, setRestaurantSlug] = useState<string>('');

  React.useEffect(() => {
    if (!profile?.restaurantId) return;
    const fetchRestaurantData = async () => {
      try {
        const docRef = doc(db, 'restaurants', profile.restaurantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRestaurantSlug(docSnap.data().slug || '');
        }
      } catch (error) {
        console.error("Error fetching restaurant slug:", error);
      }
    };
    fetchRestaurantData();
  }, [profile?.restaurantId]);

  React.useEffect(() => {
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
  
  React.useEffect(() => {
    const restaurantId = profile?.restaurantId;
    if (!restaurantId || !user) return;

    const checkTimeouts = async () => {
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
          console.error('[Order Timeout Frontend] failed to trigger check:', response.statusText);
        }
      } catch (err) {
        console.error('[Order Timeout Frontend] error during check:', err);
      }
    };

    // Run once on mount/load
    checkTimeouts();

    // Run every 1 minute
    const intervalId = setInterval(checkTimeouts, 60 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [profile?.restaurantId, user]);

  React.useEffect(() => {
    // Collapse menu on route change
    setIsCollapsed(true);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    const handleCollapse = () => {
      setIsCollapsed(true);
      setIsMobileMenuOpen(false);
    };
    window.addEventListener('collapse-menu', handleCollapse);
    return () => window.removeEventListener('collapse-menu', handleCollapse);
  }, []);

  const toggleMenu = (title: string) => {
    if (isCollapsed) {
      setIsCollapsed(false);
      if (!expandedMenus.includes(title)) {
        setExpandedMenus(prev => [...prev, title]);
      }
      return;
    }
    setExpandedMenus(prev => 
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    );
  };

  const navItems = [
    { title: "Dashboard", path: "/restaurant/dashboard", icon: LayoutDashboard },
    { title: "Desempenho", path: "/restaurant/desempenho", icon: TrendingUp },
    { title: "Pedidos", path: "/restaurant/orders", icon: ShoppingBag, badge: pendingOrdersCount },
    {
      title: "Cardápio",
      icon: Utensils,
      children: [
        { title: "Categorias", path: "/restaurant/menu/categories", icon: Tags },
        { title: "Produtos", path: "/restaurant/menu/items", icon: PlusCircle },
        { title: "Tamanhos", path: "/restaurant/menu/sizes", icon: Plus },
        { title: "Adicionais", path: "/restaurant/menu/extras", icon: Plus },
        { title: "Grupos de Opções", path: "/restaurant/menu/grupos", icon: Plus },
        { title: "Promoções", path: "/restaurant/menu/promotions", icon: Percent }
      ]
    },
    { title: "Bairros e Taxas", path: "/restaurant/delivery-areas", icon: MapPin },
    {
      title: "Entregador",
      icon: Bike,
      children: [
        { title: "Lista de Entregadores", path: "/restaurant/drivers", icon: Users },
        { title: "Cadastrar Entregador", path: "/restaurant/drivers/new", icon: PlusCircle },
        { title: "Entregas Atribuídas", path: "/restaurant/drivers/deliveries", icon: Clock },
        { title: "Configurações de Entrega", path: "/restaurant/drivers/settings", icon: Settings }
      ]
    },
    { title: "Faturas", path: "/restaurant/fatura", icon: DollarSign },
    { title: "Horários", path: "/restaurant/schedules", icon: Clock },
    {
      title: "Configurações",
      icon: Settings,
      children: [
        { title: "Formas de pagamento", path: "/restaurant/settings/payments", icon: CreditCard },
        { title: "Conta", path: "/restaurant/settings/account", icon: User },
        { title: "Alterar Senha", path: "/restaurant/settings/password", icon: Lock },
        { title: "Impressão", path: "/restaurant/settings/print", icon: Printer },
        { title: "Integração", path: "/restaurant/settings/integration", icon: ExternalLink },
        { title: "WhatsApp", path: "/restaurant/settings/whatsapp", icon: MessageSquare }
      ]
    }
  ];

  return (
    <div className="flex min-h-screen bg-stone-100">
      {user && !user.emailVerified ? (
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
                onClick={() => refreshUser()}
                className="flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-[0.98]"
              >
                <RefreshCw className="w-5 h-5" />
                Já confirmei, atualizar página
              </button>
              <button
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
            fixed inset-y-0 left-0 bg-white border-r border-stone-200 flex flex-col z-[70] transition-all duration-300 ease-in-out lg:sticky lg:top-0 lg:h-screen
            ${isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
            ${isCollapsed && !isMobileMenuOpen ? 'lg:w-24' : 'lg:w-64'}
          `}
          onMouseEnter={() => { if (isCollapsed) setIsCollapsed(false); }}
          onMouseLeave={() => { if (!isMobileMenuOpen) setIsCollapsed(true); }}
          >
            <div className={`p-6 border-b border-stone-100 flex items-center ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : 'justify-between'} gap-2`}>
              {(!isCollapsed || isMobileMenuOpen) && (
                <div className="flex items-center gap-2 overflow-hidden">
                  <h1 className="text-2xl font-bold text-emerald-600 truncate">Qfomeai <span className="text-stone-400 text-sm font-normal">Partner</span></h1>
                  <Link to={restaurantSlug ? `/${restaurantSlug}` : "/"} className="p-2 hover:bg-stone-100 rounded-xl transition-all text-stone-400 hover:text-emerald-600" title="Ver Loja">
                    <Home className="w-5 h-5" />
                  </Link>
                </div>
              )}
              {isCollapsed && !isMobileMenuOpen && (
                <Link to={restaurantSlug ? `/${restaurantSlug}` : "/"} className="p-2 hover:bg-stone-100 rounded-xl transition-all text-stone-400 hover:text-emerald-600" title="Ver Loja">
                  <Home className="w-5 h-5" />
                </Link>
              )}
              <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 hover:bg-stone-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>
            
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto no-scrollbar">
              {navItems.map(item => {
                const Icon = item.icon;
                const hasChildren = item.children && item.children.length > 0;
                const isExpanded = expandedMenus.includes(item.title);
                const isActive = location.pathname === item.path || (hasChildren && item.children?.some(child => location.pathname === child.path));

                return (
                  <div key={item.title} className="space-y-1">
                    {hasChildren ? (
                      <div className="space-y-1">
                        <button
                          onClick={() => toggleMenu(item.title)}
                          title={isCollapsed && !isMobileMenuOpen ? item.title : undefined}
                          className={`w-full flex items-center ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : 'justify-between'} p-3 rounded-xl font-bold transition-all ${isActive ? 'text-emerald-600 bg-emerald-50/50' : 'text-stone-500 hover:bg-stone-50'}`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="w-5 h-5" />
                            {(!isCollapsed || isMobileMenuOpen) && <span className="truncate">{item.title}</span>}
                          </div>
                          {(!isCollapsed || isMobileMenuOpen) && <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />}
                        </button>
                        {isExpanded && (!isCollapsed || isMobileMenuOpen) && (
                          <div className="ml-4 pl-4 border-l border-stone-100 space-y-1">
                            {item.children?.map(child => {
                              const ChildIcon = child.icon;
                              const isChildActive = location.pathname === child.path;
                              return (
                                <Link
                                  key={child.path}
                                  to={child.path}
                                  className={`flex items-center gap-3 p-2 rounded-lg text-sm font-bold transition-all ${isChildActive ? 'text-emerald-600 bg-emerald-50' : 'text-stone-400 hover:text-stone-600 hover:bg-stone-50'}`}
                                >
                                  <ChildIcon className="w-4 h-4" />
                                  <span className="truncate">{child.title}</span>
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Link
                        to={item.path}
                        title={isCollapsed && !isMobileMenuOpen ? item.title : undefined}
                        className={`flex items-center ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : 'justify-between'} p-3 rounded-xl font-bold transition-all relative ${isActive ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'text-stone-500 hover:bg-stone-50'}`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5" />
                          {(!isCollapsed || isMobileMenuOpen) && <span className="truncate">{item.title}</span>}
                        </div>
                        {(!isCollapsed || isMobileMenuOpen) && item.badge ? (
                          <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse">{item.badge}</span>
                        ) : null}
                        {isCollapsed && !isMobileMenuOpen && item.badge ? (
                          <div className="absolute right-2 top-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        ) : null}
                      </Link>
                    )}
                  </div>
                );
              })}
            </nav>

            <div className="p-4 border-t border-stone-100 space-y-2">
              <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={`hidden lg:flex w-full items-center ${isCollapsed ? 'justify-center' : 'gap-3'} p-3 text-stone-500 font-bold hover:text-emerald-600 transition-all rounded-xl hover:bg-emerald-50 group`}
                title={isCollapsed ? "Expandir menu" : "Recolher menu"}
              >
                {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                {!isCollapsed && <span className="text-sm truncate">Recolher</span>}
              </button>
              <button 
                onClick={() => auth.signOut()}
                title={isCollapsed && !isMobileMenuOpen ? "Sair" : undefined}
                className={`w-full flex items-center ${isCollapsed && !isMobileMenuOpen ? 'justify-center' : 'gap-3'} p-3 text-stone-400 font-bold hover:text-red-500 transition-all rounded-xl hover:bg-red-50`}
              >
                <LogOut className="w-5 h-5" />
                {(!isCollapsed || isMobileMenuOpen) && <span className="truncate">Sair</span>}
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 flex flex-col min-w-0">
            <EmailVerificationBanner />
            
            {/* Banner de Faturas */}
            {pendingInvoices.length > 0 && (
              (() => {
                const now = new Date();
                const overdue = pendingInvoices.some(inv => new Date(inv.vencimento) < now);
                
                if (overdue) {
                  return (
                    <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-800">
                      <AlertTriangle className="w-6 h-6 shrink-0" />
                      <p className="text-sm font-bold">
                        Atenção: Você possui faturas vencidas! O não pagamento poderá resultar no cancelamento do recebimento de pedidos. Por favor, regularize sua situação.
                      </p>
                    </div>
                  );
                }
                
                return (
                  <div className="mx-4 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-800">
                    <DollarSign className="w-6 h-6 shrink-0" />
                    <p className="text-sm font-bold">
                      Lembrete: Você possui faturas pendentes. Por favor, verifique e realize o pagamento para evitar interrupções.
                    </p>
                  </div>
                );
              })()
            )}

            <header className="bg-white border-b border-stone-200 p-4 sticky top-0 z-50 lg:hidden flex items-center justify-between">
              <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
                <Menu className="w-6 h-6 text-stone-600" />
              </button>
              <h1 className="text-xl font-bold text-emerald-600">Qfomeai <span className="text-stone-400 text-xs font-normal">Partner</span></h1>
              <Link to={restaurantSlug ? `/${restaurantSlug}` : "/"} className="p-2 text-stone-500 hover:bg-stone-100 rounded-xl transition-all">
                <Home className="w-6 h-6" />
              </Link>
            </header>
            <div className={location.pathname.includes('/orders') ? "p-1 sm:p-2 flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden" : "p-4 lg:p-8"}>
              {children}
            </div>
          </main>
        </>
      )}
    </div>
  );
}
