import { InvoiceDetailPage } from '@/pages/invoices/detail';
import { InvoicesPage } from '@/pages/invoices';
import { TodayPage } from '@/pages/today';
import { invoiceDetail, studentListItem } from '../fixtures';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const todaySession = (session: unknown = null) => ({
  date: '2026-03-09',
  sessions: [
    {
      batch: { id: 'b1', name: 'Morning U-12', startTime: '06:00:00', endTime: '08:00:00' },
      location: {
        id: 'l1',
        name: 'Indiranagar Club',
        address: null,
        latitude: 12.97,
        longitude: 77.59,
        radiusMeters: 200,
      },
      session,
    },
  ],
});

const overview = {
  date: '2026-03-09',
  sessions: [
    {
      batch: {
        id: 'b1',
        name: 'Morning U-12',
        startTime: '06:00:00',
        endTime: '08:00:00',
        coach: { id: 'coach-1', name: 'Ravi' },
        location: { id: 'l1', name: 'Club' },
      },
      expectedStudents: 10,
      marked: 4,
      present: 3,
      attendanceComplete: false,
      hasLessonPlan: true,
      coachSession: null,
    },
  ],
};

function mockGeolocation(result: 'ok' | 'denied') {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) =>
        result === 'ok'
          ? ok({
              coords: { latitude: 12.9701, longitude: 77.5901, accuracy: 12.4 },
            } as GeolocationPosition)
          : fail({ code: 1 } as GeolocationPositionError),
    },
  });
}

describe('TodayPage (coach)', () => {
  it('checks in with GPS and shows session progress', async () => {
    mockGeolocation('ok');
    const api = mockApi({
      'GET /coach-sessions/today': () => todaySession(),
      'GET /attendance/overview': () => overview,
      'GET /feedback/week': () => ({
        weekStart: '2026-03-02',
        weekEnd: '2026-03-08',
        students: [],
        summary: { total: 3, submitted: 1, draft: 1, pending: 1 },
      }),
      'POST /coach-sessions/check-in': () => ({
        session: { id: 'cs1', flagged: false },
        message: 'Checked in at Indiranagar Club',
      }),
    });
    const { user } = await renderPage(<TodayPage />, { user: coachUser });

    expect(await screen.findByText('Morning U-12')).toBeInTheDocument();
    expect(await screen.findByText('3/10 present')).toBeInTheDocument();
    expect(screen.getByText('Fill plan')).toBeInTheDocument(); // a plan, not filled in for today yet
    expect(screen.getByText('2 reports due')).toBeInTheDocument(); // feedback lives in the to-dos

    await user.click(screen.getByRole('button', { name: /check in/i }));
    await waitFor(() => expect(api.find('POST /coach-sessions/check-in')).toHaveLength(1));
    expect(api.find('POST /coach-sessions/check-in')[0]!.body).toEqual({
      batchId: 'b1',
      latitude: 12.9701,
      longitude: 77.5901,
      accuracy: 12,
    });
  });

  it('explains when location permission is denied', async () => {
    mockGeolocation('denied');
    const api = mockApi({
      'GET /coach-sessions/today': () => todaySession(),
      'GET /attendance/overview': () => overview,
    });
    const { user } = await renderPage(<TodayPage />, { user: coachUser });
    await user.click(await screen.findByRole('button', { name: /check in/i }));
    expect(await screen.findByText(/Location permission was denied/)).toBeInTheDocument();
    expect(api.find('POST /coach-sessions/check-in')).toHaveLength(0);
  });

  it('shows the check-in time once checked in (there is no check-out)', async () => {
    mockApi({
      'GET /coach-sessions/today': () =>
        todaySession({ id: 'cs1', checkInAt: '2026-03-09T00:31:00Z', flagged: true }),
      'GET /attendance/overview': () => overview,
    });
    await renderPage(<TodayPage />, { user: coachUser });
    // Away from the venue: the check-in time turns red.
    expect(await screen.findByText(/^In 6:01/)).toHaveClass('text-destructive');
    expect(screen.queryByRole('button', { name: /check (in|out)/i })).not.toBeInTheDocument();
  });

  it('shows a rest-day state', async () => {
    mockApi({
      'GET /coach-sessions/today': () => ({ date: '2026-03-15', sessions: [] }),
      'GET /attendance/overview': () => ({ date: '2026-03-15', sessions: [] }),
    });
    await renderPage(<TodayPage />, { user: coachUser });
    expect(await screen.findByText('No sessions today')).toBeInTheDocument();
  });
});

