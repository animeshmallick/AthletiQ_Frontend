import { within } from '@testing-library/react';
import { CalendarPage } from '@/pages/calendar';
import { batch } from '../fixtures';
import { adminUser, coachUser, mockApi, renderPage, screen } from '../utils';

const session = {
  batch: {
    id: 'b1',
    name: 'Morning U-12',
    startTime: '06:00:00',
    endTime: '08:00:00',
    coach: { id: 'coach-1', name: 'Coach One' },
    location: { id: 'l1', name: 'Main ground' },
  },
  expectedStudents: 10,
  marked: 8,
  present: 7,
  attendanceComplete: false,
  hasLessonPlan: true,
  coachSession: null,
  cancelled: null,
};

const week = Array.from({ length: 7 }, (_, i) => {
  const date = `2026-03-${String(9 + i).padStart(2, '0')}`;
  return { date, sessions: date === '2026-03-10' ? [session] : [] };
});

function routes() {
  return {
    'GET /attendance/calendar': () => ({
      from: '2026-03-09',
      to: '2026-03-15',
      today: '2026-03-10',
      days: week,
    }),
    'GET /batches/:id': () => ({ ...batch, id: 'b1', members: [] }),
    'GET /attendance/session': () => ({
      batch: session.batch,
      date: '2026-03-10',
      isScheduledDay: true,
      cancelled: null,
      editable: true,
      students: [],
      summary: { total: 10, present: 6, late: 1, absent: 1, excused: 0, unmarked: 2 },
    }),
    'GET /lessons/plans/day': () => ({
      batch: { id: 'b1', name: 'Morning U-12' },
      date: '2026-03-10',
      isSessionDay: true,
      plan: {
        id: 'p1',
        batchId: 'b1',
        coachId: 'coach-1',
        date: '2026-03-10',
        notes: 'Bring cones',
        updatedAt: 'x',
        stages: [{ id: 's1', name: 'Warm-up', color: null }],
        events: [{ id: 'e1', name: 'Footwork', description: null }],
        cells: [{ eventId: 'e1', stageId: 's1', content: 'Ladder' }],
      },
    }),
    'GET /attendance/register': () => ({
      batch: { id: 'b1', name: 'Morning U-12' },
      dates: ['2026-03-03', '2026-03-05', '2026-03-10'],
      cancelled: {},
      students: [
        {
          studentId: 's1',
          fullName: 'Asha',
          code: 'A1',
          marks: { '2026-03-03': 'present', '2026-03-05': 'present', '2026-03-10': 'present' },
        },
        {
          studentId: 's2',
          fullName: 'Ravi',
          code: 'R1',
          marks: { '2026-03-03': 'absent', '2026-03-05': 'absent', '2026-03-10': 'present' },
        },
      ],
    }),
    'GET /lessons/insights': () => ({
      totals: {},
      batches: [
        {
          id: 'b1',
          sessions: 12,
          planned: 10,
          missed: 1,
          streak: 3,
          fillRate: 0.9,
          next: { date: '2026-03-11', status: 'unplanned' },
        },
      ],
    }),
  };
}

