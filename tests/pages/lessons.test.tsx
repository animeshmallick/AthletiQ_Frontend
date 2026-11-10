import { LessonPlansPage } from '@/pages/lessons';
import { batch } from '../fixtures';
import { within } from '@testing-library/react';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const stages = [
  {
    id: 'st1',
    coachId: 'coach-1',
    name: 'Warm-up',
    color: '#22c55e',
    durationMin: 10,
    sortOrder: 0,
    isArchived: false,
  },
  {
    id: 'st2',
    coachId: 'coach-1',
    name: 'Main',
    color: '#4f46e5',
    durationMin: 40,
    sortOrder: 1,
    isArchived: false,
  },
];
const events = [
  {
    id: 'ev1',
    coachId: 'coach-1',
    name: 'Footwork',
    description: null,
    sortOrder: 0,
    isArchived: false,
  },
];
const calendar = {
  batch: { id: 'b1', name: 'Morning U-12', weekdays: [1, 2, 3, 4, 5, 6] },
  days: [
    {
      date: '2026-03-09',
      isSessionDay: true,
      cancelled: null,
      planId: 'p0',
      filledCells: 2,
      totalCells: 2,
    },
    {
      date: '2026-03-10',
      isSessionDay: true,
      cancelled: null,
      planId: null,
      filledCells: 0,
      totalCells: 0,
    },
  ],
};
const plan = {
  id: 'p1',
  batchId: 'b1',
  coachId: 'coach-1',
  date: '2026-03-10',
  notes: 'Bring cones',
  focus: 'Quick feet',
  durations: { st2: 45 },
  totalMinutes: 55,
  updatedAt: 'x',
  stages: stages.map((s) => ({ ...s, minutes: s.id === 'st2' ? 45 : s.durationMin })),
  events,
  cells: [
    { eventId: 'ev1', stageId: 'st1', content: 'Ladder x3' },
    { eventId: 'ev1', stageId: 'st2', content: 'Shadow court' },
  ],
};

const insights = {
  from: '2026-02-11',
  to: '2026-03-10',
  today: '2026-03-10',
  totals: {
    sessions: 10,
    cancelled: 1,
    planned: 8,
    complete: 6,
    missed: 2,
    upcomingUnplanned: 3,
    plannedAhead: 4,
    fillRate: 0.75,
    avgEvents: 2,
    streak: 4,
  },
  batches: [
    {
      id: 'b1',
      name: 'Morning U-12',
      startTime: '06:00:00',
      endTime: '08:00:00',
      weekdays: [1, 2, 3],
      coach: { id: 'coach-1', name: 'Coach One' },
      location: { id: 'l1', name: 'Main ground' },
      sessions: 10,
      planned: 8,
      complete: 6,
      missed: 2,
      fillRate: 0.75,
      streak: 4,
      next: { date: '2026-03-11', status: 'unplanned', filled: 0, total: 0 },
    },
  ],
  needsPlan: [
    {
      batchId: 'b1',
      batchName: 'Morning U-12',
      startTime: '06:00:00',
      date: '2026-03-11',
      status: 'unplanned',
    },
    {
      batchId: 'b1',
      batchName: 'Morning U-12',
      startTime: '06:00:00',
      date: '2026-03-12',
      status: 'partial',
    },
  ],
  weeks: [{ start: '2026-03-09', sessions: 3, planned: 2, complete: 1 }],
  events: [{ id: 'ev1', name: 'Footwork', plans: 8, cells: 12, lastUsed: '2026-03-09' }],
  stages: [
    { id: 'st1', name: 'Warm-up', color: '#22c55e', plans: 8, cells: 9 },
    { id: 'st2', name: 'Main', color: '#4f46e5', plans: 8, cells: 3 },
  ],
  unusedEvents: [{ id: 'ev9', name: 'Smash', lastUsed: null }],
};

