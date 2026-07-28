import React from 'react';
import { 
  Wallet, 
  TrendingUp, 
  Receipt, 
  ArrowLeftRight
} from 'lucide-react';
import { FinanceCard } from './FinanceCard';
import { FinancialPageHeader } from './components/FinancialPageHeader';

export function FinanceiroPage() {
  const cards = [
    {
      icon: Wallet,
      title: 'Caixa',
      description: 'Abertura, fechamento, suprimento, sangria e conferência do caixa diário.',
      path: '/restaurant/financeiro/caixa',
      enabled: true,
      accentColor: 'emerald' as const
    },
    {
      icon: TrendingUp,
      title: 'Contas a Receber',
      description: 'Acompanhamento de vendas a prazo, cartões, PIX e outras entradas futuras.',
      path: '/restaurant/financeiro/contas-receber',
      enabled: true,
      accentColor: 'emerald' as const
    },
    {
      icon: Receipt,
      title: 'Contas a Pagar',
      description: 'Controle de despesas, fornecedores, boletos e saídas programadas.',
      path: '/restaurant/financeiro/contas-pagar',
      enabled: true,
      accentColor: 'rose' as const
    },
    {
      icon: ArrowLeftRight,
      title: 'Lançamentos',
      description: 'Fluxo de caixa consolidado, extrato de movimentações e conciliação bancária.',
      path: '/restaurant/financeiro/lancamentos',
      enabled: true,
      accentColor: 'indigo' as const
    }
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <FinancialPageHeader 
        title="Financeiro"
        subtitle="Gerenciamento financeiro integrado e fluxo de caixa."
        backPath="/restaurant/dashboard"
      />

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {cards.map((card, idx) => (
          <FinanceCard
            key={idx}
            icon={card.icon}
            title={card.title}
            description={card.description}
            path={card.path}
            enabled={card.enabled}
            accentColor={card.accentColor}
          />
        ))}
      </div>
    </div>
  );
}

export default FinanceiroPage;
