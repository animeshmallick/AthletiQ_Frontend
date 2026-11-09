import { within } from '@testing-library/react';
import { SportsPage } from '@/pages/admin/sports';
import { ShareReportPage } from '@/pages/public/share';
import { SkillsPage } from '@/pages/skills';
import { StudentDetailPage } from '@/pages/students/detail';
import { batch, studentDetail } from '../fixtures';
import { adminUser, coachUser, mockApi, renderPage, screen, waitFor } from '../utils';

const framework = {
  sport: { id: 'sp1', name: 'Badminton', isActive: true },
  areas: [
    {
      id: 'a1',
      name: 'Footwork',
      position: 1,
      isActive: true,
      skills: [
        { id: 'k1', name: 'Split step', description: null, position: 1, isActive: true },
        { id: 'k2', name: 'Recovery', description: null, position: 2, isActive: true },
      ],
    },
  ],
  levels: [
    { id: 'l1', name: 'Foundation', minScore: 100, position: 1 },
    { id: 'l2', name: 'Bronze', minScore: 250, position: 2 },
  ],
};
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const sheet = (over: Record<string, unknown> = {}) => ({
  batch: { id: 'b1', name: 'Morning U-12', coachId: 'coach-1' },
  month: thisMonth(),
  editable: true,
  framework,
  students: [
    {
      id: 's1',
      fullName: 'Anya Rao',
      code: 'ATQ-0001',
      hasPhoto: false,
      current: null,
      previous: {
        id: 'p',
        month: '2026-01-01',
        average: 200,
        levelName: 'Foundation',
        comment: null,
        goals: null,
        updatedAt: '2026-01-20T00:00:00Z',
        ratings: { k1: 2, k2: 2 },
      },
    },
    {
      id: 's2',
      fullName: 'Ben Das',
      code: 'ATQ-0002',
      hasPhoto: false,
      current: null,
      previous: null,
    },
  ],
  ...over,
});

