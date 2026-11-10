import { StudentsPage } from '@/pages/students/list';
import { batch, studentListItem } from '../fixtures';
import { adminUser, mockApi, renderPage, screen, waitFor } from '../utils';

const evening = {
  ...batch,
  id: 'b2',
  name: 'Evening Free',
  location: { ...batch.location, id: 'l2', name: 'Lake Club' },
  feePlan: { ...batch.feePlan, id: 'free', name: 'Free', monthlyFee: 0 },
};
const inBoth = {
  ...studentListItem,
  id: 's2',
  fullName: 'Bhavin Shah',
  overdue: 0,
  outstanding: 0,
  attendanceRate: 50,
  batches: [
    studentListItem.batches[0]!,
    { ...studentListItem.batches[0]!, id: 'b2', name: 'Evening Free', fee: 0 },
  ],
};
const anya = { ...studentListItem, attendanceRate: 90 };

describe('Students grouped', () => {
  it('opens grouped by batch, shows two-batch students in each group, and loads everyone', async () => {
    const api = mockApi({
      'GET /batches': () => [batch, evening],
      'GET /students': () => ({
        data: [anya, inBoth],
        meta: { page: 1, pageSize: 500, total: 2, totalPages: 1 },
      }),
    });
    const { user } = await renderPage(<StudentsPage />, {
      path: '/students',
      route: '/students',
      user: adminUser,
    });
    const morning = (await screen.findByText('Morning U-12', { selector: 'span' })).closest(
      'button',
    )!;
    // Header: students, sport · place, dues and average attendance.
    expect(morning).toHaveTextContent('2 students');
    expect(morning).toHaveTextContent('Badminton');
    expect(morning).toHaveTextContent('Overdue ₹2,500');
    expect(morning).toHaveTextContent('70%');
    // The first group is open; Bhavin is in both batches, so also under Evening Free.
    const eveningHeader = screen.getByText('Evening Free', { selector: 'span' }).closest('button')!;
    expect(eveningHeader).toHaveTextContent('1 student');
    expect(eveningHeader).toHaveTextContent('All paid');
    expect(api.find('GET /students')[0]!.query.get('pageSize')).toBe('500');

    // By location: Lake Club holds only Bhavin.
    await user.click(screen.getByRole('radio', { name: 'By location' }));
    const lake = (await screen.findByText('Lake Club', { selector: 'span' })).closest('button')!;
    expect(lake).toHaveTextContent('1 student');
    await user.click(lake);
    expect((await screen.findAllByText('Bhavin Shah'))[0]).toBeVisible();
    expect(screen.queryByText('Anya Rao')).not.toBeInTheDocument();

    // The plain list pages again.
    await user.click(screen.getByRole('radio', { name: 'All students' }));
    await waitFor(() => expect(api.find('GET /students').at(-1)!.query.get('pageSize')).toBe('25'));
  });
});
