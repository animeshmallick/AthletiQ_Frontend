import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { initNativeShell } from '@/app/native';
import { registerServiceWorker } from '@/app/web-push';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import '@/styles/index.css';

void initNativeShell();
if (import.meta.env.PROD) void registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
