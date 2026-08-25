import React from 'react';

type TabId = 'novo' | 'confirmado' | 'cozinha' | 'entrega';

interface OrdersMobileTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  statusCounts: Record<TabId, number>;
}

const TABS: { id: TabId; label: string; color: string }[] = [
  { id: 'novo', label: 'Novo', color: 'bg-blue-500' },
  { id: 'confirmado', label: 'Confirmado', color: 'bg-stone-600' },
  { id: 'cozinha', label: 'Cozinha', color: 'bg-amber-500' },
  { id: 'entrega', label: 'Entrega', color: 'bg-emerald-500' }
];

export const OrdersMobileTabs: React.FC<OrdersMobileTabsProps> = ({
  activeTab,
  onTabChange,
  statusCounts
}) => {
  return (
    <div className="md:hidden bg-white border-b border-stone-200/80 px-2 py-1.5 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0 touch-pan-x">
      {TABS.map((tab) => {
        const count = statusCounts[tab.id] || 0;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 min-w-[72px] min-h-[44px] py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 border cursor-pointer active:scale-[0.98] ${
              isActive
                ? 'bg-stone-900 text-white border-stone-900 shadow-2xs'
                : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tab.color}`} />
              <span className="truncate text-[11px] sm:text-xs">{tab.label}</span>
            </div>
            <span className={`text-[10px] sm:text-xs font-extrabold px-1.5 py-0.2 rounded-full ${
              isActive ? 'bg-white/20 text-white' : 'bg-stone-200/80 text-stone-700'
            }`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};


