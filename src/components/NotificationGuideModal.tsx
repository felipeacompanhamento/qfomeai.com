import React, { useEffect, useState } from 'react';
import { Bell, Settings, Share, PlusSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { requestNotificationPermissionAndRegister } from '../firebaseMessaging';

interface Props {
  onClose?: () => void;
}

export default function NotificationGuideModal({ onClose }: Props) {
  const { user } = useAuth();
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const [permissionState, setPermissionState] = useState<string>('default');

  useEffect(() => {
    // ...
    if ('Notification' in window) {
      setPermissionState(Notification.permission);
    }
    
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone === true);
    setIsStandalone(isStandaloneMode);
  }, []);

  const handleAction = async () => {
    if (isIOS && !isStandalone) {
      if (onClose) onClose();
      return;
    }

    if (permissionState === 'default' && user) {
      const success = await requestNotificationPermissionAndRegister(user.uid);
      if (success) {
        if (onClose) onClose();
      } else {
        if ('Notification' in window) {
          setPermissionState(Notification.permission);
        }
      }
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 text-center relative">
        {onClose && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100 transition-colors"
          >
            ✕
          </button>
        )}
        
        <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <Bell className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-stone-800 mb-4">
          {isIOS && !isStandalone ? 'Adicione à Tela de Início' : (permissionState === 'default' ? 'Ativar Notificações' : 'Precisamos da sua atenção!')}
        </h2>
        <p className="text-stone-600 mb-6">
          {isIOS && !isStandalone 
            ? 'Para garantir que você não perca nenhuma atualização do seu pedido no seu iPhone/iPad, você precisa adicionar nosso app à Tela de Início.'
            : (permissionState === 'default' 
                ? 'Para garantir que você não perca nenhuma atualização do seu pedido, ative as notificações.' 
                : 'Para garantir que você não perca nenhuma atualização do seu pedido, precisamos que você habilite as notificações no navegador.')}
        </p>
        
        {(isIOS && !isStandalone) ? (
          <div className="bg-stone-50 p-4 rounded-2xl text-left mb-6 border border-stone-100">
            <p className="text-sm font-bold text-stone-700 mb-2 flex items-center gap-2">
              Como instalar no iOS:
            </p>
            <ol className="text-sm text-stone-600 space-y-3 list-decimal pl-4">
              <li className="flex items-center gap-2">Toque no ícone de compartilhar <Share className="w-4 h-4 text-blue-500" /> na barra inferior do Safari.</li>
              <li className="flex items-center gap-2">Procure e toque em <span className="font-bold">Adicionar à Tela de Início</span> <PlusSquare className="w-4 h-4 text-stone-700" />.</li>
              <li>Abra o aplicativo pela sua Tela de Início e ative as notificações!</li>
            </ol>
          </div>
        ) : (permissionState === 'denied' && (
          <div className="bg-stone-50 p-4 rounded-2xl text-left mb-6 border border-stone-100">
            <p className="text-sm font-bold text-stone-700 mb-2 flex items-center gap-2">
              <Settings className="w-4 h-4" /> Como habilitar:
            </p>
            <ol className="text-xs text-stone-600 space-y-2 list-decimal pl-4">
              <li>Clique no ícone de <span className="font-bold">cadeado</span> ou <span className="font-bold">configurações</span> na barra de endereços do navegador.</li>
              <li>Procure por <span className="font-bold">Notificações</span>.</li>
              <li>Altere para <span className="font-bold">Permitir</span>.</li>
              <li>Recarregue a página.</li>
            </ol>
          </div>
        ))}

        <button 
          onClick={handleAction}
          className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-all"
        >
          {isIOS && !isStandalone ? 'Entendi' : (permissionState === 'default' ? 'Ativar Agora' : 'Recarregar página')}
        </button>
      </div>
    </div>
  );
}
