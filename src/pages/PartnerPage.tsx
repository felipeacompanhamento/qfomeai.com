import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, TrendingUp, Clock, ShieldCheck, ArrowRight, Star, Users, CheckCircle, HelpCircle } from 'lucide-react';
import { collection, collectionGroup, query, where, getCountFromServer, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export default function PartnerPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ orders: 0, restaurants: 0 });

  useEffect(() => {
    async function fetchStats() {
      console.log("Fetching stats...");
      try {
        const statsDoc = await getDoc(doc(db, 'public_stats', 'global'));
        if (statsDoc.exists()) {
          const data = statsDoc.data();
          setStats({
            orders: data.orders || 0,
            restaurants: data.restaurants || 0
          });
          console.log("Stats fetched:", data);
        } else {
          console.log("Stats document not found.");
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans text-stone-800 scroll-smooth">
      {/* Hero */}
      <header className="bg-emerald-600 text-white py-12 md:py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <button onClick={() => navigate('/')} className="mb-8 flex items-center gap-2 text-emerald-100 hover:text-white transition-all">
            <ChevronLeft className="w-5 h-5" />
            Voltar para o app
          </button>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-6 tracking-tight leading-tight">Transforme sua cozinha em uma máquina de vendas. Entregue mais, lucre mais.</h1>
          <p className="text-lg md:text-xl text-emerald-100 mb-10">Alcance milhares de clientes famintos na sua região, gerencie tudo de forma simples e aumente seu faturamento sem taxas abusivas.</p>
          <Link 
            to="/register-restaurant" 
            className="inline-flex items-center gap-3 bg-white text-emerald-600 px-6 py-4 md:px-10 md:py-5 rounded-2xl font-bold text-lg md:text-xl shadow-2xl hover:bg-emerald-50 transition-all active:scale-95"
          >
            Quero cadastrar meu restaurante agora
            <ArrowRight className="w-6 h-6" />
          </Link>
          <p className="mt-4 text-emerald-100 text-sm">Cadastro rápido e sem burocracia. Leva menos de 5 minutos.</p>
          
          <div className="mt-12 flex justify-center gap-4 md:gap-8 text-emerald-50">
            <div className="flex flex-col items-center">
              <span className="text-2xl md:text-3xl font-bold">+{stats.orders.toLocaleString()}</span>
              <span className="text-xs md:text-sm">pedidos realizados</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl md:text-3xl font-bold">+{stats.restaurants.toLocaleString()}</span>
              <span className="text-xs md:text-sm">restaurantes parceiros</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Menu */}
      <nav className="sticky top-0 bg-white border-b border-stone-200 z-50 py-4 px-4 shadow-sm overflow-x-auto whitespace-nowrap scrollbar-hide">
        <div className="max-w-4xl mx-auto flex justify-center md:justify-center gap-4 md:gap-6 text-sm font-bold text-stone-600">
          <button onClick={() => document.getElementById('planos')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-emerald-600 transition-colors shrink-0">Planos</button>
          <button onClick={() => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-emerald-600 transition-colors shrink-0">Como funciona</button>
          <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-emerald-600 transition-colors shrink-0">Perguntas frequentes</button>
        </div>
      </nav>

      {/* Plans */}
      <section id="planos" className="py-16 md:py-24 px-4 bg-stone-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-stone-800 mb-12 md:mb-16">Planos transparentes e justos</h2>
          <div className="bg-white p-6 md:p-10 rounded-3xl shadow-sm border border-stone-100">
            <div className="mb-8">
              <h3 className="text-xl md:text-2xl font-bold text-emerald-600 mb-2">Primeiros 30 dias grátis</h3>
              <p className="text-stone-600">Experimente sem compromisso. Sem taxas, sem necessidade de cartão de crédito.</p>
            </div>
            <div className="space-y-4">
              <h4 className="font-bold text-stone-800">Após o período de experiência:</h4>
              <ul className="space-y-3">
                <li className="flex items-start md:items-center gap-3 text-stone-700">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5 md:mt-0" />
                  <span>Faturamento até R$ 1.800: <strong>8% de taxa</strong></span>
                </li>
                <li className="flex items-start md:items-center gap-3 text-stone-700">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5 md:mt-0" />
                  <span>Faturamento acima de R$ 1.800: <strong>5% de taxa</strong></span>
                </li>
                <li className="flex items-start md:items-center gap-3 text-stone-700">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5 md:mt-0" />
                  <span><strong>Zero mensalidade</strong></span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-24 px-4 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-stone-800 mb-16">Por que os melhores restaurantes escolheram o Qfomeai?</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { icon: TrendingUp, title: 'Alcance Imediato', desc: 'Seu cardápio na tela de milhares de clientes famintos.' },
            { icon: Clock, title: 'Gestão Descomplicada', desc: 'Painel intuitivo. Aceite pedidos e gerencie cardápio com poucos cliques.' },
            { icon: ShieldCheck, title: 'Mais Dinheiro no Bolso', desc: 'Taxas justas e transparentes. Seu esforço merece um retorno real.' },
            { icon: Users, title: 'Suporte de Verdade', desc: 'Esqueça os robôs. Suporte humano que entende a rotina de um restaurante.' },
          ].map((b, i) => (
            <div key={i} className="p-8 bg-stone-50 rounded-3xl border border-stone-100">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
                <b.icon className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-800 mb-3">{b.title}</h3>
              <p className="text-stone-500">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="como-funciona" className="py-24 bg-stone-50 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-stone-800 mb-16">Começar é mais fácil do que preparar seu prato principal</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Cadastre-se', desc: 'Preencha seus dados básicos e os do seu restaurante.' },
              { step: '02', title: 'Monte seu Cardápio', desc: 'Suba fotos e preços pelo nosso painel simplificado.' },
              { step: '03', title: 'Comece a Vender', desc: 'Ative sua loja e receba seu primeiro pedido em minutos.' },
            ].map((item, idx) => (
              <div key={idx} className="bg-white p-8 rounded-3xl shadow-sm">
                <span className="text-4xl font-bold text-emerald-600 mb-4 block">{item.step}</span>
                <h3 className="text-xl font-bold text-stone-800 mb-2">{item.title}</h3>
                <p className="text-stone-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-16 md:py-24 px-4 max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-stone-800 mb-12 md:mb-16">Quem já está vendendo mais, recomenda</h2>
        <div className="bg-emerald-50 p-6 md:p-10 rounded-3xl">
          <p className="text-lg md:text-xl text-stone-700 italic mb-6">"Antes, eu ficava refém das taxas altas dos grandes apps e não tinha suporte nenhum. Aqui, não só meu faturamento aumentou 30%, como finalmente sinto que tenho um parceiro que se importa com o meu negócio."</p>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-200 rounded-full flex items-center justify-center font-bold text-emerald-800">J</div>
            <div>
              <p className="font-bold text-stone-800">João Silva</p>
              <p className="text-sm text-stone-500">Pizzaria do João</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ / Objections */}
      <section id="faq" className="py-24 px-4 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-stone-800 mb-16">Dúvidas comuns</h2>
        <div className="space-y-6">
          {[
            { q: 'É caro?', a: 'Nossa taxa é desenhada para ser sustentável para o seu negócio. Nós só ganhamos quando você vende.' },
            { q: 'É difícil usar?', a: 'Se você sabe usar um smartphone, sabe usar nosso painel. Criamos tudo pensando na correria da cozinha.' },
            { q: 'Vou ter retorno?', a: 'Sim. Nossa plataforma é otimizada para converter visitantes em pedidos. Fornecemos dados para você ajustar seu cardápio.' },
          ].map((item, i) => (
            <div key={i} className="border-b border-stone-100 pb-6">
              <h3 className="text-lg font-bold text-stone-800 mb-2 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-emerald-600" />
                {item.q}
              </h3>
              <p className="text-stone-500 pl-7">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-16 md:py-24 px-4 text-center bg-stone-900 text-white">
        <h2 className="text-3xl md:text-4xl font-bold mb-8">Não perca mais nenhum pedido.</h2>
        <Link 
          to="/register-restaurant" 
          className="inline-flex items-center gap-3 bg-emerald-600 text-white px-8 py-4 md:px-10 md:py-5 rounded-2xl font-bold text-lg md:text-xl shadow-xl hover:bg-emerald-700 transition-all active:scale-95"
        >
          Quero cadastrar meu restaurante agora
        </Link>
        <p className="mt-4 text-stone-400">Sem taxa de adesão. Cancele quando quiser.</p>
      </section>
    </div>
  );
}
