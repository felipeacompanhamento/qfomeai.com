import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  doc, 
  orderBy, 
  Timestamp 
} from 'firebase/firestore';
import { 
  ChevronLeft, 
  History, 
  MapPin, 
  LayoutGrid, 
  Users, 
  PawPrint, 
  Sparkles, 
  Key, 
  SearchX, 
  PlusCircle, 
  User, 
  Phone, 
  Type, 
  FileText, 
  Trash2, 
  MessageCircle, 
  X, 
  CheckCircle, 
  Briefcase,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';

interface Category {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
}

interface PrestadorServico {
  id: string;
  nome: string;
  telefone: string;
  categoria: string;
  titulo: string;
  descricao: string;
  cidade: string;
  cidade_id: string;
  estado: string;
  estado_id: string;
  bairro?: string;
  logoUrl?: string;
  userId: string;
  ativo: boolean;
  createdAt?: any;
}

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
  const { user, profile } = useAuth();

  // Selected state & city filters from localStorage or default empty
  const [currentEstadoId, setCurrentEstadoId] = useState<string>(() => localStorage.getItem('user_estado_id') || '');
  const [currentCidadeId, setCurrentCidadeId] = useState<string>(() => localStorage.getItem('user_cidade_id') || '');
  const [currentCidadeNome] = useState<string>(() => localStorage.getItem('user_cidade_nome') || 'Sua Região');

  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [services, setServices] = useState<PrestadorServico[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // States & Cities for location filter/selector inside service registration list
  const [allEstados, setAllEstados] = useState<StateDb[]>([]);
  const [allCidades, setAllCidades] = useState<CityDb[]>([]);
  const [filteredCities, setFilteredCities] = useState<CityDb[]>([]);

  // Registration Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [regNome, setRegNome] = useState<string>('');
  const [regTelefone, setRegTelefone] = useState<string>('');
  const [regTitulo, setRegTitulo] = useState<string>('');
  const [regCategoria, setRegCategoria] = useState<string>('acompanhante');
  const [regDescricao, setRegDescricao] = useState<string>('');
  const [regEstadoId, setRegEstadoId] = useState<string>('');
  const [regCidadeId, setRegCidadeId] = useState<string>('');
  const [regBairro, setRegBairro] = useState<string>('');
  const [regLogoUrl, setRegLogoUrl] = useState<string>('');
  const [regLoading, setRegLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const categories: Category[] = [
    { id: 'todos', name: 'Todos', icon: LayoutGrid },
    { id: 'acompanhante', name: 'Acompanhante de Idoso', icon: Users },
    { id: 'adestramento', name: 'Adestramento de Pets', icon: PawPrint },
    { id: 'buffet', name: 'Buffet e Eventos', icon: Sparkles },
    { id: 'chaveiro', name: 'Chaveiro', icon: Key },
  ];

  // Load all registered services
  const fetchServices = async () => {
    setLoading(true);
    setError(null);
    try {
      const qRef = collection(db, 'prestadores_servicos');
      const snap = await getDocs(qRef);
      const list: PrestadorServico[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        list.push({
          id: docSnap.id,
          ...data,
        } as PrestadorServico);
      });
      
      // Sort client-side by date-time
      list.sort((a, b) => {
        const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0;
        const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0;
        return dateB - dateA;
      });

      setServices(list);
    } catch (err: any) {
      console.error("Error fetching services: ", err);
      setError("Não foi possível carregar os prestadores de serviços.");
      handleFirestoreError(err, OperationType.LIST, 'prestadores_servicos');
    } finally {
      setLoading(false);
    }
  };

  // Load active States and Cities for registration
  useEffect(() => {
    const loadLocations = async () => {
      try {
        // Fetch states
        const stateSnap = await getDocs(query(collection(db, 'estados'), where('ativo', '==', true)));
        const stateList: StateDb[] = [];
        stateSnap.forEach((docSnap) => {
          const data = docSnap.data();
          stateList.push({
            id: docSnap.id,
            nome: data.nome,
            sigla: data.sigla,
          });
        });
        setAllEstados(stateList);

        // Fetch cities
        const citySnap = await getDocs(query(collection(db, 'cidades'), where('ativo', '==', true)));
        const cityList: CityDb[] = [];
        citySnap.forEach((docSnap) => {
          const data = docSnap.data();
          cityList.push({
            id: docSnap.id,
            nome: data.nome,
            estado_id: data.estado_id,
          });
        });
        setAllCidades(cityList);
      } catch (err) {
        console.error("Error loading states/cities: ", err);
        handleFirestoreError(err, OperationType.LIST, 'estados');
      }
    };
    loadLocations();
    fetchServices();
  }, []);

  // Filter cities based on selected registration State code
  useEffect(() => {
    if (regEstadoId) {
      const filtered = allCidades.filter(c => c.estado_id === regEstadoId);
      setFilteredCities(filtered);
      if (filtered.length > 0) {
        // Automatically default city if not matching current list
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

  // Handle open registration modal
  const handleOpenRegistration = () => {
    if (!user) {
      // Redirect to login if unauthorized
      navigate('/login');
      return;
    }

    // Attempt smart pre-fills
    setRegNome(profile?.nome || '');
    setRegTelefone(profile?.telefone || '');
    
    // Default location smart selectors
    setRegEstadoId(currentEstadoId);
    setRegCidadeId(currentCidadeId);
    setRegBairro('');
    setRegTitulo('');
    setRegDescricao('');
    setRegCategoria('acompanhante');
    setRegLogoUrl('');
    setSuccessMessage(null);
    setError(null);
    setIsModalOpen(true);
  };

  // Submitting the Service Provider form
  const handleRegisterService = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    setError(null);

    if (!user) {
      setError("É necessário estar autenticado para registrar um serviço.");
      setRegLoading(false);
      return;
    }

    if (!regNome.trim() || !regTelefone.trim() || !regTitulo.trim() || !regDescricao.trim() || !regEstadoId || !regCidadeId) {
      setError("Preencha todos os campos obrigatórios (*).");
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
        titulo: regTitulo.trim(),
        descricao: regDescricao.trim(),
        estado: stateObj?.nome || '',
        estado_id: regEstadoId,
        cidade: cityObj?.nome || '',
        cidade_id: regCidadeId,
        bairro: regBairro.trim() || '',
        logoUrl: regLogoUrl.trim(),
        userId: user.uid,
        ativo: true,
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, 'prestadores_servicos'), payload);
      setSuccessMessage("Seu serviço foi publicado com sucesso de forma visível a todos os usuários!");
      
      // Refresh list
      await fetchServices();
      
      // Auto close after 2 seconds
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMessage(null);
      }, 2500);

    } catch (err: any) {
      console.error("Error creating service: ", err);
      setError("Houve um problema ao salvar as informações do serviço.");
      handleFirestoreError(err, OperationType.CREATE, 'prestadores_servicos');
    } finally {
      setRegLoading(false);
    }
  };

  // Delete matching owned service provider listings
  const handleDeleteService = async (serviceId: string) => {
    if (!window.confirm("Deseja realmente remover as informações do seu serviço listado?")) return;
    try {
      await deleteDoc(doc(db, 'prestadores_servicos', serviceId));
      setServices(prev => prev.filter(s => s.id !== serviceId));
    } catch (err: any) {
      console.error("Error deleting service registration:", err);
      alert("Houve um erro para deletar o registro.");
      handleFirestoreError(err, OperationType.DELETE, `prestadores_servicos/${serviceId}`);
    }
  };

  // Client-side state + city + category match filters
  const filteredServices = services.filter((serv) => {
    // 1. Matches Category
    if (selectedCategory !== 'todos' && serv.categoria !== selectedCategory) {
      return false;
    }
    // 2. Matches local User state (always aligned for localized view, falls back optionally)
    if (currentEstadoId && serv.estado_id !== currentEstadoId) {
      return false;
    }
    return true;
  });

  // Services that explicitly match user's current city
  const cityMatchedServices = filteredServices.filter((serv) => {
    return !currentCidadeId || serv.cidade_id === currentCidadeId;
  });

  // Other cities service providers
  const otherCitiesServices = filteredServices.filter((serv) => {
    return currentCidadeId && serv.cidade_id !== currentCidadeId;
  });

  const getCategoryColor = (catId: string) => {
    switch (catId) {
      case 'acompanhante': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'adestramento': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'buffet': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'chaveiro': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-stone-100 text-stone-800 border-stone-200';
    }
  };

  const getCategoryName = (catId: string) => {
    const found = categories.find(c => c.id === catId);
    return found ? found.name : catId;
  };

  // Format WhatsApp Link
  const getWhatsAppLink = (phone: string, serviceTitle: string, providerName: string) => {
    const rawNumber = phone.replace(/\D/g, '');
    const numberToUse = rawNumber.startsWith('55') ? rawNumber : `55${rawNumber}`;
    const textMsg = encodeURIComponent(
      `Olá ${providerName}, vi o seu serviço anunciado no QFomeai ("${serviceTitle}") e gostaria de saber as informações básicas e valores.`
    );
    return `https://api.whatsapp.com/send?phone=${numberToUse}&text=${textMsg}`;
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-16 font-sans flex flex-col antialiased">
      {/* Fully responsive Top Navigation Bar */}
      <header className="bg-[#0b1b17] text-white select-none sticky top-0 z-40 shadow-sm border-b border-emerald-950/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className="p-2 hover:bg-emerald-950/60 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
              id="services-back-btn"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <h1 className="text-xl font-bold tracking-tight text-white font-sans" id="services-title">
              Serviços Locais
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Real CTAs for Providers to self register */}
            <button
              onClick={handleOpenRegistration}
              className="px-4 py-2 bg-[#ff5f36] hover:bg-[#ff724d] active:scale-95 text-xs sm:text-sm font-extrabold rounded-full text-white flex items-center gap-1.5 transition-all shadow-md shadow-[#ff5f36]/20"
              id="services-register-cta-top"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Anunciar Serviço</span>
            </button>

            <button 
              onClick={() => navigate('/servicos/solicitacoes')}
              className="p-2 hover:bg-emerald-950/60 rounded-full transition-all text-white relative focus:outline-none"
              id="services-history-btn"
              title="Solicitações"
            >
              <History className="w-5.5 h-5.5 text-white" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Stage, completely responsive using fluid grid limits */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Soft Pink/Cream Info Banner with responsive sizing changes */}
        <div 
          className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-stone-800"
          id="services-distance-banner"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100/50 rounded-xl">
              <MapPin className="w-5 h-5 text-[#ff5f36] shrink-0 fill-[#ff5f36]/10" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-stone-800">
                Região Atendida: <span className="text-[#ff5f36] underline decoration-2">{currentCidadeNome}</span>
              </span>
              <p className="text-xs text-stone-500 font-medium mt-0.5">
                Exibindo prestadores de serviços disponíveis próximo de você
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold tracking-wider uppercase bg-[#ff5f36]/10 text-[#ff5f36] px-3 py-1.5 rounded-lg shrink-0">
              {filteredServices.length} {filteredServices.length === 1 ? 'disponível' : 'disponíveis'}
            </span>
          </div>
        </div>

        {/* Responsive main layout with 100% full-width coverage */}
        <div className="space-y-6 mt-4">
          
          {/* Main Listings and Filters */}
          <div className="space-y-6">
            
            {/* Categories filters */}
            <section id="services-categories-section">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-stone-900 tracking-tight">
                  Filtrar por Categoria
                </h2>
              </div>

              {/* Horizontally dynamic scrollable row with fully adaptive custom selection sizing */}
              <div className="flex items-start gap-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-stone-200/80 snap-x">
                {categories.map((cat) => {
                  const IconComponent = cat.icon;
                  const isSelected = selectedCategory === cat.id;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border shrink-0 snap-center transition-all duration-300 select-none cursor-pointer focus:outline-none ${
                        isSelected 
                          ? 'bg-[#0b1b17] border-[#0b1b17] text-white shadow-md' 
                          : 'bg-white border-stone-200 hover:border-stone-300 text-stone-600'
                      }`}
                      id={`cat-button-${cat.id}`}
                    >
                      <IconComponent className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-stone-500'}`} />
                      <span className="text-xs sm:text-sm font-extrabold leading-none">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* List logic: Loading or Data renders */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-stone-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#ff5f36] mb-4"></div>
                <p className="text-sm font-semibold">Buscando profissionais cadastrados...</p>
              </div>
            ) : filteredServices.length === 0 ? (
              /* Empty state layout */
              <section 
                className="bg-white border border-stone-100 rounded-3xl flex flex-col items-center justify-center p-12 text-center shadow-sm"
                id="services-empty-state"
              >
                <div className="w-16 h-16 bg-stone-100 rounded-3xl flex items-center justify-center text-stone-300 mb-5 border border-stone-200/80">
                  <SearchX className="w-7 h-7 text-[#ff5f36]" strokeWidth={1.5} />
                </div>
                
                <h3 className="text-base sm:text-lg font-bold text-stone-800 tracking-tight">
                  Nenhum prestador encontrado
                </h3>
                <p className="text-xs sm:text-sm text-stone-400 mt-2 max-w-xs font-semibold leading-relaxed">
                  Não existem prestadores cadastrados para a categoria selecionada nesta região. Seja o primeiro anunciando acima!
                </p>
                <button
                  onClick={handleOpenRegistration}
                  className="mt-6 px-5 py-2.5 bg-[#ff5f36] hover:bg-[#ff724d] font-bold text-xs rounded-full text-white flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <PlusCircle className="w-4 h-4" />
                  Cadastrar meu Serviço
                </button>
              </section>
            ) : (
              <div className="space-y-8">
                
                {/* 1. Directly Matching current User City section */}
                {cityMatchedServices.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-extrabold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Prestadores em {currentCidadeNome}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {cityMatchedServices.map((serv) => (
                        <div 
                          key={serv.id} 
                          className="bg-white rounded-2xl border border-stone-200/80 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
                        >
                          <div className="p-5 space-y-3.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={`px-2.5 py-1 text-[10px] font-black tracking-wider uppercase rounded-full border ${getCategoryColor(serv.categoria)}`}>
                                {getCategoryName(serv.categoria)}
                              </span>
                              
                              {/* Display Delete Button if owned */}
                              {(user && (user.uid === serv.userId || profile?.role === 'admin')) && (
                                <button
                                  onClick={() => handleDeleteService(serv.id)}
                                  className="text-stone-400 hover:text-red-500 p-1.5 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                                  title="Remover seu cadastro"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            <div className="flex items-start gap-3">
                              {serv.logoUrl ? (
                                <img 
                                  src={convertDriveUrl(serv.logoUrl)} 
                                  alt={`Logo de ${serv.nome}`} 
                                  referrerPolicy="no-referrer"
                                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-stone-200/60 bg-white"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 shrink-0 border border-stone-150">
                                  <User className="w-6 h-6 text-stone-400" strokeWidth={1.5} />
                                </div>
                              )}
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <h4 className="text-sm font-extrabold text-stone-900 tracking-tight leading-tight line-clamp-2" title={serv.titulo}>
                                  {serv.titulo}
                                </h4>
                                <p className="text-xs text-stone-550 font-bold truncate">
                                  {serv.nome}
                                </p>
                              </div>
                            </div>

                            <p className="text-xs text-stone-600 font-medium leading-relaxed line-clamp-4 min-h-[4rem]">
                              {serv.descricao}
                            </p>
                          </div>

                          {/* Card Footer actions */}
                          <div className="border-t border-stone-100 p-4 bg-stone-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-bold">
                              <MapPin className="w-3.5 h-3.5 text-stone-400" />
                              <span className="line-clamp-1">{serv.bairro ? `${serv.bairro}, ` : ''}{serv.cidade} - {serv.estado}</span>
                            </div>
                            
                            <a
                              href={getWhatsAppLink(serv.telefone, serv.titulo, serv.nome)}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-xs font-extrabold text-white rounded-xl flex items-center justify-center gap-1.5 transition-all focus:outline-none"
                            >
                              <MessageCircle className="w-4 h-4" />
                              Falar
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Other adjacent towns section inside the State */}
                {otherCitiesServices.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-stone-200/50">
                    <h3 className="text-sm font-extrabold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-stone-400" />
                      Outras cidades em seu estado
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {otherCitiesServices.map((serv) => (
                        <div 
                          key={serv.id} 
                          className="bg-white rounded-2xl border border-stone-200/85 hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
                        >
                          <div className="p-5 space-y-3.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className={`px-2.5 py-1 text-[10px] font-black tracking-wider uppercase rounded-full border ${getCategoryColor(serv.categoria)}`}>
                                {getCategoryName(serv.categoria)}
                              </span>
                              
                              {/* Display Delete Button if owned */}
                              {(user && (user.uid === serv.userId || profile?.role === 'admin')) && (
                                <button
                                  onClick={() => handleDeleteService(serv.id)}
                                  className="text-stone-400 hover:text-red-500 p-1.5 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                                  title="Remover seu cadastro"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            <div className="flex items-start gap-3">
                              {serv.logoUrl ? (
                                <img 
                                  src={convertDriveUrl(serv.logoUrl)} 
                                  alt={`Logo de ${serv.nome}`} 
                                  referrerPolicy="no-referrer"
                                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-stone-200/60 bg-white"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 shrink-0 border border-stone-150">
                                  <User className="w-6 h-6 text-stone-400" strokeWidth={1.5} />
                                </div>
                              )}
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <h4 className="text-sm font-extrabold text-stone-900 tracking-tight leading-tight line-clamp-2" title={serv.titulo}>
                                  {serv.titulo}
                                </h4>
                                <p className="text-xs text-stone-550 font-bold truncate">
                                  {serv.nome}
                                </p>
                              </div>
                            </div>

                            <p className="text-xs text-stone-600 font-medium leading-relaxed line-clamp-4 min-h-[4rem]">
                              {serv.descricao}
                            </p>
                          </div>

                          {/* Card Footer actions */}
                          <div className="border-t border-stone-100 p-4 bg-stone-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-bold">
                              <MapPin className="w-3.5 h-3.5 text-stone-400" />
                              <span className="line-clamp-1">{serv.bairro ? `${serv.bairro}, ` : ''}{serv.cidade} - {serv.estado}</span>
                            </div>
                            
                            <a
                              href={getWhatsAppLink(serv.telefone, serv.titulo, serv.nome)}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-xs font-extrabold text-white rounded-xl flex items-center justify-center gap-1.5 transition-all focus:outline-none"
                            >
                              <MessageCircle className="w-4 h-4" />
                              Falar
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>

        </div>

      </main>

      {/* MODAL DIALOG: Self-service registration form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/65 flex items-center justify-center z-50 p-4 overflow-y-auto backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6.5 shadow-2xl relative border border-stone-100 max-h-[92vh] overflow-y-auto">
            
            {/* Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-all focus:outline-none"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title */}
            <div className="mb-4">
              <h2 className="text-xl font-extrabold text-stone-900 flex items-center gap-2">
                <Briefcase className="w-6 h-6 text-[#ff5f36]" />
                Cadastrar Seu Serviço
              </h2>
              <p className="text-xs text-stone-500 font-medium mt-1">
                Anuncie suas habilidades profissionais de forma direta aos clientes do seu estado.
              </p>
            </div>

            {/* Informational cards moved inside the modal (Trabalha por conta própria? & Informações Importantes) */}
            <div className="space-y-3.5 mb-5 select-none text-left">
              <div className="bg-[#0b1b17] text-white p-4.5 rounded-2xl border border-emerald-950 flex gap-3.5 items-start">
                <div className="w-9 h-9 bg-[#ff5f36]/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Briefcase className="w-4.5 h-4.5 text-[#ff5f36]" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    Trabalha por conta própria?
                  </h3>
                  <p className="text-[11px] text-emerald-250 mt-1 font-medium leading-relaxed">
                    Cadastre seus serviços gratuitamente para começar a receber pedidos e mensagens diretas via WhatsApp de centenas de clientes de {currentCidadeNome}!
                  </p>
                </div>
              </div>

              <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-100">
                <h4 className="text-[11px] font-black text-orange-950 uppercase tracking-wider mb-2">
                  Informações Importantes
                </h4>
                <ul className="space-y-1.5">
                  <li className="flex items-start gap-2 text-[11px] text-stone-700 font-medium leading-tight">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Conexão direta por WhatsApp sem tarifas ou intermediações adicionais.</span>
                  </li>
                  <li className="flex items-start gap-2 text-[11px] text-stone-700 font-medium leading-tight">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Os prestadores estão localizados na sua região geográfica.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Error notifications inside form dialog */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-2xl text-xs font-bold text-red-600">
                {error}
              </div>
            )}

            {/* Success notifications inside form dialog */}
            {successMessage && (
              <div className="mb-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-bounce">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleRegisterService} className="space-y-4">
              
              {/* Field: Provider Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-stone-400" />
                  Nome do Prestador / Empresa <span className="text-[#ff5f36]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nome que será exibido no anúncio"
                  value={regNome}
                  onChange={(e) => setRegNome(e.target.value)}
                  className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-stone-850 font-medium"
                />
              </div>

              {/* Field: Public Google Drive Logo URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#ff5f36]" />
                  Link Público da Logomarca (Google Drive - Opcional)
                </label>
                <input
                  type="url"
                  placeholder="Ex: https://drive.google.com/file/d/.../view"
                  value={regLogoUrl}
                  onChange={(e) => setRegLogoUrl(e.target.value)}
                  className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-stone-850 font-medium"
                />
                <p className="text-[10px] text-stone-400 leading-normal">
                  Insira o link público de compartilhamento da sua logomarca ou foto no Google Drive. Lembre-se de definir o acesso como <strong>"Qualquer pessoa com o link"</strong> no Drive.
                </p>
              </div>

              {/* Grid 2 Fields: WhatsApp & Category */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Field: WhatsApp */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-stone-400" />
                    WhatsApp do Profissional <span className="text-[#ff5f36]">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="Ex: (85) 99999-9999"
                    value={regTelefone}
                    onChange={(e) => setRegTelefone(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-stone-850 font-medium"
                  />
                  <p className="text-[10px] text-stone-400 font-medium">Insira o número completo com DDD.</p>
                </div>

                {/* Field: Category */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                    <LayoutGrid className="w-3.5 h-3.5 text-stone-400" />
                    Categoria do Serviço <span className="text-[#ff5f36]">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={regCategoria}
                      onChange={(e) => setRegCategoria(e.target.value)}
                      className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 text-stone-850 appearance-none font-bold"
                    >
                      <option value="acompanhante">Acompanhante de Idoso</option>
                      <option value="adestramento">Adestramento de Pets</option>
                      <option value="buffet">Buffet e Eventos</option>
                      <option value="chaveiro">Chaveiro</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-stone-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

              </div>

              {/* Field: Title of service */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                  <Type className="w-3.5 h-3.5 text-stone-400" />
                  Título Curto do Anúncio <span className="text-[#ff5f36]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Ofereço serviços de chaveiro residencial 24 horas no centro"
                  value={regTitulo}
                  onChange={(e) => setRegTitulo(e.target.value)}
                  className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-stone-850 font-medium"
                />
              </div>

              {/* Field: Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-stone-400" />
                  Descrição do Serviço / Diferenciais <span className="text-[#ff5f36]">*</span>
                </label>
                <textarea
                  placeholder="Descreva detalhadamente sua experiência, dias e horários de atendimento, preços médios e o que está incluso no atendimento..."
                  rows={4}
                  value={regDescricao}
                  onChange={(e) => setRegDescricao(e.target.value)}
                  maxLength={1000}
                  className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 text-stone-850 font-medium resize-none"
                />
                <span className="text-[10px] text-stone-400 font-medium block text-right">{regDescricao.length}/1000 caractores</span>
              </div>

              {/* Geo location select parameters with active fallbacks */}
              <div className="bg-stone-50 p-4.5 rounded-2xl border border-stone-100 space-y-3.5">
                <span className="text-xs font-black text-stone-800 tracking-tight block">
                  Área de Cobertura do Atendimento
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-stone-500">Estado *</label>
                    <div className="relative">
                      <select
                        value={regEstadoId}
                        onChange={(e) => setRegEstadoId(e.target.value)}
                        className="w-full px-3 py-2.5 border border-stone-200 bg-white rounded-xl text-xs font-bold text-stone-850 appearance-none"
                      >
                        <option value="">Selecione um Estado</option>
                        {allEstados.map((est) => (
                          <option key={est.id} value={est.id}>{est.nome} ({est.sigla})</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-1 border-stone-100">
                    <label className="text-[11px] font-bold text-stone-500">Cidade *</label>
                    <div className="relative">
                      <select
                        value={regCidadeId}
                        onChange={(e) => setRegCidadeId(e.target.value)}
                        disabled={!regEstadoId}
                        className="w-full px-3 py-2.5 border border-stone-200 bg-white rounded-xl text-xs font-bold text-stone-850 appearance-none disabled:bg-stone-100 disabled:opacity-60"
                      >
                        <option value="">Selecione uma Cidade</option>
                        {filteredCities.map((cid) => (
                          <option key={cid.id} value={cid.id}>{cid.nome}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-3 h-3 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-stone-500">Bairro / Região (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Aldeota, Centro, Atende toda a cidade..."
                    value={regBairro}
                    onChange={(e) => setRegBairro(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-stone-200 rounded-xl text-xs text-stone-850 font-medium"
                  />
                </div>
              </div>

              {/* Form buttons */}
              <div className="flex items-center justify-end gap-3.5 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={regLoading}
                  className="px-5 py-3 text-xs font-bold text-stone-500 bg-stone-100 hover:bg-stone-200/80 rounded-2xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={regLoading}
                  className="px-6 py-3 text-xs font-bold bg-[#ff5f36] hover:bg-[#ff724d] text-white rounded-2xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {regLoading ? 'Publicando...' : 'Publicar Anúncio'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
