/**
 * Mapbox-powered maps. The heavy mapbox-gl bundle is imported dynamically, so it only loads on
 * screens that actually show a map. Without a token we fall back to plain coordinate inputs.
 */
import { MapPin, Navigation } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import type { GeoJSONSource, Map as MapboxMap, Marker as MapboxMarker } from 'mapbox-gl';
import { MAPBOX_TOKEN } from '@/lib/env';
import { cn } from '@/lib/utils';
import { Skeleton } from './ui/primitives';

export const hasMapbox = Boolean(MAPBOX_TOKEN);

let mapboxPromise: Promise<typeof mapboxgl> | null = null;

function loadMapbox() {
  mapboxPromise ??= Promise.all([import('mapbox-gl'), import('mapbox-gl/dist/mapbox-gl.css')]).then(
    ([m]) => {
      m.default.accessToken = MAPBOX_TOKEN;
      return m.default;
    },
  );
  return mapboxPromise;
}

/** GeoJSON polygon approximating a circle (for the geofence overlay). */
function circle(lng: number, lat: number, radiusM: number, steps = 64) {
  const coords: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
  };
}

const DEFAULT_CENTER: [number, number] = [77.5946, 12.9716]; // Bengaluru

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Interactive picker: click/drag the pin to set the location; the geofence radius is drawn live.
 */
export function LocationPicker({
  value,
  radiusMeters,
  onChange,
  className,
}: {
  value: LatLng | null;
  radiusMeters: number;
  onChange: (v: LatLng) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<MapboxMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let cancelled = false;
    void loadMapbox().then((mapboxgl) => {
      if (cancelled || !container.current) return;
      const center: [number, number] = value ? [value.longitude, value.latitude] : DEFAULT_CENTER;
      const map = new mapboxgl.Map({
        container: container.current,
        style: document.documentElement.classList.contains('dark')
          ? 'mapbox://styles/mapbox/dark-v11'
          : 'mapbox://styles/mapbox/streets-v12',
        center,
        zoom: value ? 16 : 11,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.AttributionControl({ compact: true }));
      const marker = new mapboxgl.Marker({ draggable: true, color: '#4f46e5' }).setLngLat(center);
      if (value) marker.addTo(map);
      const emit = (lng: number, lat: number) =>
        onChangeRef.current({
          latitude: Number(lat.toFixed(6)),
          longitude: Number(lng.toFixed(6)),
        });
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        emit(p.lng, p.lat);
      });
      map.on('click', (e) => {
        marker.setLngLat(e.lngLat).addTo(map);
        emit(e.lngLat.lng, e.lngLat.lat);
      });
      map.on('load', () => {
        map.addSource('fence', {
          type: 'geojson',
          data: circle(center[0], center[1], radiusMeters),
        });
        map.addLayer({
          id: 'fence-fill',
          type: 'fill',
          source: 'fence',
          paint: { 'fill-color': '#4f46e5', 'fill-opacity': 0.12 },
        });
        map.addLayer({
          id: 'fence-line',
          type: 'line',
          source: 'fence',
          paint: { 'line-color': '#4f46e5', 'line-width': 2 },
        });
        setReady(true);
      });
      mapRef.current = map;
      markerRef.current = marker;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker + geofence in sync with props.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !value) return;
    markerRef.current?.setLngLat([value.longitude, value.latitude]).addTo(map);
    const src = map.getSource('fence') as GeoJSONSource | undefined;
    src?.setData(circle(value.longitude, value.latitude, radiusMeters));
  }, [value, radiusMeters, ready]);

  function useMyLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const v = {
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        };
        onChange(v);
        mapRef.current?.flyTo({ center: [v.longitude, v.latitude], zoom: 16 });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className={cn('relative overflow-hidden rounded-xl border', className)}>
      <div ref={container} className="h-72 w-full" />
      {!ready && <Skeleton className="absolute inset-0 rounded-none" />}
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="absolute bottom-3 left-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-xs font-medium shadow-md hover:bg-muted disabled:opacity-60"
      >
        <Navigation className="size-3.5" /> {locating ? 'Locating…' : 'Use my location'}
      </button>
      {!value && ready && (
        <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-full bg-card/95 px-3 py-1.5 text-xs font-medium shadow">
          <MapPin className="mr-1 inline size-3.5" /> Click the map to drop a pin
        </div>
      )}
    </div>
  );
}

/** Lightweight static map (Mapbox Static Images API) — e.g. to review a coach check-in. */
export function StaticMap({
  center,
  radiusMeters,
  reading,
  className,
}: {
  center: LatLng;
  radiusMeters?: number;
  reading?: LatLng | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!hasMapbox) return null;
  const pins = [`pin-s+4f46e5(${center.longitude},${center.latitude})`];
  if (reading) pins.push(`pin-s-p+ef4444(${reading.longitude},${reading.latitude})`);
  const zoom = radiusMeters && radiusMeters > 500 ? 13 : 15;
  const style = document.documentElement.classList.contains('dark') ? 'dark-v11' : 'streets-v12';
  // Mapbox only accepts "padding" with an auto-fitted view; with a fixed centre it rejects the request.
  const view = reading ? 'auto' : `${center.longitude},${center.latitude},${zoom}`;
  const params = reading ? 'padding=40&' : '';
  const src = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${pins.join(',')}/${view}/600x300@2x?${params}access_token=${MAPBOX_TOKEN}`;
  if (failed) {
    return (
      <a
        href={`https://www.google.com/maps?q=${center.latitude},${center.longitude}`}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'flex aspect-[2/1] w-full flex-col items-center justify-center gap-1 rounded-xl border bg-muted/50 text-[12px] text-muted-foreground',
          className,
        )}
      >
        <MapPin className="size-5 text-primary" />
        <span className="tabular">
          {center.latitude.toFixed(5)}, {center.longitude.toFixed(5)}
        </span>
        <span className="font-medium text-primary">Open in Google Maps</span>
      </a>
    );
  }
  return (
    <img
      src={src}
      alt="Map of the location"
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn(
        'aspect-[2/1] h-auto w-full rounded-xl border bg-muted object-cover',
        className,
      )}
    />
  );
}
