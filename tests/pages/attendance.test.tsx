import { __resetOutbox, flushOutbox, pendingCount } from '@/lib/attendance-outbox';
import type { AttendanceStatus } from '@/lib/types';
import { AttendancePage } from '@/pages/attendance';
import { batch, sheet } from '../fixtures';
import { fireEvent, within } from '@testing-library/react';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const route = '/attendance?batch=b1&date=2026-03-09';

/** One student's status button (Present / Absent / Late / Excused). */
const statusBtn = async (name: string, status: string) =>
  within(await screen.findByRole('radiogroup', { name: `Attendance for ${name}` })).getByRole(
    'radio',
    { name: status },
  );

describe('AttendancePage (admin)', () => {
  it('marks attendance with one tap and saves only changes', async () => {
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /attendance/session': () => sheet(),
      'PUT /attendance/session': (c) => ({
        saved: (c.body as { records: unknown[] }).records.length,
      }),
    });
    const { user } = await renderPage(<AttendancePage />, {
      path: '/attendance',
      route,
      user: adminUser,
    });

    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.getByText('Makeup')).toBeInTheDocument();
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();

    // "Rest present" only fills unmarked students.
    await user.click(screen.getByRole('button', { name: /rest present/i }));
    expect(await screen.findByText(/unsaved change/)).toHaveTextContent('1 unsaved change');

    // Change Bhavin from absent to late, with a note.
    const lateButtons = screen.getAllByRole('radio', { name: 'Late' });
    await user.click(lateButtons[1]!);
    await user.click(screen.getAllByRole('button', { name: 'Note for Bhavin Shah' })[0]!);
    await user.type(screen.getByPlaceholderText(/add a note/i), 'Traffic');

    await user.click(screen.getByRole('button', { name: /save attendance/i }));
    await waitFor(() => expect(api.find('PUT /attendance/session')).toHaveLength(1));
    expect(api.find('PUT /attendance/session')[0]!.body).toEqual({
      batchId: 'b1',
      date: '2026-03-09',
      records: [
        { studentId: 's1', status: 'present', note: null },
        { studentId: 's2', status: 'late', note: 'Traffic' },
      ],
    });
  });

  it('can undo unsaved changes', async () => {
    mockApi({ 'GET /batches': () => [batch], 'GET /attendance/session': () => sheet() });
    const { user } = await renderPage(<AttendancePage />, {
      path: '/attendance',
      route,
      user: adminUser,
    });
    await user.click(await screen.findByRole('button', { name: /rest present/i }));
    expect(screen.getByText(/unsaved change/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
  });

  it('shows a locked session read-only', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /attendance/session': () => sheet({ editable: false }),
    });
    await renderPage(<AttendancePage />, { path: '/attendance', route, user: adminUser });
    expect(await screen.findByText(/locked for editing/)).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: 'Present' })[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: /all present/i })).not.toBeInTheDocument();
  });

  it('explains days with no session or no students', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /attendance/session': () => sheet({ isScheduledDay: false, students: [] }),
    });
    await renderPage(<AttendancePage />, {
      path: '/attendance',
      route: '/attendance?batch=b1&date=2026-03-15',
      user: adminUser,
    });
    expect(await screen.findByText('No session on Sunday')).toBeInTheDocument();
  });

  it('auto-selects the only batch and shows server errors', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /attendance/session': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL', message: 'Database unavailable' } },
      }),
    });
    const { router } = await renderPage(<AttendancePage />, {
      path: '/attendance',
      route: '/attendance',
      user: adminUser,
    });
    await waitFor(() => expect(router.state.location.search).toContain('batch=b1'));
    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });

  it('shows the monthly register', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /attendance/session': () => sheet(),
      'GET /attendance/register': () => ({
        batch: { id: 'b1', name: 'Morning U-12' },
        dates: ['2026-03-02', '2026-03-04'],
        students: [
          {
            studentId: 's1',
            fullName: 'Anya Rao',
            code: 'ATQ-0001',
            marks: { '2026-03-02': 'present', '2026-03-04': 'absent' },
          },
        ],
      }),
    });
    const { user } = await renderPage(<AttendancePage />, {
      path: '/attendance',
      route,
      user: adminUser,
    });
    await user.click(await screen.findByRole('tab', { name: 'Monthly register' }));
    expect(await screen.findByText('50%')).toBeInTheDocument();
  });
});

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

describe('AttendancePage (coach)', () => {
  it('picks the day’s first session and filters sessions by place', async () => {
    coachApi();
    const { user, router } = await coachPage();
    const sessions = await screen.findByRole('radiogroup', { name: 'Session' });
    expect(within(sessions).getAllByRole('radio')).toHaveLength(3);
    await waitFor(() => expect(router.state.location.search).toContain('batch=b1'));
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Location' })).getByRole('radio', {
        name: /Lake Club/,
      }),
    );
    expect(within(sessions).getAllByRole('radio')).toHaveLength(1);
    await waitFor(() => expect(router.state.location.search).toContain('batch=b2'));
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
