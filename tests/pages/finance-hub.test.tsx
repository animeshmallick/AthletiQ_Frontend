import { FinanceHubPage } from '@/pages/finance-hub';
import { coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const page = <T,>(data: T[]) => ({
  data,
  meta: { page: 1, pageSize: 25, total: data.length, totalPages: 1, totalAmount: 0 },
});

describe('Finance screen', () => {
  it('has Finance, Money and Invoices tabs', async () => {
    const api = mockApi({
      'GET /finance/summary': () => ({
        range: { from: '2026-03-01', to: '2026-03-09' },
        totals: {
          billed: 1_000_000,
          invoicesIssued: 4,
          discounts: 0,
          collected: 250_000,
          paymentsReceived: 1,
          refunded: 0,
          due: 250_000,
          dueCount: 1,
          overdue: 500_000,
          overdueCount: 2,
          outstanding: 750_000,
          collectionRate: 25,
        },
        trend: [{ month: '2026-03', billed: 1_000_000, collected: 250_000 }],
        byPaymentMode: [{ mode: 'upi', amount: 250_000, count: 1 }],
        byReceiver: [
          { userId: 'c1', name: 'Coach Arjun', role: 'coach', amount: 250_000, count: 1 },
        ],
        byBatch: [
          {
            batchId: 'b1',
            batchName: 'Morning U-12',
            coachId: 'c',
            coachName: 'Ravi',
            billed: 1_000_000,
            outstanding: 750_000,
            overdue: 500_000,
          },
        ],
        topOverdue: [],
      }),
      'GET /finance/projection': () => ({
        from: '',
        to: '',
        totalAmount: 250_000,
        invoices: [
          {
            studentId: 's1',
            code: 'A',
            fullName: 'Anya Rao',
            batchName: 'Morning U-12',
            issueDate: '2026-03-10',
            amount: 250_000,
          },
        ],
      }),
      'GET /batches': () => [],
      'GET /funds/overview': () => ({
        scope: 'self',
        cash: 0,
        due: 0,
        period: {
          collected: 0,
          earned: 0,
          earnedBy: [],
          kept: 0,
          handedOver: 0,
          spent: 0,
          paidToMe: 0,
        },
      }),
      'GET /funds/txns': () => page([]),
      'GET /invoices': () => page([]),
    });
    const { user } = await renderPage(<FinanceHubPage />, {
      path: '/finance',
      route: '/finance',
      user: coachUser,
    });
    expect(await screen.findByRole('heading', { name: 'Finance' })).toBeInTheDocument();
    await waitFor(() => expect(api.find('GET /finance/summary').length).toBeGreaterThan(0));

    await user.click(screen.getByRole('radio', { name: /money/i }));
    await waitFor(() => expect(api.find('GET /funds/overview').length).toBeGreaterThan(0));
    expect(screen.getByRole('button', { name: /purchase/i })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /invoices/i }));
    await waitFor(() => expect(api.find('GET /invoices').length).toBeGreaterThan(0));
  });
});
