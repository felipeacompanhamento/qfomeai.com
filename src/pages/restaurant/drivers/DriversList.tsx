import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Search, UserPlus, Trash2, Edit2, ShieldAlert,
  Bike, Car, Compass, Smile, CheckCircle, XCircle, Clock,
  MapPin, Phone, Mail, FileText, ChevronRight, Loader2, AlertCircle
} from 'lucide-react';
import { auth } from '../../../firebase';
import { motion, AnimatePresence } from 'motion/react';

interface Driver {
  id: string;
  restaurantId: string;
  userId: string;
  name: string;
  nickname?: string;
  phone: string;
  email: string;
  cpf?: string;
  vehicleType: 'moto' | 'bicicleta' | 'carro' | 'a_pe';
  vehiclePlate?: string;
  observations?: string;
  status: 'ACTIVE' | 'INACTIVE';
  availabilityStatus: 'OFFLINE' | 'ONLINE' | 'ON_DELIVERY';
  totalDeliveries: number;
  createdAt: string;
  updatedAt: string;
}

export default function DriversList() {
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and Filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'ONLINE' | 'OFFLINE' | 'ON_DELIVERY'>('ALL');

  // Edit Driver modal state
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Deletion modal state
  const [deletingDriverId, setDeletingDriverId] = useState<string | null>(null);
  const [deletingName, setDeletingName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // To maintain active styling in inputs
  const [formData, setFormData] = useState({
    name: '',
    nickname: '',
    phone: '',
    email: '',
    cpf: '',
    vehicleType: 'moto' as 'moto' | 'bicicleta' | 'carro' | 'a_pe',
    vehiclePlate: '',
    observations: '',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE'
  });

  const fetchDrivers = async () => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Autenticação expirada. Por favor, faça login novamente.');

      const response = await fetch('/api/restaurant/drivers', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar lista de entregadores');
      }
      setDrivers(data.drivers || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao carregar entregadores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  const handleOpenEdit = (driver: Driver) => {
    setEditingDriver(driver);
    setEditError(null);
    setFormData({
      name: driver.name,
      nickname: driver.nickname || '',
      phone: driver.phone,
      email: driver.email,
      cpf: driver.cpf || '',
      vehicleType: driver.vehicleType,
      vehiclePlate: driver.vehiclePlate || '',
      observations: driver.observations || '',
      status: driver.status
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    setSavingEdit(true);
    setEditError(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Não autenticado');

      const response = await fetch(`/api/restaurant/drivers/${editingDriver.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          ...formData,
          active: formData.status === 'ACTIVE'
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar alterações');
      }

      setEditingDriver(null);
      fetchDrivers();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleStatus = async (driver: Driver) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Não autenticado');

      const nextStatus = driver.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

      const response = await fetch(`/api/restaurant/drivers/${driver.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          active: nextStatus === 'ACTIVE'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao atualizar status');
      }

      // Update locally
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, status: nextStatus } : d));
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar status do entregador');
    }
  };

  const handleDeleteClick = (driver: Driver) => {
    setDeletingDriverId(driver.id);
    setDeletingName(driver.name);
  };

  const handleConfirmDelete = async () => {
    if (!deletingDriverId) return;
    setIsDeleting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Não autenticado');

      const response = await fetch(`/api/restaurant/drivers/${deletingDriverId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao excluir entregador');
      }

      setDeletingDriverId(null);
      fetchDrivers();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir entregador');
    } finally {
      setIsDeleting(false);
    }
  };

  // Searching & Filtering logic
  const filteredDrivers = drivers.filter(driver => {
    // 1. Term Search
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      driver.name.toLowerCase().includes(term) ||
      (driver.nickname && driver.nickname.toLowerCase().includes(term)) ||
      driver.email.toLowerCase().includes(term) ||
      driver.phone.includes(term);

    if (!matchesSearch) return false;

    // 2. Status Filters
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') return driver.status === 'ACTIVE';
    if (statusFilter === 'INACTIVE') return driver.status === 'INACTIVE';
    if (statusFilter === 'ONLINE') return driver.availabilityStatus === 'ONLINE';
    if (statusFilter === 'OFFLINE') return driver.availabilityStatus === 'OFFLINE';
    if (statusFilter === 'ON_DELIVERY') return driver.availabilityStatus === 'ON_DELIVERY';

    return true;
  });

  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'moto': return <Bike className="w-4 h-4 text-emerald-600" />;
      case 'carro': return <Car className="w-4 h-4 text-blue-600" />;
      case 'bicicleta': return <Compass className="w-4 h-4 text-amber-600" />;
      case 'a_pe': return <Smile className="w-4 h-4 text-purple-600" />;
      default: return <Bike className="w-4 h-4" />;
    }
  };

  const getVehicleLabel = (type: string) => {
    switch (type) {
      case 'moto': return 'Moto';
      case 'carro': return 'Carro';
      case 'bicicleta': return 'Bicicleta';
      case 'a_pe': return 'A Pé';
      default: return type;
    }
  };

  const getAvailabilityBadge = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Online
        </span>;
      case 'ON_DELIVERY':
        return <span className="bg-blue-50 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-blue-200">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Em entrega
        </span>;
      default:
        return <span className="bg-stone-50 text-stone-500 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 border border-stone-200">
          <span className="w-2 h-2 rounded-full bg-stone-400" /> Offline
        </span>;
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Lista de Entregadores</h2>
          <p className="text-stone-500 text-sm">Visualize, edite e gerencie a equipe de entregadores do seu restaurante.</p>
        </div>
        <button
          onClick={() => navigate('/restaurant/drivers/new')}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-100"
        >
          <UserPlus className="w-4 h-4" />
          <span>Cadastrar Entregador</span>
        </button>
      </div>

      {/* Filter and search panel */}
      <div className="bg-white p-4 rounded-3xl border border-stone-200 flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou WhatsApp..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-sm text-stone-700 transition-all"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'ACTIVE', 'INACTIVE', 'ONLINE', 'OFFLINE', 'ON_DELIVERY'] as const).map((filter) => {
            const labels = {
              ALL: 'Todos',
              ACTIVE: 'Ativos',
              INACTIVE: 'Inativos',
              ONLINE: 'Online',
              OFFLINE: 'Offline',
              ON_DELIVERY: 'Em Entrega'
            };
            return (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                  statusFilter === filter
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-50'
                    : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                {labels[filter]}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-stone-200">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
          <p className="text-stone-500 text-sm font-medium">Buscando entregadores...</p>
        </div>
      ) : error ? (
        <div className="p-12 bg-white rounded-3xl border border-stone-200 text-center text-stone-600">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-stone-800 mb-2">Erro ao carregar entregadores</h3>
          <p className="text-stone-500 text-sm max-w-sm mx-auto mb-6">{error}</p>
          <button 
            onClick={fetchDrivers}
            className="px-5 py-2.5 bg-stone-100 font-bold rounded-xl hover:bg-stone-200 transition-all"
          >
            Tentar Novamente
          </button>
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="p-12 bg-white rounded-3xl border border-stone-200 text-center">
          <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-stone-300" />
          </div>
          <h3 className="text-lg font-bold text-stone-800 mb-1">Nenhum entregador encontrado</h3>
          <p className="text-stone-500 text-sm max-w-md mx-auto">
            {searchTerm || statusFilter !== 'ALL' 
              ? 'Tente ajustar os critérios de pesquisa ou filtros para encontrar o que procura.' 
              : 'Você ainda não cadastrou entregadores para o seu restaurante. Clique acima para cadastrar o primeiro!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDrivers.map((driver) => (
            <motion.div
              layout
              key={driver.id}
              className={`bg-white rounded-3xl border transition-all p-6 relative flex flex-col justify-between ${
                driver.status === 'ACTIVE' ? 'border-stone-200' : 'border-stone-200 opacity-70'
              }`}
            >
              <div>
                {/* Header info */}
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <h4 className="font-bold text-lg text-stone-800 line-clamp-1">{driver.name}</h4>
                    {driver.nickname && (
                      <p className="text-stone-400 text-xs font-semibold">Apelido: {driver.nickname}</p>
                    )}
                  </div>
                  {getAvailabilityBadge(driver.availabilityStatus)}
                </div>

                {/* Main driver data */}
                <div className="space-y-3 pt-2 text-stone-600 text-sm font-medium border-t border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-stone-400 shrink-0" />
                    <span className="truncate">{driver.phone}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-stone-400 shrink-0" />
                    <span className="truncate text-xs">{driver.email}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {getVehicleIcon(driver.vehicleType)}
                    <span>
                      {getVehicleLabel(driver.vehicleType)}
                      {driver.vehiclePlate && (
                        <span className="text-stone-400 text-xs ml-1 bg-stone-100 px-1.5 py-0.5 rounded font-mono font-bold">
                          {driver.vehiclePlate}
                        </span>
                      )}
                    </span>
                  </div>

                  {driver.cpf && (
                    <div className="flex items-center gap-2.5 text-xs text-stone-500">
                      <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                      <span>CPF: {driver.cpf}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 text-xs text-stone-500">
                    <Clock className="w-4 h-4 text-stone-400 shrink-0" />
                    <span>Cadastrado em: {new Date(driver.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>

              {/* Bottom Actions section */}
              <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-stone-400">Ativo</span>
                  <button
                    onClick={() => handleToggleStatus(driver)}
                    className={`relative w-11 h-6 rounded-full transition-all duration-200 outline-none ${
                      driver.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-stone-300'
                    }`}
                  >
                    <span className={`absolute top-1 left-1.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                      driver.status === 'ACTIVE' ? 'translate-x-4' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEdit(driver)}
                    className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-stone-50 transition-all rounded-xl border border-transparent hover:border-stone-200"
                    title="Editar entregador"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(driver)}
                    className="p-2 text-stone-400 hover:text-red-500 hover:bg-stone-50 transition-all rounded-xl border border-transparent hover:border-stone-200"
                    title="Excluir entregador"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Editing Modal Dialog */}
      <AnimatePresence>
        {editingDriver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto no-scrollbar border border-stone-100 p-6 sm:p-8"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-stone-800">Editar Entregador</h3>
                  <p className="text-stone-400 text-xs">Atualize os dados e configurações do entregador.</p>
                </div>
                <button
                  onClick={() => setEditingDriver(null)}
                  className="p-2 hover:bg-stone-100 rounded-xl transition-all font-bold text-sm text-stone-400"
                >
                  X
                </button>
              </div>

              {editError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  <span>{editError}</span>
                </div>
              )}

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-stone-600 text-xs font-bold">Nome completo *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-stone-600 text-xs font-bold">Apelido</label>
                    <input
                      type="text"
                      value={formData.nickname}
                      onChange={(e) => setFormData(prev => ({ ...prev, nickname: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-stone-600 text-xs font-bold">WhatsApp *</label>
                    <input
                      type="text"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-stone-600 text-xs font-bold">E-mail *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-stone-600 text-xs font-bold">CPF (Opcional)</label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={formData.cpf}
                      onChange={(e) => setFormData(prev => ({ ...prev, cpf: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-stone-600 text-xs font-bold">Placa do Veículo (Opcional)</label>
                    <input
                      type="text"
                      placeholder="ABC-1234"
                      value={formData.vehiclePlate}
                      onChange={(e) => setFormData(prev => ({ ...prev, vehiclePlate: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2">
                    <label className="text-stone-600 text-xs font-bold">Tipo de veículo *</label>
                    <select
                      value={formData.vehicleType}
                      onChange={(e) => setFormData(prev => ({ ...prev, vehicleType: e.target.value as any }))}
                      className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium"
                    >
                      <option value="moto">Moto</option>
                      <option value="bicicleta">Bicicleta</option>
                      <option value="carro">Carro</option>
                      <option value="a_pe">A Pé</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-stone-600 text-xs font-bold">Observações</label>
                  <textarea
                    rows={2}
                    value={formData.observations}
                    onChange={(e) => setFormData(prev => ({ ...prev, observations: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm focus:border-emerald-500 font-medium"
                    placeholder="Adicione observações internas sobre o entregador..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setEditingDriver(null)}
                    className="px-5 py-2.5 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-250 transition-all text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-xl transition-all text-sm"
                  >
                    {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{savingEdit ? 'Salvando...' : 'Salvar'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deletion confirmation modal */}
      <AnimatePresence>
        {deletingDriverId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full border border-stone-100 p-6 sm:p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-650 mx-auto mb-5">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-stone-850 mb-2">Excluir Entregador</h3>
              <p className="text-stone-500 text-sm mb-6 leading-relaxed">
                Você tem certeza que deseja excluir permanentemente o entregador <strong className="text-stone-700">{deletingName}</strong>?<br/>
                Isso removerá seus dados do Firestore e desativará sua conta de acesso. Esta ação é irreversível.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeletingDriverId(null)}
                  className="px-5 py-2.5 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200 transition-all text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all text-sm"
                >
                  {isDeleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
