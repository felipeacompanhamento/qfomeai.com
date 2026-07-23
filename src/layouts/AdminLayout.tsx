import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, Store, Users, ShoppingBag, Tag, Map, 
  Flag, LogOut, Bell, Image as ImageIcon, BarChart3, Menu, X, ChevronRight, ChevronLeft, Home, DollarSign
} from 'lucide-react';
import { auth } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

interface AdminLayoutProps {
  children: React.ReactNode;
  pendingRestaurantsCount: number;
}

export default function AdminLayout({ children, pendingRestaurantsCount }: AdminLayoutProps) {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { path: '/admin-dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin-dashboard/restaurantes', label: 'Restaurantes', icon: Store, badge: pendingRestaurantsCount },
    { path: '/admin-dashboard/usuarios', label: 'Usuários', icon: Users },
    { path: '/admin-dashboard/pedidos', label: 'Pedidos', icon: ShoppingBag },
    { path: '/admin-dashboard/financeiro', label: 'Financeiro', icon: DollarSign },
    { path: '/admin-dashboard/bairros', label: 'Bairros', icon: Map },
    { path: '/admin-dashboard/cupons', label: 'Cupons', icon: Tag },
    { path: '/admin-dashboard/categorias', label: 'Categorias', icon: Map },
    { path: '/admin-dashboard/banners', label: 'Banners', icon: ImageIcon },
    { path: '/admin-dashboard/denuncias', label: 'Denúncias', icon: Flag },
    { path: '/admin-dashboard/notificacoes', label: 'Notificações', icon: Bell },
    { path: '/admin-dashboard/relatorios', label: 'Relatórios', icon: BarChart3 },
  ];

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-stone-200">
      <div className={`p-6 border-b border-stone-100 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} gap-2`}>
        {!isCollapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <h1 className="text-2xl font-bold text-emerald-600 truncate">Qfomeai <span className="text-stone-400 text-sm font-normal">Admin</span></h1>
            <Link to="/" className="p-2 hover:bg-stone-100 rounded-xl transition-all text-stone-400 hover:text-emerald-600" title="Ver Home">
              <Home className="w-5 h-5" />
            </Link>
          </div>
        )}
        {isCollapsed && (
          <Link to="/" className="p-2 hover:bg-stone-100 rounded-xl transition-all text-stone-400 hover:text-emerald-600" title="Ver Home">
            <Home className="w-5 h-5" />
          </Link>
        )}
        <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 hover:bg-stone-100 rounded-xl transition-all">
          <X className="w-5 h-5 text-stone-400" />
        </button>
      </div>
      
      <nav className="flex-1 overflow-y-auto p-4 space-y-1 no-scrollbar">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link 
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileMenuOpen(false)}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} p-3 rounded-xl font-bold transition-all group ${isActive ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-100' : 'text-stone-500 hover:bg-stone-50'}`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-white' : 'text-stone-400 group-hover:text-emerald-500'}`} />
                {!isCollapsed && <span className="text-sm truncate">{item.label}</span>}
              </div>
              {!isCollapsed && (
                item.badge ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isActive ? 'bg-white text-emerald-600' : 'bg-red-500 text-white'}`}>{item.badge}</span>
                ) : (
                  <ChevronRight className={`w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'text-white' : 'text-stone-300'}`} />
                )
              )}
              {isCollapsed && item.badge ? (
                <div className="absolute right-2 top-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              ) : null}
            </Link>
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
          {!isCollapsed && <span className="text-sm">Recolher</span>}
        </button>
        <button 
          onClick={() => auth.signOut()}
          title={isCollapsed ? "Sair" : undefined}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} p-3 text-stone-500 font-bold hover:text-red-500 transition-all rounded-xl hover:bg-red-50 group`}
        >
          <LogOut className="w-5 h-5 text-stone-400 group-hover:text-red-500" />
          {!isCollapsed && <span className="text-sm">Sair do Painel</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 flex overflow-hidden">
      {/* Sidebar for Desktop */}
      <aside className={`hidden lg:block ${isCollapsed ? 'w-24' : 'w-72'} flex-shrink-0 transition-all duration-300 ease-in-out`}>
        <div className="sticky top-0 h-screen">
          {renderSidebarContent()}
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/50 z-[60] lg:hidden backdrop-blur-sm"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-72 z-[70] lg:hidden"
            >
              {renderSidebarContent()}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar for mobile only */}
        <header className="lg:hidden bg-white border-b border-stone-200 h-16 flex items-center justify-between px-4 sticky top-0 z-50">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-stone-500 hover:bg-stone-100 rounded-xl transition-all"
          >
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-emerald-600">Qfomeai <span className="text-stone-400 text-xs font-normal">Admin</span></h1>
          <Link to="/" className="p-2 text-stone-500 hover:bg-stone-100 rounded-xl transition-all">
            <Home className="w-6 h-6" />
          </Link>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 no-scrollbar">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
