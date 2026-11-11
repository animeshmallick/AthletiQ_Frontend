import { within } from '@testing-library/react';
import { LessonPlansPage } from '@/pages/lessons';
import type { BatchPlan, BatchPlanView, PlanOverviewItem, SessionPlanView } from '@/lib/types';
import { batch } from '../fixtures';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const info = {
  id: 'b1',
  name: 'Morning U-12',
  weekdays: [1, 2, 3, 4, 5, 6],
  sessionMinutes: 120,
  minutesByDay: { '1': 120, '2': 120, '3': 120, '4': 120, '5': 120, '6': 120 },
};

const plan: BatchPlan = {
  focus: 'Footwork',
  notes: null,
  updatedAt: '2026-03-01T10:00:00Z',
  updatedBy: { id: 'coach-1', name: 'Ravi Kumar' },
  totalMinutes: 120,
  blocks: [
    {
      id: 'k1',
      name: 'Warm-up',
      color: '#22c55e',
      minutes: 20,
      drills: [{ id: 'd1', name: 'Skipping', minutes: 5, reps: '3 sets', note: 'Light feet' }],
    },
    { id: 'k2', name: 'Ball drills', color: '#f59e0b', minutes: 90, drills: [] },
    { id: 'k3', name: 'Cool down', color: '#06b6d4', minutes: 10, drills: [] },
  ],
};

const view = (over: Partial<BatchPlanView> = {}): BatchPlanView => ({
  batch: info,
  plan: null,
  mismatch: null,
  canEdit: true,
  ...over,
});

const item = (over: Partial<PlanOverviewItem>): PlanOverviewItem => ({
  id: 'b1',
  name: 'Morning U-12',
  sport: 'Badminton',
  location: 'Indiranagar Club',
  coach: { id: 'coach-1', name: 'Ravi Kumar' },
  attendanceOnly: false,
  sessionMinutes: 120,
  status: 'none',
  totalMinutes: 0,
  blocks: 0,
  drills: 0,
  adjustedDays: 0,
  updatedAt: null,
  ...over,
});

const session = (over: Partial<SessionPlanView> = {}): SessionPlanView => ({
  batch: info,
  date: '2026-03-09',
  minutes: 120,
  lockedReason: null,
  source: 'batch',
  focus: 'Footwork',
  note: null,
  // Not filled in yet: the batch plan's blocks, no drills; its drills are offered per block.
  blocks: plan.blocks.map((b) => ({ ...b, drills: [] })),
  totalMinutes: 120,
  canAdjust: true,
  drillOptions: Object.fromEntries(plan.blocks.map((b) => [b.name, b.drills])),
  ...over,
});

