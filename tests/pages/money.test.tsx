import { screen, waitFor, within } from '@testing-library/react';
import {
  allocate,
  autoName,
  formatPercent,
  nodeAmounts,
  previewShares,
  validateTree,
} from '@/lib/split';
import type { AcademyFunds, FeePlan, FundTxn, MyFunds, SplitNode } from '@/lib/types';
import { FeePlansPage } from '@/pages/admin/fee-plans';
import { MoneyPage } from '@/pages/money';
import { adminUser, coachUser, mockApi, renderPage } from '../utils';

const node = (over: Partial<SplitNode>): SplitNode => ({
  name: 'Academy',
  kind: 'percent',
  value: 10000,
  recipient: 'academy',
  userId: null,
  payeeId: null,
  children: [],
  ...over,
});

const page = <T,>(data: T[]) => ({
  data,
  meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

describe('split maths (client copy)', () => {
  it('matches the server rules', () => {
    expect(
      allocate(
        [node({ kind: 'flat', value: 200 }), node({ value: 5000 }), node({ value: 5000 })],
        1001,
      ),
    ).toEqual([200, 401, 400]);
    const tree = [
      node({
        name: 'Academy',
        value: 5000,
        recipient: null,
        children: [node({ name: 'Society', value: 3500 }), node({ value: 6500 })],
      }),
      node({ name: 'Coach', value: 5000, recipient: 'batch_coach' }),
    ];
    expect(previewShares(tree, 200_000).map((l) => [l.label, l.amount])).toEqual([
      ['Society', 35_000],
      ['Academy', 65_000],
      ['Coach', 100_000],
    ]);
    expect(nodeAmounts(tree, 200_000)).toMatchObject({ '0': 100_000, '0.0': 35_000, '1': 100_000 });
    expect(validateTree(tree)).toEqual([]);
    expect(
      validateTree([node({ name: '', value: 0, recipient: 'staff' })]).map((e) => e.message),
    ).toEqual([
      'Percentages add up to 0%, not 100%',
      'Enter a value above zero',
      'Choose a staff member',
    ]);
    expect(formatPercent(3333)).toBe('33.33%');
  });
});

describe('section names', () => {
  it('follow the final recipient; divided sections have no name', () => {
    const named = autoName(
      [
        node({ name: '', children: [node({}), node({ recipient: 'payee', payeeId: 'py1' })] }),
        node({ name: 'old', recipient: 'staff', userId: 'u1' }),
        node({ name: '', recipient: 'academy' }),
        node({ name: '', recipient: 'academy' }),
        node({ name: '', recipient: 'batch_coach' }),
      ],
      [{ id: 'u1', name: 'Ravi' }],
      [{ id: 'py1', name: 'Society' }],
    );
    expect(named.map((n) => n.name)).toEqual(['', 'Ravi', 'Academy', 'Academy', 'Batch coach']);
    expect(named[0]!.children.map((c) => c.name)).toEqual(['Academy', 'Society']);
  });
});

describe('fee split editor', () => {
  const plan: FeePlan = {
    id: 'p1',
    name: '3 days',
    description: null,
    daysPerWeek: 3,
    monthlyFee: 200_000,
    isActive: true,
    activeStudents: 2,
    split: [],
  };

  it('starts from a 50/50 template, validates totals and saves the tree', async () => {
    const api = mockApi({
      'GET /fee-plans': () => [plan],
      'GET /users': () => page([{ ...coachUser, status: 'active' }]),
      'GET /funds/payees': () => [{ id: 'py1', name: 'Society', note: null, isActive: true }],
      'PUT /fee-plans/p1/split': ({ body }) => (body as { sections: SplitNode[] }).sections,
    });
    const { user } = await renderPage(<FeePlansPage />, {
      path: '/fee-plans',
      route: '/fee-plans',
      user: adminUser,
    });
    const bar = await screen.findByRole('button', { name: 'Fee split for 3 days' });
    expect(bar).toHaveTextContent('No split set · all to the academy');
    await user.click(bar);
    // The panel shows the plan's (empty) distribution with a call to action.
    expect(screen.getByText('No split yet')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /Set up split/ })[0]!);

    const dialog = await screen.findByRole('dialog', { name: 'Fee split · 3 days' });
    expect(within(dialog).getAllByText('100% of 100%')).toHaveLength(1);
    expect(within(dialog).getAllByText('₹1,000').length).toBeGreaterThanOrEqual(2);

    // Break the total, then fix it.
    const pcts = within(dialog).getAllByRole('textbox', { name: 'Percentage' });
    await user.clear(pcts[1]!);
    await user.type(pcts[1]!, '40');
    expect(within(dialog).getByText('90% of 100%')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save split' })).toBeDisabled();
    await user.clear(pcts[1]!);
    await user.type(pcts[1]!, '50');

    await user.click(within(dialog).getByRole('button', { name: 'Save split' }));
    await waitFor(() => expect(api.find('PUT /fee-plans/p1/split')).toHaveLength(1));
    const sent = api.find('PUT /fee-plans/p1/split')[0]!.body as { sections: SplitNode[] };
    expect(sent.sections.map((s) => [s.name, s.kind, s.value, s.recipient])).toEqual([
      ['Academy', 'percent', 5000, 'academy'],
      ['Batch coach', 'percent', 5000, 'batch_coach'],
    ]);
    expect(within(dialog).queryByRole('textbox', { name: 'Section name' })).toBeNull();
    expect(JSON.stringify(sent)).not.toContain('"key"');
  });

  it('shows a saved split on the card', async () => {
    mockApi({
      'GET /fee-plans': () => [
        {
          ...plan,
          split: [
            node({ name: 'Academy', value: 6000 }),
            node({ name: 'Coach', value: 4000, recipient: 'batch_coach' }),
          ],
        },
      ],
    });
    await renderPage(<FeePlansPage />, {
      path: '/fee-plans',
      route: '/fee-plans',
      user: adminUser,
    });
    expect(await screen.findByText('Academy ₹1,200 · Coach ₹800')).toBeInTheDocument();
  });
});

describe('plan distribution panel', () => {
  it('shows every level linked to its parent, previews other fees and totals per recipient', async () => {
    mockApi({
      'GET /fee-plans': () => [
        {
          id: 'p1',
          name: '3 days',
          description: null,
          daysPerWeek: 3,
          monthlyFee: 260_000,
          isActive: true,
          activeStudents: 2,
          split: [
            node({ name: 'Rent', kind: 'flat', value: 60_000, recipient: 'payee', payeeId: 'py1' }),
            node({
              name: 'Academy',
              value: 5000,
              recipient: null,
              children: [
                node({ name: 'Society', value: 3500, recipient: 'payee', payeeId: 'py1' }),
                node({ name: 'Academy', value: 6500 }),
              ],
            }),
            node({ name: 'Coach', value: 5000, recipient: 'batch_coach' }),
          ],
        },
      ],
      'GET /users': () => page([]),
      'GET /funds/payees': () => [{ id: 'py1', name: 'Society', note: null, isActive: true }],
    });
    const { user } = await renderPage(<FeePlansPage />, {
      path: '/fee-plans',
      route: '/fee-plans',
      user: adminUser,
    });
    // On phones and tablets a plan opens in a sheet when tapped.
    await user.click(await screen.findByRole('button', { name: 'Show 3 days' }));
    const tree = await screen.findByRole('tree', { name: 'Distribution of 3 days' });
    // ₹2,600: ₹600 rent first, then ₹1,000 each to Academy and Coach; Society 35% of Academy.
    expect(within(tree).getByText('₹600 flat from the 3 days fee')).toBeInTheDocument();
    expect(within(tree).getAllByText('50% of the 3 days fee after flat amounts')).toHaveLength(2);
    expect(within(tree).getByText('35% of Academy')).toBeInTheDocument();
    expect(within(tree).getAllByText('₹350').length).toBeGreaterThan(0);

    // Parent link highlights the parent; collapse hides the children.
    // The last “Academy” button is a sub-section's link back to its parent.
    await user.click(within(tree).getAllByRole('button', { name: 'Academy' }).at(-1)!);
    expect(within(tree).getAllByRole('treeitem', { selected: true })).toHaveLength(1);
    await user.click(within(tree).getByRole('button', { name: 'Collapse Academy' }));
    expect(within(tree).queryByText('35% of Academy')).not.toBeInTheDocument();
    await user.click(within(tree).getByRole('button', { name: 'Expand Academy' }));

    // A discounted fee no longer covers the flat rent.
    const fee = screen.getByRole('textbox', { name: 'Preview fee' });
    await user.clear(fee);
    await user.type(fee, '500');
    expect(screen.getByText('Only ₹500 of ₹600 covered at this fee')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /List price/ }));

    // Totals per recipient (Society gets the rent and its 35%) and the all-plans card.
    expect(screen.getByText('Each recipient gets in total')).toBeInTheDocument();
    expect(screen.getByText('Where a month of fees goes')).toBeInTheDocument();
    expect(screen.getAllByText('₹950').length).toBeGreaterThan(0);
  });
});

