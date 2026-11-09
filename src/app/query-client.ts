import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

export function createQueryClient() {
  const client: QueryClient = new QueryClient({
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
    mutationCache: new MutationCache({
      // Any change (attendance, a plan, feedback, an approval, a payment…) can finish a task, so
      // refresh the to-do counts on the bell, tabs and menu right away instead of on the next poll.
      onSuccess: () => void client.invalidateQueries({ queryKey: ['me', 'tasks'] }),
    }),
  });
  return client;
}
