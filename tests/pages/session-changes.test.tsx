import { fireEvent, within } from '@testing-library/react';
import { OriginBadge, SessionChangeDialog, notStarted } from '@/components/session-change';
import { SessionChangesPage } from '@/pages/session-changes';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const change = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  kind: 'reschedule',
  originalDate: '2099-03-11',
  date: '2099-03-12',
  startTime: '07:00:00',
  endTime: '09:00:00',
  status: 'pending',
  reason: 'Ground booked',
  reviewNote: null,
  reviewedAt: null,
  createdAt: '2099-03-01T00:00:00Z',
  batch: { id: 'b1', name: 'Morning U-12', startTime: '06:00:00', endTime: '08:00:00' },
  location: { id: 'l1', name: 'Club' },
  coach: { id: 'coach-1', name: 'Ravi' },
  requestedBy: { id: 'coach-1', name: 'Ravi' },
  reviewedBy: null,
  from: { date: '2099-03-11', startTime: '06:00:00', endTime: '08:00:00' },
  ...over,
});

const preview = (over: Record<string, unknown> = {}) => ({
  ok: true,
  errors: [],
  warnings: [],
  kind: 'reschedule',
  originalDate: '2099-03-11',
  needsApproval: false,
  noticeHours: 100,
  ...over,
});

const batchRef = { id: 'b1', name: 'Morning U-12', startTime: '06:00:00', endTime: '08:00:00' };

describe('OriginBadge and notStarted', () => {
  it('says where a session came from', async () => {
    mockApi({});
    await renderPage(
      <div>
        <OriginBadge origin={{ kind: 'extra', originalDate: null, changeId: 'x' }} />
        <OriginBadge
          origin={{ kind: 'moved', originalDate: '2099-03-11', changeId: 'y' }}
          date="2099-03-12"
        />
        <OriginBadge
          origin={{ kind: 'moved', originalDate: '2099-03-12', changeId: 'z' }}
          date="2099-03-12"
        />
        <OriginBadge origin={{ kind: 'regular', originalDate: null, changeId: null }} />
      </div>,
    );
    expect(screen.getByText('Extra session')).toBeInTheDocument();
    expect(screen.getByText(/Moved from/)).toBeInTheDocument();
    expect(screen.getByText('New time')).toBeInTheDocument();
  });

  it('knows whether a session has started', () => {
    expect(notStarted('2099-01-01', '06:00:00')).toBe(true);
    expect(notStarted('2000-01-01', '06:00:00')).toBe(false);
    const now = new Date('2026-03-09T03:30:00Z'); // 09:00 IST
    expect(notStarted('2026-03-09', '10:00:00', now)).toBe(true);
    expect(notStarted('2026-03-09', '08:00:00', now)).toBe(false);
  });
});

