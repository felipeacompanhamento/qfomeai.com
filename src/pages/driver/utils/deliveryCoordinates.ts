import { AssignedOrder, LatLng } from '../types';

export const getOrderCoordinates = (order: AssignedOrder): LatLng | null => {
  if (!order) return null;

  const candidates = [
    // Direct fields on order
    { lat: order.latitude, lng: order.longitude },
    { lat: order.lat, lng: order.lng ?? order.lon },

    // nested in deliveryAddress / endereco_entrega / enderecoEntrega / endereco
    { lat: order.deliveryAddress?.latitude, lng: order.deliveryAddress?.longitude },
    { lat: order.deliveryAddress?.lat, lng: order.deliveryAddress?.lng ?? order.deliveryAddress?.lon },
    { lat: order.deliveryAddress?.location?.lat, lng: order.deliveryAddress?.location?.lng },

    { lat: order.endereco_entrega?.latitude, lng: order.endereco_entrega?.longitude },
    { lat: order.endereco_entrega?.lat, lng: order.endereco_entrega?.lng ?? order.endereco_entrega?.lon },
    { lat: order.endereco_entrega?.coordenadas?.lat, lng: order.endereco_entrega?.coordenadas?.lng },

    { lat: order.enderecoEntrega?.latitude, lng: order.enderecoEntrega?.longitude },
    { lat: order.enderecoEntrega?.lat, lng: order.enderecoEntrega?.lng ?? order.enderecoEntrega?.lon },

    { lat: order.endereco?.latitude, lng: order.endereco?.longitude },
    { lat: order.endereco?.lat, lng: order.endereco?.lng ?? order.endereco?.lon },

    // nested in location / coordinates / coordenadas
    { lat: order.location?.lat ?? order.location?.latitude, lng: order.location?.lng ?? order.location?.longitude },
    { lat: order.coordinates?.latitude, lng: order.coordinates?.longitude },
    { lat: order.coordenadas?.lat, lng: order.coordenadas?.lng }
  ];

  for (const c of candidates) {
    if (c.lat !== undefined && c.lat !== null && c.lng !== undefined && c.lng !== null) {
      const latNum = typeof c.lat === 'string' ? parseFloat(c.lat) : Number(c.lat);
      const lngNum = typeof c.lng === 'string' ? parseFloat(c.lng) : Number(c.lng);

      if (
        Number.isFinite(latNum) &&
        Number.isFinite(lngNum) &&
        latNum >= -90 &&
        latNum <= 90 &&
        lngNum >= -180 &&
        lngNum <= 180 &&
        !(latNum === 0 && lngNum === 0)
      ) {
        return { latitude: latNum, longitude: lngNum };
      }
    }
  }

  return null;
};
