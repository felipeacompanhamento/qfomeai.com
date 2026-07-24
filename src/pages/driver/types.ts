export interface AssignedOrder {
  id: string;
  restaurantId?: string;
  restaurante_id?: string;
  driverId?: string;
  entregador_id?: string;
  customerName?: string;
  nome_cliente?: string;
  cliente?: {
    nome?: string;
    telefone?: string;
  };
  customerPhone?: string;
  telefone_cliente?: string;
  deliveryAddress?: any;
  endereco_entrega?: any;
  enderecoEntrega?: any;
  endereco?: any;
  deliveryStatus?: string;
  status_entrega?: string;
  status?: string;
  paymentMethod?: string;
  forma_pagamento?: string;
  metodo_pagamento?: string;
  paymentCollectedByDriver?: boolean;
  pago?: boolean;
  paymentStatus?: string;
  total?: number;
  valor_total?: number;
  totalValue?: number;
  data_criacao?: string;
  createdAt?: string;
  distancia_km?: number | string;
  distanceKm?: number | string;
  notes?: string;
  observacao?: string;
  items?: any[];
  itens?: any[];
  failureReason?: string;
  motivo_falha?: string;
  [key: string]: any;
}

export interface DriverInfo {
  uid?: string;
  id?: string;
  name?: string;
  nome?: string;
  email?: string;
  phone?: string;
  telefone?: string;
  restaurantId?: string;
  restauranteId?: string;
  availabilityStatus?: 'ONLINE' | 'OFFLINE';
  active?: boolean;
  status_conta?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  [key: string]: any;
}

export type GpsState = 
  | 'UNKNOWN'
  | 'REQUESTING_PERMISSION'
  | 'ACTIVE'
  | 'PAUSED'
  | 'DENIED'
  | 'UNAVAILABLE'
  | 'ERROR';

export type DriverTab = 'novas' | 'rota' | 'historico' | 'conta';

export interface OfflineActionItem {
  id: string;
  clientActionId: string;
  type: 'ACCEPT' | 'REJECT' | 'START' | 'DELIVER' | 'FAIL' | 'DRIVER_AVAILABILITY' | string;
  orderId?: string;
  restaurantId?: string;
  driverId?: string;
  availabilityStatus?: 'ONLINE' | 'OFFLINE';
  reason?: string;
  createdAt: string;
  retryCount?: number;
  lastError?: string;
  [key: string]: any;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}
