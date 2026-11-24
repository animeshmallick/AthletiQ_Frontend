import { within } from '@testing-library/react';
import { courseHint } from '@/lib/courses';
import { BatchDialog } from '@/pages/batches';
import { CourseSection, StudentCourseCard } from '@/pages/course-parts';
import { ShareCertificatePage } from '@/pages/public/share';
import { batch } from '../fixtures';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const round = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  roundNo: 1,
  status: 'active',
  startedOn: '2099-03-02',
  completedOn: null,
  historical: false,
  autoLeft: false,
  decidedAt: null,
  note: null,
  adjustments: [],
  attended: 8,
  target: 12,
  remaining: 4,
  month: 1,
  extension: false,
  perMonth: 12,
  ...over,
});

describe('course length in the batch form', () => {
  const lookups = {
    'GET /users': () => ({ data: [], meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 } }),
    'GET /locations': () => [],
    'GET /sports': () => [],
    'GET /fee-plans': () => [
      { id: 'p1', name: '6 days', daysPerWeek: 6, monthlyFee: 250_000, isActive: true },
    ],
  };

  it('explains the target and what a change means', () => {
    expect(courseHint(3, '3')).toBe('12 sessions a month · 36 in all');
    expect(courseHint(3, '')).toBe('12 sessions a month');
    expect(courseHint(3, '2', { courseMonths: null, memberCount: 5 })).toContain(
      'past attendance is counted',
    );
    expect(courseHint(3, '', { courseMonths: null, memberCount: 0 })).toContain('set it up later');
    expect(courseHint(3, '1', { courseMonths: 2, memberCount: 5 })).toContain('completes today');
    expect(courseHint(3, '2', { courseMonths: 2, memberCount: 5 })).toBe(
      '12 sessions a month · 24 in all',
    );
  });

  it('can be set on an existing batch, and not removed once set', async () => {
    const api = mockApi({ ...lookups, 'PATCH /batches/b1': () => batch });
    const { user } = await renderPage(
      <BatchDialog open onOpenChange={() => {}} batch={{ ...batch, courseMonths: 3 }} />,
      { user: adminUser },
    );
    const months = await screen.findByLabelText(/Course length/);
    expect(months).toHaveValue('3');
    await user.clear(months);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Choose the course length in months')).toBeInTheDocument();
    await user.type(months, '2');
    expect(screen.getByText(/anyone already past it completes today/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.find('PATCH /batches/b1')).toHaveLength(1));
    expect(api.find('PATCH /batches/b1')[0]!.body).toMatchObject({ courseMonths: 2 });
  });

  it('may stay empty on a batch without a course', async () => {
    const api = mockApi({ ...lookups, 'PATCH /batches/b1': () => batch });
    const { user } = await renderPage(<BatchDialog open onOpenChange={() => {}} batch={batch} />, {
      user: adminUser,
    });
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.find('PATCH /batches/b1')).toHaveLength(1));
    expect(api.find('PATCH /batches/b1')[0]!.body).not.toHaveProperty('courseMonths');
  });
});

describe('course on the batch page', () => {
  it('asks to set up a course when there is none', async () => {
    mockApi({});
    await renderPage(<CourseSection batch={batch} />, { user: adminUser });
    expect(await screen.findByText('No course set up yet.')).toBeInTheDocument();
  });

  it('shows progress and who is waiting for a decision', async () => {
    mockApi({
      'GET /courses/batches/b1': () => ({
        batch: { id: 'b1', name: 'Morning U-12', courseMonths: 1, courseSetOn: '2099-03-01' },
        sessionsPerMonth: 12,
        target: 12,
        students: [
          { student: { id: 's1', code: 'A1', fullName: 'Anya Rao' }, round: round(), ...round() },
          {
            student: { id: 's3', code: 'A3', fullName: 'Chirag' },
            round: round({ id: 'r3', roundNo: 2 }),
            ...round({ month: 2, extension: true, attended: 11 }),
          },
        ],
        awaiting: [
          {
            student: { id: 's2', code: 'A2', fullName: 'Bhavin Shah' },
            round: round({ id: 'r2', status: 'awaiting' }),
            ...round({ status: 'awaiting', remaining: null, month: null }),
          },
        ],
      }),
    });
    await renderPage(<CourseSection batch={{ ...batch, courseMonths: 1 }} />, { user: coachUser });
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.getByText('8 of 12')).toBeInTheDocument();
    expect(screen.getByText('Month 1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Extension month 1')).toBeInTheDocument();
    expect(screen.getByText('Round 2')).toBeInTheDocument();
    expect(screen.getByText('1 student completed the course')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Course decisions' })).toHaveAttribute(
      'href',
      '/courses',
    );
  });
});

