import React from 'react';

interface OrdersMobileTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  statusCounts: {
    novo: number;
    confirmado: number;
    cozinha: number;
    entrega: number;
  };
}

const TABS = [
  { id: 'novo', label: 'Novo', color: 'bg-blue-500' },
  { id: 'confirmado', label: 'Confirmado', color: 'bg-indigo-500' },
  { id: 'cozinha', label: 'Cozinha', color: 'bg-amber-500' },
  { id: 'entrega', label: 'Entrega', color: 'bg-emerald-500' }
];

export const OrdersMobileTabs: React.FC<OrdersMobileTabsProps> = ({
  activeTab,
  onTabChange,
  statusCounts
}) => {
  return (
    <div className="md:hidden bg-white border-b border-stone-200 px-2 py-1.5 flex gap-1 overflow-x-auto no-scrollbar shrink-0">
      {TABS.map((tab) => {
        const count = (statusCounts as any)[tab.id] || 0;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 min-w-[75px] py-2 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 border ${
              isActive
                ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${tab.color}`} />
              <span className="truncate">{tab.label}</span>
            </div>
            <span className={`text-[10px] font-black px-1.5 py-0.2 rounded-full ${
              isActive ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-700'
            }`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