describe('CalendarPage', () => {
  it('opens a session popup from the week view with today’s numbers and trends', async () => {
    mockApi(routes());
    const { user } = await renderPage(<CalendarPage />, {
      path: '/calendar',
      route: '/calendar?view=week&date=2026-03-10',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /Morning U-12/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('8/10')).toBeInTheDocument();
    expect(await within(dialog).findByText('1/1')).toBeInTheDocument(); // plan grid filled
    expect(await within(dialog).findByText('67%')).toBeInTheDocument(); // 4 of 6 marks
    expect(within(dialog).getByText('10/12')).toBeInTheDocument();
    expect(within(dialog).getByText('Ravi · 33%')).toBeInTheDocument();
    expect(within(dialog).getByText(/Bring cones/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /open batch/i })).toHaveAttribute(
      'href',
      '/batches/b1',
    );
    // Still on the week view: the popup didn't switch to the day.
    expect(screen.getByRole('radio', { name: 'Week', hidden: true })).toBeChecked();
  });

  it('shows admins the coach tiles in time order, with coach and place, linking to the batch', async () => {
    mockApi(routes());
    const { user } = await renderPage(<CalendarPage />, {
      path: '/calendar',
      route: '/calendar?view=day&date=2026-03-10',
      user: adminUser,
    });
    const tile = await screen.findByRole('button', { name: 'Morning U-12 students' });
    expect(tile).toHaveTextContent(/·/);
    // No location grouping or travel for admins.
    expect(screen.queryByRole('link', { name: /directions to/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    await user.click(tile);
    expect(await screen.findByRole('link', { name: /open batch/i })).toHaveAttribute(
      'href',
      '/batches/b1',
    );
  });

  it('groups a coach’s day by location, with travel gaps and the students on tap', async () => {
    const at = (id: string, name: string, loc: string, start: string, end: string) => ({
      ...session,
      batch: {
        ...session.batch,
        id,
        name,
        startTime: start,
        endTime: end,
        location: {
          id: loc,
          name: loc === 'l1' ? 'Main ground' : 'Lake Club',
          latitude: 12.9,
          longitude: 77.6,
        },
      },
    });
    // Main ground 5–6, 6–7; Lake Club 7:30–8:30; back to Main ground 9–10 pm.
    const day = [
      at('b1', 'Juniors', 'l1', '17:00:00', '18:00:00'),
      at('b2', 'Seniors', 'l1', '18:00:00', '19:00:00'),
      at('b3', 'Lake Squad', 'l2', '19:30:00', '20:30:00'),
      { ...at('b4', 'Late Batch', 'l1', '21:00:00', '22:00:00'), cancelled: 'Rain' },
    ];
    mockApi({
      ...routes(),
      'GET /attendance/calendar': () => ({
        from: '2026-03-11',
        to: '2026-03-11',
        today: '2026-03-10',
        days: [{ date: '2026-03-11', sessions: day }],
      }),
      'GET /batches/b2/roster': () => ({
        date: '2026-03-11',
        students: [
          {
            studentId: 's1',
            code: 'A',
            fullName: 'Anya Rao',
            phone: '+919876543210',
            isMakeup: false,
            makeupReason: null,
          },
          {
            studentId: 's2',
            code: 'B',
            fullName: 'Kabir Shah',
            phone: '',
            isMakeup: true,
            makeupReason: 'Missed Monday',
          },
        ],
      }),
    });
    const { user } = await renderPage(<CalendarPage />, {
      path: '/calendar',
      route: '/calendar?view=day&date=2026-03-11',
      user: coachUser,
    });
    // Three stops: Main ground, Lake Club, then Main ground again.
    await screen.findByText('Juniors');
    const stops = screen
      .getAllByRole('region')
      .filter((r) => ['Main ground', 'Lake Club'].includes(r.getAttribute('aria-label') ?? ''));
    expect(stops.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Main ground',
      'Lake Club',
      'Main ground',
    ]);
    expect(stops[0]).toHaveTextContent('5:00 pm – 7:00 pm · 2 sessions');
    expect(stops[1]).toHaveTextContent('30 min travel');
    expect(
      within(stops[1]!).getByRole('link', { name: 'Directions to Lake Club' }),
    ).toHaveAttribute('href', expect.stringContaining('destination=12.9,77.6'));
    expect(stops[2]).toHaveTextContent('Cancelled');
    // A future day: scheduled, with a link to plan it.
    expect(within(stops[0]!).getAllByText('Scheduled')).toHaveLength(2);
    expect(within(stops[0]!).getAllByRole('link', { name: /Plan/ })[0]).toHaveAttribute(
      'href',
      '/lesson-plans?batch=b1&date=2026-03-11',
    );

    // Tap a session: who's expected, makeups marked.
    await user.click(screen.getByRole('button', { name: 'Seniors students' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Anya Rao')).toBeInTheDocument();
    expect(within(dialog).getByText('Makeup')).toBeInTheDocument();
    expect(within(dialog).getByText('Expected · 2')).toBeInTheDocument();
  });
});
