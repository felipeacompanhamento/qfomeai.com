import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Footer = () => {
  const location = useLocation();
  const showUsefulLinks = location.pathname === '/' || location.pathname === '/seja-parceiro';

  return (
    <footer className="bg-stone-900 text-stone-300 py-8 mt-12">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-white font-bold text-lg mb-4">Qfomeai</h3>
          <p className="text-sm">O seu delivery de comida favorito.</p>
        </div>
        
        {showUsefulLinks && (
          <div>
            <h3 className="text-white font-bold text-lg mb-4">Links Úteis</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/sobre" className="hover:text-white">Sobre nós</Link></li>
              <li><Link to="/cidades-atendidas" className="hover:text-white">Cidades Atendidas</Link></li>
              <li><Link to="/suporte" className="hover:text-white">Suporte</Link></li>
              <li><Link to="/termos" className="hover:text-white">Termos de Uso</Link></li>
              <li><Link to="/privacidade" className="hover:text-white">Política de Privacidade</Link></li>
            </ul>
          </div>
        )}

        <div>
          <h3 className="text-white font-bold text-lg mb-4">Parceiros</h3>
          <ul className="space-y-2 text-sm">
            <li><Link to="/seja-parceiro" className="hover:text-white">Seja um parceiro</Link></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 mt-8 pt-8 border-t border-stone-800 text-center text-xs">
        &copy; {new Date().getFullYear()} Qfomeai. Todos os direitos reservados.
      </div>
    </footer>
  );
};

export default Footer;
