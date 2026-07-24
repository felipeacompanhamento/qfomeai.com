import { AssignedOrder } from '../types';

export interface AddressComponents {
  street: string;
  number: string;
  complement: string;
  reference: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  country: string;
}

export const extractAddressComponents = (order: AssignedOrder): AddressComponents => {
  if (!order) {
    return {
      street: '',
      number: '',
      complement: '',
      reference: '',
      neighborhood: '',
      city: '',
      state: '',
      cep: '',
      country: 'Brasil'
    };
  }

  const addrObj =
    order.deliveryAddress ||
    order.endereco_entrega ||
    order.enderecoEntrega ||
    order.endereco ||
    {};

  const street =
    addrObj.rua ||
    addrObj.street ||
    addrObj.logradouro ||
    order.rua ||
    order.street ||
    '';

  const number =
    addrObj.numero ||
    addrObj.number ||
    addrObj.número ||
    order.numero ||
    order.number ||
    'S/N';

  const complement =
    addrObj.complemento ||
    addrObj.complement ||
    order.complemento ||
    '';

  const reference =
    addrObj.ponto_referencia ||
    addrObj.pontoReferencia ||
    addrObj.referencia ||
    addrObj.reference ||
    order.ponto_referencia ||
    order.referencia ||
    '';

  const neighborhood =
    addrObj.bairro ||
    addrObj.neighborhood ||
    order.bairro ||
    '';

  const city =
    addrObj.cidade ||
    addrObj.city ||
    order.cidade ||
    '';

  const state =
    addrObj.estado ||
    addrObj.state ||
    addrObj.uf ||
    order.estado ||
    order.uf ||
    '';

  const cep =
    addrObj.cep ||
    addrObj.zipCode ||
    addrObj.zip_code ||
    order.cep ||
    '';

  const country =
    addrObj.pais ||
    addrObj.país ||
    addrObj.country ||
    'Brasil';

  return {
    street: String(street).trim(),
    number: String(number).trim(),
    complement: String(complement).trim(),
    reference: String(reference).trim(),
    neighborhood: String(neighborhood).trim(),
    city: String(city).trim(),
    state: String(state).trim(),
    cep: String(cep).trim(),
    country: String(country).trim()
  };
};

export const buildOrderAddressFormatted = (order: AssignedOrder): string => {
  const c = extractAddressComponents(order);
  const parts: string[] = [];

  if (c.street) {
    let mainStreet = c.street;
    if (c.number && c.number !== 'S/N') {
      mainStreet += `, ${c.number}`;
    } else if (c.number === 'S/N') {
      mainStreet += ', S/N';
    }
    parts.push(mainStreet);
  }

  if (c.complement) parts.push(c.complement);
  if (c.neighborhood) parts.push(c.neighborhood);
  if (c.city) {
    if (c.state) {
      parts.push(`${c.city} - ${c.state}`);
    } else {
      parts.push(c.city);
    }
  } else if (c.state) {
    parts.push(c.state);
  }

  if (c.cep) parts.push(c.cep);
  if (c.country && c.country !== 'Brasil') parts.push(c.country);

  // Fallback if parts is empty but order has formatted text string
  if (parts.length === 0) {
    if (typeof order.endereco === 'string' && order.endereco.trim()) return order.endereco.trim();
    if (typeof order.endereco_entrega === 'string' && order.endereco_entrega.trim()) return order.endereco_entrega.trim();
    if (typeof order.deliveryAddress === 'string' && order.deliveryAddress.trim()) return order.deliveryAddress.trim();
    return 'Endereço não informado';
  }

  return parts.join(', ');
};

export const buildOrderAddressForMaps = (order: AssignedOrder): string => {
  const c = extractAddressComponents(order);
  const parts: string[] = [];

  if (c.street) parts.push(c.street);
  if (c.number) parts.push(c.number);
  if (c.complement) parts.push(c.complement);
  if (c.neighborhood) parts.push(c.neighborhood);
  if (c.city) parts.push(c.city);
  if (c.state) parts.push(c.state);
  if (c.cep) parts.push(c.cep);
  parts.push(c.country || 'Brasil');

  const cleanString = parts
    .filter(p => p && p !== 'null' && p !== 'undefined')
    .join(', ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  return encodeURIComponent(cleanString);
};

export const getOrderDestination = (order: AssignedOrder): string => {
  // Priority: Valid coordinates -> Address fallback
  const orderCoords = (order as any).coords || null;
  if (orderCoords && Number.isFinite(orderCoords.latitude) && Number.isFinite(orderCoords.longitude)) {
    return `${orderCoords.latitude},${orderCoords.longitude}`;
  }
  return buildOrderAddressForMaps(order);
};
