import React, { useState, useEffect, useCallback } from 'react';
import { legacyAuditService, AuditReport, SystemCompatibilityConfig } from '../../services/legacyAuditService';
import { useAuth } from '../../contexts/AuthContext';
import { Shield, AlertTriangle, CheckCircle, RefreshCw, Lock, AlertCircle, ToggleLeft, ToggleRight, List, Info, ChevronRight } from 'lucide-react';

interface LegacyAuditDashboardProps {
  restaurants: any[];
}

export const LegacyAuditDashboard: React.FC<LegacyAuditDashboardProps> = ({ restaurants }) => {
  const { profile, user } = useAuth();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [config, setConfig] = useState<SystemCompatibilityConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingFlag, setUpdatingFlag] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Controlled test mode state
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [rep, cfg] = await Promise.all([
        legacyAuditService.runAudit(),
        legacyAuditService.getCompatibilityConfig()
      ]);
      setReport(rep);
      setConfig(cfg);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao carregar auditoria.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleGlobalFlag = async () => {
    if (!config) return;
    setUpdatingFlag(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const nextValue = !config.legacyUserCompatibilityEnabled;

    try {
      const operator = {
        uid: user?.uid || profile?.uid || 'admin',
        email: user?.email || profile?.email || 'admin@sistema',
        role: profile?.role,
        accountType: profile?.accountType
      };

      const updated = await legacyAuditService.updateCompatibilityConfig(operator, nextValue);
      setConfig(updated);
      setSuccessMessage(
        nextValue 
          ? 'Compatibilidade legada reativada com sucesso.' 
          : 'Compatibilidade legada desativada globalmente com sucesso! O sistema está operando exclusivamente no modelo canônico.'
      );
      // Refresh audit report
      const newReport = await legacyAuditService.runAudit();
      setReport(newReport);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao alterar a flag de compatibilidade.');
    } finally {
      setUpdatingFlag(false);
    }
  };

  const handleToggleRestaurantFlag = async (restId: string, currentVal: boolean) => {
    if (!config || !restId) return;
    setUpdatingFlag(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const nextVal = !currentVal;

    try {
      const operator = {
        uid: user?.uid || profile?.uid || 'admin',
        email: user?.email || profile?.email || 'admin@sistema',
        role: profile?.role,
        accountType: profile?.accountType
      };

      const updated = await legacyAuditService.updateCompatibilityConfig(
        operator, 
        config.legacyUserCompatibilityEnabled,
        { restaurantId: restId, enabled: nextVal }
      );
      setConfig(updated);
      setSuccessMessage(`Compatibilidade legada para o restaurante ${restId} alterada para: ${nextVal ? 'Ativada' : 'Desativada (Modo Estreito/Canônico)'}.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao alterar a flag por restaurante.');
    } finally {
      setUpdatingFlag(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm mb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-100">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-stone-900">Auditoria & Desativação da Compatibilidade Legada</h2>
          </div>
          <p className="text-sm text-stone-500 mt-1">
            Validação de usuários e gerenciamento seguro da flag <code className="bg-stone-100 text-stone-800 px-1.5 py-0.5 rounded text-xs font-mono">legacyUserCompatibilityEnabled</code>.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-semibold rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Executar Auditoria
        </button>
      </div>

      {/* Error/Success alerts */}
      {errorMessage && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="font-medium">{errorMessage}</div>
        </div>
      )}

      {successMessage && (
        <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 text-sm">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="font-medium">{successMessage}</div>
        </div>
      )}

      {/* System Status Banner */}
      {config && (
        <div className="mt-6 p-5 rounded-xl border bg-stone-50 border-stone-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase font-bold tracking-wider text-stone-500">
              Flag de Compatibilidade Legada Global
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                config.legacyUserCompatibilityEnabled 
                  ? 'bg-amber-100 text-amber-800' 
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {config.legacyUserCompatibilityEnabled ? 'LIGADO (Fallback Legado Ativo)' : 'DESLIGADO (Modelo 100% Canônico)'}
              </span>
              <span className="text-xs text-stone-400">
                Última alteração: {new Date(config.updatedAt).toLocaleString('pt-BR')} por {config.updatedBy}
              </span>
            </div>
          </div>

          <button
            onClick={handleToggleGlobalFlag}
            disabled={updatingFlag || (report ? !report.systemAptoForDisableLegacy && config.legacyUserCompatibilityEnabled : false)}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 shadow-sm ${
              config.legacyUserCompatibilityEnabled
                ? report?.systemAptoForDisableLegacy
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-stone-300 text-stone-500 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
            title={
              !report?.systemAptoForDisableLegacy && config.legacyUserCompatibilityEnabled
                ? 'Bloqueado: Existem erros críticos na auditoria.'
                : ''
            }
          >
            {config.legacyUserCompatibilityEnabled ? (
              <>
                <ToggleRight className="w-5 h-5" />
                Desativar Compatibilidade Legada
              </>
            ) : (
              <>
                <ToggleLeft className="w-5 h-5" />
                Reativar Compatibilidade Legada (Fallback)
              </>
            )}
          </button>
        </div>
      )}

      {/* Audit Report Summary Cards */}
      {report && (
        <div className="mt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200">
              <div className="text-xs font-semibold text-stone-500">Total Analisado</div>
              <div className="text-2xl font-bold text-stone-900 mt-1">{report.totalAnalyzed}</div>
            </div>

            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              <div className="text-xs font-semibold text-emerald-700">Canônicos Válidos</div>
              <div className="text-2xl font-bold text-emerald-900 mt-1">{report.totalValid}</div>
            </div>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <div className="text-xs font-semibold text-amber-700">Avisos</div>
              <div className="text-2xl font-bold text-amber-900 mt-1">{report.warnings.length}</div>
            </div>

            <div className="p-4 bg-red-50 rounded-xl border border-red-200">
              <div className="text-xs font-semibold text-red-700">Erros Críticos</div>
              <div className="text-2xl font-bold text-red-900 mt-1">{report.criticalErrors.length}</div>
            </div>

            <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
              <div className="text-xs font-semibold text-purple-700">Conflitos</div>
              <div className="text-2xl font-bold text-purple-900 mt-1">{report.conflicts.length}</div>
            </div>

            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="text-xs font-semibold text-blue-700">Apto p/ Desativar</div>
              <div className={`text-lg font-extrabold mt-1 ${report.systemAptoForDisableLegacy ? 'text-emerald-700' : 'text-red-700'}`}>
                {report.systemAptoForDisableLegacy ? 'SIM (Aprovado)' : 'NÃO (Bloqueado)'}
              </div>
            </div>
          </div>

          {/* Controlled Test Mode Section */}
          <div className="mt-8 p-5 bg-stone-50 rounded-2xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-600" />
              Modo de Teste Controlado por Restaurante
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Permite simular o comportamento com a compatibilidade legada desativada para restaurantes específicos sem afetar todos.
            </p>

            <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <select
                value={selectedRestaurantId}
                onChange={e => setSelectedRestaurantId(e.target.value)}
                className="px-3 py-2 bg-white border border-stone-300 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="">Selecione um restaurante para testar...</option>
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name || r.nome || r.id} ({r.id})
                  </option>
                ))}
              </select>

              {selectedRestaurantId && config && (
                <div className="flex items-center gap-3">
                  {(() => {
                    const currentOverride = config.legacyUserCompatibilityByRestaurant[selectedRestaurantId];
                    const isEffectiveEnabled = currentOverride !== undefined ? currentOverride : config.legacyUserCompatibilityEnabled;
                    return (
                      <button
                        onClick={() => handleToggleRestaurantFlag(selectedRestaurantId, isEffectiveEnabled)}
                        disabled={updatingFlag}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          isEffectiveEnabled
                            ? 'bg-amber-600 text-white hover:bg-amber-700'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                      >
                        {isEffectiveEnabled ? 'Desativar Legado (Apenas este restaurante)' : 'Ativar Legado (Apenas este restaurante)'}
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* Detailed Lists */}
          <div className="mt-8 space-y-6">
            {/* Critical Errors */}
            {report.criticalErrors.length > 0 && (
              <div className="p-4 bg-red-50/50 border border-red-200 rounded-xl">
                <h4 className="text-sm font-bold text-red-900 flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  Erros Críticos ({report.criticalErrors.length}) — Impedem a desativação da compatibilidade
                </h4>
                <ul className="space-y-1 text-xs text-red-800 max-h-48 overflow-y-auto pl-2">
                  {report.criticalErrors.map((err, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="font-bold">•</span>
                      <span>{err}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Conflicts */}
            {report.conflicts.length > 0 && (
              <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-xl">
                <h4 className="text-sm font-bold text-purple-900 flex items-center gap-1.5 mb-2">
                  <AlertCircle className="w-4 h-4 text-purple-600" />
                  Conflitos de Duplicidade / Múltiplos Vínculos ({report.conflicts.length})
                </h4>
                <ul className="space-y-1 text-xs text-purple-800 max-h-48 overflow-y-auto pl-2">
                  {report.conflicts.map((conf, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="font-bold">•</span>
                      <span>{conf}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {report.warnings.length > 0 && (
              <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl">
                <h4 className="text-sm font-bold text-amber-900 flex items-center gap-1.5 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Avisos de Integridade ({report.warnings.length})
                </h4>
                <ul className="space-y-1 text-xs text-amber-800 max-h-48 overflow-y-auto pl-2">
                  {report.warnings.map((warn, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="font-bold">•</span>
                      <span>{warn}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl">
                <h4 className="text-sm font-bold text-blue-900 flex items-center gap-1.5 mb-2">
                  <CheckCircle className="w-4 h-4 text-blue-600" />
                  Recomendações da Auditoria
                </h4>
                <ul className="space-y-1 text-xs text-blue-800 pl-2">
                  {report.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-blue-600 mt-0.5" />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
