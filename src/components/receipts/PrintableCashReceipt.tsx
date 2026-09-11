import React, { useRef } from 'react';

interface PrintableCashReceiptProps {
  children: React.ReactNode;
  onPrint?: () => void;
}

export const PrintableCashReceipt: React.FC<PrintableCashReceiptProps> = ({ children, onPrint }) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const isPrintingRef = useRef(false);

  const handlePrint = () => {
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

    // Isolate the receipt in a dedicated, hidden iframe to ensure:
    // 1. Exactly 1 page is printed (no multi-page layout inflation from body * { visibility: hidden })
    // 2. No repeating fixed elements across multiple pages
    // 3. Exactly 1 print job is triggered per click
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

    // Collect all head stylesheets so styling matches exactly
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

    // Trigger single print execution
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
          className="w-full py-2 bg-stone-800 text-white font-bold rounded-lg hover:bg-stone-700 transition-colors"
        >
          Imprimir
        </button>
      </div>
    </div>
  );
};

