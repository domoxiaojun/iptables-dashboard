import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { router } from '@/router';
import { bootstrapTheme, useTheme } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import '@/styles/globals.css';
import '@/styles/animations.css';

// Apply persisted theme before React renders so dark-mode reload has no FOUC.
bootstrapTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

const ThemedToaster = () => {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-lg border border-[var(--c-hairline)] shadow-2',
        },
      }}
    />
  );
};

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ThemedToaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
