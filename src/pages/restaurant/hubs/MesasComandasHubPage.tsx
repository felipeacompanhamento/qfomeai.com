import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { AccountType } from '../../../types';
import RestaurantTables from '../Tables';
import OperationalTablesMap from '../TablesMap';
import RestaurantHalls from '../Halls';
import RestaurantComandas from '../Comandas';
import { MapPin, LayoutGrid, Building2, Receipt, Utensils } from 'lucide-react';
import { PageHeader, Tabs } from '../../../components/ui';

export type MesasSubTab = 'mapa' | 'mesas' | 'saloes' | 'comandas';

interface TabDefinition {
  id: MesasSubTab;
  label: string;
  icon: React.FC<{ className?: string }>;
  adminOnly?: boolean;
}

const ALL_SUBTABS: TabDefinition[] = [
  { id: 'mapa', label: 'Mapa Operacional', icon: MapPin },
  { id: 'mesas', label: 'Mesas', icon: LayoutGrid, adminOnly: true },
  { id: 'saloes', label: 'Salões', icon: Building2, adminOnly: true },
  { id: 'comandas', label: 'Comandas', icon: Receipt },
];

export default function MesasComandasHubPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const role = (profile?.role || profile?.tipo_usuario || '').toUpperCase();
  const canAccessAdminTabs = useMemo(() => {
    if (!profile) return false;
    if (profile.accountType === AccountType.RESTAURANT || role === 'OWNER' || role === 'RESTAURANT_ADMIN' || role === 'MANAGER') {
      return true;
    }
    return false;
  }, [profile, role]);

  // Allowed subtabs for the current profile
  const availableTabs = useMemo(() => {
    return ALL_SUBTABS.filter(t => !t.adminOnly || canAccessAdminTabs);
  }, [canAccessAdminTabs]);

  // Active subtab from query params
  const rawSubTab = (searchParams.get('subtab') || searchParams.get('tab') || 'mapa') as MesasSubTab;
  const isRawTabAllowed = availableTabs.some(t => t.id === rawSubTab);
  const activeSubTab: MesasSubTab = isRawTabAllowed ? rawSubTab : (availableTabs[0]?.id || 'mapa');

  const handleSubTabChange = (tabId: string) => {
    setSearchParams({ subtab: tabId }, { replace: false });
  };

  return (
    <div className="space-y-6 w-full">
      {/* Module Header */}
      <PageHeader
        title="Mesas e Comandas"
        description="Gerencie o salão, as mesas e o atendimento em um só lugar."
        icon={Utensils}
      />

      {/* Navigation Subtabs */}
      <Tabs
        tabs={availableTabs.map(tab => ({
          id: tab.id,
          label: tab.label,
          icon: tab.icon,
        }))}
        activeTab={activeSubTab}
        onChange={handleSubTabChange}
        variant="emerald"
      />

      {/* Render ONLY the Active Tab Component to avoid duplicate listeners & queries */}
      <div>
        {activeSubTab === 'mapa' && <OperationalTablesMap />}
        {activeSubTab === 'mesas' && <RestaurantTables />}
        {activeSubTab === 'saloes' && <RestaurantHalls />}
        {activeSubTab === 'comandas' && <RestaurantComandas />}
      </div>
    </div>
  );
}


