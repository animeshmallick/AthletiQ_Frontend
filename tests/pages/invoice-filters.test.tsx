import { InvoicesPage } from '@/pages/invoices';
import { StudentsPage } from '@/pages/students/list';
import { batch, studentListItem } from '../fixtures';
import { adminUser, chooseOption, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const empty = () => ({
  data: [],
  meta: { page: 1, pageSize: 25, total: 0, totalPages: 1, totalAmount: 0 },
});
const lookups = {
  'GET /invoices': empty,
  'GET /students': () => ({
    data: [studentListItem, { ...studentListItem, id: 's2', fullName: 'Kabir Shah' }],
    meta: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
  }),
  'GET /batches': () => [batch, { ...batch, id: 'b2', name: 'TT · G5+ · SSN' }],
  'GET /sports': () => [],
  'GET /locations': () => [],
  'GET /fee-plans': () => [],
  'GET /users': () => ({
    data: [{ id: 'coach-1', name: 'Ravi Kumar', role: 'coach' }],
    meta: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
  }),
};

describe('Finance → Invoices filters and sorting', () => {
  it('puts status, sort and every filter in one smart filter, with removable chips', async () => {
    const api = mockApi(lookups);
    const { user, router } = await renderPage(<InvoicesPage embedded />, {
      path: '/finance',
      route: '/finance',
      user: adminUser,
    });
    const last = () => api.find('GET /invoices').at(-1)!.query;
    await waitFor(() => expect(last().get('status')).toBe('open'));
    // Only search and one filter button on the bar; the status shows as a chip.
    expect(screen.getByPlaceholderText('Invoice no. or student…')).toBeInTheDocument();
    expect(screen.getByLabelText('Applied filters')).toHaveTextContent('Unpaid');

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(await screen.findByRole('radio', { name: 'All' }));
    await waitFor(() => expect(last().get('status')).toBeNull());
    await chooseOption(user, screen.getByLabelText('Sort invoices'), 'amountDesc');
    await chooseOption(user, screen.getByLabelText('Filter by student'), 's2');
    await chooseOption(user, screen.getByLabelText('Filter by batch'), 'b2');
    await chooseOption(user, screen.getByLabelText('Filter by days overdue'), '31-60');
    await user.type(screen.getByLabelText('Minimum amount'), '1500');
    await waitFor(() =>
      expect(Object.fromEntries(last())).toMatchObject({
        studentId: 's2',
        batchId: 'b2',
        overdueBy: '31-60',
        amountMin: '150000', // rupees → paise
        sort: 'amountDesc',
      }),
    );
    // Status, sort and four filters are on.
    expect(screen.getByRole('button', { name: 'Filters (6 on)' })).toBeInTheDocument();
    const chips = screen.getByLabelText('Applied filters');
    for (const t of [
      'All',
      'Amount · high to low',
      'Kabir Shah',
      'TT · G5+ · SSN',
      'Overdue 31–60 days',
      '₹1,500 or more',
    ])
      expect(chips).toHaveTextContent(t);

    // One tap removes a chip.
    await user.click(screen.getByRole('button', { name: 'Remove filter: Kabir Shah' }));
    expect(router.state.location.search).not.toContain('student=');
    // Clear all goes back to the default (unpaid, due first), keeping nothing else.
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(router.state.location.search).toBe('');
  });

  it('defaults unpaid lists to what’s due first, and hides the coach filter from coaches', async () => {
    const api = mockApi(lookups);
    const { user } = await renderPage(<InvoicesPage embedded />, {
      path: '/finance',
      route: '/finance',
      user: coachUser,
    });
    await waitFor(() =>
      expect(api.find('GET /invoices').at(-1)!.query.get('sort')).toBe('dueDateAsc'),
    );
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(await screen.findByLabelText('Filter by batch')).toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by coach')).not.toBeInTheDocument();
    expect(api.find('GET /users')).toHaveLength(0);
  });
});

describe('Students → exclude free students', () => {
  it('sends the paying filter without switching to the dues sort', async () => {
    const api = mockApi(lookups);
    const { user } = await renderPage(<StudentsPage />, {
      path: '/students',
      route: '/students?group=none',
      user: adminUser,
    });
    await screen.findAllByText('Anya Rao');
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await chooseOption(user, await screen.findByLabelText('Filter by fees'), 'paying');
    await waitFor(() => expect(api.find('GET /students').at(-1)!.query.get('dues')).toBe('paying'));
    expect(api.find('GET /students').at(-1)!.query.get('sort')).toBeNull();
  });
});
