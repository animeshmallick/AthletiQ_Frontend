import { AccountPage } from '@/pages/account';
import { CoachesPage } from '@/pages/admin/coaches';
import { FeePlansPage } from '@/pages/admin/fee-plans';
import { LocationsPage } from '@/pages/admin/locations';
import { RegistrationsPage } from '@/pages/admin/registrations';
import { SettingsPage } from '@/pages/admin/settings';
import { batch } from '../fixtures';
import {
  adminUser,
  coachUser,
  mockApi,
  renderPage,
  screen,
  sessionFor,
  waitFor,
  chooseOption,
} from '../utils';

const settings = {
  id: 1,
  name: 'Smash Academy',
  legalName: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  gstin: null,
  upiId: null,
  invoiceFooter: null,
};

describe('CoachesPage', () => {
  it('invites a coach and shows a shareable link', async () => {
    const api = mockApi({
      'GET /users': () => ({
        data: [{ ...coachUser, activeBatches: 2 }],
        meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      }),
      'GET /settings': () => settings,
      'POST /users': () => ({
        user: {
          ...coachUser,
          id: 'u2',
          name: 'Neha Patel',
          phone: '+919811111111',
          status: 'invited',
        },
        inviteUrl: 'https://app.test/accept-invite?token=abc',
        inviteExpiresAt: '',
      }),
    });
    const { user } = await renderPage(<CoachesPage />, {
      path: '/coaches',
      route: '/coaches',
      user: adminUser,
    });
    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByText('2 batches')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /invite/i }));
    await user.type(await screen.findByLabelText(/full name/i), 'Neha Patel');
    await user.type(screen.getByLabelText(/^email/i), 'neha@example.com');
    await user.type(screen.getByLabelText(/mobile/i), '9811111111');
    await user.click(screen.getByRole('button', { name: 'Create invite' }));

    expect(
      await screen.findByDisplayValue('https://app.test/accept-invite?token=abc'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /send on whatsapp/i }).getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/919811111111\?text=/,
    );
    expect(api.find('POST /users')[0]!.body).toEqual({
      name: 'Neha Patel',
      email: 'neha@example.com',
      phone: '9811111111',
      role: 'coach',
    });
  });
});

describe('RegistrationsPage', () => {
  it('approves a coach and rejects with a reason', async () => {
    const reg = (type: 'student' | 'coach', id: string) => ({
      id,
      type,
      status: 'pending',
      fullName: type === 'coach' ? 'Vikram Rao' : 'Diya Kapoor',
      email: null,
      phone: '+919876501234',
      message: 'Hi',
      details:
        type === 'coach'
          ? { specialization: 'Footwork', experience: '5 years' }
          : { guardianName: 'Neha', medicalNotes: 'None' },
      preferredDays: type === 'student' ? [1, 3, 5] : null,
      preferredBatch: type === 'student' ? { id: 'b1', name: 'Morning U-12' } : null,
      preferredLocation: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: '2026-03-01T10:00:00Z',
    });
    const api = mockApi({
      'GET /registrations': () => ({
        data: [reg('coach', 'r1'), reg('student', 'r2')],
        meta: {
          page: 1,
          pageSize: 20,
          total: 2,
          totalPages: 1,
          pending: { pendingStudents: 1, pendingCoaches: 1 },
        },
      }),
      'POST /registrations/r1/approve': () => ({ type: 'coach' }),
      'POST /registrations/r2/reject': () => ({ id: 'r2', status: 'rejected' }),
      'GET /batches': () => [batch],
      'GET /fee-plans': () => [],
    });
    const { user } = await renderPage(<RegistrationsPage />, {
      path: '/registrations',
      route: '/registrations',
      user: adminUser,
    });
    expect(await screen.findByText('Vikram Rao')).toBeInTheDocument();
    expect(screen.getByText('Mon, Wed, Fri')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /approve/i })[0]!);
    await user.click(await screen.findByRole('button', { name: 'Approve coach' }));
    await waitFor(() => expect(api.find('POST /registrations/r1/approve')).toHaveLength(1));

    await user.click(screen.getAllByRole('button', { name: /reject/i })[1]!);
    await user.type(await screen.findByLabelText(/reason/i), 'Batch is full');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(api.find('POST /registrations/r2/reject')[0]?.body).toEqual({
        reason: 'Batch is full',
      }),
    );

    await user.click(screen.getByRole('button', { name: /copy public link/i }));
    await expect(navigator.clipboard.readText()).resolves.toBe('http://localhost/register');
  });
});

