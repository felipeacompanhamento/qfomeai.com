import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, Receipt, User, LogOut, WifiOff, Wifi } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import { auth } from '../../firebase';
import { signOut } from 'firebase/auth';

interface WaiterLayoutProps {
  children: React.ReactNode;
}

export function WaiterLayout({ children }: WaiterLayoutProps) {
  const { profile } = useAuth();
  const location = useLocation();
  const { isOnline, justReconnected } = useConnectivity();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signing out waiter:', err);
    }
  };

  // Bottom navigation items
  const navItems = [
    {
      label: 'Mesas',
      path: '/garcom/mesas',
      icon: LayoutGrid,
    },
    {
      label: 'Comandas',
      path: '/garcom/comandas',
      icon: Receipt,
    },
    {
      label: 'Perfil',
      path: '/garcom/perfil',
      icon: User,
    },
  ];

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col pb-24 md:pb-28">
      {/* Offline Status Bar */}
      {!isOnline && (
        <div 
          role="status"
          aria-live="polite"
          className="bg-amber-600 text-white text-xs font-bold py-1.5 px-4 text-center flex items-center justify-center gap-2 sticky top-0 z-50 animate-in fade-in"
        >
          <WifiOff className="w-4 h-4 shrink-0" />
          <span>Sem conexão com a internet. Visualização mantida em modo leitura.</span>
        </div>
      )}

      {/* Just Reconnected Status Bar */}
      {isOnline && justReconnected && (
        <div 
          role="status"
          aria-live="polite"
          className="bg-emerald-600 text-white text-xs font-bold py-1.5 px-4 text-center flex items-center justify-center gap-2 sticky top-0 z-50 animate-in fade-in"
        >
          <Wifi className="w-4 h-4 shrink-0" />
          <span>Conexão restabelecida.</span>
        </div>
      )}

      {/* Mini top header for branding */}
      <header className="sticky top-0 z-40 bg-white border-b border-stone-200/80 px-4 py-3 shadow-xs">
        <div className="max-w-md md:max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-black text-sm tracking-tighter shadow-sm">
              QF
            </div>
            <div>
              <span className="text-xs font-black text-stone-800 block leading-tight">QFomeAI</span>
              <span className="text-xs text-emerald-600 font-bold tracking-wider uppercase">Garçom</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-600 max-w-[140px] truncate">
              {profile?.nome || profile?.name || 'Garçom'}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 text-stone-400 hover:text-rose-500 rounded-lg hover:bg-stone-50 transition-colors cursor-pointer"
              title="Sair"
              aria-label="Sair"
              id="waiter-logout-btn"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content container */}
      <main className="flex-grow max-w-md md:max-w-2xl w-full mx-auto px-4 py-4 md:py-6">
        {children}
      </main>

      {/* Fixed bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200/80 shadow-lg px-4 pb-safe">
        <div className="max-w-md md:max-w-2xl mx-auto flex items-center justify-around h-16 md:h-18">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <NavLink
                key={item.path}
                to={item.path}
                id={`nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center justify-center w-20 h-full transition-colors relative cursor-pointer group ${
                  isActive ? 'text-emerald-600' : 'text-stone-400 hover:text-stone-600'
                }`}
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                <Icon className={`w-5 h-5 mb-0.5 transition-transform group-active:scale-95 ${isActive ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
                <span className="text-xs font-bold tracking-tight">
                  {item.label}
                </span>
                
                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute bottom-1 w-1.5 h-1.5 bg-emerald-600 rounded-full" />
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