describe('Lesson plans by day', () => {
  it('lists every batch running that day, collapsed, and opens one batch’s plan', async () => {
    // 2026-03-09 is a Monday: b1 (Mon–Sat) and b2 (Mon) run; b3 (Sun) doesn't.
    mockApi({
      'GET /batches': () => [
        batch,
        { ...batch, id: 'b2', name: 'Evening', weekdays: [1], startTime: '17:00:00' },
        { ...batch, id: 'b3', name: 'Sunday club', weekdays: [7] },
      ],
      'GET /lessons/overview': () => ({ batches: [item({ status: 'ready' })] }),
      'GET /lessons/session': (c) =>
        session({
          date: c.query.get('date')!,
          ...(c.query.get('batchId') === 'b2' ? { source: 'session' as const } : {}),
          batch: { ...info, id: c.query.get('batchId')! },
        }),
      'GET /lessons/batch-plan': () => view({ plan }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?date=2026-03-09',
      user: coachUser,
    });
    const morning = await screen.findByRole('button', { name: /Morning U-12/ });
    expect(screen.getByRole('button', { name: /Evening/ })).toBeInTheDocument();
    expect(screen.queryByText('Sunday club')).not.toBeInTheDocument();
    expect(screen.getByText('2 sessions')).toBeInTheDocument();
    // Collapsed, with each day's status; no batch-plan button for all batches.
    expect(morning).toHaveAttribute('aria-expanded', 'false');
    // Each day's status floats on its section.
    expect(await screen.findByText('Not filled in yet')).toBeInTheDocument();
    expect(await screen.findByText('Filled in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit plan/ })).not.toBeInTheDocument();

    await user.click(morning);
    expect(await screen.findByRole('button', { name: /Fill now/ })).toBeInTheDocument();
    expect(screen.getByText('Ball drills')).toBeInTheDocument();

    // The batch's plan template opens in a modal from its card.
    await user.click(screen.getByRole('button', { name: /Manage plan template/ }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Skipping')).toBeInTheDocument();
    expect(within(dialog).getByText('Light feet')).toBeInTheDocument();
  });

  it('steps a day at a time across all batches', async () => {
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/session': (c) => session({ date: c.query.get('date')! }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?date=2026-03-14',
      user: coachUser,
    });
    expect(await screen.findByRole('button', { name: /Morning U-12/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(await screen.findByText('No sessions this day')).toBeInTheDocument();
    expect(api.find('GET /lessons/session').length).toBeGreaterThan(0);
    // Back to today in one tap.
    await user.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument(),
    );
  });
});

describe('Batch plan', () => {
  it('starts from warm-up · main · cool-down, adds a drill and saves only when it fits', async () => {
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/batch-plan': () => view(),
      'PUT /lessons/batch-plan': () => view({ plan }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&plan=1',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /Start with warm-up/ }));
    expect(
      screen.getAllByLabelText('Block name').map((i) => (i as HTMLInputElement).value),
    ).toEqual(['Warm-up', 'Main session', 'Cool down']);
    expect(screen.getByText(/Fits the session/)).toBeInTheDocument();

    // Too long: can't save until it fits again.
    await user.click(screen.getByRole('button', { name: 'More time for Warm-up' }));
    expect(screen.getByText('5 min over')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeDisabled();
    expect(screen.getByText(/Remove 5 min to fit the 120-min session/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fit last block' }));
    expect(screen.getByText(/Fits the session/)).toBeInTheDocument();

    // A drill with details.
    const [warm] = screen.getAllByRole('button', { name: 'Add drill' });
    await user.click(warm!);
    await user.type(screen.getByLabelText('Drill name'), 'Skipping');
    await user.click(screen.getByRole('button', { name: 'Details for Skipping' }));
    await user.type(screen.getByLabelText('Reps'), '3 sets');
    await user.type(screen.getByLabelText('Drill note'), 'Light feet');
    await user.type(screen.getByPlaceholderText('e.g. Forehand consistency'), 'Footwork');

    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(api.find('PUT /lessons/batch-plan')).toHaveLength(1));
    expect(api.find('PUT /lessons/batch-plan')[0]!.body).toEqual({
      batchId: 'b1',
      focus: 'Footwork',
      notes: null,
      blocks: [
        {
          name: 'Warm-up',
          color: '#22c55e',
          minutes: 15,
          drills: [{ name: 'Skipping', minutes: null, reps: '3 sets', note: 'Light feet' }],
        },
        { name: 'Main session', color: '#f59e0b', minutes: 100, drills: [] },
        { name: 'Cool down', color: '#06b6d4', minutes: 5, drills: [] },
      ],
    });
    expect(await screen.findByRole('button', { name: /Edit plan/ })).toBeInTheDocument();
  }, 15_000); // lots of typing: slow when the suite runs with coverage

  it('edits blocks: reorder from the menu, add and remove', async () => {
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/batch-plan': () => view({ plan }),
      'PUT /lessons/batch-plan': () => view({ plan }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&plan=1',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /Edit plan/ }));
    await user.click(screen.getByRole('button', { name: 'More for Cool down' }));
    await user.click(await screen.findByRole('menuitem', { name: /Move up/ }));
    expect(
      screen.getAllByLabelText('Block name').map((i) => (i as HTMLInputElement).value),
    ).toEqual(['Warm-up', 'Cool down', 'Ball drills']);
    await user.click(screen.getByRole('button', { name: 'More for Warm-up' }));
    await user.click(await screen.findByRole('menuitem', { name: /Remove block/ }));
    expect(screen.getByText('20 min left')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Add block/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Workout/ }));
    expect(screen.getByText(/Fits the session/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    await waitFor(() => expect(api.find('PUT /lessons/batch-plan')).toHaveLength(1));
    expect(
      (api.find('PUT /lessons/batch-plan')[0]!.body as { blocks: { name: string }[] }).blocks.map(
        (b) => b.name,
      ),
    ).toEqual(['Cool down', 'Ball drills', 'Workout']);
  });

  it('closing with unsaved edits asks once, and Discard really closes (no loop)', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/batch-plan': () => view({ plan }),
    });
    const { user, router } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&plan=1',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /Edit plan/ }));
    await user.keyboard('{Escape}');
    expect(await screen.findByText('Close without saving?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.search).not.toContain('plan=1'));
    // Neither question comes back.
    expect(screen.queryByText('Close without saving?')).not.toBeInTheDocument();
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('flags a plan that no longer fits the sessions', async () => {
    mockApi({
      'GET /batches': () => [batch, { ...batch, id: 'b2', name: 'Mixed' }],
      'GET /lessons/batch-plan': (c) =>
        c.query.get('batchId') === 'b1'
          ? view({ plan, mismatch: 'The blocks add up to 120 min, but each session is 90 min.' })
          : view({
              batch: {
                ...info,
                id: 'b2',
                sessionMinutes: null,
                minutesByDay: { '1': 60, '4': 90 },
              },
            }),
    });
    await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&plan=1',
      user: coachUser,
    });
    expect(await screen.findByText(/This plan needs an update/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy/ })).not.toBeInTheDocument();
  });

  it('can’t give one plan to a batch whose days differ, and names them', async () => {
    mockApi({
      'GET /batches': () => [{ ...batch, id: 'b2', name: 'Mixed' }],
      'GET /lessons/batch-plan': () =>
        view({
          batch: { ...info, id: 'b2', sessionMinutes: null, minutesByDay: { '1': 60, '4': 90 } },
        }),
    });
    await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b2&plan=1',
      user: coachUser,
    });
    expect(
      (await screen.findByText(/days aren’t the same length/)).closest('[role=status]'),
    ).toHaveTextContent('Mon 60 min · Thu 90 min');
    expect(screen.queryByRole('button', { name: /Start with/ })).not.toBeInTheDocument();
  });

  it('copies the plan only to batches with the same session length', async () => {
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/batch-plan': () => view({ plan }),
      'GET /lessons/overview': () => ({
        batches: [
          item({ status: 'ready' }),
          item({ id: 'b2', name: 'Same length' }),
          item({ id: 'b3', name: 'Has one', status: 'ready' }),
          item({ id: 'b4', name: 'Shorter', sessionMinutes: 60 }),
        ],
      }),
      'POST /lessons/batch-plan/copy': () => ({ copied: ['b2', 'b3'], skipped: [] }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&plan=1',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /Copy/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Copy plan to other batches' });
    expect(await within(dialog).findByText('Same length')).toBeInTheDocument();
    expect(within(dialog).queryByText('Shorter')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/1 batch with a different session length/)).toBeInTheDocument();
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes[1]).toBeDisabled(); // already has a plan
    await user.click(within(dialog).getByRole('switch'));
    await user.click(boxes[0]!);
    await user.click(boxes[1]!);
    await user.click(within(dialog).getByRole('button', { name: 'Copy to 2' }));
    await waitFor(() => expect(api.find('POST /lessons/batch-plan/copy')).toHaveLength(1));
    expect(api.find('POST /lessons/batch-plan/copy')[0]!.body).toEqual({
      fromBatchId: 'b1',
      toBatchIds: ['b2', 'b3'],
      overwrite: true,
    });
  });

  it('is read-only for admins', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/batch-plan': () => view({ plan, canEdit: false }),
    });
    await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&plan=1',
      user: adminUser,
    });
    expect(await screen.findByText('Ball drills')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit plan/ })).not.toBeInTheDocument();
  });
});

