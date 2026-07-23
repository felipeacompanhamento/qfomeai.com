import React, { useState, useEffect } from 'react';
import { 
  Clock, ShoppingBag, MapPin, Phone, User, Bike, Check,
  ExternalLink, Calendar, Loader2, ClipboardList
} from 'lucide-react';
import { db, auth } from '../../../firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

interface AssignedOrder {
  id: string;
  cliente_nome: string;
  cliente_telefone?: string;
  endereco_entrega?: {
    endereco?: string;
    rua?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    complemento?: string;
    referencia?: string;
    latitude?: number;
    longitude?: number;
  } | string;
  endereco?: {
    rua?: string;
    endereco?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    complemento?: string;
    referencia?: string;
    latitude?: number;
    longitude?: number;
  } | null;
  coordenadas_entrega?: {
    latitude: number;
    longitude: number;
  } | null;
  latitude_entrega?: number | null;
  longitude_entrega?: number | null;
  status: string;
  status_entrega?: string; // 'waiting', 'out_for_delivery', 'delivered'
  valor_total: number;
  data_criacao: string;
  driverId?: string;
  driverName?: string;
  horario_saida?: string;
  horario_entrega?: string;
  numero_pedido?: number | string;
}

export default function AssignedDeliveries() {
  const [deliveries, setDeliveries] = useState<AssignedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);

  // 1. Get restaurant ID of logged-in user
  useEffect(() => {
    const fetchRestaurantId = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        
        // Fetch user doc
        const idToken = await user.getIdToken();
        const userDocRes = await fetch('/api/restaurant/delivery-settings', {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (userDocRes.ok) {
          // Token includes restaurantId or user has restaurantId in doc
          const profileDocSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
          if (!profileDocSnap.empty) {
            const pData = profileDocSnap.docs[0].data();
            setRestaurantId(pData.restaurantId || user.uid);
          } else {
            setRestaurantId(user.uid);
          }
        }
      } catch (err) {
        console.error('Error identifying signed-in restaurant:', err);
      }
    };
    fetchRestaurantId();
  }, []);

  // 2. Set up real-time orders observer
  useEffect(() => {
    if (!restaurantId) {
      if (loading && restaurantId === null) {
        // Just delay state
        const timer = setTimeout(() => setLoading(false), 1500);
        return () => clearTimeout(timer);
      }
      return;
    }

    setLoading(true);
    const ordersRef = collection(db, 'orders');
    // Query active orders for this restaurant
    const q = query(
      ordersRef, 
      where('restaurante_id', '==', restaurantId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d
        } as any;
      });

      // Filter for orders that have active driver assignment
      // (either structured field driverId, entregador_id, status_entrega exists, etc.)
      const assigned = allOrders.filter(order => 
        order.driverId || order.entregador_id || order.driverName || order.status === 'delivering'
      );

      setDeliveries(assigned);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to assigned deliveries:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [restaurantId]);

  const renderAddress = (enderecoObj: any) => {
    if (!enderecoObj) return 'Endereço não disponível';
    if (typeof enderecoObj === 'string') return enderecoObj;
    
    const { endereco, numero, bairro, referencia } = enderecoObj;
    return `${endereco}, nº ${numero || "S/N"} - ${bairro}${referencia ? ` (Ref: ${referencia})` : ''}`;
  };

  const getStatusStyle = (status: string, entregaStatus?: string) => {
    if (status === 'completed' || entregaStatus === 'delivered') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (status === 'delivering' || entregaStatus === 'out_for_delivery') {
      return 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse';
    }
    return 'bg-stone-50 text-stone-600 border-stone-200';
  };

  const getStatusLabel = (status: string, entregaStatus?: string) => {
    if (status === 'completed' || entregaStatus === 'delivered') return 'Entregue';
    if (status === 'delivering' || entregaStatus === 'out_for_delivery') return 'Saiu para Entrega';
    return 'Pendente';
  };

  return (
    <div className="space-y-6 font-sans">
      <div>
        <h2 className="text-2xl font-bold text-stone-800">Entregas Atribuídas</h2>
        <p className="text-stone-500 text-sm">Controle em tempo real de pedidos atribuídos e rotas ativas da sua frota.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-stone-200">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
          <p className="text-stone-500 text-sm font-medium">Buscando entregas atribuídas...</p>
        </div>
      ) : deliveries.length === 0 ? (
        <div className="p-12 bg-white rounded-[2rem] border border-stone-200 text-center">
          <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-stone-100">
            <ClipboardList className="w-8 h-8 text-stone-300" />
          </div>
          <h3 className="text-lg font-bold text-stone-800 mb-1">Nenhuma entrega atribuída ainda</h3>
          <p className="text-stone-500 text-sm max-w-sm mx-auto leading-relaxed">
            Nenhuma mercadoria saiu para rota com entregador no momento. Quando um entregador assumir ou for atribuído a um pedido, ele aparecerá nesta tela.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {deliveries.map((delivery) => (
            <div 
              key={delivery.id}
              className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4 hover:shadow-lg transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <span className="bg-stone-100 text-stone-800 text-xs font-black px-2.5 py-1 rounded-lg">
                    #{delivery.numero_pedido || delivery.id.substring(0, 6).toUpperCase()}
                  </span>
                  <span className="text-xs text-stone-400 font-bold flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {delivery.data_criacao ? new Date(delivery.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getStatusStyle(delivery.status, delivery.status_entrega)}`}>
                  {getStatusLabel(delivery.status, delivery.status_entrega)}
                </span>
              </div>

              {/* Order content detail */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <User className="w-4.5 h-4.5 text-stone-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Cliente</p>
                      <p className="font-bold text-stone-850 hover:text-emerald-600 transition-colors cursor-pointer">{delivery.cliente_nome}</p>
                      {delivery.cliente_telefone && (
                        <p className="text-emerald-600 text-xs font-medium flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {delivery.cliente_telefone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4.5 h-4.5 text-stone-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Endereço de Entrega</p>
                      <p className="text-stone-600 font-medium leading-relaxed text-xs">
                        {renderAddress(delivery.endereco_entrega)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5 sm:border-l sm:border-stone-105 sm:pl-4">
                  <div className="flex items-start gap-2.5">
                    <Bike className="w-4.5 h-4.5 text-stone-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Entregador Responsável</p>
                      <p className="font-bold text-stone-850">{delivery.driverName || 'Administração / Próprio'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-xs text-stone-500">
                    <Clock className="w-4.5 h-4.5 text-stone-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div>
                        <span className="font-bold text-stone-450 mr-1">Saída:</span>
                        <span className="font-medium text-stone-700">
                          {delivery.horario_saida ? new Date(delivery.horario_saida).toLocaleTimeString('pt-BR') : 'Aguardando saída'}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-stone-450 mr-1">Entrega:</span>
                        <span className="font-medium text-stone-700">
                          {delivery.horario_entrega ? new Date(delivery.horario_entrega).toLocaleTimeString('pt-BR') : 'Aguardando finalização'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-stone-50 rounded-2xl p-3 flex sm:items-center justify-between gap-2 flex-col sm:flex-row border border-stone-100">
                <span className="text-xs text-stone-500 font-medium">Valor total do Pedido</span>
                <span className="font-black text-stone-850 text-base">
                  {delivery.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
