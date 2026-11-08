/** Runtime configuration (replaced by a stub in Jest, where `import.meta` is unavailable). */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const IS_DEV: boolean = import.meta.env.DEV;
/** Public Mapbox token (pk.*). Maps degrade gracefully to coordinate inputs when unset. */
export const MAPBOX_TOKEN: string = import.meta.env.VITE_MAPBOX_TOKEN ?? '';
