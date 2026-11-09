import { within } from '@testing-library/react';
import { BatchDialog } from '@/pages/batches';
import { StudentDetailPage } from '@/pages/students/detail';
import { batch, studentDetail } from '../fixtures';
import {
  adminUser,
  chooseOption,
  mockApi,
  renderPage,
  screen,
  selectValue,
  waitFor,
} from '../utils';

const weekend = {
  ...batch,
  id: 'b2',
  name: 'Weekend Squad',
  weekdays: [6, 7],
  coach: { id: 'coach-2', name: 'Neha', phone: null },
  feePlan: { id: 'p2', name: '2 days', monthlyFee: 150_000, daysPerWeek: 2 },
  memberCount: 3,
};

async function open() {
  const api = mockApi({
    'GET /students/s1': () => studentDetail,
    'GET /batches': () => [batch, weekend],
    'PATCH /students/s1/batches/e1': () => studentDetail,
    'POST /students/s1/batches/e1/move': () => studentDetail,
    'POST /students/s1/batches/e1/leave': () => studentDetail,
    'POST /students/s1/batches': () => studentDetail,
  });
  const r = await renderPage(<StudentDetailPage />, {
    path: '/students/:id',
    route: '/students/s1',
    user: adminUser,
  });
  await screen.findByText(/billed on day 10/);
  return { api, ...r };
}