const academy: AcademyFunds = {
  scope: 'academy',
  from: '2026-01-01',
  to: '2026-01-15',
  balances: {
    academyCash: 300_000,
    withStaff: 125_000,
    academyFund: 340_000,
    owedToStaff: 41_250,
    owedToPayees: 43_750,
    holders: [{ userId: 'coach-1', name: 'Ravi Kumar', role: 'coach', amount: 125_000 }],
    staffDue: [{ userId: 'coach-2', name: 'Meena', role: 'coach', amount: 41_250 }],
    payeeDue: [{ payeeId: 'py1', name: 'Society', amount: 43_750 }],
  },
  period: {
    collected: 250_000,
    payments: 1,
    keptByStaff: 125_000,
    keptBy: [{ userId: 'coach-1', name: 'Ravi Kumar', amount: 125_000 }],
    handedOver: 0,
    spent: 30_000,
    paidOut: 0,
    income: 0,
    distribution: [
      {
        label: 'Coach',
        account: 'staff_due',
        userId: 'coach-1',
        payeeId: null,
        name: 'Ravi Kumar',
        amount: 125_000,
      },
      {
        label: 'Society',
        account: 'payee_due',
        userId: null,
        payeeId: 'py1',
        name: 'Society',
        amount: 43_750,
      },
    ],
    byRecipient: [
      { key: 'coach-1', kind: 'staff', name: 'Ravi Kumar', amount: 125_000 },
      { key: 'py1', kind: 'payee', name: 'Society', amount: 43_750 },
    ],
    expensesByCategory: [{ category: 'equipment', amount: 30_000, count: 1 }],
  },
};

