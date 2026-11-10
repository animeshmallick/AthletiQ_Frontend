import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { initNativeShell } from '@/app/native';
import { registerServiceWorker } from '@/app/web-push';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import { startVersionCheck } from '@/app/version-check';
import { addCrumb, logClientEvent, routeOf, startClientLog } from '@/app/client-log';
import { toast } from 'sonner';
import { tokenStore } from '@/lib/api';
import '@/styles/index.css';

void initNativeShell();
if (import.meta.env.PROD) {
  // Client-side logs (crashes, freezes, failed calls, reloads) for Audit log → Errors.
  startClientLog(() => tokenStore.get());
  router.subscribe((s) => addCrumb(`screen ${routeOf(s.location.pathname)}`));
  // Every error message the app shows ("Couldn't save…") is logged with where it happened.
  const showError = toast.error;
  toast.error = (message, data) => {
    const description = typeof data?.description === 'string' ? data.description : '';
    logClientEvent(
      'shown',
      `${typeof message === 'string' ? message : 'Error'}${description ? `: ${description}` : ''}`,
    );
    return showError(message, data);
  };
  void registerServiceWorker();
  // Phones keep the app open for hours: come back to the latest version after a deploy.
  startVersionCheck();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);

// Fade out the animated launch screen from index.html once the first frame is painted.
requestAnimationFrame(() => (window as { atqReady?: () => void }).atqReady?.());