describe('batch memberships on the student page', () => {
  it('changes one batch’s fee', async () => {
    const { api, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Manage Morning U-12' }));
    await user.click(await screen.findByRole('menuitem', { name: /change fee/i }));
    const dialog = await screen.findByRole('dialog', { name: /Fee for Morning U-12/ });
    const custom = within(dialog).getByRole('textbox', { name: /custom monthly fee/i });
    await user.type(custom, '2000');
    expect(dialog).toHaveTextContent('₹1,800 / month'); // 2,000 − 200 discount
    await user.click(within(dialog).getByRole('button', { name: 'Save fee' }));
    await waitFor(() => expect(api.find('PATCH /students/s1/batches/e1')).toHaveLength(1));
    expect(api.find('PATCH /students/s1/batches/e1')[0]!.body).toEqual({
      customMonthlyFee: 200_000,
      monthlyDiscount: 20_000,
    });
  });

  it('moves to another batch, keeping the billing day', async () => {
    const { api, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Manage Morning U-12' }));
    await user.click(await screen.findByRole('menuitem', { name: /move to another batch/i }));
    const dialog = await screen.findByRole('dialog', { name: /Move from Morning U-12/ });
    expect(dialog).toHaveTextContent('same day of the month (10)');
    await chooseOption(user, within(dialog).getByLabelText(/new batch/i), 'b2');
    expect(dialog).toHaveTextContent('2 days ₹1,500/month');
    await user.click(within(dialog).getByRole('button', { name: /move/i }));
    await waitFor(() => expect(api.find('POST /students/s1/batches/e1/move')).toHaveLength(1));
    expect(api.find('POST /students/s1/batches/e1/move')[0]!.body).toMatchObject({
      batchId: 'b2',
    });
  });

  it('adds the student to another batch', async () => {
    const { api, user } = await open();
    await user.click(screen.getByRole('button', { name: 'Add to batch' }));
    const dialog = await screen.findByRole('dialog', { name: /another batch/ });
    // Batches the student is already in aren't offered.
    await chooseOption(user, within(dialog).getByLabelText('Batch 1'), 'b2');
    expect(dialog).toHaveTextContent('2 days · ₹1,500/month');
    await user.click(within(dialog).getByRole('button', { name: /add to batch/i }));
    await waitFor(() => expect(api.find('POST /students/s1/batches')).toHaveLength(1));
    expect(api.find('POST /students/s1/batches')[0]!.body).toMatchObject({
      batchId: 'b2',
      customMonthlyFee: null,
      monthlyDiscount: 0,
    });
  });
});

describe('batch form', () => {
  it('offers only fee plans priced for the batch’s days, plus the free plan', async () => {
    const api = mockApi({
      'GET /users': () => ({ data: [], meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
      'GET /locations': () => [],
      'GET /sports': () => [],
      'GET /fee-plans': () => [
        { id: 'free', name: 'Free', daysPerWeek: 7, monthlyFee: 0, isActive: true, isSystem: true },
        { id: 'p3', name: '3 days', daysPerWeek: 3, monthlyFee: 250_000, isActive: true },
        { id: 'p6', name: '6 days', daysPerWeek: 6, monthlyFee: 400_000, isActive: true },
      ],
    });
    const { user } = await renderPage(<BatchDialog open onOpenChange={() => {}} />, {
      path: '/',
      route: '/',
      user: adminUser,
    });
    const plan = await screen.findByLabelText(/fee plan/i);
    await waitFor(() => expect(api.find('GET /fee-plans')[0]?.query.get('forBatch')).toBe('true'));
    // New batches default to Mon–Sat: the 6-day plan fits, and the free plan fits any days.
    await chooseOption(user, plan, 'p6');
    expect(selectValue(plan)).toBe('p6');
    await chooseOption(user, plan, 'free');
    expect(selectValue(plan)).toBe('free');
    // The 3-day plan isn't offered.
    await user.click(plan);
    expect(document.querySelector('[role="option"][data-value="p6"]')).not.toBeNull();
    expect(document.querySelector('[role="option"][data-value="p3"]')).toBeNull();
  });

  it('marks a free membership as never invoiced', async () => {
    mockApi({
      'GET /students/s1': () => ({
        ...studentDetail,
        memberships: [
          {
            ...studentDetail.memberships[0]!,
            fee: { base: 0, discount: 0, total: 0 },
            nextInvoice: null,
          },
        ],
      }),
    });
    await renderPage(<StudentDetailPage />, {
      path: '/students/:id',
      route: '/students/s1',
      user: adminUser,
    });
    expect(await screen.findByText(/free, no invoices/)).toBeInTheDocument();
  });
});

describe('batch timings', () => {
  it('lets some days run at their own time', async () => {
    const api = mockApi({
      'GET /users': () => ({ data: [], meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
      'GET /locations': () => [],
      'GET /sports': () => [],
      'GET /fee-plans': () => [
        { id: 'p1', name: '6 days', daysPerWeek: 6, monthlyFee: 250_000, isActive: true },
      ],
      'PATCH /batches/b1': () => batch,
    });
    const { user } = await renderPage(<BatchDialog open onOpenChange={() => {}} batch={batch} />, {
      path: '/',
      route: '/',
      user: adminUser,
    });
    await user.click(
      await screen.findByRole('switch', { name: 'Some days run at a different time' }),
    );
    await user.click(screen.getByRole('switch', { name: 'Saturday at its own time' }));
    const start = screen.getByLabelText('Saturday starts');
    const end = screen.getByLabelText('Saturday ends');
    expect(start).toHaveValue('06:00'); // starts from the usual time
    await user.clear(start);
    await user.type(start, '07:00');
    await user.clear(end);
    await user.type(end, '06:30');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('End must be after start')).toBeInTheDocument();
    expect(api.find('PATCH /batches/b1')).toHaveLength(0);

    await user.clear(end);
    await user.type(end, '09:00');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.find('PATCH /batches/b1')).toHaveLength(1));
    expect(api.find('PATCH /batches/b1')[0]!.body).toMatchObject({
      startTime: '06:00',
      endTime: '08:00',
      dayTimes: { '6': { start: '07:00', end: '09:00' } },
    });
  });

  it('shows each day’s time on the student’s batch card', async () => {
    mockApi({
      'GET /students/s1': () => ({
        ...studentDetail,
        memberships: [
          {
            ...studentDetail.memberships[0]!,
            weekdays: [1, 3, 6],
            dayTimes: { '6': { start: '07:00:00', end: '09:00:00' } },
          },
        ],
      }),
    });
    await renderPage(<StudentDetailPage />, {
      path: '/students/:id',
      route: '/students/s1',
      user: adminUser,
    });
    expect(
      await screen.findByText(/Mon, Wed 6:00 am – 8:00 am · Sat 7:00 am – 9:00 am/),
    ).toBeInTheDocument();
  });
});
