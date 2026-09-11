import React, { useRef } from 'react';
import { printViaCentralService, PrintDestinationType, PaperSize } from '../../services/printCentralService';

interface PrintableCashReceiptProps {
  children: React.ReactNode;
  onPrint?: () => void;
  destination?: 'cash_open' | 'cash_close';
  restaurantProfile?: any;
  profile?: any;
  documentId?: string;
  isReprint?: boolean;
}

export const PrintableCashReceipt: React.FC<PrintableCashReceiptProps> = ({ 
  children, 
  onPrint,
  destination,
  restaurantProfile,
  profile,
  documentId,
  isReprint = false
}) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const isPrintingRef = useRef(false);

  const executeBrowserPrint = (contentHtml: string) => {
    const iframeId = 'printable-cash-receipt-iframe';
    const existingIframe = document.getElementById(iframeId);
    if (existingIframe) {
      existingIframe.remove();
    }

    const iframe = document.createElement('iframe');
    iframe.id = iframeId;
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';

    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) {
      isPrintingRef.current = false;
      return;
    }

    // Coleta estilos para impressão no navegador
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(el => el.outerHTML)
      .join('\n');

    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comprovante de Caixa</title>
  ${styles}
  <style>
    @page {
      margin: 0;
      size: auto;
    }
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1c1917;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
    }
    body {
      padding: 8px 12px;
      width: 100%;
      max-width: 80mm;
      margin: 0 auto;
      font-family: monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .no-print {
      display: none !important;
    }
  </style>
</head>
<body>
  ${contentHtml}
</body>
</html>`);
    iframeDoc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Erro na impressão do comprovante de caixa:', err);
      } finally {
        isPrintingRef.current = false;
        setTimeout(() => {
          const toRemove = document.getElementById(iframeId);
          if (toRemove) toRemove.remove();
        }, 3000);
      }
    }, 150);
  };

  const handlePrint = async () => {
    if (isPrintingRef.current) return;
    isPrintingRef.current = true;

    if (onPrint) {
      onPrint();
    }

    const receiptEl = receiptRef.current;
    if (!receiptEl) {
      isPrintingRef.current = false;
      return;
    }

    const contentHtml = receiptEl.innerHTML;

    // Se temos um destino definido (cash_open ou cash_close), usar a Central de Impressão
    if (destination) {
      try {
        const cashDocId = documentId || `${destination}_${new Date().toISOString().slice(0, 10)}`;
        await printViaCentralService({
          destination,
          restaurantProfile,
          profile,
          documentId: cashDocId,
          documentType: destination,
          isReprint,
          documentTitle: destination === 'cash_open' ? 'Abertura de Caixa' : 'Fechamento de Caixa',
          htmlGenerator: (paperSize: PaperSize) => {
            const maxWidth = paperSize === '58mm' ? '58mm' : paperSize === '100mm' ? '100mm' : '80mm';
            return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${destination === 'cash_open' ? 'Abertura de Caixa' : 'Fechamento de Caixa'}</title>
  <style>
    @page { margin: 0; size: auto; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1c1917;
      font-family: monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9.5pt;
      line-height: 1.35;
    }
    body {
      padding: 6px 10px;
      width: 100%;
      max-width: ${maxWidth};
      margin: 0 auto;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .flex { display: flex; justify-content: space-between; }
    .text-center { text-align: center; }
    .font-bold { font-weight: bold; }
    .border-t { border-top: 1px dashed #78716c; }
    .border-b { border-bottom: 1px dashed #78716c; }
    .py-2 { padding-top: 6px; padding-bottom: 6px; }
    .mb-2 { margin-bottom: 6px; }
    .mb-4 { margin-bottom: 12px; }
  </style>
</head>
<body>
  ${contentHtml}
</body>
</html>`;
          },
          fallbackExecutor: () => {
            executeBrowserPrint(contentHtml);
          }
        });
      } catch (err) {
        console.error('[PrintableCashReceipt] Erro na central de impressão:', err);
        executeBrowserPrint(contentHtml);
      } finally {
        isPrintingRef.current = false;
      }
    } else {
      // Fallback padrão sem destino
      executeBrowserPrint(contentHtml);
    }
  };

  return (
    <div className="printable-receipt">
      <style>{`
        @media print {
          @page {
            margin: 0;
            size: auto;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
      <div 
        ref={receiptRef}
        className="p-4 bg-white text-stone-900 text-sm font-mono border border-stone-300"
      >
        {children}
      </div>
      <div className="mt-4 no-print">
        <button 
          type="button"
          onClick={handlePrint}
          className="w-full py-2 bg-stone-800 text-white font-bold rounded-lg hover:bg-stone-700 transition-colors cursor-pointer"
        >
          Imprimir
        </button>
      </div>
    </div>
  );
};


