import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrefsProvider } from '@/lib/prefs';
import { UIProvider } from '@/components/ui';
import App from './App';
import './index.css';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 20_000, retry: (n, e: any) => n < 2 && !(e?.status >= 400 && e?.status < 500), refetchOnWindowFocus: true } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <PrefsProvider>
        <UIProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <App />
          </BrowserRouter>
        </UIProvider>
      </PrefsProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);