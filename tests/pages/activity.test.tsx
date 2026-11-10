import { within } from '@testing-library/react';
import { today } from '@/lib/format';
import { ACTIVITY_PERIODS, activityWindow } from '@/lib/periods';
import { hoursSince } from '@/pages/activity/meta';
import { AuditLogPage } from '@/pages/activity';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const log = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  action: 'invoice.payment_reverted',
  entityType: 'invoice',
  entityId: 'i1',
  actorId: 'a',
  metadata: { reason: 'Mistake', amount: 250000, effectiveFrom: '2026-03-09' },
  ipAddress: null,
  createdAt: '2026-03-09T05:00:00Z',
  actor: { id: 'a', name: 'Asha Admin', role: 'admin' },
  ...over,
});
const page = (data: unknown[], total = data.length, p = 1, totalPages = 1) => ({
  data,
  meta: { page: p, pageSize: 50, total, totalPages },
});

const insights = {
  from: '2026-02-10',
  to: '2026-03-09',
  totals: {
    events: 12,
    people: 2,
    records: 7,
    sensitive: 1,
    activeDays: 3,
    perDay: 0.4,
    previous: 6,
    change: 100,
  },
  busiestDay: { date: '2026-03-09', n: 8 },
  busiestHour: 18,
  byDay: [
    { date: '2026-03-08', n: 4 },
    { date: '2026-03-09', n: 8 },
  ],
  byHour: Array.from({ length: 24 }, (_, h) => (h === 18 ? 8 : h === 7 ? 4 : 0)),
  byEntity: [
    { entityType: 'invoice', n: 9 },
    { entityType: 'student', n: 3 },
  ],
  byAction: [{ action: 'invoice.payment_recorded', n: 8 }],
  byActor: [{ id: 'c1', name: 'Ravi Coach', role: 'coach', n: 9 }],
  notable: [log()],
};
const requestInsights = {
  totals: { total: 20, writes: 18, failed: 2, avgMs: 84, p95Ms: 310, people: 2 },
  byRoute: [
    {
      method: 'POST',
      route: '/api/v1/attendance/sessions',
      n: 10,
      failed: 1,
      avgMs: 90,
      maxMs: 400,
    },
  ],
  slowest: [],
  byPerson: [],
};

