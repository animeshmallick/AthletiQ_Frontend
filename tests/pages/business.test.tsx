import { act } from '@testing-library/react';
import { AppLayout } from '@/app/layout';
import { AttendancePage } from '@/pages/attendance';
import { InvoicesPage } from '@/pages/invoices';
import { StudentDetailPage } from '@/pages/students/detail';
import { StudentsPage } from '@/pages/students/list';
import { TodayPage } from '@/pages/today';
import { batch, invoiceDetail, sheet, studentDetail, studentListItem } from '../fixtures';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor, chooseOption } from '../utils';

const route = '/attendance?batch=b1&date=2026-03-09';

describe('cancelling a session (rain / holiday)', () => {
  it('cancels an unmarked session with a reason', async () => {
    const unmarked = sheet({ students: sheet().students.map((s) => ({ ...s, status: null })) });
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /attendance/session': () => unmarked,
      'POST /batches/b1/cancellations': () => ({ status: 201, body: { data: { id: 'c1' } } }),
    });
    const { user } = await renderPage(<AttendancePage />, {
      path: '/attendance',
      route,
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /cancel session/i }));
    await user.type(screen.getByLabelText(/reason/i), 'Heavy rain');
    await user.click(screen.getAllByRole('button', { name: /cancel session/i }).at(-1)!);
    await waitFor(() => expect(api.find('POST /batches/b1/cancellations')).toHaveLength(1));
    expect(api.find('POST /batches/b1/cancellations')[0]!.body).toEqual({
      date: '2026-03-09',
      reason: 'Heavy rain',
    });
  });

  it('hides "cancel" once attendance exists', async () => {
    mockApi({ 'GET /batches': () => [batch], 'GET /attendance/session': () => sheet() });
    await renderPage(<AttendancePage />, { path: '/attendance', route, user: coachUser });
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel session/i })).not.toBeInTheDocument();
  });

  it('shows a cancelled session and restores it', async () => {
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /attendance/session': () =>
        sheet({ cancelled: { reason: 'Diwali holiday', cancelledAt: '' }, editable: false }),
      'DELETE /batches/b1/cancellations/2026-03-09': () => ({ status: 204 }),
    });
    const { user } = await renderPage(<AttendancePage />, {
      path: '/attendance',
      route,
      user: coachUser,
    });
    expect(await screen.findByText('Diwali holiday')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Session cancelled' })).toBeInTheDocument();
    expect(screen.queryByText('Anya Rao')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /restore session/i }));
    await waitFor(() =>
      expect(api.find('DELETE /batches/b1/cancellations/2026-03-09')).toHaveLength(1),
    );
  });

  it('shows cancelled sessions on the coach’s Today page without a check-in button', async () => {
    mockApi({
      'GET /coach-sessions/today': () => ({
        date: '2026-03-09',
        sessions: [
          {
            batch: { id: 'b1', name: 'Morning U-12', startTime: '06:00:00', endTime: '08:00:00' },
            location: {
              id: 'l1',
              name: 'Club',
              address: null,
              latitude: 1,
              longitude: 1,
              radiusMeters: 200,
            },
            session: null,
            cancelled: 'Heavy rain',
          },
        ],
      }),
      'GET /attendance/overview': () => ({ date: '2026-03-09', sessions: [] }),
    });
    await renderPage(<TodayPage />, { user: coachUser });
    expect(await screen.findByText(/Cancelled · Heavy rain/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
  });
});

