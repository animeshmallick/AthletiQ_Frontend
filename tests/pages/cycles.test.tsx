import { fireEvent, within } from '@testing-library/react';
import {
  OriginBadge,
  SessionActions,
  SessionChangeDialog,
  UndoChangeButton,
} from '@/components/session-change';
import { courseHint } from '@/lib/cycles';
import { notStarted } from '@/lib/session-origin';
import { BatchDialog } from '@/pages/batches';
import { BatchCyclesSection, StudentBatchesTab } from '@/pages/cycle-parts';
import { MissedSessionsPage } from '@/pages/missed-sessions';
import { ShareCertificatePage } from '@/pages/public/share';
import { RenewalsPage } from '@/pages/renewals';
import { batch } from '../fixtures';
import { adminUser, chooseOption, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const counts = {
  target: 12,
  conducted: 8,
  attended: 6,
  present: 5,
  late: 1,
  absent: 2,
  excused: 0,
  missed: 1,
  unconfirmed: 1,
  upcoming: 3,
  rate: 75,
};
const renewal = (over: Record<string, unknown> = {}) => ({
  cycleId: 'c1',
  enrollmentId: 'e1',
  student: { id: 's1', code: 'A1', fullName: 'Anya Rao' },
  batch: { id: 'b1', name: 'Morning U-12' },
  coach: { id: 'coach-1', name: 'Ravi' },
  roundNo: 2,
  months: 1,
  startsOn: '2099-03-02',
  endsOn: '2099-04-01',
  renewsOn: '2099-04-02',
  progress: counts,
  stopped: null,
  dues: { amount: 500_000, count: 2 },
  ...over,
});
const open = (user: typeof adminUser, route = '/renewals') =>
  renderPage(<RenewalsPage />, { path: '/renewals', route, user });

describe('RenewalsPage', () => {
  it('admin exits a student: suggestions ticked, cancelled ones locked', async () => {
    const api = mockApi({
      'GET /renewals': () => [renewal()],
      'GET /batches': () => [batch, { ...batch, id: 'b2', name: 'Evening' }],
      'GET /renewals/e1/exit': () => ({
        lastDay: '2099-03-14',
        invoices: [
          {
            id: 'i1',
            number: 'N1',
            periodStart: '2099-02-02',
            periodEnd: '2099-03-01',
            amount: 250_000,
            running: false,
            attended: 9,
            suggestion: 'due',
          },
          {
            id: 'i2',
            number: 'N2',
            periodStart: '2099-03-02',
            periodEnd: '2099-04-01',
            amount: 250_000,
            running: true,
            attended: 4,
            suggestion: 'lost',
          },
          {
            id: 'i3',
            number: 'N3',
            periodStart: '2099-04-02',
            periodEnd: '2099-05-01',
            amount: 250_000,
            running: false,
            attended: 0,
            suggestion: 'cancel',
          },
        ],
      }),
      'POST /renewals/e1/exit': () => ({}),
    });
    const { user } = await open(adminUser);
    expect(await screen.findByText(/8 of 12 conducted/)).toBeInTheDocument();
    expect(screen.getByText(/unpaid \(2 invoices\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Exit now/ }));
    const d = await screen.findByRole('dialog', { name: 'Exit Anya Rao today?' });
    expect(await within(d).findByRole('checkbox', { name: 'N2 is lost' })).toBeChecked();
    expect(within(d).getByRole('checkbox', { name: 'N3 is lost' })).toBeDisabled();
    expect(within(d).getByText(/stays due/)).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: 'Exit now' });
    expect(go).toBeDisabled();
    await user.type(within(d).getByLabelText('Reason'), 'Moving city');
    await user.click(within(d).getByRole('checkbox', { name: 'N2 is lost' }));
    await user.click(within(d).getByRole('checkbox', { name: 'N1 is lost' }));
    await user.click(go);
    await waitFor(() => expect(api.find('POST /renewals/e1/exit')).toHaveLength(1));
    expect(api.find('POST /renewals/e1/exit')[0]!.body).toEqual({
      reason: 'Moving city',
      moveToBatchId: null,
      lostInvoiceIds: ['i1'],
    });
  });

  it('an exit refused because a payment came in reloads the invoices', async () => {
    const api = mockApi({
      'GET /renewals': () => [renewal()],
      'GET /batches': () => [batch],
      'GET /renewals/e1/exit': () => ({ lastDay: '2099-03-14', invoices: [] }),
      'POST /renewals/e1/exit': () => ({
        status: 409,
        body: {
          error: { code: 'CONFLICT', message: 'One of those invoices is no longer unpaid.' },
        },
      }),
    });
    const { user } = await open(adminUser);
    await user.click(await screen.findByRole('button', { name: /Exit now/ }));
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText('Nothing unpaid')).toBeInTheDocument();
    await user.type(within(d).getByLabelText('Reason'), 'Moving city');
    await user.click(within(d).getByRole('button', { name: 'Exit now' }));
    expect(await screen.findByText('Could not exit')).toBeInTheDocument();
    await waitFor(() => expect(api.find('GET /renewals/e1/exit').length).toBeGreaterThan(1));
  });

  it('coach stops a renewal at cycle end, without money, moves or exits', async () => {
    const api = mockApi({
      'GET /renewals': () => [renewal({ dues: null })],
      'GET /batches': () => [batch],
      'POST /renewals/e1/stop': () => ({ on: '2099-04-01' }),
    });
    const { user } = await open(coachUser);
    await user.click(await screen.findByRole('button', { name: /Stop renewal/ }));
    expect(screen.queryByText(/2 invoices/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exit now/ })).not.toBeInTheDocument();
    const d = await screen.findByRole('dialog', { name: 'Stop Anya Rao’s renewal?' });
    expect(within(d).queryByLabelText('Then')).not.toBeInTheDocument();
    await user.type(within(d).getByLabelText('Reason'), 'Parent asked');
    await user.click(within(d).getByRole('button', { name: 'Stop renewal' }));
    await waitFor(() =>
      expect(api.find('POST /renewals/e1/stop')[0]!.body).toEqual({
        reason: 'Parent asked',
        moveToBatchId: null,
      }),
    );
  });

  it('admin stops with a move, restores, and filters', async () => {
    const api = mockApi({
      'GET /renewals': () => [
        renewal(),
        renewal({
          cycleId: 'c2',
          enrollmentId: 'e2',
          student: { id: 's2', code: 'A2', fullName: 'Bhavin' },
          dues: { amount: 0, count: 0 },
          stopped: {
            on: '2099-04-01',
            reason: 'Level up',
            by: 'Asha',
            moveTo: { id: 'b2', name: 'Evening' },
          },
        }),
      ],
      'GET /batches': () => [
        batch,
        { ...batch, id: 'b2', name: 'Evening' },
        { ...batch, id: 'b3', name: 'Full', memberCount: 20 },
      ],
      'POST /renewals/e1/stop': () => ({ on: '2099-04-01' }),
      'POST /renewals/e2/restore': () => ({ restored: true }),
    });
    const { user } = await open(adminUser);
    await user.click(await screen.findByRole('button', { name: /Stop renewal/ }));
    const d = await screen.findByRole('dialog');
    await chooseOption(user, within(d).getByRole('combobox', { name: 'Then' }), 'b2');
    await user.type(within(d).getByLabelText('Reason'), 'Level up');
    await user.click(within(d).getByRole('button', { name: 'Stop renewal' }));
    await waitFor(() =>
      expect(api.find('POST /renewals/e1/stop')[0]!.body).toMatchObject({ moveToBatchId: 'b2' }),
    );
    expect(screen.getByText(/To Evening/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Restore renewal/ }));
    await waitFor(() => expect(api.find('POST /renewals/e2/restore')).toHaveLength(1));
    await user.click(screen.getByRole('radio', { name: 'Unpaid' }));
    expect(screen.queryByText('Bhavin')).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Stopped' }));
    expect(await screen.findByText('Bhavin')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Ending soon' }));
    expect(await screen.findByText('No renewals here')).toBeInTheDocument();
  });
});

