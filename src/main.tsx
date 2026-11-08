import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { initNativeShell } from '@/app/native';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import '@/styles/index.css';

void initNativeShell();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
