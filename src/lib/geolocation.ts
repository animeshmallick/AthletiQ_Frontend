import { logClientEvent } from '@/app/client-log';

export interface GeoReading {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export class GeoError extends Error {}

/** One high-accuracy GPS reading with friendly errors. */
export function getCurrentPosition(timeoutMs = 15_000): Promise<GeoReading> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      logClientEvent('device', 'Location not available on this device');
      reject(new GeoError('Location is not available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }),
      (err) => {
        logClientEvent(
          'device',
          `Location error (${['', 'denied', 'unavailable', 'timeout'][err.code] ?? err.code})`,
          {
            details: { code: err.code, timeoutMs },
          },
        );
        const messages: Record<number, string> = {
          1: 'Location permission was denied. Allow location access for this site to check in.',
          2: 'Your location could not be determined. Move to an open area and try again.',
          3: 'Getting your location took too long. Please try again.',
        };
        reject(new GeoError(messages[err.code] ?? 'Could not get your location.'));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