const missed = (over: Record<string, unknown> = {}) => ({
  batch: { id: 'b1', name: 'Morning U-12', coach: { id: 'coach-1', name: 'Ravi' } },
  date: '2099-03-11',
  originalDate: '2099-03-11',
  startTime: '06:00:00',
  endTime: '08:00:00',
  students: 2,
  reason: 'Rain',
  missed: false,
  coachUntil: '2099-04-10',
  overdue: false,
  ...over,
});
const smart = (over: Record<string, unknown> = {}) => ({
  sessionDate: '2099-03-11',
  originalDate: '2099-03-11',
  students: 2,
  message: null,
  days: [
    { date: '2099-03-12', blocked: null, outside: [], smart: true },
    { date: '2099-03-13', blocked: 'Already runs', outside: [], smart: false },
    { date: '2099-03-14', blocked: null, outside: ['Bhavin'], smart: false },
  ],
  ...over,
});
const preview = (over: Record<string, unknown> = {}) => ({
  ok: true,
  errors: [],
  warnings: [],
  ...over,
});

describe('MissedSessionsPage', () => {
  it('coach reschedules with smart dates, confirming students outside their month', async () => {
    const api = mockApi({
      'GET /session-changes/missed': () => ({
        open: [missed(), missed({ date: '2099-01-01', overdue: true })],
        unconfirmed: [],
      }),
      'GET /batches/b1/smart-dates': () => smart(),
      'POST /batches/b1/session-changes/preview': (c) =>
        (c.body as { date: string }).date === '2099-03-14'
          ? preview({
              warnings: [
                {
                  code: 'outside-window',
                  message: 'After the billing month of 1 student.',
                  students: [{ id: 's2', fullName: 'Bhavin', detail: 'until 13 Mar' }],
                },
              ],
            })
          : preview(),
      'POST /batches/b1/session-changes': (c) => ({
        id: 'x',
        kind: 'reschedule',
        ...(c.body as object),
      }),
    });
    const { user } = await renderPage(<MissedSessionsPage />, {
      path: '/missed-sessions',
      route: '/missed-sessions',
      user: coachUser,
    });
    expect(await screen.findByText(/ask an admin to reschedule/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reschedule/ }));
    const d = await screen.findByRole('dialog', { name: 'Reschedule missed session' });
    const grid = await within(d).findByRole('group', { name: 'Choose a day' });
    expect(
      within(grid).queryByRole('button', { name: /suits every student/ }),
    ).not.toBeInTheDocument();
    await user.click(within(d).getByRole('switch', { name: 'Smart dates' }));
    expect(within(grid).getAllByRole('button', { name: /suits every student/ })).toHaveLength(1);
    const days = within(grid).getAllByRole('button');
    expect(days[1]).toBeDisabled();
    expect(within(d).queryByLabelText('Day')).not.toBeInTheDocument(); // admins only
    await user.click(days[2]!);
    expect(await within(d).findByText('Bhavin (until 13 Mar)')).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: 'Reschedule' });
    expect(go).toBeDisabled();
    await user.click(within(d).getByRole('checkbox', { name: 'Go ahead anyway' }));
    await user.click(go);
    await waitFor(() =>
      expect(api.find('POST /batches/b1/session-changes')[0]!.body).toMatchObject({
        sessionDate: '2099-03-11',
        date: '2099-03-14',
        confirm: true,
      }),
    );
  });

  it('says when no day suits everyone', async () => {
    mockApi({
      'GET /session-changes/missed': () => ({ open: [missed()], unconfirmed: [] }),
      'GET /batches/b1/smart-dates': () =>
        smart({ message: 'No day suits every student’s billing month.', days: [] }),
    });
    const { user } = await renderPage(<MissedSessionsPage />, {
      path: '/missed-sessions',
      route: '/missed-sessions',
      user: adminUser,
    });
    await user.click(await screen.findByRole('button', { name: /Reschedule/ }));
    const d = await screen.findByRole('dialog');
    expect(await within(d).findByText(/The 30 days are over/)).toBeInTheDocument();
    await user.click(within(d).getByRole('switch', { name: 'Smart dates' }));
    expect(within(d).getByText(/No day suits every student/)).toBeInTheDocument();
    expect(within(d).getByLabelText('Day')).toBeInTheDocument();
  });

  it('admin confirms an unconfirmed session and closes a missed one', async () => {
    const api = mockApi({
      'GET /session-changes/missed': () => ({
        open: [missed({ originalDate: '2099-03-09', optional: true })],
        unconfirmed: [missed({ date: '2099-03-13', reason: null })],
      }),
      'POST /session-changes/missed/confirm': () => ({ confirmed: true }),
      'POST /session-changes/missed/close': () => ({ closed: true }),
    });
    const { user } = await renderPage(<MissedSessionsPage />, {
      path: '/missed-sessions',
      route: '/missed-sessions?tab=unconfirmed',
      user: adminUser,
    });
    expect(await screen.findByRole('link', { name: /mark attendance/ })).toHaveAttribute(
      'href',
      '/attendance?batch=b1&date=2099-03-13',
    );
    await user.click(screen.getByRole('button', { name: /Missed/ }));
    await user.click(await screen.findByRole('button', { name: 'Yes, missed' }));
    await waitFor(() =>
      expect(api.find('POST /session-changes/missed/confirm')[0]!.body).toEqual({
        batchId: 'b1',
        date: '2099-03-13',
      }),
    );
    await user.click(screen.getByRole('radio', { name: /To reschedule/ }));
    expect(await screen.findByText(/everyone gets the full count/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    const d = await screen.findByRole('dialog', { name: 'Close without rescheduling?' });
    await user.type(within(d).getByRole('textbox'), 'No ground');
    await user.click(within(d).getByRole('button', { name: 'Close session' }));
    await waitFor(() => expect(api.find('POST /session-changes/missed/close')).toHaveLength(1));
  });
});

