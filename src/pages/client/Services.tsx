import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { 
  ChevronLeft, 
  PlusCircle, 
  MapPin, 
  MessageCircle, 
  Trash2, 
  User, 
  Search, 
  X, 
  Briefcase, 
  CheckCircle, 
  Sparkles, 
  Phone, 
  Type, 
  FileText, 
  ChevronDown, 
  LayoutGrid, 
  ShieldCheck,
  Tag,
  Filter,
  Pencil,
  Pause,
  Play,
  BarChart3,
  Check
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import { 
  SERVICE_CATEGORIES, 
  getCategoryById, 
  getCategoryNameById, 
  getCategoryColorById, 
  LEGACY_CATEGORY_MAP 
} from '../../data/serviceCategories';
import { 
  PrestadorServico, 
  getPrestadoresServicos, 
  createPrestadorServico, 
  updatePrestadorServico, 
  pausePrestadorServico, 
  reactivatePrestadorServico, 
  deletePrestadorServico, 
  registerWhatsappClick 
} from '../../services/prestadorServicoService';
import DeleteServiceModal from '../../components/client/DeleteServiceModal';

const convertDriveUrl = (url: string) => {
  if (!url) return '';
  const match = url.match(/(?:id=|\/d\/|folders\/)([a-zA-Z0-9_-]{25,})/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}=s220`;
  }
  return url;
};

interface StateDb {
  id: string;
  nome: string;
  sigla: string;
}

interface CityDb {
  id: string;
  nome: string;
  estado_id: string;
}

export default function Services() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();

  // Selected state & city filters from localStorage
  const [currentEstadoId] = useState<string>(() => localStorage.getItem('user_estado_id') || '');
  const [currentCidadeId] = useState<string>(() => localStorage.getItem('user_cidade_id') || '');
  const [currentCidadeNome] = useState<string>(() => localStorage.getItem('user_cidade_nome') || 'Sua Região');

  // Search & Filter state
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAttendanceMode, setSelectedAttendanceMode] = useState<string>('todos');

  // Services list state
  const [services, setServices] = useState<PrestadorServico[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // States & Cities for location selector inside registration modal
  const [allEstados, setAllEstados] = useState<StateDb[]>([]);
  const [allCidades, setAllCidades] = useState<CityDb[]>([]);
  const [filteredCities, setFilteredCities] = useState<CityDb[]>([]);

  // Registration/Edit Modal Form State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingService, setEditingService] = useState<PrestadorServico | null>(null);

  const [regNome, setRegNome] = useState<string>('');
  const [regTelefone, setRegTelefone] = useState<string>('');
  const [regTitulo, setRegTitulo] = useState<string>('');
  const [regCategoria, setRegCategoria] = useState<string>('construcao_reformas');
  const [regSubcategoria, setRegSubcategoria] = useState<string>('');
  const [regSubcategoriaOutro, setRegSubcategoriaOutro] = useState<string>('');
  const [regDescricao, setRegDescricao] = useState<string>('');
  const [regEstadoId, setRegEstadoId] = useState<string>('');
  const [regCidadeId, setRegCidadeId] = useState<string>('');
  const [regBairro, setRegBairro] = useState<string>('');
  const [regLogoUrl, setRegLogoUrl] = useState<string>('');
  const [regAtivo, setRegAtivo] = useState<boolean>(true);
  
  // Extra rich registration fields
  const [regFormaAtendimento, setRegFormaAtendimento] = useState<string[]>(['domicilio', 'local']);
  const [regFormasPagamento, setRegFormasPagamento] = useState<string[]>(['pix', 'dinheiro']);
  const [regModeloPreco, setRegModeloPreco] = useState<string>('orcamento');
  const [regValorInicial, setRegValorInicial] = useState<string>('');
  const [regRegistroProfissional, setRegRegistroProfissional] = useState<string>('');

  const [regLoading, setRegLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch services via prestadorServicoService
  const fetchServices = async () => {
    try {
      setLoading(true);
      const items = await getPrestadoresServicos();
      setServices(items);
    } catch (err: any) {
      console.error("Error loading services:", err);
      setError("Não foi possível carregar a lista de serviços.");
    } finally {
      setLoading(false);
    }
  };

  // Load States and Cities for Modal Dropdowns
  const fetchLocations = async () => {
    try {
      const statesSnap = await getDocs(collection(db, 'estados'));
      const statesList: StateDb[] = statesSnap.docs.map(docSnap => ({
        id: docSnap.id,
        nome: docSnap.data().nome || '',
        sigla: docSnap.data().sigla || ''
      }));
      setAllEstados(statesList);

      const citiesSnap = await getDocs(collection(db, 'cidades'));
      const citiesList: CityDb[] = citiesSnap.docs.map(docSnap => ({
        id: docSnap.id,
        nome: docSnap.data().nome || '',
        estado_id: docSnap.data().estado_id || ''
      }));
      setAllCidades(citiesList);
    } catch (err) {
      console.error("Error fetching locations: ", err);
    }
  };

  useEffect(() => {
    fetchServices();
    fetchLocations();
  }, []);

  // Handle edit trigger from location state (navigation from /servicos/solicitacoes)
  useEffect(() => {
    if (location.state && (location.state as any).editService) {
      const serviceToEdit = (location.state as any).editService as PrestadorServico;
      handleOpenEditModal(serviceToEdit);
    }
  }, [location.state]);

  // Update available subcategories when selected registration category changes
  const selectedRegCatDefinition = useMemo(() => {
    return getCategoryById(regCategoria) || SERVICE_CATEGORIES[0];
  }, [regCategoria]);

  useEffect(() => {
    if (!editingService) {
      if (selectedRegCatDefinition && selectedRegCatDefinition.subtypes.length > 0) {
        setRegSubcategoria(selectedRegCatDefinition.subtypes[0]);
      } else {
        setRegSubcategoria('Outro serviço não listado');
      }
    }
  }, [regCategoria, selectedRegCatDefinition, editingService]);

  // Filter cities in modal based on selected state
  useEffect(() => {
    if (regEstadoId) {
      const filtered = allCidades.filter(c => c.estado_id === regEstadoId);
      setFilteredCities(filtered);
      if (filtered.length > 0) {
        if (!filtered.some(c => c.id === regCidadeId)) {
          setRegCidadeId(filtered[0].id);
        }
      } else {
        setRegCidadeId('');
      }
    } else {
      setFilteredCities([]);
      setRegCidadeId('');
    }
  }, [regEstadoId, allCidades]);

  // Filter active services for public listing
  const publicServices = useMemo(() => {
    return services.filter(s => {
      // Show active services publicly, OR paused services if current user is owner/admin
      if (s.ativo !== false) return true;
      if (user && (s.userId === user.uid || profile?.role === 'admin')) return true;
      return false;
    });
  }, [services, user, profile]);

  const activeServices = useMemo(() => {
    return services.filter(s => s.ativo !== false);
  }, [services]);

  // Compute category counts for ACTIVE services
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    activeServices.forEach((serv) => {
      const catKey = LEGACY_CATEGORY_MAP[serv.categoria] || serv.categoria;
      counts[catKey] = (counts[catKey] || 0) + 1;
    });
    return counts;
  }, [activeServices]);

  // Filter categories with active services + 'Todos'
  const activeCategories = useMemo(() => {
    return SERVICE_CATEGORIES.filter(cat => (categoryCounts[cat.id] || 0) > 0);
  }, [categoryCounts]);

  // Reset selected category to 'todos' if selection no longer has services
  useEffect(() => {
    if (selectedCategory !== 'todos') {
      const exists = activeCategories.some(cat => cat.id === selectedCategory);
      if (!exists) {
        setSelectedCategory('todos');
      }
    }
  }, [activeCategories, selectedCategory]);

  // Handle open registration modal for NEW service
  const handleOpenRegistration = () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setEditingService(null);
    setRegNome(profile?.nome || '');
    setRegTelefone(profile?.telefone || '');
    setRegEstadoId(currentEstadoId);
    setRegCidadeId(currentCidadeId);
    setRegBairro('');
    setRegTitulo('');
    setRegDescricao('');
    setRegCategoria(SERVICE_CATEGORIES[0].id);
    setRegSubcategoria(SERVICE_CATEGORIES[0].subtypes[0] || '');
    setRegSubcategoriaOutro('');
    setRegLogoUrl('');
    setRegAtivo(true);
    setRegFormaAtendimento(['domicilio', 'local']);
    setRegFormasPagamento(['pix', 'dinheiro']);
    setRegModeloPreco('orcamento');
    setRegValorInicial('');
    setRegRegistroProfissional('');
    setSuccessMessage(null);
    setError(null);
    setIsModalOpen(true);
  };

  // Handle open modal for EDITING existing service
  const handleOpenEditModal = (serv: PrestadorServico) => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Security check
    if (serv.userId !== user.uid && profile?.role !== 'admin') {
      alert("Você não tem permissão para editar este serviço.");
      return;
    }

    setEditingService(serv);
    setRegNome(serv.nome || '');
    setRegTelefone(serv.telefone || '');
    setRegEstadoId(serv.estado_id || currentEstadoId);
    setRegCidadeId(serv.cidade_id || currentCidadeId);
    setRegBairro(serv.bairro || '');
    setRegTitulo(serv.titulo || '');
    setRegDescricao(serv.descricao || '');
    setRegCategoria(serv.categoria || SERVICE_CATEGORIES[0].id);
    setRegSubcategoria(serv.subcategoria || '');
    setRegSubcategoriaOutro(serv.subcategoriaOutro || '');
    setRegLogoUrl(serv.logoUrl || '');
    setRegAtivo(serv.ativo !== false);
    setRegFormaAtendimento(serv.formaAtendimento || ['domicilio', 'local']);
    setRegFormasPagamento(serv.formasPagamento || ['pix', 'dinheiro']);
    setRegModeloPreco(serv.modeloPreco || 'orcamento');
    setRegValorInicial(serv.valorInicial || '');
    setRegRegistroProfissional(serv.registroProfissional || '');
    setSuccessMessage(null);
    setError(null);
    setIsModalOpen(true);
  };

  // Toggle checkbox helper
  const toggleArrayItem = (list: string[], item: string, setter: (val: string[]) => void) => {
    if (list.includes(item)) {
      if (list.length > 1) {
        setter(list.filter(i => i !== item));
      }
    } else {
      setter([...list, item]);
    }
  };

  // Submit Service Registration or Edit
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    setError(null);

    if (!user) {
      setError("É necessário estar autenticado para salvar um serviço.");
      setRegLoading(false);
      return;
    }

    if (!regNome.trim() || !regTelefone.trim() || !regTitulo.trim() || !regDescricao.trim() || !regEstadoId || !regCidadeId) {
      setError("Preencha todos os campos obrigatórios (*).");
      setRegLoading(false);
      return;
    }

    if (regSubcategoria === 'Outro serviço não listado' && !regSubcategoriaOutro.trim()) {
      setError("Por favor, especifique o nome do serviço no campo 'Nome do Serviço Personalizado'.");
      setRegLoading(false);
      return;
    }

    try {
      const stateObj = allEstados.find(e => e.id === regEstadoId);
      const cityObj = allCidades.find(c => c.id === regCidadeId);

      const payload = {
        nome: regNome.trim(),
        telefone: regTelefone.trim(),
        categoria: regCategoria,
        subcategoria: regSubcategoria,
        subcategoriaOutro: regSubcategoria === 'Outro serviço não listado' ? regSubcategoriaOutro.trim() : '',
        titulo: regTitulo.trim(),
        descricao: regDescricao.trim(),
        estado: stateObj?.nome || '',
        estado_id: regEstadoId,
        cidade: cityObj?.nome || '',
        cidade_id: regCidadeId,
        bairro: regBairro.trim() || '',
        logoUrl: regLogoUrl.trim(),
        userId: (editingService && editingService.userId) ? editingService.userId : user.uid, // Always preserve owner ID!
        ativo: regAtivo,
        formaAtendimento: regFormaAtendimento,
        formasPagamento: regFormasPagamento,
        modeloPreco: regModeloPreco,
        valorInicial: regModeloPreco === 'a_partir' ? regValorInicial.trim() : '',
        registroProfissional: regRegistroProfissional.trim()
      };

      if (editingService) {
        await updatePrestadorServico(editingService.id, payload);
        setSuccessMessage("Anúncio de serviço atualizado com sucesso!");
      } else {
        await createPrestadorServico(payload);
        setSuccessMessage("Seu serviço foi publicado com sucesso de forma visível a todos os usuários!");
      }

      await fetchServices();

      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMessage(null);
        setEditingService(null);
      }, 1500);

    } catch (err: any) {
      console.error("Error saving service: ", err);
      setError("Houve um problema ao salvar as informações do serviço.");
    } finally {
      setRegLoading(false);
    }
  };

  // Toggle Pause/Reactivate Service
  const handleTogglePauseService = async (serv: PrestadorServico) => {
    if (!user) return;
    const isOwnerOrAdmin = serv.userId === user.uid || !serv.userId || profile?.role === 'admin' || profile?.tipo_usuario === 'admin' || user.email === 'felipeacompanhamento@gmail.com';
    if (!isOwnerOrAdmin) {
      alert("Permissão negada.");
      return;
    }

    const newStatus = !serv.ativo;
    const actionText = newStatus ? "reativar" : "pausar";

    if (!window.confirm(`Deseja realmente ${actionText} o anúncio "${serv.titulo}"?`)) return;

    try {
      if (newStatus) {
        await reactivatePrestadorServico(serv.id);
      } else {
        await pausePrestadorServico(serv.id);
      }

      // Optimistic state update
      setServices(prev => prev.map(s => s.id === serv.id ? { ...s, ativo: newStatus } : s));
    } catch (err) {
      console.error("Error toggling pause state:", err);
      alert("Erro ao alterar o status do anúncio.");
    }
  };

  // Delete service modal states
  const [deleteModalService, setDeleteModalService] = useState<PrestadorServico | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  const handleOpenDeleteModal = (serv: PrestadorServico) => {
    setDeleteModalService(serv);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDeleteService = async (serv: PrestadorServico) => {
    await deletePrestadorServico(serv.id);
    setServices(prev => prev.filter(s => s.id !== serv.id));
  };

  const handlePauseServiceFromModal = async (serv: PrestadorServico) => {
    await pausePrestadorServico(serv.id);
    setServices(prev => prev.map(s => s.id === serv.id ? { ...s, ativo: false } : s));
  };

  // Handle WhatsApp Click with Tracking & Anti-Spam
  const handleWhatsAppClick = (serv: PrestadorServico) => {
    // 1. Record event non-blockingly
    registerWhatsappClick(serv, 'card_servicos', user?.uid, currentCidadeNome);

    // 2. Optimistically update local interest counter so user sees interest increment immediately
    setServices(prev => prev.map(s => {
      if (s.id === serv.id) {
        return {
          ...s,
          totalWhatsappClicks: (s.totalWhatsappClicks || 0) + 1
        };
      }
      return s;
    }));

    // 3. Open WhatsApp link
    const rawNumber = serv.telefone.replace(/\D/g, '');
    const numberToUse = rawNumber.startsWith('55') ? rawNumber : `55${rawNumber}`;
    const textMsg = encodeURIComponent(
      `Olá ${serv.nome}, vi o seu anúncio no QFomeAI ("${serv.titulo}") e gostaria de tirar dúvidas e solicitar um orçamento!`
    );
    const waUrl = `https://api.whatsapp.com/send?phone=${numberToUse}&text=${textMsg}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  // Filtered services based on search, category & attendance mode
  const filteredServices = useMemo(() => {
    return publicServices.filter((serv) => {
      // 1. Matches State
      if (currentEstadoId && serv.estado_id && serv.estado_id !== currentEstadoId) {
        return false;
      }

      // 2. Matches Category
      if (selectedCategory !== 'todos') {
        const mappedCat = LEGACY_CATEGORY_MAP[serv.categoria] || serv.categoria;
        if (mappedCat !== selectedCategory && serv.categoria !== selectedCategory) {
          return false;
        }
      }

      // 3. Matches Attendance Mode
      if (selectedAttendanceMode !== 'todos') {
        if (serv.formaAtendimento && serv.formaAtendimento.length > 0) {
          if (!serv.formaAtendimento.includes(selectedAttendanceMode)) {
            return false;
          }
        }
      }

      // 4. Matches Search Query
      if (searchQuery.trim()) {
        const queryStr = searchQuery.toLowerCase().trim();
        const catObj = getCategoryById(serv.categoria);
        const catName = catObj ? catObj.name.toLowerCase() : serv.categoria.toLowerCase();
        const subcat = (serv.subcategoria || '').toLowerCase();
        const subcatOutro = (serv.subcategoriaOutro || '').toLowerCase();
        const title = serv.titulo.toLowerCase();
        const desc = serv.descricao.toLowerCase();
        const providerName = serv.nome.toLowerCase();
        const bairro = (serv.bairro || '').toLowerCase();
        const cidade = serv.cidade.toLowerCase();

        const matches = 
          title.includes(queryStr) ||
          desc.includes(queryStr) ||
          providerName.includes(queryStr) ||
          catName.includes(queryStr) ||
          subcat.includes(queryStr) ||
          subcatOutro.includes(queryStr) ||
          bairro.includes(queryStr) ||
          cidade.includes(queryStr);

        if (!matches) return false;
      }

      return true;
    });
  }, [publicServices, currentEstadoId, selectedCategory, selectedAttendanceMode, searchQuery]);

  // Services matching user's current city
  const cityMatchedServices = useMemo(() => {
    return filteredServices.filter((serv) => !currentCidadeId || serv.cidade_id === currentCidadeId);
  }, [filteredServices, currentCidadeId]);

  // Services in other cities within state
  const otherCitiesServices = useMemo(() => {
    return filteredServices.filter((serv) => currentCidadeId && serv.cidade_id !== currentCidadeId);
  }, [filteredServices, currentCidadeId]);

  return (
    <div className="min-h-screen bg-stone-50 pb-16 font-sans flex flex-col antialiased">
      
      {/* Responsive Header */}
      <header className="bg-white text-stone-800 select-none sticky top-0 z-40 shadow-xs border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 hover:bg-stone-100 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500"
              id="services-back-btn"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-6 h-6 text-stone-800" />
            </button>
            <h1 className="text-xl font-bold tracking-tight text-stone-900 font-sans" id="services-title">
              Serviços Locais
            </h1>
          </div>
          
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleOpenRegistration}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-xs sm:text-sm font-extrabold rounded-full text-white flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-600/20 cursor-pointer"
              id="services-register-cta-top"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Anunciar Serviço</span>
            </button>

            <button 
              onClick={() => navigate('/servicos/solicitacoes')}
              className="p-2 hover:bg-stone-100 rounded-full transition-all text-stone-700 relative focus:outline-none flex items-center gap-1 cursor-pointer"
              id="services-dashboard-btn"
              title="Painel de Desempenho e Meus Anúncios"
            >
              <BarChart3 className="w-5.5 h-5.5 text-stone-700" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Info Banner & Region Identifier */}
        <div 
          className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-stone-800"
          id="services-distance-banner"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 rounded-xl">
              <MapPin className="w-5 h-5 text-emerald-600 shrink-0 fill-emerald-600/10" />
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-tight text-stone-900">
                Região Atendida: <span className="text-emerald-700 underline decoration-2">{currentCidadeNome}</span>
              </span>
              <p className="text-xs text-stone-600 font-medium mt-0.5">
                Prestadores de serviços, profissionais e autônomos prontos para lhe atender
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => navigate('/servicos/solicitacoes')}
              className="text-xs font-black text-emerald-800 hover:text-emerald-900 bg-emerald-100/80 hover:bg-emerald-200 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Meu Painel de Anúncios</span>
            </button>
            <span className="text-xs font-black tracking-wider uppercase bg-emerald-600 text-white px-3.5 py-1.5 rounded-lg shrink-0 shadow-xs">
              {filteredServices.length} {filteredServices.length === 1 ? 'Anúncio' : 'Anúncios'}
            </span>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="mb-6 space-y-3">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-stone-400 absolute left-4 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por serviço, profissão (ex: pedreiro, chaveiro, pintor, babá)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-stone-200 rounded-2xl text-sm font-medium text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 p-1 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100"
                title="Limpar busca"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Attendance mode filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
            <span className="text-stone-400 font-bold text-[11px] uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Atendimento:
            </span>
            <button
              onClick={() => setSelectedAttendanceMode('todos')}
              className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 cursor-pointer ${
                selectedAttendanceMode === 'todos' 
                  ? 'bg-stone-800 text-white' 
                  : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedAttendanceMode('domicilio')}
              className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 cursor-pointer ${
                selectedAttendanceMode === 'domicilio' 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              🏠 A Domicílio
            </button>
            <button
              onClick={() => setSelectedAttendanceMode('local')}
              className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 cursor-pointer ${
                selectedAttendanceMode === 'local' 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              🏢 No Local / Estabelecimento
            </button>
            <button
              onClick={() => setSelectedAttendanceMode('online')}
              className={`px-3 py-1.5 rounded-full font-bold transition-all shrink-0 cursor-pointer ${
                selectedAttendanceMode === 'online' 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'
              }`}
            >
              💻 Online / Remoto
            </button>
          </div>
        </div>

        {/* Dynamic Categories Section */}
        <section id="services-categories-section" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-stone-800 uppercase tracking-wider flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-emerald-600" />
              Categorias Disponíveis
            </h2>
            <span className="text-xs text-stone-400 font-bold">
              {activeCategories.length} {activeCategories.length === 1 ? 'categoria com serviço' : 'categorias com serviços'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-stone-200 snap-x">
            
            {/* 'Todos' category button */}
            <button
              onClick={() => setSelectedCategory('todos')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border shrink-0 snap-center transition-all duration-200 select-none cursor-pointer focus:outline-none ${
                selectedCategory === 'todos' 
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                  : 'bg-white border-stone-200 hover:border-stone-300 text-stone-700'
              }`}
              id="cat-button-todos"
            >
              <LayoutGrid className={`w-4 h-4 ${selectedCategory === 'todos' ? 'text-white' : 'text-emerald-600'}`} />
              <span className="text-xs font-extrabold whitespace-nowrap">
                Todos
              </span>
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                selectedCategory === 'todos' ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
              }`}>
                {activeServices.length}
              </span>
            </button>

            {/* Render ONLY categories that have active services */}
            {activeCategories.map((cat) => {
              const IconComp = cat.icon;
              const isSelected = selectedCategory === cat.id;
              const count = categoryCounts[cat.id] || 0;

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border shrink-0 snap-center transition-all duration-200 select-none cursor-pointer focus:outline-none ${
                    isSelected 
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                      : 'bg-white border-stone-200 hover:border-stone-300 text-stone-700'
                  }`}
                  id={`cat-button-${cat.id}`}
                >
                  <IconComp className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-stone-500'}`} />
                  <span className="text-xs font-extrabold whitespace-nowrap">
                    {cat.name}
                  </span>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}

          </div>
        </section>

        {/* Services Listings / Empty States */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mb-4"></div>
            <p className="text-sm font-semibold">Carregando profissionais e prestadores...</p>
          </div>
        ) : filteredServices.length === 0 ? (
          <section 
            className="bg-white border border-stone-200/80 rounded-3xl flex flex-col items-center justify-center p-12 text-center shadow-xs"
            id="services-empty-state"
          >
            <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mb-4 border border-emerald-100">
              <Briefcase className="w-8 h-8" strokeWidth={1.5} />
            </div>
            
            <h3 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
              Nenhum prestador encontrado
            </h3>
            <p className="text-xs sm:text-sm text-stone-500 mt-1.5 max-w-md font-medium leading-relaxed">
              Não encontramos nenhum serviço ativo nesta categoria ou termo pesquisado. Deseja oferecer seus serviços nesta região?
            </p>
            <button
              onClick={handleOpenRegistration}
              className="mt-6 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-xs rounded-full text-white flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              Cadastrar meu Serviço Gratuitamente
            </button>
          </section>
        ) : (
          <div className="space-y-8">
            
            {/* Primary city listings */}
            {cityMatchedServices.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Prestadores em {currentCidadeNome} ({cityMatchedServices.length})
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {cityMatchedServices.map((serv) => (
                    <ServiceCard 
                      key={serv.id} 
                      serv={serv} 
                      user={user} 
                      profile={profile} 
                      onEdit={handleOpenEditModal}
                      onTogglePause={handleTogglePauseService}
                      onDelete={handleOpenDeleteModal} 
                      onWhatsAppClick={handleWhatsAppClick} 
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Other cities in state listings */}
            {otherCitiesServices.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-stone-200">
                <h3 className="text-xs font-black text-stone-400 uppercase tracking-widest flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-stone-400" />
                  Outras Cidades no Seu Estado ({otherCitiesServices.length})
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {otherCitiesServices.map((serv) => (
                    <ServiceCard 
                      key={serv.id} 
                      serv={serv} 
                      user={user} 
                      profile={profile} 
                      onEdit={handleOpenEditModal}
                      onTogglePause={handleTogglePauseService}
                      onDelete={handleOpenDeleteModal} 
                      onWhatsAppClick={handleWhatsAppClick} 
                    />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      {/* MODAL DIALOG: Registration / Edit Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-5 sm:p-7 shadow-2xl relative border border-stone-100 max-h-[92vh] overflow-y-auto">
            
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-all focus:outline-none cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Title */}
            <div className="mb-5 pr-8">
              <h2 className="text-xl font-extrabold text-stone-900 flex items-center gap-2 tracking-tight">
                <Briefcase className="w-6 h-6 text-emerald-600" />
                {editingService ? 'Editar Anúncio de Serviço' : 'Anunciar Seu Serviço Gratuitamente'}
              </h2>
              <p className="text-xs text-stone-500 font-medium mt-1 leading-relaxed">
                {editingService 
                  ? 'Atualize os dados e configurações do seu anúncio visível na plataforma.' 
                  : 'Divulgue suas habilidades profissionais e seja encontrado por clientes da sua região.'}
              </p>
            </div>

            {/* Error notifications */}
            {error && (
              <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-center gap-2">
                <X className="w-4 h-4 text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success notifications */}
            {successMessage && (
              <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-bounce">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSaveService} className="space-y-4">
              
              {/* Field: Provider Name / Business Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-stone-400" />
                  Nome do Prestador ou Empresa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Carlos Silva ou CS Reformas & Construções"
                  value={regNome}
                  onChange={(e) => setRegNome(e.target.value)}
                  className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-stone-850 font-medium"
                />
              </div>

              {/* Status active/paused toggle in edit mode */}
              <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-extrabold text-stone-900 block">Status do Anúncio</span>
                  <span className="text-[11px] text-stone-500 font-medium">Anúncios pausados ficam ocultos para o público</span>
                </div>
                <button
                  type="button"
                  onClick={() => setRegAtivo(!regAtivo)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer ${
                    regAtivo 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {regAtivo ? <Check className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{regAtivo ? 'Ativo (Publicado)' : 'Pausado (Oculto)'}</span>
                </button>
              </div>

              {/* Grid 2 Fields: Category & Specific Service Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Field: Category */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                    <LayoutGrid className="w-3.5 h-3.5 text-stone-400" />
                    Categoria do Serviço <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={regCategoria}
                      onChange={(e) => setRegCategoria(e.target.value)}
                      className="w-full px-3.5 py-3 border border-stone-200 rounded-2xl text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-stone-850 appearance-none font-bold cursor-pointer"
                    >
                      {SERVICE_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Field: Specific Subtype / Specialization */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-stone-400" />
                    Especialidade / Tipo de Serviço <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={regSubcategoria}
                      onChange={(e) => setRegSubcategoria(e.target.value)}
                      className="w-full px-3.5 py-3 border border-stone-200 rounded-2xl text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-stone-850 appearance-none font-bold cursor-pointer"
                    >
                      {selectedRegCatDefinition.subtypes.map((sub, idx) => (
                        <option key={idx} value={sub}>
                          {sub}
                        </option>
                      ))}
                      <option value="Outro serviço não listado">Outro serviço não listado</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

              </div>

              {/* Conditional custom service subtype input */}
              {regSubcategoria === 'Outro serviço não listado' && (
                <div className="space-y-1.5 bg-amber-50/60 p-3.5 border border-amber-200/80 rounded-2xl">
                  <label className="text-xs font-extrabold text-amber-900 flex items-center gap-1">
                    <Type className="w-3.5 h-3.5 text-amber-600" />
                    Nome do Serviço Personalizado <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Especifique exatamente o serviço que você realiza..."
                    value={regSubcategoriaOutro}
                    onChange={(e) => setRegSubcategoriaOutro(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-amber-200 bg-white rounded-xl text-xs font-medium text-stone-850 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Regulated category professional registration badge field */}
              {selectedRegCatDefinition.isRegulated && (
                <div className="space-y-1.5 bg-emerald-50/60 p-3.5 border border-emerald-200/80 rounded-2xl">
                  <label className="text-xs font-extrabold text-emerald-900 flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    {selectedRegCatDefinition.regulatedLabel || 'Registro Profissional / Conselho (Opcional)'}
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: OAB-CE 12345, COREN-CE 98765, CRM 4321..."
                    value={regRegistroProfissional}
                    onChange={(e) => setRegRegistroProfissional(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-emerald-200 bg-white rounded-xl text-xs font-medium text-stone-850 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {/* Field: Title of service listing */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <Type className="w-3.5 h-3.5 text-stone-400" />
                  Título do Anúncio <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Serviços de Pedreiro e Pintura Residencial em Geral"
                  value={regTitulo}
                  onChange={(e) => setRegTitulo(e.target.value)}
                  className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-stone-850 font-medium"
                />
              </div>

              {/* Field: Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-stone-400" />
                  Descrição Detalhada dos Serviços <span className="text-red-500">*</span>
                </label>
                <textarea
                  placeholder="Descreva sua experiência, serviços realizados, diferenciais de atendimento, garantia, horários de funcionamento..."
                  rows={4}
                  value={regDescricao}
                  onChange={(e) => setRegDescricao(e.target.value)}
                  maxLength={1000}
                  className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-stone-850 font-medium resize-none"
                />
                <span className="text-[10px] text-stone-400 font-medium block text-right">{regDescricao.length}/1000 caracteres</span>
              </div>

              {/* Grid 2 Fields: WhatsApp & Logo URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Field: WhatsApp */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-stone-400" />
                    WhatsApp com DDD <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="Ex: (88) 99999-9999"
                    value={regTelefone}
                    onChange={(e) => setRegTelefone(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-stone-850 font-medium"
                  />
                </div>

                {/* Field: Google Drive Logo URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-800 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Link da Foto / Logomarca (Drive - Opcional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://drive.google.com/file/d/..."
                    value={regLogoUrl}
                    onChange={(e) => setRegLogoUrl(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-stone-850 font-medium"
                  />
                </div>

              </div>

              {/* Formas de Atendimento & Formas de Pagamento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-2xl border border-stone-200/70">
                
                {/* Attendance modes checkboxes */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-stone-800 tracking-tight block">
                    Forma de Atendimento
                  </label>
                  <div className="space-y-1.5 text-xs font-bold text-stone-700">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={regFormaAtendimento.includes('domicilio')}
                        onChange={() => toggleArrayItem(regFormaAtendimento, 'domicilio', setRegFormaAtendimento)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>🏠 Atendimento a Domicílio</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={regFormaAtendimento.includes('local')}
                        onChange={() => toggleArrayItem(regFormaAtendimento, 'local', setRegFormaAtendimento)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>🏢 Atendimento no Local / Loja</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={regFormaAtendimento.includes('online')}
                        onChange={() => toggleArrayItem(regFormaAtendimento, 'online', setRegFormaAtendimento)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>💻 Atendimento Online / Remoto</span>
                    </label>
                  </div>
                </div>

                {/* Payment Options */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-stone-800 tracking-tight block">
                    Formas de Pagamento Aceitas
                  </label>
                  <div className="space-y-1.5 text-xs font-bold text-stone-700">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={regFormasPagamento.includes('pix')}
                        onChange={() => toggleArrayItem(regFormasPagamento, 'pix', setRegFormasPagamento)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>Pix</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={regFormasPagamento.includes('dinheiro')}
                        onChange={() => toggleArrayItem(regFormasPagamento, 'dinheiro', setRegFormasPagamento)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>Dinheiro</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={regFormasPagamento.includes('cartao')}
                        onChange={() => toggleArrayItem(regFormasPagamento, 'cartao', setRegFormasPagamento)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                      />
                      <span>Cartão de Crédito / Débito</span>
                    </label>
                  </div>
                </div>

              </div>

              {/* Pricing Model */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/70 space-y-3">
                <label className="text-xs font-black text-stone-800 tracking-tight block">
                  Modelo de Orçamento / Preço
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-bold">
                  <label className={`p-2.5 border rounded-xl flex items-center gap-2 cursor-pointer transition-all ${
                    regModeloPreco === 'orcamento' ? 'bg-emerald-50 border-emerald-500 text-emerald-900' : 'bg-white border-stone-200 text-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="modeloPreco"
                      value="orcamento"
                      checked={regModeloPreco === 'orcamento'}
                      onChange={(e) => setRegModeloPreco(e.target.value)}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Sob Orçamento</span>
                  </label>

                  <label className={`p-2.5 border rounded-xl flex items-center gap-2 cursor-pointer transition-all ${
                    regModeloPreco === 'a_partir' ? 'bg-emerald-50 border-emerald-500 text-emerald-900' : 'bg-white border-stone-200 text-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="modeloPreco"
                      value="a_partir"
                      checked={regModeloPreco === 'a_partir'}
                      onChange={(e) => setRegModeloPreco(e.target.value)}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>A partir de R$</span>
                  </label>

                  <label className={`p-2.5 border rounded-xl flex items-center gap-2 cursor-pointer transition-all ${
                    regModeloPreco === 'gratuito' ? 'bg-emerald-50 border-emerald-500 text-emerald-900' : 'bg-white border-stone-200 text-stone-700'
                  }`}>
                    <input
                      type="radio"
                      name="modeloPreco"
                      value="gratuito"
                      checked={regModeloPreco === 'gratuito'}
                      onChange={(e) => setRegModeloPreco(e.target.value)}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Orçamento Grátis</span>
                  </label>
                </div>

                {regModeloPreco === 'a_partir' && (
                  <div className="pt-2">
                    <label className="text-[11px] font-extrabold text-stone-700 block mb-1">
                      Valor Inicial Estimado (R$)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 50,00"
                      value={regValorInicial}
                      onChange={(e) => setRegValorInicial(e.target.value)}
                      className="w-full max-w-xs px-3.5 py-2 border border-stone-200 bg-white rounded-xl text-xs font-bold text-stone-850"
                    />
                  </div>
                )}
              </div>

              {/* Geographic location selectors */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/70 space-y-3">
                <span className="text-xs font-black text-stone-800 tracking-tight block">
                  Localização e Área de Cobertura
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-stone-600">Estado *</label>
                    <div className="relative">
                      <select
                        value={regEstadoId}
                        onChange={(e) => setRegEstadoId(e.target.value)}
                        className="w-full px-3 py-2.5 border border-stone-200 bg-white rounded-xl text-xs font-bold text-stone-850 appearance-none cursor-pointer"
                      >
                        <option value="">Selecione o Estado</option>
                        {allEstados.map((est) => (
                          <option key={est.id} value={est.id}>{est.nome} ({est.sigla})</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-stone-600">Cidade *</label>
                    <div className="relative">
                      <select
                        value={regCidadeId}
                        onChange={(e) => setRegCidadeId(e.target.value)}
                        disabled={!regEstadoId}
                        className="w-full px-3 py-2.5 border border-stone-200 bg-white rounded-xl text-xs font-bold text-stone-850 appearance-none disabled:bg-stone-100 disabled:opacity-60 cursor-pointer"
                      >
                        <option value="">Selecione a Cidade</option>
                        {filteredCities.map((cid) => (
                          <option key={cid.id} value={cid.id}>{cid.nome}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-extrabold text-stone-600">Bairro / Área de Cobertura (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Centro, Aldeota, Atende toda a cidade e região circunvizinha..."
                    value={regBairro}
                    onChange={(e) => setRegBairro(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-stone-200 bg-white rounded-xl text-xs text-stone-850 font-medium"
                  />
                </div>
              </div>

              {/* Form submit actions */}
              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={regLoading}
                  className="px-5 py-2.5 text-xs font-extrabold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-2xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={regLoading}
                  className="px-6 py-2.5 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                >
                  {regLoading ? 'Salvando...' : editingService ? 'Atualizar Anúncio' : 'Publicar Anúncio'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Structured Delete Confirmation / Permission Modal */}
      <DeleteServiceModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        service={deleteModalService}
        isAdmin={Boolean(user) && (profile?.role === 'admin' || profile?.tipo_usuario === 'admin' || user?.email === 'felipeacompanhamento@gmail.com')}
        onConfirmDelete={handleConfirmDeleteService}
        onPauseService={handlePauseServiceFromModal}
      />

    </div>
  );
}

// Service Card Component with public interest indicator & management options
interface ServiceCardProps {
  serv: PrestadorServico;
  user: any;
  profile: any;
  onEdit: (serv: PrestadorServico) => void;
  onTogglePause: (serv: PrestadorServico) => void;
  onDelete: (serv: PrestadorServico) => void;
  onWhatsAppClick: (serv: PrestadorServico) => void;
}

function ServiceCard({ serv, user, profile, onEdit, onTogglePause, onDelete, onWhatsAppClick }: ServiceCardProps) {
  const isAdmin = Boolean(user) && (profile?.role === 'admin' || profile?.tipo_usuario === 'admin' || user?.email === 'felipeacompanhamento@gmail.com');
  const isOwnerOrAdmin = Boolean(user) && (user.uid === serv.userId || !serv.userId || isAdmin);
  const catColor = getCategoryColorById(serv.categoria);
  const catName = getCategoryNameById(serv.categoria);
  const isPaused = serv.ativo === false;

  // Format public interest indicator phrase
  const totalInterests = serv.totalWhatsappClicks || 0;
  const interestText = totalInterests === 0 
    ? 'Novo anúncio' 
    : totalInterests === 1 
      ? '1 contato recebido' 
      : `${totalInterests} contatos recebidos`;

  return (
    <div className={`bg-white rounded-2xl border transition-all overflow-hidden flex flex-col justify-between relative ${
      isPaused 
        ? 'border-amber-300 bg-amber-50/20 opacity-85' 
        : 'border-stone-200/80 shadow-xs hover:shadow-md'
    }`}>
      
      {/* Paused Banner indicator for owner */}
      {isPaused && (
        <div className="bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider py-1 px-3 text-center flex items-center justify-center gap-1">
          <Pause className="w-3 h-3" />
          Anúncio Pausado (Oculto para o público)
        </div>
      )}

      <div className="p-4.5 space-y-3">
        
        {/* Card Header Tag Row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className={`px-2.5 py-0.5 text-[10px] font-black tracking-wider uppercase rounded-full border ${catColor}`}>
            {catName}
          </span>
          
          {/* Discrete public interest indicator badge */}
          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>{interestText}</span>
          </div>
        </div>

        {/* Owner indicator badge */}
        {isOwnerOrAdmin && (
          <div className="flex items-center justify-between bg-stone-100/90 border border-stone-200 px-2.5 py-1 rounded-xl text-[10px] font-extrabold text-stone-700">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 text-stone-500" />
              Seu Anúncio
            </span>
            
            {/* Quick action controls for owner/admin */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onEdit(serv)}
                className="text-stone-600 hover:text-emerald-600 p-1 hover:bg-white rounded-md transition-colors cursor-pointer flex items-center gap-0.5"
                title="Editar anúncio"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>

              <button
                onClick={() => onTogglePause(serv)}
                className={`p-1 hover:bg-white rounded-md transition-colors cursor-pointer flex items-center gap-0.5 ${
                  isPaused ? 'text-emerald-700 hover:text-emerald-800 font-black' : 'text-amber-700 hover:text-amber-800'
                }`}
                title={isPaused ? "Reativar anúncio" : "Pausar anúncio"}
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{isPaused ? 'Reativar' : 'Pausar'}</span>
              </button>

              {/* Delete button for service owner or system administrator */}
              {isOwnerOrAdmin && (
                <button
                  onClick={() => onDelete(serv)}
                  className="text-stone-400 hover:text-red-600 p-1 hover:bg-white rounded-md transition-colors cursor-pointer"
                  title={isAdmin ? "Excluir anúncio (Administrador)" : "Excluir anúncio"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Subcategory tag if exists */}
        {(serv.subcategoria || serv.subcategoriaOutro) && (
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 text-[10px] font-bold bg-stone-100 text-stone-700 rounded-md border border-stone-200/60 line-clamp-1">
              {serv.subcategoria === 'Outro serviço não listado' && serv.subcategoriaOutro ? serv.subcategoriaOutro : serv.subcategoria}
            </span>
          </div>
        )}

        {/* Provider Name and Logo/Avatar */}
        <div className="flex items-start gap-3 pt-0.5">
          {serv.logoUrl ? (
            <img 
              src={convertDriveUrl(serv.logoUrl)} 
              alt={`Logo de ${serv.nome}`} 
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-stone-200/80 bg-white"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 shrink-0 border border-stone-200/80">
              <User className="w-6 h-6 text-stone-400" strokeWidth={1.5} />
            </div>
          )}
          <div className="space-y-0.5 min-w-0 flex-1">
            <h4 className="text-sm font-extrabold text-stone-900 tracking-tight leading-tight line-clamp-2" title={serv.titulo}>
              {serv.titulo}
            </h4>
            <p className="text-xs text-stone-600 font-extrabold truncate">
              {serv.nome}
            </p>
          </div>
        </div>

        {/* Regulated Professional License badge if present */}
        {serv.registroProfissional && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-lg text-[10px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">{serv.registroProfissional}</span>
          </div>
        )}

        {/* Description */}
        <p className="text-xs text-stone-600 font-medium leading-relaxed line-clamp-3 min-h-[3.2rem]">
          {serv.descricao}
        </p>

        {/* Badges: Attendance mode & Pricing */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-extrabold">
          {serv.formaAtendimento && serv.formaAtendimento.includes('domicilio') && (
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded-md">
              🏠 A Domicílio
            </span>
          )}
          {serv.formaAtendimento && serv.formaAtendimento.includes('local') && (
            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-md">
              🏢 No Local
            </span>
          )}
          {serv.formaAtendimento && serv.formaAtendimento.includes('online') && (
            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-md">
              💻 Online
            </span>
          )}

          {serv.modeloPreco === 'gratuito' ? (
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md">
              Orçamento Grátis
            </span>
          ) : serv.modeloPreco === 'a_partir' && serv.valorInicial ? (
            <span className="px-2 py-0.5 bg-stone-100 text-stone-800 border border-stone-200 rounded-md">
              A partir de R$ {serv.valorInicial}
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-stone-100 text-stone-700 border border-stone-200 rounded-md">
              Sob Orçamento
            </span>
          )}
        </div>

      </div>

      {/* Card Footer */}
      <div className="border-t border-stone-100 p-3.5 bg-stone-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-bold">
          <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
          <span className="line-clamp-1">{serv.bairro ? `${serv.bairro}, ` : ''}{serv.cidade} - {serv.estado}</span>
        </div>
        
        <button
          onClick={() => onWhatsAppClick(serv)}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-xs font-extrabold text-white rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer focus:outline-none"
        >
          <MessageCircle className="w-4 h-4" />
          <span>Falar no WhatsApp</span>
        </button>
      </div>
    </div>
  );
}
