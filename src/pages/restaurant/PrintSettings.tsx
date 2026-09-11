import React, { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Printer, 
  Save, 
  Loader2, 
  AlertCircle, 
  Check, 
  RefreshCw, 
  Download, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  Laptop, 
  Smartphone,
  Info,
  Layers
} from 'lucide-react';
import * as qzTrayModule from 'qz-tray';

// Interop seguro para ambientes ESM/Vite
const qz = (qzTrayModule as any).default || qzTrayModule;

export default function PrintSettings() {
  const { profile } = useAuth();
  
  // Estados do QZ Tray e Impressoras
  const [qzStatus, setQzStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [qzVersion, setQzVersion] = useState<string | null>(null);
  const [printers, setPrinters] = useState<string[]>([]);
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [qzError, setQzError] = useState<string | null>(null);
  const hasAttemptedMount = useRef(false);

  // Estados de Configuração de Bobina (mantidos do sistema existente)
  const [paperSize, setPaperSize] = useState<'48mm' | '72mm' | '112mm'>('72mm');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  /**
   * Conecta ao QZ Tray e lista as impressoras instaladas
   */
  const connectAndFetchPrinters = useCallback(async (isUserInitiated = false) => {
    if (isUserInitiated) {
      setIsRefreshing(true);
    } else {
      setQzStatus('checking');
    }
    setQzError(null);

    try {
      // 1. Verificar se já está ativo ou conectar
      const isActive = typeof qz.websocket?.isActive === 'function' && qz.websocket.isActive();
      if (!isActive) {
        await qz.websocket.connect({
          retries: 0,
          delay: 0,
        });
      }

      // 2. Se conectado, obter a versão
      if (qz.version) {
        setQzVersion(qz.version);
      }

      // 3. Buscar TODAS as impressoras instaladas via API oficial QZ Tray
      const printersResult = await qz.printers.find();
      let printerList: string[] = [];
      if (Array.isArray(printersResult)) {
        printerList = printersResult;
      } else if (typeof printersResult === 'string' && printersResult.trim()) {
        printerList = [printersResult];
      }

      // 4. Obter impressora padrão do sistema (se suportado)
      try {
        const def = await qz.printers.getDefault();
        if (def && typeof def === 'string') {
          setDefaultPrinter(def);
        }
      } catch {
        // Obtenção da impressora padrão é opcional
      }

      setPrinters(printerList);
      setQzStatus('connected');
    } catch (err: any) {
      console.warn('[Central de Impressão] Não foi possível conectar ao QZ Tray:', err);
      setQzStatus('disconnected');
      setPrinters([]);
      setDefaultPrinter(null);
      
      const errMsg = err?.message || '';
      if (errMsg.includes('WebSocket not supported')) {
        setQzError('Seu navegador não suporta WebSockets locais.');
      } else if (errMsg.includes('Connection refused') || errMsg.includes('Unable to establish') || errMsg.includes('Closed without status code')) {
        setQzError('O aplicativo QZ Tray não está em execução neste computador.');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Detecção automática na montagem do componente
  useEffect(() => {
    if (!hasAttemptedMount.current) {
      hasAttemptedMount.current = true;
      connectAndFetchPrinters(false);
    }

    // Configurar callbacks de encerramento do websocket do QZ Tray
    if (qz.websocket && typeof qz.websocket.setClosedCallbacks === 'function') {
      qz.websocket.setClosedCallbacks(() => {
        setQzStatus('disconnected');
      });
    }

    if (qz.websocket && typeof qz.websocket.setErrorCallbacks === 'function') {
      qz.websocket.setErrorCallbacks((err: any) => {
        console.warn('[QZ Tray WebSocket Error]', err);
      });
    }
  }, [connectAndFetchPrinters]);

  // Carregar tamanho da bobina existente do Firestore
  useEffect(() => {
    const fetchSettings = async () => {
      if (!profile?.restaurantId) return;
      setLoadingConfig(true);
      try {
        const docRef = doc(db, 'restaurants', profile.restaurantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPaperSize(data.defaultPaperSize || '72mm');
        }
      } catch (error) {
        console.error('Erro ao carregar configurações de papel:', error);
      } finally {
        setLoadingConfig(false);
      }
    };
    fetchSettings();
  }, [profile?.restaurantId]);

  // Salvar tamanho da bobina no Firestore
  const handleSavePaperSize = async () => {
    if (!profile?.restaurantId) return;
    setSavingConfig(true);
    setStatusMessage(null);
    try {
      const docRef = doc(db, 'restaurants', profile.restaurantId);
      await updateDoc(docRef, { defaultPaperSize: paperSize });
      setStatusMessage({ type: 'success', message: 'Configurações de papel salvas com sucesso!' });
    } catch (error) {
      console.error('Erro ao salvar configuração de papel:', error);
      setStatusMessage({ type: 'error', message: 'Erro ao salvar as configurações de papel.' });
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6 w-full font-sans">
      {/* Cabeçalho da Central de Impressão */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100 shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-stone-800">Central de Impressão</h2>
              <p className="text-stone-500 text-xs sm:text-sm">
                Comunicação direta com impressoras físicas instaladas via QZ Tray.
              </p>
            </div>
          </div>
        </div>

        {/* Badge de Status e Botão de Ação Rápida */}
        <div className="flex items-center flex-wrap gap-2.5">
          {qzStatus === 'checking' && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm font-bold animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
              <span>Detectando QZ Tray...</span>
            </div>
          )}

          {qzStatus === 'connected' && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold shadow-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>🟢 Conectado</span>
              {qzVersion && <span className="text-[11px] font-medium text-emerald-600">v{qzVersion}</span>}
            </div>
          )}

          {qzStatus === 'disconnected' && (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm font-bold shadow-xs">
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              <span>🔴 Não conectado</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => connectAndFetchPrinters(true)}
            disabled={isRefreshing || qzStatus === 'checking'}
            className="min-h-[44px] px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            title="Sincronizar e atualizar lista de impressoras detectadas"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Atualizar impressoras</span>
          </button>
        </div>
      </div>

      {/* Feedback de status de configuração de papel */}
      {statusMessage && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 border text-sm font-semibold transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{statusMessage.message}</span>
        </div>
      )}

      {/* Bloco 1: Quando Conectado -> Lista de Impressoras Oficiais Detectadas */}
      {qzStatus === 'connected' && (
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-4">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-stone-800 flex items-center gap-2">
                <span>Impressoras Detectadas no Computador</span>
                <span className="text-xs bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-extrabold">
                  {printers.length} {printers.length === 1 ? 'impressora' : 'impressoras'}
                </span>
              </h3>
              <p className="text-stone-500 text-xs sm:text-sm mt-0.5">
                Nomes reais retornados pelo QZ Tray instalado localmente no seu sistema operacional.
              </p>
            </div>
          </div>

          {printers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {printers.map((printerName, index) => {
                const isDefault = defaultPrinter && defaultPrinter.toLowerCase() === printerName.toLowerCase();

                return (
                  <div
                    key={`${printerName}-${index}`}
                    className="p-4 rounded-2xl border border-stone-200 bg-stone-50/70 hover:bg-stone-50 hover:border-stone-300 transition-all flex items-center justify-between gap-3 min-w-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-white border border-stone-200 text-emerald-600 flex items-center justify-center shrink-0 shadow-2xs">
                        <Printer className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-stone-800 truncate" title={printerName}>
                          {printerName}
                        </p>
                        <p className="text-xs text-stone-500 font-medium">Dispositivo de Impressão</p>
                      </div>
                    </div>

                    {isDefault && (
                      <span className="shrink-0 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-lg whitespace-nowrap">
                        Padrão do Sistema
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 space-y-2">
              <Printer className="w-8 h-8 text-stone-400 mx-auto" />
              <p className="text-sm font-bold text-stone-700">Nenhuma impressora encontrada no sistema</p>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                O QZ Tray está conectado, mas não detectou impressoras configuradas no Painel de Controle do computador. Verifique se os drivers estão instalados.
              </p>
            </div>
          )}

          <div className="p-3.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Comunicação Ativa:</span> Seu terminal está conectado com sucesso ao QZ Tray. Esta listagem reflete exatamente as impressoras disponíveis no seu computador.
            </div>
          </div>
        </div>
      )}

      {/* Bloco 2: Quando NÃO Conectado -> Instruções de Instalação e Download do QZ Tray */}
      {qzStatus === 'disconnected' && (
        <div className="space-y-6">
          {/* Card de Aviso e Botão de Download */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-rose-200/80 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 mt-0.5">
                  <XCircle className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-bold text-stone-800">
                    QZ Tray Não Detectado neste Computador
                  </h3>
                  <p className="text-stone-600 text-xs sm:text-sm max-w-2xl leading-relaxed">
                    Para se comunicar diretamente com as impressoras térmicas (EPSON, Elgin, Bematech, Daruma, etc.) sem caixas de diálogo do navegador, o QZ Tray precisa estar instalado e em execução no seu computador.
                  </p>
                  {qzError && (
                    <p className="text-xs text-rose-600 font-semibold mt-1">
                      Detalhe: {qzError}
                    </p>
                  )}
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <a
                  href="https://qz.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-2xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2 text-center"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar QZ Tray Oficial</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>

                <button
                  type="button"
                  onClick={() => connectAndFetchPrinters(true)}
                  disabled={isRefreshing}
                  className="min-h-[44px] px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs sm:text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Verificar Novamente</span>
                </button>
              </div>
            </div>
          </div>

          {/* Instruções Simples de Instalação no Windows */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
            <div className="flex items-center gap-2.5 border-b border-stone-100 pb-4">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-base font-bold text-stone-800">
                  Instruções Simples de Instalação no Windows
                </h4>
                <p className="text-stone-500 text-xs">
                  Siga os 5 passos rápidos para habilitar suas impressoras no QFomeAI:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
              {/* Passo 1 */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">
                  1
                </div>
                <p className="text-xs font-bold text-stone-800">Baixe o Instalador</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Clique no botão verde acima ou acesse{' '}
                  <span className="font-semibold text-stone-700">qz.io/download</span> e baixe a versão para Windows.
                </p>
              </div>

              {/* Passo 2 */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">
                  2
                </div>
                <p className="text-xs font-bold text-stone-800">Execute o Instalador</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Abra o arquivo baixado (<span className="font-semibold text-stone-700">.exe</span>) e conclua a instalação com as opções padrão.
                </p>
              </div>

              {/* Passo 3 */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">
                  3
                </div>
                <p className="text-xs font-bold text-stone-800">Abra o QZ Tray</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Inicie o QZ Tray pelo menu Iniciar. Ele ficará minimizado com um ícone verde ao lado do relógio do Windows.
                </p>
              </div>

              {/* Passo 4 */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">
                  4
                </div>
                <p className="text-xs font-bold text-stone-800">Permita o Acesso</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Quando o navegador exibir o pop-up de segurança do QZ Tray, clique em{' '}
                  <span className="font-semibold text-emerald-700">"Permitir"</span> (Allow) e marque para lembrar.
                </p>
              </div>

              {/* Passo 5 */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center">
                  5
                </div>
                <p className="text-xs font-bold text-stone-800">Atualizar</p>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Volte a esta página e clique em{' '}
                  <span className="font-semibold text-stone-800">"Atualizar impressoras"</span> para carregar sua lista de dispositivos.
                </p>
              </div>
            </div>

            {/* Nota para Acessos Mobile */}
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
              <Smartphone className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Acessando pelo celular ou tablet?</span> O QZ Tray é instalado no computador/caixa física onde as impressoras térmicas estão ligadas por USB ou rede local. Em dispositivos móveis, o status indicará que o serviço desktop não está nesta máquina.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bloco 3: Configuração de Tamanho de Papel (Preservada do sistema existente) */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200 shadow-sm space-y-5">
        <div className="flex items-center gap-2.5 border-b border-stone-100 pb-3">
          <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-stone-800">Tamanho da Bobina Padrão</h3>
            <p className="text-stone-500 text-xs">
              Selecione a largura de papel térmico padrão configurada para o seu estabelecimento.
            </p>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['48mm', '72mm', '112mm'] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setPaperSize(size)}
                className={`min-h-[52px] p-4 rounded-2xl border-2 font-bold transition-all text-sm flex items-center justify-between cursor-pointer ${
                  paperSize === size
                    ? 'border-emerald-500 bg-emerald-50/80 text-emerald-800 shadow-xs'
                    : 'border-stone-200 hover:border-stone-300 text-stone-600 bg-white'
                }`}
              >
                <span>Bobina {size}</span>
                {paperSize === size && <Check className="w-4 h-4 text-emerald-600" />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSavePaperSize}
            disabled={savingConfig || loadingConfig}
            className="w-full sm:w-auto min-h-[44px] px-7 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-md shadow-emerald-200 flex items-center justify-center gap-2 cursor-pointer"
          >
            {savingConfig ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Salvar Tamanho de Papel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
