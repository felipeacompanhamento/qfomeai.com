import React, { useState } from 'react';
import { 
  RotateCcw, 
  Printer, 
  Clock, 
  User, 
  FileText, 
  AlertTriangle, 
  X, 
  Loader2,
  CheckCircle2
} from 'lucide-react';
import { PrintHistoryItem } from '../../services/printCentralService';

export const REPRINT_REASON_PRESETS = [
  'Papel acabou',
  'Impressão falhou',
  'Cupom danificado',
  'Solicitação do cliente',
  'Outro'
] as const;

export type ReprintReasonPreset = typeof REPRINT_REASON_PRESETS[number];

interface ReprintConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, operator: string) => Promise<void> | void;
  historyItem: PrintHistoryItem | null;
  operatorName?: string;
  isProcessing?: boolean;
}

export const ReprintConfirmModal: React.FC<ReprintConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  historyItem,
  operatorName = 'Operador',
  isProcessing = false
}) => {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen || !historyItem) return null;

  const isCustom = selectedReason === 'Outro';
  const finalReason = isCustom ? customReason.trim() : selectedReason;
  const isValid = finalReason.length > 0;

  const handleSelectReason = (reason: string) => {
    setSelectedReason(reason);
    setValidationError(null);
    if (reason !== 'Outro') {
      setCustomReason('');
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      setValidationError('Por favor, selecione ou informe o motivo da reimpressão.');
      return;
    }

    try {
      await onConfirm(finalReason, operatorName);
      setSelectedReason('');
      setCustomReason('');
      setValidationError(null);
    } catch (err: any) {
      setValidationError(err?.message || 'Falha ao processar a reimpressão.');
    }
  };

  const formattedDate = historyItem.timestamp
    ? new Date(historyItem.timestamp).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : 'Agora';

  return (
    <div 
      id="reprint-modal-backdrop"
      className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
    >
      <div 
        id="reprint-modal-card"
        className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-stone-200 space-y-5 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200 shrink-0">
              <RotateCcw className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-stone-900 flex items-center gap-2">
                <span>Confirmar Reimpressão</span>
                <span className="text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                  1 Cópia
                </span>
              </h3>
              <p className="text-xs text-stone-500">
                Esta ação gerará uma nova via e registrará a auditoria no histórico.
              </p>
            </div>
          </div>
          <button
            type="button"
            id="reprint-modal-close-btn"
            onClick={onClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors disabled:opacity-50 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resumo do Documento a Reimprimir */}
        <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 text-xs space-y-2.5">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
            Detalhes do Documento Original
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex items-center gap-2 text-stone-700">
              <FileText className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="text-stone-500">Documento:</span>
              <span className="font-bold text-stone-900 truncate" title={historyItem.documentType}>
                {historyItem.documentType}
              </span>
            </div>

            {historyItem.documentId && (
              <div className="flex items-center gap-2 text-stone-700">
                <span className="text-stone-500">ID / Ref:</span>
                <span className="font-mono font-bold text-stone-900 truncate" title={historyItem.documentId}>
                  #{historyItem.documentId.replace(/^(order_|tab_|kitchen_)/, '')}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 text-stone-700">
              <Printer className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="text-stone-500">Impressora:</span>
              <span className="font-semibold text-stone-900 truncate" title={historyItem.printerName}>
                {historyItem.printerName}
              </span>
            </div>

            <div className="flex items-center gap-2 text-stone-700">
              <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span className="text-stone-500">Data/Hora:</span>
              <span className="text-stone-800">{formattedDate}</span>
            </div>

            <div className="flex items-center gap-2 text-stone-700 col-span-1 sm:col-span-2">
              <User className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-stone-500">Operador Responsável:</span>
              <span className="font-bold text-emerald-950 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {operatorName}
              </span>
            </div>
          </div>
        </div>

        {/* Formulário de Motivo da Reimpressão */}
        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider">
              Motivo da Reimpressão <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-stone-500">
              Selecione o motivo da nova via para registro no controle interno:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
              {REPRINT_REASON_PRESETS.map((preset) => {
                const isSelected = selectedReason === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectReason(preset)}
                    disabled={isProcessing}
                    className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500 border-amber-600 text-white shadow-xs font-bold'
                        : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                    <span>{preset}</span>
                  </button>
                );
              })}
            </div>

            {/* Campo customizado quando 'Outro' é selecionado */}
            {isCustom && (
              <div className="pt-2 animate-in fade-in duration-100">
                <input
                  type="text"
                  id="reprint-custom-reason-input"
                  value={customReason}
                  onChange={(e) => {
                    setCustomReason(e.target.value);
                    setValidationError(null);
                  }}
                  disabled={isProcessing}
                  placeholder="Especifique o motivo da reimpressão..."
                  maxLength={100}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                  autoFocus
                />
              </div>
            )}

            {validationError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}
          </div>

          {/* Aviso de Segurança */}
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl flex items-start gap-2.5 text-[11px] text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Regra de Segurança e Auditoria</p>
              <p className="text-amber-800 mt-0.5">
                Cada clique confirmado gera estritamente 1 cópia. A reimpressão não altera valores de caixa, pedidos ou dados financeiros originais.
              </p>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-stone-100">
            <button
              type="button"
              id="reprint-modal-cancel-btn"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-700 text-xs sm:text-sm font-semibold hover:bg-stone-100 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="reprint-modal-confirm-btn"
              disabled={!isValid || isProcessing}
              className="px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs sm:text-sm font-bold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Reimprimindo...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                  <span>Confirmar Reimpressão (1 Cópia)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