describe('SessionChangeDialog', () => {
  it('moves a session after the live check, confirming warnings', async () => {
    const api = mockApi({
      'POST /batches/b1/session-changes/preview': (c) => {
        const b = c.body as { date: string };
        return b.date === '2099-03-13'
          ? preview({ ok: false, errors: ['Morning U-12 already runs on 13 Mar 2099.'] })
          : preview({
              warnings: [
                {
                  code: 'students-busy',
                  message: '1 student has another batch then.',
                  students: [{ id: 's1', fullName: 'Anya', batchName: 'Evening' }],
                },
              ],
            });
      },
      'POST /batches/b1/session-changes': (c) =>
        change({
          ...(c.body as object),
          status: 'approved',
          startTime: '07:00:00',
          endTime: '09:00:00',
        }),
    });
    const onClose = jest.fn();
    const { user } = await renderPage(
      <SessionChangeDialog
        batch={batchRef}
        session={{ date: '2099-03-11', startTime: '06:00:00', endTime: '08:00:00' }}
        onClose={onClose}
      />,
      { user: coachUser },
    );
    const dialog = await screen.findByRole('dialog', { name: 'Move this session' });
    expect(within(dialog).getByText('Pick a new day or time.')).toBeInTheDocument();
    const day = within(dialog).getByLabelText('Day');
    fireEvent.change(day, { target: { value: '2099-03-13' } });
    expect(await within(dialog).findByText(/already runs on/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Move session' })).toBeDisabled();

    fireEvent.change(day, { target: { value: '2099-03-12' } });
    expect(
      await within(dialog).findByText('1 student has another batch then.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Anya (Evening)')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Move session' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Go ahead anyway' }));
    expect(within(dialog).getByText(/admins are told/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason'), 'Ground booked');
    await user.click(within(dialog).getByRole('button', { name: 'Move session' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.find('POST /batches/b1/session-changes')[0]!.body).toMatchObject({
      sessionDate: '2099-03-11',
      date: '2099-03-12',
      confirm: true,
      reason: 'Ground booked',
    });
  });

  it('adds an extra session that needs approval at short notice', async () => {
    const api = mockApi({
      'POST /batches/b1/session-changes/preview': () =>
        preview({ kind: 'extra', originalDate: null, needsApproval: true, noticeHours: 5 }),
      'POST /batches/b1/session-changes': (c) =>
        change({ ...(c.body as object), kind: 'extra', status: 'pending' }),
    });
    const onSaved = jest.fn();
    await renderPage(
      <SessionChangeDialog
        batch={batchRef}
        defaultDate="2099-03-15"
        onClose={() => {}}
        onSaved={onSaved}
      />,
      { user: coachUser },
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add an extra session' });
    expect(await within(dialog).findByText(/an admin approves it first/)).toBeInTheDocument();
    const { user } = { user: (await import('@testing-library/user-event')).default.setup() };
    await user.click(within(dialog).getByRole('button', { name: 'Ask for approval' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.find('POST /batches/b1/session-changes')[0]!.body).toMatchObject({
      date: '2099-03-15',
      startTime: '06:00',
      endTime: '08:00',
    });
  });

  it('shows a failed check as an error', async () => {
    mockApi({
      'POST /batches/b1/session-changes/preview': () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Batch not found' } },
      }),
    });
    await renderPage(
      <SessionChangeDialog batch={batchRef} defaultDate="2099-03-15" onClose={() => {}} />,
      {
        user: coachUser,
      },
    );
    expect(await screen.findByText('Batch not found')).toBeInTheDocument();
  });
});

describe('SessionChangesPage', () => {
  it('lets an admin approve (confirming warnings) and decline', async () => {
    let approvals = 0;
    const api = mockApi({
      'GET /session-changes': () => [
        change(),
        change({ id: 'c2', kind: 'extra', originalDate: null, from: null }),
      ],
      'POST /session-changes/c1/approve': () => {
        approvals++;
        return approvals === 1
          ? {
              status: 409,
              body: {
                error: {
                  code: 'CONFLICT',
                  message: 'Please confirm',
                  details: {
                    warnings: [{ code: 'location-overlap', message: 'Evening also runs then.' }],
                  },
                },
              },
            }
          : change({ status: 'approved' });
      },
      'POST /session-changes/c2/reject': () => change({ id: 'c2', status: 'rejected' }),
    });
    const { user } = await renderPage(<SessionChangesPage />, {
      path: '/session-changes',
      route: '/session-changes',
      user: adminUser,
    });
    expect(await screen.findAllByText('Morning U-12')).toHaveLength(2);
    expect(screen.getByText(/Extra/)).toBeInTheDocument();
    const approve = screen.getAllByRole('button', { name: 'Approve' });
    await user.click(approve[0]!);
    const confirm = await screen.findByRole('dialog', { name: 'Approve anyway?' });
    expect(within(confirm).getByText('Evening also runs then.')).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Approve anyway' }));
    await waitFor(() => expect(api.find('POST /session-changes/c1/approve')).toHaveLength(2));
    expect(api.find('POST /session-changes/c1/approve')[1]!.body).toMatchObject({ confirm: true });

    await user.click(screen.getAllByRole('button', { name: 'Decline' })[1]!);
    const decline = await screen.findByRole('dialog', { name: 'Decline this request?' });
    await user.type(within(decline).getByRole('textbox'), 'No ground that day');
    await user.click(within(decline).getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(api.find('POST /session-changes/c2/reject')).toHaveLength(1));
  });

  it('lets a coach withdraw a request and filter by status', async () => {
    const api = mockApi({
      'GET /session-changes': (c) => (c.query.get('status') === 'approved' ? [] : [change()]),
      'POST /session-changes/c1/cancel': () => change({ status: 'cancelled' }),
    });
    const { user } = await renderPage(<SessionChangesPage />, {
      path: '/session-changes',
      route: '/session-changes',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /Withdraw/ }));
    await waitFor(() => expect(api.find('POST /session-changes/c1/cancel')).toHaveLength(1));
    await user.click(screen.getByRole('radio', { name: 'In effect' }));
    expect(await screen.findByText('No session changes')).toBeInTheDocument();
  });
});
