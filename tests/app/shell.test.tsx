import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __setInstallEvent, isStandalone } from '@/app/install';
import { RouterProvider } from 'react-router';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import { navFor, tabsFor } from '@/app/nav';
import {
  adminUser,
  coachUser,
  mockApi,
  screen,
  sessionFor,
  testQueryClient,
  waitFor,
} from '../utils';

async function boot(
  path: string,
  user?: typeof coachUser,
  routes: Parameters<typeof mockApi>[0] = {},
) {
  mockApi({
    ...(user ? { 'POST /auth/refresh': () => sessionFor(user) } : {}),
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
    'GET /admin/audit-logs': () => ({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    ...routes,
  });
  await router.navigate(path);
  render(
    <Providers queryClient={testQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
}

describe('navigation', () => {
  it('gives admins management screens that coaches do not see', () => {
    const coach = navFor('coach').map((n) => n.to);
    const admin = navFor('admin').map((n) => n.to);
    expect(coach).not.toContain('/settings');
    expect(coach).not.toContain('/registrations');
    expect(admin).toEqual(
      expect.arrayContaining(['/settings', '/registrations', '/coaches', '/fee-plans']),
    );
    // Four tabs + "More" fit a phone; every tab is a screen the role can open.
    for (const role of ['coach', 'admin'] as const) {
      expect(tabsFor(role)).toHaveLength(4);
      for (const t of tabsFor(role)) expect(t.roles).toContain(role);
    }
  });
});

describe('route guards', () => {
  it('sends signed-out users to the login page and back afterwards', async () => {
    await boot('/students');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/students' });
  });

  it('shows the app shell with role-based navigation for coaches', async () => {
    await boot('/', coachUser);
    expect(await screen.findByText(/Ravi/, { selector: 'h1' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Attendance' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('opens every screen from the phone "More" sheet', async () => {
    await boot('/', adminUser);
    const user = userEvent.setup();
    const tabbar = await screen.findByRole('navigation', { name: 'Quick navigation' });
    expect(tabbar).toHaveTextContent('Finance');
    await user.click(screen.getByRole('button', { name: 'More' }));
    const sheet = await screen.findByRole('dialog', { name: 'All screens' });
    const audit = Array.from(sheet.querySelectorAll('a')).find(
      (a) => a.textContent === 'Audit log',
    );
    expect(audit).toBeDefined();
    await user.click(audit!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/audit-log'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'All screens' })).toBeNull());
  });

  it('offers "Install app" when the browser allows installing', async () => {
    const prompt = jest.fn(() => Promise.resolve());
    await boot('/', coachUser);
    const user = userEvent.setup();
    act(() =>
      __setInstallEvent(
        Object.assign(new Event('beforeinstallprompt'), {
          prompt,
          userChoice: Promise.resolve({ outcome: 'accepted' as const }),
        }),
      ),
    );
    await user.click(await screen.findByRole('button', { name: 'Account menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /Install app/ }));
    expect(prompt).toHaveBeenCalled();
    expect(isStandalone()).toBe(false);
  });

  it('redirects coaches away from admin-only pages', async () => {
    await boot('/settings', coachUser);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('keeps signed-in users out of the login page', async () => {
    await boot('/login', adminUser);
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('renders a 404 inside the app', async () => {
    await boot('/does-not-exist', adminUser);
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
