import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  Timestamp 
} from 'firebase/firestore';
import { 
  ChevronLeft, 
  MapPin, 
  LayoutGrid, 
  Search, 
  SearchX, 
  PlusCircle, 
  User, 
  Phone, 
  FileText, 
  Trash2, 
  MessageCircle, 
  X, 
  CheckCircle, 
  Briefcase,
  Zap,
  Droplet,
  HardHat,
  Sparkles,
  Car,
  Wrench,
  Scissors,
  Shirt,
  Truck,
  Monitor,
  GraduationCap,
  Edit3,
  ChevronDown,
  Eye,
  Camera,
  Image as ImageIcon,
  Check,
  Power,
  ArrowUpDown,
  AlertCircle,
  Plus,
  Tag,
  Flag
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../firebase';

export interface CategoryItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
  aliases?: string[];
}

export interface PrestadorServico {
  id: string;
  nome: string;
  telefone: string;
  categoria: string;
  titulo: string;
  servicosOferecidos?: string[];
  descricao: string;
  cidade: string;
  cidade_id: string;
  estado: string;
  estado_id: string;
  bairro?: string;
  areaAtendimento?: string;
  logoUrl?: string;
  fotosTrabalho?: string[];
  userId: string;
  ativo: boolean;
  status?: 'ATIVO' | 'PAUSADO' | 'BLOQUEADO';
  createdAt?: any;
  updatedAt?: any;
}

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

// Structured and organized dynamic categories
const CATEGORIES: CategoryItem[] = [
  { 
    id: 'todos', 
    name: 'Todos', 
    icon: LayoutGrid, 
    badgeColor: 'bg-stone-100 text-stone-800 border-stone-200' 
  },
  { 
    id: 'construcao', 
    name: 'Construção e Reparos', 
    icon: HardHat, 
    badgeColor: 'bg-orange-50 text-orange-800 border-orange-200',
    aliases: ['construcao', 'pedreiro', 'pintor', 'obras', 'reformas', 'gesso', 'alvenaria']
  },
  { 
    id: 'eletrica', 
    name: 'Elétrica', 
    icon: Zap, 
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    aliases: ['eletrica', 'eletricista', 'instalacoes', 'padrao', 'fios', 'iluminacao']
  },
  { 
    id: 'hidraulica', 
    name: 'Hidráulica', 
    icon: Droplet, 
    badgeColor: 'bg-blue-50 text-blue-800 border-blue-200',
    aliases: ['hidraulica', 'encanador', 'vazamento', 'canos', 'desentupidora', 'caixa']
  },
  { 
    id: 'limpeza', 
    name: 'Limpeza', 
    icon: Sparkles, 
    badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    aliases: ['limpeza', 'diarista', 'faxina', 'passadeira', 'lavagem', 'higienizacao']
  },
  { 
    id: 'beleza', 
    name: 'Beleza', 
    icon: Scissors, 
    badgeColor: 'bg-pink-50 text-pink-800 border-pink-200',
    aliases: ['beleza', 'cabeleireiro', 'manicure', 'barbeiro', 'estetica', 'maquiagem', 'sobrancelha']
  },
  { 
    id: 'automotivo', 
    name: 'Automotivo', 
    icon: Car, 
    badgeColor: 'bg-red-50 text-red-800 border-red-200',
    aliases: ['automotivo', 'mecanico', 'oficina', 'lavajato', 'auto', 'guincho', 'pneu', 'borracharia']
  },
  { 
    id: 'informatica', 
    name: 'Informática e Tecnologia', 
    icon: Monitor, 
    badgeColor: 'bg-sky-50 text-sky-800 border-sky-200',
    aliases: ['informatica', 'tecnico', 'computador', 'celular', 'rede', 'ti', 'software', 'impressora']
  },
  { 
    id: 'fretes', 
    name: 'Fretes e Mudanças', 
    icon: Truck, 
    badgeColor: 'bg-teal-50 text-teal-800 border-teal-200',
    aliases: ['fretes', 'mudancas', 'carreto', 'transporte', 'entregas']
  },
  { 
    id: 'costura', 
    name: 'Costura e Reparos', 
    icon: Shirt, 
    badgeColor: 'bg-purple-50 text-purple-800 border-purple-200',
    aliases: ['costura', 'costureira', 'alfaiate', 'ajustes', 'roupas']
  },
  { 
    id: 'manutencao', 
    name: 'Manutenção', 
    icon: Wrench, 
    badgeColor: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    aliases: ['manutencao', 'montador', 'chaveiro', 'ar-condicionado', 'eletrodomesticos', 'marceneiro', 'serralheiro']
  },
  { 
    id: 'educacao', 
    name: 'Aulas e Educação', 
    icon: GraduationCap, 
    badgeColor: 'bg-violet-50 text-violet-800 border-violet-200',
    aliases: ['educacao', 'aulas', 'professor', 'reforco', 'idiomas', 'musica', 'treinamento']
  },
  { 
    id: 'outros', 
    name: 'Outros Serviços', 
    icon: Briefcase, 
    badgeColor: 'bg-stone-50 text-stone-700 border-stone-200',
    aliases: ['outros', 'pets', 'acompanhante', 'buffet', 'fotografia', 'eventos', 'geral']
  },
];

export const resolveCategoryId = (param?: string | null): string => {
  if (!param) return 'todos';
  const cleanParam = param.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!cleanParam || cleanParam === 'todos' || cleanParam === 'all') return 'todos';

  // 1. Direct match on category ID
  const directCat = CATEGORIES.find(c => c.id.toLowerCase() === cleanParam);
  if (directCat) return directCat.id;

  // 2. Direct match on category name
  const nameCat = CATEGORIES.find(c => c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === cleanParam);
  if (nameCat) return nameCat.id;

  // 3. Match against aliases
  const aliasCat = CATEGORIES.find(c => c.aliases?.some(a => a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') === cleanParam));
  if (aliasCat) return aliasCat.id;

  // 4. Partial / inclusion match on aliases or category names
  const partialCat = CATEGORIES.find(c => {
    const normName = c.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normName.includes(cleanParam) || cleanParam.includes(normName)) return true;
    return c.aliases?.some(a => {
      const normAlias = a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normAlias.includes(cleanParam) || cleanParam.includes(normAlias);
    });
  });
  if (partialCat) return partialCat.id;

  return 'todos';
};

