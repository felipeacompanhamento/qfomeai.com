// Haversine formula to calculate distance between two coordinates in km
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface RoutePoint {
  id: string; // Order ID
  latitude: number;
  longitude: number;
  [key: string]: any;
}

/**
 * Calculates simple nearest-neighbor sequence starting from origin
 */
export function sortOrdersByNearestNeighbor(
  startLat: number,
  startLng: number,
  points: RoutePoint[]
): RoutePoint[] {
  if (!points || points.length <= 1) return [...points];

  const unvisited = [...points];
  const sorted: RoutePoint[] = [];
  let currentLat = startLat;
  let currentLng = startLng;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const p = unvisited[i];
      const dist = calculateHaversineDistance(
        currentLat,
        currentLng,
        p.latitude,
        p.longitude
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestIdx = i;
      }
    }

    const [nextPoint] = unvisited.splice(nearestIdx, 1);
    sorted.push(nextPoint);
    currentLat = nextPoint.latitude;
    currentLng = nextPoint.longitude;
  }

  return sorted;
}
