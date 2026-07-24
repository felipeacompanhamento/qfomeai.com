import React from 'react';
import { Package, Navigation, History, User } from 'lucide-react';
import { DriverTab } from '../types';

interface DriverBottomNavigationProps {
  activeTab: DriverTab;
  setActiveTab: (tab: DriverTab) => void;
  newOrdersCount: number;
  routeOrdersCount: number;
}

export const DriverBottomNavigation: React.FC<DriverBottomNavigationProps> = ({
  activeTab,
  setActiveTab,
  newOrdersCount,
  routeOrdersCount
}) => {
  const tabs: { id: DriverTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'novas', label: 'Novas', icon: Package, badge: newOrdersCount },
    { id: 'rota', label: 'Rota', icon: Navigation, badge: routeOrdersCount },
    { id: 'historico', label: 'Histórico', icon: History },
    { id: 'conta', label: 'Conta', icon: User }
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-stone-200 shadow-lg px-2 pt-1.5"
      style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition-all ${
                isActive
                  ? 'text-emerald-700 font-bold bg-emerald-50/80'
                  : 'text-stone-500 font-medium hover:text-stone-800'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600 stroke-[2.5]' : 'stroke-[1.8]'}`} />
                {!!tab.badge && tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-emerald-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