describe('LocationsPage (without Mapbox token)', () => {
  it('adds a location using coordinate inputs', async () => {
    const api = mockApi({
      'GET /locations': () => [],
      'POST /locations': (c) => ({ id: 'l1', ...(c.body as object) }),
    });
    const { user } = await renderPage(<LocationsPage />, {
      path: '/locations',
      route: '/locations',
      user: adminUser,
    });
    expect(await screen.findByText('No locations yet')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /new location/i })[0]!);
    await user.click(screen.getByRole('button', { name: 'Add location' }));
    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^name/i), 'North Ground');
    await user.type(screen.getByLabelText(/latitude/i), '12.97');
    await user.type(screen.getByLabelText(/longitude/i), '77.59');
    await user.click(screen.getByRole('button', { name: 'Add location' }));
    await waitFor(() => expect(api.find('POST /locations')).toHaveLength(1));
    expect(api.find('POST /locations')[0]!.body).toMatchObject({
      name: 'North Ground',
      latitude: 12.97,
      longitude: 77.59,
      radiusMeters: 200,
    });
  });
});

describe('FeePlansPage', () => {
  it('creates a plan in paise', async () => {
    const api = mockApi({
      'GET /fee-plans': () => [
        {
          id: 'p1',
          name: '3 days',
          daysPerWeek: 3,
          monthlyFee: 250_000,
          isActive: true,
          description: null,
          activeStudents: 4,
        },
      ],
      'POST /fee-plans': () => ({}),
    });
    const { user } = await renderPage(<FeePlansPage />, {
      path: '/fee-plans',
      route: '/fee-plans',
      user: adminUser,
    });
    expect((await screen.findAllByText('4 students', { exact: false })).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /new plan/i }));
    await user.type(screen.getByLabelText(/^name/i), '5 days');
    await chooseOption(user, screen.getByLabelText(/days per week/i), '5');
    await user.type(screen.getByLabelText(/monthly fee/i), '3500');
    await user.click(screen.getByRole('button', { name: 'Create plan' }));
    await waitFor(() =>
      expect(api.find('POST /fee-plans')[0]?.body).toMatchObject({
        name: '5 days',
        daysPerWeek: 5,
        monthlyFee: 350_000,
      }),
    );
  });
});

describe('SettingsPage', () => {
  it('saves academy details and runs billing on demand', async () => {
    const api = mockApi({
      'GET /settings': () => settings,
      'PUT /settings': (c) => ({ ...settings, ...(c.body as object) }),
      'GET /admin/jobs/runs': () => [
        {
          id: 'j1',
          jobName: 'invoice-generation',
          runDate: '2026-03-09',
          trigger: 'schedule',
          status: 'succeeded',
          stats: { invoicesCreated: 3 },
          error: null,
          startedAt: '2026-03-08T18:30:00Z',
          finishedAt: null,
        },
      ],
      'POST /admin/jobs/invoices/run': () => ({ ran: true, stats: { invoicesCreated: 0 } }),
    });
    const { user } = await renderPage(<SettingsPage />, {
      path: '/settings',
      route: '/settings',
      user: adminUser,
    });
    expect(await screen.findByDisplayValue('Smash Academy')).toBeInTheDocument();
    expect(await screen.findByText('3 created')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/upi id/i), 'smash@okicici');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.find('PUT /settings')[0]?.body).toMatchObject({
        name: 'Smash Academy',
        upiId: 'smash@okicici',
        gstin: null,
      }),
    );
    await user.click(screen.getByRole('button', { name: /run now/i }));
    await waitFor(() => expect(api.find('POST /admin/jobs/invoices/run')).toHaveLength(1));
  });
});

describe('AccountPage', () => {
  it('updates profile and changes password', async () => {
    const api = mockApi({
      'PATCH /users/me': (c) => ({ ...coachUser, ...(c.body as object) }),
      'POST /auth/change-password': () => sessionFor(coachUser),
    });
    const { user } = await renderPage(<AccountPage />, {
      path: '/account',
      route: '/account',
      user: coachUser,
    });
    const name = await screen.findByLabelText(/^name/i);
    await user.clear(name);
    await user.type(name, 'Ravi K');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.find('PATCH /users/me')[0]?.body).toEqual({
        name: 'Ravi K',
        phone: '+919876543210',
      }),
    );

    await user.type(screen.getByLabelText(/current password/i), 'OldPass123');
    await user.type(screen.getByLabelText(/new password/i), 'NewPass123');
    await user.type(screen.getByLabelText(/confirm/i), 'NewPass123');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() =>
      expect(api.find('POST /auth/change-password')[0]?.body).toEqual({
        currentPassword: 'OldPass123',
        newPassword: 'NewPass123',
      }),
    );
  });
});