describe('Activity log (admin)', () => {
  it('looks back by the hour, day, month or year', async () => {
    const api = mockApi({ 'GET /activity/logs': () => page([log()]) });
    await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log?tab=activity&period=3h',
      user: adminUser,
    });
    await screen.findByRole('button', { name: /Invoice payment reverted/ });
    // Hour windows send the exact start (to the minute).
    const q = api.find('GET /activity/logs')[0]!.query;
    const since = Date.parse(q.get('since')!);
    expect(Date.now() - since).toBeGreaterThanOrEqual(3 * 3_600_000);
    expect(Date.now() - since).toBeLessThan(3 * 3_600_000 + 61_000);
    expect(q.get('to')).toBe(today());

    expect(ACTIVITY_PERIODS).toEqual(['1h', '3h', '24h', '7d', '1m', '1y']);
    const now = Date.parse('2026-03-10T06:30:45Z'); // 12:00:45 pm IST
    expect(activityWindow('1h', now)).toEqual({
      from: '2026-03-10',
      to: '2026-03-10',
      since: '2026-03-10T05:30:00.000Z',
    });
    expect(activityWindow('24h', now)).toMatchObject({ from: '2026-03-09', to: '2026-03-10' });
    expect(activityWindow('7d', now)).toEqual({ from: '2026-03-04', to: '2026-03-10' });
    expect(activityWindow('1m', now)).toEqual({ from: '2026-02-09', to: '2026-03-10' });
    expect(activityWindow('1y', now)).toEqual({ from: '2025-03-11', to: '2026-03-10' });
    // The hours a window covers, in order (IST).
    expect(hoursSince('2026-03-10T05:30:00.000Z', new Date(now))).toEqual([11, 12]);
    expect(hoursSince('2026-03-09T06:30:00.000Z', new Date(now))).toHaveLength(24);
  });

  it('lists key events and opens details, with a link to the record and its history', async () => {
    const api = mockApi({ 'GET /activity/logs': () => page([log()]) });
    const { user, router } = await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log?tab=activity',
      user: adminUser,
    });
    expect(await screen.findByRole('heading', { name: 'Audit log' })).toBeInTheDocument();
    const tile = await screen.findByRole('button', { name: /Invoice payment reverted/ });
    expect(tile).toHaveTextContent('Asha Admin · ₹2,500 · Mistake');
    // The last 24 hours is the default period.
    const first = api.find('GET /activity/logs')[0]!;
    expect(Date.now() - Date.parse(first.query.get('since')!)).toBeGreaterThanOrEqual(
      24 * 3_600_000,
    );
    expect(first.query.get('to')).toBe(today());
    expect(first.query.get('pageSize')).toBe('50');

    await user.click(tile);
    const dialog = await screen.findByRole('dialog', { name: 'Invoice payment reverted' });
    expect(dialog).toHaveTextContent('Worth a second look');
    expect(dialog).toHaveTextContent('Done byAsha Admin');
    expect(dialog).toHaveTextContent('ReasonMistake');
    expect(within(dialog).getByRole('link', { name: 'Open' })).toHaveAttribute(
      'href',
      '/finance?tab=invoices&status=all&invoice=i1',
    );
    await user.click(within(dialog).getByRole('button', { name: /Full history of this invoice/ }));
    await waitFor(() => expect(router.state.location.search).toContain('record=i1'));
    const last = api.find('GET /activity/logs').at(-1)!;
    expect(last.query.get('entityId')).toBe('i1');
    expect(last.query.get('from')).toBeNull(); // a record's history spans all time
  });

  it('loads more events on demand', async () => {
    mockApi({
      'GET /activity/logs': (c) => {
        const p = Number(c.query.get('page'));
        return p === 1
          ? page([log({ id: 'a1' }), log({ id: 'a2' })], 3, 1, 2)
          : page([log({ id: 'a3', actor: { id: 'b', name: 'Bala Admin' } })], 3, 2, 2);
      },
    });
    const { user } = await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log?tab=activity',
      user: adminUser,
    });
    expect(await screen.findByText('Showing 2 of 3 events')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Showing 3 of 3 events')).toBeInTheDocument();
    expect(screen.getByText(/Bala Admin/)).toBeInTheDocument();
  });

  it('lists every change from the request log', async () => {
    mockApi({
      'GET /activity/requests': () =>
        page([
          {
            id: 'r1',
            method: 'PATCH',
            route: '/api/v1/students/:id/fee-plan',
            status: 409,
            durationMs: 1240,
            code: 'CONFLICT',
            message: 'Plan already set',
            userId: 'c1',
            requestId: 'req-42',
            ipAddress: '10.0.0.1',
            userAgent: 'Android',
            createdAt: '2026-03-09T05:00:00Z',
            user: { id: 'c1', name: 'Ravi Coach' },
          },
        ]),
    });
    const { user } = await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log?tab=activity&view=changes',
      user: adminUser,
    });
    const row = await screen.findByRole('button', { name: /Updated students › fee plan/ });
    expect(row).toHaveTextContent('409');
    expect(row).toHaveTextContent('Ravi Coach · Plan already set');
    expect(row).toHaveTextContent('1.2 s');
    await user.click(row);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('CONFLICT');
    expect(dialog).toHaveTextContent('Request IDreq-42');
  });

  it('shows insights and drills into the activity list', async () => {
    mockApi({
      'GET /activity/insights': () => insights,
      'GET /activity/requests/insights': () => requestInsights,
      'GET /activity/logs': () => page([log()]),
    });
    const { user, router } = await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log',
      user: adminUser,
    });
    expect(await screen.findByText('+100% vs the period before')).toBeInTheDocument();
    expect(screen.getByText('Peak 6 pm')).toBeInTheDocument();
    expect(screen.getByText('Most active people')).toBeInTheDocument();
    expect(await screen.findByText('Changes saved')).toBeInTheDocument();
    expect(screen.getByText('310 ms')).toBeInTheDocument();
    expect(screen.getByText('Created attendance › sessions')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ravi Coach/ }));
    await waitFor(() => expect(router.state.location.search).toBe('?tab=activity&person=c1'));
    expect(await screen.findByRole('button', { name: /Invoice payment reverted/ })).toBeVisible();
  });

  it('charts a single day hour by hour', async () => {
    const day = today();
    mockApi({
      'GET /activity/insights': () => ({ ...insights, from: day, to: day }),
      'GET /activity/requests/insights': () => requestInsights,
      'GET /activity/errors/insights': () => ({
        totals: { total: 1, server: 0, client: 1, routes: 1, users: 1 },
        byDay: [{ date: day, n: 1, server: 0 }],
        byHour: Array.from({ length: 24 }, (_, hour) => ({
          hour,
          n: hour === 9 ? 1 : 0,
          server: 0,
        })),
        byStatus: [{ status: 404, n: 1 }],
        byCode: [],
        byRoute: [],
      }),
      'GET /activity/errors': () => page([]),
    });
    const { user } = await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log?period=3h',
      user: adminUser,
    });
    expect(await screen.findByText('Actions by hour')).toBeInTheDocument();
    expect(screen.queryByText('Actions by day')).not.toBeInTheDocument();
    expect(screen.queryByText('Time of day')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /errors/i }));
    expect(await screen.findByText('Failures by hour')).toBeInTheDocument();
  });

  it('shows failed requests on the Errors tab and filters by endpoint', async () => {
    const api = mockApi({
      'GET /activity/errors/insights': () => ({
        totals: { total: 3, server: 1, client: 2, routes: 2, users: 1 },
        byDay: [{ date: '2026-03-09', n: 3, server: 1 }],
        byStatus: [
          { status: 500, n: 1 },
          { status: 404, n: 2 },
        ],
        byCode: [{ code: 'NOT_FOUND', n: 2 }],
        byRoute: [
          {
            method: 'GET',
            route: '/api/v1/students/:id',
            n: 2,
            server: 0,
            last: '2026-03-09T05:00:00Z',
            sample: 'Student not found',
          },
        ],
      }),
      'GET /activity/errors': () => page([]),
    });
    const { user } = await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log?tab=errors',
      user: adminUser,
    });
    expect(await screen.findByText('Server errors')).toBeInTheDocument();
    expect(screen.getByText('Bugs or outages: fix these')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Opened students.*Student not found/ }));
    await waitFor(() =>
      expect(api.find('GET /activity/errors').at(-1)!.query.get('route')).toBe(
        '/api/v1/students/:id',
      ),
    );
    await user.click(screen.getByRole('radio', { name: 'Server' }));
    await waitFor(() =>
      expect(api.find('GET /activity/errors').at(-1)!.query.get('kind')).toBe('server'),
    );
  });

  it('summarises the whole log only after a warning', async () => {
    const api = mockApi({
      'GET /activity/logs': () => page([]),
      'POST /activity/summary': () => ({
        generatedAt: new Date().toISOString(),
        scope: 'academy',
        totals: {
          events: 6,
          people: 2,
          records: 4,
          activeDays: 4,
          spanDays: 10,
          sensitive: 2,
          first: '2026-03-04T04:30:00Z',
          last: '2026-03-12T04:30:00Z',
        },
        busiestDay: { date: '2026-03-09', n: 2 },
        busiestHour: 18,
        byMonth: [{ month: '2026-03', n: 6 }],
        byHour: Array(24).fill(0),
        topActions: [{ action: 'student.created', n: 2 }],
        topActors: [],
        byEntity: [{ entityType: 'student', n: 2 }],
        sensitive: [],
        errors: { total: 3, server: 1, routes: 2 },
        highlights: [
          'Most common action: student.created (2).',
          'Busiest day: 2026-03-09 with 2 actions.',
        ],
      }),
    });
    const { user } = await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log?tab=activity',
      user: adminUser,
    });
    await user.click(await screen.findByRole('button', { name: /Summarise all/ }));
    const dialog = await screen.findByRole('dialog', { name: /Summary of all activity/ });
    expect(dialog).toHaveTextContent('This may take a while');
    expect(api.find('POST /activity/summary')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: /Create summary/ }));
    expect(
      await within(dialog).findByText('Most common action: student created (2).'),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(/Busiest day: \w+, 9 March with 2 actions/);
    expect(dialog).toHaveTextContent('Failed requests on record: 3');
  });
});

