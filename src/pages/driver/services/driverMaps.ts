import { AssignedOrder, LatLng } from '../types';
import { getOrderCoordinates } from '../utils/deliveryCoordinates';
import { getOrderDestination } from '../utils/deliveryAddress';

export interface RouteBatch {
  batchIndex: number;
  totalBatches: number;
  orders: AssignedOrder[];
  url: string;
}

export const openSingleOrderInMaps = (order: AssignedOrder, currentLocation?: LatLng | null) => {
  if (!order) return;

  const coords = getOrderCoordinates(order);
  const dest = coords 
    ? `${coords.latitude},${coords.longitude}`
    : getOrderDestination(order);

  let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving&dir_action=navigate`;

  if (currentLocation && Number.isFinite(currentLocation.latitude) && Number.isFinite(currentLocation.longitude)) {
    url += `&origin=${currentLocation.latitude},${currentLocation.longitude}`;
  }

  try {
    const opened = window.open(url, '_blank');
    if (!opened) {
      window.location.href = url;
    }
  } catch {
    window.location.href = url;
  }
};

export const buildRouteBatches = (orders: AssignedOrder[], currentLocation?: LatLng | null): RouteBatch[] => {
  if (!orders || orders.length === 0) return [];

  const BATCH_SIZE = 4; // Max 4 orders per batch (3 waypoints + 1 destination)
  const batches: RouteBatch[] = [];
  const totalBatches = Math.ceil(orders.length / BATCH_SIZE);

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batchOrders = orders.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;

    // Last item in batch is the destination
    const destOrder = batchOrders[batchOrders.length - 1];
    const destCoords = getOrderCoordinates(destOrder);
    const destination = destCoords
      ? `${destCoords.latitude},${destCoords.longitude}`
      : getOrderDestination(destOrder);

    // Intermediate items are waypoints
    const waypointOrders = batchOrders.slice(0, batchOrders.length - 1);
    const waypoints = waypointOrders.map(o => {
      const c = getOrderCoordinates(o);
      return c ? `${c.latitude},${c.longitude}` : getOrderDestination(o);
    });

    let url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving&dir_action=navigate`;

    if (waypoints.length > 0) {
      url += `&waypoints=${waypoints.join('|')}`;
    }

    if (currentLocation && Number.isFinite(currentLocation.latitude) && Number.isFinite(currentLocation.longitude)) {
      url += `&origin=${currentLocation.latitude},${currentLocation.longitude}`;
    }

    batches.push({
      batchIndex,
      totalBatches,
      orders: batchOrders,
      url
    });
  }

  return batches;
};

export const openRouteInMaps = (orders: AssignedOrder[], currentLocation?: LatLng | null, batchIndex: number = 0) => {
  const batches = buildRouteBatches(orders, currentLocation);
  if (batches.length === 0) return;

  const targetBatch = batches[batchIndex] || batches[0];
  try {
    const opened = window.open(targetBatch.url, '_blank');
    if (!opened) {
      window.location.href = targetBatch.url;
    }
  } catch {
    window.location.href = targetBatch.url;
  }
};
