import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip } from 'react-leaflet';
import L from 'leaflet';

/** Smoothly animates between position updates so the bus glides instead of jumping. */
function useGlide(target, ms = 1200) {
  const [pos, setPos] = useState(target);
  const from = useRef(target);
  const cur = useRef(target);
  useEffect(() => {
    if (!target) return undefined;
    if (!cur.current) { cur.current = target; setPos(target); return undefined; }
    from.current = cur.current;
    const t0 = performance.now();
    let raf;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      cur.current = { lat: from.current.lat + (target.lat - from.current.lat) * e, lng: from.current.lng + (target.lng - from.current.lng) * e };
      setPos(cur.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target?.lat, target?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return pos;
}

const busIcon = (heading) => L.divIcon({
  className: '',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: `<div style="width:40px;height:40px;border-radius:50%;background:#0B1426;border:3px solid #14E0C3;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.35)">
    <svg width="22" height="22" viewBox="0 0 24 24" style="transform:rotate(${heading}deg)" fill="#14E0C3"><path d="M12 2l7 18-7-4-7 4z"/></svg></div>`,
});

/**
 * Road line, stops and a bus marker that is either LIVE GPS or SIMULATED (map.positionSource).
 * map = { line: [[lat,lng]...], position: {lat,lng,headingDeg}, geometrySource, note }
 */
export default function TrackingMap({ map, stops = [], height = 380 }) {
  const glide = useGlide(map?.position ? { lat: map.position.lat, lng: map.position.lng } : null);
  const heading = Math.round((map?.position?.headingDeg || 0) / 5) * 5;
  const icon = useMemo(() => busIcon(heading), [heading]);
  if (!map?.line?.length) return null;
  const bounds = map.offRoute && map.position ? [...map.line, [map.position.lat, map.position.lng]] : map.line;
  const straight = map.geometrySource !== 'osrm';
  const isGps = map.positionSource === 'gps';
  const isLast = map.positionSource === 'gps-last';
  return (
    <div>
      <div style={{ height }} className="rounded-2xl overflow-hidden ring-1 ring-slate-200 relative">
        <MapContainer bounds={bounds} boundsOptions={{ padding: [30, 30] }} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={map.line} pathOptions={{ color: '#0B1426', weight: 6, opacity: 0.25 }} />
          <Polyline positions={map.line} pathOptions={{ color: '#0AA893', weight: 3.5, dashArray: straight ? '8 8' : undefined }} />
          {stops.filter((s) => Number.isFinite(s.lat)).map((s, i) => (
            <CircleMarker key={i} center={[s.lat, s.lng]} radius={s.kind === 'stop' ? 6 : 9} pathOptions={{ color: '#0B1426', weight: 2, fillColor: s.passed ? '#14E0C3' : '#ffffff', fillOpacity: 1 }}>
              <Tooltip direction="top" offset={[0, -6]}>{s.name}{s.passed ? ' (passed)' : ''}</Tooltip>
            </CircleMarker>
          ))}
          {glide && (
            <Marker position={[glide.lat, glide.lng]} icon={icon} zIndexOffset={1000}>
              <Popup>{isGps ? 'Live GPS position' : isLast ? 'Last verified position' : 'Simulated bus position'}</Popup>
            </Marker>
          )}
        </MapContainer>
        <span className={`absolute top-3 right-3 z-[500] rounded-full text-xs font-semibold px-2.5 py-1 shadow ${isGps && !map.offRoute ? 'bg-teal-aura text-midnight' : 'bg-amber-aura text-midnight'}`}>{isGps ? (map.offRoute ? 'LIVE GPS (off route)' : 'LIVE GPS') : isLast ? 'GPS LOST - last position' : 'SIMULATED position'}</span>
      </div>
      <p className="text-xs text-slate-aura mt-2">{map.note}{straight && ' Road routing needs an internet connection from the server.'}</p>
    </div>
  );
}
