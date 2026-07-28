import React from 'react';
import { formatCurrency } from '../../utils/currencyUtils';

interface OpeningReceiptProps {
  restaurantName: string;
  cnpj?: string;
  caixaId: string;
  openedAt: string;
  openedBy: string;
  openingBalance: number;
  observation?: string;
}

export const CashOpeningReceipt: React.FC<OpeningReceiptProps> = ({
  restaurantName, cnpj, caixaId, openedAt, openedBy, openingBalance, observation
}) => {
  return (
    <div className="text-stone-900 text-sm font-mono p-2">
      <div className="text-center mb-4">
        <h2 className="font-bold text-lg">{restaurantName}</h2>
        {cnpj && <p>CNPJ: {cnpj}</p>}
      </div>
      <div className="border-t border-b border-stone-300 py-2 mb-2">
        <p><strong>Caixa ID:</strong> {caixaId.slice(-6).toUpperCase()}</p>
        <p><strong>Status:</strong> ABERTO</p>
        <p><strong>Data/Hora:</strong> {new Date(openedAt).toLocaleString('pt-BR')}</p>
        <p><strong>Operador:</strong> {openedBy}</p>
      </div>
      <div className="mb-2">
        <p><strong>Saldo Inicial:</strong> {formatCurrency(openingBalance)}</p>
        {observation && <p><strong>Obs:</strong> {observation}</p>}
      </div>
    </div>
  );
};

interface ClosingReceiptProps {
  restaurantName: string;
  cnpj?: string;
  caixaId: string;
  openedAt: string;
  closedAt: string;
  openedBy: string;
  closedBy: string;
  openingBalance: number;
  totalEntries: number;
  totalExits: number;
  totalSupplies: number;
  totalWithdrawals: number;
  expectedTotal: number;
  countedTotal: number;
  totalDifference: number;
  paymentSummary: { paymentMethodName: string; expectedAmount: number; countedAmount: number; differenceAmount: number; }[];
}

export const CashClosingReceipt: React.FC<ClosingReceiptProps> = ({
  restaurantName, cnpj, caixaId, openedAt, closedAt, openedBy, closedBy, 
  openingBalance, totalEntries, totalExits, totalSupplies, totalWithdrawals,
  expectedTotal, countedTotal, totalDifference, paymentSummary
}) => {
  return (
    <div className="text-stone-900 text-sm font-mono p-2">
      <div className="text-center mb-4">
        <h2 className="font-bold text-lg">{restaurantName}</h2>
        {cnpj && <p>CNPJ: {cnpj}</p>}
      </div>
      <div className="border-t border-b border-stone-300 py-2 mb-2">
        <p><strong>Caixa ID:</strong> {caixaId.slice(-6).toUpperCase()}</p>
        <p><strong>Abertura:</strong> {new Date(openedAt).toLocaleString('pt-BR')}</p>
        <p><strong>Fechamento:</strong> {new Date(closedAt).toLocaleString('pt-BR')}</p>
        <p><strong>Op. Abertura:</strong> {openedBy}</p>
        <p><strong>Op. Fechamento:</strong> {closedBy}</p>
      </div>
      <div className="mb-2">
        <p><strong>Saldo Inicial:</strong> {formatCurrency(openingBalance)}</p>
        <p><strong>Total Entradas:</strong> {formatCurrency(totalEntries)}</p>
        <p><strong>Total Saídas:</strong> {formatCurrency(totalExits)}</p>
        <p><strong>Total Suprimentos:</strong> {formatCurrency(totalSupplies)}</p>
        <p><strong>Total Sangrias:</strong> {formatCurrency(totalWithdrawals)}</p>
      </div>
      <div className="border-t border-b border-stone-300 py-2 mb-2">
        <p><strong>Total Esperado:</strong> {formatCurrency(expectedTotal)}</p>
        <p><strong>Total Encontrado:</strong> {formatCurrency(countedTotal)}</p>
        <p><strong>Diferença:</strong> {formatCurrency(totalDifference)}</p>
      </div>
      <div className="mb-2">
        <p className="font-bold">Conferência:</p>
        {paymentSummary.map((item, index) => (
          <div key={index} className="flex justify-between">
            <span>{item.paymentMethodName}</span>
            <span>{formatCurrency(item.countedAmount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
