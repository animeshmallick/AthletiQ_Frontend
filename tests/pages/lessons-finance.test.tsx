import { BatchDetailPage, BatchesPage } from '@/pages/batches';
import { CoachSessionsPage } from '@/pages/coach-sessions';
import { FinancePage } from '@/pages/finance';
import { batch } from '../fixtures';
import { adminUser, chooseOption, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

describe('FinancePage', () => {
  it('renders KPIs, breakdowns and the projection', async () => {
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
      'GET /users': () => ({ data: [], meta: {} }),
      'GET /batches': () => [batch],
    });
    const { user } = await renderPage(<FinancePage />, {
      path: '/finance',
      route: '/finance',
      user: adminUser,
    });
    expect((await screen.findAllByText('₹10,000')).length).toBeGreaterThan(0);
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getAllByText('Morning U-12').length).toBeGreaterThan(0);
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.getByText('Collected by')).toBeInTheDocument();
    expect(screen.getByText('Coach Arjun')).toBeInTheDocument();
    await chooseOption(user, screen.getByRole('combobox', { name: 'Period' }), 'fy');
    await waitFor(() =>
      expect(
        api.find('GET /finance/summary').some((c) => c.query.get('from')?.endsWith('-04-01')),
      ).toBe(true),
    );
  });
});

describe('Batches', () => {
  it('lists batches and lets admins open the editor', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /users': () => ({ data: [], meta: {} }),
      'GET /locations': () => [],
    });
    const { user } = await renderPage(<BatchesPage />, {
      path: '/batches',
      route: '/batches?group=none',
      user: adminUser,
    });
    expect(await screen.findByText('Morning U-12')).toBeInTheDocument();
    // Cards open the batch; editing lives on the batch's page.
    expect(screen.queryByRole('button', { name: 'Edit Morning U-12' })).not.toBeInTheDocument();
    expect(screen.getByText('Seats left')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /new batch/i }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('New batch');
    await user.click(screen.getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByText('Pick a coach')).toBeInTheDocument();
  });

  it('shows a batch’s details, insights and students as cards', async () => {
    const insights = {
      summary: {
        students: 2,
        capacity: 20,
        seatsLeft: 18,
        attendanceRate: 75,
        sessions30: { scheduled: 10, held: 8, cancelled: 1, missed: 1, covered: 0, withPlan: 6 },
        checkIns30: { total: 8, onTime: 7, rate: 88 },
        skills: {
          assessedThisMonth: 1,
          levels: [{ code: 'B1', name: 'Lower Intermediate', students: 1 }],
        },
        movement90: { joined: 2, left: 0 },
        fees: { studentsOverdue: 1, studentsDue: 0, money: null },
      },
      trend: [{ week: '2026-03-02', sessions: 4, marked: 8, present: 6, rate: 75 }],
      upcoming: [
        {
          date: '2026-03-20',
          startTime: '06:00:00',
          endTime: '08:00:00',
          cancelled: null,
          substitute: 'Neha',
          marked: 0,
          present: 0,
          checkedIn: false,
          onTime: null,
          hasPlan: true,
        },
      ],
      recent: [
        {
          date: '2026-03-19',
          startTime: '06:00:00',
          endTime: '08:00:00',
          cancelled: 'Rain',
          substitute: null,
          marked: 0,
          present: 0,
          checkedIn: false,
          onTime: null,
          hasPlan: false,
        },
      ],
      roster: [
        {
          studentId: 's1',
          enrollmentId: 'e1',
          code: 'ATQ-0001',
          registrationNo: 1001,
          fullName: 'Anya Rao',
          phone: '+919876543210',
          guardianName: 'Ravi Rao',
          gender: 'female',
          dateOfBirth: '2014-05-02',
          joinedBatch: '2026-01-10',
          joinedAcademy: '2026-01-10',
          daysInBatch: 69,
          attendance: { marked: 8, present: 6, rate: 75 },
          lastAttended: '2026-03-17',
          fees: {
            monthly: null,
            due: null,
            overdue: null,
            status: 'overdue',
            unpaidInvoiceId: 'i9',
            lastPaidAt: null,
          },
          level: { name: 'Lower Intermediate', code: 'B1', month: '2026-03-01', average: 260 },
          assessedThisMonth: true,
        },
        {
          studentId: 's2',
          enrollmentId: 'e2',
          code: 'ATQ-0002',
          registrationNo: 1002,
          fullName: 'Kabir Shah',
          phone: '+919876543211',
          guardianName: null,
          gender: 'male',
          dateOfBirth: null,
          joinedBatch: '2026-03-10',
          joinedAcademy: '2026-03-10',
          daysInBatch: 9,
          attendance: { marked: 0, present: 0, rate: null },
          lastAttended: null,
          fees: {
            monthly: null,
            due: null,
            overdue: null,
            status: 'paid',
            unpaidInvoiceId: null,
            lastPaidAt: '2026-03-10T00:00:00Z',
          },
          level: null,
          assessedThisMonth: false,
        },
      ],
    };
    mockApi({
      'GET /batches/b1': () => ({ ...batch, members: [] }),
      'GET /batches/b1/insights': () => insights,
    });
    const { user } = await renderPage(<BatchDetailPage />, {
      path: '/batches/:id',
      route: '/batches/b1',
      user: coachUser,
    });
    // Details and insights.
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 20 students · 18 seats left/)).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument(); // coach on time
    expect(screen.queryByText('Expected / month')).not.toBeInTheDocument(); // coaches: no revenue
    expect(screen.queryByText(/Students \(1/)).not.toBeInTheDocument(); // old training-days view gone

    // Filter the cards, then open one.
    await user.click(screen.getByRole('radio', { name: /Overdue · 1/ }));
    expect(screen.queryByText('Kabir Shah')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Anya Rao details' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Ravi Rao');
    expect(dialog).toHaveTextContent('6 of 8 · 75%');
    expect(screen.getByRole('link', { name: 'Invoice' })).toHaveAttribute(
      'href',
      '/finance?tab=invoices&invoice=i9',
    );
    expect(screen.getByRole('link', { name: 'Open profile' })).toHaveAttribute(
      'href',
      '/students/s1',
    );

    // Sessions: upcoming shows the substitute; recent shows the cancellation.
    await user.keyboard('{Escape}');
    expect(await screen.findByText(/Substitute: Neha · plan ready/)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Recent' }));
    expect(screen.getByText('Cancelled · Rain')).toBeInTheDocument();
  });
});

