import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { CollectedByCard, CollectedByChart, financeRange } from '@/components/collected-by';
import { mockApi, testQueryClient } from '../utils';

const rows = [
  { userId: 'a1', name: 'Asha Admin', role: 'admin' as const, amount: 300_000, count: 2 },
  { userId: 'c1', name: 'Coach Ravi', role: 'coach' as const, amount: 100_000, count: 1 },
];

describe('CollectedByChart', () => {
  it('lists who received the money with shares', () => {
    render(<CollectedByChart rows={rows} />);
    expect(screen.getByText('Asha Admin')).toBeInTheDocument();
    expect(screen.getByText('2 payments · 75%')).toBeInTheDocument();
    expect(screen.getByText('1 payment · 25%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /₹4,000 in total/ })).toBeInTheDocument();
  });

  it('says when nothing was received', () => {
    render(<CollectedByChart rows={[]} />);
    expect(screen.getByText('No payments received in this period.')).toBeInTheDocument();
  });
});

describe('CollectedByCard', () => {
  it('loads the period and switches it', async () => {
    const user = userEvent.setup();
    const api = mockApi({ 'GET /finance/summary': () => ({ byReceiver: rows }) });
    render(
      <QueryClientProvider client={testQueryClient()}>
        <CollectedByCard admin />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Fees collected by')).toBeInTheDocument();
    expect(await screen.findByText('Coach Ravi')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'This FY' }));
    await waitFor(() =>
      expect(
        api.find('GET /finance/summary').some((c) => c.query.get('from')?.endsWith('-04-01')),
      ).toBe(true),
    );
  });

  it('shows a coach their own total and load errors', async () => {
    mockApi({
      'GET /finance/summary': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'x' } },
      }),
    });
    render(
      <QueryClientProvider client={testQueryClient()}>
        <CollectedByCard admin={false} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Fees I received')).toBeInTheDocument();
    expect(await screen.findByText('Could not load collections.')).toBeInTheDocument();
  });

  it('computes period ranges', () => {
    expect(financeRange('quarter').from < financeRange('month').to).toBe(true);
    expect(financeRange('last-month').to < financeRange('month').from).toBe(true);
  });
});