describe('session changes', () => {
  const ref = { id: 'b1', name: 'Morning U-12', startTime: '06:00:00', endTime: '08:00:00' };
  const session = { date: '2099-03-11', startTime: '06:00:00', endTime: '08:00:00' };

  it('admin moves in advance: errors, fresh warnings after a conflict', async () => {
    let posts = 0;
    mockApi({
      'POST /batches/b1/session-changes/preview': (c) =>
        (c.body as { date: string }).date === '2099-03-13'
          ? preview({ ok: false, errors: ['Already runs that day.'] })
          : preview(),
      'POST /batches/b1/session-changes': (c) =>
        ++posts === 1
          ? {
              status: 409,
              body: {
                error: {
                  code: 'CONFLICT',
                  message: 'Please confirm',
                  details: {
                    warnings: [{ code: 'location-overlap', message: 'Evening also runs.' }],
                  },
                },
              },
            }
          : { id: 'x', ...(c.body as object) },
    });
    const onClose = jest.fn();
    const { user } = await renderPage(
      <SessionChangeDialog batch={ref} session={session} onClose={onClose} />,
      { user: adminUser },
    );
    const d = await screen.findByRole('dialog', { name: 'Move this session' });
    expect(within(d).getByText('Pick a new day or time.')).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('Day'), { target: { value: '2099-03-13' } });
    expect(await within(d).findByText('Already runs that day.')).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText('Day'), { target: { value: '2099-03-12' } });
    await waitFor(() =>
      expect(within(d).getByRole('button', { name: 'Move session' })).toBeEnabled(),
    );
    await user.click(within(d).getByRole('button', { name: 'Move session' }));
    expect(await within(d).findByText('Evening also runs.')).toBeInTheDocument();
    await user.click(within(d).getByRole('checkbox', { name: 'Go ahead anyway' }));
    await user.click(within(d).getByRole('button', { name: 'Move session' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('adds an extra session; a failed check shows as an error', async () => {
    mockApi({
      'POST /batches/b1/session-changes/preview': () => ({
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Batch not found' } },
      }),
    });
    await renderPage(<SessionChangeDialog batch={ref} onClose={() => {}} />, { user: adminUser });
    expect(await screen.findByRole('dialog', { name: 'Add an extra session' })).toBeInTheDocument();
    expect(await screen.findByText('Batch not found')).toBeInTheDocument();
  });

  it('offers the right actions per role and state', async () => {
    const api = mockApi({ 'POST /session-changes/x/cancel': () => ({}) });
    const moved = { kind: 'moved' as const, originalDate: '2099-03-10', changeId: 'x' };
    const { user } = await renderPage(
      <div>
        <div data-testid="a">
          <SessionActions batch={ref} session={session} cancelled={false} canMove />
        </div>
        <div data-testid="b">
          <SessionActions batch={ref} session={session} cancelled canMove={false} />
        </div>
        <UndoChangeButton changeId="x" extra={false} />
        <OriginBadge origin={moved} date="2099-03-11" />
        <OriginBadge origin={{ ...moved, originalDate: '2099-03-11' }} date="2099-03-11" />
        <OriginBadge origin={{ kind: 'extra', originalDate: null, changeId: 'y' }} />
      </div>,
      { user: coachUser },
    );
    expect(await screen.findByText(/Moved from/)).toBeInTheDocument();
    expect(screen.getByText('New time')).toBeInTheDocument();
    expect(screen.getByText('Extra session')).toBeInTheDocument();
    expect(screen.getByTestId('a')).toBeEmptyDOMElement();
    expect(
      within(screen.getByTestId('b')).getByRole('button', { name: /Reschedule/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Undo/ }));
    await waitFor(() => expect(api.find('POST /session-changes/x/cancel')).toHaveLength(1));
  });

  it('knows whether a session has started (academy time)', () => {
    const now = new Date('2026-03-09T03:30:00Z'); // 09:00 IST
    expect(notStarted('2026-03-09', '10:00:00', now)).toBe(true);
    expect(notStarted('2026-03-09', '08:00:00', now)).toBe(false);
    expect(notStarted('2026-03-10', '08:00:00', now)).toBe(true);
    expect(notStarted('2026-03-08', '08:00:00', now)).toBe(false);
  });
});

describe('cycles on batch and student pages', () => {
  const cycle = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    roundNo: 1,
    months: 1,
    startsOn: '2099-03-02',
    endsOn: '2099-04-01',
    status: 'active',
    endedOn: null,
    ...counts,
    ...over,
  });

  it('shows the batch’s running cycles, or that there is no course', async () => {
    mockApi({
      'GET /cycles/batches/b1': () => ({
        courseMonths: 1,
        perMonth: 12,
        cycles: [
          {
            ...cycle(),
            student: { id: 's1', code: 'A1', fullName: 'Anya Rao' },
            plannedEndOn: '2099-04-01',
          },
        ],
      }),
    });
    await renderPage(
      <div>
        <BatchCyclesSection batch={{ ...batch, courseMonths: 1 }} />
        <BatchCyclesSection batch={batch} />
      </div>,
      { user: coachUser },
    );
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.getByText(/not renewing/)).toBeInTheDocument();
    expect(screen.getByText(/attended 6 \(75%\)/)).toBeInTheDocument();
    expect(screen.getByText('No course set up yet.')).toBeInTheDocument();
  });

  it('lists every batch, cycle, session, invoice and certificate', async () => {
    const s = (over: object) => ({
      date: '2099-03-02',
      originalDate: null,
      kind: 'regular',
      startTime: '06:00:00',
      endTime: '08:00:00',
      state: 'held',
      reason: null,
      mark: 'present',
      ...over,
    });
    const inv = (id: string, status: string) => ({
      id,
      number: id,
      periodStart: '2099-03-02',
      periodEnd: '2099-04-01',
      totalAmount: 250_000,
      status,
    });
    const api = mockApi({
      'GET /cycles/students/s1': () => [
        {
          enrollmentId: 'e1',
          batch: { id: 'b1', name: 'Morning U-12' },
          coach: { id: 'c', name: 'Ravi' },
          from: '2099-01-01',
          to: null,
          plannedEndOn: '2099-05-01',
          reason: null,
          cycles: [
            { ...cycle({ roundNo: 2, id: 'c2' }), sessions: [], invoices: [] },
            {
              ...cycle({ status: 'completed', endedOn: '2099-04-01' }),
              sessions: [
                s({}),
                s({ date: '2099-03-05', originalDate: '2099-03-04', kind: 'moved', mark: null }),
                s({ date: '2099-03-06', state: 'missed', reason: 'Rain', mark: null }),
                s({ date: '2099-03-08', kind: 'extra', state: 'upcoming', mark: null }),
              ],
              invoices: [inv('N1', 'lost')],
            },
          ],
          earlier: [inv('N0', 'paid')],
        },
        {
          enrollmentId: 'e0',
          batch: { id: 'b0', name: 'Old' },
          coach: { id: 'c', name: 'Neha' },
          from: '2098-01-01',
          to: '2098-02-01',
          plannedEndOn: null,
          reason: null,
          cycles: [],
          earlier: [],
        },
      ],
      'POST /cycles/c1/certificate/share': () => ({
        url: 'https://app/share/certificate/c1',
        expiresAt: '',
        whatsappUrl: '',
      }),
    });
    const { user } = await renderPage(
      <StudentBatchesTab studentId="s1" studentName="Anya Rao" phone="+91" />,
      { user: adminUser },
    );
    expect(await screen.findByText('Round 2')).toBeInTheDocument();
    expect(screen.getByText(/planned/)).toBeInTheDocument();
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.getByText('Before cycles')).toBeInTheDocument();
    expect(screen.getByText('No records yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /4 sessions/ }));
    expect(screen.getByText('Missed')).toBeInTheDocument();
    expect(screen.getByText(/· Rain/)).toBeInTheDocument();
    expect(screen.getByText(/· extra/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    expect(
      await screen.findByRole('dialog', { name: 'Share the certificate' }),
    ).toBeInTheDocument();
    expect(api.find('POST /cycles/c1/certificate/share')).toHaveLength(1);
  });

  it('handles no batches', async () => {
    mockApi({ 'GET /cycles/students/s1': () => [] });
    await renderPage(<StudentBatchesTab studentId="s1" studentName="A" />, { user: adminUser });
    expect(await screen.findByText('No batches yet')).toBeInTheDocument();
  });
});

describe('course length and certificate link', () => {
  const lookups = {
    'GET /users': () => ({ data: [], meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
    'GET /locations': () => [],
    'GET /sports': () => [],
    'GET /fee-plans': () => [
      { id: 'p1', name: '6 days', daysPerWeek: 6, monthlyFee: 250_000, isActive: true },
    ],
  };

  it('is fixed while a batch with a course has students, and kept on save', async () => {
    const api = mockApi({ ...lookups, 'PATCH /batches/b1': () => batch });
    const { user } = await renderPage(
      <BatchDialog open onOpenChange={() => {}} batch={{ ...batch, courseMonths: 3 }} />,
      { user: adminUser },
    );
    expect(await screen.findByLabelText(/Course length/)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(api.find('PATCH /batches/b1')[0]!.body).toMatchObject({ courseMonths: 3 }),
    );
  });

  it('is required again when emptied on a batch without students; may stay empty before set-up', async () => {
    const api = mockApi({ ...lookups, 'PATCH /batches/b1': () => batch });
    const a = await renderPage(
      <BatchDialog
        open
        onOpenChange={() => {}}
        batch={{ ...batch, courseMonths: 3, memberCount: 0 }}
      />,
      { user: adminUser },
    );
    await a.user.clear(await screen.findByLabelText(/Course length/));
    await a.user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Choose the course length in months')).toBeInTheDocument();
    a.unmount();
    const b = await renderPage(<BatchDialog open onOpenChange={() => {}} batch={batch} />, {
      user: adminUser,
    });
    await b.user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.find('PATCH /batches/b1')).toHaveLength(1));
    expect(api.find('PATCH /batches/b1')[0]!.body).not.toHaveProperty('courseMonths');
  });

  it('explains the target', () => {
    expect(courseHint(3, '3')).toBe('12 sessions a month · 36 in all');
    expect(courseHint(3, '', { courseMonths: null, memberCount: 2 })).toContain('set it up later');
    expect(courseHint(3, '1', { courseMonths: null, memberCount: 2 })).toContain('start round 1');
  });

  it('opens a shared certificate behind the registration number', async () => {
    mockApi({
      'GET /public/certificates/c1': () => ({
        kind: 'certificate',
        academy: 'Test',
        title: 'Course certificate',
        student: 'Anya',
        expiresAt: '2099-04-01T00:00:00Z',
      }),
    });
    await renderPage(<ShareCertificatePage />, {
      path: '/share/certificate/:id',
      route: '/share/certificate/c1?e=1&s=x',
    });
    expect(await screen.findByText('Course certificate')).toBeInTheDocument();
  });
});
