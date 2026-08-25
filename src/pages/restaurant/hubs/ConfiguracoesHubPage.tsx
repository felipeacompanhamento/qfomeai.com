import React, { useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { 
  Store, 
  Clock, 
  MapPin, 
  CreditCard, 
  Printer, 
  Sliders, 
  MessageSquare, 
  Lock,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { AccountType } from '../../../types';
import { hasPermission } from '../../../domain/permissions/canonicalPermissions';

import AccountSettings from '../AccountSettings';
import Schedules from '../Schedules';
import DeliveryAreas from '../DeliveryAreas';
import RestaurantPayments from '../Payments';
import PrintSettings from '../PrintSettings';
import MercadoPagoIntegration from '../Integration';
import WhatsAppIntegration from '../WhatsAppIntegration';
import PasswordSettings from '../PasswordSettings';

export type ConfiguracoesSubTab = 
  | 'dados' 
  | 'horarios' 
  | 'entrega' 
  | 'pagamentos' 
  | 'impressao' 
  | 'integracoes' 
  | 'whatsapp' 
  | 'seguranca';

interface TabDefinition {
  id: ConfiguracoesSubTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const ALL_CONFIG_SUBTABS: TabDefinition[] = [
  { id: 'dados', label: 'Dados do Restaurante', icon: Store },
  { id: 'horarios', label: 'Horários', icon: Clock },
  { id: 'entrega', label: 'Entrega e Taxas', icon: MapPin },
  { id: 'pagamentos', label: 'Formas de Pagamento', icon: CreditCard },
  { id: 'impressao', label: 'Impressão', icon: Printer },
  { id: 'integracoes', label: 'Integrações', icon: Sliders },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'seguranca', label: 'Segurança da Conta', icon: Lock },
];

export default function ConfiguracoesHubPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const role = (profile?.role || profile?.tipo_usuario || '').toUpperCase();
  const isRestaurantOwner = profile?.accountType === AccountType.RESTAURANT || role === 'OWNER' || role === 'RESTAURANT_ADMIN';

  // Determine allowed subtabs based on role & permissions
  const availableTabs = useMemo(() => {
    if (!profile) return [];
    if (isRestaurantOwner) return ALL_CONFIG_SUBTABS;

    // Check configuracoes.visualizar or settings permissions
    const canAccessConfig = hasPermission(profile, 'configuracoes.visualizar') || hasPermission(profile, 'settings:manage');
    if (!canAccessConfig) return [];

    return ALL_CONFIG_SUBTABS;
  }, [profile, isRestaurantOwner]);

  // Determine active subtab from URL path or query params
  const pathname = location.pathname.toLowerCase();
  let subtabFromPath: ConfiguracoesSubTab | null = null;

  if (pathname.includes('/configuracoes/dados') || pathname.includes('/settings/account')) subtabFromPath = 'dados';
  else if (pathname.includes('/configuracoes/horarios') || pathname.includes('/schedules')) subtabFromPath = 'horarios';
  else if (pathname.includes('/configuracoes/entrega') || pathname.includes('/delivery-areas')) subtabFromPath = 'entrega';
  else if (pathname.includes('/configuracoes/pagamentos') || pathname.includes('/settings/payments')) subtabFromPath = 'pagamentos';
  else if (pathname.includes('/configuracoes/impressao') || pathname.includes('/settings/print')) subtabFromPath = 'impressao';
  else if (pathname.includes('/configuracoes/integracoes') || pathname.includes('/settings/integration')) subtabFromPath = 'integracoes';
  else if (pathname.includes('/configuracoes/whatsapp') || pathname.includes('/settings/whatsapp')) subtabFromPath = 'whatsapp';
  else if (pathname.includes('/configuracoes/seguranca') || pathname.includes('/settings/password')) subtabFromPath = 'seguranca';

  const rawQuerySubtab = (searchParams.get('subtab') || searchParams.get('tab') || '').toLowerCase();
  
  let normalizedQuerySubtab: ConfiguracoesSubTab | null = null;
  if (rawQuerySubtab === 'dados' || rawQuerySubtab === 'account') normalizedQuerySubtab = 'dados';
  else if (rawQuerySubtab === 'horarios' || rawQuerySubtab === 'schedules') normalizedQuerySubtab = 'horarios';
  else if (rawQuerySubtab === 'entrega' || rawQuerySubtab === 'delivery') normalizedQuerySubtab = 'entrega';
  else if (rawQuerySubtab === 'pagamentos' || rawQuerySubtab === 'payments') normalizedQuerySubtab = 'pagamentos';
  else if (rawQuerySubtab === 'impressao' || rawQuerySubtab === 'print') normalizedQuerySubtab = 'impressao';
  else if (rawQuerySubtab === 'integracoes' || rawQuerySubtab === 'integration') normalizedQuerySubtab = 'integracoes';
  else if (rawQuerySubtab === 'whatsapp') normalizedQuerySubtab = 'whatsapp';
  else if (rawQuerySubtab === 'seguranca' || rawQuerySubtab === 'password') normalizedQuerySubtab = 'seguranca';

  let currentSubTab: ConfiguracoesSubTab = normalizedQuerySubtab || subtabFromPath || 'dados';

  if (!availableTabs.some(t => t.id === currentSubTab)) {
    currentSubTab = availableTabs[0]?.id || 'dados';
  }

  if (availableTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-stone-200 text-center min-h-[400px] font-sans">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-stone-800 mb-2">Acesso Restrito</h3>
        <p className="text-stone-500 max-w-md text-sm">
          Seu perfil não possui permissão para acessar o módulo de Configurações.
        </p>
      </div>
    );
  }

  const handleSubTabChange = (tabId: ConfiguracoesSubTab) => {
    setSearchParams({ subtab: tabId }, { replace: false });
    navigate(`/restaurant/configuracoes/${tabId}?subtab=${tabId}`, { replace: false });
  };

  return (
    <div className="space-y-6 w-full font-sans">
      {/* Header & Subtabs Navigation */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Configurações</h1>
          <p className="text-stone-500 text-xs sm:text-sm mt-0.5">
            Gestão unificada de dados do estabelecimento, horários, entregas, pagamentos, impressão e integrações.
          </p>
        </div>

        {/* Horizontal Subtabs Navigation */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-2xl overflow-x-auto custom-scrollbar w-full">
          {availableTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentSubTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSubTabChange(tab.id)}
                className={`min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-stone-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Render ONLY the Active Tab Component */}
      <div>
        {currentSubTab === 'dados' && <AccountSettings />}
        {currentSubTab === 'horarios' && <Schedules />}
        {currentSubTab === 'entrega' && <DeliveryAreas />}
        {currentSubTab === 'pagamentos' && <RestaurantPayments />}
        {currentSubTab === 'impressao' && <PrintSettings />}
        {currentSubTab === 'integracoes' && <MercadoPagoIntegration />}
        {currentSubTab === 'whatsapp' && <WhatsAppIntegration />}
        {currentSubTab === 'seguranca' && <PasswordSettings />}
      </div>
    </div>
  );
}
