import { within } from '@testing-library/react';
import { CalendarPage } from '@/pages/calendar';
import { batch } from '../fixtures';
import { coachUser, mockApi, renderPage, screen } from '../utils';

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

  it('links day-view cards to the batch, with small action buttons', async () => {
    mockApi(routes());
    await renderPage(<CalendarPage />, {
      path: '/calendar',
      route: '/calendar?view=day&date=2026-03-10',
      user: coachUser,
    });
    expect(await screen.findByRole('link', { name: 'Morning U-12' })).toHaveAttribute(
      'href',
      '/batches/b1',
    );
    expect(screen.getByRole('link', { name: /lesson plan/i })).toHaveAttribute(
      'href',
      '/lesson-plans?batch=b1&date=2026-03-10',
    );
  });
});
