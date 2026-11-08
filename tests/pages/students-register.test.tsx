import { RegisterPage } from '@/pages/public/register';
import { StudentDetailPage } from '@/pages/students/detail';
import { StudentsPage } from '@/pages/students/list';
import { batch, studentDetail, studentListItem } from '../fixtures';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const page = (items = [studentListItem]) => ({
  data: items,
  meta: { page: 1, pageSize: 25, total: items.length, totalPages: 1 },
});

describe('StudentsPage', () => {
  it('lists students with balances and filters via the URL', async () => {
    const api = mockApi({ 'GET /students': () => page(), 'GET /batches': () => [batch] });
    const { router } = await renderPage(<StudentsPage />, {
      path: '/students',
      route: '/students',
      user: coachUser,
    });
    expect((await screen.findAllByText('Anya Rao')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /add student/i })).not.toBeInTheDocument();
    expect(api.find('GET /students')[0]!.query.get('status')).toBe('active');
    await waitFor(() => expect(router.state.location.pathname).toBe('/students'));
  });

  it('lets admins register a student with smart fee suggestions', async () => {
    const api = mockApi({
      'GET /students': () => page([]),
      'GET /batches': () => [batch],
      'GET /fee-plans': () => [
        {
          id: 'p3',
          name: '3 days',
          daysPerWeek: 3,
          monthlyFee: 250_000,
          isActive: true,
          description: null,
        },
        {
          id: 'p5',
          name: '5 days',
          daysPerWeek: 5,
          monthlyFee: 350_000,
          isActive: true,
          description: null,
        },
      ],
      'POST /students': () => ({ ...studentDetail, id: 's9', code: 'ATQ-0009' }),
    });
    const { user, router } = await renderPage(<StudentsPage />, {
      path: '/students',
      route: '/students',
      user: adminUser,
      extraRoutes: [{ path: '/students/:id', element: <div>Student page</div> }],
    });
    expect(await screen.findByText('No students yet')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /add student/i })[0]!);

    await user.type(await screen.findByLabelText(/full name/i), 'Kabir Singh');
    await user.type(screen.getByLabelText(/mobile \(whatsapp\)/i), '9876501234');
    await user.selectOptions(screen.getByLabelText(/^batch/i), 'b1');
    for (const d of ['Monday', 'Wednesday', 'Friday'])
      await user.click(screen.getByRole('button', { name: d }));
    // 3 training days → the 3-day plan is suggested.
    await waitFor(() => expect(screen.getByLabelText(/fee plan/i)).toHaveValue('p3'));
    expect(screen.getByText('₹2,500')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Thursday' }));
    await user.click(screen.getByRole('button', { name: 'Saturday' }));
    await waitFor(() => expect(screen.getByLabelText(/fee plan/i)).toHaveValue('p5'));

    await user.click(screen.getByRole('button', { name: 'Register student' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/students/s9'));
    expect(api.find('POST /students')[0]!.body).toMatchObject({
      fullName: 'Kabir Singh',
      phone: '9876501234',
      batchId: 'b1',
      trainingDays: [1, 3, 4, 5, 6],
      feePlanId: 'p5',
      monthlyDiscount: 0,
    });
  });
});

describe('StudentDetailPage', () => {
  it('shows profile, fees and actions for admins', async () => {
    mockApi({
      'GET /students/s1': () => studentDetail,
      'GET /attendance/students/s1': () => ({
        from: '',
        to: '',
        records: [
          {
            date: '2026-03-09',
            status: 'present',
            note: null,
            isMakeup: false,
            batchName: 'Morning U-12',
          },
        ],
        summary: {
          total: 1,
          present: 1,
          late: 0,
          absent: 0,
          excused: 0,
          unmarked: 0,
          scheduled: 0,
          attendanceRate: 100,
        },
      }),
    });
    const { user } = await renderPage(<StudentDetailPage />, {
      path: '/students/:id',
      route: '/students/s1',
      user: adminUser,
    });
    expect(await screen.findByRole('heading', { name: 'Anya Rao' })).toBeInTheDocument();
    expect(screen.getByText('Asthma')).toBeInTheDocument();
    expect(screen.getAllByText('₹2,300').length).toBeGreaterThan(0);
    expect(screen.getByText(/Billed on day 10 of every month/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Attendance' }));
    expect(await screen.findByText('100%')).toBeInTheDocument();
  });

  it('hides admin actions from coaches', async () => {
    mockApi({ 'GET /students/s1': () => studentDetail });
    await renderPage(<StudentDetailPage />, {
      path: '/students/:id',
      route: '/students/s1',
      user: coachUser,
    });
    expect(await screen.findByRole('heading', { name: 'Anya Rao' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^makeup$/i })).toBeInTheDocument();
  });
});

describe('RegisterPage (public)', () => {
  const options = {
    academy: { name: 'Smash Academy', phone: '+919999999999', email: null },
    batches: [
      {
        id: 'b1',
        name: 'Morning U-12',
        weekdays: [1, 3, 5],
        startTime: '06:00:00',
        endTime: '08:00:00',
        location: { id: 'l1', name: 'Club', address: null },
      },
    ],
  };

  it('submits a student registration', async () => {
    const api = mockApi({
      'GET /public/register/options': () => options,
      'POST /public/register/student': () => ({
        id: 'r1',
        message: 'Thank you! Your registration has been received.',
      }),
    });
    const { user } = await renderPage(<RegisterPage />, { path: '/register', route: '/register' });
    expect(await screen.findByText('Join Smash Academy')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /submit registration/i }));
    expect(await screen.findByText('Please accept to continue')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/student’s full name/i), 'Diya Kapoor');
    await user.type(screen.getByLabelText(/mobile \(whatsapp\)/i), '9876501234');
    await user.selectOptions(screen.getByLabelText(/preferred batch/i), 'b1');
    expect(screen.getByRole('button', { name: 'Tuesday' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Monday' }));
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /submit registration/i }));

    expect(await screen.findByText('Registration received')).toBeInTheDocument();
    expect(api.find('POST /public/register/student')[0]!.body).toMatchObject({
      fullName: 'Diya Kapoor',
      phone: '9876501234',
      preferredBatchId: 'b1',
      preferredDays: [1],
      consent: true,
    });
  });

  it('submits a coach registration and surfaces conflicts', async () => {
    mockApi({
      'GET /public/register/options': () => options,
      'POST /public/register/coach': () => ({
        status: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'A registration with this email is already awaiting approval.',
          },
        },
      }),
    });
    const { user } = await renderPage(<RegisterPage />, { path: '/register', route: '/register' });
    await user.click(await screen.findByRole('radio', { name: /i’m a coach/i }));
    await user.type(screen.getByLabelText(/^full name/i), 'Vikram Rao');
    await user.type(screen.getByLabelText(/^email/i), 'vikram@example.com');
    await user.type(screen.getByLabelText(/^mobile/i), '9876512345');
    await user.type(screen.getByLabelText(/^password/i), 'Coach1Pass');
    await user.click(screen.getByRole('button', { name: /submit for approval/i }));
    expect(await screen.findByText(/already awaiting approval/)).toBeInTheDocument();
  });
});
