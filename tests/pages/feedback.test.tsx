import { FeedbackPage } from '@/pages/feedback/board';
import { FeedbackFormPage } from '@/pages/feedback/form';
import { template } from '../fixtures';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor, chooseOption } from '../utils';

const report = (overrides: Record<string, unknown> = {}) => ({
  student: { id: 's1', code: 'ATQ-0001', fullName: 'Anya Rao' },
  weekStart: '2026-03-09',
  weekEnd: '2026-03-15',
  template,
  feedback: null,
  attendance: { scheduled: 3, present: 2, late: 0, absent: 1, excused: 0, unmarked: 0 },
  editable: true,
  ...overrides,
});

describe('FeedbackFormPage', () => {
  const path = '/feedback/:studentId/:weekStart';
  const route = '/feedback/s1/2026-03-09';

  it('validates required fields, then sends the report', async () => {
    const api = mockApi({
      'GET /feedback/students/s1/weeks/2026-03-09': () => report(),
      'PUT /feedback/students/s1/weeks/2026-03-09': () => ({ id: 'f1', status: 'submitted' }),
    });
    const { user, router } = await renderPage(<FeedbackFormPage />, {
      path,
      route,
      user: coachUser,
    });

    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    // Attendance is filled in automatically: 2 of 3 sessions attended.
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /send report/i }));
    expect(await screen.findAllByText('Required')).toHaveLength(3);
    expect(api.find('PUT /feedback/students/s1/weeks/2026-03-09')).toHaveLength(0);

    await user.click(screen.getByRole('radio', { name: '5' }));
    expect(screen.getByText('Excellent')).toBeInTheDocument();
    await chooseOption(user, screen.getByRole('combobox'), 'improving');
    await user.type(screen.getAllByRole('textbox')[0]!, 'Great footwork');
    await user.type(screen.getAllByRole('textbox')[1]!, 'Calm');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('switch', { name: 'Injury concern?' }));
    await user.click(screen.getByRole('button', { name: /send report/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/feedback'));
    expect(api.find('PUT /feedback/students/s1/weeks/2026-03-09')[0]!.body).toEqual({
      answers: {
        technique: 5,
        overall: 'improving',
        highlights: 'Great footwork',
        note: 'Calm',
        tags: ['focus'],
        injury: true,
      },
      submit: true,
    });
  });

  it('saves drafts without validation', async () => {
    const api = mockApi({
      'GET /feedback/students/s1/weeks/2026-03-09': () =>
        report({ feedback: { id: 'f1', status: 'draft', answers: { technique: 3 } } }),
      'PUT /feedback/students/s1/weeks/2026-03-09': () => ({ id: 'f1', status: 'draft' }),
    });
    const { user } = await renderPage(<FeedbackFormPage />, { path, route, user: coachUser });
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() =>
      expect(api.find('PUT /feedback/students/s1/weeks/2026-03-09')).toHaveLength(1),
    );
    expect(api.find('PUT /feedback/students/s1/weeks/2026-03-09')[0]!.body).toEqual({
      answers: { technique: 3 },
      submit: false,
    });
  });

  it('is read-only for admins and locked reports', async () => {
    mockApi({ 'GET /feedback/students/s1/weeks/2026-03-09': () => report() });
    await renderPage(<FeedbackFormPage />, { path, route, user: adminUser });
    expect(await screen.findByText(/written by the student’s coach/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send report/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: '1' })[0]).toBeDisabled();
  });

  it('maps server field errors', async () => {
    mockApi({
      'GET /feedback/students/s1/weeks/2026-03-09': () =>
        report({
          feedback: {
            id: 'f1',
            status: 'submitted',
            submittedAt: '2026-03-15T10:00:00Z',
            answers: { technique: 4, overall: 'improving', highlights: 'x' },
          },
        }),
      'PUT /feedback/students/s1/weeks/2026-03-09': () => ({
        status: 400,
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Some fields are invalid',
            details: { fields: [{ path: 'highlights', message: 'Too short' }] },
          },
        },
      }),
    });
    const { user } = await renderPage(<FeedbackFormPage />, { path, route, user: coachUser });
    await user.click(await screen.findByRole('button', { name: /update report/i }));
    expect(await screen.findByText('Too short')).toBeInTheDocument();
  });
});

describe('FeedbackPage (week board)', () => {
  it('groups students by batch and filters by status', async () => {
    mockApi({
      'GET /feedback/week': () => ({
        weekStart: '2026-03-09',
        weekEnd: '2026-03-15',
        students: [
          {
            studentId: 's1',
            code: 'ATQ-0001',
            fullName: 'Anya Rao',
            batchId: 'b1',
            batchName: 'Morning U-12',
            coachId: 'c',
            feedbackId: null,
            status: 'pending',
            submittedAt: null,
            writtenBy: null,
          },
          {
            studentId: 's2',
            code: 'ATQ-0002',
            fullName: 'Bhavin Shah',
            batchId: 'b1',
            batchName: 'Morning U-12',
            coachId: 'c',
            feedbackId: 'f',
            status: 'submitted',
            submittedAt: '2026-03-14T10:00:00Z',
            writtenBy: 'Ravi',
          },
        ],
        summary: { total: 2, submitted: 1, draft: 0, pending: 1 },
      }),
    });
    const { user } = await renderPage(<FeedbackPage />, {
      path: '/feedback',
      route: '/feedback?week=2026-03-09',
      user: coachUser,
    });
    expect(await screen.findByText('Anya Rao')).toBeInTheDocument();
    expect(screen.queryByText('Bhavin Shah')).not.toBeInTheDocument();
    expect(screen.getAllByText(/2 sent/)[0]).toHaveTextContent('1/2 sent');
    await user.click(screen.getByRole('radio', { name: /sent/i }));
    expect(await screen.findByText('Bhavin Shah')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bhavin Shah/ })).toHaveAttribute(
      'href',
      '/feedback/s2/2026-03-09',
    );
  });
});
