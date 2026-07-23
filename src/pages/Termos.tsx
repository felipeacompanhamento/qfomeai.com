import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function Termos() {
  const navigate = useNavigate();
  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <button 
        onClick={() => navigate(-1)} 
        className="flex items-center gap-2 text-stone-600 hover:text-emerald-600 transition-all font-bold"
      >
        <ChevronLeft className="w-5 h-5" />
        Voltar
      </button>
      <h1 className="text-2xl md:text-3xl font-bold text-stone-800">Termos de Uso</h1>
      <div className="prose prose-stone">
        <p>Bem-vindo ao Qfomeai. Ao utilizar nossa plataforma, você concorda com estes termos.</p>
        <h2 className="text-xl font-semibold">1. Uso da Plataforma</h2>
        <p>Você se compromete a utilizar a plataforma de forma ética e legal.</p>
        <h2 className="text-xl font-semibold">2. Responsabilidades</h2>
        <p>O usuário é responsável pela veracidade das informações fornecidas.</p>
        <h2 className="text-xl font-semibold">3. Limitações</h2>
        <p>Não nos responsabilizamos por falhas de terceiros ou interrupções no serviço.</p>
      </div>
    </div>
  );
}
