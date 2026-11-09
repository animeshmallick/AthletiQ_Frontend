import { within } from '@testing-library/react';
import { SubstitutionsPage } from '@/pages/substitutions';
import { batch } from '../fixtures';
import { adminUser, chooseOption, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const sub = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  fromDate: '2099-03-10',
  toDate: '2099-03-12',
  reason: 'Tournament',
  status: 'pending',
  reviewNote: null,
  reviewedAt: null,
  createdAt: '2099-03-01T00:00:00Z',
  sessions: 3,
  batch: {
    id: 'b1',
    name: 'Morning U-12',
    startTime: '06:00:00',
    endTime: '08:00:00',
    weekdays: [1, 2, 3],
  },
  substitute: { id: 'coach-2', name: 'Neha' },
  coach: { id: 'coach-1', name: 'Ravi' },
  requestedBy: { id: 'coach-1', name: 'Ravi' },
  reviewedBy: null,
  ...over,
});

const insights = {
  from: '2099-03-01',
  to: '2099-03-31',
  totals: {
    substitutions: 2,
    sessions: 7,
    pending: 1,
    upcoming: 1,
    active: 1,
    coveredByMe: 4,
    coveredForMe: 2,
  },
  bySubstitute: [{ id: 'coach-2', name: 'Neha', sessions: 7, substitutions: 2 }],
  byCoach: [{ id: 'coach-1', name: 'Ravi', sessions: 7, substitutions: 2 }],
  byBatch: [{ id: 'b1', name: 'Morning U-12', sessions: 7, substitutions: 2 }],
};

describe('SubstitutionsPage', () => {
  it('lets an admin review pending requests and shows academy insights', async () => {
    const api = mockApi({
      'GET /substitutions': () => [sub(), sub({ id: 's2', status: 'approved' })],
      'GET /substitutions/insights': () => insights,
      'POST /substitutions/s1/approve': () => sub({ status: 'approved' }),
    });
    const { user } = await renderPage(<SubstitutionsPage />, {
      path: '/substitutions',
      route: '/substitutions',
      user: adminUser,
    });
    expect(await screen.findByText('1 request to review')).toBeInTheDocument();
    expect(screen.getByText('Sessions covered')).toBeInTheDocument();
    expect(screen.getByText('Who covered most')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve Neha for Morning U-12' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve Neha?' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.find('POST /substitutions/s1/approve')).toHaveLength(1));
  });

  it('lets a coach request cover for their batch', async () => {
    const api = mockApi({
      'GET /substitutions': () => [],
      'GET /substitutions/insights': () => insights,
      'GET /batches': () => [{ ...batch, coach: { id: coachUser.id, name: 'Me', phone: null } }],
      'GET /substitutions/coaches': () => [
        { id: coachUser.id, name: 'Me' },
        { id: 'coach-2', name: 'Neha' },
      ],
      'POST /substitutions': (c) => sub(c.body as object),
    });
    const { user } = await renderPage(<SubstitutionsPage />, {
      path: '/substitutions',
      route: '/substitutions',
      user: coachUser,
    });
    expect(await screen.findByText('Covered by me')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /request/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Request a substitute' });
    await chooseOption(
      user,
      within(dialog).getByRole('combobox', { name: 'Substitute coach' }),
      'coach-2',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(api.find('POST /substitutions')).toHaveLength(1));
    expect(api.find('POST /substitutions')[0]!.body).toMatchObject({
      batchId: batch.id,
      substituteCoachId: 'coach-2',
    });
  });
});
