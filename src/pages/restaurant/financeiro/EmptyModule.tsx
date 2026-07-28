import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';

interface EmptyModuleProps {
  title: string;
}

export function EmptyModule({ title }: EmptyModuleProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-white rounded-3xl border border-stone-200 text-center shadow-sm max-w-xl mx-auto my-12">
      <div className="bg-amber-50 w-16 h-16 rounded-2xl flex items-center justify-center text-amber-600 mb-6">
        <Clock className="w-8 h-8" />
      </div>
      <h2 className="text-2xl font-bold text-stone-800 mb-2">{title}</h2>
      <p className="text-stone-500 mb-8 max-w-sm">
        Módulo em desenvolvimento. Em breve você terá acesso completo a esta funcionalidade.
      </p>
      <button
        onClick={() => navigate('/restaurant/financeiro')}
        className="flex items-center gap-2 px-6 py-3 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200 transition-all text-sm active:scale-[0.98]"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar ao Financeiro
      </button>
    </div>
  );
}
