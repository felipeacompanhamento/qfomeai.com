import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, X, ShieldAlert, AlertTriangle, Loader2, PauseCircle, CheckCircle2 } from 'lucide-react';
import { PrestadorServico } from '../../services/prestadorServicoService';

interface DeleteServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: PrestadorServico | null;
  isAdmin: boolean;
  onConfirmDelete?: (service: PrestadorServico) => Promise<void>;
  onPauseService?: (service: PrestadorServico) => Promise<void>;
}

export default function DeleteServiceModal({
  isOpen,
  onClose,
  service,
  isAdmin,
  onConfirmDelete,
  onPauseService,
}: DeleteServiceModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !service) return null;

  const handleDelete = async () => {
    if (!onConfirmDelete || !service) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onConfirmDelete(service);
      setIsDeleting(false);
      onClose();
    } catch (err: any) {
      console.error('Erro ao excluir serviço via modal:', err);
      setIsDeleting(false);
      setErrorMessage(err?.message || 'Ocorreu um erro ao tentar excluir o serviço.');
    }
  };

  const handlePause = async () => {
    if (!onPauseService || !service) return;
    try {
      await onPauseService(service);
      onClose();
    } catch (err: any) {
      console.error('Erro ao pausar serviço:', err);
      setErrorMessage('Não foi possível pausar o serviço.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isDeleting ? undefined : onClose}
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-stone-100 z-10"
          >
            {/* Close button */}
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-all disabled:opacity-50 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-6 md:p-8 text-center">
              {isAdmin ? (
                // ADMIN MODE: CONFIRM DELETION
                <>
                  <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm border border-red-100">
                    <Trash2 className="w-8 h-8" />
                  </div>

                  <h3 className="text-xl font-bold text-stone-900 mb-2">
                    Excluir Anúncio de Serviço?
                  </h3>

                  <p className="text-sm text-stone-600 mb-6 leading-relaxed">
                    Você está prestes a excluir permanentemente o serviço:
                    <br />
                    <span className="font-semibold text-stone-900 block mt-1 px-3 py-1.5 bg-stone-50 rounded-xl border border-stone-200/80 truncate">
                      "{service.titulo}"
                    </span>
                    <span className="text-xs text-red-500 block mt-2 font-medium">
                      Esta ação é irreversível e removerá todos os dados do banco.
                    </span>
                  </p>

                  {errorMessage && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl text-left flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Excluindo registro...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-5 h-5" />
                          <span>Excluir Permanentemente</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={onClose}
                      disabled={isDeleting}
                      className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold py-3 px-4 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                // NON-ADMIN MODE: EXPLAIN RESTRICTION
                <>
                  <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm border border-amber-100">
                    <ShieldAlert className="w-8 h-8" />
                  </div>

                  <h3 className="text-xl font-bold text-stone-900 mb-2">
                    Exclusão Restrita ao Administrador
                  </h3>

                  <p className="text-sm text-stone-600 mb-5 leading-relaxed text-left">
                    Por normas de integridade da plataforma, a <strong className="text-stone-800">exclusão definitiva</strong> de serviços cadastrados é realizada apenas pelos administradores do sistema.
                  </p>

                  <div className="p-3.5 bg-amber-50/80 border border-amber-200/60 rounded-xl text-left mb-6 text-xs text-amber-900 leading-normal flex items-start gap-2.5">
                    <PauseCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-semibold mb-0.5 text-amber-950">Dica: Pausar visibilidade</strong>
                      Você pode pausar seu anúncio a qualquer momento para ocultá-lo da busca de clientes sem perder seus dados.
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {onPauseService && (
                      <button
                        onClick={handlePause}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <PauseCircle className="w-5 h-5" />
                        <span>Pausar Este Anúncio Agora</span>
                      </button>
                    )}

                    <button
                      onClick={onClose}
                      className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold py-3 px-4 rounded-xl transition-all cursor-pointer"
                    >
                      Entendido
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
