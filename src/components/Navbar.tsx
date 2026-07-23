import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Receipt, ShoppingCart, User } from 'lucide-react';

export default function Navbar() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 py-2 px-4 flex justify-around items-center md:hidden z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
      <Link to="/" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/') ? 'text-stone-900' : 'text-stone-400 hover:text-stone-700'}`}>
        <Home className="w-5 h-5" />
        <span className="text-[10px] font-bold font-sans">Início</span>
      </Link>
      <Link to="/orders" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/orders') ? 'text-stone-900' : 'text-stone-400 hover:text-stone-700'}`}>
        <Receipt className="w-5 h-5" />
        <span className="text-[10px] font-bold font-sans">Pedidos</span>
      </Link>
      <Link to="/cart" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/cart') ? 'text-stone-900' : 'text-stone-400 hover:text-stone-700'}`}>
        <ShoppingCart className="w-5 h-5" />
        <span className="text-[10px] font-bold font-sans">Carrinho</span>
      </Link>
      <Link to="/profile" className={`flex flex-col items-center gap-1 transition-colors ${isActive('/profile') ? 'text-stone-900' : 'text-stone-400 hover:text-stone-700'}`}>
        <User className="w-5 h-5" />
        <span className="text-[10px] font-bold font-sans">Perfil</span>
      </Link>
    </nav>
  );
}
