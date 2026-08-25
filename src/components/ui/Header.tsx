import React from 'react';

export interface PageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  action,
  icon: Icon,
  className = '',
}) => {
  return (
    <div className={`bg-white p-4 sm:p-5 rounded-3xl border border-stone-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${className}`}>
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        {Icon && (
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100 shadow-2xs">
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold text-stone-800 tracking-tight truncate">{title}</h1>
          {description && (
            <p className="text-xs sm:text-sm text-stone-500 font-medium mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">{action}</div>}
    </div>
  );
};

export interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  action,
  badge,
  className = '',
}) => {
  return (
    <div className={`flex items-start sm:items-center justify-between gap-3 pb-2 border-b border-stone-100 ${className}`}>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-bold text-stone-800 tracking-tight">{title}</h3>
          {badge}
        </div>
        {description && <p className="text-xs text-stone-500 font-medium mt-0.5">{description}</p>}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
};