describe('TodayPage (admin)', () => {
  it('shows finance KPIs and items needing attention', async () => {
    mockApi({
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
        trend: [],
        byPaymentMode: [],
        byReceiver: [],
        byBatch: [],
        topOverdue: [
          {
            studentId: 's1',
            code: 'A',
            fullName: 'Anya Rao',
            phone: '',
            overdue: 500_000,
            invoices: 2,
            oldestDueDate: '2026-02-17',
          },
        ],
      }),
      'GET /attendance/overview': () => overview,
      'GET /registrations': () => ({
        data: [],
        meta: {
          page: 1,
          pageSize: 1,
          total: 0,
          totalPages: 1,
          pending: { pendingStudents: 2, pendingCoaches: 1 },
        },
      }),
      'GET /coach-sessions': () => ({
        from: '',
        to: '',
        sessions: [],
        summary: {
          sessions: 0,
          flagged: 1,
          unreviewedFlagged: 1,
          missingCheckOut: 0,
          totalHours: 0,
        },
      }),
    });
    await renderPage(<TodayPage />, { user: adminUser });
    // KPI strip.
    const collected = await screen.findByRole('link', { name: /Collected · month/ });
    await waitFor(() => expect(collected).toHaveTextContent('₹2,500'));
    expect(screen.getByText('25% collected this month')).toBeInTheDocument();
    expect(screen.getByText('2 overdue invoices')).toBeInTheDocument(); // header chip
    // Follow-ups.
    expect(await screen.findByRole('link', { name: /Registrations to review/ })).toHaveTextContent(
      '3',
    );
    expect(screen.getByRole('link', { name: /Flagged check-ins to review/ })).toHaveTextContent(
      '1',
    );
    expect(screen.getByRole('link', { name: /Anya Rao/ })).toHaveTextContent('₹5,000');
    // Compact sections.
    for (const title of ['Today’s plan', 'Follow-ups', 'Money', 'Overview'])
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  });
});

