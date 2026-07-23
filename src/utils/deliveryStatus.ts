import { 
  OperationalDeliveryStatus, 
  CanonicalDeliveryStatus, 
  LegacyStatusEntrega, 
  LegacyOrderStatus 
} from '../types/delivery';

export interface MappedDeliveryStatus {
  deliveryStatus: OperationalDeliveryStatus;
  canonicalStatus: CanonicalDeliveryStatus;
  status_entrega: LegacyStatusEntrega;
  status: LegacyOrderStatus;
}

/**
 * Utility function to harmonize operational, canonical, and legacy status formats
 */
export function mapDeliveryStatus(operationalStatus: OperationalDeliveryStatus, currentOrderStatus?: string): MappedDeliveryStatus {
  switch (operationalStatus) {
    case 'UNASSIGNED':
      return {
        deliveryStatus: 'UNASSIGNED',
        canonicalStatus: 'UNASSIGNED',
        status_entrega: 'waiting',
        status: (currentOrderStatus as LegacyOrderStatus) || 'em preparo'
      };

    case 'ASSIGNED':
      return {
        deliveryStatus: 'ASSIGNED',
        canonicalStatus: 'ASSIGNED',
        status_entrega: 'waiting',
        status: 'pronto'
      };

    case 'ACCEPTED':
      return {
        deliveryStatus: 'ACCEPTED',
        canonicalStatus: 'ASSIGNED',
        status_entrega: 'waiting',
        status: 'pronto'
      };

    case 'REJECTED':
      return {
        deliveryStatus: 'REJECTED',
        canonicalStatus: 'UNASSIGNED',
        status_entrega: 'waiting',
        status: 'pronto'
      };

    case 'IN_TRANSIT':
      return {
        deliveryStatus: 'IN_TRANSIT',
        canonicalStatus: 'IN_TRANSIT',
        status_entrega: 'out_for_delivery',
        status: 'delivering'
      };

    case 'DELIVERED':
      return {
        deliveryStatus: 'DELIVERED',
        canonicalStatus: 'DELIVERED',
        status_entrega: 'delivered',
        status: 'completed'
      };

    case 'FAILED':
      return {
        deliveryStatus: 'FAILED',
        canonicalStatus: 'FAILED',
        status_entrega: 'failed',
        status: 'pronto' // Or keeps active status for re-assignment
      };

    case 'CANCELLED':
      return {
        deliveryStatus: 'CANCELLED',
        canonicalStatus: 'FAILED',
        status_entrega: 'failed',
        status: 'cancelado'
      };

    default:
      return {
        deliveryStatus: 'UNASSIGNED',
        canonicalStatus: 'UNASSIGNED',
        status_entrega: 'waiting',
        status: 'pendente'
      };
  }
}

export function formatDeliveryAddress(endereco: any): string {
  if (!endereco) return 'Endereço não informado';
  if (typeof endereco === 'string') return endereco;

  const rua = endereco.rua || endereco.endereco || '';
  const numero = endereco.numero || 'S/N';
  const bairro = endereco.bairro || '';
  const cidade = endereco.cidade || '';
  const estado = endereco.estado || '';
  const referencia = endereco.referencia ? ` (Ref: ${endereco.referencia})` : '';
  const complemento = endereco.complemento ? ` - ${endereco.complemento}` : '';

  const parts = [];
  if (rua) parts.push(`${rua}, nº ${numero}${complemento}`);
  if (bairro) parts.push(bairro);
  if (cidade) parts.push(estado ? `${cidade}/${estado}` : cidade);

  const formatted = parts.join(' - ');
  return formatted ? `${formatted}${referencia}` : 'Endereço não disponível';
}
