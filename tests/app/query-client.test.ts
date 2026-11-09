import { MutationObserver } from '@tanstack/react-query';
import { createQueryClient } from '@/app/query-client';

describe('query client', () => {
  it('refreshes the to-do counts after any successful change', async () => {
    const client = createQueryClient();
    const tasks = jest.fn(async () => ({ total: 0 }));
    await client.fetchQuery({ queryKey: ['me', 'tasks'], queryFn: tasks });
    expect(tasks).toHaveBeenCalledTimes(1);

    const observer = new MutationObserver(client, { mutationFn: async () => 'saved' });
    await observer.mutate();
    expect(client.getQueryState(['me', 'tasks'])?.isInvalidated).toBe(true);

    // Failed changes leave the counts alone.
    client.setQueryData(['me', 'tasks'], { total: 0 });
    const failing = new MutationObserver(client, {
      mutationFn: async () => {
        throw new Error('nope');
      },
    });
    await failing.mutate().catch(() => {});
    expect(client.getQueryState(['me', 'tasks'])?.isInvalidated).toBe(false);
  });
});
