import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';

const getRestaurantStatusText = (status: string) => {
  switch (status) {
    case 'pendente': return 'Novo pedido';
    case 'aceito': return 'Aceito';
    case 'preparo': return 'Em preparo';
    case 'pronto': return 'Pronto';
    case 'entrega': return 'Saiu para entrega';
    case 'entregue': return 'Entregue';
    case 'cancelado': return 'Cancelado';
    case 'rejeitado': return 'Cancelado';
    case 'finalizado': return 'Entregue';
    default: return status;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pendente': return 'bg-red-100 text-red-600';
    case 'aceito': return 'bg-blue-100 text-blue-600';
    case 'preparo': return 'bg-yellow-100 text-yellow-600';
    case 'pronto': return 'bg-emerald-100 text-emerald-600';
    case 'entrega': return 'bg-purple-100 text-purple-600';
    case 'entregue': return 'bg-emerald-100 text-emerald-600';
    case 'finalizado': return 'bg-emerald-100 text-emerald-600';
    case 'cancelado': return 'bg-stone-100 text-stone-600';
    case 'rejeitado': return 'bg-stone-100 text-stone-600';
    default: return 'bg-stone-100 text-stone-600';
  }
};

const getOrderCardStyle = (status: string, isSelected: boolean) => {
  switch (status) {
    case 'pendente': return isSelected ? 'border-red-500 bg-red-50' : 'border-red-200 bg-red-50 hover:border-red-300';
    case 'aceito': return isSelected ? 'border-blue-500 bg-blue-50' : 'border-blue-200 bg-blue-50 hover:border-blue-300';
    case 'preparo': return isSelected ? 'border-yellow-500 bg-yellow-50' : 'border-yellow-200 bg-yellow-50 hover:border-yellow-300';
    case 'pronto': return isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-emerald-200 bg-emerald-50 hover:border-emerald-300';
    case 'entrega': return isSelected ? 'border-purple-500 bg-purple-50' : 'border-purple-200 bg-purple-50 hover:border-purple-300';
    case 'entregue': 
    case 'finalizado': return isSelected ? 'border-emerald-400 bg-emerald-50' : 'border-emerald-100 bg-emerald-50/50 hover:border-emerald-200';
    case 'cancelado':
    case 'rejeitado': return isSelected ? 'border-stone-400 bg-stone-100' : 'border-stone-200 bg-stone-50 hover:border-stone-300';
    default: return isSelected ? 'border-stone-800 bg-stone-50' : 'border-stone-100 hover:border-stone-200';
  }
};

interface OrderListItemProps {
  order: any;
  isSelected: boolean;
  onClick: (order: any) => void;
}

const OrderListItem = React.memo(({ order, isSelected, onClick }: OrderListItemProps) => {
  const [clientName, setClientName] = useState<string>(order.cliente_nome || 'Cliente');

  useEffect(() => {
    if ((!order.cliente_nome || order.cliente_nome === 'Cliente') && order.cliente_id) {
      const fetchClientName = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', order.cliente_id));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setClientName(userData.nome || userData.displayName || 'Cliente');
          }
        } catch (error) {
          console.error("Error fetching client name:", error);
        }
      };
      fetchClientName();
    } else if (order.cliente_nome) {
      setClientName(order.cliente_nome);
    }
  }, [order.cliente_id, order.cliente_nome]);

  return (
    <div 
      onClick={() => onClick(order)}
      className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${getOrderCardStyle(order.status, isSelected)}`}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-stone-500">#{order.id.slice(-6).toUpperCase()}</span>
          <span className="text-xs text-stone-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(order.data_criacao).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider ${getStatusColor(order.status)}`}>
          {getRestaurantStatusText(order.status)}
        </span>
      </div>
      
      <div className="mb-2">
        <p className="font-bold text-stone-800 truncate">{clientName.trim().split(' ')[0] || 'Cliente'}</p>
        <p className="text-xs text-stone-500 truncate mt-0.5">
          {order.itens?.map((i: any) => `${i.quantidade}x ${i.nome}`).join(', ')}
        </p>
      </div>

      <div className="flex justify-between items-center mt-3 pt-3 border-t border-stone-100">
        <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Total</span>
        <span className="text-sm font-bold text-stone-800">R$ {order.valor_total?.toFixed(2)}</span>
      </div>
    </div>
  );
});

export default OrderListItem;
export { getRestaurantStatusText, getStatusColor, getOrderCardStyle };
