import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/** Long-lived vendor chunks that cache well across deploys. */
function vendorChunk(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id))
    return 'react';
  if (/[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/.test(id)) return 'charts';
  if (/[\\/]node_modules[\\/]mapbox-gl[\\/]/.test(id)) return 'mapbox';
  if (/[\\/]node_modules[\\/](@radix-ui|radix-ui|lucide-react)[\\/]/.test(id)) return 'ui';
  return undefined;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    server: {
      port: 5173,
      // Same-origin API in development: the refresh cookie works without CORS/SameSite concerns.
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true },
      },
    },
    build: {
      sourcemap: true,
      // mapbox-gl (~1.9 MB) is its own lazily-loaded chunk, fetched only on map screens.
      chunkSizeWarningLimit: 2000,
      rollupOptions: { output: { manualChunks: vendorChunk } },
    },
  };
});