function routes(day: Record<string, unknown>) {
  return {
    'GET /batches': () => [batch],
    'GET /lessons/stages': () => stages,
    'GET /lessons/events': () => events,
    'GET /lessons/plans': () => calendar,
    'GET /lessons/insights': () => insights,
    'GET /lessons/saved': () => [],
    'GET /lessons/plans/day': () => ({
      batch: { id: 'b1', name: 'Morning U-12' },
      date: '2026-03-10',
      isSessionDay: true,
      lockedReason: null,
      previousPlanDate: null,
      plan: null,
      ...day,
    }),
  };
}

describe('Lesson plans (coach)', () => {
  it('starts a new plan from the last session or a saved plan', async () => {
    const api = mockApi({
      ...routes({ previousPlanDate: '2026-03-09' }),
      'GET /lessons/plans/day': (c) => ({
        batch: { id: 'b1', name: 'Morning U-12' },
        date: c.query.get('date'),
        isSessionDay: true,
        lockedReason: null,
        previousPlanDate: '2026-03-09',
        plan: c.query.get('date') === '2026-03-09' ? { ...plan, date: '2026-03-09' } : null,
      }),
      'GET /lessons/saved': () => [
        {
          id: 't1',
          name: 'Match day',
          updatedAt: 'x',
          focus: 'Games',
          notes: null,
          durations: {},
          totalMinutes: 40,
          stages: [{ ...stages[1], minutes: 40 }],
          events: [],
          cells: [],
        },
      ],
      'PUT /lessons/plans/day': (c) => ({ ...plan, ...(c.body as object) }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-10',
      user: coachUser,
    });
    // Loading only fills the editor; nothing is saved until the coach saves.
    await user.click(await screen.findByRole('button', { name: /repeat last session/i }));
    expect(screen.getByLabelText('Session focus')).toHaveValue('Quick feet');
    expect(screen.getByText('Shadow court')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /saved plan match day/i }));
    expect(screen.getByLabelText('Session focus')).toHaveValue('Games');
    expect(api.find('PUT /lessons/plans/day')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(api.find('PUT /lessons/plans/day')).toHaveLength(1));
    expect(api.find('PUT /lessons/plans/day')[0]!.body).toMatchObject({
      date: '2026-03-10',
      stageIds: ['st2'],
      durations: { st2: 40 },
      focus: 'Games',
    });
  });

  it('lists sessions that still need a plan and opens one', async () => {
    mockApi(routes({}));
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-10',
      user: coachUser,
    });
    const strip = await screen.findByRole('region', { name: 'Needs a plan' });
    expect(within(strip).getByText(/1 session not planned/)).toBeInTheDocument();
    const chips = within(strip).getAllByRole('button');
    expect(chips).toHaveLength(2);
    await user.click(chips[1]!);
    await waitFor(() => expect(chips[1]).toHaveAttribute('aria-current', 'true'));
  });

  it('runs a saved plan from the run sheet, block by block', async () => {
    mockApi(routes({ plan }));
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-10',
      user: coachUser,
    });
    expect(await screen.findByText(/planned of 120 min/)).toHaveTextContent('55 min');
    await user.click(screen.getByRole('button', { name: /^run$/i }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Shadow court')).toBeInTheDocument();
    expect(within(sheet).getByText('Bring cones')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /start/i }));
    expect(within(sheet).getByText('Block 1 of 2')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Time left in this block')).toHaveTextContent('10:00');
    await user.click(within(sheet).getByRole('button', { name: 'Next' }));
    expect(within(sheet).getByText('Block 2 of 2')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Time left in this block')).toHaveTextContent('45:00');
  });

  it('asks before leaving a day with unsaved changes', async () => {
    mockApi(routes({ plan }));
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-10',
      user: coachUser,
    });
    const focus = await screen.findByLabelText('Session focus');
    await user.type(focus, '!');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next week' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByLabelText('Session focus')).toHaveValue('Quick feet!');
    // Discarding goes back to the saved plan.
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.getByLabelText('Session focus')).toHaveValue('Quick feet');
  });

  it('saves the plan under a name and uses it for other sessions', async () => {
    const api = mockApi({
      ...routes({ plan }),
      'POST /lessons/saved': (c) => ({ id: 't9', ...(c.body as object) }),
      'POST /lessons/plans/copy': (c) => ({
        copied: (c.body as { toDates: string[] }).toDates,
        skipped: [],
      }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-10',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: 'More plan actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /save as a reusable plan/i }));
    await user.type(await screen.findByLabelText('Plan name'), 'Footwork day');
    await user.click(screen.getByRole('button', { name: /save plan/i }));
    await waitFor(() => expect(api.find('POST /lessons/saved')).toHaveLength(1));
    expect(api.find('POST /lessons/saved')[0]!.body).toMatchObject({
      name: 'Footwork day',
      stageIds: ['st1', 'st2'],
      durations: { st1: 10, st2: 45 },
      focus: 'Quick feet',
    });

    await user.click(screen.getByRole('button', { name: 'More plan actions' }));
    await user.click(await screen.findByRole('menuitem', { name: /use for other sessions/i }));
    await user.click(await screen.findByRole('button', { name: /rest of this week/i }));
    await user.click(screen.getByRole('button', { name: /use for 5 sessions/i }));
    await waitFor(() => expect(api.find('POST /lessons/plans/copy')).toHaveLength(1));
    expect(api.find('POST /lessons/plans/copy')[0]!.body).toEqual({
      batchId: 'b1',
      fromDate: '2026-03-10',
      toBatchId: 'b1',
      toDates: ['2026-03-09', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14'],
      overwrite: false,
    });
  });

  it('shows admins insights for all batches without a batch filter', async () => {
    const api = mockApi(routes({}));
    await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=all&view=insights',
      user: adminUser,
    });
    expect(await screen.findByText('Sessions planned')).toBeInTheDocument();
    // 'all' is not a batch id: the request asks for every batch instead.
    expect(api.find('GET /lessons/insights').every((c) => !c.query.get('batchId'))).toBe(true);
  });

  it('renders planning insights', async () => {
    mockApi(routes({}));
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-10&view=insights',
      user: coachUser,
    });
    expect(await screen.findByText('Sessions planned')).toBeInTheDocument();
    expect(screen.getByText('80% coverage · 1 cancelled')).toBeInTheDocument();
    expect(screen.getByText('2 missed')).toBeInTheDocument();
    expect(screen.getByText('Smash')).toBeInTheDocument();
    expect(screen.getByText('6 plans fully filled')).toBeInTheDocument();
    // Opening a batch goes back to the plan view on its next session.
    await user.click(screen.getByRole('button', { name: /Morning U-12/ }));
    expect(await screen.findByRole('region', { name: 'Week' })).toBeInTheDocument();
  });
});