describe('Skills page', () => {
  it('lets the coach rate every skill, then moves to the next student', async () => {
    const api = mockApi({
      'GET /batches': () => [batch],
      'GET /skills/batches/b1': () => sheet(),
      'PUT /skills/assessments': ({ body }) => ({ id: 'x', ...(body as object), average: 400 }),
    });
    const { user } = await renderPage(<SkillsPage />, {
      path: '/skills',
      route: '/skills',
      user: coachUser,
    });
    expect(await screen.findByText(/0 of 2 assessed/)).toBeInTheDocument();
    expect(screen.getByText(/Last: 2.0/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Anya Rao/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Anya Rao' });
    // Saving needs every skill.
    await user.click(within(dialog).getByRole('button', { name: 'Save & next' }));
    expect(api.find('PUT /skills/assessments')).toHaveLength(0);
    await user.click(
      within(within(dialog).getByRole('radiogroup', { name: 'Split step' })).getByRole('radio', {
        name: /^4/,
      }),
    );
    await user.click(
      within(within(dialog).getByRole('radiogroup', { name: 'Recovery' })).getByRole('radio', {
        name: /^4/,
      }),
    );
    expect(dialog).toHaveTextContent('Average 4.0');
    await user.type(
      within(dialog).getByRole('textbox', { name: /how it is going/i }),
      'Great progress',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save & next' }));
    await waitFor(() => expect(api.find('PUT /skills/assessments')).toHaveLength(1));
    expect(api.find('PUT /skills/assessments')[0]!.body).toEqual({
      batchId: 'b1',
      studentId: 's1',
      ratings: [
        { skillId: 'k1', rating: 4 },
        { skillId: 'k2', rating: 4 },
      ],
      comment: 'Great progress',
      goals: null,
    });
    expect(await screen.findByRole('dialog', { name: 'Ben Das' })).toBeInTheDocument();
  });

  it('shows admins the insights first, and sheets read-only', async () => {
    mockApi({
      'GET /batches': () => [batch],
      'GET /skills/insights': () => ({
        month: thisMonth(),
        totals: {
          students: 2,
          assessed: 1,
          coverage: 50,
          average: 350,
          improved: 1,
          declined: 0,
          promoted: 1,
          demoted: 0,
        },
        coverage: [
          {
            batchId: 'b1',
            batchName: 'Morning U-12',
            sportName: 'Badminton',
            coachId: 'coach-1',
            coachName: 'Ravi Kumar',
            students: 2,
            assessed: 1,
            pending: [{ id: 's2', fullName: 'Ben Das' }],
          },
        ],
        heatmap: [
          {
            batchId: 'b1',
            batchName: 'Morning U-12',
            sportName: 'Badminton',
            assessed: 1,
            areas: [{ areaId: 'a1', name: 'Footwork', average: 350 }],
          },
        ],
        improved: [
          {
            studentId: 's1',
            fullName: 'Anya Rao',
            batchName: 'Morning U-12',
            average: 350,
            change: 150,
            levelName: 'Bronze',
            levelChange: 1,
          },
        ],
        atRisk: [],
        stale: [],
        staleCount: 0,
        levels: [
          {
            sportId: 'sp1',
            sportName: 'Badminton',
            levels: [
              { name: 'Foundation', n: 0 },
              { name: 'Bronze', n: 1 },
            ],
            unranked: 0,
            promoted: 1,
            demoted: 0,
          },
        ],
        strongest: [{ skillId: 'k1', name: 'Split step', area: 'Footwork', average: 400, n: 1 }],
        weakest: [{ skillId: 'k2', name: 'Recovery', area: 'Footwork', average: 300, n: 1 }],
        trend: [{ month: thisMonth(), assessed: 1, average: 350 }],
        coaches: [
          { coachId: 'coach-1', name: 'Ravi Kumar', students: 2, assessed: 1, averageGiven: 350 },
        ],
      }),
      'GET /skills/batches/b1': () => sheet({ editable: false }),
    });
    const { user } = await renderPage(<SkillsPage />, {
      path: '/skills',
      route: '/skills',
      user: adminUser,
    });
    expect(await screen.findByText('50% coverage')).toBeInTheDocument();
    expect(screen.getByText('Pending: Ben Das')).toBeInTheDocument();
    expect(screen.getByText('Batch skill map')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Anya Rao/ })).toHaveAttribute('href', '/students/s1');
    await user.click(screen.getByRole('radio', { name: /Batches/ }));
    await user.click(await screen.findByRole('button', { name: /Anya Rao/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Anya Rao' });
    expect(within(dialog).queryByRole('button', { name: /Save/ })).toBeNull();
    expect(dialog).toHaveTextContent('Only the batch’s coach can rate');
  });
});

describe('Sports & skills', () => {
  it('edits areas, skills and levels and saves the framework', async () => {
    const api = mockApi({
      'GET /sports': () => [{ ...framework, batches: 1 }],
      'PUT /sports/sp1/framework': ({ body }) => ({ ...framework, ...(body as object) }),
    });
    const { user } = await renderPage(<SportsPage />, {
      path: '/sports',
      route: '/sports',
      user: adminUser,
    });
    expect(await screen.findByDisplayValue('Footwork')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add skill' }));
    const names = screen.getAllByRole('textbox', { name: 'Skill name' });
    await user.type(names.at(-1)!, 'Lunges');
    await user.click(screen.getAllByRole('button', { name: /^Save/ })[0]!);
    await waitFor(() => expect(api.find('PUT /sports/sp1/framework')).toHaveLength(1));
    expect(api.find('PUT /sports/sp1/framework')[0]!.body).toEqual({
      areas: [
        {
          id: 'a1',
          name: 'Footwork',
          skills: [
            { id: 'k1', name: 'Split step', description: null },
            { id: 'k2', name: 'Recovery', description: null },
            { id: undefined, name: 'Lunges', description: null },
          ],
        },
      ],
      levels: [
        { name: 'Foundation', minScore: 100 },
        { name: 'Bronze', minScore: 250 },
      ],
    });
  });
});

describe('Shared report page', () => {
  it('asks for the registration number before opening the report', async () => {
    const api = mockApi({
      'GET /public/reports/tok-123456789012345678901': () => ({
        kind: 'report',
        academy: 'Smash Academy',
        title: 'Progress report',
        student: 'Anya',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
      'POST /public/reports/tok-123456789012345678901/pdf': ({ body }) =>
        (body as { registrationNo: string }).registrationNo === '1001'
          ? { status: 200, body: { pdf: true } }
          : {
              status: 403,
              body: {
                error: {
                  code: 'FORBIDDEN',
                  message: "That registration number doesn't match. 4 tries left.",
                },
              },
            },
    });
    const { user } = await renderPage(<ShareReportPage />, {
      path: '/share/report/:token',
      route: '/share/report/tok-123456789012345678901',
    });
    expect(await screen.findByText('For Anya')).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: /registration number/i });
    await user.type(input, '9999');
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('4 tries left');
    await user.clear(input);
    await user.type(input, '10a01');
    expect(input).toHaveValue('1001'); // digits only
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('button', { name: /Download/ })).toBeInTheDocument();
    expect(api.find('POST /public/reports/tok-123456789012345678901/pdf')).toHaveLength(2);
  });

  it('explains an expired link', async () => {
    mockApi({
      'GET /public/reports/tok-expired-0000000000000000': () => ({
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'This link is invalid or has expired.' } },
      }),
    });
    await renderPage(<ShareReportPage />, {
      path: '/share/report/:token',
      route: '/share/report/tok-expired-0000000000000000',
    });
    expect(await screen.findByText('Link not available')).toBeInTheDocument();
  });
});

describe('Student profile', () => {
  it('shows the registration number and the progress tab', async () => {
    mockApi({
      'GET /students/s1': () => studentDetail,
      'GET /skills/students/s1': () => [
        {
          framework,
          assessments: [
            {
              id: 'x',
              month: '2026-02-01',
              average: 300,
              levelName: 'Bronze',
              levelPosition: 2,
              comment: 'Good',
              goals: 'Lunges',
              batchId: 'b1',
              batchName: 'Morning U-12',
              coachName: 'Ravi Kumar',
              updatedAt: '2026-02-20T00:00:00Z',
              ratings: { k1: 3, k2: 3 },
            },
          ],
          current: {
            month: '2026-02-01',
            average: 300,
            levelName: 'Bronze',
            levelPosition: 2,
            change: null,
          },
          areas: [{ id: 'a1', name: 'Footwork', now: 300, before: null }],
        },
      ],
    });
    const { user } = await renderPage(<StudentDetailPage />, {
      path: '/students/:id',
      route: '/students/s1',
      user: coachUser,
    });
    expect(await screen.findByText('1001')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Progress' }));
    expect(await screen.findByText('Coach remarks')).toBeInTheDocument();
    expect(screen.getByText('Bronze')).toBeInTheDocument();
    expect(screen.getByText(/Goals:/)).toBeInTheDocument();
  });
});