describe('InvoicesPage', () => {
  const list = {
    data: [
      {
        ...invoiceDetail,
        student: { id: 's1', code: 'ATQ-0001', fullName: 'Anya Rao', phone: '+91' },
      },
    ],
    meta: { page: 1, pageSize: 25, total: 1, totalPages: 1, totalAmount: 250_000 },
  };

  it('admins start on the list, and can group by place', async () => {
    const api = mockApi({
      'GET /invoices': () => ({
        ...list,
        data: [{ ...list.data[0], location: { id: 'l1', name: 'Main ground' } }],
      }),
    });
    const { user, router } = await renderPage(<InvoicesPage />, {
      path: '/invoices',
      route: '/invoices',
      user: adminUser,
    });
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(api.find('GET /invoices')[0]!.query.get('pageSize')).toBe('25');
    await user.click(screen.getByRole('radio', { name: 'By place' }));
    await waitFor(() => expect(router.state.location.search).toContain('group=location'));
    expect(await screen.findByRole('button', { name: /Main ground/ })).toBeInTheDocument();
    expect(screen.queryByText('Anya Rao')).not.toBeInTheDocument();
  });

  it('lists unpaid invoices and records a payment', async () => {
    const api = mockApi({
      'GET /invoices': () => list,
      'GET /invoices/i1': () => invoiceDetail,
      'POST /invoices/i1/payments': () => ({
        ...invoiceDetail,
        status: 'paid',
        displayStatus: 'paid',
      }),
    });
    const { user } = await renderPage(<InvoicesPage />, {
      path: '/invoices',
      route: '/invoices',
      user: coachUser,
    });

    // Coaches start grouped by batch: the group sums up its invoices; open it to see them.
    const group = await screen.findByRole('button', { name: /Morning U-12/ });
    expect(group).toHaveTextContent('Overdue ₹2,500 · 1');
    expect(api.find('GET /invoices')[0]!.query.get('pageSize')).toBe('100');
    await user.click(group);
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.getAllByText('1 invoice').length).toBeGreaterThan(0);
    expect(api.find('GET /invoices')[0]!.query.get('sort')).toBe('dueDateAsc');

    await user.click(screen.getByRole('button', { name: /Anya Rao/ }));
    // Opens as a page with every detail.
    expect((await screen.findAllByText('ATQ/2025-26/00001')).length).toBeGreaterThan(0);
    // Coaches cannot cancel invoices.
    expect(screen.queryByRole('button', { name: 'Cancel invoice' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /record payment/i }));
    await user.type(screen.getByLabelText(/UPI reference/i), 'UTR123');
    // Slide to confirm (keyboard: Enter on the slider).
    screen.getByRole('slider', { name: /slide to confirm ₹2,500 received/i }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(api.find('POST /invoices/i1/payments')).toHaveLength(1));
    expect(api.find('POST /invoices/i1/payments')[0]!.body).toMatchObject({
      mode: 'upi',
      reference: 'UTR123',
    });
  });

  it('suggests receiving as coach when an admin who also coaches records a payment', async () => {
    const both = { ...adminUser, roles: ['admin', 'coach'] as ('admin' | 'coach')[] };
    const api = mockApi({
      'GET /invoices': () => list,
      'GET /invoices/i1': () => invoiceDetail,
      'POST /invoices/i1/payments': () => ({ ...invoiceDetail, status: 'paid' }),
    });
    const { user } = await renderPage(<InvoicesPage />, {
      path: '/invoices',
      route: '/invoices',
      user: both,
    });
    await user.click(await screen.findByRole('button', { name: /Anya Rao/ }));
    await user.click(await screen.findByRole('button', { name: /record payment/i }));

    // Warning first: taking it as admin sends it to academy cash.
    expect(await screen.findByRole('alert')).toHaveTextContent('You’re receiving this as admin');
    expect(
      screen.getByRole('slider', { name: /slide to accept ₹2,500 as admin/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /receive as coach instead/i }));

    // Go-ahead: as coach, counted with them; the warning is gone.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Receiving as coach')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Where is the money now?' })).toBeInTheDocument();
    screen.getByRole('slider', { name: /slide to receive ₹2,500 as coach/i }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(api.find('POST /invoices/i1/payments')).toHaveLength(1));
    expect(api.find('POST /invoices/i1/payments')[0]!.body).toMatchObject({
      receivedAs: 'coach',
      heldBy: 'collector',
    });
  });

  it('records as admin when they accept the warning', async () => {
    const both = { ...adminUser, roles: ['admin', 'coach'] as ('admin' | 'coach')[] };
    const api = mockApi({
      'GET /invoices': () => list,
      'GET /invoices/i1': () => invoiceDetail,
      'POST /invoices/i1/payments': () => ({ ...invoiceDetail, status: 'paid' }),
    });
    const { user } = await renderPage(<InvoicesPage />, {
      path: '/invoices',
      route: '/invoices',
      user: both,
    });
    await user.click(await screen.findByRole('button', { name: /Anya Rao/ }));
    await user.click(await screen.findByRole('button', { name: /record payment/i }));
    (await screen.findByRole('slider', { name: /slide to accept ₹2,500 as admin/i })).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(api.find('POST /invoices/i1/payments')).toHaveLength(1));
    const body = api.find('POST /invoices/i1/payments')[0]!.body as Record<string, unknown>;
    expect(body.receivedAs).toBe('admin');
    expect(body.heldBy).toBeUndefined();
  });

  it('lets admins revert a payment with a reason', async () => {
    const paid = {
      ...invoiceDetail,
      status: 'paid',
      displayStatus: 'paid',
      payments: [
        {
          id: 'p1',
          amount: 250_000,
          mode: 'cash',
          reference: null,
          paidOn: '2026-02-12',
          note: null,
          status: 'completed',
          createdAt: '',
          recordedBy: { id: 'c', name: 'Ravi' },
          reversedAt: null,
          reversalReason: null,
        },
      ],
    };
    const api = mockApi({
      'GET /invoices': () => list,
      'GET /invoices/i1': () => paid,
      'POST /invoices/i1/payments/p1/revert': () => invoiceDetail,
    });
    const { user } = await renderPage(<InvoicesPage />, {
      path: '/invoices',
      route: '/invoices?invoice=i1',
      user: adminUser,
    });
    await user.click(await screen.findByRole('button', { name: 'Reverse payment' }));
    await user.click(await screen.findByRole('menuitem', { name: /revert/i }));
    await user.type(screen.getByLabelText(/reason/i), 'Recorded twice');
    await user.click(screen.getByRole('button', { name: 'Revert payment' }));
    await waitFor(() => expect(api.find('POST /invoices/i1/payments/p1/revert')).toHaveLength(1));
    expect(api.find('POST /invoices/i1/payments/p1/revert')[0]!.body).toEqual({
      reason: 'Recorded twice',
    });
  });

  it('shares on WhatsApp', async () => {
    const win = { location: { href: '' }, close: jest.fn() };
    (window.open as jest.Mock).mockReturnValueOnce(win);
    mockApi({
      'GET /invoices': () => list,
      'GET /invoices/i1': () => invoiceDetail,
      'POST /invoices/i1/share': () => ({
        message: 'Hi',
        pdfUrl: 'https://x',
        whatsappUrl: 'https://wa.me/91?text=Hi',
        expiresAt: '',
      }),
    });
    const { user } = await renderPage(<InvoicesPage />, {
      path: '/invoices',
      route: '/invoices?invoice=i1',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /whatsapp/i }));
    await waitFor(() => expect(win.location.href).toBe('https://wa.me/91?text=Hi'));
  });

  it('shows the batch enrollment date and other dues on the invoice page', async () => {
    mockApi({
      'GET /invoices/i1': () => ({
        ...invoiceDetail,
        student: { ...invoiceDetail.student, joiningDate: '2025-06-01' },
        about: {
          coachName: 'Ravi',
          locationName: 'Main ground',
          startTime: '06:00:00',
          endTime: '07:00:00',
          trainingDays: [1, 3, 5],
          batchJoinedOn: '2025-09-01',
          billingStartsOn: '2025-09-01',
          otherDue: { count: 2, amount: 500_000 },
        },
      }),
    });
    await renderPage(<InvoiceDetailPage />, {
      path: '/invoices/:id',
      route: '/invoices/i1',
      user: adminUser,
    });
    expect(await screen.findByText('Batch enrollment')).toBeInTheDocument();
    expect(screen.getAllByText('1 Sept 2025', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText(/In the academy since/)).toBeInTheDocument();
    expect(screen.getByText('Coach Ravi')).toBeInTheDocument();
    expect(screen.getByText('2 more unpaid invoices')).toBeInTheDocument();
  });

  it('shows a friendly empty state', async () => {
    mockApi({
      'GET /invoices': () => ({
        data: [],
        meta: { page: 1, pageSize: 25, total: 0, totalPages: 1, totalAmount: 0 },
      }),
    });
    await renderPage(<InvoicesPage />, {
      path: '/invoices',
      route: '/invoices?status=overdue',
      user: adminUser,
    });
    expect(await screen.findByText(/Nothing overdue/)).toBeInTheDocument();
  });
});

