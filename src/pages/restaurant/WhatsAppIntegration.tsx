import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { MessageSquare, CheckCircle2, XCircle, Loader2, Info, ExternalLink, Smartphone } from 'lucide-react';

declare global {
  interface Window {
    fbAsyncInit: () => void;
    FB: any;
  }
}

export default function WhatsAppIntegration() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    whatsapp_enabled: false,
    whatsapp_phone_number_id: '',
    whatsapp_token: ''
  });
  const [status, setStatus] = useState<'connected' | 'disconnected'>('disconnected');

  useEffect(() => {
    // Load Facebook SDK
    const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
    if (!appId) {
      console.warn("VITE_FACEBOOK_APP_ID não configurado no .env");
      return;
    }

    window.fbAsyncInit = function() {
      window.FB.init({
        appId: appId,
        cookie: true,
        xfbml: true,
        version: 'v18.0'
      });
    };

    (function(d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s) as HTMLScriptElement; js.id = id;
      js.src = "https://connect.facebook.net/en_US/sdk.js";
      fjs.parentNode?.insertBefore(js, fjs);
    }(document, 'script', 'facebook-jssdk'));
  }, []);

  useEffect(() => {
    if (!profile?.restaurantId) return;

    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'restaurants', profile.restaurantId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings({
            whatsapp_enabled: data.whatsapp_enabled || false,
            whatsapp_phone_number_id: data.whatsapp_phone_number_id || '',
            whatsapp_token: data.whatsapp_token || ''
          });
          if (data.whatsapp_enabled && data.whatsapp_token && data.whatsapp_phone_number_id) {
            setStatus('connected');
          }
        }
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [profile?.restaurantId]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.restaurantId) return;
    setSaving(true);
    
    try {
      const docRef = doc(db, 'restaurants', profile.restaurantId);
      await updateDoc(docRef, {
        whatsapp_enabled: true,
        whatsapp_token: settings.whatsapp_token,
        whatsapp_phone_number_id: settings.whatsapp_phone_number_id,
        whatsapp_connected_at: new Date().toISOString()
      });
      
      setStatus('connected');
    } catch (error) {
      console.error("Erro ao salvar configurações do WhatsApp:", error);
      handleFirestoreError(error, OperationType.UPDATE, `restaurants/${profile.restaurantId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleConnectEmbedded = () => {
    if (!window.FB) {
      alert("O SDK do Facebook ainda está carregando. Por favor, aguarde alguns segundos.");
      return;
    }

    window.FB.login((response: any) => {
      if (response.authResponse) {
        const accessToken = response.authResponse.accessToken;
        processMetaLogin(accessToken);
      } else {
        console.log('Usuário cancelou o login ou não autorizou totalmente.');
      }
    }, {
      scope: 'whatsapp_business_management,whatsapp_business_messaging',
      extras: {
        feature: 'whatsapp_embedded_signup'
      }
    });
  };

  const processMetaLogin = async (accessToken: string) => {
    if (!profile?.restaurantId) return;
    setSaving(true);

    try {
      // 1. Buscar contas de WhatsApp Business vinculadas
      const accountsResponse = await fetch(`https://graph.facebook.com/v18.0/me/whatsapp_business_accounts?access_token=${accessToken}`);
      const accountsData = await accountsResponse.json();

      if (!accountsData.data || accountsData.data.length === 0) {
        throw new Error("Nenhuma conta do WhatsApp Business encontrada vinculada a este perfil.");
      }

      const wabaId = accountsData.data[0].id;

      // 2. Buscar números de telefone vinculados a essa conta
      const phonesResponse = await fetch(`https://graph.facebook.com/v18.0/${wabaId}/phone_numbers?access_token=${accessToken}`);
      const phonesData = await phonesResponse.json();

      if (!phonesData.data || phonesData.data.length === 0) {
        throw new Error("Nenhum número de telefone encontrado na conta do WhatsApp Business.");
      }

      const phoneNumberId = phonesData.data[0].id;

      // 3. Salvar no Firestore
      const docRef = doc(db, 'restaurants', profile.restaurantId);
      await updateDoc(docRef, {
        whatsapp_enabled: true,
        whatsapp_token: accessToken,
        whatsapp_phone_number_id: phoneNumberId,
        whatsapp_waba_id: wabaId,
        whatsapp_connected_at: new Date().toISOString()
      });

      setSettings({
        whatsapp_enabled: true,
        whatsapp_token: accessToken,
        whatsapp_phone_number_id: phoneNumberId
      });
      setStatus('connected');
      alert("WhatsApp conectado com sucesso via Meta Embedded Signup!");
    } catch (error: any) {
      console.error("Erro ao processar login da Meta:", error);
      alert(`Erro na integração: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!profile?.restaurantId) return;
    if (!window.confirm('Tem certeza que deseja desconectar a integração com WhatsApp?')) return;
    
    setSaving(true);
    try {
      const docRef = doc(db, 'restaurants', profile.restaurantId);
      await updateDoc(docRef, {
        whatsapp_enabled: false,
        whatsapp_disconnected_at: new Date().toISOString()
      });
      
      setSettings(prev => ({ ...prev, whatsapp_enabled: false }));
      setStatus('disconnected');
    } catch (error) {
      console.error("Erro ao desconectar WhatsApp:", error);
      handleFirestoreError(error, OperationType.UPDATE, `restaurants/${profile.restaurantId}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Integração com WhatsApp</h2>
          <p className="text-stone-500 text-sm">Conecte seu restaurante à API oficial do WhatsApp Business.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center shadow-lg ${status === 'connected' ? 'bg-emerald-100 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                <MessageSquare className="w-10 h-10" />
              </div>
              
              <div>
                <h3 className="text-xl font-bold text-stone-800">
                  Status: {status === 'connected' ? 'Conectado ✅' : 'Desconectado'}
                </h3>
                <p className="text-stone-500 text-sm mt-1">
                  {status === 'connected' 
                    ? 'Seu restaurante está pronto para enviar notificações automáticas.' 
                    : 'Configure suas credenciais da Meta para automatizar o atendimento.'}
                </p>
              </div>

              {status === 'disconnected' ? (
                <div className="w-full space-y-6">
                  <form onSubmit={handleSaveSettings} className="space-y-4 text-left">
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-700">Phone Number ID</label>
                      <input
                        type="text"
                        value={settings.whatsapp_phone_number_id}
                        onChange={e => setSettings(prev => ({ ...prev, whatsapp_phone_number_id: e.target.value }))}
                        placeholder="Ex: 105678901234567"
                        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold text-stone-700">Access Token (Permanente)</label>
                      <input
                        type="password"
                        value={settings.whatsapp_token}
                        onChange={e => setSettings(prev => ({ ...prev, whatsapp_token: e.target.value }))}
                        placeholder="EAAG..."
                        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 disabled:bg-stone-300 transition-all shadow-lg shadow-emerald-100"
                    >
                      {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar e Ativar Integração'}
                    </button>
                  </form>

                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stone-200"></div></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-stone-400 font-bold">Ou use o fluxo oficial</span></div>
                  </div>

                  <button
                    onClick={handleConnectEmbedded}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    <MessageSquare className="w-5 h-5" /> Conectar via Meta Embedded Signup
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDisconnect}
                  disabled={saving}
                  className="w-full max-w-xs flex items-center justify-center gap-2 py-4 bg-white border-2 border-red-100 text-red-600 font-bold rounded-2xl hover:bg-red-50 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Desconectar WhatsApp'}
                </button>
              )}
            </div>

            <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
              <Info className="w-6 h-6 text-amber-600 shrink-0" />
              <div className="space-y-1">
                <p className="font-bold text-amber-900 text-sm">Regra de Envio (Janela de 24h)</p>
                <p className="text-amber-800 text-xs leading-relaxed">
                  As mensagens automáticas só são enviadas após o cliente iniciar uma conversa. 
                  Isso abre uma janela de 24 horas onde o sistema pode enviar atualizações de pedido.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-6">
            <h4 className="font-bold text-stone-800 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-500" /> Mensagens Automáticas
            </h4>
            
            <div className="space-y-4">
              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Mensagem de Boas-vindas</p>
                <p className="text-sm text-stone-700 italic">
                  "Olá! 👋 Seja bem-vindo ao <strong>*{profile?.nome_fantasia || profile?.nome || 'Nome do Restaurante'}*</strong>.<br/><br/>
                  Confira nosso cardápio completo e realize seu pedido através do nosso catálogo:<br/>
                  👉 https://qfomeai.com/<strong>{profile?.restaurantId || 'slug'}</strong><br/><br/>
                  Aguardamos você! ✨"
                </p>
              </div>

              <div className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Atualizações de Pedido</p>
                <ul className="text-sm text-stone-700 space-y-2">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Pedido recebido</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Em preparo</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Saiu para entrega</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Finalizado</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
            <h4 className="font-bold text-stone-800 flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-emerald-500" /> Configuração Técnica
            </h4>
            <div className="space-y-4">
              <p className="text-sm text-stone-500 leading-relaxed">
                Esta integração utiliza a API oficial do WhatsApp Business. Para configurar, você precisará de uma conta no Meta for Developers.
              </p>
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-xs text-blue-700 font-bold mb-2">Webhook URL:</p>
                <code className="text-[10px] bg-white p-2 rounded block border border-blue-200 break-all">
                  {window.location.origin}/api/whatsapp/webhook
                </code>
              </div>
              <a 
                href="https://developers.facebook.com/docs/whatsapp/cloud-api" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-stone-100 text-stone-600 font-bold text-xs rounded-xl hover:bg-stone-200 transition-all"
              >
                Documentação Meta <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

            <div className="bg-red-50 p-6 rounded-3xl border border-red-100 space-y-4">
            <h4 className="font-bold text-red-800 flex items-center gap-2">
              <XCircle className="w-4 h-4" /> Importante
            </h4>
            <p className="text-sm text-red-700 leading-relaxed">
              O sistema só responderá mensagens automaticamente se o restaurante estiver com o status <strong>Aberto</strong>.
            </p>
            <p className="text-sm text-red-700 leading-relaxed">
              O envio de mensagens fora da janela de 24h ou sem a interação prévia do cliente pode resultar no bloqueio do seu número pela Meta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
