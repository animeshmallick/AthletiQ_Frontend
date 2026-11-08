import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router';
import { relativeTime } from '@/app/deployments';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import {
  adminUser,
  coachUser,
  mockApi,
  screen,
  sessionFor,
  testQueryClient,
  waitFor,
} from '../utils';

const tasks = {
  generatedAt: '2026-03-09T06:00:00Z',
  total: 3,
  counts: { '/attendance': 2, '/feedback': 4 },
  items: [
    {
      id: 'missed',
      kind: 'missed-check-in',
      severity: 'critical',
      title: "You haven't checked in",
      detail: 'Morning batch started at 6:00 am',
      link: '/',
      screen: '/',
    },
    {
      id: 'att',
      kind: 'attendance',
      severity: 'warning',
      title: 'Mark attendance for Evening',
      detail: '0 of 2 marked',
      link: '/attendance?batch=b1&date=2026-03-09',
      screen: '/attendance',
      count: 2,
    },
    {
      id: 'fb',
      kind: 'feedback',
      severity: 'info',
      title: '4 weekly reports to send',
      detail: 'For the week of 2026-03-02',
      link: '/feedback',
      screen: '/feedback',
      count: 4,
    },
  ],
};

async function boot(user: typeof coachUser, routes: Parameters<typeof mockApi>[0] = {}) {
  mockApi({
    'POST /auth/refresh': () => sessionFor(user),
    'GET /me/tasks': () => tasks,
    'GET /coach-sessions/today': () => ({ date: '2026-03-09', sessions: [] }),
    'GET /attendance/overview': () => ({ date: '2026-03-09', sessions: [] }),
    'GET /feedback/week': () => ({
      weekStart: '',
      weekEnd: '',
      students: [],
      summary: { total: 0, submitted: 0, draft: 0, pending: 0 },
    }),
    'GET /finance/summary': () => ({
      range: {},
      totals: null,
      trend: [],
      byPaymentMode: [],
      byReceiver: [],
      byBatch: [],
      topOverdue: [],
    }),
    'GET /registrations': () => ({
      data: [],
      meta: { pending: { pendingStudents: 0, pendingCoaches: 0 } },
    }),
    'GET /coach-sessions': () => ({
      sessions: [],
      summary: { sessions: 0, flagged: 0, unreviewedFlagged: 0, missingCheckOut: 0, totalHours: 0 },
    }),
    // /ready is outside the /api/v1 envelope: it returns the object as-is.
    'GET /ready': () => ({
      status: 200,
      body: {
        status: 'ready',
        database: true,
        push: 'enabled',
        version: { commit: 'abc1234', commitMessage: 'Ship it', builtAt: null },
        deployment: { deployedAt: new Date().toISOString(), kind: 'deploy', rollback: false },
        server: { uptime: '5m 2s', startedAt: new Date().toISOString() },
      },
    }),
    ...routes,
  });
  await router.navigate('/');
  render(
    <Providers queryClient={testQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
}

describe('app header', () => {
  it('links the brand to Today and shows a bell with what needs attention', async () => {
    const user = userEvent.setup();
    await boot(coachUser);
    expect(
      (await screen.findAllByRole('link', { name: /AthletiQ, go to Today/ }))[0],
    ).toHaveAttribute('href', '/');
    const bell = await screen.findByRole('button', { name: '3 items need attention' });
    await user.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Needs your attention' });
    const links = within(panel).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("You haven't checked in"),
      expect.stringContaining('Mark attendance for Evening'),
      expect.stringContaining('4 weekly reports to send'),
    ]);
    await user.click(links[1]!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/attendance'));
  });

  it('puts pending counts on the tabs and totals the rest on "More"', async () => {
    await boot(coachUser);
    const tabbar = await screen.findByRole('navigation', { name: 'Quick navigation' });
    // Attendance is a coach tab; Feedback lives under More.
    await waitFor(() => expect(within(tabbar).getByLabelText('2 pending')).toBeInTheDocument());
    expect(within(tabbar).getByLabelText('4 pending')).toBeInTheDocument();
  });

  it('shows admins the live deployments in the More sheet', async () => {
    const user = userEvent.setup();
    await boot(adminUser, {
      'GET /me/tasks': () => ({ ...tasks, total: 0, counts: {}, items: [] }),
    });
    expect(
      await screen.findByRole('button', { name: 'Nothing needs attention' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More' }));
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    const deployments = within(sheet).getByRole('region', { name: 'Deployments' });
    await waitFor(() => expect(deployments).toHaveTextContent('abc1234 · Ship it'));
    expect(deployments).toHaveTextContent(/Deployed just now/);
    expect(deployments).toHaveTextContent('up 5m 2s');
  });
});

describe('relativeTime', () => {
  it('describes how long ago something happened', () => {
    const now = Date.parse('2026-03-09T12:00:00Z');
    expect(relativeTime('2026-03-09T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-03-09T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-03-08T12:00:00Z', now)).toBe('yesterday');
    expect(relativeTime(null, now)).toBe('unknown');
  });
});
