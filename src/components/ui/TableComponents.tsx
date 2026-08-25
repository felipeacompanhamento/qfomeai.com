import React from 'react';
import { ChevronLeft, ChevronRight, Search, Inbox, AlertTriangle, Loader2 } from 'lucide-react';

export interface DataTableContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const DataTableContainer: React.FC<DataTableContainerProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden ${className}`}>
      <div className="overflow-x-auto custom-scrollbar">{children}</div>
    </div>
  );
};

export const Table: React.FC<React.TableHTMLAttributes<HTMLTableElement>> = ({ className = '', children, ...props }) => (
  <table className={`w-full text-left border-collapse font-sans ${className}`} {...props}>
    {children}
  </table>
);

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className = '', children, ...props }) => (
  <thead className={`bg-stone-50/90 border-b border-stone-200/80 ${className}`} {...props}>
    {children}
  </thead>
);

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className = '', children, ...props }) => (
  <tbody className={`divide-y divide-stone-100 bg-white ${className}`} {...props}>
    {children}
  </tbody>
);

export const TableFooter: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({ className = '', children, ...props }) => (
  <tfoot className={`bg-stone-50 font-medium text-stone-700 border-t border-stone-200 ${className}`} {...props}>
    {children}
  </tfoot>
);

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  isGroupHeader?: boolean;
}

export const TableRow: React.FC<TableRowProps> = ({ className = '', isGroupHeader = false, children, ...props }) => (
  <tr
    className={`${
      isGroupHeader
        ? 'bg-stone-50/80 border-y border-stone-200/60 font-bold text-stone-700'
        : 'hover:bg-stone-50/60 transition-colors focus-within:bg-stone-50/80'
    } ${className}`}
    {...props}
  >
    {children}
  </tr>
);

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
}

export const TableHead: React.FC<TableHeadProps> = ({ className = '', align = 'left', children, ...props }) => {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th
      scope="col"
      className={`px-4 py-3.5 sm:px-6 sm:py-4 text-[11px] font-extrabold text-stone-500 uppercase tracking-wider select-none ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </th>
  );
};

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: 'left' | 'center' | 'right';
}

export const TableCell: React.FC<TableCellProps> = ({ className = '', align = 'left', children, ...props }) => {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <td
      className={`px-4 py-3.5 sm:px-6 sm:py-4 text-xs sm:text-sm text-stone-700 align-middle ${alignClass} ${className}`}
      {...props}
    >
      {children}
    </td>
  );
};

export interface DataTableToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const DataTableToolbar: React.FC<DataTableToolbarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  filters,
  actions,
  className = '',
}) => {
  return (
    <div className={`flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 bg-white border-b border-stone-200/80 ${className}`}>
      {onSearchChange !== undefined && (
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
          <input
            type="text"
            value={searchValue || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
      )}

      {(filters || actions) && (
        <div className="flex flex-wrap items-center gap-2 justify-between md:justify-end">
          {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
          {actions && <div className="flex flex-wrap items-center gap-2 ml-auto">{actions}</div>}
        </div>
      )}
    </div>
  );
};

export interface DataTableSkeletonProps {
  columns?: number;
  rows?: number;
}

export const DataTableSkeleton: React.FC<DataTableSkeletonProps> = ({ columns = 5, rows = 5 }) => {
  return (
    <div className="animate-pulse space-y-3 p-4">
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="flex items-center gap-4 py-3 border-b border-stone-100 last:border-none">
          {Array.from({ length: columns }).map((_, cIdx) => (
            <div
              key={cIdx}
              className={`h-4 bg-stone-200 rounded ${
                cIdx === 0 ? 'w-1/3' : cIdx === columns - 1 ? 'w-16 ml-auto' : 'w-1/6'
              }`}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export interface DataTableEmptyStateProps {
  icon?: React.ElementType;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  colSpan?: number;
}

export const DataTableEmptyState: React.FC<DataTableEmptyStateProps> = ({
  icon: Icon = Inbox,
  title = 'Nenhum registro encontrado',
  description = 'Não há dados para exibir no momento.',
  action,
  colSpan = 5,
}) => {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12 text-center bg-stone-50/30">
        <div className="flex flex-col items-center justify-center space-y-3 max-w-sm mx-auto">
          <div className="p-3 bg-stone-100 rounded-2xl text-stone-400">
            <Icon className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-stone-800">{title}</h4>
            <p className="text-xs text-stone-500 mt-1">{description}</p>
          </div>
          {action && <div className="pt-2">{action}</div>}
        </div>
      </td>
    </tr>
  );
};

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  infoText?: React.ReactNode;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  infoText,
  className = '',
}) => {
  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white rounded-2xl border border-stone-200 shadow-xs ${className}`}>
      <div className="text-xs text-stone-500 font-medium">
        {infoText || (
          <>
            Página <span className="font-bold text-stone-800">{currentPage}</span> de{' '}
            <span className="font-bold text-stone-800">{totalPages}</span>
            {totalItems !== undefined && (
              <>
                {' '}• Total de <span className="font-bold text-stone-800">{totalItems}</span> registros
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Página anterior"
          className="p-2.5 bg-stone-100 hover:bg-stone-200 disabled:opacity-40 text-stone-700 rounded-xl font-bold text-xs flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Anterior</span>
        </button>

        <span className="text-xs font-bold text-stone-700 px-3 py-1 bg-stone-50 rounded-lg border border-stone-200">
          {currentPage} / {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Próxima página"
          className="p-2.5 bg-stone-100 hover:bg-stone-200 disabled:opacity-40 text-stone-700 rounded-xl font-bold text-xs flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

