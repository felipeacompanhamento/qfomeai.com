import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker icons in Vite build
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const driverIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const customerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const restaurantIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface MapPoint {
  latitude: number;
  longitude: number;
  label?: string;
}

interface DeliveryTrackingMapProps {
  driverLocation?: MapPoint | null;
  customerLocation?: MapPoint | null;
  restaurantLocation?: MapPoint | null;
  height?: string;
}

function MapRecenter({ points }: { points: MapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    const validPoints = points.filter(p => p && p.latitude && p.longitude);
    if (validPoints.length === 0) return;

    if (validPoints.length === 1) {
      map.setView([validPoints[0].latitude, validPoints[0].longitude], 15);
    } else {
      const bounds = L.latLngBounds(
        validPoints.map(p => [p.latitude, p.longitude] as [number, number])
      );
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [points, map]);

  return null;
}

export default function DeliveryTrackingMap({
  driverLocation,
  customerLocation,
  restaurantLocation,
  height = '320px'
}: DeliveryTrackingMapProps) {
  const points: MapPoint[] = [];
  if (driverLocation?.latitude && driverLocation?.longitude) points.push(driverLocation);
  if (customerLocation?.latitude && customerLocation?.longitude) points.push(customerLocation);
  if (restaurantLocation?.latitude && restaurantLocation?.longitude) points.push(restaurantLocation);

  const initialCenter: [number, number] = points.length > 0 
    ? [points[0].latitude, points[0].longitude] 
    : [-23.55052, -46.633308]; // Default SP fallback if no coords

  return (
    <div style={{ height, width: '100%', borderRadius: '0.75rem', overflow: 'hidden', zIndex: 1 }}>
      <MapContainer
        center={initialCenter}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapRecenter points={points} />

        {driverLocation?.latitude && driverLocation?.longitude && (
          <Marker position={[driverLocation.latitude, driverLocation.longitude]} icon={driverIcon}>
            <Popup>{driverLocation.label || 'Entregador'}</Popup>
          </Marker>
        )}

        {customerLocation?.latitude && customerLocation?.longitude && (
          <Marker position={[customerLocation.latitude, customerLocation.longitude]} icon={customerIcon}>
            <Popup>{customerLocation.label || 'Endereço de Entrega'}</Popup>
          </Marker>
        )}

        {restaurantLocation?.latitude && restaurantLocation?.longitude && (
          <Marker position={[restaurantLocation.latitude, restaurantLocation.longitude]} icon={restaurantIcon}>
            <Popup>{restaurantLocation.label || 'Restaurante'}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
