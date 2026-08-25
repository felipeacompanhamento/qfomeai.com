import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Settings, Save, Loader2, CheckCircle2, AlertCircle, Info,
  Bike, Eye, ShieldCheck, ToggleLeft, Activity, MessageSquare, MapPin
} from 'lucide-react';
import { auth } from '../../../firebase';
import { Card, Badge, Button, Textarea, InlineFeedback, LoadingState, Checkbox, TextInput } from '../../../components/ui';

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
    return <LoadingState message="Carregando configurações..." />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 font-sans">
      {/* Shortcut to Delivery Rates / Areas */}
      <Card padding="md" className="bg-emerald-50/70 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-2xl shrink-0 mt-0.5 shadow-2xs">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="font-extrabold text-stone-850 text-sm">Bairros e Taxas de Entrega</h4>
            <p className="text-xs text-stone-600 font-semibold leading-relaxed">
              Gerencie a área de cobertura por raio, bairros atendidos e taxas cobradas dos clientes nas configurações.
            </p>
          </div>
        </div>
        <Link
          to="/restaurant/configuracoes/entrega"
          className="px-4 py-2.5 min-h-[40px] flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl text-center shrink-0 transition-all shadow-xs cursor-pointer"
        >
          Ir para Bairros e Taxas
        </Link>
      </Card>

      <form onSubmit={handleFormSubmit} className="space-y-6">
        <Card padding="lg" className="space-y-6">
          {error && (
            <InlineFeedback type="error" message={error} />
          )}

          {success && (
            <InlineFeedback type="success" message="Configurações de entrega salvas com sucesso!" />
          )}

          <div className="space-y-4">
            <h3 className="text-stone-850 font-extrabold text-base border-b border-stone-100 pb-2.5 flex items-center gap-2">
              <Bike className="w-5 h-5 text-stone-400" />
              <span>Logística e atribuição</span>
            </h3>

            {/* Checkbox: Entrega Própria */}
            <div className="flex items-start gap-3.5 p-4 bg-stone-50/60 border border-stone-200/85 rounded-2xl transition-all hover:bg-stone-50">
              <Checkbox
                id="deliveryPropria"
                checked={settings.deliveryPropria}
                onChange={(checked) => setSettings(p => ({ ...p, deliveryPropria: checked }))}
                label="Trabalhar com entrega própria (sua equipe de entregadores)"
                description="Marque esta opção caso utilize um ou mais entregadores cadastrados e controlados diretamente pelo seu estabelecimento."
              />
            </div>

            {/* Checkbox: Atribuição manual */}
            <div className="flex items-start gap-3.5 p-4 bg-stone-50/60 border border-stone-200/85 rounded-2xl transition-all hover:bg-stone-50">
              <Checkbox
                id="atribuicaoManual"
                checked={settings.atribuicaoManual}
                onChange={(checked) => setSettings(p => ({ ...p, atribuicaoManual: checked }))}
                label="Atribuição manual pelo painel"
                description="Permite que você escolha e atribua manualmente cada pedido para um entregador específico através do gerenciador de pedidos."
              />
            </div>

            {/* Checkbox: Entregador pode aceitar/rejeitar */}
            <div className="flex items-start gap-3.5 p-4 bg-stone-50/60 border border-stone-200/85 rounded-2xl transition-all hover:bg-stone-50">
              <Checkbox
                id="entregadorAceitaRecusa"
                checked={settings.entregadorAceitaRecusa}
                onChange={(checked) => setSettings(p => ({ ...p, entregadorAceitaRecusa: checked }))}
                label="Permitir aceitar ou recusar chamados"
                description="Se ativado, os entregadores recebem uma notificação do pedido atribuído no aplicativo deles e podem optar por aceitar ou recusar a entrega."
              />
            </div>
          </div>

          {/* Time average settings */}
          <div className="space-y-4">
            <h3 className="text-stone-850 font-extrabold text-base border-b border-stone-100 pb-2.5 flex items-center gap-2">
              <Activity className="w-5 h-5 text-stone-400" />
              <span>Tempo de operação</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 p-5 bg-stone-50/60 border border-stone-200/85 rounded-2xl">
                <label className="text-xs font-bold text-stone-700 block">Tempo médio de entrega</label>
                <div className="flex items-center gap-3">
                  <TextInput
                    type="number"
                    min={1}
                    max={180}
                    value={settings.tempoMedioEntrega}
                    onChange={(e) => setSettings(p => ({ ...p, tempoMedioEntrega: Math.max(1, Number(e.target.value)) }))}
                    className="w-28 text-center font-extrabold"
                  />
                  <span className="text-xs text-stone-500 font-bold">minutos</span>
                </div>
                <p className="text-xs text-stone-400 pt-1 leading-normal">
                  Estimativa exibida para o cliente no site principal e no aplicativo durante o checkout de entregas.
                </p>
              </div>
            </div>
          </div>

          {/* Observacoes internas */}
          <div className="space-y-4">
            <h3 className="text-stone-850 font-extrabold text-base border-b border-stone-100 pb-2.5 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-stone-400" />
              <span>Avisos e observações internas</span>
            </h3>

            <div className="space-y-2">
              <label className="text-stone-500 text-xs font-bold block">Observações / recados para os entregadores</label>
              <Textarea
                rows={4}
                value={settings.observacoesInternas}
                onChange={(e) => setSettings(p => ({ ...p, observacoesInternas: e.target.value }))}
                placeholder="Ex. Entradas secundárias do condomínio interditadas; Atenção com cobrança duplicada; Retirar sacolas térmicas somente no balcão 2..."
              />
              <p className="text-xs text-stone-400 leading-normal pt-1">
                Estas instruções serão repassadas automaticamente dentro do painel ou aplicativo dos seus entregadores ao iniciar uma rota de entrega.
              </p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={saving}
            loading={saving}
            icon={<Save className="w-4 h-4" />}
            variant="primary"
            size="md"
          >
            Salvar Configurações
          </Button>
        </div>
      </form>
    </div>
  );
}
