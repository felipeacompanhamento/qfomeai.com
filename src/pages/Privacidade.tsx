import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

export default function Privacidade() {
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
      <h1 className="text-2xl md:text-3xl font-bold text-stone-800">Política de Privacidade</h1>
      <div className="prose prose-stone">
        <p>Sua privacidade é importante para nós. Esta política explica como coletamos e usamos seus dados.</p>
        <h2 className="text-xl font-semibold">1. Coleta de Dados</h2>
        <p>Coletamos informações como nome, telefone, endereço e e-mail para processar seus pedidos.</p>
        <h2 className="text-xl font-semibold">2. Uso dos Dados</h2>
        <p>Seus dados são usados exclusivamente para facilitar a entrega dos pedidos e comunicação sobre o status dos mesmos.</p>
        <h2 className="text-xl font-semibold">3. Segurança</h2>
        <p>Adotamos medidas técnicas para proteger suas informações contra acessos não autorizados.</p>
        <h2 className="text-xl font-semibold">4. Direito de Exclusão</h2>
        <p>Você pode solicitar a exclusão de seus dados a qualquer momento entrando em contato conosco.</p>
      </div>
    </div>
  );
}
