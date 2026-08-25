import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, UserPlus, 
  Bike, Car, Compass, Smile, Clock,
  Phone, Mail, FileText, ChevronRight, Info, AlertCircle
} from 'lucide-react';
import { auth } from '../../../firebase';
import { motion } from 'motion/react';
import { Card, Badge, Button, SearchInput, LoadingState, EmptyState } from '../../../components/ui';

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
  locationSharingEnabled?: boolean;
  deliveryAreas?: string[];
  deliveryRadiusKm?: number;
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

  // Searching & Filtering logic
  const filteredDrivers = drivers.filter(driver => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      driver.name.toLowerCase().includes(term) ||
      (driver.nickname && driver.nickname.toLowerCase().includes(term)) ||
      driver.email.toLowerCase().includes(term) ||
      driver.phone.includes(term);

    if (!matchesSearch) return false;

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
      case 'a_pe': return <Smile className="w-4 h-4 text-stone-500" />;
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
        return (
          <Badge 
            variant="success" 
            icon={<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
          >
            Online
          </Badge>
        );
      case 'ON_DELIVERY':
        return (
          <Badge 
            variant="info" 
            icon={<span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
          >
            Em entrega
          </Badge>
        );
      default:
        return (
          <Badge 
            variant="neutral" 
            icon={<span className="w-1.5 h-1.5 rounded-full bg-stone-400" />}
          >
            Offline
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Entregadores (Visão Operacional)</h2>
          <p className="text-stone-500 text-sm">Acompanhamento de disponibilidade e dados operacionais de entrega.</p>
        </div>
        <Button
          onClick={() => navigate('/restaurant/gestao/equipe')}
          icon={<UserPlus className="w-4 h-4" />}
          variant="primary"
          size="md"
        >
          Gerenciar Equipe
        </Button>
      </div>

      {/* Centralization Notice */}
      <Card padding="md" className="bg-stone-50/50 border border-stone-200/80 flex items-start gap-3.5">
        <Info className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-extrabold text-sm text-stone-850">Gestão Unificada de Usuários</p>
          <p className="text-stone-500 text-xs font-semibold leading-relaxed">
            A criação, alteração de dados de contato, redefinição de senha e alteração de status de entregadores é realizada centralizadamente na tela de <strong className="text-stone-750">Equipe</strong>.
          </p>
        </div>
      </Card>

      {/* Filter and search panel */}
      <Card padding="sm" className="flex flex-col md:flex-row gap-4">
        <SearchInput
          placeholder="Buscar por nome, e-mail ou WhatsApp..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', 'ACTIVE', 'INACTIVE', 'ONLINE', 'OFFLINE', 'ON_DELIVERY'] as const).map((filter) => {
            const labels = {
              ALL: 'Todos',
              ACTIVE: 'Ativos',
              INACTIVE: 'Inativos',
              ONLINE: 'Online',
              OFFLINE: 'Offline',
              ON_DELIVERY: 'Em Entrega'
            };
            const isActive = statusFilter === filter;
            return (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                {labels[filter]}
              </button>
            );
          })}
        </div>
      </Card>

      {loading ? (
        <LoadingState message="Buscando entregadores..." />
      ) : error ? (
        <div className="p-12 bg-white rounded-3xl border border-stone-200 text-center text-stone-600">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-stone-800 mb-2">Erro ao carregar entregadores</h3>
          <p className="text-stone-500 text-sm max-w-sm mx-auto mb-6">{error}</p>
          <Button 
            onClick={fetchDrivers}
            variant="secondary"
            size="sm"
          >
            Tentar Novamente
          </Button>
        </div>
      ) : filteredDrivers.length === 0 ? (
        <EmptyState
          title="Nenhum entregador encontrado"
          description={
            searchTerm || statusFilter !== 'ALL' 
              ? 'Tente ajustar os critérios de pesquisa ou filtros para encontrar o que procura.' 
              : 'Você ainda não cadastrou entregadores. Clique no botão acima para cadastrar na tela de Equipe!'
          }
          icon={Users}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDrivers.map((driver) => (
            <Card
              key={driver.id}
              hoverable
              className={`transition-all flex flex-col justify-between ${
                driver.status === 'ACTIVE' ? '' : 'opacity-70'
              }`}
            >
              <div>
                {/* Header info */}
                <div className="flex items-start justify-between gap-2 mb-4">
                  <div>
                    <h4 className="font-extrabold text-base text-stone-850 line-clamp-1">{driver.name}</h4>
                    {driver.nickname && (
                      <p className="text-stone-400 text-xs font-bold">Apelido: {driver.nickname}</p>
                    )}
                  </div>
                  {getAvailabilityBadge(driver.availabilityStatus)}
                </div>

                {/* Main driver data */}
                <div className="space-y-3 pt-3 text-stone-600 text-xs font-semibold border-t border-stone-100">
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-stone-400 shrink-0" />
                    <span className="truncate text-stone-700">{driver.phone}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-stone-400 shrink-0" />
                    <span className="truncate text-stone-700">{driver.email}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {getVehicleIcon(driver.vehicleType)}
                    <span className="text-stone-700">
                      {getVehicleLabel(driver.vehicleType)}
                      {driver.vehiclePlate && (
                        <span className="text-stone-500 text-xs ml-1.5 bg-stone-100 px-1.5 py-0.5 rounded font-mono font-bold border border-stone-200/50">
                          {driver.vehiclePlate}
                        </span>
                      )}
                    </span>
                  </div>

                  {driver.cpf && (
                    <div className="flex items-center gap-2.5 text-stone-500">
                      <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                      <span>CPF: {driver.cpf}</span>
                    </div>
                  )}

                  {driver.deliveryAreas && driver.deliveryAreas.length > 0 && (
                    <div className="pt-1 space-y-0.5">
                      <span className="font-bold text-stone-500 block text-xs">Áreas de entrega</span>
                      <span className="text-stone-700 block truncate" title={driver.deliveryAreas.join(', ')}>
                        {driver.deliveryAreas.join(', ')} (raio: {driver.deliveryRadiusKm || 8}km)
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="font-semibold text-stone-500">Localização GPS:</span>
                    <Badge variant={driver.locationSharingEnabled !== false ? 'success' : 'neutral'} size="sm">
                      {driver.locationSharingEnabled !== false ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2.5 text-stone-500">
                    <Clock className="w-4 h-4 text-stone-400 shrink-0" />
                    <span>Cadastrado em: {new Date(driver.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              </div>

              {/* Redirect Action */}
              <div className="flex items-center justify-end pt-4 mt-6 border-t border-stone-100">
                <Button
                  onClick={() => navigate('/restaurant/settings/team')}
                  variant="secondary"
                  size="sm"
                  icon={<ChevronRight className="w-4 h-4" />}
                  iconPosition="right"
                >
                  Gerenciar na Equipe
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