describe('Today insights', () => {
  const dashboard = {
    today: '2026-03-09',
    people: {
      activeStudents: 42,
      newThisMonth: 3,
      leftThisMonth: 1,
      activeCoaches: 4,
      activeBatches: 6,
      fillRate: 70,
    },
    attendance: {
      rate30d: 82,
      attended: 82,
      absent: 18,
      trend: Array.from({ length: 14 }, (_, i) => ({
        date: `2026-02-${String(24 + i > 28 ? i - 4 : 24 + i).padStart(2, '0')}`,
        rate: i % 3 ? 80 : null,
      })),
    },
    myMonth: null,
    feedback: null,
    batchHealth: [
      {
        id: 'b1',
        name: 'Morning U-12',
        coachName: 'Kavya',
        enrolled: 12,
        capacity: 16,
        fill: 75,
        attendanceRate: 55,
      },
    ],
    coaches: [
      {
        id: 'c1',
        name: 'Kavya Iyer',
        batches: 2,
        students: 20,
        sessions: 9,
        hours: 13.5,
        onTimeRate: 89,
        flagged: 0,
      },
    ],
    needsAttention: [
      { studentId: 's9', fullName: 'Arjun Mehta', attended: 1, counted: 6, rate: 17 },
    ],
    birthdays: [{ studentId: 's3', fullName: 'Riya Shah', inDays: 0, turning: 12 }],
  };

  it('lists follow-ups for admins: low attendance and today’s birthdays', async () => {
    mockApi({ 'GET /dashboard': () => dashboard });
    await renderPage(<TodayPage />, { user: adminUser });
    expect(
      await screen.findByRole('link', { name: /Low attendance · Arjun Mehta/ }),
    ).toHaveTextContent('17%');
    expect(
      screen.getByRole('link', { name: /Riya Shah · birthday today \(12\)/ }),
    ).toBeInTheDocument();
  });

  it('keeps session to-dos on the timeline only, not in the to-do list', async () => {
    mockApi({
      'GET /me/tasks': () => ({
        generatedAt: '',
        total: 2,
        counts: {},
        items: [
          {
            id: 'missed-check-in:b1:2026-03-09',
            kind: 'missed-check-in',
            severity: 'critical',
            title: 'Kavya hasn’t checked in',
            detail: 'Morning U-12 started at 6:00 am',
            link: '/calendar',
            screen: '/calendar',
          },
          {
            id: 'feedback:2026-03-02',
            kind: 'feedback',
            severity: 'info',
            title: '3 weekly reports to send',
            detail: 'For the week of 2026-03-02',
            link: '/feedback',
            screen: '/feedback',
          },
        ],
      }),
      // Echo the requested day, so the plan shows it as today.
      'GET /attendance/calendar': (c) => ({
        from: c.query.get('from'),
        to: c.query.get('to'),
        today: c.query.get('from'),
        days: [{ date: c.query.get('from'), sessions: overview.sessions }],
      }),
    });
    await renderPage(<TodayPage />, { user: adminUser });
    expect(await screen.findByText('Later')).toBeInTheDocument();
    expect(screen.queryByText('Do now')).not.toBeInTheDocument(); // shown on its session card
    // The session's to-do also sits on its timeline card, as a short chip beside the time.
    expect(await screen.findByRole('link', { name: 'Kavya hasn’t checked in' })).toHaveTextContent(
      'Missed check-in',
    );
  });

  it('moves the day plan between days', async () => {
    const api = mockApi({});
    const { user } = await renderPage(<TodayPage />, { user: adminUser });
    await user.click(await screen.findByRole('button', { name: 'Next day' }));
    // One-day requests: today first, then tomorrow.
    const days = () =>
      api
        .find('GET /attendance/calendar')
        .filter((r) => r.query.get('from') === r.query.get('to'))
        .map((r) => r.query.get('from'));
    await waitFor(() => expect(new Set(days()).size).toBe(2));
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
  });

  it('shows a coach only their own money and their overdue students, without amounts', async () => {
    mockApi({
      'GET /funds/overview': () => ({
        scope: 'self',
        from: '',
        to: '',
        cash: 120_000,
        due: 30_000,
        period: {
          collected: 450_000,
          earned: 0,
          earnedBy: [],
          kept: 0,
          handedOver: 0,
          spent: 0,
          paidToMe: 0,
        },
      }),
      'GET /students': () => ({
        data: [{ ...studentListItem, outstanding: 250_000, overdue: 250_000 }],
        meta: { page: 1, pageSize: 6, total: 1, totalPages: 1 },
      }),
    });
    await renderPage(<TodayPage />, { user: coachUser });
    expect(await screen.findByText('Cash with me')).toBeInTheDocument();
    expect(screen.getByText('₹1,200')).toBeInTheDocument();
    expect(screen.getByText('₹4,500')).toBeInTheDocument();
    const row = await screen.findByRole('link', { name: /Anya Rao/ });
    expect(row).toHaveTextContent('Overdue');
    expect(row).not.toHaveTextContent('₹2,500');
    expect(screen.getByRole('heading', { name: 'My money' })).toBeInTheDocument();
  });

  it('nudges a coach about batches without a ready lesson plan', async () => {
    mockApi({
      'GET /lessons/overview': () => ({
        batches: [
          { id: 'b1', name: 'M', attendanceOnly: false, status: 'none' },
          { id: 'b2', name: 'E', attendanceOnly: false, status: 'needs-update' },
          { id: 'b3', name: 'V', attendanceOnly: true, status: 'none' },
          { id: 'b4', name: 'R', attendanceOnly: false, status: 'ready' },
        ],
      }),
    });
    await renderPage(<TodayPage />, { user: coachUser });
    const link = await screen.findByRole('link', { name: /2 batches without a ready lesson plan/ });
    expect(link).toHaveTextContent('1 needs an update');
    expect(link).toHaveAttribute('href', '/lesson-plans?batch=b1&plan=1');
  });
});
