import { PeoplePage } from '@/pages/admin/people';
import { adminUser, mockApi, renderPage, screen, waitFor } from '../utils';

const page = <T,>(data: T[]) => ({
  data,
  meta: { page: 1, pageSize: 25, total: data.length, totalPages: 1 },
});

describe('Users hub (admins)', () => {
  it('switches between students, the team and payees', async () => {
    const api = mockApi({
      'GET /students': () => page([]),
      'GET /batches': () => [],
      'GET /users': () => page([]),
      'GET /settings': () => ({}),
      'GET /funds/payees': () => [{ id: 'py1', name: 'Society', note: null, isActive: true }],
    });
    const { user } = await renderPage(<PeoplePage />, {
      path: '/people',
      route: '/people',
      user: adminUser,
    });
    expect(await screen.findByRole('heading', { name: 'Students' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /team/i }));
    await waitFor(() => expect(api.find('GET /users').length).toBeGreaterThan(0));
    await user.click(screen.getByRole('radio', { name: /payees/i }));
    expect(await screen.findByText('Society')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument();
  });
});
