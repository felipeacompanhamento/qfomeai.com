import React, { useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { Users, UserCheck, BarChart3, Lock } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { AccountType } from '../../../types';
import { hasPermission } from '../../../domain/permissions/canonicalPermissions';

import ClientesPage from './ClientesPage';
import TeamSettings from '../settings/TeamSettings';
import RelatoriosPage from './RelatoriosPage';

export type GestaoSubTab = 'clientes' | 'equipe' | 'relatorios';

interface TabDefinition {
  id: GestaoSubTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const ALL_GESTAO_SUBTABS: TabDefinition[] = [
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'equipe', label: 'Equipe', icon: UserCheck },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
];

interface GestaoHubPageProps {
  restaurantProfile?: any;
  orders?: any[];
}

export default function GestaoHubPage({ restaurantProfile, orders = [] }: GestaoHubPageProps) {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const role = (profile?.role || profile?.tipo_usuario || '').toUpperCase();
  const isRestaurantOwner = profile?.accountType === AccountType.RESTAURANT || role === 'OWNER' || role === 'RESTAURANT_ADMIN';

  // Determine allowed subtabs based on role & permissions
  const availableTabs = useMemo(() => {
    if (!profile) return [];
    if (isRestaurantOwner) return ALL_GESTAO_SUBTABS;

    return ALL_GESTAO_SUBTABS.filter(tab => {
      if (tab.id === 'clientes') {
        return hasPermission(profile, 'clientes.visualizar');
      }
      if (tab.id === 'equipe') {
        return hasPermission(profile, 'equipe.visualizar') || hasPermission(profile, 'configuracoes.visualizar');
      }
      if (tab.id === 'relatorios') {
        return hasPermission(profile, 'relatorios.visualizar');
      }
      return false;
    });
  }, [profile, isRestaurantOwner]);

  // Determine active subtab from URL path or query params
  const pathname = location.pathname.toLowerCase();
  let subtabFromPath: GestaoSubTab | null = null;

  if (pathname.includes('/gestao/clientes') || pathname.includes('/clientes') || pathname.includes('/customers')) subtabFromPath = 'clientes';
  else if (pathname.includes('/gestao/equipe') || pathname.includes('/settings/team') || pathname.includes('/waiters')) subtabFromPath = 'equipe';
  else if (pathname.includes('/gestao/relatorios') || pathname.includes('/relatorios') || pathname.includes('/reports')) subtabFromPath = 'relatorios';

  const rawQuerySubtab = (searchParams.get('subtab') || searchParams.get('tab') || '').toLowerCase();
  
  let normalizedQuerySubtab: GestaoSubTab | null = null;
  if (rawQuerySubtab === 'clientes' || rawQuerySubtab === 'customers') normalizedQuerySubtab = 'clientes';
  else if (rawQuerySubtab === 'equipe' || rawQuerySubtab === 'team' || rawQuerySubtab === 'staff' || rawQuerySubtab === 'waiters') normalizedQuerySubtab = 'equipe';
  else if (rawQuerySubtab === 'relatorios' || rawQuerySubtab === 'reports') normalizedQuerySubtab = 'relatorios';

  let currentSubTab: GestaoSubTab = normalizedQuerySubtab || subtabFromPath || 'clientes';

  if (!availableTabs.some(t => t.id === currentSubTab)) {
    currentSubTab = availableTabs[0]?.id || 'clientes';
  }

  if (availableTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-stone-200 text-center min-h-[400px] font-sans">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-stone-800 mb-2">Acesso Restrito</h3>
        <p className="text-stone-500 max-w-md">
          Seu perfil não possui permissão para acessar o módulo de Gestão.
        </p>
      </div>
    );
  }

  const handleSubTabChange = (tabId: GestaoSubTab) => {
    setSearchParams({ subtab: tabId }, { replace: false });
    navigate(`/restaurant/gestao/${tabId}?subtab=${tabId}`, { replace: false });
  };

  return (
    <div className="space-y-6 w-full font-sans">
      {/* Module Sub-Header & Navigation Tabs */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Gestão</h1>
          <p className="text-stone-500 text-xs sm:text-sm mt-1">
            Gestão unificada de clientes, equipe interna e relatórios analíticos de desempenho.
          </p>
        </div>

        {/* Horizontal Controlled Subtabs Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-2xl overflow-x-auto scrollbar-none w-full">
          {availableTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentSubTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSubTabChange(tab.id)}
                className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 min-w-[120px] sm:min-w-0 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-stone-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Render ONLY the Active Tab Component to avoid duplicate listeners & queries */}
      <div>
        {currentSubTab === 'clientes' && <ClientesPage />}
        {currentSubTab === 'equipe' && <TeamSettings />}
        {currentSubTab === 'relatorios' && <RelatoriosPage />}
      </div>
    </div>
  );
}
