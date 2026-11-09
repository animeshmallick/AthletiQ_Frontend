import { BatchDetailPage, BatchesPage } from '@/pages/batches';
import { CoachSessionsPage } from '@/pages/coach-sessions';
import { FinancePage } from '@/pages/finance';
import { LessonPlansPage } from '@/pages/lessons';
import { batch } from '../fixtures';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const stages = [
  {
    id: 'st1',
    coachId: 'coach-1',
    name: 'Warm-up',
    color: '#22c55e',
    sortOrder: 0,
    isArchived: false,
  },
  {
    id: 'st2',
    coachId: 'coach-1',
    name: 'Main',
    color: '#4f46e5',
    sortOrder: 1,
    isArchived: false,
  },
];
const events = [
  {
    id: 'ev1',
    coachId: 'coach-1',
    name: 'Footwork',
    description: 'Ladder',
    sortOrder: 0,
    isArchived: false,
  },
];
const calendar = {
  batch: { id: 'b1', name: 'Morning U-12', weekdays: [1, 2, 3, 4, 5, 6] },
  days: [{ date: '2026-03-09', isSessionDay: true, planId: null, filledCells: 0, totalCells: 0 }],
};

describe('LessonPlansPage', () => {
  it('builds a new plan from the library and saves it', async () => {
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/stages': () => stages,
      'GET /lessons/events': () => events,
      'GET /lessons/plans': () => calendar,
      'GET /lessons/plans/day': () => ({
        batch: { id: 'b1', name: 'Morning U-12' },
        date: '2026-03-09',
        isSessionDay: true,
        plan: null,
      }),
      'PUT /lessons/plans/day': (c) => ({
        id: 'p1',
        ...(c.body as object),
        stages,
        events,
        cells: [],
        notes: null,
        updatedAt: 'x',
        coachId: 'coach-1',
      }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-09',
      user: coachUser,
    });

    const cell = (await screen.findAllByLabelText('Footwork – Warm-up'))[0]!;
    expect(screen.getByText('0/2 filled')).toBeInTheDocument();
    await user.type(cell, 'Ladder drills x3');
    expect(screen.getByText('1/2 filled')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Session notes'), 'Bring cones');
    await user.click(screen.getByRole('button', { name: /save plan/i }));

    await waitFor(() => expect(api.find('PUT /lessons/plans/day')).toHaveLength(1));
    expect(api.find('PUT /lessons/plans/day')[0]!.body).toEqual({
      batchId: 'b1',
      date: '2026-03-09',
      stageIds: ['st1', 'st2'],
      eventIds: ['ev1'],
      notes: 'Bring cones',
      cells: [{ eventId: 'ev1', stageId: 'st1', content: 'Ladder drills x3' }],
    });
  });

  it('prompts coaches to set up the batch template first', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/stages': () => [],
      'GET /lessons/events': () => [],
      'GET /lessons/plans': () => calendar,
      'GET /lessons/plans/day': () => ({
        batch: { id: 'b1', name: 'M' },
        date: '2026-03-09',
        isSessionDay: true,
        plan: null,
      }),
    });
    await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-09',
      user: coachUser,
    });
    expect(await screen.findByText('Set up this batch’s plan template')).toBeInTheDocument();
  });

  it('shows plans read-only to admins', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/stages': () => stages,
      'GET /lessons/events': () => events,
      'GET /lessons/plans': () => calendar,
      'GET /lessons/plans/day': () => ({
        batch: { id: 'b1', name: 'M' },
        date: '2026-03-09',
        isSessionDay: true,
        plan: {
          id: 'p1',
          batchId: 'b1',
          coachId: 'coach-1',
          date: '2026-03-09',
          notes: 'Cones',
          updatedAt: 'x',
          stages,
          events,
          cells: [{ eventId: 'ev1', stageId: 'st2', content: 'Shadow footwork' }],
        },
      }),
    });
    await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-09',
      user: adminUser,
    });
    expect((await screen.findAllByText('Shadow footwork')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /library/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});

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
    await user.click(screen.getByRole('radio', { name: 'This FY' }));
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
      route: '/batches',
      user: adminUser,
    });
    expect(await screen.findByText('Morning U-12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Morning U-12' })).toBeInTheDocument();
    expect(screen.getByText('Seats left')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /new batch/i }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('New batch');
    await user.click(screen.getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByText('Pick a coach')).toBeInTheDocument();
  });

  it('shows a batch roster', async () => {
    mockApi({
      'GET /batches/b1': () => ({
        ...batch,
        members: [
          {
            studentId: 's1',
            code: 'ATQ-0001',
            fullName: 'Anya Rao',
            phone: '',
            trainingDays: [1, 3, 5],
            effectiveFrom: '2026-01-10',
            status: 'active',
          },
        ],
      }),
    });
    await renderPage(<BatchDetailPage />, {
      path: '/batches/:id',
      route: '/batches/b1',
      user: coachUser,
    });
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.getByText('Students (1 / 20)')).toBeInTheDocument();
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
            checkOutLat: null,
            checkOutLng: null,
            checkInDistanceM: 850,
            checkInWithinFence: false,
            checkOutAt: null,
            checkOutDistanceM: null,
            checkOutWithinFence: null,
            note: null,
            reviewedAt: null,
            reviewNote: null,
            flagged: true,
            durationMinutes: null,
            coach: { id: 'coach-1', name: 'Ravi' },
            batch: { id: 'b1', name: 'Morning U-12', startTime: '06:00:00', endTime: '08:00:00' },
            location: { id: 'l1', name: 'Club', radiusMeters: 200 },
          },
        ],
        summary: {
          sessions: 1,
          flagged: 1,
          unreviewedFlagged: 1,
          missingCheckOut: 1,
          totalHours: 0,
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
    expect(screen.getByText('no check-out')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Review check-in');
  });
});
