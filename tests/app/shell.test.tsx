import { act, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __setInstallEvent, isStandalone } from '@/app/install';
import { RouterProvider } from 'react-router';
import { appReload } from '@/app/auth';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import { activeItem, matches, navFor, tabsFor, UNPAID_INVOICES } from '@/app/nav';
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
    'GET /activity/logs': () => ({
      data: [],
      meta: { total: 0, page: 1, pageSize: 50, totalPages: 0 },
    }),
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
    // One Finance screen (Finance, Money and Invoices tabs) for both roles; old paths redirect.
    for (const role of ['coach', 'admin'] as const) {
      const items = navFor(role).map((n) => n.to);
      expect(items).toContain('/finance');
      expect(items).not.toContain('/invoices');
      expect(items).not.toContain('/money');
    }
    expect(tabsFor('admin').map((t) => t.to)).toContain('/finance');
    expect(coach).not.toContain('/registrations');
    expect(admin).toEqual(
      expect.arrayContaining(['/settings', '/registrations', '/people', '/fee-plans']),
    );
    // Admins reach students, the team and payees through one Users hub; coaches see Students.
    expect(tabsFor('admin').map((t) => t.to)).toContain('/people');
    expect(coach).toContain('/students');
    expect(coach).not.toContain('/people');
    // Requests that need a decision are grouped together.
    expect(
      navFor('admin')
        .filter((n) => n.group === 'approvals')
        .map((n) => n.to),
    ).toEqual(['/substitutions', '/registrations', '/makeups']);
    expect(matches({ to: '/people', also: ['/students'] }, '/students/abc')).toBe(true);
    expect(matches({ to: '/people', also: ['/students'] }, '/studentsx')).toBe(false);
    // A tab with a query (Unpaid) wins over its plain screen (Finance).
    const tabs = [{ to: '/finance' }, { to: UNPAID_INVOICES }];
    expect(activeItem(tabs, '/finance', '?tab=invoices')).toBe(tabs[1]);
    expect(activeItem(tabs, '/finance', '?tab=invoices&status=overdue')).toBe(tabs[0]);
    expect(activeItem(tabs, '/finance', '')).toBe(tabs[0]);
    expect(matches({ to: '/', also: ['/calendar'] }, '/calendar')).toBe(true);
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
    expect(
      await screen.findByRole('heading', { name: 'Welcome back' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/students' });
  });

  it('shows the app shell with role-based navigation for coaches', async () => {
    await boot('/', coachUser);
    expect(
      await screen.findByText(/Ravi/, { selector: 'h1' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Attendance' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    // Coaches get their own activity log, not the academy's.
    expect(screen.getAllByRole('link', { name: 'My activity' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument();
  });

  it('merges Today and the calendar into the dashboard, and badges overdue invoices', async () => {
    await boot('/calendar?view=day', coachUser, {
      'GET /invoices': () => ({
        data: [],
        meta: { total: 7, page: 1, pageSize: 1, totalPages: 7, totalAmount: 0 },
      }),
      'GET /calendar': () => ({ from: '', to: '', days: [] }),
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toContain('tab=calendar');
    expect(router.state.location.search).toContain('view=day');
    expect(await screen.findByRole('radio', { name: /Calendar/ }, { timeout: 5000 })).toBeChecked();
    const tabbar = screen.getByRole('navigation', { name: 'Quick navigation' });
    const unpaid = within(tabbar).getByRole('link', { name: /Unpaid/ });
    expect(unpaid).toHaveAttribute('href', '/finance?tab=invoices&status=open');
    await waitFor(() => expect(unpaid).toHaveTextContent('7'));
  });

  it('opens every screen from the phone "More" sheet', async () => {
    await boot('/', adminUser);
    const user = userEvent.setup();
    const tabbar = await screen.findByRole('navigation', { name: 'Quick navigation' });
    expect(tabbar).toHaveTextContent('HomeUsersFinanceBatchesMore');
    await user.click(screen.getByRole('button', { name: 'More' }));
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    const audit = Array.from(sheet.querySelectorAll('a')).find(
      (a) => a.textContent === 'Audit log',
    );
    expect(audit).toBeDefined();
    await user.click(audit!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/audit-log'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
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
    // The profile picture opens the Menu drawer, which holds the app actions.
    await user.click(await screen.findByRole('button', { name: 'Open menu' }));
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    await user.click(within(sheet).getByRole('button', { name: /Install app/ }));
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

describe('admin and coach in one account', () => {
  const both = {
    ...adminUser,
    id: 'both-1',
    name: 'Shubham Raj',
    roles: ['admin', 'coach'],
  } as const;

  it('asks which role to use the first time, then opens in it', async () => {
    localStorage.removeItem(`atq-role-chosen:${both.id}`);
    const reload = jest.spyOn(appReload, 'now').mockImplementation(() => {});
    await boot(
      '/',
      { ...both, roles: [...both.roles] },
      {
        'POST /auth/switch-role': (c) => ({
          ...sessionFor({ ...both, roles: [...both.roles], role: 'coach' }),
          echo: c.body,
        }),
      },
    );
    const user = userEvent.setup();
    expect(await screen.findByText(/both an admin and a coach/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /continue as coach/i }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(localStorage.getItem(`atq-role-chosen:${both.id}`)).toBe('1');
    reload.mockRestore();
  });

  it('shows the role in use and switches from the menu', async () => {
    localStorage.setItem(`atq-role-chosen:${both.id}`, '1');
    const reload = jest.spyOn(appReload, 'now').mockImplementation(() => {});
    await boot(
      '/',
      { ...both, roles: [...both.roles] },
      {
        'POST /auth/switch-role': () =>
          sessionFor({ ...both, roles: [...both.roles], role: 'coach' }),
      },
    );
    const user = userEvent.setup();
    // The role pill in the header shows the role in use and switches from a short list.
    const pill = await screen.findByRole(
      'button',
      { name: /signed in as admin/i },
      { timeout: 5000 },
    );
    expect(pill).toHaveTextContent('Admin');
    await user.click(pill);
    await user.click(await screen.findByRole('radio', { name: /coach/i }));
    // Asks first: slide (or Enter on the slider) to confirm, then a switching screen.
    expect(await screen.findByRole('heading', { name: 'Switch to Coach?' })).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: /slide to switch to coach/i });
    slider.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Switching to Coach')).toBeInTheDocument();
    await waitFor(() => expect(reload).toHaveBeenCalled());
    reload.mockRestore();
  });

  it('also switches from the menu', async () => {
    localStorage.setItem(`atq-role-chosen:${both.id}`, '1');
    const reload = jest.spyOn(appReload, 'now').mockImplementation(() => {});
    await boot(
      '/',
      { ...both, roles: [...both.roles] },
      {
        'POST /auth/switch-role': () =>
          sessionFor({ ...both, roles: [...both.roles], role: 'coach' }),
      },
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open menu' }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: /switch to coach/i }));
    // Backing out changes nothing; confirming switches.
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(reload).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: /switch to coach/i }));
    (await screen.findByRole('slider', { name: /slide to switch to coach/i })).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(reload).toHaveBeenCalled());
    reload.mockRestore();
  });

  it('shows no chooser or switch for people with one role', async () => {
    await boot('/', adminUser);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open menu' }, { timeout: 5000 }));
    await screen.findByRole('dialog', { name: 'Menu' });
    expect(screen.queryByRole('button', { name: /switch to/i })).not.toBeInTheDocument();
  });
});
