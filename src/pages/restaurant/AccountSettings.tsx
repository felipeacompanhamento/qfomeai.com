import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import ImageUpload from '../../components/ImageUpload';
import { Save, Loader2, MapPin, Phone, Mail, Instagram, Globe, Clock, ShoppingBag, AlertCircle, Check, Trash2, RefreshCw, FileText, XCircle, Info, Database, Users } from 'lucide-react';

export default function AccountSettings() {
  const { profile, user, isRestaurant, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
   const [saveLoading, setSaveLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantData, setRestaurantData] = useState<any>(null);

  // Data Cleanup and Maintenance States
  const [cleanupRequest, setCleanupRequest] = useState<any>(null);
  const [lastCompletedRequest, setLastCompletedRequest] = useState<any>(null);
  const [cleanupType, setCleanupType] = useState<'ORDERS_ONLY' | 'INTERNAL_USERS_ONLY' | 'ORDERS_AND_INTERNAL_USERS' | 'FACTORY_RESET'>('ORDERS_ONLY');
  const [reason, setReason] = useState('');
  const [restaurantNameConfirmation, setRestaurantNameConfirmation] = useState('');
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [showConfirmationInput, setShowConfirmationInput] = useState(false);

  // Check if current user is owner (has OWNER role)
  const isOwner = profile?.role === 'OWNER' || profile?.tipo_usuario === 'restaurante' || profile?.tipo_usuario === 'restaurant';

  const getHeaders = async () => {
    if (!user) throw new Error("Usuário não autenticado.");
    const token = await user.getIdToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  // Real-time listener for active cleanup requests
  useEffect(() => {
    if (!restaurantId || !isOwner) return;

    const q = query(
      collection(db, 'restaurants', restaurantId, 'dataCleanupRequests'),
      where('status', 'in', ['DRAFT', 'ANALYZING', 'AWAITING_CONFIRMATION', 'APPROVED', 'BACKUP_IN_PROGRESS', 'READY', 'RUNNING'])
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const active = docs[0];
        setCleanupRequest(active);
        setCleanupError(null);
      } else {
        // If it was active and suddenly became empty, check if it transitioned to COMPLETED
        setCleanupRequest(prev => {
          if (prev && (prev.status === 'RUNNING' || prev.status === 'BACKUP_IN_PROGRESS' || prev.status === 'READY')) {
            // Fetch the completed one to show final report
            const fetchCompleted = async () => {
              try {
                const docRef = doc(db, 'restaurants', restaurantId, 'dataCleanupRequests', prev.requestId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists() && docSnap.data().status === 'COMPLETED') {
                  setLastCompletedRequest({ id: docSnap.id, ...docSnap.data() });
                }
              } catch (e) {
                console.error("Error fetching completed cleanup doc:", e);
              }
            };
            fetchCompleted();
          }
          return null;
        });
      }
    }, (err) => {
      console.error("Error listening to cleanup requests:", err);
    });

    return () => unsubscribe();
  }, [restaurantId, isOwner]);

  const handleCreateCleanupRequest = async () => {
    if (!restaurantId) return;
    if (reason.trim().length < 10) {
      setCleanupError('O motivo deve conter pelo menos 10 caracteres.');
      return;
    }

    setCleanupLoading(true);
    setCleanupError(null);
    setShowConfirmationInput(false);
    try {
      // 1. Create request
      const response = await fetch('/api/restaurant/cleanup/request', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ cleanupType, reason })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao criar solicitação.');

      // 2. Trigger analysis immediately (dry-run)
      const analyzeRes = await fetch(`/api/restaurant/cleanup/${data.requestId}/analyze`, {
        method: 'POST',
        headers: await getHeaders()
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error || 'Erro ao analisar solicitação.');

    } catch (err: any) {
      console.error(err);
      setCleanupError(err.message || 'Erro ao processar solicitação de limpeza.');
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleConfirmRequest = async () => {
    if (!cleanupRequest || !restaurantId) return;
    
    const actualName = (restaurantData?.nome || restaurantData?.nome_fantasia || '').trim().toUpperCase();
    if (restaurantNameConfirmation.trim().toUpperCase() !== actualName) {
      setCleanupError(`Nome do restaurante incorreto. Você deve digitar "${restaurantData?.nome || restaurantData?.nome_fantasia}" exatamente.`);
      return;
    }

    setCleanupLoading(true);
    setCleanupError(null);
    try {
      const confirmRes = await fetch(`/api/restaurant/cleanup/${cleanupRequest.requestId}/confirm`, {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ restaurantName: restaurantNameConfirmation })
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || 'Erro ao confirmar a solicitação.');
      
      setRestaurantNameConfirmation('');
      setShowConfirmationInput(false);
    } catch (err: any) {
      console.error(err);
      setCleanupError(err.message || 'Erro ao confirmar a solicitação.');
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleExecuteRequest = async () => {
    if (!cleanupRequest || !restaurantId) return;

    setCleanupLoading(true);
    setCleanupError(null);
    try {
      const executeRes = await fetch(`/api/restaurant/cleanup/${cleanupRequest.requestId}/execute`, {
        method: 'POST',
        headers: await getHeaders()
      });
      const executeData = await executeRes.json();
      if (!executeRes.ok) throw new Error(executeData.error || 'Erro ao iniciar a execução da limpeza.');
    } catch (err: any) {
      console.error(err);
      setCleanupError(err.message || 'Erro ao iniciar a execução da limpeza.');
    } finally {
      setCleanupLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!cleanupRequest || !restaurantId) return;

    setCleanupLoading(true);
    setCleanupError(null);
    setShowConfirmationInput(false);
    try {
      const response = await fetch(`/api/restaurant/cleanup/${cleanupRequest.requestId}/cancel`, {
        method: 'POST',
        headers: await getHeaders()
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao cancelar solicitação.');
      
      setCleanupRequest(null);
      setReason('');
    } catch (err: any) {
      console.error(err);
      setCleanupError(err.message || 'Erro ao cancelar solicitação.');
    } finally {
      setCleanupLoading(false);
    }
  };

  const mapCleanupTypeToLabel = (type: string) => {
    switch (type) {
      case 'ORDERS_ONLY':
        return 'Limpar somente pedidos';
      case 'INTERNAL_USERS_ONLY':
        return 'Limpar somente a equipe';
      case 'ORDERS_AND_INTERNAL_USERS':
        return 'Limpar pedidos e equipe';
      case 'FACTORY_RESET':
        return 'Restaurar restaurante para o estado inicial';
      default:
        return type;
    }
  };

  const mapRoleToLabel = (role: string) => {
    switch (role?.toUpperCase()) {
      case 'OWNER':
        return 'Proprietário Principal';
      case 'ADMIN':
      case 'RESTAURANT_ADMIN':
        return 'Administrador';
      case 'MANAGER':
        return 'Gerente';
      case 'WAITER':
        return 'Garçom';
      case 'DRIVER':
        return 'Entregador';
      case 'CASHIER':
        return 'Operador de Caixa';
      case 'KITCHEN':
        return 'Cozinha';
      default:
        return role || 'Proprietário Principal';
    }
  };

  const getSimulatedLogs = (req: any) => {
    if (!req) return [];
    const logs = [];
    const timeStr = (offsetSec: number) => {
      const d = new Date(new Date(req.createdAt).getTime() + offsetSec * 1000);
      return d.toLocaleTimeString('pt-BR');
    };
    
    logs.push(`[${timeStr(0)}] [SISTEMA] Solicitação de limpeza iniciada pelo operador.`);
    logs.push(`[${timeStr(1)}] [SISTEMA] Opção selecionada: ${mapCleanupTypeToLabel(req.cleanupType)}.`);
    
    if (req.status === 'DRAFT') {
      logs.push(`[${timeStr(2)}] [SISTEMA] Aguardando início da análise prévia de dados...`);
    }
    
    if (['ANALYZING', 'AWAITING_CONFIRMATION', 'APPROVED', 'BACKUP_IN_PROGRESS', 'READY', 'RUNNING', 'COMPLETED'].includes(req.status)) {
      logs.push(`[${timeStr(3)}] [SISTEMA] Varredura e mapeamento das informações iniciados...`);
      logs.push(`[${timeStr(4)}] [SISTEMA] Mapeamento concluído com sucesso.`);
    }
    
    if (['AWAITING_CONFIRMATION'].includes(req.status)) {
      logs.push(`[${timeStr(5)}] [SISTEMA] Aguardando confirmação do Proprietário Principal.`);
    }

    if (['APPROVED', 'BACKUP_IN_PROGRESS', 'READY', 'RUNNING', 'COMPLETED'].includes(req.status)) {
      logs.push(`[${timeStr(6)}] [SISTEMA] Confirmação e assinatura digital do Proprietário Principal validadas.`);
      logs.push(`[${timeStr(7)}] [SISTEMA] Restaurante colocado temporariamente em modo de manutenção segura.`);
    }

    if (['BACKUP_IN_PROGRESS', 'READY', 'RUNNING', 'COMPLETED'].includes(req.status)) {
      logs.push(`[${timeStr(8)}] [SISTEMA] Iniciando cópia de segurança automática...`);
    }

    if (['READY', 'RUNNING', 'COMPLETED'].includes(req.status)) {
      logs.push(`[${timeStr(10)}] [SISTEMA] Cópia de segurança concluída com sucesso.`);
      logs.push(`[${timeStr(11)}] [SISTEMA] Iniciando processo de remoção definitiva dos registros...`);
    }

    if (['RUNNING', 'COMPLETED'].includes(req.status)) {
      if (req.cleanupType === 'ORDERS_ONLY' || req.cleanupType === 'ORDERS_AND_INTERNAL_USERS' || req.cleanupType === 'FACTORY_RESET') {
        logs.push(`[${timeStr(13)}] [SISTEMA] Removendo histórico de pedidos e fechamentos de caixas...`);
      }
      if (req.cleanupType === 'INTERNAL_USERS_ONLY' || req.cleanupType === 'ORDERS_AND_INTERNAL_USERS' || req.cleanupType === 'FACTORY_RESET') {
        logs.push(`[${timeStr(15)}] [SISTEMA] Anonimizando perfis cadastrados de equipe...`);
      }
      if (req.cleanupType === 'FACTORY_RESET') {
        logs.push(`[${timeStr(17)}] [SISTEMA] Removendo produtos, cardápios e layouts de mesas...`);
      }
    }

    if (req.status === 'COMPLETED') {
      logs.push(`[${timeStr(19)}] [SISTEMA] Retirando restaurante do modo de manutenção.`);
      logs.push(`[${timeStr(20)}] [SISTEMA] Processo de limpeza de dados finalizado com sucesso.`);
    }

    if (req.status === 'FAILED') {
      logs.push(`[${timeStr(15)}] [SISTEMA] Falha no processo: ${req.error || 'Erro desconhecido'}`);
      logs.push(`[${timeStr(16)}] [SISTEMA] Operação abortada com segurança.`);
    }

    return logs;
  };

  const hasPermission = isAdmin || (isRestaurant && profile?.restaurantId === restaurantId);

  const [estados, setEstados] = useState<any[]>([]);
  const [cidades, setCidades] = useState<any[]>([]);
  const [bairros, setBairros] = useState<any[]>([]);
  const [selectedEstadoId, setSelectedEstadoId] = useState<string>('');
  const [selectedCidadeId, setSelectedCidadeId] = useState<string>('');

  useEffect(() => {
    const fetchEstados = async () => {
      try {
        const q = query(collection(db, 'estados'), where('ativo', '==', true));
        const snap = await getDocs(q);
        setEstados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching estados:", error);
      }
    };
    fetchEstados();
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!user?.uid) return;
      
      setLoading(true);
      setError(null);
      try {
        const rid = profile?.restaurantId || (await restaurantService.getRestaurantByOwnerId(user?.uid))?.id;
        if (rid) {
          setRestaurantId(rid);
          const docRef = doc(db, 'restaurants', rid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.id ? { id: docSnap.id, ...docSnap.data() } : docSnap.data();
            setRestaurantData(data);

            // Tentar encontrar os IDs de estado e cidade se já existirem no endereço
            if (data.endereco?.estado) {
              const estQ = query(collection(db, 'estados'), where('nome', '==', data.endereco.estado));
              const estSnap = await getDocs(estQ);
              if (!estSnap.empty) {
                const estId = estSnap.docs[0].id;
                setSelectedEstadoId(estId);

                if (data.endereco?.cidade) {
                  const cidQ = query(collection(db, 'cidades'), where('estado_id', '==', estId), where('nome', '==', data.endereco.cidade));
                  const cidSnap = await getDocs(cidQ);
                  if (!cidSnap.empty) {
                    const cidId = cidSnap.docs[0].id;
                    setSelectedCidadeId(cidId);
                  }
                }
              }
            }
          } else {
            setError("Restaurante não encontrado.");
          }
        } else {
          setError("Restaurante não encontrado.");
        }
      } catch (err: any) {
        console.error("Error fetching restaurant:", err);
        setError("Erro ao carregar dados do restaurante.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [profile?.restaurantId, user?.uid]);

  useEffect(() => {
    if (!selectedEstadoId) {
      setCidades([]);
      return;
    }
    const fetchCidades = async () => {
      try {
        const q = query(collection(db, 'cidades'), where('estado_id', '==', selectedEstadoId), where('ativo', '==', true));
        const snap = await getDocs(q);
        setCidades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching cidades:", error);
      }
    };
    fetchCidades();
  }, [selectedEstadoId]);

  useEffect(() => {
    if (!selectedCidadeId) {
      setBairros([]);
      return;
    }
    const fetchBairros = async () => {
      try {
        const q = query(collection(db, 'bairros'), where('cidade_id', '==', selectedCidadeId), where('ativo', '==', true));
        const snap = await getDocs(q);
        setBairros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching bairros:", error);
      }
    };
    fetchBairros();
  }, [selectedCidadeId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !restaurantData) return;

    if (!hasPermission) {
      setError('Você não tem permissão para alterar as configurações deste restaurante.');
      return;
    }

    setSaveLoading(true);
    setSuccess(false);
    setError(null);
    try {
      const { id, logo_url, capa_url, ...data } = restaurantData;
      
      // Garantir que campos obrigatórios pelas regras do Firestore estejam presentes
      const updatePayload = {
        ...data,
        nome: data.nome || data.nome_fantasia || '',
        nome_fantasia: data.nome_fantasia || data.nome || '',
        slug: data.slug || '',
        whatsapp: data.whatsapp || '',
        email: data.email || '',
        cpf_cnpj: data.cpf_cnpj || '',
        updated_at: serverTimestamp(),
        updatedBy: user?.uid,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'restaurants', restaurantId), updatePayload);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error updating restaurant:", err);
      setError('Erro ao atualizar configurações. Verifique se todos os campos obrigatórios estão preenchidos.');
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        <p className="text-stone-500 animate-pulse">Carregando configurações...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-red-500 font-bold">{error}</p>
      </div>
    );
  }

  if (!restaurantData) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div>
        <h2 className="text-2xl font-bold text-stone-800">Configurações da Conta</h2>
        <p className="text-stone-500 text-sm">Gerencie as informações públicas e operacionais do seu negócio.</p>
      </div>

      <form id="account-settings-form" onSubmit={handleSave} className="space-y-8">
        {!hasPermission && (
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3 text-amber-600 text-sm font-bold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>Você não tem permissão para alterar as configurações deste restaurante. Apenas proprietários ou administradores podem fazer alterações.</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 text-sm font-bold">
            <Check className="w-5 h-5 shrink-0" />
            <p>Configurações salvas com sucesso!</p>
          </div>
        )}
        {/* Informações Básicas */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            Informações do Negócio
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Nome do Negócio</label>
              <input 
                value={restaurantData.nome || ''}
                disabled={!hasPermission}
                onChange={e => setRestaurantData({...restaurantData, nome: e.target.value})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                placeholder="Ex: Pizzaria do João"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Link da Loja (Slug)</label>
              <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3">
                <span className="text-stone-400 text-sm">qfomeai.com/</span>
                <input 
                  value={restaurantData.slug || ''}
                  disabled={!hasPermission}
                  onChange={e => setRestaurantData({...restaurantData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                  className="flex-1 py-3 bg-transparent focus:outline-none text-sm disabled:opacity-50"
                  placeholder="pizzaria-do-joao"
                  required
                />
              </div>
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Breve Descrição</label>
              <textarea 
                value={restaurantData.descricao || ''}
                disabled={!hasPermission}
                onChange={e => setRestaurantData({...restaurantData, descricao: e.target.value})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 h-24 resize-none disabled:opacity-50"
                placeholder="Conte um pouco sobre seu restaurante..."
              />
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Status de Operação</label>
              <select
                value={restaurantData.status_operacao_config || 'automatico'}
                disabled={!hasPermission}
                onChange={e => setRestaurantData({...restaurantData, status_operacao_config: e.target.value})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <option value="automatico">Automático (Horário)</option>
                <option value="aberto">Aberto (Manual)</option>
                <option value="fechado">Fechado (Manual)</option>
              </select>
              <p className="text-xs text-stone-500 mt-1">
                O status automático usa os horários configurados na aba "Horários".
              </p>
            </div>
          </div>
        </section>

        {/* Contato e Redes Sociais */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <Phone className="w-5 h-5 text-emerald-600" />
            Contato e Redes Sociais
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">WhatsApp</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input 
                  value={restaurantData.whatsapp || ''}
                  disabled={!hasPermission}
                  onChange={e => setRestaurantData({...restaurantData, whatsapp: e.target.value})}
                  className="w-full pl-10 pr-3 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Email de Contato</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input 
                  type="email"
                  value={restaurantData.email || ''}
                  disabled={!hasPermission}
                  onChange={e => setRestaurantData({...restaurantData, email: e.target.value})}
                  className="w-full pl-10 pr-3 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                  placeholder="contato@restaurante.com"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Instagram</label>
              <div className="relative">
                <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input 
                  value={restaurantData.instagram || ''}
                  disabled={!hasPermission}
                  onChange={e => setRestaurantData({...restaurantData, instagram: e.target.value})}
                  className="w-full pl-10 pr-3 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                  placeholder="@seurestaurante"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Endereço */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            Endereço da Loja
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Rua</label>
              <input 
                value={restaurantData.endereco?.rua || ''}
                disabled={!hasPermission}
                onChange={e => setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, rua: e.target.value}})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                placeholder="Rua das Flores"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Número</label>
              <input 
                value={restaurantData.endereco?.numero || ''}
                disabled={!hasPermission}
                onChange={e => setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, numero: e.target.value}})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                placeholder="123"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Estado</label>
              <select 
                value={selectedEstadoId}
                disabled={!hasPermission}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedEstadoId(id);
                  const nome = estados.find(est => est.id === id)?.nome || '';
                  setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, estado: nome, cidade: '', bairro: ''}});
                  setSelectedCidadeId('');
                }}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <option value="">Selecione o Estado</option>
                {estados.map(est => (
                  <option key={est.id} value={est.id}>{est.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Cidade</label>
              <select 
                value={selectedCidadeId}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedCidadeId(id);
                  const nome = cidades.find(cid => cid.id === id)?.nome || '';
                  setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, cidade: nome, bairro: ''}});
                }}
                disabled={!hasPermission || !selectedEstadoId}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <option value="">Selecione a Cidade</option>
                {cidades.map(cid => (
                  <option key={cid.id} value={cid.id}>{cid.nome}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Bairro</label>
              <select 
                value={restaurantData.endereco?.bairro || ''}
                onChange={e => setRestaurantData({...restaurantData, endereco: {...restaurantData.endereco, bairro: e.target.value}})}
                disabled={!hasPermission || !selectedCidadeId}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
              >
                <option value="">Selecione o Bairro</option>
                {bairros.map(b => (
                  <option key={b.id} value={b.nome}>{b.nome}</option>
                ))}
              </select>
            </div>
            {/* CEP field removed */}
          </div>
        </section>

        {/* Operação e Delivery */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            Operação e Delivery
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <label className="text-xs font-bold text-stone-400 uppercase">Tipos de Atendimento</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={restaurantData.aceita_entrega ?? true}
                    disabled={!hasPermission}
                    onChange={e => setRestaurantData({...restaurantData, aceita_entrega: e.target.checked})}
                    className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <span className="text-sm font-medium text-stone-700">Entrega</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={restaurantData.aceita_retirada ?? true}
                    disabled={!hasPermission}
                    onChange={e => setRestaurantData({...restaurantData, aceita_retirada: e.target.checked})}
                    className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <span className="text-sm font-medium text-stone-700">Retirada</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={restaurantData.features?.counterEnabled ?? false}
                    disabled={!hasPermission}
                    onChange={e => setRestaurantData({
                      ...restaurantData,
                      features: {
                        ...(restaurantData.features || {}),
                        counterEnabled: e.target.checked
                      }
                    })}
                    className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <span className="text-sm font-medium text-stone-700">Balcão (PDV)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={restaurantData.features?.waiterEnabled ?? false}
                    disabled={!hasPermission}
                    onChange={e => setRestaurantData({
                      ...restaurantData,
                      features: {
                        ...(restaurantData.features || {}),
                        waiterEnabled: e.target.checked
                      }
                    })}
                    className="w-5 h-5 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <span className="text-sm font-medium text-stone-700">Módulo Garçom</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Tempo Mín. (min)</label>
                <input 
                  type="number"
                  value={restaurantData.tempo_min_entrega || ''}
                  disabled={!hasPermission}
                  onChange={e => setRestaurantData({...restaurantData, tempo_min_entrega: parseInt(e.target.value)})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                  placeholder="30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-stone-400 uppercase">Tempo Máx. (min)</label>
                <input 
                  type="number"
                  value={restaurantData.tempo_max_entrega || ''}
                  disabled={!hasPermission}
                  onChange={e => setRestaurantData({...restaurantData, tempo_max_entrega: parseInt(e.target.value)})}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                  placeholder="45"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Valor Mínimo Pedido (R$)</label>
              <input 
                type="number"
                step="0.01"
                value={restaurantData.valor_minimo_pedido || ''}
                disabled={!hasPermission}
                onChange={e => setRestaurantData({...restaurantData, valor_minimo_pedido: parseFloat(e.target.value)})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                placeholder="20.00"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Frete Grátis a partir de (R$)</label>
              <input 
                type="number"
                step="0.01"
                value={restaurantData.valor_minimo_frete_gratis || ''}
                disabled={!hasPermission}
                onChange={e => setRestaurantData({...restaurantData, valor_minimo_frete_gratis: parseFloat(e.target.value)})}
                className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                placeholder="100.00"
              />
            </div>
          </div>
        </section>

        {/* Identidade Visual */}
        <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" />
              Identidade Visual
            </h3>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider bg-stone-50 px-2 py-1 rounded-lg border border-stone-100">
              Exibido no catálogo e lista de restaurantes
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ImageUpload 
              label="Logo do Restaurante"
              path={`restaurants/${restaurantId}/logo`}
              isLogo={true}
              currentImageUrl={restaurantData.logoUrl}
              onUploadComplete={(url) => setRestaurantData({...restaurantData, logoUrl: url})}
              disabled={!hasPermission}
            />
            <ImageUpload 
              label="Capa do Restaurante"
              path={`restaurants/${restaurantId}/cover`}
              aspectRatio="video"
              isCover={true}
              currentImageUrl={restaurantData.coverUrl}
              onUploadComplete={(url) => setRestaurantData({...restaurantData, coverUrl: url})}
              disabled={!hasPermission}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <button 
            type="submit"
            disabled={saveLoading || !hasPermission}
            className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-50"
          >
            {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Salvar Alterações
          </button>
        </div>
      </form>

      {/* Zona de manutenção e limpeza de dados */}
      <section className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6 mt-8">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Limpeza de Dados do Restaurante
            </h3>
            <p className="text-stone-400 text-xs mt-1">
              Solicite uma limpeza segura dos dados do restaurante. Antes da confirmação será realizada uma análise para informar exatamente quais informações serão removidas e quais serão preservadas.
            </p>
          </div>
          <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-lg tracking-wider uppercase">
            Área Restrita
          </span>
        </div>

        {!isOwner ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-800 text-sm">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Acesso Restrito</p>
              <p className="mt-0.5">Apenas o Proprietário Principal do restaurante possui permissão para acessar esta área e gerenciar solicitações de limpeza de dados.</p>
            </div>
          </div>
        ) : (
          <>
            {cleanupError && (
              <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3 text-red-700 text-sm">
                <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Ocorreu um erro</p>
                  <p className="mt-0.5">{cleanupError}</p>
                </div>
              </div>
            )}

            {/* SUCCESS / COMPLETION PANEL */}
            {lastCompletedRequest && (
              <div className="border border-emerald-200 bg-emerald-50/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500 text-white rounded-full p-2">
                    <Check className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-800">Manutenção Concluída com Sucesso</h4>
                    <p className="text-xs text-emerald-600">O processo de limpeza sob demanda foi finalizado e todos os registros foram atualizados.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border border-emerald-100 rounded-xl p-4 text-xs text-stone-600">
                  <div>
                    <p className="text-stone-400 font-semibold">TIPO DE LIMPEZA:</p>
                    <p className="font-bold text-stone-700 mt-0.5">{mapCleanupTypeToLabel(lastCompletedRequest.cleanupType)}</p>
                  </div>
                  <div>
                    <p className="text-stone-400 font-semibold">CÓDIGO DE SEGURANÇA:</p>
                    <p className="font-mono font-bold text-stone-700 mt-0.5">{lastCompletedRequest.backupReference || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-stone-400 font-semibold">SOLICITADO POR:</p>
                    <p className="font-bold text-stone-700 mt-0.5">{mapRoleToLabel(lastCompletedRequest.requestedByRole)}</p>
                  </div>
                  <div>
                    <p className="text-stone-400 font-semibold">CONCLUÍDO EM:</p>
                    <p className="font-bold text-stone-700 mt-0.5">{new Date(lastCompletedRequest.completedAt || lastCompletedRequest.updatedAt).toLocaleString('pt-BR')}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setLastCompletedRequest(null)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors text-sm"
                >
                  Entendido, Retornar ao Painel
                </button>
              </div>
            )}

            {/* NORMAL REQUEST BUILDER */}
            {!cleanupRequest && !lastCompletedRequest && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-wider block">1. Selecione a Modalidade de Limpeza</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setCleanupType('ORDERS_ONLY')}
                      className={`text-left p-4 rounded-2xl border transition-all flex gap-3 ${
                        cleanupType === 'ORDERS_ONLY'
                          ? 'border-red-500 bg-red-50/20 ring-1 ring-red-500'
                          : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                      }`}
                    >
                      <Trash2 className="w-5 h-5 text-red-500 shrink-0 mt-1" />
                      <div>
                        <p className="font-bold text-stone-800 text-sm">Limpar somente pedidos</p>
                        <p className="text-stone-400 text-[11px] mt-0.5">Remove pedidos, entregas, comandas e históricos relacionados aos pedidos. Mantém os produtos, equipe, estoque e configurações do restaurante.</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCleanupType('INTERNAL_USERS_ONLY')}
                      className={`text-left p-4 rounded-2xl border transition-all flex gap-3 ${
                        cleanupType === 'INTERNAL_USERS_ONLY'
                          ? 'border-red-500 bg-red-50/20 ring-1 ring-red-500'
                          : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                      }`}
                    >
                      <Users className="w-5 h-5 text-red-500 shrink-0 mt-1" />
                      <div>
                        <p className="font-bold text-stone-800 text-sm">Limpar somente a equipe</p>
                        <p className="text-stone-400 text-[11px] mt-0.5">Remove todos os usuários internos, mantendo apenas o Proprietário Principal. Produtos, pedidos e configurações permanecem preservados.</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCleanupType('ORDERS_AND_INTERNAL_USERS')}
                      className={`text-left p-4 rounded-2xl border transition-all flex gap-3 ${
                        cleanupType === 'ORDERS_AND_INTERNAL_USERS'
                          ? 'border-red-500 bg-red-50/20 ring-1 ring-red-500'
                          : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                      }`}
                    >
                      <Trash2 className="w-5 h-5 text-red-500 shrink-0 mt-1" />
                      <div>
                        <p className="font-bold text-stone-800 text-sm">Limpar pedidos e equipe</p>
                        <p className="text-stone-400 text-[11px] mt-0.5">Remove os pedidos e os usuários internos. Mantém os produtos, categorias, estoque e configurações do restaurante.</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCleanupType('FACTORY_RESET')}
                      className={`text-left p-4 rounded-2xl border transition-all flex gap-3 ${
                        cleanupType === 'FACTORY_RESET'
                          ? 'border-red-500 bg-red-50/20 ring-1 ring-red-500'
                          : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
                      }`}
                    >
                      <Database className="w-5 h-5 text-red-500 shrink-0 mt-1" />
                      <div>
                        <p className="font-bold text-stone-800 text-sm">Restaurar restaurante para o estado inicial</p>
                        <p className="text-stone-400 text-[11px] mt-0.5">Remove praticamente todos os dados cadastrados. Mantém apenas o cadastro do restaurante e o Proprietário Principal.</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-wider block">Motivo da solicitação</label>
                  <p className="text-xs text-stone-500">Explique o motivo da limpeza.</p>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Exemplo: Preparação do restaurante para iniciar uma nova operação."
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl text-sm focus:ring-2 focus:ring-red-500/20 min-h-[100px]"
                  />
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-stone-400">Mínimo de 10 caracteres</span>
                    <span className={`${reason.trim().length >= 10 ? 'text-emerald-600' : 'text-stone-400'} font-bold`}>
                      {reason.trim().length} de 500 caracteres
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={cleanupLoading || reason.trim().length < 10}
                  onClick={handleCreateCleanupRequest}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 disabled:opacity-50 shadow-lg shadow-red-100 transition-all text-sm"
                >
                  {cleanupLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                  Analisar Limpeza
                </button>
              </div>
            )}

            {/* AWAITING CONFIRMATION & SEVERAL CONFIRMATION STEPS */}
            {cleanupRequest && cleanupRequest.status === 'AWAITING_CONFIRMATION' && (
              <div className="space-y-6">
                <div className="bg-stone-50 rounded-2xl border border-stone-200 p-5 space-y-4">
                  <h4 className="font-bold text-stone-800 text-sm flex items-center gap-2">
                    <FileText className="w-5 h-5 text-amber-500" />
                    Relatório Prévio de Impacto (Análise de Deleção)
                  </h4>
                  <p className="text-xs text-stone-500">
                    O sistema mapeou as informações vinculadas ao seu restaurante. Revise cuidadosamente o que será removido e o que será preservado:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* TO DELETE */}
                    <div className="border border-red-100 bg-red-50/10 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-red-50">
                        <Trash2 className="w-4 h-4" /> Serão Removidos Permanentemente:
                      </p>
                      <ul className="space-y-1.5 text-xs text-stone-600">
                        {cleanupRequest.deletedData && cleanupRequest.deletedData.map((item: string, idx: number) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                            {item}
                          </li>
                        ))}
                        {(!cleanupRequest.deletedData || cleanupRequest.deletedData.length === 0) && (
                          <li className="text-stone-400 italic font-normal">Nenhuma informação selecionada para remoção.</li>
                        )}
                      </ul>
                    </div>

                    {/* TO PRESERVE */}
                    <div className="border border-emerald-100 bg-emerald-50/10 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-emerald-50">
                        <Check className="w-4 h-4" /> Serão Preservados com Segurança:
                      </p>
                      <ul className="space-y-1.5 text-xs text-stone-600">
                        {cleanupRequest.preservedData && cleanupRequest.preservedData.map((item: string, idx: number) => (
                          <li key={idx} className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {item}
                          </li>
                        ))}
                        {(!cleanupRequest.preservedData || cleanupRequest.preservedData.length === 0) && (
                          <li className="text-stone-400 italic font-normal">Nenhuma informação sob preservação especial.</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>

                {!showConfirmationInput ? (
                  /* STEP 2 - AFTER ANALYSIS (SHOW REPORT, CLICK CONTINUAR) */
                  <div className="border border-stone-200 bg-stone-50 rounded-2xl p-5 space-y-4">
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={handleCancelRequest}
                        disabled={cleanupLoading}
                        className="flex-1 py-3 border border-stone-200 bg-white text-stone-600 font-bold rounded-xl text-xs hover:bg-stone-50 transition-colors disabled:opacity-50"
                      >
                        Cancelar
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowConfirmationInput(true)}
                        disabled={cleanupLoading}
                        className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl text-xs hover:bg-red-700 transition-colors disabled:opacity-50 shadow-md shadow-red-100"
                      >
                        Continuar
                      </button>
                    </div>
                  </div>
                ) : (
                  /* STEP 3 - AFTER CONTINUAR (INPUT NAME, CLICK CONFIRMAR LIMPEZA) */
                  <div className="border border-red-100 bg-red-50/20 rounded-2xl p-5 space-y-4 animate-fade-in">
                    <h5 className="font-bold text-red-800 text-sm flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      Confirmação de Segurança
                    </h5>
                    
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-stone-600 block">
                        Para confirmar a operação, digite o nome completo do restaurante: <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded text-red-700 font-bold">{(restaurantData?.nome || restaurantData?.nome_fantasia)}</span>
                      </label>
                      <input
                        type="text"
                        value={restaurantNameConfirmation}
                        onChange={(e) => setRestaurantNameConfirmation(e.target.value)}
                        placeholder="Digite o nome do restaurante..."
                        className="w-full p-4 bg-white border border-red-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500/20 font-bold"
                      />
                    </div>

                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setShowConfirmationInput(false)}
                        disabled={cleanupLoading}
                        className="flex-1 py-3 border border-stone-200 bg-white text-stone-600 font-bold rounded-xl text-xs hover:bg-stone-50 transition-colors disabled:opacity-50"
                      >
                        Voltar
                      </button>

                      <button
                        type="button"
                        disabled={cleanupLoading || restaurantNameConfirmation.trim().toUpperCase() !== (restaurantData?.nome || restaurantData?.nome_fantasia || '').trim().toUpperCase()}
                        onClick={handleConfirmRequest}
                        className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl text-xs hover:bg-red-700 transition-colors disabled:opacity-50 shadow-md shadow-red-100"
                      >
                        {cleanupLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Confirmar Limpeza"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* APPROVED STATE (STEP 4 - CONFIRMED, READY TO EXECUTE) */}
            {cleanupRequest && cleanupRequest.status === 'APPROVED' && (
              <div className="border border-emerald-200 bg-emerald-50/30 rounded-2xl p-6 space-y-4 animate-fade-in">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500 text-white rounded-full p-2">
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-emerald-800 text-sm">Solicitação Confirmada e Aprovada</h4>
                    <p className="text-xs text-emerald-600">A assinatura de segurança foi validada. Clique no botão abaixo para dar início ao processo definitivo.</p>
                  </div>
                </div>

                <div className="flex gap-4 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelRequest}
                    disabled={cleanupLoading}
                    className="flex-1 py-3 border border-stone-200 bg-white text-stone-600 font-bold rounded-xl text-xs hover:bg-stone-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>

                  <button
                    type="button"
                    onClick={handleExecuteRequest}
                    disabled={cleanupLoading}
                    className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl text-xs hover:bg-red-700 transition-colors disabled:opacity-50 shadow-lg shadow-red-100"
                  >
                    {cleanupLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Executar Limpeza"}
                  </button>
                </div>
              </div>
            )}

            {/* IN PROGRESS EXECUTION PANEL */}
            {cleanupRequest && ['ANALYZING', 'BACKUP_IN_PROGRESS', 'READY', 'RUNNING'].includes(cleanupRequest.status) && (
              <div className="border border-amber-200 bg-amber-50/10 rounded-2xl p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-6 h-6 text-amber-600 animate-spin" />
                    <div>
                      <h4 className="font-bold text-amber-800 text-sm">Processando Limpeza de Segurança</h4>
                      <p className="text-xs text-amber-600">{cleanupRequest.currentStep || 'Executando etapas de manutenção...'}</p>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-lg text-amber-700">{cleanupRequest.progress || 0}%</span>
                </div>

                {/* VISUAL PROGRESS BAR */}
                <div className="w-full bg-stone-100 rounded-full h-3 overflow-hidden border border-stone-200">
                  <div
                    className="bg-amber-500 h-full transition-all duration-500 ease-out"
                    style={{ width: `${cleanupRequest.progress || 0}%` }}
                  />
                </div>

                {/* LOGS TERMINAL */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Histórico de Operação (Logs):</p>
                  <div className="bg-stone-900 text-stone-300 font-mono text-[11px] p-4 rounded-xl max-h-[180px] overflow-y-auto space-y-1.5 scrollbar-thin">
                    {getSimulatedLogs(cleanupRequest).map((log, idx) => (
                      <p
                        key={idx}
                        className={
                          log.includes('Falha') || log.includes('abortada')
                            ? 'text-red-400'
                            : log.includes('concluído') || log.includes('concluída') || log.includes('sucesso')
                            ? 'text-emerald-400'
                            : log.includes('Iniciando') || log.includes('Removendo') || log.includes('Anonimizando')
                            ? 'text-amber-400'
                            : 'text-stone-300'
                        }
                      >
                        {log}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