describe('Lesson plans (coach dates)', () => {
  const dayDates = (api: ReturnType<typeof mockApi>) =>
    api.find('GET /lessons/plans/day').map((c) => c.query.get('date'));

  it('snaps a non-session date to the next session day', async () => {
    const api = mockApi(routes({}));
    await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-15', // Sunday; the batch trains Mon–Sat
      user: coachUser,
    });
    await waitFor(() => expect(dayDates(api)).toContain('2026-03-16'));
  });

  it('steps between session days and disables days without a session', async () => {
    const api = mockApi({
      ...routes({}),
      'GET /lessons/plans': () => ({
        ...calendar,
        days: [
          ...calendar.days,
          {
            date: '2026-03-15',
            isSessionDay: false,
            cancelled: null,
            planId: null,
            filledCells: 0,
            totalCells: 0,
          },
        ],
      }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-14',
      user: coachUser,
    });
    expect(await screen.findByRole('button', { name: /15 March \(no session\)/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next session' }));
    await waitFor(() => expect(dayDates(api)).toContain('2026-03-16'));
    expect(dayDates(api)).not.toContain('2026-03-15');
    await user.click(screen.getByRole('button', { name: 'Previous session' }));
    expect(await screen.findByRole('heading', { name: /14 March/ })).toBeInTheDocument();
  });
});

describe('Lesson plans (all batches)', () => {
  it('combines batches on one week strip and opens a batch from the day list', async () => {
    const day = (date: string, planId: string | null, filled = 0) => ({
      date,
      isSessionDay: true,
      cancelled: null,
      planId,
      filledCells: filled,
      totalCells: planId ? 2 : 0,
    });
    const api = mockApi({
      ...routes({}),
      'GET /batches': () => [batch, { ...batch, id: 'b2', name: 'Evening' }],
      'GET /lessons/plans': (c) => {
        const id = c.query.get('batchId')!;
        return {
          batch: {
            id,
            name: id === 'b1' ? 'Morning U-12' : 'Evening',
            weekdays: [1, 2, 3, 4, 5, 6],
          },
          days: [id === 'b1' ? day('2026-03-10', 'p1', 2) : day('2026-03-10', null)],
        };
      },
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=all&date=2026-03-10',
      user: coachUser,
    });
    const list = await screen.findByRole('list', { name: 'Sessions this day' });
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    expect(within(list).getByText('2/2')).toBeInTheDocument();
    expect(within(list).getByText('Not planned')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /10 March \(partly planned, 1\/2 sessions\)/ }),
    ).toBeInTheDocument();
    // The combined view never asks for a single day's plan.
    expect(api.find('GET /lessons/plans/day')).toHaveLength(0);
    await user.click(within(list).getByRole('button', { name: /Evening/ }));
    await waitFor(() =>
      expect(api.find('GET /lessons/plans/day').map((c) => c.query.get('batchId'))).toContain('b2'),
    );
  });
});

