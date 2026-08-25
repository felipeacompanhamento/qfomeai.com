import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AccountType } from '../../types';
import { hasPermission } from '../../domain/permissions/canonicalPermissions';
import { normalizeRestaurantFeatures } from '../../domain/restaurant/restaurantFeatures';
import { HubConfig, HubTabConfig } from '../../config/restaurantHubs';
import { ShieldAlert } from 'lucide-react';

interface ModuleHubProps {
  hub: HubConfig;
  restaurantProfile?: any;
  tabComponents: Record<string, React.ReactNode>;
}

const MODULE_TO_CANONICAL_KEY: Record<string, string> = {
  dashboard: 'dashboard.visualizar',
  pedidos: 'pedidos.visualizar',
  balcao: 'balcao.visualizar',
  mesas: 'mesas.visualizar',
  garcom: 'garcom.atender',
  delivery: 'entregas.visualizar',
  cozinha: 'cozinha.visualizar',
  caixa: 'caixa.visualizar',
  financeiro: 'financeiro.visualizar',
  menu: 'produtos.visualizar',
  stock: 'estoque.visualizar',
  relatorios: 'relatorios.visualizar',
  clientes: 'clientes.visualizar',
  equipe: 'equipe.visualizar',
  settings: 'configuracoes.visualizar',
};

export const ModuleHub: React.FC<ModuleHubProps> = ({ hub, restaurantProfile, tabComponents }) => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const features = useMemo(() => {
    return normalizeRestaurantFeatures(restaurantProfile);
  }, [restaurantProfile]);

  // Check permission for a single tab
  const isTabAllowed = React.useCallback((tab: HubTabConfig) => {
    if (!profile) return false;

    // Feature flag check
    if (tab.featureFlagKey && features) {
      if (features[tab.featureFlagKey as keyof typeof features] === false) {
        return false;
      }
    }

    const role = (profile.role || profile.tipo_usuario || '').toUpperCase();

    // Owner and Restaurant Admin have full access
    if (profile.accountType === AccountType.RESTAURANT || role === 'OWNER' || role === 'RESTAURANT_ADMIN') {
      if (role === 'OWNER' || role === 'RESTAURANT_ADMIN') {
        return true;
      }
      if (tab.allowedRoles && tab.allowedRoles.map(r => r.toUpperCase()).includes(role)) {
        return true;
      }
      const canonicalKey = MODULE_TO_CANONICAL_KEY[tab.module.toLowerCase()] || tab.module;
      return hasPermission(profile, canonicalKey);
    }

    return false;
  }, [profile, features]);

  // Allowed tabs for the current user
  const allowedTabs = useMemo(() => {
    return hub.tabs.filter(tab => isTabAllowed(tab));
  }, [hub.tabs, isTabAllowed]);

  // Determine active tab ID from location.pathname
  const activeTabId = useMemo(() => {
    const matchedTab = hub.tabs.find(tab => location.pathname === tab.path || location.pathname.startsWith(`${tab.path}/`));
    if (matchedTab) {
      return matchedTab.id;
    }
    // Default to the first allowed tab or defaultTabId if path matches base path exactly
    return allowedTabs.length > 0 ? allowedTabs[0].id : hub.defaultTabId;
  }, [location.pathname, hub.tabs, allowedTabs, hub.defaultTabId]);

  // Handle tab switch
  const handleTabClick = (tab: HubTabConfig) => {
    navigate(tab.path);
  };

  // Find active tab configuration
  const currentTabConfig = hub.tabs.find(t => t.id === activeTabId);
  const isCurrentTabAllowed = currentTabConfig ? isTabAllowed(currentTabConfig) : false;

  return (
    <div className="space-y-3 sm:space-y-4 w-full flex-1 flex flex-col min-h-0 min-w-0 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 px-1 sm:px-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-stone-800 tracking-tight">{hub.title}</h2>
          <p className="text-stone-500 text-xs sm:text-sm">{hub.description}</p>
        </div>
      </div>

      {/* Tabs bar */}
      <div role="tablist" aria-label={hub.title} className="border-b border-stone-200 bg-white rounded-2xl p-1.5 shadow-xs overflow-x-auto no-scrollbar flex items-center gap-1.5 min-w-0 shrink-0 touch-pan-x">
        {allowedTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabClick(tab)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all whitespace-nowrap shrink-0 min-h-[38px] sm:min-h-[42px] cursor-pointer ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-stone-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      <div className="w-full flex-1 flex flex-col min-h-0 min-w-0 max-w-full overflow-hidden">
        {isCurrentTabAllowed ? (
          tabComponents[activeTabId] || (
            <div className="p-8 sm:p-12 bg-white rounded-3xl border border-stone-200 text-center text-stone-400">
              Conteúdo em desenvolvimento para {currentTabConfig?.label}.
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center p-8 sm:p-12 bg-white rounded-3xl border border-stone-200 text-center min-h-[300px]">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Acesso Restrito</h3>
            <p className="text-stone-500">Você não tem permissão para acessar a aba "{currentTabConfig?.label}".</p>
          </div>
        )}
      </div>
    </div>
  );
};
