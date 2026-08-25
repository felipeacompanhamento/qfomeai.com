import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'pill' | 'emerald';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  variant = 'emerald',
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-1.5 p-1 bg-stone-100 rounded-2xl overflow-x-auto custom-scrollbar w-full ${className}`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        const activeClass =
          variant === 'emerald'
            ? 'bg-emerald-600 text-white shadow-xs'
            : 'bg-white text-stone-900 shadow-xs border border-stone-200/80';

        const inactiveClass = 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60';

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
              isActive ? activeClass : inactiveClass
            }`}
          >
            {Icon && <Icon className={`w-4 h-4 ${isActive && variant === 'emerald' ? 'text-white' : 'text-stone-500'}`} />}
            <span>{tab.label}</span>
            {tab.badge && <span className="ml-1">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
};

export interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({ children, className = '' }) => {
  return (
    <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-stone-50/80 rounded-2xl border border-stone-200/80 ${className}`}>
      {children}
    </div>
  );
};
