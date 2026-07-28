import React from 'react';
import { formatCurrency } from '../../utils/currencyUtils';

interface PrintableCashReceiptProps {
  children: React.ReactNode;
  onPrint?: () => void;
}

export const PrintableCashReceipt: React.FC<PrintableCashReceiptProps> = ({ children, onPrint }) => {
  return (
    <div className="printable-receipt">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .printable-receipt, .printable-receipt * { visibility: visible; }
          .printable-receipt { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none; }
        }
      `}</style>
      <div className="p-4 bg-white text-stone-900 text-sm font-mono border border-stone-300">
        {children}
      </div>
      <div className="mt-4 no-print">
        <button 
          onClick={() => window.print()}
          className="w-full py-2 bg-stone-800 text-white font-bold rounded-lg hover:bg-stone-700"
        >
          Imprimir
        </button>
      </div>
    </div>
  );
};
