import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const About = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-stone-50 py-8 md:py-12 px-4 md:px-6">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => navigate(-1)} 
          className="mb-6 flex items-center gap-2 text-stone-600 hover:text-emerald-600 transition-all font-bold"
        >
          <ChevronLeft className="w-5 h-5" />
          Voltar
        </button>
        <div className="bg-white p-6 md:p-12 rounded-2xl shadow-sm">
          <h1 className="text-3xl md:text-4xl font-extrabold text-stone-900 mb-6 tracking-tight">Sobre o Qfomeai</h1>
        <div className="space-y-6 text-lg text-stone-700 leading-relaxed">
          <p>
            O <strong>Qfomeai</strong> é o seu aplicativo de delivery de comida que conecta você aos melhores restaurantes da sua região de forma rápida, fácil e segura.
          </p>
          <p>
            Nossa missão é facilitar o dia a dia de quem busca praticidade na hora de pedir comida, oferecendo uma plataforma intuitiva e eficiente que valoriza os parceiros locais e garante a melhor experiência para o cliente final.
          </p>
          <p>
            Seja para um almoço rápido, um lanche da tarde ou aquele jantar especial, o Qfomeai está aqui para garantir que sua fome seja saciada com qualidade e agilidade.
          </p>
        </div>
      </div>
    </div>
  </div>
  );
};

export default About;
