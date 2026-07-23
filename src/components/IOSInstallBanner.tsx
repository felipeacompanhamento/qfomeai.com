import React, { useEffect, useState } from 'react';
import { Share, PlusSquare, X } from 'lucide-react';

export default function IOSInstallBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show on iOS and when not in standalone mode
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone === true);
    
    // Check if user has explicitly dismissed this specific banner
    const isDismissed = sessionStorage.getItem('@qfomeai:ios-banner-dismissed');

    if (isIOS && !isStandalone && !isDismissed) {
      setIsVisible(true);
    }
  }, []);

  if (!isVisible) return null;

  const dismiss = () => {
    sessionStorage.setItem('@qfomeai:ios-banner-dismissed', 'true');
    setIsVisible(false);
  };

  return (
    <div className="bg-emerald-600 text-white p-4 shadow-md relative group">
      <button 
        onClick={dismiss}
        className="absolute top-2 right-2 p-1 bg-emerald-700/50 hover:bg-emerald-800 rounded-full transition-colors"
        aria-label="Ignorar"
      >
        <X className="w-4 h-4" />
      </button>
      
      <div className="flex flex-col sm:flex-row items-center gap-3 max-w-7xl mx-auto px-4 pr-8">
        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
          <img src="/logo.png" alt="App Icon" className="w-6 h-6 object-contain drop-shadow-sm" />
        </div>
        
        <div className="flex-1 text-sm leading-tight text-center sm:text-left">
          <p className="font-bold mb-1">Receba atualizações do seu pedido!</p>
          <p className="text-emerald-100 text-xs">
            Instale o QFomeai no seu iPhone: toque no ícone <Share className="w-3 h-3 inline-block mx-1" /> e depois em <strong className="text-white">Adicionar à Tela de Início</strong> <PlusSquare className="w-3 h-3 inline-block mx-1" />
          </p>
        </div>
      </div>
    </div>
  );
}
