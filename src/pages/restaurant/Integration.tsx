import React, { useEffect, useState, useCallback } from 'react';
import { doc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs, startAfter, QueryDocumentSnapshot, DocumentData, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Save, ExternalLink, AlertCircle, CheckCircle2, Loader2, ShieldCheck, Activity, RefreshCw, ChevronDown } from 'lucide-react';

export default function MercadoPagoIntegration() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [settings, setSettings] = useState({
    mercadopago_access_token: '',
    mercadopago_public_key: '',
    mercadopago_enabled: false
  });
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 15;

  const fetchLogs = useCallback(async (isNextPage = false) => {
    if (!profile?.restaurantId) return;
    if (loadingLogs) return;
    if (isNextPage && !hasMore) return;

    setLoadingLogs(true);
    try {
      console.log(`[Integration] Iniciando busca de logs para restaurante: ${profile.restaurantId}`);
      const logsRef = collection(db, 'restaurants', profile.restaurantId, 'integration_logs');
      let q;
      
      if (isNextPage && lastDoc) {
        q = query(logsRef, orderBy('created_at', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));
      } else {
        q = query(logsRef, orderBy('created_at', 'desc'), limit(PAGE_SIZE));
      }

      const logsSnap = await getDocs(q);
      console.log(`[Integration] Logs recuperados: ${logsSnap.size}`);
      
      const fetchedLogs = logsSnap.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      }));

      if (isNextPage) {
        setLogs(prev => [...prev, ...fetchedLogs]);
      } else {
        setLogs(fetchedLogs);
      }

      setLastDoc(logsSnap.docs[logsSnap.docs.length - 1] || null);
      setHasMore(logsSnap.docs.length === PAGE_SIZE);
    } catch (logError: any) {
      console.error("Erro ao carregar logs:", logError);
      
      // Fallback sem ordenação caso falte índice
      if (logError.code === 'failed-precondition' || logError.message?.includes('index')) {
        try {
          const logsRef = collection(db, 'restaurants', profile.restaurantId, 'integration_logs');
          const q = query(logsRef, limit(PAGE_SIZE * 2)); // Pega um pouco mais no fallback
          const logsSnap = await getDocs(q);
          const fetchedLogs = logsSnap.docs.map(doc => ({
            id: doc.id,
            ...(doc.data() as any)
          })).sort((a: any, b: any) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
          });
          setLogs(fetchedLogs);
          setHasMore(false); // No fallback sem índice, desativamos paginação real
        } catch (err) {
          console.error("Erro no fallback de logs:", err);
        }
      }
    } finally {
      setLoadingLogs(false);
    }
  }, [profile?.restaurantId, lastDoc, hasMore, loadingLogs]);

  useEffect(() => {
    if (!profile?.restaurantId) return;

    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'restaurants', profile.restaurantId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings({
            mercadopago_access_token: data.mercadopago_access_token || '',
            mercadopago_public_key: data.mercadopago_public_key || '',
            mercadopago_enabled: data.mercadopago_enabled || false
          });
        }
      } catch (error) {
        console.error("Erro ao carregar configurações:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
    fetchLogs();
  }, [profile?.restaurantId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.restaurantId) return;

    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      // Se a integração estiver habilitada, validar as chaves primeiro
      if (settings.mercadopago_enabled) {
        try {
          const response = await fetch('/api/payments/mercadopago/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken: settings.mercadopago_access_token.trim(),
              publicKey: settings.mercadopago_public_key.trim()
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            setMessage({ type: 'error', text: errorData.error || 'Erro ao validar credenciais do Mercado Pago.' });
            setSaving(false);
            return; // Interrompe o salvamento se a validação falhar
          }
        } catch (err) {
          console.error("Erro na chamada de validação:", err);
          setMessage({ type: 'error', text: 'Não foi possível validar as chaves. Verifique sua conexão.' });
          setSaving(false);
          return;
        }
      }

      const docRef = doc(db, 'restaurants', profile.restaurantId);
      await updateDoc(docRef, {
        mercadopago_access_token: settings.mercadopago_access_token.trim(),
        mercadopago_public_key: settings.mercadopago_public_key.trim(),
        mercadopago_enabled: settings.mercadopago_enabled,
        updated_at: new Date().toISOString()
      });

      // Log the settings update
      try {
        const logsRef = collection(db, 'restaurants', profile.restaurantId, 'integration_logs');
        await addDoc(logsRef, {
          type: 'settings_update',
          provider: 'mercadopago',
          action: 'config_saved',
          status: settings.mercadopago_enabled ? 'enabled' : 'disabled',
          created_at: new Date().toISOString()
        });
        
        // Refresh logs to show the new one
        fetchLogs(false);
      } catch (logErr) {
        console.error("Erro ao logar atualização de configurações:", logErr);
      }

      setMessage({ type: 'success', text: 'Configurações salvas e validadas com sucesso!' });
      
      // Limpa a mensagem após 3 segundos
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
      handleFirestoreError(error, OperationType.UPDATE, `restaurants/${profile.restaurantId}`);
      setMessage({ type: 'error', text: 'Erro ao salvar as configurações. Tente novamente.' });
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
          <h2 className="text-2xl font-bold text-stone-800">Integração Mercado Pago</h2>
          <p className="text-stone-500 text-sm">Configure o recebimento automático via PIX do Mercado Pago.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-6 rounded-full p-1 transition-colors cursor-pointer ${settings.mercadopago_enabled ? 'bg-emerald-500' : 'bg-stone-300'}`}
                  onClick={() => setSettings(prev => ({ ...prev, mercadopago_enabled: !prev.mercadopago_enabled }))}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${settings.mercadopago_enabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
                <div>
                  <p className="font-bold text-stone-800 text-sm">Ativar Integração</p>
                  <p className="text-stone-500 text-xs">Habilita o processamento automático de PIX.</p>
                </div>
              </div>
              {settings.mercadopago_enabled && (
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wider">Ativo</span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Access Token</label>
                <input
                  type="password"
                  value={settings.mercadopago_access_token}
                  onChange={(e) => setSettings(prev => ({ ...prev, mercadopago_access_token: e.target.value }))}
                  placeholder="APP_USR-... ou TEST-..."
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none font-mono text-sm"
                  required={settings.mercadopago_enabled}
                />
                <p className="mt-1 text-[10px] text-stone-400">O seu Access Token do Mercado Pago.</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700 mb-1">Public Key</label>
                <input
                  type="text"
                  value={settings.mercadopago_public_key}
                  onChange={(e) => setSettings(prev => ({ ...prev, mercadopago_public_key: e.target.value }))}
                  placeholder="APP_USR-... ou TEST-..."
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none font-mono text-sm"
                  required={settings.mercadopago_enabled}
                />
                <p className="mt-1 text-[10px] text-stone-400">A sua Public Key do Mercado Pago.</p>
              </div>
            </div>

            {message.text && (
              <div className={`p-4 rounded-2xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <p className="text-sm font-bold">{message.text}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 disabled:bg-stone-300 transition-all shadow-lg shadow-emerald-100"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Salvar Configurações
                </>
              )}
            </button>
          </form>

          <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-4">
            <div className="flex items-center gap-3 text-blue-700">
              <ShieldCheck className="w-6 h-6" />
              <h4 className="font-bold">Segurança dos Dados</h4>
            </div>
            <p className="text-sm text-blue-600 leading-relaxed">
              Suas credenciais são armazenadas de forma segura e utilizadas apenas para gerar os pagamentos PIX e verificar o status dos mesmos automaticamente. Nunca compartilhe seu Access Token com terceiros.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
            <h4 className="font-bold text-stone-800 flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-emerald-500" /> Como obter as chaves?
            </h4>
            <div className="space-y-4">
              <p className="text-sm text-stone-500 leading-relaxed">
                Para integrar com o Mercado Pago, você precisa criar uma aplicação no painel de desenvolvedores.
              </p>
              <ol className="text-sm text-stone-600 space-y-3 list-decimal ml-4">
                <li>Acesse o <a href="https://www.mercadopago.com.br/developers/panel" target="_blank" rel="noopener noreferrer" className="text-emerald-600 font-bold hover:underline inline-flex items-center gap-1">Painel do Desenvolvedor <ExternalLink className="w-3 h-3" /></a></li>
                <li>Crie uma nova aplicação ou selecione uma existente.</li>
                <li>Vá em <strong>Credenciais de Produção</strong>.</li>
                <li>Copie o <strong>Access Token</strong> e a <strong>Public Key</strong>.</li>
              </ol>
            </div>
          </div>

          <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 space-y-4">
            <h4 className="font-bold text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Importante
            </h4>
            <p className="text-sm text-amber-700 leading-relaxed">
              Ao ativar esta integração, o sistema passará a gerar QRCodes dinâmicos do Mercado Pago. Os pagamentos serão confirmados automaticamente em seu painel assim que o cliente pagar.
            </p>
          </div>
        </div>
      </div>

      {/* Logs de Integração */}
      <div className="mt-8 bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-800">Logs de Transação</h3>
              <p className="text-sm text-stone-500">Histórico de eventos da integração com o Mercado Pago</p>
            </div>
          </div>
          <button 
            onClick={() => fetchLogs(false)}
            disabled={loadingLogs}
            className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all disabled:opacity-50"
            title="Atualizar Logs"
          >
            <RefreshCw className={`w-5 h-5 ${loadingLogs ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="p-0">
          <div className="overflow-x-auto">
            {logs.length === 0 && !loadingLogs ? (
              <div className="p-8 text-center text-stone-500 text-sm">
                Nenhum log de transação encontrado.
              </div>
            ) : (
              <table className="w-full text-left text-sm text-stone-600">
                <thead className="bg-stone-50 text-stone-500 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-6 py-4">Data/Hora</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Ação</th>
                    <th className="px-6 py-4">Pedido ID</th>
                    <th className="px-6 py-4">Pagamento ID</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                          log.type === 'webhook' ? 'bg-purple-100 text-purple-700' : 
                          log.type === 'create_payment' ? 'bg-blue-100 text-blue-700' :
                          'bg-stone-100 text-stone-700'
                        }`}>
                          {log.type || 'unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{log.action || '-'}</td>
                      <td className="px-6 py-4 font-mono text-xs">{log.orderId ? log.orderId.slice(-6).toUpperCase() : '-'}</td>
                      <td className="px-6 py-4 font-mono text-xs">{log.paymentId || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                          log.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          log.status === 'rejected' ? 'bg-red-100 text-red-700' :
                          log.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                          'bg-stone-100 text-stone-700'
                        }`}>
                          {log.status || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {loadingLogs && logs.length > 0 && (
            <div className="p-4 flex justify-center bg-stone-50/50">
              <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
            </div>
          )}

          {hasMore && logs.length > 0 && !loadingLogs && (
            <div className="p-4 border-t border-stone-100 flex justify-center">
              <button
                onClick={() => fetchLogs(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
              >
                <ChevronDown className="w-4 h-4" />
                Carregar mais logs
              </button>
            </div>
          )}

          {loadingLogs && logs.length === 0 && (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