describe('course on the student page', () => {
  it('lists rounds, certificates and (for admins) credit', async () => {
    const api = mockApi({
      'GET /courses/students/s1': () => ({
        rounds: [
          { ...round(), batch: { id: 'b1', name: 'Morning U-12', courseMonths: 1 } },
          {
            ...round({
              id: 'r0',
              status: 'readmitted',
              completedOn: '2099-02-27',
              attended: 12,
              remaining: null,
            }),
            batch: { id: 'b1', name: 'Morning U-12', courseMonths: 1 },
          },
          {
            ...round({
              id: 'rx',
              status: 'left',
              completedOn: '2099-01-10',
              attended: null,
              target: null,
            }),
            batch: { id: 'b2', name: 'Evening', courseMonths: 2 },
          },
        ],
        credits: [
          {
            id: 'cr1',
            studentId: 's1',
            kind: 'course_unused',
            amount: 229_167,
            status: 'assigned',
            enrollmentId: 'e1',
            roundId: 'r0',
            sourceInvoiceId: null,
            appliedInvoiceId: null,
            reason: 'Unused sessions',
            settledAt: null,
            note: null,
            createdAt: '2099-03-01T00:00:00Z',
          },
        ],
      }),
      'POST /courses/rounds/r0/certificate/share': () => ({
        url: 'https://app.example/share/certificate/r0?e=1&s=x',
        expiresAt: '2099-04-01T00:00:00Z',
        whatsapp: 'https://wa.me/91',
      }),
    });
    const { user } = await renderPage(
      <StudentCourseCard studentId="s1" studentName="Anya Rao" phone="+919876543210" isAdmin />,
      { user: adminUser },
    );
    expect(await screen.findByText('Completed · re-admitted')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Left mid-course')).toBeInTheDocument();
    expect(screen.getByText('Off next invoice')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Share/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Share the certificate' });
    expect(within(dialog).getByRole('textbox', { name: 'Link' })).toHaveValue(
      'https://app.example/share/certificate/r0?e=1&s=x',
    );
    expect(api.find('POST /courses/rounds/r0/certificate/share')).toHaveLength(1);
  });

  it('shows nothing for a student who never had a course', async () => {
    mockApi({ 'GET /courses/students/s1': () => ({ rounds: [], credits: null }) });
    const { container } = await renderPage(
      <StudentCourseCard studentId="s1" studentName="Anya" isAdmin={false} />,
      { user: coachUser },
    );
    await waitFor(() => expect(container.querySelector('[aria-label="Course"]')).toBeNull());
  });
});

describe('certificate share page', () => {
  it('opens the certificate behind the registration number', async () => {
    mockApi({
      'GET /public/certificates/r1': () => ({
        kind: 'certificate',
        academy: 'Test Academy',
        title: 'Course certificate',
        student: 'Anya',
        expiresAt: '2099-04-01T00:00:00Z',
      }),
    });
    await renderPage(<ShareCertificatePage />, {
      path: '/share/certificate/:id',
      route: '/share/certificate/r1?e=1&s=x',
    });
    expect(await screen.findByText('Course certificate')).toBeInTheDocument();
    expect(screen.getByText('For Anya')).toBeInTheDocument();
  });
});