describe('Activity log (coach)', () => {
  it('shows only “My activity”, without the Errors tab or the person filter', async () => {
    const api = mockApi({
      'GET /activity/logs': () =>
        page([log({ action: 'attendance.saved', entityType: 'batch', metadata: {} })]),
    });
    await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log?tab=activity&person=x',
      user: coachUser,
    });
    expect(await screen.findByRole('heading', { name: 'My activity' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Errors/ })).toBeNull();
    // Another person can't be asked for.
    const row = await screen.findByRole('button', { name: /Attendance saved/ });
    expect(row).toHaveTextContent('Batch');
    expect(api.find('GET /activity/logs')[0]!.query.get('actorId')).toBeNull();
    expect(api.find('GET /activity/insights')).toHaveLength(0);
  });

  it('opens on their own insights; the admin-only Errors tab falls back to it', async () => {
    const api = mockApi({
      'GET /activity/insights': () => ({ ...insights, byActor: [] }),
      'GET /activity/requests/insights': () => requestInsights,
    });
    await renderPage(<AuditLogPage />, {
      path: '/audit-log',
      route: '/audit-log?tab=errors',
      user: coachUser,
    });
    expect(await screen.findByText('Records touched')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Insights/ })).toBeChecked();
    expect(screen.queryByText('Most active people')).toBeNull();
    expect(api.find('GET /activity/errors/insights')).toHaveLength(0);
  });
});
