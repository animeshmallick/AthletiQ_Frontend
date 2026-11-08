import { screen, waitFor, within } from '@testing-library/react';
import { FeePlansPage } from '@/pages/admin/fee-plans';
import { LocationsPage } from '@/pages/admin/locations';
import { adminUser, mockApi, renderPage } from '../utils';

const plan = (over: Record<string, unknown>) => ({
  id: 'p',
  name: 'Plan',
  daysPerWeek: 3,
  monthlyFee: 260_000,
  isActive: true,
  description: null,
  activeStudents: 0,
  ...over,
});

/** The value above a summary-strip label. */
const stat = (label: string) =>
  screen.getByText(label, { selector: 'p[class*="text-[10px]"]' }).previousElementSibling;

describe('FeePlansPage summary and cards', () => {
  it('summarises active plans and hides retired ones until asked', async () => {
    mockApi({
      'GET /fee-plans': () => [
        plan({ id: 'p1', name: '3 days', activeStudents: 3, description: 'Weekday evenings' }),
        plan({ id: 'p2', name: '5 days', daysPerWeek: 5, monthlyFee: 400_000, activeStudents: 1 }),
        plan({ id: 'p3', name: 'Old plan', daysPerWeek: 1, isActive: false, activeStudents: 0 }),
      ],
    });
    const { user } = await renderPage(<FeePlansPage />, {
      path: '/fee-plans',
      route: '/fee-plans',
      user: adminUser,
    });
    expect(await screen.findByText('3 days')).toBeInTheDocument();
    expect(stat('Active plans')).toHaveTextContent('2');
    expect(stat('Students')).toHaveTextContent('4');
    // 3 × ₹2,600 + 1 × ₹4,000 = ₹11,800 a month; average ₹2,950.
    expect(stat('Per month')).toHaveTextContent('₹11.8K');
    // ₹2,600 / (3 × 52/12) ≈ ₹200 a session, in whole rupees.
    expect(screen.getByText(/≈ ₹200\/session/)).toBeInTheDocument();
    expect(screen.getByText('Weekday evenings')).toBeInTheDocument();
    expect(screen.queryByText('Old plan')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch'));
    expect(await screen.findByText('Old plan')).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
    expect(screen.getByText('day/wk')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit 5 days' }));
    expect(await screen.findByRole('dialog', { name: 'Edit fee plan' })).toBeInTheDocument();
  });

  it('says when every plan is retired', async () => {
    mockApi({ 'GET /fee-plans': () => [plan({ id: 'p9', isActive: false })] });
    await renderPage(<FeePlansPage />, {
      path: '/fee-plans',
      route: '/fee-plans',
      user: adminUser,
    });
    expect(await screen.findByText('No active plans')).toBeInTheDocument();
    expect(stat('Avg fee')).toHaveTextContent('—');
  });
});

describe('LocationsPage summary and cards', () => {
  const loc = (over: Record<string, unknown>) => ({
    id: 'l',
    name: 'Ground',
    address: null,
    latitude: 12.97,
    longitude: 77.59,
    radiusMeters: 200,
    isActive: true,
    activeBatches: 0,
    ...over,
  });

  it('shows counts, directions, search and inactive locations', async () => {
    mockApi({
      'GET /locations': () => [
        loc({ id: 'l1', name: 'North Ground', address: '12 Lake Road', activeBatches: 2 }),
        loc({ id: 'l2', name: 'South Court', radiusMeters: 100 }),
        loc({ id: 'l3', name: 'East Field', activeBatches: 1 }),
        loc({ id: 'l4', name: 'West Turf', activeBatches: 1 }),
        loc({ id: 'l5', name: 'Closed Pool', isActive: false }),
      ],
    });
    const { user } = await renderPage(<LocationsPage />, {
      path: '/locations',
      route: '/locations',
      user: adminUser,
    });
    expect(await screen.findByText('North Ground')).toBeInTheDocument();
    expect(stat('Locations')).toHaveTextContent('4');
    expect(stat('Batches')).toHaveTextContent('4');
    expect(stat('Unused')).toHaveTextContent('1');
    expect(stat('Avg radius')).toHaveTextContent('175 m');
    expect(screen.getAllByText('No address added').length).toBe(3);
    const north = screen.getByText('North Ground').closest('div.relative') as HTMLElement;
    expect(within(north).getByText('2 batches')).toBeInTheDocument();
    expect(within(north).getByRole('link', { name: /directions/i })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=12.97,77.59',
    );

    await user.type(screen.getByPlaceholderText('Search name or address'), 'lake');
    await waitFor(() => expect(screen.queryByText('South Court')).not.toBeInTheDocument());
    expect(screen.getByText('North Ground')).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText('Search name or address'));
    await user.type(screen.getByPlaceholderText('Search name or address'), 'zzz');
    expect(await screen.findByText('No locations match')).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText('Search name or address'));

    expect(screen.queryByText('Closed Pool')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch'));
    expect(await screen.findByText('Closed Pool')).toBeInTheDocument();
    expect(screen.getByText('Inactive', { selector: 'span, div' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit South Court' }));
    expect(await screen.findByRole('dialog', { name: 'Edit location' })).toBeInTheDocument();
  });
});