describe('Session plans', () => {
  it('fills in a day from the plan’s drills or custom ones, at its exact length, and clears it', async () => {
    let current = session();
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/session': (c) => ({ ...current, date: c.query.get('date')! }),
      'PUT /lessons/session': (c) => {
        current = session({ source: 'session', note: 'Match prep' });
        return { status: 204, body: c.body };
      },
      'DELETE /lessons/session': () => {
        current = session();
        return { status: 204 };
      },
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-09',
      user: coachUser,
    });
    expect(await screen.findByText('Not filled in yet')).toBeInTheDocument();
    expect(screen.queryByText('Skipping')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Fill now/ }));
    // Starts empty: the batch plan's drills are offered, plus a custom one.
    expect(screen.queryByLabelText('Drill name')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skipping' }));
    expect(screen.queryByRole('button', { name: 'Skipping' })).not.toBeInTheDocument();
    const [custom] = screen.getAllByRole('button', { name: 'Custom drill' });
    await user.click(custom!);
    await user.type(screen.getAllByLabelText('Drill name').at(-1)!, 'Box jumps');
    await user.click(screen.getByRole('button', { name: 'Less time for Ball drills' }));
    expect(screen.getByRole('button', { name: 'Save this day' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'More time for Cool down' }));
    await user.type(screen.getByLabelText('Note for this session'), 'Match prep');
    await user.click(screen.getByRole('button', { name: 'Save this day' }));
    await waitFor(() => expect(api.find('PUT /lessons/session')).toHaveLength(1));
    const body = api.find('PUT /lessons/session')[0]!.body as {
      note: string;
      blocks: { name: string; drills: { name: string }[] }[];
    };
    expect(body.note).toBe('Match prep');
    expect(body.blocks[0]!.drills.map((d) => d.name)).toEqual(['Skipping', 'Box jumps']);
    expect(body.blocks[1]!.drills).toEqual([]);
    expect(await screen.findByText('Filled in')).toBeInTheDocument();
    expect(screen.getByText('Match prep')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear/ }));
    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(api.find('DELETE /lessons/session')).toHaveLength(1));
    expect(await screen.findByText('Not filled in yet')).toBeInTheDocument();
  });

  it('opens the batch a link asks for, and steps to days without a session', async () => {
    const api = mockApi({
      'GET /batches': () => [{ ...batch, weekdays: [1, 3] }],
      'GET /lessons/session': (c) =>
        session({
          date: c.query.get('date')!,
          ...(c.query.get('date') === '2026-03-11'
            ? { lockedReason: 'This session was cancelled (Rain).', canAdjust: true }
            : {}),
        }),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-11',
      user: coachUser,
    });
    expect(await screen.findByText(/This session was cancelled/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fill now/ })).not.toBeInTheDocument();
    expect(api.find('GET /lessons/session').some((c) => c.query.get('date') === '2026-03-11')).toBe(
      true,
    );
    // Thursday: b1 doesn't run.
    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(await screen.findByText('No sessions this day')).toBeInTheDocument();
  });

  it('offers to set up the plan when the batch has none', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/session': (c) =>
        session({ date: c.query.get('date')!, source: 'none', blocks: [], totalMinutes: 0 }),
      'GET /lessons/batch-plan': () => view(),
    });
    const { user } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?batch=b1&date=2026-03-09',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: 'Set up the plan' }));
    expect(await screen.findByRole('button', { name: /Start with warm-up/ })).toBeInTheDocument();
  });
});

