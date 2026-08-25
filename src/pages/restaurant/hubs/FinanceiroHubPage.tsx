import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PieChart, DollarSign, TrendingUp, CreditCard, FileText, Lock, Wallet } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { hasPermission } from '../../../domain/permissions/canonicalPermissions';
import { PageHeader } from '../../../components/ui/Header';
import { Tabs } from '../../../components/ui/NavigationComponents';
import VisaoFinanceiraTab from '../financeiro/VisaoFinanceiraTab';
import CaixaPage from '../financeiro/CaixaPage';
import { ContasReceberPage } from '../financeiro/ContasReceberPage';
import { ContasPagarPage } from '../financeiro/ContasPagarPage';
import RestaurantInvoicePage from '../Invoice';

export default function FinanceiroHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const role = (profile?.role || profile?.tipo_usuario || '').toUpperCase();
  const accountType = profile?.accountType;

  // Determine allowed subtabs based on role & permissions
  let allowedSubtabs: string[] = [];

  if (accountType === 'RESTAURANT' || role === 'OWNER' || role === 'RESTAURANT_ADMIN') {
    allowedSubtabs = ['visao', 'caixa', 'receber', 'pagar', 'faturas'];
  } else if (role === 'MANAGER') {
    allowedSubtabs = ['visao', 'caixa', 'receber', 'pagar'];
    if (hasPermission(profile, 'faturas.visualizar')) {
      allowedSubtabs.push('faturas');
    }
  } else if (role === 'CASHIER') {
    // CASHIER is strictly limited to Caixa diário
    allowedSubtabs = ['caixa'];
  } else {
    // WAITER, KITCHEN, DRIVER or unpermitted users have no financial access
    allowedSubtabs = [];
  }

  if (allowedSubtabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-stone-200 text-center min-h-[400px] font-sans">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-stone-800 mb-2">Acesso Restrito</h3>
        <p className="text-stone-500 max-w-md">
          Seu perfil não possui permissão para acessar o módulo Financeiro.
        </p>
      </div>
    );
  }

  // Get raw subtab from URL
  const rawSubtab = searchParams.get('subtab') || searchParams.get('tab') || 'visao';

  // Normalize aliases
  let currentSubtab = rawSubtab.toLowerCase();
  if (currentSubtab === 'overview' || currentSubtab === 'lancamentos') currentSubtab = 'visao';
  if (currentSubtab === 'cash') currentSubtab = 'caixa';
  if (currentSubtab === 'contas-receber' || currentSubtab === 'receivables') currentSubtab = 'receber';
  if (currentSubtab === 'contas-pagar' || currentSubtab === 'payables') currentSubtab = 'pagar';
  if (currentSubtab === 'fatura' || currentSubtab === 'invoice') currentSubtab = 'faturas';

  // Fallback if currentSubtab is not allowed for user role
  if (!allowedSubtabs.includes(currentSubtab)) {
    currentSubtab = allowedSubtabs[0];
  }

  const handleTabChange = (tabId: string) => {
    setSearchParams({ subtab: tabId }, { replace: false });
  };

  const tabsConfig = [
    { id: 'visao', label: 'Visão Financeira', icon: PieChart },
    { id: 'caixa', label: 'Caixa', icon: Wallet },
    { id: 'receber', label: 'Contas a Receber', icon: TrendingUp },
    { id: 'pagar', label: 'Contas a Pagar', icon: CreditCard },
    { id: 'faturas', label: 'Faturas QFomeAI', icon: FileText },
  ].filter(tab => allowedSubtabs.includes(tab.id));

  return (
    <div className="space-y-6 font-sans">
      {/* Module Header & Subtab Navigation */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-stone-200/80 shadow-xs space-y-4">
        <PageHeader
          title="Financeiro"
          description="Acompanhe o caixa, recebimentos, despesas e resultados do restaurante."
        />

        <Tabs
          tabs={tabsConfig}
          activeTab={currentSubtab}
          onChange={handleTabChange}
          variant="emerald"
        />
      </div>

      {/* Render ONLY the active tab component */}
      <div>
        {currentSubtab === 'visao' && <VisaoFinanceiraTab onSelectTab={handleTabChange} />}
        {currentSubtab === 'caixa' && <CaixaPage />}
        {currentSubtab === 'receber' && <ContasReceberPage />}
        {currentSubtab === 'pagar' && <ContasPagarPage />}
        {currentSubtab === 'faturas' && <RestaurantInvoicePage />}
      </div>
    </div>
  );
}