const txn = (over: Partial<FundTxn>): FundTxn => ({
  id: 't1',
  type: 'expense',
  occurredOn: '2026-01-14',
  amount: 30_000,
  title: 'Cones',
  category: 'equipment',
  note: null,
  reference: 'B-12',
  createdAt: '2026-01-14T10:00:00Z',
  user: { id: 'coach-1', name: 'Ravi Kumar' },
  payee: null,
  createdBy: { id: 'coach-1', name: 'Ravi Kumar' },
  invoice: null,
  reversedAt: null,
  reversedBy: null,
  reversalReason: null,
  entries: [
    {
      account: 'cash',
      userId: 'coach-1',
      payeeId: null,
      amount: -30_000,
      label: null,
      share: false,
      name: 'Ravi Kumar',
    },
    {
      account: 'academy_fund',
      userId: null,
      payeeId: null,
      amount: -30_000,
      label: null,
      share: false,
      name: 'Academy',
    },
  ],
  ...over,
});

describe('Money dashboard', () => {
  it('admin sees who holds money, who is owed, flow, distribution and the ledger', async () => {
    const api = mockApi({
      'GET /funds/overview': () => academy,
      'GET /funds/txns': () => page([txn({})]),
      'GET /users': () => page([]),
      'POST /funds/payouts': ({ body }) => ({
        status: 201,
        body: { data: txn({ type: 'payout', ...(body as object) }) },
      }),
      'POST /funds/txns/t1/reverse': () => txn({ reversedAt: '2026-01-15T00:00:00Z' }),
    });
    const { user } = await renderPage(<MoneyPage />, {
      path: '/money',
      route: '/money',
      user: adminUser,
    });
    expect(await screen.findByText('Who holds the cash')).toBeInTheDocument();
    // Total in hand: ₹3,000 with the academy + ₹1,250 with staff.
    expect(screen.getAllByText('₹4,250').length).toBeGreaterThan(0);
    expect(screen.getByText(/academy’s own money/)).toBeInTheDocument();
    // Enough cash for what's owed: no shortfall warning.
    expect(screen.queryByText(/Not enough cash/)).not.toBeInTheDocument();
    expect(screen.getByText('Kept by coaches as their share')).toBeInTheDocument();
    expect(screen.getByText('Equipment')).toBeInTheDocument();

    // Pay the society what it is owed.
    const owed =
      screen.getByText('Who is owed').closest('div.rounded-2xl, [class*="card"]') ?? document.body;
    const payButtons = within(owed as HTMLElement).getAllByRole('button', { name: 'Pay' });
    await user.click(payButtons[1]!);
    const dialog = await screen.findByRole('dialog', { name: 'Pay what is owed' });
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(api.find('POST /funds/payouts')).toHaveLength(1));
    expect(api.find('POST /funds/payouts')[0]!.body).toMatchObject({
      payeeId: 'py1',
      amount: 43_750,
      fromUserId: null,
    });

    // Ledger: expand and reverse an entry.
    await user.click(screen.getByRole('button', { name: /Cones/ }));
    expect(screen.getByText('Cash with Ravi Kumar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reverse entry' }));
    const confirm = await screen.findByRole('dialog', { name: 'Reverse this entry?' });
    await user.type(within(confirm).getByRole('textbox'), 'Duplicate');
    await user.click(within(confirm).getByRole('button', { name: 'Reverse' }));
    await waitFor(() => expect(api.find('POST /funds/txns/t1/reverse')).toHaveLength(1));
  });

  it('warns admins when cash in hand is less than what is owed', async () => {
    mockApi({
      'GET /funds/overview': () => ({
        ...academy,
        balances: {
          ...academy.balances,
          academyCash: 20_000,
          withStaff: 10_000,
          academyFund: -55_000,
        },
      }),
      'GET /funds/txns': () => page([]),
      'GET /users': () => page([]),
    });
    await renderPage(<MoneyPage />, { path: '/money', route: '/money', user: adminUser });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Not enough cash to pay what’s owed');
    // ₹300 in hand vs ₹850 owed (₹412.50 staff + ₹437.50 payees) → short by ₹550.
    expect(alert).toHaveTextContent('short by ₹550');
    expect(within(alert).getByRole('button', { name: 'Add income' })).toBeInTheDocument();
  });

  it('pays from a coach’s cash when the academy has too little, never from a short wallet', async () => {
    const api = mockApi({
      'GET /funds/overview': () => ({
        ...academy,
        balances: { ...academy.balances, academyCash: 20_000 },
      }),
      'GET /funds/txns': () => page([]),
      'GET /users': () => page([]),
      'POST /funds/payouts': ({ body }) => ({
        status: 201,
        body: { data: txn({ type: 'payout', ...(body as object) }) },
      }),
    });
    const { user } = await renderPage(<MoneyPage />, {
      path: '/money',
      route: '/money',
      user: adminUser,
    });
    await screen.findByText('Who holds the cash');
    const owed =
      screen.getByText('Who is owed').closest('div.rounded-2xl, [class*="card"]') ?? document.body;
    await user.click(within(owed as HTMLElement).getAllByRole('button', { name: 'Pay' })[1]!);
    const dialog = await screen.findByRole('dialog', { name: 'Pay what is owed' });
    // ₹437.50 owed; the academy has ₹200, Ravi holds ₹1,250 → Ravi's cash is picked.
    expect(within(dialog).getByRole('radio', { name: /Academy cash/ })).toBeDisabled();
    expect(within(dialog).getByRole('radio', { name: /Academy cash/ })).toHaveTextContent(
      'not enough',
    );
    expect(within(dialog).getByRole('radio', { name: /Ravi Kumar’s cash/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(api.find('POST /funds/payouts')).toHaveLength(1));
    expect(api.find('POST /funds/payouts')[0]!.body).toMatchObject({
      payeeId: 'py1',
      amount: 43_750,
      fromUserId: 'coach-1',
    });
  });

  it('coach pays a payee of their batches from the cash they hold', async () => {
    const mine: MyFunds = {
      scope: 'self',
      from: '2026-01-01',
      to: '2026-01-15',
      cash: 125_000,
      due: 0,
      period: {
        collected: 0,
        earned: 0,
        earnedBy: [],
        kept: 0,
        handedOver: 0,
        spent: 0,
        paidToMe: 0,
      },
    };
    const api = mockApi({
      'GET /funds/overview': () => mine,
      'GET /funds/txns': () => page([]),
      'GET /funds/payable': () => ({
        cash: 125_000,
        payees: [
          { id: 'py1', name: 'Society', owed: 43_750 },
          { id: 'py2', name: 'Ground', owed: 0 },
        ],
      }),
      'POST /funds/payouts': ({ body }) => ({
        status: 201,
        body: { data: txn({ type: 'payout', ...(body as object) }) },
      }),
    });
    const { user } = await renderPage(<MoneyPage />, {
      path: '/money',
      route: '/money',
      user: coachUser,
    });
    await user.click(await screen.findByRole('button', { name: /Pay payee/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Pay what is owed' });
    expect(dialog).toHaveTextContent('Cash you hold₹1,250');
    const payTo = within(dialog).getByRole('combobox', { name: /Pay to/ });
    // Only payees that are owed something; the only one is picked with its full amount.
    expect(dialog).not.toHaveTextContent('Ground');
    await waitFor(() => expect(payTo).toHaveTextContent(/Society · ₹437.5/));
    expect(within(dialog).getByText(/^Up to ₹437\.5/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Record payment' }));
    await waitFor(() => expect(api.find('POST /funds/payouts')).toHaveLength(1));
    const body = api.find('POST /funds/payouts')[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({ payeeId: 'py1', amount: 43_750 });
    expect(body).not.toHaveProperty('fromUserId');
  });

  it('coach sees their cash, what they are owed, and can hand over or record a purchase', async () => {
    const mine: MyFunds = {
      scope: 'self',
      from: '2026-01-01',
      to: '2026-01-15',
      cash: 125_000,
      due: 5_000,
      period: {
        collected: 250_000,
        earned: 125_000,
        earnedBy: [{ label: 'Coach', amount: 125_000 }],
        kept: 125_000,
        handedOver: 0,
        spent: 0,
        paidToMe: 0,
      },
    };
    const api = mockApi({
      'GET /funds/overview': () => mine,
      'GET /funds/txns': () => page([]),
      'POST /funds/handovers': () => ({ status: 201, body: { data: txn({ type: 'handover' }) } }),
      'POST /funds/expenses': () => ({ status: 201, body: { data: txn({}) } }),
    });
    const { user } = await renderPage(<MoneyPage />, {
      path: '/money',
      route: '/money',
      user: coachUser,
    });
    expect(await screen.findByText('My money flow')).toBeInTheDocument();
    expect(screen.getByText('Belongs to the academy')).toBeInTheDocument();
    expect(await screen.findByText('No money movements in this period')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Hand over cash/ }));
    let dialog = await screen.findByRole('dialog', { name: 'Cash handed over' });
    expect(within(dialog).getByText('Up to ₹1,250')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Record handover' }));
    await waitFor(() => expect(api.find('POST /funds/handovers')).toHaveLength(1));
    expect(api.find('POST /funds/handovers')[0]!.body).toMatchObject({ amount: 125_000 });

    await user.click(screen.getByRole('button', { name: /Purchase/ }));
    dialog = await screen.findByRole('dialog', { name: 'Record a purchase' });
    await user.click(within(dialog).getByRole('button', { name: 'Record purchase' }));
    expect(api.find('POST /funds/expenses')).toHaveLength(0); // no amount yet
    await user.type(within(dialog).getByPlaceholderText('e.g. 10 footballs'), 'Football');
    await user.click(within(dialog).getByRole('radio', { name: 'My own money' }));
    await user.type(within(dialog).getByRole('textbox', { name: /Amount/ }), '800');
    await user.click(within(dialog).getByRole('button', { name: 'Record purchase' }));
    await waitFor(() => expect(api.find('POST /funds/expenses')).toHaveLength(1));
    expect(api.find('POST /funds/expenses')[0]!.body).toMatchObject({
      title: 'Football',
      paidFrom: 'own',
      amount: 80_000,
      category: 'equipment',
    });
  });
});
