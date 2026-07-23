import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  BarChart3, 
  TrendingUp, 
  Clock, 
  PlusCircle, 
  Pencil, 
  Pause, 
  Play, 
  Trash2, 
  Eye, 
  Search, 
  Calendar, 
  Smartphone, 
  Monitor, 
  Tablet, 
  MapPin, 
  Briefcase, 
  Sparkles,
  CheckCircle,
  Filter,
  User
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  PrestadorServico, 
  ServicoInteresseEvent, 
  getPrestadoresServicosByOwner, 
  getInteressesByOwner, 
  pausePrestadorServico, 
  reactivatePrestadorServico, 
  deletePrestadorServico 
} from '../../services/prestadorServicoService';
import { getCategoryNameById, getCategoryColorById } from '../../data/serviceCategories';
import DeleteServiceModal from '../../components/client/DeleteServiceModal';

type DashboardTab = 'overview' | 'interests' | 'listings';

export default function ServiceRequests() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isAdmin = Boolean(user) && (profile?.role === 'admin' || profile?.tipo_usuario === 'admin' || user?.email === 'felipeacompanhamento@gmail.com');
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  const [myServices, setMyServices] = useState<PrestadorServico[]>([]);
  const [interestsHistory, setInterestsHistory] = useState<ServicoInteresseEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyFilterDays, setHistoryFilterDays] = useState<number>(0); // 0 = all, 7, 30

  // Fetch user's services & interests
  const loadDashboardData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [servicesList, eventsList] = await Promise.all([
        getPrestadoresServicosByOwner(user.uid),
        getInteressesByOwner(user.uid)
      ]);
      setMyServices(servicesList);
      setInterestsHistory(eventsList);
    } catch (err) {
      console.error("Error loading dashboard metrics:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  // Compute Overview Statistics
  const stats = useMemo(() => {
    const totalActive = myServices.filter(s => s.ativo !== false).length;
    const totalPaused = myServices.filter(s => s.ativo === false).length;
    
    // Sum of all clicks from services + history events
    const totalAccumulatedClicks = myServices.reduce((acc, curr) => acc + (curr.totalWhatsappClicks || 0), 0);
    const totalEvents = interestsHistory.length;
    const totalInterestsCount = Math.max(totalAccumulatedClicks, totalEvents);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);

    let countToday = 0;
    let count7Days = 0;
    let count30Days = 0;

    interestsHistory.forEach(ev => {
      const evTime = ev.clickedAt?.toMillis ? ev.clickedAt.toMillis() : 0;
      if (evTime >= startOfToday) countToday++;
      if (evTime >= sevenDaysAgo) count7Days++;
      if (evTime >= thirtyDaysAgo) count30Days++;
    });

    // Top performing service
    let topService: PrestadorServico | null = null;
    let leastService: PrestadorServico | null = null;

    if (myServices.length > 0) {
      const sortedByClicks = [...myServices].sort((a, b) => (b.totalWhatsappClicks || 0) - (a.totalWhatsappClicks || 0));
      topService = sortedByClicks[0];
      leastService = sortedByClicks[sortedByClicks.length - 1];
    }

    // Last interest date
    let lastContactDate: Date | null = null;
    if (interestsHistory.length > 0 && interestsHistory[0].clickedAt) {
      lastContactDate = interestsHistory[0].clickedAt.toDate ? interestsHistory[0].clickedAt.toDate() : new Date(interestsHistory[0].clickedAt);
    }

    return {
      totalActive,
      totalPaused,
      totalInterestsCount,
      countToday,
      count7Days,
      count30Days,
      topService,
      leastService,
      lastContactDate
    };
  }, [myServices, interestsHistory]);

  // Filtered interests history
  const filteredHistory = useMemo(() => {
    return interestsHistory.filter(ev => {
      // Date filter
      if (historyFilterDays > 0) {
        const evTime = ev.clickedAt?.toMillis ? ev.clickedAt.toMillis() : 0;
        const threshold = Date.now() - (historyFilterDays * 24 * 60 * 60 * 1000);
        if (evTime < threshold) return false;
      }

      // Search filter
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase().trim();
        const title = (ev.serviceTitle || '').toLowerCase();
        const city = (ev.approximateCity || '').toLowerCase();
        const src = (ev.source || '').toLowerCase();
        return title.includes(q) || city.includes(q) || src.includes(q);
      }

      return true;
    });
  }, [interestsHistory, historyFilterDays, historySearch]);

  // Handlers for Service Actions in 'Meus Anúncios'
  const handleTogglePause = async (serv: PrestadorServico) => {
    const newStatus = !serv.ativo;
    const actionText = newStatus ? "reativar" : "pausar";
    if (!window.confirm(`Deseja realmente ${actionText} o anúncio "${serv.titulo}"?`)) return;

    try {
      if (newStatus) {
        await reactivatePrestadorServico(serv.id);
      } else {
        await pausePrestadorServico(serv.id);
      }
      setMyServices(prev => prev.map(s => s.id === serv.id ? { ...s, ativo: newStatus } : s));
    } catch (err) {
      console.error("Error toggling pause state:", err);
      alert("Erro ao alterar o status do anúncio.");
    }
  };

  // Delete modal states
  const [deleteModalService, setDeleteModalService] = useState<PrestadorServico | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  const handleOpenDeleteModal = (serv: PrestadorServico) => {
    setDeleteModalService(serv);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDeleteService = async (serv: PrestadorServico) => {
    await deletePrestadorServico(serv.id);
    setMyServices(prev => prev.filter(s => s.id !== serv.id));
  };

  const handlePauseServiceFromModal = async (serv: PrestadorServico) => {
    await pausePrestadorServico(serv.id);
    setMyServices(prev => prev.map(s => s.id === serv.id ? { ...s, ativo: false } : s));
  };

  const handleEditService = (serv: PrestadorServico) => {
    navigate('/servicos', { state: { editService: serv } });
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Data recente';
    const dateObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return dateObj.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderDeviceIcon = (deviceType?: string) => {
    if (deviceType === 'mobile') return <span title="Dispositivo Móvel"><Smartphone className="w-3.5 h-3.5 text-stone-500" /></span>;
    if (deviceType === 'desktop') return <span title="Computador / Desktop"><Monitor className="w-3.5 h-3.5 text-stone-500" /></span>;
    if (deviceType === 'tablet') return <span title="Tablet"><Tablet className="w-3.5 h-3.5 text-stone-500" /></span>;
    return <Smartphone className="w-3.5 h-3.5 text-stone-500" />;
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-16 font-sans flex flex-col antialiased">
      
      {/* Header */}
      <header className="bg-white text-stone-800 select-none sticky top-0 z-40 shadow-xs border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/servicos')} 
              className="p-2 hover:bg-stone-100 rounded-full transition-all focus:outline-none"
              id="dashboard-back-btn"
              aria-label="Voltar para Serviços"
            >
              <ChevronLeft className="w-6 h-6 text-stone-800" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-stone-900 font-sans flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
                Painel de Desempenho dos Serviços
              </h1>
              <p className="text-xs text-stone-500 font-medium hidden sm:block">
                Acompanhe o interesse dos clientes e gerencie seus anúncios no QFomeAI
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/servicos')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-xs sm:text-sm font-extrabold rounded-full text-white flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Novo Anúncio</span>
          </button>
        </div>
      </header>

      {/* Unauthenticated State */}
      {!user ? (
        <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mb-6 border border-emerald-100 shadow-sm">
            <BarChart3 className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-extrabold text-stone-900 tracking-tight">
            Acesse seu Painel do Prestador
          </h2>
          <p className="text-sm text-stone-600 mt-2 max-w-md font-medium leading-relaxed">
            Faça login para acompanhar em tempo real quantas pessoas demonstraram interesse nos seus serviços, visualizar o histórico de cliques do WhatsApp e gerenciar seus anúncios.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="mt-6 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-2xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            Fazer Login para Acessar
          </button>
        </main>
      ) : (
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          
          {/* Dashboard Header Banner */}
          <div className="bg-emerald-900 text-white rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-emerald-800/30 rounded-l-full blur-2xl pointer-events-none" />
            
            <div className="space-y-2 relative z-10">
              <span className="text-xs font-black tracking-widest uppercase bg-emerald-800/80 text-emerald-200 px-3 py-1 rounded-full border border-emerald-700/60 inline-flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                Painel do Anunciante
              </span>
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Olá, {profile?.nome || 'Prestador'}!
              </h2>
              <p className="text-xs sm:text-sm text-emerald-100 font-medium max-w-xl">
                Acompanhe o desempenho público dos seus anúncios e as interações recebidas via WhatsApp.
              </p>
            </div>

            {/* Quick CTAs */}
            <div className="flex items-center gap-3 relative z-10 shrink-0 w-full md:w-auto">
              <button
                onClick={() => navigate('/servicos')}
                className="flex-1 md:flex-none px-5 py-3 bg-white hover:bg-emerald-50 text-emerald-900 font-extrabold text-xs sm:text-sm rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Eye className="w-4 h-4 text-emerald-700" />
                <span>Ver Anúncios na Página</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-white rounded-2xl border border-stone-200 p-1.5 flex items-center gap-1 shadow-xs overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'overview' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>Visão Geral</span>
            </button>

            <button
              onClick={() => setActiveTab('interests')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'interests' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Histórico de Interesses ({interestsHistory.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('listings')}
              className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap ${
                activeTab === 'listings' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Meus Anúncios ({myServices.length})</span>
            </button>
          </div>

          {/* TAB 1: VISÃO GERAL */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                
                <div className="bg-white p-4.5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-stone-400">
                    <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">Ativos</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="text-2xl font-black text-stone-900">{stats.totalActive}</div>
                  <span className="text-[10px] text-stone-500 font-medium block">Serviços publicados</span>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-stone-400">
                    <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">Pausados</span>
                    <Pause className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-2xl font-black text-stone-900">{stats.totalPaused}</div>
                  <span className="text-[10px] text-stone-500 font-medium block">Serviços ocultos</span>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-emerald-600">
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">Total Interesses</span>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-emerald-700">{stats.totalInterestsCount}</div>
                  <span className="text-[10px] text-stone-500 font-medium block">Cliques em WhatsApp</span>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-stone-400">
                    <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">Hoje</span>
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <div className="text-2xl font-black text-stone-900">{stats.countToday}</div>
                  <span className="text-[10px] text-stone-500 font-medium block">Interesses hoje</span>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-stone-400">
                    <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">Últimos 7d</span>
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <div className="text-2xl font-black text-stone-900">{stats.count7Days}</div>
                  <span className="text-[10px] text-stone-500 font-medium block">Interesses nos 7d</span>
                </div>

                <div className="bg-white p-4.5 rounded-2xl border border-stone-200/80 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-stone-400">
                    <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">Últimos 30d</span>
                    <BarChart3 className="w-3.5 h-3.5 text-purple-500" />
                  </div>
                  <div className="text-2xl font-black text-stone-900">{stats.count30Days}</div>
                  <span className="text-[10px] text-stone-500 font-medium block">Interesses nos 30d</span>
                </div>

              </div>

              {/* Highlights & Top Performers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                {/* Top Service */}
                <div className="bg-white p-6 rounded-3xl border border-stone-200/80 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-emerald-700 text-xs font-black uppercase tracking-wider">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Anúncio Mais Procurado</span>
                  </div>
                  {stats.topService ? (
                    <div className="space-y-1">
                      <h3 className="text-base font-extrabold text-stone-900 line-clamp-1">{stats.topService.titulo}</h3>
                      <p className="text-xs text-stone-500 font-medium">{stats.topService.nome} • {getCategoryNameById(stats.topService.categoria)}</p>
                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full">
                          {stats.topService.totalWhatsappClicks || 0} contatos
                        </span>
                        <button
                          onClick={() => handleEditService(stats.topService!)}
                          className="text-xs font-bold text-stone-600 hover:text-emerald-600 underline cursor-pointer"
                        >
                          Gerenciar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 font-medium">Nenhum anúncio cadastrado ainda.</p>
                  )}
                </div>

                {/* Least Service */}
                <div className="bg-white p-6 rounded-3xl border border-stone-200/80 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-stone-600 text-xs font-black uppercase tracking-wider">
                    <TrendingUp className="w-4 h-4 text-stone-500" />
                    <span>Oportunidade de Destaque</span>
                  </div>
                  {stats.leastService ? (
                    <div className="space-y-1">
                      <h3 className="text-base font-extrabold text-stone-900 line-clamp-1">{stats.leastService.titulo}</h3>
                      <p className="text-xs text-stone-500 font-medium">{stats.leastService.nome} • {getCategoryNameById(stats.leastService.categoria)}</p>
                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-xs font-black text-stone-700 bg-stone-100 border border-stone-200/80 px-3 py-1 rounded-full">
                          {stats.leastService.totalWhatsappClicks || 0} contatos
                        </span>
                        <button
                          onClick={() => handleEditService(stats.leastService!)}
                          className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                        >
                          Melhorar Descrição
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 font-medium">Nenhum anúncio cadastrado ainda.</p>
                  )}
                </div>

                {/* Last Contact */}
                <div className="bg-white p-6 rounded-3xl border border-stone-200/80 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-blue-700 text-xs font-black uppercase tracking-wider">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Último Interesse Recebido</span>
                  </div>
                  {stats.lastContactDate ? (
                    <div className="space-y-1">
                      <h3 className="text-base font-extrabold text-stone-900">
                        {stats.lastContactDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </h3>
                      <p className="text-xs text-stone-500 font-medium">
                        às {stats.lastContactDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="pt-2">
                        <button
                          onClick={() => setActiveTab('interests')}
                          className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer"
                        >
                          Ver Histórico Completo &rarr;
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 font-medium">Nenhum contato registrado recentemente.</p>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: HISTÓRICO DE INTERESSES */}
          {activeTab === 'interests' && (
            <div className="space-y-4">
              
              {/* Filter & Search Bar */}
              <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-auto flex-1">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filtrar histórico por nome do serviço ou cidade..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0 text-xs w-full sm:w-auto justify-end">
                  <span className="text-stone-400 font-bold text-[11px] uppercase flex items-center gap-1">
                    <Filter className="w-3 h-3" />
                    Período:
                  </span>
                  <button
                    onClick={() => setHistoryFilterDays(0)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      historyFilterDays === 0 ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    Tudo
                  </button>
                  <button
                    onClick={() => setHistoryFilterDays(7)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      historyFilterDays === 7 ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    7 Dias
                  </button>
                  <button
                    onClick={() => setHistoryFilterDays(30)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                      historyFilterDays === 30 ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    30 Dias
                  </button>
                </div>
              </div>

              {/* History Table / List */}
              {filteredHistory.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl border border-stone-200 text-center space-y-3">
                  <Clock className="w-10 h-10 text-stone-300 mx-auto" />
                  <h3 className="text-base font-bold text-stone-800">Nenhum interesse registrado</h3>
                  <p className="text-xs text-stone-500 max-w-sm mx-auto font-medium">
                    Quando os clientes de sua região clicarem em "Falar no WhatsApp" nos seus anúncios, as interações aparecerão aqui.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200 text-stone-500 font-extrabold uppercase text-[10px] tracking-wider">
                          <th className="py-3 px-4">Anúncio do Serviço</th>
                          <th className="py-3 px-4">Data e Horário</th>
                          <th className="py-3 px-4">Cidade Aproximada</th>
                          <th className="py-3 px-4">Origem</th>
                          <th className="py-3 px-4">Dispositivo</th>
                          <th className="py-3 px-4 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                        {filteredHistory.map((ev, idx) => (
                          <tr key={ev.id || idx} className="hover:bg-stone-50/70 transition-colors">
                            <td className="py-3 px-4 font-bold text-stone-900 max-w-xs truncate">
                              {ev.serviceTitle || 'Serviço'}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-stone-600">
                              {formatDate(ev.clickedAt)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-stone-600 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                              <span>{ev.approximateCity || 'Região Local'}</span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 font-bold text-[10px]">
                                {ev.source === 'card_servicos' ? 'Card /servicos' : ev.source}
                              </span>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-1 capitalize text-stone-600">
                                {renderDeviceIcon(ev.deviceType)}
                                <span className="text-[11px]">{ev.deviceType || 'Móvel'}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <button
                                onClick={() => navigate('/servicos')}
                                className="text-emerald-600 hover:text-emerald-700 font-bold text-[11px] hover:underline cursor-pointer"
                              >
                                Ver Anúncio
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 3: MEUS ANÚNCIOS */}
          {activeTab === 'listings' && (
            <div className="space-y-4">
              
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-stone-900 tracking-tight">
                  Seus Anúncios Cadastrados ({myServices.length})
                </h3>
                <button
                  onClick={() => navigate('/servicos')}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Cadastrar Novo</span>
                </button>
              </div>

              {myServices.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl border border-stone-200 text-center space-y-4">
                  <Briefcase className="w-12 h-12 text-stone-300 mx-auto" />
                  <div>
                    <h3 className="text-base font-extrabold text-stone-900">Nenhum serviço cadastrado</h3>
                    <p className="text-xs text-stone-500 font-medium mt-1">
                      Você ainda não cadastrou nenhum anúncio de serviço. Comece a divulgar seu trabalho gratuitamente agora mesmo!
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/servicos')}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl transition-all shadow-xs cursor-pointer"
                  >
                    Criar Meu Primeiro Anúncio
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myServices.map((serv) => {
                    const isPaused = serv.ativo === false;
                    const catName = getCategoryNameById(serv.categoria);
                    const catColor = getCategoryColorById(serv.categoria);

                    return (
                      <div 
                        key={serv.id} 
                        className={`bg-white rounded-2xl border p-5 space-y-3 flex flex-col justify-between transition-all ${
                          isPaused ? 'border-amber-200 bg-amber-50/20' : 'border-stone-200 shadow-xs'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`px-2.5 py-0.5 text-[10px] font-black uppercase rounded-full border ${catColor}`}>
                              {catName}
                            </span>

                            <span className={`px-2.5 py-0.5 text-[10px] font-black rounded-full border ${
                              isPaused 
                                ? 'bg-amber-100 text-amber-800 border-amber-300' 
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            }`}>
                              {isPaused ? 'Pausado' : 'Ativo'}
                            </span>
                          </div>

                          <h4 className="text-base font-extrabold text-stone-900 leading-snug">
                            {serv.titulo}
                          </h4>

                          <p className="text-xs text-stone-600 line-clamp-2 font-medium">
                            {serv.descricao}
                          </p>

                          <div className="flex items-center gap-3 text-xs font-bold text-stone-500 pt-1">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-stone-400" />
                              {serv.cidade} - {serv.estado}
                            </span>
                            <span className="flex items-center gap-1 text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md">
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              {serv.totalWhatsappClicks || 0} contatos
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                          <button
                            onClick={() => handleEditService(serv)}
                            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-extrabold text-xs rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </button>

                          <button
                            onClick={() => handleTogglePause(serv)}
                            className={`px-3 py-1.5 font-extrabold text-xs rounded-xl flex items-center gap-1 transition-all cursor-pointer ${
                              isPaused 
                                ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800' 
                                : 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                            }`}
                          >
                            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                            <span>{isPaused ? 'Reativar' : 'Pausar'}</span>
                          </button>

                          <button
                            onClick={() => handleOpenDeleteModal(serv)}
                            className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-stone-100 rounded-xl transition-all cursor-pointer"
                            title={isAdmin ? "Excluir anúncio (Administrador)" : "Excluir anúncio"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          )}

        </main>
      )}

      {/* Structured Delete Modal */}
      <DeleteServiceModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        service={deleteModalService}
        isAdmin={isAdmin}
        onConfirmDelete={handleConfirmDeleteService}
        onPauseService={handlePauseServiceFromModal}
      />

    </div>
  );
}
