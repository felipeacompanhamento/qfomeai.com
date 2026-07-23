import React, { useState, useEffect } from 'react';
import { 
  Settings, Save, Loader2, CheckCircle2, AlertCircle, Info,
  Bike, Eye, ShieldCheck, ToggleLeft, Activity, MessageSquare
} from 'lucide-react';
import { auth } from '../../../firebase';

interface DeliverySettingsData {
  deliveryPropria: boolean;
  atribuicaoManual: boolean;
  entregadorAceitaRecusa: boolean;
  tempoMedioEntrega: number;
  observacoesInternas: string;
}

export default function DeliverySettings() {
  const [settings, setSettings] = useState<DeliverySettingsData>({
    deliveryPropria: true,
    atribuicaoManual: true,
    entregadorAceitaRecusa: false,
    tempoMedioEntrega: 30,
    observacoesInternas: ''
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Seção expirada. Recarregue a página.');

      const response = await fetch('/api/restaurant/delivery-settings', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar configurações de entrega');
      }

      setSettings(data.settings);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Falha ao buscar configurações');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Não autenticado');

      const response = await fetch('/api/restaurant/delivery-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(settings)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar configurações');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-stone-200 font-sans">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
        <p className="text-stone-500 text-sm font-medium">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 font-sans">
      <div>
        <h2 className="text-2xl font-bold text-stone-800 font-sans">Configurações de Entrega</h2>
        <p className="text-stone-500 text-sm">Defina parâmetros operacionais, responsabilidades e observações para a equipe de entrega.</p>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-6">
        <div className="bg-white rounded-[2rem] border border-stone-200 p-6 sm:p-8 space-y-6 shadow-sm">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-sm text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-sm text-emerald-850">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Configurações de entrega salvas com sucesso!</span>
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-stone-850 font-bold text-base border-b border-stone-150 pb-2 flex items-center gap-2">
              <Bike className="w-5 h-5 text-stone-400" />
              <span>Logística e Atribuição</span>
            </h3>

            {/* Checkbox: Entrega Própria */}
            <div className="flex items-start gap-3.5 p-4 bg-stone-50 border border-stone-200 rounded-2.5xl transition-all hover:bg-stone-100/50">
              <div className="pt-0.5">
                <input
                  type="checkbox"
                  id="deliveryPropria"
                  checked={settings.deliveryPropria}
                  onChange={(e) => setSettings(p => ({ ...p, deliveryPropria: e.target.checked }))}
                  className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
              <div className="space-y-0.5">
                <label htmlFor="deliveryPropria" className="text-sm font-bold text-stone-800 cursor-pointer select-none">
                  Trabalhar com Entrega Própria (Sua equipe de entregadores)
                </label>
                <p className="text-xs text-stone-500">
                  Marque esta opção caso utilize um ou mais entregadores cadastrados e controlados diretamente pelo seu estabelecimento.
                </p>
              </div>
            </div>

            {/* Checkbox: Atribuição manual */}
            <div className="flex items-start gap-3.5 p-4 bg-stone-50 border border-stone-200 rounded-2.5xl transition-all hover:bg-stone-100/50">
              <div className="pt-0.5">
                <input
                  type="checkbox"
                  id="atribuicaoManual"
                  checked={settings.atribuicaoManual}
                  onChange={(e) => setSettings(p => ({ ...p, atribuicaoManual: e.target.checked }))}
                  className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
              <div className="space-y-0.5">
                <label htmlFor="atribuicaoManual" className="text-sm font-bold text-stone-800 cursor-pointer select-none">
                  Atribuição manual pelo painel
                </label>
                <p className="text-xs text-stone-500">
                  Permite que você escolha e atribua manualmente cada pedido para um entregador específico através do gerenciador de pedidos.
                </p>
              </div>
            </div>

            {/* Checkbox: Entregador pode aceitar/rejeitar */}
            <div className="flex items-start gap-3.5 p-4 bg-stone-50 border border-stone-200 rounded-2.5xl transition-all hover:bg-stone-100/50">
              <div className="pt-0.5">
                <input
                  type="checkbox"
                  id="entregadorAceitaRecusa"
                  checked={settings.entregadorAceitaRecusa}
                  onChange={(e) => setSettings(p => ({ ...p, entregadorAceitaRecusa: e.target.checked }))}
                  className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
              <div className="space-y-0.5">
                <label htmlFor="entregadorAceitaRecusa" className="text-sm font-bold text-stone-800 cursor-pointer select-none">
                  Permitir aceitar ou recusar chamados
                </label>
                <p className="text-xs text-stone-500">
                  Se ativado, os entregadores recebem uma notificação do pedido atribuído no aplicativo deles e podem optar por aceitar ou recusar a entrega.
                </p>
              </div>
            </div>
          </div>

          {/* Time average settings */}
          <div className="space-y-4">
            <h3 className="text-stone-850 font-bold text-base border-b border-stone-150 pb-2 flex items-center gap-2">
              <Activity className="w-5 h-5 text-stone-400" />
              <span>Tempo de Operação</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 p-5 bg-stone-50 rounded-2.5xl border border-stone-200">
                <label className="text-sm font-bold text-stone-800">Tempo médio de entrega (Minutos)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={settings.tempoMedioEntrega}
                    onChange={(e) => setSettings(p => ({ ...p, tempoMedioEntrega: Math.max(1, Number(e.target.value)) }))}
                    className="w-32 px-4 py-2 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-stone-800 text-center transition-all"
                  />
                  <span className="text-sm text-stone-500 font-semibold">minutos</span>
                </div>
                <p className="text-xs text-stone-400 pt-1 leading-relaxed">
                  Estimativa exibida para o cliente no site principal e no aplicativo durante o checkout de entregas.
                </p>
              </div>
            </div>
          </div>

          {/* Observacoes internas */}
          <div className="space-y-4">
            <h3 className="text-stone-850 font-bold text-base border-b border-stone-150 pb-2 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-stone-400" />
              <span>Avisos e Observações Internas</span>
            </h3>

            <div className="space-y-1">
              <label className="text-stone-600 text-xs font-bold">Observações / Recados para os Entregadores</label>
              <textarea
                rows={4}
                value={settings.observacoesInternas}
                onChange={(e) => setSettings(p => ({ ...p, observacoesInternas: e.target.value }))}
                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2.5xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium transition-all"
                placeholder="Ex. Entradas secundárias do condomínio interditadas; Atenção com cobrança duplicada; Retirar sacolas térmicas somente no balcão 2..."
              />
              <p className="text-xs text-stone-400 leading-relaxed">
                Estas instruções serão repassadas automaticamente dentro do painel ou aplicativo dos seus entregadores ao iniciar uma rota de entrega.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-450 text-white font-bold rounded-2xl transition-all text-sm shadow-md shadow-emerald-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4.5 h-4.5" />}
            <span>{saving ? 'Guardando...' : 'Salvar Configurações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
