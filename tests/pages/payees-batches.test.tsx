import { within } from '@testing-library/react';
import { PayeesPage } from '@/pages/admin/payees';
import { BatchesPage } from '@/pages/batches';
import { batch } from '../fixtures';
import { adminUser, chooseOption, mockApi, renderPage, screen, waitFor } from '../utils';

const society = {
  id: 'p1',
  name: 'Society',
  note: 'Secretary pays by UPI',
  isActive: true,
  owedNow: 43_750,
  unpaidDays: 9,
  earned: 131_250,
  paid: 87_500,
  lastPayout: { date: '2026-02-01', amount: 87_500 },
  expectedMonthly: 87_500,
  plans: 1,
  students: 2,
};
const insights = {
  payee: { ...society, createdAt: '2026-01-01T00:00:00Z' },
  period: { from: '2025-04-01', to: '2026-03-20' },
  summary: {
    owedNow: 43_750,
    unpaidSince: '2026-03-11',
    unpaidDays: 9,
    earned: 131_250,
    paid: 87_500,
    opening: 0,
    closing: 43_750,
    avgMonthly: 43_750,
    lifetimeEarned: 131_250,
    lifetimePaid: 87_500,
    payouts: 1,
    shares: 3,
    students: 2,
    lastPayout: { date: '2026-02-01', amount: 87_500 },
    expectedMonthly: 87_500,
    payoutRate: 67,
  },
  monthly: [
    { month: '2026-01', earned: 87_500, paid: 0 },
    { month: '2026-02', earned: 0, paid: 87_500 },
    { month: '2026-03', earned: 43_750, paid: 0 },
  ],
  sources: {
    byBatch: [{ id: 'b1', name: 'Morning U-12', amount: 131_250, count: 3 }],
    byPlan: [],
    byStudent: [{ id: 's1', name: 'Bilal', amount: 87_500, count: 2 }],
  },
  plans: [
    {
      id: 'plan1',
      name: '6 days',
      monthlyFee: 250_000,
      isActive: true,
      perStudent: 43_750,
      students: 2,
      expectedMonthly: 87_500,
      batches: [{ id: 'b1', name: 'Morning U-12', students: 2, expected: 87_500 }],
    },
  ],
  history: [
    {
      id: 'h1',
      kind: 'share',
      date: '2026-03-11',
      amount: 43_750,
      title: 'Share of Bilal’s fee',
      detail: 'ATQ/1 · Morning U-12',
      reversed: false,
      reversalReason: null,
      balance: 43_750,
    },
    {
      id: 'h2',
      kind: 'payout',
      date: '2026-02-01',
      amount: -87_500,
      title: 'Paid from academy cash',
      detail: 'Ref NEFT-1',
      reversed: false,
      reversalReason: null,
      balance: 0,
    },
  ],
};

describe('Payees', () => {
  it('lists payees with what they are owed and opens one with its insights', async () => {
    const api = mockApi({
      'GET /funds/payees/summary': () => [
        society,
        { ...society, id: 'p2', name: 'Old ground', isActive: false, owedNow: 0 },
      ],
      'GET /funds/payees/p1/insights': () => insights,
      'GET /funds/overview': () => ({ scope: 'academy', balances: { payeeDue: [] } }),
    });
    const { user, router } = await renderPage(<PayeesPage />, {
      path: '/payees',
      route: '/payees',
      user: adminUser,
    });
    // Retired payees are hidden until asked for.
    expect(await screen.findByText('Society')).toBeInTheDocument();
    expect(screen.queryByText('Old ground')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Society details' })).toHaveTextContent('9 days');
    await user.click(screen.getByRole('switch', { name: 'Show retired payees' }));
    expect(screen.getByText('Old ground')).toBeInTheDocument();
    // This financial year by default.
    expect(api.find('GET /funds/payees/summary')[0]!.query.get('from')).toMatch(/-04-01$/);

    await user.click(screen.getByRole('button', { name: 'Society details' }));
    const dialog = await screen.findByRole('dialog');
    expect(router.state.location.search).toContain('payee=p1');
    // Pay what is owed, in one tap.
    expect(within(dialog).getByRole('button', { name: /^Pay ₹/ })).toBeEnabled();
    expect(dialog).toHaveTextContent('Unpaid 9 days');
    expect(dialog).toHaveTextContent('67%');

    await user.click(within(dialog).getByRole('radio', { name: /History/ }));
    expect(within(dialog).getByText('Paid from academy cash')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Payments' }));
    expect(within(dialog).queryByText('Share of Bilal’s fee')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('radio', { name: /Plans/ }));
    expect(within(dialog).getByRole('link', { name: /Open split/ })).toHaveAttribute(
      'href',
      '/fee-plans?split=plan1',
    );
  });
});

describe('Batches smart filter', () => {
  const chess = {
    ...batch,
    id: 'b2',
    name: 'Chess Club',
    weekdays: [6],
    sport: { id: 'sp2', name: 'Chess' },
    location: { ...batch.location, id: 'l2', name: 'Namma' },
    memberCount: 20,
    capacity: 20,
  };

  it('filters by sport, day and seats, with removable chips', async () => {
    mockApi({
      'GET /batches': () => [batch, chess],
      'GET /dashboard': () => ({ batchHealth: [] }),
    });
    const { user, router } = await renderPage(<BatchesPage />, {
      path: '/batches',
      route: '/batches',
      user: adminUser,
    });
    expect(await screen.findByText('Morning U-12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await chooseOption(user, await screen.findByLabelText('Filter by sport'), 'sp2');
    await waitFor(() => expect(screen.queryByText('Morning U-12')).not.toBeInTheDocument());
    expect(screen.getByText('Chess Club')).toBeInTheDocument();
    await chooseOption(user, screen.getByLabelText('Filter by seats'), 'open');
    expect(screen.queryByText('Chess Club')).not.toBeInTheDocument();
    expect(screen.getByText(/0 of 2 batch/)).toBeInTheDocument();
    expect(router.state.location.search).toContain('sport=sp2');

    await user.click(screen.getByRole('button', { name: 'Remove filter: Has seats' }));
    expect(screen.getByText('Chess Club')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove filter: Chess' }));
    expect(screen.getByText('Morning U-12')).toBeInTheDocument();
  });
});