describe('Lesson plan insights', () => {
  it('shows fill rate per batch, most used drills and opens a session not filled in', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /lessons/overview': () => ({ batches: [item({ status: 'ready' })] }),
      'GET /lessons/session': (c) => session({ date: c.query.get('date')! }),
      'GET /lessons/insights': () => ({
        from: '2026-03-01',
        to: '2026-03-11',
        totals: { sessions: 8, filled: 6, rate: 0.75, drills: 5 },
        batches: [{ id: 'b1', name: 'Morning U-12', sessions: 8, filled: 6, rate: 0.75 }],
        weeks: [
          { start: '2026-03-02', sessions: 4, filled: 4 },
          { start: '2026-03-09', sessions: 4, filled: 2 },
        ],
        drills: [{ name: 'Skipping', block: 'Warm-up', sessions: 6, batches: 1 }],
        blocks: [{ name: 'Warm-up', color: '#22c55e', minutes: 120 }],
        unfilled: [{ batchId: 'b1', batchName: 'Morning U-12', date: '2026-03-10' }],
      }),
    });
    const { user, router } = await renderPage(<LessonPlansPage />, {
      path: '/lesson-plans',
      route: '/lesson-plans?date=2026-03-09',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /Insights/ }));
    const dialog = await screen.findByRole('dialog');
    expect((await within(dialog).findAllByText('75%')).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Skipping')).toBeInTheDocument();
    expect(within(dialog).getByText('6/8 ·', { exact: false })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Morning U-12/ }));
    await waitFor(() => expect(router.state.location.search).toContain('date=2026-03-10'));
  });
});