describe('Planning library', () => {
  it('manages blocks with minutes, drills and saved plans in one place', async () => {
    const api = mockApi({
      ...routes({}),
      'GET /lessons/saved': () => [
        {
          id: 't1',
          name: 'Match day',
          updatedAt: 'x',
          focus: null,
          notes: null,
          durations: {},
          totalMinutes: 40,
          stages: [{ ...stages[1], minutes: 40 }],
          events: [],
          cells: [],
        },
      ],
      'POST /lessons/stages': (c) => ({
        id: 'st9',
        sortOrder: 2,
        isArchived: false,
        ...(c.body as object),
      }),
      'PATCH /lessons/stages/st1': (c) => ({ ...stages[0], ...(c.body as object) }),
      'DELETE /lessons/saved/t1': () => ({ status: 204 }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-10',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /library/i }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('10 min')).toBeInTheDocument();
    // One library for every batch: no batch in the request.
    expect(api.find('GET /lessons/stages').every((c) => !c.query.get('batchId'))).toBe(true);

    await user.type(within(dialog).getByLabelText('New block'), 'Match play');
    await user.clear(within(dialog).getByLabelText('Minutes'));
    await user.type(within(dialog).getByLabelText('Minutes'), '25');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(api.find('POST /lessons/stages')).toHaveLength(1));
    expect(api.find('POST /lessons/stages')[0]!.body).toMatchObject({
      name: 'Match play',
      durationMin: 25,
    });

    await user.click(within(dialog).getByRole('button', { name: 'Edit Warm-up' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit block' });
    await user.clear(within(edit).getByLabelText('Default minutes'));
    await user.type(within(edit).getByLabelText('Default minutes'), '15');
    await user.click(within(edit).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.find('PATCH /lessons/stages/st1')).toHaveLength(1));
    expect(api.find('PATCH /lessons/stages/st1')[0]!.body).toMatchObject({ durationMin: 15 });

    await user.click(within(dialog).getByRole('tab', { name: /saved plans/i }));
    expect(await within(dialog).findByText('Match day')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete Match day' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.find('DELETE /lessons/saved/t1')).toHaveLength(1));
  });
});

describe('Lesson plans (admin)', () => {
  it('reads plans without editing and has no up-next strip', async () => {
    mockApi(routes({ plan }));
    await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-10',
      user: adminUser,
    });
    expect((await screen.findAllByText('Shadow court')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('region', { name: 'Needs a plan' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});
