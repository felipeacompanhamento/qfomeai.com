import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Truck, UserCheck, Users, History, Settings, Lock, Bike } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { PageHeader, Tabs, Button } from '../../../components/ui';
import AssignedDeliveries from '../drivers/AssignedDeliveries';
import DeliveryAssignmentTab from '../drivers/DeliveryAssignmentTab';
import DriversList from '../drivers/DriversList';
import DeliveryHistoryTab from '../drivers/DeliveryHistoryTab';
import DeliverySettings from '../drivers/DeliverySettings';

export default function EntregasHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const role = (profile?.role || profile?.tipo_usuario || '').toUpperCase();

  // Redirect DRIVER role to /entregador
  if (role === 'DRIVER') {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-stone-200 text-center min-h-[400px] font-sans">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
          <Bike className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-stone-800 mb-2">Painel do Entregador</h3>
        <p className="text-stone-500 mb-6 max-w-md">
          Esta área é voltada para a gestão operacional do restaurante. Para visualizar suas corridas e entregas ativas, acesse o aplicativo do entregador.
        </p>
        <Button
          onClick={() => navigate('/entregador')}
          variant="primary"
          size="md"
        >
          Ir para Painel do Entregador
        </Button>
      </div>
    );
  }

  // Determine available tabs per role
  let allowedSubtabs = ['ativas', 'atribuicao', 'entregadores', 'historico', 'configuracoes'];
  if (role === 'CASHIER') {
    allowedSubtabs = ['ativas', 'atribuicao'];
  } else if (role === 'KITCHEN' || role === 'WAITER') {
    allowedSubtabs = [];
  }

  if (allowedSubtabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-stone-200 text-center min-h-[400px] font-sans">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-stone-800 mb-2">Acesso Restrito</h3>
        <p className="text-stone-500 max-w-md">
          Seu perfil não possui permissão para acessar o módulo de Entregas.
        </p>
      </div>
    );
  }

  // Get raw subtab from query params
  const rawSubtab = searchParams.get('subtab') || searchParams.get('tab') || 'ativas';

  // Normalize legacy subtab aliases
  let currentSubtab = rawSubtab.toLowerCase();
  if (currentSubtab === 'atribuidas') currentSubtab = 'ativas';
  if (currentSubtab === 'areas') currentSubtab = 'configuracoes';

  // Fallback if requested subtab is not allowed for user role
  if (!allowedSubtabs.includes(currentSubtab)) {
    currentSubtab = allowedSubtabs[0];
  }

  const handleTabChange = (tabId: string) => {
    setSearchParams({ subtab: tabId }, { replace: false });
  };

  const tabsConfig = [
    { id: 'ativas', label: 'Entregas Ativas', icon: Truck },
    { id: 'atribuicao', label: 'Atribuição', icon: UserCheck },
    { id: 'entregadores', label: 'Entregadores', icon: Users },
    { id: 'historico', label: 'Histórico', icon: History },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ].filter(tab => allowedSubtabs.includes(tab.id));

  return (
    <div className="space-y-6 font-sans">
      {/* Module Header */}
      <PageHeader
        title="Entregas"
        description="Acompanhe pedidos, atribuições e a operação dos entregadores."
        icon={Truck}
      />

      {/* Navigation Tabs */}
      <Tabs
        tabs={tabsConfig}
        activeTab={currentSubtab}
        onChange={handleTabChange}
        variant="emerald"
      />

      {/* Render ONLY the active tab component */}
      <div>
        {currentSubtab === 'ativas' && <AssignedDeliveries />}
        {currentSubtab === 'atribuicao' && <DeliveryAssignmentTab />}
        {currentSubtab === 'entregadores' && <DriversList />}
        {currentSubtab === 'historico' && <DeliveryHistoryTab />}
        {currentSubtab === 'configuracoes' && <DeliverySettings />}
      </div>
    </div>
  );
}