const convertDriveUrl = (url?: string) => {
  if (!url) return '';
  const trimmed = url.trim();
  const match = trimmed.match(/(?:id=|\/d\/|folders\/)([a-zA-Z0-9_-]{25,})/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}=s800`;
  }
  return trimmed;
};

export default function Services() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile } = useAuth();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    const catParam = searchParams.get('categoria') || searchParams.get('category') || searchParams.get('cat');
    return resolveCategoryId(catParam);
  });
  const [activeTab, setActiveTab] = useState<'todos' | 'meus'>('todos');
  const [sortBy, setSortBy] = useState<'relevantes' | 'recentes'>('relevantes');

  // Keep category in sync with URL search params
  useEffect(() => {
    const catParam = searchParams.get('categoria') || searchParams.get('category') || searchParams.get('cat');
    const resolved = resolveCategoryId(catParam);
    setSelectedCategory(resolved);
  }, [searchParams]);

  // Handler to update category and search params simultaneously
  const handleCategorySelect = (catId: string) => {
    setSelectedCategory(catId);
    const newParams = new URLSearchParams(searchParams);
    if (catId === 'todos') {
      newParams.delete('categoria');
      newParams.delete('category');
      newParams.delete('cat');
    } else {
      newParams.set('categoria', catId);
      newParams.delete('category');
      newParams.delete('cat');
    }
    setSearchParams(newParams, { replace: true });
  };

  // Location Filter State
  const [filterCidadeId, setFilterCidadeId] = useState<string>(() => localStorage.getItem('user_cidade_id') || 'all');
  const [filterBairro, setFilterBairro] = useState<string>('');

  // Database Data
  const [services, setServices] = useState<PrestadorServico[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [allEstados, setAllEstados] = useState<StateDb[]>([]);
  const [allCidades, setAllCidades] = useState<CityDb[]>([]);
  const [filteredCities, setFilteredCities] = useState<CityDb[]>([]);

  // Profile View Modal State
  const [selectedProfile, setSelectedProfile] = useState<PrestadorServico | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);

  // Registration/Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [regNome, setRegNome] = useState<string>('');
  const [regTelefone, setRegTelefone] = useState<string>('');
  const [regCategoria, setRegCategoria] = useState<string>('eletrica');
  const [regTitulo, setRegTitulo] = useState<string>('');
  const [regServicosOferecidos, setRegServicosOferecidos] = useState<string[]>([]);
  const [novoServicoInput, setNovoServicoInput] = useState<string>('');
  const [regDescricao, setRegDescricao] = useState<string>('');
  const [regEstadoId, setRegEstadoId] = useState<string>('');
  const [regCidadeId, setRegCidadeId] = useState<string>('');
  const [regBairro, setRegBairro] = useState<string>('');
  const [regAreaAtendimento, setRegAreaAtendimento] = useState<string>('');
  const [regLogoUrl, setRegLogoUrl] = useState<string>('');
  const [regFotosTrabalho, setRegFotosTrabalho] = useState<string[]>([]);
  const [newFotoUrl, setNewFotoUrl] = useState<string>('');
  const [regLoading, setRegLoading] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<boolean>(false);
  // Delete Confirmation Modal State
  const [serviceToDelete, setServiceToDelete] = useState<PrestadorServico | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Report Service Ad Modal State
  const [reportingService, setReportingService] = useState<PrestadorServico | null>(null);
  const [reportMotivo, setReportMotivo] = useState<string>('Conteúdo impróprio');
  const [reportObs, setReportObs] = useState<string>('');
  const [submittingReport, setSubmittingReport] = useState<boolean>(false);
  const [reportSuccess, setReportSuccess] = useState<boolean>(false);

  // Load all registered services
  const fetchServices = async () => {
    setLoading(true);
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

      setServices(list);
    } catch (err: any) {
      console.error("Erro ao carregar serviços: ", err);
      handleFirestoreError(err, OperationType.LIST, 'prestadores_servicos');
    } finally {
      setLoading(false);
    }
  };

  // Load active States and Cities
  useEffect(() => {
    const loadLocations = async () => {
      try {
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
        // Sort alphabetically
        cityList.sort((a, b) => a.nome.localeCompare(b.nome));
        setAllCidades(cityList);
      } catch (err) {
        console.error("Erro ao carregar localizações: ", err);
      }
    };
    loadLocations();
    fetchServices();
  }, []);

  // Update city options when selected state in modal changes
  useEffect(() => {
    if (regEstadoId) {
      const filtered = allCidades.filter(c => c.estado_id === regEstadoId);
      setFilteredCities(filtered);
      if (filtered.length > 0 && !filtered.some(c => c.id === regCidadeId)) {
        setRegCidadeId(filtered[0].id);
      }
    } else {
      setFilteredCities([]);
      setRegCidadeId('');
    }
  }, [regEstadoId, allCidades]);

  // Open Create Service Modal
  const handleOpenCreateModal = () => {
    if (!user) {
      navigate('/login');
      return;
    }

    setEditingServiceId(null);
    setRegNome(profile?.nome || '');
    setRegTelefone(profile?.telefone || '');
    setRegCategoria('eletrica');
    setRegTitulo('');
    setRegServicosOferecidos([]);
    setNovoServicoInput('');
    setRegDescricao('');
    const userCity = allCidades.find(c => c.id === localStorage.getItem('user_cidade_id'));
    setRegEstadoId(userCity?.estado_id || (allEstados.length > 0 ? allEstados[0].id : ''));
    setRegCidadeId(userCity?.id || (allCidades.length > 0 ? allCidades[0].id : ''));
    setRegBairro('');
    setRegAreaAtendimento('');
    setRegLogoUrl('');
    setRegFotosTrabalho([]);
    setNewFotoUrl('');
    setSuccessMessage(null);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  // Open Edit Service Modal
  const handleOpenEditModal = (service: PrestadorServico) => {
    if (!user || (user.uid !== service.userId && profile?.role !== 'admin')) {
      return;
    }

    setEditingServiceId(service.id);
    setRegNome(service.nome || '');
    setRegTelefone(service.telefone || '');
    setRegCategoria(service.categoria || 'outros');
    setRegTitulo(service.titulo || '');
    setRegServicosOferecidos(service.servicosOferecidos || []);
    setNovoServicoInput('');
    setRegDescricao(service.descricao || '');
    setRegEstadoId(service.estado_id || '');
    setRegCidadeId(service.cidade_id || '');
    setRegBairro(service.bairro || '');
    setRegAreaAtendimento(service.areaAtendimento || '');
    setRegLogoUrl(service.logoUrl || '');
    setRegFotosTrabalho(service.fotosTrabalho || []);
    setNewFotoUrl('');
    setSuccessMessage(null);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  // Add a sub-service item to the short list
  const handleAddSubService = () => {
    const trimmed = novoServicoInput.trim();
    if (!trimmed) return;
    if (regServicosOferecidos.includes(trimmed)) {
      setNovoServicoInput('');
      return;
    }
    if (regServicosOferecidos.length >= 10) {
      alert("Você pode adicionar até 10 serviços na lista.");
      return;
    }
    setRegServicosOferecidos(prev => [...prev, trimmed]);
    setNovoServicoInput('');
  };

  // Remove a sub-service item
  const handleRemoveSubService = (index: number) => {
    setRegServicosOferecidos(prev => prev.filter((_, i) => i !== index));
  };

  // Add work photo URL to list
  const handleAddWorkPhoto = () => {
    if (!newFotoUrl.trim()) return;
    if (regFotosTrabalho.length >= 6) {
      alert("Você pode adicionar no máximo 6 fotos de trabalhos.");
      return;
    }
    setRegFotosTrabalho(prev => [...prev, newFotoUrl.trim()]);
    setNewFotoUrl('');
  };

  // Remove work photo URL from list
  const handleRemoveWorkPhoto = (index: number) => {
    setRegFotosTrabalho(prev => prev.filter((_, i) => i !== index));
  };

  // Toggle Active/Inactive state
  const handleToggleActive = async (service: PrestadorServico, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user || (user.uid !== service.userId && profile?.role !== 'admin')) return;

    if (service.status === 'BLOQUEADO') {
      alert("Esta publicação foi bloqueada pela administração e não pode ser ativada por você.");
      return;
    }

    setTogglingId(service.id);
    try {
      const docRef = doc(db, 'prestadores_servicos', service.id);
      const isCurrentlyActive = service.status === 'ATIVO' || (service.status === undefined && service.ativo);
      const nextStatus = isCurrentlyActive ? 'PAUSADO' : 'ATIVO';
      const nextAtivo = !isCurrentlyActive;

      await updateDoc(docRef, { 
        status: nextStatus,
        ativo: nextAtivo,
        updatedAt: Timestamp.now()
      });

      setServices(prev => prev.map(s => s.id === service.id ? { ...s, status: nextStatus, ativo: nextAtivo } : s));
      if (selectedProfile?.id === service.id) {
        setSelectedProfile(prev => prev ? { ...prev, status: nextStatus, ativo: nextAtivo } : null);
      }
    } catch (err: any) {
      console.error("Erro ao alterar status do serviço:", err);
      handleFirestoreError(err, OperationType.UPDATE, `prestadores_servicos/${service.id}`);
    } finally {
      setTogglingId(null);
    }
  };

  // Open Delete Confirmation Modal
  const handleRequestDelete = (service: PrestadorServico, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user || (user.uid !== service.userId && profile?.role !== 'admin')) return;
    setServiceToDelete(service);
  };

  // Execute Confirmed Delete
  const handleConfirmDelete = async () => {
    if (!serviceToDelete) return;
    if (!user || (user.uid !== serviceToDelete.userId && profile?.role !== 'admin')) {
      setServiceToDelete(null);
      return;
    }

    setDeleteLoading(true);
    try {
      await deleteDoc(doc(db, 'prestadores_servicos', serviceToDelete.id));
      setServices(prev => prev.filter(s => s.id !== serviceToDelete.id));
      if (selectedProfile?.id === serviceToDelete.id) {
        setSelectedProfile(null);
      }
      setServiceToDelete(null);
    } catch (err: any) {
      console.error("Erro ao excluir serviço:", err);
      alert("Houve um erro ao excluir a publicação.");
      handleFirestoreError(err, OperationType.DELETE, `prestadores_servicos/${serviceToDelete.id}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Submit Report for a Service Ad
  const handleSendServiceReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingService) return;

    setSubmittingReport(true);
    try {
      await addDoc(collection(db, 'reports'), {
        type: 'servico',
        servicoId: reportingService.id,
        servicoTitulo: reportingService.titulo || '',
        servicoNome: reportingService.nome || '',
        providerUserId: reportingService.userId || '',
        reporterId: user?.uid || 'anonimo',
        motivo: reportMotivo,
        observacao: reportObs.trim().substring(0, 200),
        message: `[Serviço] ${reportMotivo}${reportObs.trim() ? `: ${reportObs.trim()}` : ''}`,
        status: 'pendente',
        createdAt: Timestamp.now()
      });
      setReportSuccess(true);
      setTimeout(() => {
        setReportingService(null);
        setReportSuccess(false);
      }, 1800);
    } catch (err: any) {
      console.error("Erro ao enviar denúncia:", err);
      alert("Houve um erro ao enviar a denúncia. Tente novamente.");
    } finally {
      setSubmittingReport(false);
    }
  };

  // Submit Create or Edit Form with standardized fields and validation
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLoading(true);
    setErrorMessage(null);

    if (!user) {
      setErrorMessage("É necessário estar conectado para cadastrar um serviço.");
      setRegLoading(false);
      return;
    }

    // Essential validations: Nome, Categoria, Serviço Principal (titulo), WhatsApp (telefone), Cidade
    if (!regNome.trim()) {
      setErrorMessage("Por favor, preencha o nome profissional ou da empresa.");
      setRegLoading(false);
      return;
    }
    if (regNome.trim().length > 60) {
      setErrorMessage("O nome profissional deve ter no máximo 60 caracteres.");
      setRegLoading(false);
      return;
    }
    if (!regCategoria) {
      setErrorMessage("Por favor, selecione uma categoria para o serviço.");
      setRegLoading(false);
      return;
    }
    if (!regTitulo.trim()) {
      setErrorMessage("Por favor, informe qual serviço você oferece.");
      setRegLoading(false);
      return;
    }
    if (regTitulo.trim().length > 80) {
      setErrorMessage("O título do serviço deve ter no máximo 80 caracteres.");
      setRegLoading(false);
      return;
    }
    if (!regTelefone.trim() || regTelefone.replace(/\D/g, '').length < 10) {
      setErrorMessage("Por favor, informe um WhatsApp válido com DDD (mínimo 10 dígitos).");
      setRegLoading(false);
      return;
    }
    if (regTelefone.trim().length > 20) {
      setErrorMessage("O telefone deve ter no máximo 20 caracteres.");
      setRegLoading(false);
      return;
    }
    if (!regCidadeId || !regEstadoId) {
      setErrorMessage("Por favor, selecione seu Estado e Cidade de atendimento.");
      setRegLoading(false);
      return;
    }
    if (regDescricao.trim().length > 1000) {
      setErrorMessage("A descrição deve ter no máximo 1000 caracteres.");
      setRegLoading(false);
      return;
    }

    try {
      const stateObj = allEstados.find(e => e.id === regEstadoId);
      const cityObj = allCidades.find(c => c.id === regCidadeId);

      const existingServ = editingServiceId ? services.find(s => s.id === editingServiceId) : null;
      // Safeguard: User cannot change owner userId
      const ownerUserId = existingServ ? existingServ.userId : user.uid;
      // Safeguard: If existing service is BLOQUEADO and user is not admin, keep BLOQUEADO
      const isBlocked = existingServ?.status === 'BLOQUEADO' && profile?.role !== 'admin';
      const targetStatus = isBlocked ? 'BLOQUEADO' : (existingServ?.status || 'ATIVO');
      const targetAtivo = isBlocked ? false : (targetStatus === 'ATIVO');

      const payload = {
        nome: regNome.trim().substring(0, 60),
        telefone: regTelefone.trim().substring(0, 20),
        categoria: regCategoria,
        titulo: regTitulo.trim().substring(0, 80),
        servicosOferecidos: regServicosOferecidos,
        descricao: regDescricao.trim().substring(0, 1000),
        estado: stateObj?.nome || '',
        estado_id: regEstadoId,
        cidade: cityObj?.nome || '',
        cidade_id: regCidadeId,
        bairro: regBairro.trim().substring(0, 100) || '',
        areaAtendimento: regAreaAtendimento.trim().substring(0, 100) || '',
        logoUrl: regLogoUrl.trim(),
        fotosTrabalho: regFotosTrabalho,
        userId: ownerUserId,
        status: targetStatus,
        ativo: targetAtivo,
        updatedAt: Timestamp.now()
      };

      if (editingServiceId) {
        // Update existing publication
        const docRef = doc(db, 'prestadores_servicos', editingServiceId);
        await updateDoc(docRef, payload);
        setSuccessMessage("Publicação atualizada com sucesso!");
      } else {
        // Create new publication
        await addDoc(collection(db, 'prestadores_servicos'), {
          ...payload,
          createdAt: Timestamp.now()
        });
        setSuccessMessage("Seu serviço foi publicado gratuitamente com sucesso!");
      }

      await fetchServices();

      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMessage(null);
      }, 1500);

    } catch (err: any) {
      console.error("Erro ao salvar serviço: ", err);
      setErrorMessage("Houve um problema ao salvar as informações. Tente novamente.");
      handleFirestoreError(err, editingServiceId ? OperationType.UPDATE : OperationType.CREATE, 'prestadores_servicos');
    } finally {
      setRegLoading(false);
    }
  };

  // WhatsApp link generator
  const getWhatsAppLink = (phone: string, serviceTitle: string, providerName: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const number = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const text = encodeURIComponent(
      `Olá ${providerName}! Vi seu serviço "${serviceTitle}" anunciado no QFomeAI e gostaria de solicitar um orçamento/informações.`
    );
    return `https://api.whatsapp.com/send?phone=${number}&text=${text}`;
  };

  // Copy phone helper
  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  // Helper for category details and alias mapping
  const getCategoryInfo = (catId: string) => {
    const normalized = (catId || '').toLowerCase().trim();
    // Direct match
    let found = CATEGORIES.find(c => c.id.toLowerCase() === normalized);
    if (!found) {
      // Alias match
      found = CATEGORIES.find(c => c.aliases?.includes(normalized));
    }
    return found || { id: catId, name: catId || 'Serviços', icon: Briefcase, badgeColor: 'bg-stone-100 text-stone-800 border-stone-200' };
  };

  // Checks if a service matches a selected category
  const checkCategoryMatch = (serviceCat: string, selectedCatId: string) => {
    if (selectedCatId === 'todos') return true;
    const normalized = (serviceCat || '').toLowerCase().trim();
    if (normalized === selectedCatId) return true;
    const targetCat = CATEGORIES.find(c => c.id === selectedCatId);
    if (targetCat?.aliases?.includes(normalized)) return true;
    return false;
  };

  // Helper to extract numeric timestamp
  const getServiceTimestamp = (s: PrestadorServico): number => {
    if (s.updatedAt?.seconds) return s.updatedAt.seconds * 1000;
    if (s.createdAt?.seconds) return s.createdAt.seconds * 1000;
    if (s.updatedAt?.toDate) return s.updatedAt.toDate().getTime();
    if (s.createdAt?.toDate) return s.createdAt.toDate().getTime();
    return 0;
  };

  // Helper to calculate relevance score according to priorities:
  // 1. Exact / strong match with search term
  // 2. Selected category match
  // 3. Same city match
  // 4. Same neighborhood / region match
  const calculateRelevanceScore = (s: PrestadorServico, query: string, targetCity: string, targetBairro: string): number => {
    let score = 0;
    const cleanQuery = query.toLowerCase().trim();
    const cleanBairro = targetBairro.toLowerCase().trim();

    // Priority 1: Exact / Strong match with searched service
    if (cleanQuery) {
      const title = (s.titulo || '').toLowerCase().trim();
      const name = (s.nome || '').toLowerCase().trim();
      const desc = (s.descricao || '').toLowerCase().trim();
      const subServices = (s.servicosOferecidos || []).map(item => item.toLowerCase().trim());
      const catInfo = getCategoryInfo(s.categoria);
      const catName = catInfo.name.toLowerCase().trim();

      // 1.1 Title matching
      if (title === cleanQuery) {
        score += 10000;
      } else if (title.startsWith(cleanQuery)) {
        score += 8000;
      } else if (title.includes(cleanQuery)) {
        score += 6000;
      }

      // 1.2 Sub-services matching
      if (subServices.some(item => item === cleanQuery)) {
        score += 7000;
      } else if (subServices.some(item => item.includes(cleanQuery) || cleanQuery.includes(item))) {
        score += 5000;
      }

      // 1.3 Professional Name matching
      if (name === cleanQuery) {
        score += 4000;
      } else if (name.includes(cleanQuery)) {
        score += 3000;
      }

      // 1.4 Category name matching search query
      if (catName === cleanQuery || s.categoria?.toLowerCase() === cleanQuery) {
        score += 2500;
      } else if (catName.includes(cleanQuery)) {
        score += 1500;
      }

      // 1.5 Description matching
      if (desc.includes(cleanQuery)) {
        score += 1000;
      }
    }

    // Priority 2: Selected Category match
    if (selectedCategory !== 'todos') {
      if (checkCategoryMatch(s.categoria, selectedCategory)) {
        score += 2000;
      }
    }

    // Priority 3: Same City match
    if (targetCity) {
      if (s.cidade_id && s.cidade_id === targetCity) {
        score += 1000;
      } else if (s.cidade && s.cidade.toLowerCase().includes(targetCity.toLowerCase())) {
        score += 800;
      }
    }

    // Priority 4: Same Neighborhood / Region match
    if (cleanBairro) {
      const bairro = (s.bairro || '').toLowerCase().trim();
      const area = (s.areaAtendimento || '').toLowerCase().trim();

      if (bairro === cleanBairro) {
        score += 500;
      } else if (bairro.includes(cleanBairro) || cleanBairro.includes(bairro)) {
        score += 400;
      } else if (area.includes(cleanBairro)) {
        score += 300;
      }
    } else if (s.bairro || s.areaAtendimento) {
      // Small bonus if professional provides neighborhood/area info
      score += 50;
    }

    return score;
  };

  // Count user's own listings
  const userServicesCount = useMemo(() => {
    if (!user) return 0;
    return services.filter(s => s.userId === user.uid).length;
  }, [services, user]);

  // Filtered and Sorted Services List
  const filteredServices = useMemo(() => {
    const userCityId = localStorage.getItem('user_cidade_id') || '';

    return services
      .filter(service => {
        const currentStatus = service.status || (service.ativo ? 'ATIVO' : 'PAUSADO');

        // 1. My Listings Tab Filter vs Public Tab Filter
        if (activeTab === 'meus') {
          if (!user || service.userId !== user.uid) return false;
        } else {
          // On public tab, hide inactive or blocked ones
          if (currentStatus !== 'ATIVO') {
            return false;
          }
        }

        // 2. Category Filter
        if (selectedCategory !== 'todos') {
          if (!checkCategoryMatch(service.categoria, selectedCategory)) {
            return false;
          }
        }

        // 3. Location Filter (City)
        if (filterCidadeId !== 'all') {
          if (service.cidade_id && service.cidade_id !== filterCidadeId) {
            return false;
          }
        }

        // 4. Location Filter (Neighborhood / Area)
        if (filterBairro.trim()) {
          const bairroQuery = filterBairro.toLowerCase().trim();
          const matchesBairro = service.bairro?.toLowerCase().includes(bairroQuery);
          const matchesArea = service.areaAtendimento?.toLowerCase().includes(bairroQuery);
          if (!matchesBairro && !matchesArea) {
            return false;
          }
        }

        // 5. Search Term (Title, Name, Category, Other Services list, Description, City, Neighborhood)
        if (searchTerm.trim()) {
          const queryTerm = searchTerm.toLowerCase().trim();
          const catInfo = getCategoryInfo(service.categoria);
          const catName = catInfo.name.toLowerCase();
          const catAliases = (catInfo.aliases || []).join(' ');

          const matchesTitle = service.titulo?.toLowerCase().includes(queryTerm);
          const matchesName = service.nome?.toLowerCase().includes(queryTerm);
          const matchesCategory = service.categoria?.toLowerCase().includes(queryTerm) || catName.includes(queryTerm) || catAliases.includes(queryTerm);
          const matchesDesc = service.descricao?.toLowerCase().includes(queryTerm);
          const matchesCity = service.cidade?.toLowerCase().includes(queryTerm);
          const matchesBairro = service.bairro?.toLowerCase().includes(queryTerm);
          const matchesArea = service.areaAtendimento?.toLowerCase().includes(queryTerm);
          const matchesSubServices = service.servicosOferecidos?.some(s => s.toLowerCase().includes(queryTerm));

          if (!matchesTitle && !matchesName && !matchesCategory && !matchesDesc && !matchesCity && !matchesBairro && !matchesArea && !matchesSubServices) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = getServiceTimestamp(a);
        const timeB = getServiceTimestamp(b);

        if (sortBy === 'recentes') {
          return timeB - timeA;
        }

        // Sort by 'relevantes': Prioritize exact search match -> selected category -> same city -> same neighborhood/region -> recency
        const targetCity = filterCidadeId !== 'all' ? filterCidadeId : userCityId;
        
        const scoreA = calculateRelevanceScore(a, searchTerm, targetCity, filterBairro);
        const scoreB = calculateRelevanceScore(b, searchTerm, targetCity, filterBairro);

        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }

        // Priority 5: Most recent publications
        return timeB - timeA;
      });
  }, [services, activeTab, selectedCategory, filterCidadeId, filterBairro, searchTerm, sortBy, user, profile]);

  return (
    <div className="min-h-screen bg-[#fbfbfb] text-stone-800 font-sans pb-24 flex flex-col antialiased">
      
      {/* Top Application Header */}
      <header className="bg-[#0b1b17] text-white sticky top-0 z-40 shadow-xs border-b border-emerald-950/40 select-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                if (activeTab === 'meus') {
                  setActiveTab('todos');
                } else {
                  navigate(-1);
                }
              }} 
              className="p-2 hover:bg-emerald-950/80 active:scale-95 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              id="services-back-btn"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-tight">
                {activeTab === 'meus' ? 'Meus Serviços' : 'Serviços Locais'}
              </h1>
              <p className="text-[11px] text-emerald-300/90 font-medium leading-none mt-0.5">
                {activeTab === 'meus' ? 'Gerencie seus anúncios publicados' : 'Canal direto e gratuito de profissionais'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* If user is authenticated and has own services, show discrete "Meus Serviços" button */}
            {user && userServicesCount > 0 && (
              <button
                onClick={() => setActiveTab(activeTab === 'meus' ? 'todos' : 'meus')}
                className={`px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'meus'
                    ? 'bg-emerald-800 text-emerald-100 border border-emerald-600 shadow-2xs'
                    : 'bg-emerald-950/70 hover:bg-emerald-900 text-emerald-200 border border-emerald-800/80'
                }`}
                id="services-meus-servicos-top-btn"
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Meus Serviços</span>
                <span className="px-1.5 py-0.2 bg-emerald-600 text-white rounded-full text-[10px] font-black">
                  {userServicesCount}
                </span>
              </button>
            )}

            {/* Action: Divulgar / Novo Serviço */}
            <button
              onClick={handleOpenCreateModal}
              className="px-3.5 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-xs sm:text-sm font-black rounded-full text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
              id="services-divulgar-btn-top"
            >
              <PlusCircle className="w-4 h-4" />
              {activeTab === 'meus' ? (
                <>
                  <span className="hidden xs:inline sm:inline">Novo Serviço</span>
                  <span className="xs:hidden sm:hidden">Novo</span>
                </>
              ) : (
                <>
                  <span className="hidden xs:inline sm:inline">
                    {user && userServicesCount > 0 ? 'Divulgar' : 'Divulgar Meu Serviço'}
                  </span>
                  <span className="xs:hidden sm:hidden">Divulgar</span>
                </>
              )}
            </button>
          </div>

        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6">

        {/* VIEW 1: MEUS SERVIÇOS (Tela simples e direta de gerenciamento) */}
        {activeTab === 'meus' ? (
          <section id="meus-servicos-view" className="space-y-6 animate-in fade-in duration-150">
            
            {/* Top Navigation & Status Bar for Meus Serviços */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-stone-200/70 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('todos')}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Explorar todos os serviços</span>
                  </button>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
                  Meus Serviços ({userServicesCount})
                </h2>
                <p className="text-xs sm:text-sm text-stone-500 font-medium">
                  Gerencie a visibilidade e as informações dos seus anúncios no QFomeAI.
                </p>
              </div>

              <button
                onClick={handleOpenCreateModal}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-xs sm:text-sm font-black rounded-2xl text-white flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/20 cursor-pointer self-start sm:self-auto"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Divulgar novo serviço</span>
              </button>
            </div>

            {/* List of User's Own Services */}
            {filteredServices.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 sm:p-14 border border-stone-200/70 text-center flex flex-col items-center justify-center space-y-4 shadow-xs">
                <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Briefcase className="w-8 h-8" />
                </div>
                <div className="max-w-sm">
                  <h4 className="text-base sm:text-lg font-black text-stone-900 tracking-tight">
                    Você ainda não possui publicações
                  </h4>
                  <p className="text-xs sm:text-sm text-stone-500 font-medium mt-1 leading-relaxed">
                    Divulgue suas habilidades profissionais gratuitamente para alcançar novos clientes na sua cidade!
                  </p>
                </div>
                <button
                  onClick={handleOpenCreateModal}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-xs font-black rounded-full text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Divulgar meu primeiro serviço</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {filteredServices.map((serv) => {
                  const catInfo = getCategoryInfo(serv.categoria);
                  const isToggling = togglingId === serv.id;

                  return (
                    <div
                      key={serv.id}
                      className="bg-white rounded-3xl border border-stone-200/90 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between"
                    >
                      {/* Card Content Top */}
                      <div className="p-5 space-y-3.5">
                        
                        {/* Header: Category & Status Badge */}
                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-2.5 py-1 text-[10px] font-black tracking-wider uppercase rounded-full border ${catInfo.badgeColor}`}>
                            {catInfo.name}
                          </span>

                          {serv.status === 'BLOQUEADO' ? (
                            <span className="px-2.5 py-1 text-[11px] font-black rounded-full bg-red-50 text-red-800 border border-red-200 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-red-500"></span>
                              <span>Bloqueado</span>
                            </span>
                          ) : serv.status === 'PAUSADO' || (!serv.status && !serv.ativo) ? (
                            <span className="px-2.5 py-1 text-[11px] font-black rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              <span>Pausado</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 text-[11px] font-black rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span>Ativo</span>
                            </span>
                          )}
                        </div>

                        {/* Photo/Logo + Title & Name */}
                        <div className="flex items-start gap-3.5 pt-1">
                          {serv.logoUrl ? (
                            <img
                              src={convertDriveUrl(serv.logoUrl)}
                              alt={`Foto de ${serv.nome}`}
                              referrerPolicy="no-referrer"
                              className="w-14 h-14 rounded-2xl object-cover shrink-0 border border-stone-200/80 bg-stone-50"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                              <User className="w-7 h-7" strokeWidth={1.5} />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-black text-stone-900 tracking-tight leading-snug line-clamp-2">
                              {serv.titulo}
                            </h3>
                            <p className="text-xs text-stone-500 font-bold truncate mt-0.5">
                              {serv.nome}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-stone-500 font-medium mt-1">
                              <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="truncate">{serv.cidade} - {serv.estado}</span>
                            </div>
                          </div>
                        </div>

                        {/* Description Preview */}
                        {serv.descricao && (
                          <p className="text-xs text-stone-600 font-medium leading-relaxed line-clamp-2 pt-1 border-t border-stone-100">
                            {serv.descricao}
                          </p>
                        )}

                        {/* Status Message Info */}
                        <div className={`p-2.5 rounded-2xl text-[11px] font-medium ${
                          serv.status === 'BLOQUEADO'
                            ? 'bg-red-50/80 text-red-900 border border-red-100'
                            : serv.status === 'PAUSADO' || (!serv.status && !serv.ativo)
                              ? 'bg-amber-50/70 text-amber-900 border border-amber-100'
                              : 'bg-emerald-50/70 text-emerald-900 border border-emerald-100'
                        }`}>
                          {serv.status === 'BLOQUEADO'
                            ? '⛔ Anúncio bloqueado pela administração por violar as diretrizes do canal.'
                            : serv.status === 'PAUSADO' || (!serv.status && !serv.ativo)
                              ? '⏸ Oculto dos resultados públicos. Seus dados continuam salvos.'
                              : '✓ Visível publicamente na busca e nas categorias de serviços.'}
                        </div>

                      </div>

                      {/* Card Actions (4 Direct actions: Ver perfil, Editar, Pausar/Ativar, Excluir) */}
                      <div className="p-3 bg-stone-50/80 border-t border-stone-100 grid grid-cols-2 gap-2">
                        
                        {/* 1. Ver Perfil */}
                        <button
                          onClick={() => setSelectedProfile(serv)}
                          className="py-2 px-2.5 bg-white hover:bg-stone-100 active:scale-98 text-xs font-bold text-stone-700 rounded-xl border border-stone-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                        >
                          <Eye className="w-3.5 h-3.5 text-stone-500" />
                          <span>Ver perfil</span>
                        </button>

                        {/* 2. Editar */}
                        <button
                          onClick={() => handleOpenEditModal(serv)}
                          className="py-2 px-2.5 bg-white hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 active:scale-98 text-xs font-bold text-stone-700 rounded-xl border border-stone-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-stone-500" />
                          <span>Editar</span>
                        </button>

                        {/* 3. Pausar / Ativar */}
                        <button
                          onClick={() => handleToggleActive(serv)}
                          disabled={isToggling || serv.status === 'BLOQUEADO'}
                          className={`py-2 px-2.5 active:scale-98 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px] disabled:opacity-50 ${
                            serv.status === 'BLOQUEADO'
                              ? 'bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed'
                              : (serv.status === 'ATIVO' || (!serv.status && serv.ativo))
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}
                          title={serv.status === 'BLOQUEADO' ? 'Anúncio bloqueado pela moderação' : undefined}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{isToggling ? 'Aguarde...' : serv.status === 'BLOQUEADO' ? 'Bloqueado' : (serv.status === 'ATIVO' || (!serv.status && serv.ativo)) ? 'Pausar' : 'Ativar'}</span>
                        </button>

                        {/* 4. Excluir */}
                        <button
                          onClick={() => handleRequestDelete(serv)}
                          className="py-2 px-2.5 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 active:scale-98 text-xs font-bold text-red-600 rounded-xl border border-stone-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          <span>Excluir</span>
                        </button>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </section>
        ) : (
          /* VIEW 2: EXPLORAR SERVIÇOS (Público) */
          <>
            {/* Hero Search & Location Filter Section */}
            <section id="services-hero-search" className="bg-white rounded-3xl p-5 sm:p-7 border border-stone-200/70 shadow-xs space-y-4">
              
              <div className="max-w-2xl">
                <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight leading-snug">
                  Encontre serviços perto de você
                </h2>
                <p className="text-xs sm:text-sm text-stone-500 font-medium mt-1 leading-relaxed">
                  Encontre profissionais autônomos e serviços para o que precisar. Contato direto pelo WhatsApp, sem taxas.
                </p>
              </div>

              {/* Main Search Input */}
              <div className="relative">
                <Search className="w-5 h-5 text-stone-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="O que você precisa? (ex: Eletricista, Pintor, Manutenção, Diarista...)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-10 py-3.5 bg-stone-50 hover:bg-stone-100/80 focus:bg-white border border-stone-200 focus:border-emerald-500 rounded-2xl text-xs sm:text-sm font-medium text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-3 focus:ring-emerald-500/15 transition-all"
                  id="services-search-input"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="p-1.5 text-stone-400 hover:text-stone-700 absolute right-3 top-1/2 -translate-y-1/2 rounded-full hover:bg-stone-200 transition-colors cursor-pointer"
                    aria-label="Limpar busca"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Location & Sorting Toolbar */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-stone-100">
                
                {/* City Location Filter */}
                <div className="sm:col-span-5 relative">
                  <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-600" />
                    <span>Localização / Cidade</span>
                  </label>
                  <div className="relative">
                    <select
                      value={filterCidadeId}
                      onChange={(e) => setFilterCidadeId(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 bg-stone-50 hover:bg-stone-100/80 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 appearance-none focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
                      id="services-location-city-select"
                    >
                      <option value="all">Todas as cidades</option>
                      {allCidades.map((cidade) => (
                        <option key={cidade.id} value={cidade.id}>
                          {cidade.nome}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Neighborhood / Area Filter */}
                <div className="sm:col-span-4 relative">
                  <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1 flex items-center gap-1">
                    <span>Bairro ou Região</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ex: Centro, Região Sul..."
                      value={filterBairro}
                      onChange={(e) => setFilterBairro(e.target.value)}
                      className="w-full px-3 py-2 bg-stone-50 hover:bg-stone-100/80 focus:bg-white border border-stone-200 focus:border-emerald-500 rounded-xl text-xs font-medium text-stone-800 placeholder-stone-400 focus:outline-none transition-all"
                    />
                    {filterBairro && (
                      <button
                        onClick={() => setFilterBairro('')}
                        className="text-stone-400 hover:text-stone-700 absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Ordering Filter */}
                <div className="sm:col-span-3 relative">
                  <label className="text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1 flex items-center gap-1">
                    <ArrowUpDown className="w-3 h-3 text-stone-400" />
                    <span>Ordenar por</span>
                  </label>
                  <div className="relative">
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'relevantes' | 'recentes')}
                      className="w-full pl-3 pr-8 py-2 bg-stone-50 hover:bg-stone-100/80 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 appearance-none focus:outline-none focus:border-emerald-500 transition-all cursor-pointer"
                      id="services-sort-select"
                    >
                      <option value="relevantes">Relevantes</option>
                      <option value="recentes">Mais recentes</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

              </div>

              {/* Active Filters Clear Button */}
              {(searchTerm || selectedCategory !== 'todos' || filterCidadeId !== 'all' || filterBairro) && (
                <div className="pt-2 border-t border-stone-100 flex justify-end">
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setFilterCidadeId('all');
                      setFilterBairro('');
                      handleCategorySelect('todos');
                    }}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Limpar filtros</span>
                  </button>
                </div>
              )}

            </section>

            {/* Categories Grid (Mobile First + Desktop) */}
            <section id="services-categories-section" className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-stone-400">
                  Categorias de Serviços
                </h3>
                {selectedCategory !== 'todos' && (
                  <button
                    onClick={() => handleCategorySelect('todos')}
                    className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Ver todas ({CATEGORIES.length - 1})
                  </button>
                )}
              </div>

              {/* Grid layout with rounded category pills/buttons */}
              <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-7 xl:grid-cols-7 gap-2 sm:gap-2.5">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = selectedCategory === cat.id;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleCategorySelect(cat.id)}
                      className={`flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-2xl border transition-all duration-200 cursor-pointer active:scale-95 text-center min-h-[76px] focus:outline-none ${
                        isSelected
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                          : 'bg-white border-stone-200/80 hover:border-emerald-300 hover:bg-emerald-50/40 text-stone-700'
                      }`}
                      id={`service-cat-${cat.id}`}
                      aria-label={`Filtrar por ${cat.name}`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-stone-50 text-stone-600'
                      }`}>
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <span className="text-[11px] font-bold leading-tight line-clamp-2">
                        {cat.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Main Listings Section */}
            <section id="services-listings-section" className="space-y-4">
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black text-stone-900 tracking-tight">
                    Profissionais e serviços
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-[11px] font-black text-stone-600">
                    {filteredServices.length}
                  </span>
                </div>

                <button
                  onClick={handleOpenCreateModal}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Anunciar grátis</span>
                </button>
              </div>

              {/* Loading State */}
              {loading ? (
                <div className="bg-white rounded-3xl p-12 border border-stone-200/70 flex flex-col items-center justify-center text-center">
                  <div className="w-8 h-8 rounded-full border-3 border-emerald-600 border-t-transparent animate-spin mb-3" />
                  <p className="text-xs sm:text-sm font-bold text-stone-600">Carregando serviços disponíveis...</p>
                </div>
              ) : filteredServices.length === 0 ? (
                /* Empty State */
                <div className="bg-white rounded-3xl p-10 sm:p-14 border border-stone-200/70 text-center flex flex-col items-center justify-center space-y-4 shadow-xs">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                    <SearchX className="w-8 h-8" />
                  </div>
                  <div className="max-w-sm">
                    <h4 className="text-base sm:text-lg font-black text-stone-900 tracking-tight">
                      Não encontramos esse serviço por aqui ainda.
                    </h4>
                    <p className="text-xs sm:text-sm text-stone-500 font-medium mt-1 leading-relaxed">
                      Seja o primeiro profissional a oferecer esse serviço na sua região ou tente pesquisar com outros termos.
                    </p>
                  </div>

                  <button
                    onClick={handleOpenCreateModal}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-xs font-black rounded-full text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Divulgar meu serviço</span>
                  </button>
                </div>
              ) : (
                /* Cards Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                  {filteredServices.map((serv) => {
                    const catInfo = getCategoryInfo(serv.categoria);

                    return (
                      <div
                        key={serv.id}
                        className="bg-white rounded-3xl border border-stone-200/80 hover:border-emerald-300 hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group"
                      >
                        
                        {/* Card Content Top */}
                        <div className="p-4 sm:p-5 space-y-3">
                          
                          {/* Header row with Category Badge */}
                          <div className="flex items-center justify-between gap-2">
                            <span className={`px-2.5 py-1 text-[10px] font-black tracking-wider uppercase rounded-full border ${catInfo.badgeColor}`}>
                              {catInfo.name}
                            </span>
                          </div>

                          {/* Provider Header: Avatar/Logo + Name & Main Service Title */}
                          <div className="flex items-start gap-3 pt-0.5">
                            {serv.logoUrl ? (
                              <img
                                src={convertDriveUrl(serv.logoUrl)}
                                alt={`Foto de ${serv.nome}`}
                                referrerPolicy="no-referrer"
                                className="w-12 h-12 rounded-2xl object-cover shrink-0 border border-stone-200/80 bg-stone-50"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                                <User className="w-6 h-6" strokeWidth={1.5} />
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <h4 
                                onClick={() => setSelectedProfile(serv)}
                                className="text-sm sm:text-base font-black text-stone-900 tracking-tight leading-snug line-clamp-2 hover:text-emerald-700 cursor-pointer transition-colors"
                              >
                                {serv.titulo}
                              </h4>
                              <p className="text-xs text-stone-500 font-bold truncate mt-0.5">
                                {serv.nome}
                              </p>
                            </div>
                          </div>

                          {/* Location details */}
                          <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate">
                              {serv.bairro ? `${serv.bairro}, ` : ''}{serv.cidade} - {serv.estado}
                            </span>
                          </div>

                          {/* Other Services Tag List Preview */}
                          {serv.servicosOferecidos && serv.servicosOferecidos.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {serv.servicosOferecidos.slice(0, 3).map((s, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-stone-100 text-stone-600 rounded-md text-[10px] font-bold">
                                  {s}
                                </span>
                              ))}
                              {serv.servicosOferecidos.length > 3 && (
                                <span className="px-1.5 py-0.5 bg-stone-50 text-stone-400 rounded-md text-[10px] font-bold">
                                  +{serv.servicosOferecidos.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Short Description */}
                          <p className="text-xs text-stone-600 font-medium leading-relaxed line-clamp-2">
                            {serv.descricao}
                          </p>

                          {/* Work photos preview thumbnail row */}
                          {serv.fotosTrabalho && serv.fotosTrabalho.length > 0 && (
                            <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
                              {serv.fotosTrabalho.slice(0, 3).map((foto, idx) => (
                                <img
                                  key={idx}
                                  src={convertDriveUrl(foto)}
                                  alt="Foto do trabalho"
                                  referrerPolicy="no-referrer"
                                  className="w-10 h-10 rounded-xl object-cover shrink-0 border border-stone-200 bg-stone-50"
                                />
                              ))}
                              {serv.fotosTrabalho.length > 3 && (
                                <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-[10px] font-black text-stone-600 shrink-0">
                                  +{serv.fotosTrabalho.length - 3}
                                </div>
                              )}
                            </div>
                          )}

                        </div>

                        {/* Card Footer Actions */}
                        <div className="p-4 bg-stone-50/70 border-t border-stone-100 flex items-center gap-2">
                          <button
                            onClick={() => setSelectedProfile(serv)}
                            className="flex-1 py-2.5 px-3 bg-white hover:bg-stone-100 active:scale-98 text-xs font-bold text-stone-700 rounded-xl border border-stone-200 transition-all text-center cursor-pointer min-h-[44px] flex items-center justify-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5 text-stone-500" />
                            <span>Ver perfil</span>
                          </button>

                          <a
                            href={getWhatsAppLink(serv.telefone, serv.titulo, serv.nome)}
                            target="_blank"
                            rel="noreferrer"
                            className="py-2.5 px-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-xs font-black text-white rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0 cursor-pointer min-h-[44px]"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>WhatsApp</span>
                          </a>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}

            </section>
          </>
        )}

      </main>

      {/* ========================================================================= */}
      {/* MODAL: PERFIL PÚBLICO DO PROFISSIONAL (Vitrine Elegante e Confiável) */}
      {/* ========================================================================= */}
      {selectedProfile && (
        <div className="fixed inset-0 bg-stone-900/60 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-100 overflow-hidden relative max-h-[92vh] flex flex-col">
            
            {/* Barra Superior Discreta com Categoria e Fechar */}
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-10">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full border ${getCategoryInfo(selectedProfile.categoria).badgeColor}`}>
                  {getCategoryInfo(selectedProfile.categoria).name}
                </span>
                {selectedProfile.ativo ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-black text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Disponível
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 text-[10px] font-bold">
                    Pausado
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {/* Opção discreta para o dono do anúncio editar */}
                {user && (user.uid === selectedProfile.userId || profile?.role === 'admin') && (
                  <button
                    onClick={() => {
                      const prof = selectedProfile;
                      setSelectedProfile(null);
                      handleOpenEditModal(prof);
                    }}
                    className="p-2 text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-full transition-colors cursor-pointer"
                    title="Editar anúncio"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={() => setSelectedProfile(null)}
                  className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
                  aria-label="Fechar perfil"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conteúdo Principal do Perfil */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
              
              {/* 1. TOPO DO PERFIL */}
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  {selectedProfile.logoUrl ? (
                    <img
                      src={convertDriveUrl(selectedProfile.logoUrl)}
                      alt={`Foto ou Logo de ${selectedProfile.nome}`}
                      referrerPolicy="no-referrer"
                      className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl object-cover shrink-0 border border-stone-200/80 bg-stone-50 shadow-2xs"
                    />
                  ) : (
                    <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                      <User className="w-9 h-9" strokeWidth={1.5} />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg sm:text-xl font-black text-stone-900 tracking-tight leading-snug">
                      {selectedProfile.titulo}
                    </h3>
                    <p className="text-sm font-semibold text-stone-600 mt-0.5">
                      {selectedProfile.nome}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium mt-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>
                        {selectedProfile.cidade} - {selectedProfile.estado}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botão Principal em Destaque no Topo */}
                <a
                  href={getWhatsAppLink(selectedProfile.telefone, selectedProfile.titulo, selectedProfile.nome)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-sm sm:text-base font-black text-white rounded-2xl transition-all flex items-center justify-center gap-2.5 shadow-md shadow-emerald-600/20 cursor-pointer min-h-[48px]"
                >
                  <MessageCircle className="w-5 h-5 fill-current" />
                  <span>CHAMAR NO WHATSAPP</span>
                </a>
              </div>

              {/* 2. SOBRE */}
              {selectedProfile.descricao && selectedProfile.descricao.trim() && (
                <div className="pt-4 border-t border-stone-100 space-y-1.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-400">
                    Sobre
                  </h4>
                  <p className="text-xs sm:text-sm text-stone-700 font-normal leading-relaxed whitespace-pre-line">
                    {selectedProfile.descricao}
                  </p>
                </div>
              )}

              {/* 3. SERVIÇOS OFERECIDOS */}
              {selectedProfile.servicosOferecidos && selectedProfile.servicosOferecidos.length > 0 && (
                <div className="pt-4 border-t border-stone-100 space-y-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-400">
                    Serviços Oferecidos
                  </h4>
                  <ul className="space-y-2">
                    {selectedProfile.servicosOferecidos.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-stone-800">
                        <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 4. FOTOS DOS TRABALHOS */}
              {selectedProfile.fotosTrabalho && selectedProfile.fotosTrabalho.length > 0 && (
                <div className="pt-4 border-t border-stone-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-stone-400">
                      Fotos dos Trabalhos
                    </h4>
                    <span className="text-xs font-bold text-stone-400">
                      {selectedProfile.fotosTrabalho.length} {selectedProfile.fotosTrabalho.length === 1 ? 'foto' : 'fotos'}
                    </span>
                  </div>

                  {/* Foto em destaque selecionada */}
                  <div className="w-full aspect-16/10 rounded-2xl overflow-hidden border border-stone-200/80 bg-stone-900 relative">
                    <img
                      src={convertDriveUrl(selectedProfile.fotosTrabalho[activePhotoIndex] || selectedProfile.fotosTrabalho[0])}
                      alt="Trabalho realizado"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Miniaturas das fotos */}
                  {selectedProfile.fotosTrabalho.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {selectedProfile.fotosTrabalho.map((foto, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActivePhotoIndex(idx)}
                          className={`w-14 h-14 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                            activePhotoIndex === idx ? 'border-emerald-600 scale-105 shadow-xs' : 'border-stone-200 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={convertDriveUrl(foto)}
                            alt={`Miniatura ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 5. ÁREA DE ATENDIMENTO */}
              <div className="pt-4 border-t border-stone-100 space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-400">
                  Área de Atendimento
                </h4>
                <div className="space-y-1.5 text-xs sm:text-sm text-stone-700 font-medium">
                  <p className="flex items-center gap-2 font-bold text-stone-800">
                    <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{selectedProfile.cidade} - {selectedProfile.estado}</span>
                  </p>
                  {selectedProfile.bairro && selectedProfile.bairro.trim() && (
                    <p className="text-stone-600 pl-6">
                      <span className="font-bold text-stone-700">Bairro/Região:</span> {selectedProfile.bairro}
                    </p>
                  )}
                  {selectedProfile.areaAtendimento && selectedProfile.areaAtendimento.trim() && (
                    <p className="text-stone-600 pl-6">
                      <span className="font-bold text-stone-700">Área atendida:</span> {selectedProfile.areaAtendimento}
                    </p>
                  )}
                </div>
              </div>

              {/* 6. CONTATO FINAL */}
              <div className="pt-5 border-t border-stone-100 space-y-3 text-center">
                <div>
                  <h4 className="text-base sm:text-lg font-black text-stone-900 tracking-tight">
                    Precisa deste serviço?
                  </h4>
                  <p className="text-xs sm:text-sm text-stone-500 font-medium mt-0.5">
                    Fale diretamente no WhatsApp para tirar dúvidas e combinar os detalhes.
                  </p>
                </div>

                <a
                  href={getWhatsAppLink(selectedProfile.telefone, selectedProfile.titulo, selectedProfile.nome)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3.5 px-5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-sm sm:text-base font-black text-white rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer min-h-[48px]"
                >
                  <MessageCircle className="w-5 h-5 fill-current" />
                  <span>Falar no WhatsApp</span>
                </a>

                {/* Telefone e cópia rápida */}
                <div className="flex items-center justify-center gap-2 text-xs text-stone-500 pt-1">
                  <span>{selectedProfile.telefone}</span>
                  <span>•</span>
                  <button
                    onClick={() => handleCopyPhone(selectedProfile.telefone)}
                    className="font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer inline-flex items-center gap-1"
                  >
                    {copiedPhone ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <span>Copiar número</span>
                    )}
                  </button>
                </div>

                {/* Ação discreta: Denunciar */}
                <div className="pt-3 border-t border-stone-100 flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setReportingService(selectedProfile);
                      setReportMotivo('Conteúdo impróprio');
                      setReportObs('');
                      setReportSuccess(false);
                    }}
                    className="text-stone-400 hover:text-red-600 text-xs font-semibold flex items-center gap-1.5 transition-colors py-1 px-2.5 rounded-lg hover:bg-red-50/50 cursor-pointer"
                    id="btn-denunciar-servico"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Denunciar publicação</span>
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CADASTRO / EDIÇÃO PADRONIZADA DO PROFISSIONAL */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/65 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-stone-100 overflow-hidden relative max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-stone-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-stone-900 tracking-tight leading-tight">
                    {editingServiceId ? 'Editar Cadastro de Serviço' : 'Cadastro de Serviço'}
                  </h3>
                  <p className="text-[11px] text-emerald-700 font-bold leading-none mt-0.5">
                    100% Gratuito no QFomeAI
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                disabled={regLoading}
                className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveService} className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
              
              {/* Feedback messages */}
              {errorMessage && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* 1. IDENTIFICAÇÃO */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-stone-400" />
                  <span>1. Identificação</span>
                </h4>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-700">
                    Nome profissional ou nome da empresa <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Carlos Silva Eletricista ou Silva Reformas"
                    value={regNome}
                    onChange={(e) => setRegNome(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-xs sm:text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-stone-400" />
                    WhatsApp para contato direto <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="Ex: (63) 99999-9999"
                    value={regTelefone}
                    onChange={(e) => setRegTelefone(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-xs sm:text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    required
                  />
                  <span className="text-[10px] text-stone-400 font-medium block">
                    Os clientes tocarão no botão do anúncio para conversar diretamente com você no WhatsApp.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-stone-400" />
                    Foto de perfil ou logo (Opcional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://... (link de imagem ou Google Drive)"
                    value={regLogoUrl}
                    onChange={(e) => setRegLogoUrl(e.target.value)}
                    className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-xs sm:text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              {/* 2. CATEGORIA */}
              <div className="space-y-3 pt-3 border-t border-stone-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-stone-400" />
                  <span>2. Categoria Principal</span>
                </h4>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-700">
                    Selecione a categoria principal <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={regCategoria}
                      onChange={(e) => setRegCategoria(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-stone-200 rounded-2xl text-xs sm:text-sm font-bold text-stone-800 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
                    >
                      {CATEGORIES.filter(c => c.id !== 'todos').map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-stone-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* 3. SERVIÇO PRINCIPAL & OUTROS SERVIÇOS */}
              <div className="space-y-3 pt-3 border-t border-stone-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-stone-400" />
                  <span>3. Serviços Oferecidos</span>
                </h4>

                {/* Main Service */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-700">
                    Qual serviço você oferece? (Título principal) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Eletricista residencial, Instalação de ar-condicionado, Diarista..."
                    value={regTitulo}
                    onChange={(e) => setRegTitulo(e.target.value)}
                    maxLength={100}
                    className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-xs sm:text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    required
                  />
                </div>

                {/* Other Services list */}
                <div className="space-y-2 bg-stone-50 p-3.5 rounded-2xl border border-stone-200/70">
                  <label className="text-xs font-extrabold text-stone-700 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    Lista de outros serviços realizados (Opcional)
                  </label>
                  <p className="text-[11px] text-stone-500 font-medium">
                    Adicione outros serviços que você realiza para ajudar os clientes a te encontrarem na busca.
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Ex: Troca de tomadas, Instalação de ventilador..."
                      value={novoServicoInput}
                      onChange={(e) => setNovoServicoInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSubService();
                        }
                      }}
                      className="flex-1 px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleAddSubService}
                      disabled={!novoServicoInput.trim()}
                      className="px-3.5 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-xs font-bold text-white rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar</span>
                    </button>
                  </div>

                  {/* Rendered tag pills */}
                  {regServicosOferecidos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1.5">
                      {regServicosOferecidos.map((item, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-white border border-stone-200 text-stone-800 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs"
                        >
                          <span>{item}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSubService(idx)}
                            className="text-stone-400 hover:text-red-600 cursor-pointer"
                            title="Remover serviço"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 4. DESCRIÇÃO */}
              <div className="space-y-3 pt-3 border-t border-stone-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-stone-400" />
                  <span>4. Descrição</span>
                </h4>

                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-stone-700">
                    Conte um pouco sobre seu trabalho (Opcional)
                  </label>
                  <textarea
                    placeholder="Ex: Atendimento rápido com garantia e nota. Mais de 5 anos de experiência, ferramentas próprias e pontualidade."
                    rows={3}
                    value={regDescricao}
                    onChange={(e) => setRegDescricao(e.target.value)}
                    maxLength={500}
                    className="w-full px-4 py-3 border border-stone-200 rounded-2xl text-xs sm:text-sm font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none transition-all"
                  />
                  <div className="flex justify-between items-center text-[10px] text-stone-400 font-medium">
                    <span>Mantenha um texto objetivo para facilitar a leitura no celular.</span>
                    <span>{regDescricao.length}/500</span>
                  </div>
                </div>
              </div>

              {/* 5. LOCAL DE ATENDIMENTO */}
              <div className="space-y-3 pt-3 border-t border-stone-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                  <span>5. Local de Atendimento</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-stone-600">Estado <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select
                        value={regEstadoId}
                        onChange={(e) => setRegEstadoId(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-800 appearance-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
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
                    <label className="text-[11px] font-bold text-stone-600">Cidade <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select
                        value={regCidadeId}
                        onChange={(e) => setRegCidadeId(e.target.value)}
                        disabled={!regEstadoId}
                        className="w-full px-3 py-2.5 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-800 appearance-none disabled:bg-stone-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-stone-600">Bairro de base (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: Centro, Setor Sul..."
                      value={regBairro}
                      onChange={(e) => setRegBairro(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-stone-600">Área de Atendimento (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ex: Toda a cidade e região..."
                      value={regAreaAtendimento}
                      onChange={(e) => setRegAreaAtendimento(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* 6. FOTOS DOS TRABALHOS */}
              <div className="space-y-3 pt-3 border-t border-stone-100">
                <h4 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-600" />
                  <span>6. Fotos dos Trabalhos (Opcional - até 6 fotos)</span>
                </h4>

                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    placeholder="Link público de foto de trabalho realizado..."
                    value={newFotoUrl}
                    onChange={(e) => setNewFotoUrl(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 border border-stone-200 rounded-xl text-xs font-medium text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleAddWorkPhoto}
                    disabled={!newFotoUrl.trim()}
                    className="px-3.5 py-2.5 bg-stone-100 hover:bg-stone-200 disabled:opacity-40 text-xs font-bold text-stone-700 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    Adicionar Foto
                  </button>
                </div>

                {/* List of uploaded work photos */}
                {regFotosTrabalho.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                    {regFotosTrabalho.map((foto, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-stone-200 bg-stone-50 h-16">
                        <img
                          src={convertDriveUrl(foto)}
                          alt="Foto do trabalho"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveWorkPhoto(idx)}
                          className="absolute top-1 right-1 p-1 bg-stone-900/80 hover:bg-red-600 text-white rounded-md transition-colors cursor-pointer"
                          title="Remover foto"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Action Buttons */}
              <div className="pt-4 border-t border-stone-100 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={regLoading}
                  className="px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-100 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={regLoading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-xs font-black text-white rounded-xl transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {regLoading ? 'Salvando...' : editingServiceId ? 'Salvar Alterações' : 'Publicar Gratuitamente'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIRMAR EXCLUSÃO DE SERVIÇO */}
      {/* ========================================================================= */}
      {serviceToDelete && (
        <div 
          className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => !deleteLoading && setServiceToDelete(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-stone-200/80 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-stone-900 tracking-tight">
                Excluir este serviço?
              </h3>
              <p className="text-xs text-stone-500 font-medium leading-relaxed">
                Essa ação não poderá ser desfeita e o anúncio será removido permanentemente.
              </p>
            </div>

            <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 text-left">
              <p className="text-xs font-black text-stone-900 line-clamp-1">{serviceToDelete.titulo}</p>
              <p className="text-[11px] text-stone-500 font-bold">{serviceToDelete.nome} • {serviceToDelete.cidade} - {serviceToDelete.estado}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setServiceToDelete(null)}
                disabled={deleteLoading}
                className="py-2.5 px-3 bg-stone-100 hover:bg-stone-200 text-xs font-bold text-stone-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="py-2.5 px-3 bg-red-600 hover:bg-red-700 active:scale-95 text-xs font-black text-white rounded-xl transition-all shadow-md shadow-red-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deleteLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DENUNCIAR ANÚNCIO DE SERVIÇO */}
      {/* ========================================================================= */}
      {reportingService && (
        <div className="fixed inset-0 bg-stone-900/60 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl relative border border-stone-100 animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setReportingService(null)}
              className="absolute right-4 top-4 text-stone-400 hover:text-stone-700 p-1.5 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {reportSuccess ? (
              <div className="text-center py-6 space-y-3">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black text-stone-900">Denúncia enviada com sucesso!</h3>
                <p className="text-xs text-stone-500 font-medium leading-relaxed max-w-xs mx-auto">
                  Agradecemos sua colaboração. Nossa equipe de moderação analisará a publicação.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendServiceReport} className="space-y-4">
                <div>
                  <h3 className="text-base font-black text-stone-900 flex items-center gap-2">
                    <Flag className="w-4 h-4 text-red-600" />
                    <span>Denunciar Publicação</span>
                  </h3>
                  <p className="text-xs text-stone-500 font-medium truncate mt-0.5">
                    {reportingService.titulo} ({reportingService.nome})
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-black text-stone-700">
                    Motivo da Denúncia <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-1.5">
                    {[
                      'Conteúdo impróprio',
                      'Informação falsa',
                      'Spam',
                      'Serviço proibido',
                      'Outro'
                    ].map((m) => (
                      <label key={m} className="flex items-center gap-2.5 p-2.5 bg-stone-50 hover:bg-stone-100/80 rounded-2xl border border-stone-200/80 cursor-pointer text-xs font-bold text-stone-800 transition-all">
                        <input
                          type="radio"
                          name="motivo"
                          value={m}
                          checked={reportMotivo === m}
                          onChange={() => setReportMotivo(m)}
                          className="accent-emerald-600"
                        />
                        <span>{m}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-black text-stone-700">
                    Observação (Opcional, máx. 200 caracteres)
                  </label>
                  <textarea
                    value={reportObs}
                    onChange={(e) => setReportObs(e.target.value.slice(0, 200))}
                    rows={3}
                    maxLength={200}
                    placeholder="Descreva brevemente o problema encontrado..."
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-medium text-stone-800 focus:outline-none focus:border-emerald-500 resize-none transition-all"
                  />
                  <span className="text-[10px] text-stone-400 block text-right font-medium">
                    {reportObs.length}/200
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportingService(null)}
                    className="py-2.5 px-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReport}
                    className="py-2.5 px-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-md shadow-red-600/20 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {submittingReport ? 'Enviando...' : 'Enviar Denúncia'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Standard Bottom Navigation Bar */}
      <Navbar />

    </div>
  );
}
