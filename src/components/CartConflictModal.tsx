import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CartConflictModal({ isOpen, onConfirm, onCancel }: Props) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
          >
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-10 h-10" />
              </div>
              
              <h2 className="text-2xl font-bold text-stone-800 mb-4">Carrinho com itens de outro restaurante</h2>
              
              <p className="text-stone-600 mb-8 leading-relaxed">
                Seu carrinho já contém itens de outro restaurante. Deseja <span className="font-bold text-red-500">limpar o carrinho</span> para adicionar este novo item?
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={onConfirm}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  Limpar e adicionar
                </button>
                
                <button
                  onClick={onCancel}
                  className="w-full bg-stone-100 text-stone-600 py-4 rounded-2xl font-bold hover:bg-stone-200 transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-5 h-5" />
                  Manter carrinho atual
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
