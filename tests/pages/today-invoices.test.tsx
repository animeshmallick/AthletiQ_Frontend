import { InvoicesPage } from '@/pages/invoices';
import { TodayPage } from '@/pages/today';
import { invoiceDetail } from '../fixtures';
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
    expect(await screen.findByText('4/10 marked · 3 present')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText(/2 students still need last week’s report/)).toBeInTheDocument();

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

  it('offers check-out once checked in, and shows completed sessions', async () => {
    mockApi({
      'GET /coach-sessions/today': () =>
        todaySession({
          id: 'cs1',
          checkInAt: '2026-03-09T00:31:00Z',
          checkOutAt: null,
          flagged: true,
        }),
      'GET /attendance/overview': () => overview,
    });
    await renderPage(<TodayPage />, { user: coachUser });
    expect(
      await screen.findByRole('button', { name: /check out · in since 6:01 am/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Flagged')).toBeInTheDocument();
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
    expect(await screen.findByText('₹2,500')).toBeInTheDocument();
    expect(screen.getByText('25% collected this month')).toBeInTheDocument();
    expect(await screen.findByText('3 registrations to review')).toBeInTheDocument();
    expect(screen.getByText('1 check-in flagged')).toBeInTheDocument();
    expect(screen.getByText('Anya Rao')).toBeInTheDocument();
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

    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.getByText('1 invoice')).toBeInTheDocument();
    expect(api.find('GET /invoices')[0]!.query.get('sort')).toBe('dueDateAsc');

    await user.click(screen.getByRole('button', { name: /Anya Rao/ }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('ATQ/2025-26/00001');
    // Coaches cannot cancel invoices.
    expect(screen.queryByRole('button', { name: 'Cancel invoice' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /i have received the payment/i }));
    await user.type(screen.getByLabelText(/UPI reference/i), 'UTR123');
    await user.click(
      screen.getAllByRole('button', { name: /i have received the payment/i }).at(-1)!,
    );
    await waitFor(() => expect(api.find('POST /invoices/i1/payments')).toHaveLength(1));
    expect(api.find('POST /invoices/i1/payments')[0]!.body).toMatchObject({
      mode: 'upi',
      reference: 'UTR123',
    });
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

  it('shows academy insights to admins', async () => {
    mockApi({ 'GET /dashboard': () => dashboard });
    await renderPage(<TodayPage />, { user: adminUser });
    expect(await screen.findByText('Active students')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('+3 joined · 1 left this month')).toBeInTheDocument();
    expect(screen.getByText('Kavya Iyer')).toBeInTheDocument();
    expect(screen.getByText('Morning U-12')).toBeInTheDocument();
    expect(screen.getByText('Arjun Mehta')).toBeInTheDocument();
    expect(screen.getByText('Riya Shah')).toBeInTheDocument();
  });

  it('shows a coach their month', async () => {
    mockApi({
      'GET /dashboard': () => ({
        ...dashboard,
        coaches: [],
        myMonth: { sessions: 9, hours: 13.5, onTimeRate: 89, flagged: 0 },
        feedback: { total: 12, submitted: 10, draft: 1, pending: 1 },
      }),
    });
    await renderPage(<TodayPage />, { user: coachUser });
    expect(await screen.findByText('My month')).toBeInTheDocument();
    expect(screen.getByText('10/12')).toBeInTheDocument();
    expect(screen.getByText('2 still to send')).toBeInTheDocument();
    expect(screen.getByText('89%')).toBeInTheDocument();
  });
});
