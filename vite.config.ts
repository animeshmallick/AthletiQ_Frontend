import { execSync } from 'node:child_process';
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

/** Commit this build came from: Amplify provides AWS_COMMIT_ID; locally ask git. */
function buildCommit(env: Record<string, string>): string | null {
  if (env.AWS_COMMIT_ID) return env.AWS_COMMIT_ID.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    // Shown to admins (More → Deployments) to confirm what's live.
    define: {
      __BUILD__: JSON.stringify({ commit: buildCommit(env), builtAt: new Date().toISOString() }),
    },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
    server: {
      port: 5173,
      // Same-origin API in development: the refresh cookie works without CORS/SameSite concerns.
      proxy: {
        '/api': { target: env.API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true },
        '/ready': { target: env.API_PROXY_TARGET || 'http://localhost:4000', changeOrigin: true },
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