describe('CoachSessionsPage', () => {
  it('summarises check-ins and flags out-of-range readings', async () => {
    mockApi({
      'GET /coach-sessions': () => ({
        from: '',
        to: '',
        sessions: [
          {
            id: 'cs1',
            coachId: 'coach-1',
            batchId: 'b1',
            date: '2026-03-09',
            checkInAt: '2026-03-09T00:30:00Z',
            checkInLat: 12.98,
            checkInLng: 77.6,
            checkInDistanceM: 850,
            checkInWithinFence: false,
            note: null,
            reviewedAt: null,
            reviewNote: null,
            flagged: true,
            durationMinutes: 120,
            scheduledStart: '06:00:00',
            scheduledEnd: '08:00:00',
            coach: { id: 'coach-1', name: 'Ravi' },
            batch: { id: 'b1', name: 'Morning U-12', startTime: '06:00:00', endTime: '08:00:00' },
            location: { id: 'l1', name: 'Club', radiusMeters: 200 },
          },
        ],
        summary: {
          sessions: 1,
          flagged: 1,
          unreviewedFlagged: 1,
          totalHours: 2,
        },
      }),
      'GET /users': () => ({ data: [], meta: {} }),
      'GET /locations': () => [],
    });
    const { user } = await renderPage(<CoachSessionsPage />, {
      path: '/coach-sessions',
      route: '/coach-sessions',
      user: adminUser,
    });
    expect(await screen.findByText('850 m away')).toBeInTheDocument();
    // Checked in at 6:00 am for a 6:00 session: on time, two hours coached.
    expect(screen.queryByText(/no check-out/)).not.toBeInTheDocument();
    expect(screen.getByText('Late check-ins')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check out/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Review check-in');
  });
});
