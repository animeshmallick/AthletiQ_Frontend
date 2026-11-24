import { within } from '@testing-library/react';
import { CoursesPage } from '@/pages/courses';
import { DeliveryPage } from '@/pages/delivery';
import { batch } from '../fixtures';
import { adminUser, chooseOption, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const decision = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  roundNo: 1,
  status: 'awaiting',
  startedOn: '2099-03-02',
  completedOn: '2099-03-27',
  historical: false,
  autoLeft: false,
  decidedAt: null,
  note: null,
  adjustments: [],
  attended: 12,
  target: 12,
  student: { id: 's1', code: 'ATQ-0001', fullName: 'Anya Rao', phone: '+919876543210' },
  batch: { id: 'b1', name: 'Morning U-12', capacity: 20 },
  fee: { customMonthlyFee: null, monthlyDiscount: 0 },
  dues: { amount: 250_000, count: 1 },
  credit: 0,
  autoLeaveOn: '2099-04-26',
  ...over,
});

const credit = (over: Record<string, unknown> = {}) => ({
  id: 'cr1',
  studentId: 's1',
  kind: 'course_unused',
  amount: 229_167,
  status: 'refund_due',
  enrollmentId: 'e1',
  roundId: 'r1',
  sourceInvoiceId: 'i1',
  appliedInvoiceId: null,
  reason: 'ATQ/2026-27/00002: 11 of 12 sessions not needed',
  settledAt: null,
  note: null,
  createdAt: '2099-04-03T00:00:00Z',
  student: { id: 's1', code: 'ATQ-0001', fullName: 'Anya Rao' },
  sourceInvoice: { id: 'i1', number: 'ATQ/2026-27/00002' },
  ...over,
});

