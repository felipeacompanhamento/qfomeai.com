import React from 'react';
import { LucideIcon, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FinanceCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  path: string;
  enabled?: boolean;
  accentColor?: 'emerald' | 'rose' | 'amber' | 'stone';
}

export function FinanceCard({ 
  icon: Icon, 
  title, 
  description, 
  path, 
  enabled = true,
  accentColor = 'emerald'
}: FinanceCardProps) {
  const navigate = useNavigate();

  const getAccentBg = () => {
    switch (accentColor) {
      case 'rose':
        return 'bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-600 group-hover:text-white';
      case 'amber':
        return 'bg-amber-50 text-amber-600 border-amber-100 group-hover:bg-amber-600 group-hover:text-white';
      case 'stone':
        return 'bg-stone-100 text-stone-700 border-stone-200 group-hover:bg-stone-800 group-hover:text-white';
      default:
        return 'bg-emerald-50 text-emerald-600 border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white';
    }
  };

  const getButtonClass = () => {
    switch (accentColor) {
      case 'rose':
        return 'bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border-rose-200/80';
      case 'amber':
        return 'bg-amber-50 hover:bg-amber-600 text-amber-700 hover:text-white border-amber-200/80';
      case 'stone':
        return 'bg-stone-50 hover:bg-stone-800 text-stone-700 hover:text-white border-stone-200';
      default:
        return 'bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border-emerald-200/80';
    }
  };

  return (
    <div 
      onClick={() => enabled && navigate(path)}
      className={`group p-5 sm:p-6 bg-white rounded-2xl border border-stone-200/80 shadow-xs flex flex-col justify-between transition-all duration-200 ${
        enabled ? 'hover:shadow-md hover:border-stone-300 cursor-pointer active:scale-[0.99]' : 'opacity-70 cursor-not-allowed'
      }`}
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl border flex items-center justify-center transition-all duration-200 ${getAccentBg()}`}>
            <Icon className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:scale-105" />
          </div>
          <span className="text-xs font-semibold text-stone-400 group-hover:text-stone-600 transition-colors flex items-center gap-0.5">
            Módulo <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>

        <h3 className="text-base sm:text-lg font-bold text-stone-800 mb-1.5 flex items-center gap-2">
          {title}
          {!enabled && (
            <span className="text-xs bg-stone-100 text-stone-500 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Em breve
            </span>
          )}
        </h3>

        <p className="text-stone-500 text-xs sm:text-sm leading-relaxed mb-6">
          {description}
        </p>
      </div>

      <div>
        {enabled ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(path);
            }}
            className={`w-full py-2.5 px-4 rounded-xl border font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-xs ${getButtonClass()}`}
          >
            <span>Acessar {title}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-full py-2.5 bg-stone-100 text-stone-400 font-bold text-center text-xs sm:text-sm rounded-xl cursor-not-allowed">
            Em breve
          </div>
        )}
      </div>
    </div>
  );
}
