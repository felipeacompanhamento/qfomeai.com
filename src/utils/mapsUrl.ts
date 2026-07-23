export interface MapWayPoint {
  latitude: number;
  longitude: number;
  address?: string;
}

/**
 * Generates universal Google Maps URL for navigation
 */
export function generateGoogleMapsUrl(
  origin: MapWayPoint | null,
  destinations: MapWayPoint[]
): string[] {
  if (!destinations || destinations.length === 0) return [];

  const formatPoint = (pt: MapWayPoint) => {
    if (pt.latitude && pt.longitude) {
      return `${pt.latitude},${pt.longitude}`;
    }
    return encodeURIComponent(pt.address || '');
  };

  const urls: string[] = [];

  // Split destinations into chunks of max 4 stops (origin + max 3 waypoints + destination)
  const chunkSize = 4;
  for (let i = 0; i < destinations.length; i += chunkSize) {
    const chunk = destinations.slice(i, i + chunkSize);
    const startPt = i === 0 ? origin : destinations[i - 1];
    const finalPt = chunk[chunk.length - 1];
    const waypoints = chunk.slice(0, chunk.length - 1);

    let url = `https://www.google.com/maps/dir/?api=1&destination=${formatPoint(finalPt)}`;

    if (startPt) {
      url += `&origin=${formatPoint(startPt)}`;
    }

    if (waypoints.length > 0) {
      const waypointsStr = waypoints.map(wp => formatPoint(wp)).join('|');
      url += `&waypoints=${waypointsStr}`;
    }

    url += `&travelmode=driving`;
    urls.push(url);
  }

  return urls;
}
