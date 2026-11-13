import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const icon = L.icon({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });

/** OpenStreetMap view. points: [{ lat, lng, label }]. Renders nothing if no coordinates are available. */
export default function MapView({ points = [], line = false, height = 260 }) {
  const pts = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pts.length) return null;
  const bounds = pts.map((p) => [p.lat, p.lng]);
  return (
    <div style={{ height }} className="rounded-2xl overflow-hidden ring-1 ring-slate-200">
      <MapContainer bounds={bounds} boundsOptions={{ padding: [30, 30] }} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {pts.map((p, i) => <Marker key={i} position={[p.lat, p.lng]} icon={icon}><Popup>{p.label}</Popup></Marker>)}
        {line && pts.length > 1 && <Polyline positions={bounds} pathOptions={{ color: '#0AA893', weight: 4, dashArray: '6 8' }} />}
      </MapContainer>
    </div>
  );
}
