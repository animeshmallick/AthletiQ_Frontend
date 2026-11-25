import { __resetOutbox, flushOutbox, pendingCount } from '@/lib/attendance-outbox';
import type { AttendanceStatus } from '@/lib/types';
import { AttendancePage, AttendanceRegisterPage } from '@/pages/attendance';
import { sheet } from '../fixtures';
import { fireEvent, within } from '@testing-library/react';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

/** One student's status button (Present / Absent / Late / Excused). */
const statusBtn = async (name: string, status: string) =>
  within(await screen.findByRole('radiogroup', { name: `Attendance for ${name}` })).getByRole(
    'radio',
    { name: status },
  );

const at = (id: string, name: string, loc: [string, string], start: string, extra = {}) => ({
  batch: {
    id,
    name,
    startTime: start,
    endTime: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00:00`,
    coach: { id: 'c1', name: 'Coach One' },
    location: { id: loc[0], name: loc[1] },
  },
  expectedStudents: 2,
  marked: 1,
  present: 0,
  attendanceComplete: false,
  hasLessonPlan: false,
  coachSession: null,
  cancelled: null,
  ...extra,
});
const MAIN: [string, string] = ['l1', 'Main ground'];
const LAKE: [string, string] = ['l2', 'Lake Club'];
const day = [
  at('b1', 'Morning U-12', MAIN, '06:00:00'),
  at('b2', 'Lake Squad', LAKE, '09:00:00'),
  at('b3', 'Rained Out', MAIN, '17:00:00', { cancelled: 'Rain' }),
];
const withHistory = () =>
  sheet({
    students: sheet().students.map((s, i) => ({
      ...s,
      recent:
        i === 0
          ? []
          : [
              { date: '2026-03-07', status: 'absent' as const },
              { date: '2026-03-06', status: 'present' as const },
            ],
      rate30: i === 0 ? null : 40,
    })),
  });

type Handler = Parameters<typeof mockApi>[0][string];
function coachApi(over: Record<string, Handler> = {}) {
  const saved = new Map<string, AttendanceStatus | null>();
  const current = () => {
    const sh = withHistory();
    return {
      ...sh,
      students: sh.students.map((st) =>
        saved.has(st.studentId) ? { ...st, status: saved.get(st.studentId)! } : st,
      ),
    };
  };
  return mockApi({
    'GET /attendance/calendar': () => ({
      from: '2026-03-09',
      to: '2026-03-09',
      today: '2026-03-20',
      days: [{ date: '2026-03-09', sessions: day }],
    }),
    'GET /attendance/session': () => current(),
    'PUT /attendance/session': (c) => {
      const { records } = c.body as {
        records: { studentId: string; status: AttendanceStatus | null }[];
      };
      for (const r of records) saved.set(r.studentId, r.status);
      return { saved: records.length };
    },
    'GET /coach-sessions/today': () => ({ date: '2026-03-20', sessions: [] }),
    ...over,
  });
}
const coachPage = (route = '/attendance?date=2026-03-09') =>
  renderPage(<AttendancePage />, { path: '/attendance', route, user: coachUser });

const register = () => {
  const person = (studentId: string, fullName: string, extra = {}) => ({
    studentId,
    fullName,
    rate: 50,
    change: null,
    attended: 1,
    counted: 2,
    absentRun: 0,
    bestStreak: 1,
    late: 0,
    lastAttended: null,
    ...extra,
  });
  const session = (date: string, extra = {}) => ({
    date,
    startTime: '06:00:00',
    endTime: '08:00:00',
    origin: { kind: 'regular', originalDate: null, changeId: null },
    state: 'held',
    reason: null,
    substitute: null,
    checkedIn: null,
    expected: 2,
    marked: 1,
    present: 1,
    late: 0,
    absent: 0,
    excused: 0,
    rate: 100,
    ...extra,
  });
  const student = (studentId: string, fullName: string, extra = {}) => ({
    ...person(studentId, fullName),
    code: studentId,
    joinedOn: null,
    leftOn: null,
    cells: {},
    present: 1,
    absent: 0,
    excused: 0,
    unmarked: 0,
    previousRate: null,
    longestAbsence: 0,
    ...extra,
  });
  return {
    batch: {
      id: 'b1',
      name: 'Morning U-12',
      coach: { id: 'coach-1', name: 'Ravi Kumar' },
      location: 'Indiranagar Club',
      sport: 'Badminton',
      weekdays: [1, 3, 5],
      startTime: '06:00:00',
      endTime: '08:00:00',
      dayTimes: {},
      capacity: 20,
      isActive: true,
    },
    month: '2026-03-01',
    today: '2026-03-20',
    sessions: [
      session('2026-03-02'),
      session('2026-03-04'),
      session('2026-03-06', { state: 'cancelled', reason: 'Rain', marked: 0, rate: null }),
    ],
    students: [
      student('s1', 'Anya Rao', {
        rate: 100,
        cells: {
          '2026-03-02': { mark: 'present' },
          '2026-03-04': { mark: 'late', madeUp: 'Evening on 2026-03-05' },
          '2026-03-06': { mark: null },
        },
      }),
      student('s2', 'Bhavin Shah', {
        joinedOn: '2026-03-04',
        cells: { '2026-03-04': { mark: 'absent' } },
      }),
    ],
    summary: {
      students: 2,
      rate: 75,
      previousRate: 70,
      change: 5,
      present: 2,
      late: 1,
      absent: 1,
      excused: 0,
      madeUp: 1,
      sessions: 3,
      held: 2,
      cancelled: 1,
      unrecorded: 0,
      upcoming: 0,
      moved: 0,
      extra: 0,
      covered: 0,
      averagePresent: 1.5,
      completeness: 100,
      unmarked: 0,
      punctuality: null,
      checkIns: 0,
    },
    insights: {
      byWeekday: [{ weekday: 1, sessions: 1, rate: 100 }],
      byWeek: [{ week: '2026-03-02', sessions: 2, rate: 75 }],
      bands: { excellent: 1, good: 0, fair: 0, low: 1, none: 0 },
      best: { date: '2026-03-02', rate: 100 },
      worst: null,
      top: [person('s1', 'Anya Rao')],
      perfect: [],
      low: [person('s2', 'Bhavin Shah')],
      absentRuns: [person('s2', 'Bhavin Shah', { absentRun: 3 })],
      improved: [],
      declined: [],
      oftenLate: [],
      neverMarked: [],
      joined: 1,
      left: 0,
    },
  };
};

describe('AttendancePage (coach)', () => {
  it('lists the day’s sessions collapsed; tap one to mark it', async () => {
    coachApi();
    const { user } = await coachPage();
    const morning = await screen.findByRole('button', { name: /Morning U-12/ });
    expect(morning).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Lake Squad/ })).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Anya Rao')).not.toBeInTheDocument();
    await user.click(morning);
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
  });

  it('opens the session a link asks for, and steps to another day', async () => {
    coachApi();
    const { user, router } = await coachPage('/attendance?date=2026-03-09&batch=b2');
    expect(await screen.findByRole('button', { name: /Lake Squad/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(router.state.location.search).toContain('date=2026-03-08'));
    expect(router.state.location.search).not.toContain('batch=');
  });

  it('opens the monthly register from a session', async () => {
    coachApi({ 'GET /attendance/registers/b1': () => register() });
    const { user, router } = await renderPage(<AttendancePage />, {
      path: '/attendance',
      route: '/attendance?date=2026-03-09&batch=b1',
      user: coachUser,
      extraRoutes: [{ path: '/attendance/register/:batchId', element: <AttendanceRegisterPage /> }],
    });
    // Opens as its own page.
    await user.click(await screen.findByRole('link', { name: /monthly register/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/attendance/register/b1'));
    expect(await screen.findByRole('heading', { name: 'Morning U-12' })).toBeInTheDocument();
  });

  it('lists every batch’s month, and steps between months', async () => {
    const api = coachApi({
      'GET /attendance/registers': (c) => ({
        month: c.query.get('month'),
        batches: [
          {
            batch: register().batch,
            month: '2026-03-01',
            summary: register().summary,
            low: 1,
            absentRuns: 1,
            perfect: 0,
            trend: [
              { date: '2026-03-02', rate: 50 },
              { date: '2026-03-04', rate: 100 },
            ],
          },
        ],
      }),
    });
    const { user, router } = await coachPage('/attendance?date=2026-03-09');
    await user.click(await screen.findByRole('radio', { name: /Monthly register/ }));
    const tile = await screen.findByRole('link', { name: /Morning U-12/ });
    expect(tile).toHaveAttribute('href', '/attendance/register/b1');
    expect(within(tile).getByText(/1 student missing 3\+ in a row/)).toBeInTheDocument();
    expect(within(tile).getByRole('img', { name: '75% attendance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(router.state.location.search).toMatch(/month=\d{4}-\d{2}/));
    await waitFor(() => expect(api.find('GET /attendance/registers')).toHaveLength(2));
  });

  it('shows a batch’s register, insights and sessions for a month', async () => {
    const api = coachApi({
      'GET /attendance/registers/b1': () => register(),
      'GET /attendance/session': () => sheet(),
    });
    const { user } = await renderPage(<AttendanceRegisterPage />, {
      path: '/attendance/register/:batchId',
      route: '/attendance/register/b1?month=2026-03',
      user: coachUser,
    });
    expect(
      await screen.findByRole('button', { name: 'Anya Rao, 2 Mar: Present' }),
    ).toBeInTheDocument();
    expect(api.find('GET /attendance/registers/b1')[0]!.query.get('month')).toBe('2026-03-01');
    expect(
      screen.getByRole('button', { name: /Anya Rao, 4 Mar: Late, made up in Evening/ }),
    ).toBeInTheDocument();
    // Not a member yet that day: nothing to open.
    expect(
      screen.getByRole('button', { name: /Bhavin Shah, 2 Mar: not in this batch/ }),
    ).toBeDisabled();
    expect(screen.getByText('Joined 4 Mar')).toBeInTheDocument();
    const names = () => screen.getAllByRole('rowheader').map((h) => h.textContent!);
    expect(names()[0]).toContain('Anya');
    await user.click(screen.getByRole('button', { name: /Sort: Highest first/ }));
    await user.click(screen.getByRole('button', { name: /Sort: Lowest first/ }));
    expect(names()[0]).toContain('Bhavin');
    await user.click(screen.getByRole('button', { name: 'Anya Rao, 2 Mar: Present' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('radio', { name: /Insights/ }));
    expect(await screen.findByText('This month in short')).toBeInTheDocument();
    expect(
      screen.getByText(/Bhavin Shah has missed 3 or more sessions in a row/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/₹/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Sessions/ }));
    expect(await screen.findByText(/Rain/)).toBeInTheDocument();
  });

  it('marks everyone left present in one tap, with undo', async () => {
    const api = coachApi();
    const { user } = await coachPage('/attendance?date=2026-03-09&batch=b1');
    await user.click(await screen.findByRole('button', { name: /mark remaining 1 present/i }));
    await waitFor(() => expect(api.find('PUT /attendance/session')).toHaveLength(1));
    expect(api.find('PUT /attendance/session')[0]!.body).toEqual({
      batchId: 'b1',
      date: '2026-03-09',
      records: [{ studentId: 's1', status: 'present', note: null }],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(api.find('PUT /attendance/session')).toHaveLength(2));
    expect(api.find('PUT /attendance/session')[1]!.body).toMatchObject({
      records: [{ studentId: 's1', status: null }],
    });
  });

  it('marks a student with one tap and saves it straight away', async () => {
    const api = coachApi();
    const { user } = await coachPage('/attendance?date=2026-03-09&batch=b1');
    // Bhavin was absent: one tap on P makes him present.
    expect(await statusBtn('Bhavin Shah', 'Absent')).toHaveAttribute('aria-checked', 'true');
    await user.click(await statusBtn('Bhavin Shah', 'Present'));
    // Shown at once, before the save lands.
    await waitFor(async () =>
      expect(await statusBtn('Bhavin Shah', 'Present')).toHaveAttribute('aria-checked', 'true'),
    );
    await waitFor(() => expect(api.find('PUT /attendance/session')).toHaveLength(1));
    expect(api.find('PUT /attendance/session')[0]!.body).toMatchObject({
      records: [{ studentId: 's2', status: 'present', note: null }],
    });
  });

  it('sorts by name or highest attendance, and remembers the choice', async () => {
    const [a, b] = sheet().students;
    const students = [
      { ...b!, studentId: 's3', fullName: 'Zoya', rate30: 90 },
      { ...a!, rate30: 50 }, // Anya Rao
      { ...b!, studentId: 's4', fullName: 'Meera', rate30: null },
    ];
    const open = async () => {
      mockApi({
        'GET /attendance/calendar': () => ({
          from: '2026-03-09',
          to: '2026-03-09',
          today: '2026-03-20',
          days: [
            {
              date: '2026-03-09',
              sessions: [at('b1', 'Morning U-12', ['l1', 'Ground'], '06:00:00')],
            },
          ],
        }),
        'GET /attendance/session': () => sheet({ students }),
      });
      return renderPage(<AttendancePage />, {
        path: '/attendance',
        route: '/attendance?batch=b1&date=2026-03-09',
        user: adminUser,
      });
    };
    const names = () =>
      screen
        .getAllByRole('radiogroup', { name: /^Attendance for/ })
        .map((r) => r.getAttribute('aria-label')!.replace('Attendance for ', ''));
    const first = await open();
    // Highest attendance first, unless they chose otherwise.
    await screen.findByRole('button', { name: /Sort by name/ });
    expect(names()).toEqual(['Zoya', 'Anya Rao', 'Meera']);
    await first.user.click(screen.getByRole('button', { name: /Sort by name/ }));
    expect(names()).toEqual(['Anya Rao', 'Meera', 'Zoya']);
    first.unmount();
    await open();
    await screen.findByRole('button', { name: /Sort by highest attendance/ });
    expect(names()).toEqual(['Anya Rao', 'Meera', 'Zoya']);
    localStorage.removeItem('atq-attendance-sort');
  });

  it('recalculates the 30-day attendance as soon as a student is marked', async () => {
    const [a] = sheet().students;
    const students = [
      { ...a!, status: null, isMakeup: false, rate30: 100, before30: { marked: 3, present: 3 } },
    ];
    mockApi({
      'GET /attendance/calendar': () => ({
        from: '2026-03-09',
        to: '2026-03-09',
        today: '2026-03-20',
        days: [
          {
            date: '2026-03-09',
            sessions: [at('b1', 'Morning U-12', ['l1', 'Ground'], '06:00:00')],
          },
        ],
      }),
      'GET /attendance/session': () => sheet({ students }),
      'PUT /attendance/session': () => {
        students[0] = { ...students[0]!, status: 'absent' as never };
        return { saved: 1 };
      },
    });
    const { user } = await renderPage(<AttendancePage />, {
      path: '/attendance',
      route: '/attendance?batch=b1&date=2026-03-09',
      user: adminUser,
    });
    expect(await screen.findByText(/100% · 30d/)).toBeInTheDocument();
    const toggle = screen.getByRole('radiogroup', { name: /^Attendance for/ });
    await user.click(within(toggle).getByRole('radio', { name: /Absent/ }));
    expect(await screen.findByText(/75% · 30d/)).toBeInTheDocument();
  });

  it('filters the list from the summary counts', async () => {
    coachApi();
    const { user } = await coachPage('/attendance?date=2026-03-09&batch=b1');
    const show = await screen.findByRole('radiogroup', { name: 'Show students' });
    await user.click(within(show).getByRole('radio', { name: /^Absent/ }));
    expect(screen.getByText('Bhavin Shah')).toBeInTheDocument();
    expect(screen.queryByText('Anya Rao')).not.toBeInTheDocument();
    // Tap again: everyone.
    await user.click(within(show).getByRole('radio', { name: /^Absent/ }));
    expect(screen.getByText('Anya Rao')).toBeInTheDocument();
  });

  it('shows each student’s recent sessions and 30-day rate', async () => {
    coachApi();
    await coachPage('/attendance?date=2026-03-09&batch=b1');
    expect(await screen.findByLabelText('Last 2: Present, Absent')).toBeInTheDocument();
    expect(screen.getByText('40% · 30d')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('keeps marking without signal: saved on the phone, synced when back online', async () => {
    __resetOutbox();
    const api = coachApi({
      'PUT /attendance/session': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const { user } = await coachPage('/attendance?date=2026-03-09&batch=b1');
    await user.click(await statusBtn('Bhavin Shah', 'Present'));
    // Kept (not rolled back), and the coach is told it's on the phone.
    await waitFor(async () =>
      expect(await statusBtn('Bhavin Shah', 'Present')).toHaveAttribute('aria-checked', 'true'),
    );
    expect(await screen.findByText(/saved on this phone/)).toBeInTheDocument();
    expect(pendingCount('b1', '2026-03-09')).toBe(1);
    expect(screen.getByText(/taken while offline/)).toBeInTheDocument();

    // Connection back: it syncs.
    api.fetchMock.mockClear();
    mockApi({ 'PUT /attendance/session': () => ({ saved: 1 }) });
    await flushOutbox();
    expect(pendingCount()).toBe(0);
  });

  it('rolls back a tap that fails to save', async () => {
    coachApi({
      'PUT /attendance/session': () => ({
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'Check in first' } },
      }),
    });
    const { user } = await coachPage('/attendance?date=2026-03-09&batch=b1');
    await user.click(await statusBtn('Anya Rao', 'Present'));
    expect(await screen.findByText('Check in first')).toBeInTheDocument();
    // Back to unmarked.
    await waitFor(async () =>
      expect(await statusBtn('Anya Rao', 'Present')).toHaveAttribute('aria-checked', 'false'),
    );
  });

  it('explains a locked session', async () => {
    coachApi({
      'GET /attendance/session': () => sheet({ editable: false, lockedReason: 'You checked out' }),
    });
    await coachPage('/attendance?date=2026-03-09&batch=b1');
    expect(await screen.findByText('You checked out')).toBeInTheDocument();
    expect(await statusBtn('Anya Rao', 'Present')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /present$/i })).not.toBeInTheDocument();
  });

  it('shows an empty day', async () => {
    coachApi({
      'GET /attendance/calendar': () => ({
        from: '2026-03-15',
        to: '2026-03-15',
        today: '2026-03-20',
        days: [{ date: '2026-03-15', sessions: [] }],
      }),
    });
    await coachPage('/attendance?date=2026-03-15');
    expect(await screen.findByText(/^No sessions on/)).toBeInTheDocument();
  });
});

describe('AttendancePage (admin)', () => {
  const adminPage = (route = '/attendance?date=2026-03-09&batch=b1') =>
    renderPage(<AttendancePage />, { path: '/attendance', route, user: adminUser });

  it('sees every session with its coach and marks with one tap', async () => {
    const api = coachApi();
    const { user } = await adminPage();
    expect(await screen.findByRole('button', { name: /Lake Squad/ })).toHaveTextContent(
      'Coach One',
    );
    await user.click(await statusBtn('Anya Rao', 'Late'));
    await waitFor(() => expect(api.find('PUT /attendance/session')).toHaveLength(1));
    expect(api.find('PUT /attendance/session')[0]!.body).toMatchObject({
      batchId: 'b1',
      date: '2026-03-09',
      records: [{ studentId: 's1', status: 'late' }],
    });
    // Admins aren't checking in: no coach "today" call.
    expect(api.find('GET /coach-sessions/today')).toHaveLength(0);
  });

  it('shows a locked session read-only', async () => {
    coachApi({ 'GET /attendance/session': () => sheet({ editable: false }) });
    await adminPage();
    expect(await screen.findByText(/locked for editing/)).toBeInTheDocument();
    expect(await statusBtn('Anya Rao', 'Present')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /present/i })).not.toBeInTheDocument();
  });

  it('shows server errors', async () => {
    coachApi({
      'GET /attendance/session': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'Database unavailable' } },
      }),
    });
    await adminPage();
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });
});