describe('student lifecycle', () => {
  const left = {
    ...studentDetail,
    status: 'left' as const,
    leftOn: '2026-03-20',
    currentEnrollment: null,
  };

  it('rejoins a student who left', async () => {
    const api = mockApi({
      'GET /students/s1': () => left,
      'GET /batches': () => [batch],
      'GET /fee-plans': () => [
        {
          id: 'p1',
          name: '3 days',
          daysPerWeek: 3,
          monthlyFee: 250_000,
          isActive: true,
          description: null,
        },
      ],
      'POST /students/s1/rejoin': () => ({ ...studentDetail, billingAnchorDate: '2026-05-05' }),
    });
    const { user } = await renderPage(<StudentDetailPage />, {
      path: '/students/:id',
      route: '/students/s1',
      user: adminUser,
    });
    await user.click(await screen.findByRole('button', { name: /^rejoin$/i }));
    const date = await screen.findByLabelText(/rejoin date/i);
    await user.clear(date);
    await user.type(date, '2026-05-05');
    await user.click(screen.getByRole('button', { name: 'Rejoin student' }));
    await waitFor(() => expect(api.find('POST /students/s1/rejoin')).toHaveLength(1));
    expect(api.find('POST /students/s1/rejoin')[0]!.body).toEqual({
      rejoinDate: '2026-05-05',
      batchId: 'b1',
      trainingDays: [1, 2, 3, 4, 5, 6],
    });
  });

  it('explains the billing day after a rejoin', async () => {
    mockApi({ 'GET /students/s1': () => ({ ...studentDetail, billingAnchorDate: '2026-05-05' }) });
    await renderPage(<StudentDetailPage />, {
      path: '/students/:id',
      route: '/students/s1',
      user: adminUser,
    });
    expect(await screen.findByText(/Billed on day 5 of every month/)).toHaveTextContent(
      'rejoined 5 May 2026',
    );
  });

  it('deletes a mistaken record and surfaces the guard message', async () => {
    let attempts = 0;
    mockApi({
      'GET /students/s1': () => studentDetail,
      'DELETE /students/s1': () =>
        ++attempts === 1
          ? {
              status: 422,
              body: {
                error: {
                  code: 'UNPROCESSABLE',
                  message: 'This student already has invoices, attendance or feedback',
                },
              },
            }
          : { status: 204 },
    });
    const { user, router } = await renderPage(<StudentDetailPage />, {
      path: '/students/:id',
      route: '/students/s1',
      user: adminUser,
      extraRoutes: [{ path: '/students', element: <div>Students list</div> }],
    });
    const deleteFlow = async () => {
      await user.click(await screen.findByRole('button', { name: /Manage/ }));
      await user.click(await screen.findByRole('menuitem', { name: /delete record/i }));
      await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    };
    await deleteFlow();
    expect(await screen.findByText(/already has invoices/)).toBeInTheDocument();
    await deleteFlow();
    await waitFor(() => expect(router.state.location.pathname).toBe('/students'));
  });

  it('filters students by unpaid fees', async () => {
    const api = mockApi({
      'GET /students': () => ({
        data: [studentListItem],
        meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      }),
      'GET /batches': () => [batch],
    });
    const { user } = await renderPage(<StudentsPage />, {
      path: '/students',
      route: '/students',
      user: coachUser,
    });
    await screen.findAllByText('Anya Rao');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await chooseOption(user, await screen.findByLabelText('Filter by fees'), 'overdue');
    expect(screen.getByRole('button', { name: 'Filters (1 on)' })).toBeInTheDocument();
    await waitFor(() => {
      const last = api.find('GET /students').at(-1)!;
      expect(last.query.get('dues')).toBe('overdue');
      expect(last.query.get('sort')).toBe('dues');
    });
  });
});

describe('invoice adjustment', () => {
  it('lets admins apply a one-off discount with a reason', async () => {
    const api = mockApi({
      'GET /invoices': () => ({
        data: [],
        meta: { page: 1, pageSize: 25, total: 0, totalPages: 1, totalAmount: 0 },
      }),
      'GET /invoices/i1': () => invoiceDetail,
      'POST /invoices/i1/adjust': () => ({
        ...invoiceDetail,
        discountAmount: 50_000,
        totalAmount: 200_000,
      }),
    });
    const { user } = await renderPage(<InvoicesPage />, {
      path: '/invoices',
      route: '/invoices?invoice=i1',
      user: adminUser,
    });
    await user.click(await screen.findByRole('button', { name: 'Adjust amount' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adjust invoice' });
    const save = screen.getByRole('button', { name: 'Save adjustment' });
    expect(save).toBeDisabled();
    const amount = dialog.querySelector('input')!;
    await user.clear(amount);
    await user.type(amount, '500');
    await user.type(screen.getByLabelText(/^reason/i), 'Missed two weeks');
    expect(screen.getByText('₹2,000')).toBeInTheDocument();
    await user.click(save);
    await waitFor(() =>
      expect(api.find('POST /invoices/i1/adjust')[0]?.body).toEqual({
        discountAmount: 50_000,
        reason: 'Missed two weeks',
      }),
    );
  });

  it('is not offered to coaches', async () => {
    mockApi({
      'GET /invoices': () => ({
        data: [],
        meta: { page: 1, pageSize: 25, total: 0, totalPages: 1, totalAmount: 0 },
      }),
      'GET /invoices/i1': () => invoiceDetail,
    });
    await renderPage(<InvoicesPage />, {
      path: '/invoices',
      route: '/invoices?invoice=i1',
      user: coachUser,
    });
    expect(
      await screen.findByRole('button', { name: /i have received the payment/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adjust amount' })).not.toBeInTheDocument();
  });
});

describe('offline banner', () => {
  it('appears when the connection drops and disappears when it returns', async () => {
    mockApi({});
    await renderPage(<AppLayout />, { user: coachUser });
    await screen.findByRole('banner');
    const setOnline = (v: boolean) => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: v });
      act(() => {
        window.dispatchEvent(new Event(v ? 'online' : 'offline'));
      });
    };
    setOnline(false);
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    setOnline(true);
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
  });
});