describe('CoursesPage', () => {
  it('re-admits a student once the unpaid fee is acknowledged', async () => {
    const api = mockApi({
      'GET /courses/decisions': () => [decision()],
      'GET /batches': () => [batch, { ...batch, id: 'b2', name: 'Evening' }],
      'POST /courses/rounds/r1/decide': () => ({
        enrollmentId: 'e2',
        leftAcademy: false,
        creditTotal: 0,
      }),
    });
    const { user } = await renderPage(<CoursesPage />, {
      path: '/courses',
      route: '/courses',
      user: adminUser,
    });
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.getByText(/1 invoice/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Decide' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anya Rao: what next?' });
    const go = within(dialog).getByRole('button', { name: 'Re-admit' });
    expect(go).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: 'Go ahead with unpaid fees' }));
    await user.type(within(dialog).getByLabelText('Monthly discount'), '100');
    await user.click(go);
    await waitFor(() => expect(api.find('POST /courses/rounds/r1/decide')).toHaveLength(1));
    expect(api.find('POST /courses/rounds/r1/decide')[0]!.body).toMatchObject({
      action: 'readmit',
      confirmDues: true,
      monthlyDiscount: 10_000,
    });
  });

  it('moves to another batch, or leaves choosing what happens to the credit', async () => {
    const api = mockApi({
      'GET /courses/decisions': () => [
        decision({ dues: { amount: 0, count: 0 }, credit: 229_167 }),
      ],
      'GET /batches': () => [
        batch,
        { ...batch, id: 'b2', name: 'Evening' },
        { ...batch, id: 'b3', name: 'Weekend' },
      ],
      'POST /courses/rounds/r1/decide': () => ({
        enrollmentId: null,
        leftAcademy: true,
        creditTotal: 229_167,
      }),
    });
    const { user } = await renderPage(<CoursesPage />, {
      path: '/courses',
      route: '/courses',
      user: adminUser,
    });
    await user.click(await screen.findByRole('button', { name: 'Decide' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anya Rao: what next?' });
    await user.click(within(dialog).getByRole('radio', { name: 'Move batch' }));
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled();
    await chooseOption(user, within(dialog).getByRole('combobox', { name: 'New batch' }), 'b2');
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeEnabled();

    await user.click(within(dialog).getByRole('radio', { name: 'Leave' }));
    expect(within(dialog).getByRole('button', { name: 'Leave' })).toBeDisabled();
    await user.click(within(dialog).getByRole('radio', { name: 'Refund it' }));
    await user.click(within(dialog).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(api.find('POST /courses/rounds/r1/decide')).toHaveLength(1));
    expect(api.find('POST /courses/rounds/r1/decide')[0]!.body).toMatchObject({
      action: 'leave',
      credit: 'refund',
    });
  });

  it('shows no decisions, and records refunds owed', async () => {
    const api = mockApi({
      'GET /courses/decisions': () => [],
      'GET /courses/credits': (c) => (c.query.get('status') === 'refund_due' ? [credit()] : []),
      'POST /courses/credits/cr1/settle': () => credit({ status: 'refunded' }),
    });
    const { user } = await renderPage(<CoursesPage />, {
      path: '/courses',
      route: '/courses',
      user: adminUser,
    });
    expect(await screen.findByText('No decisions waiting')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Credit & refunds' }));
    expect(await screen.findByText(/11 of 12 sessions not needed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Refunded/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Record the refund?' });
    await user.type(within(dialog).getByRole('textbox'), 'UPI ref 123');
    await user.click(within(dialog).getByRole('button', { name: 'Record refund' }));
    await waitFor(() => expect(api.find('POST /courses/credits/cr1/settle')).toHaveLength(1));
    expect(api.find('POST /courses/credits/cr1/settle')[0]!.body).toMatchObject({
      action: 'refunded',
      note: 'UPI ref 123',
    });
    await user.click(screen.getByRole('radio', { name: 'All' }));
    expect(await screen.findByText('No credit here')).toBeInTheDocument();
  });
});

const shortfall = (over: Record<string, unknown> = {}) => ({
  id: 'sf1',
  enrollmentId: 'e1',
  cycleNumber: 1,
  periodStart: '2099-03-02',
  periodEnd: '2099-04-01',
  target: 12,
  held: 11,
  remaining: 0,
  status: 'short',
  amount: null,
  invoiceId: null,
  sessionChangeId: null,
  resolvedAt: null,
  note: null,
  student: { id: 's1', code: 'ATQ-0001', fullName: 'Anya Rao' },
  batch: { id: 'b1', name: 'Morning U-12' },
  missing: 1,
  discountValue: 20_833,
  ...over,
});

describe('DeliveryPage', () => {
  it('lets an admin discount or dismiss a month that ended short', async () => {
    const api = mockApi({
      'GET /delivery/shortfalls': (c) =>
        c.query.get('status') === 'open'
          ? [shortfall(), shortfall({ id: 'sf2', status: 'at_risk', discountValue: 0 })]
          : [],
      'GET /batches': () => [batch],
      'POST /delivery/shortfalls/sf1/discount': () => ({ amount: 20_833 }),
      'POST /delivery/shortfalls/sf2/dismiss': () => shortfall({ id: 'sf2', status: 'dismissed' }),
    });
    const { user } = await renderPage(<DeliveryPage />, {
      path: '/delivery',
      route: '/delivery',
      user: adminUser,
    });
    expect(await screen.findByText('Ended short')).toBeInTheDocument();
    expect(screen.getByText('At risk')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Discount/ }));
    const d = await screen.findByRole('dialog', { name: /off\?/ });
    await user.click(within(d).getByRole('button', { name: 'Give discount' }));
    await waitFor(() => expect(api.find('POST /delivery/shortfalls/sf1/discount')).toHaveLength(1));

    await user.click(screen.getAllByRole('button', { name: /Dismiss/ })[1]!);
    const x = await screen.findByRole('dialog', { name: 'Dismiss this shortfall?' });
    await user.type(within(x).getByRole('textbox'), 'Agreed with parent');
    await user.click(within(x).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(api.find('POST /delivery/shortfalls/sf2/dismiss')).toHaveLength(1));
  });

  it('shows coaches what to make up (no money) and who is behind pace', async () => {
    mockApi({
      'GET /delivery/shortfalls': (c) =>
        c.query.get('status') === 'open'
          ? [
              shortfall({
                status: 'at_risk',
                discountValue: undefined,
                remaining: 0,
                held: 10,
                missing: 2,
              }),
            ]
          : [],
      'GET /batches': () => [batch],
      'GET /delivery/pace': () => [
        {
          roundId: 'r1',
          student: { id: 's1', fullName: 'Anya Rao', code: 'ATQ-0001' },
          batch: { id: 'b1', name: 'Morning U-12', coachId: 'coach-1' },
          attended: 4,
          target: 12,
          remaining: 5,
          short: 3,
          courseEndsOn: '2099-04-01',
          inExtension: false,
        },
        {
          roundId: 'r2',
          student: { id: 's2', fullName: 'Bhavin Shah', code: 'ATQ-0002' },
          batch: { id: 'b1', name: 'Morning U-12', coachId: 'coach-1' },
          attended: 11,
          target: 12,
          remaining: 0,
          short: 0,
          courseEndsOn: '2099-03-01',
          inExtension: true,
        },
      ],
    });
    const { user } = await renderPage(<DeliveryPage />, {
      path: '/delivery',
      route: '/delivery',
      user: coachUser,
    });
    expect(await screen.findByText('At risk')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discount/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dismiss/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Extra session/ })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Behind pace' }));
    expect(await screen.findByText(/3 short by/)).toBeInTheDocument();
    expect(screen.getByText('Extension month')).toBeInTheDocument();
  });

  it('lists resolved months by how they were resolved', async () => {
    mockApi({
      'GET /delivery/shortfalls': (c) =>
        c.query.get('status') === 'discounted'
          ? [
              shortfall({
                status: 'discounted',
                amount: 20_833,
                resolvedAt: '2099-04-03T00:00:00Z',
              }),
            ]
          : [],
      'GET /batches': () => [batch],
    });
    await renderPage(<DeliveryPage />, {
      path: '/delivery',
      route: '/delivery?tab=resolved',
      user: adminUser,
    });
    expect(await screen.findByText(/credited/)).toBeInTheDocument();
  });
});
