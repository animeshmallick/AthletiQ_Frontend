import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // Retry transient failures only — never 4xx (validation, permissions, not found).
        retry: (count, err) =>
          !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
      mutations: { retry: false },
    },
    mutationCache: new MutationCache(),
  });
}
