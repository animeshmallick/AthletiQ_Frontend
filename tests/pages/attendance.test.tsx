import { AttendancePage } from '@/pages/attendance';
import { batch, sheet } from '../fixtures';
import { coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const route = '/attendance?batch=b1&date=2026-03-09';

describe('AttendancePage', () => {
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
      user: coachUser,
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
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /^all present/i }));
    expect(screen.getByText(/unsaved change/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(screen.queryByText(/unsaved change/)).not.toBeInTheDocument();
  });

  it('shows a locked session read-only', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /attendance/session': () => sheet({ editable: false }),
    });
    await renderPage(<AttendancePage />, { path: '/attendance', route, user: coachUser });
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
      user: coachUser,
    });
    expect(await screen.findByText('No session on Sunday')).toBeInTheDocument();
  });

  it('auto-selects the coach’s batch and shows server errors', async () => {
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
      user: coachUser,
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
      user: coachUser,
    });
    await user.click(await screen.findByRole('tab', { name: 'Monthly register' }));
    expect(await screen.findByText('50%')).toBeInTheDocument();
  });
});
