/**
 * Code-split pages. Each route's code downloads on first visit; `preloadRoute` fetches it earlier
 * (when a link is hovered, touched or focused, and for the main tabs when the browser is idle) so
 * navigation feels instant on mobile networks.
 */
import { lazy, type ComponentType } from 'react';

const m0 = () => import('@/pages/auth/login');
const m1 = () => import('@/pages/auth/token-password');
const m2 = () => import('@/pages/public/register');
const m3 = () => import('@/pages/today');
const m4 = () => import('@/pages/attendance');
const m5 = () => import('@/pages/lessons');
const m6 = () => import('@/pages/feedback/board');
const m7 = () => import('@/pages/feedback/form');
const m8 = () => import('@/pages/students/list');
const m9 = () => import('@/pages/students/detail');
const m11 = () => import('@/pages/finance-hub');
const m12 = () => import('@/pages/batches');
const m13 = () => import('@/pages/admin/coaches');
const m14 = () => import('@/pages/admin/registrations');
const m15 = () => import('@/pages/coach-sessions');
const m16 = () => import('@/pages/admin/locations');
const m17 = () => import('@/pages/admin/fee-plans');
const m18 = () => import('@/pages/admin/settings');
const m19 = () => import('@/pages/activity');
const m20 = () => import('@/pages/account');
const m21 = () => import('@/pages/substitutions');
const m22 = () => import('@/pages/admin/people');
const m23 = () => import('@/pages/admin/payees');

const page = <T>(loader: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await loader())[name] as ComponentType }));

export const LoginPage = page(m0, 'LoginPage');
export const AcceptInvitePage = page(m1, 'AcceptInvitePage');
export const ResetPasswordPage = page(m1, 'ResetPasswordPage');
export const RegisterPage = page(m2, 'RegisterPage');
export const TodayPage = page(m3, 'TodayPage');
export const AttendancePage = page(m4, 'AttendancePage');
export const LessonPlansPage = page(m5, 'LessonPlansPage');
export const FeedbackPage = page(m6, 'FeedbackPage');
export const FeedbackFormPage = page(m7, 'FeedbackFormPage');
export const StudentsPage = page(m8, 'StudentsPage');
export const StudentDetailPage = page(m9, 'StudentDetailPage');
export const MakeupsPage = page(() => import('@/pages/admin/makeups'), 'MakeupsPage');
const calendarModule = () => import('@/pages/calendar');
export const CalendarPage = page(calendarModule, 'CalendarPage');
export const FinanceHubPage = page(m11, 'FinanceHubPage');
export const BatchesPage = page(m12, 'BatchesPage');
export const BatchDetailPage = page(m12, 'BatchDetailPage');
export const CoachesPage = page(m13, 'CoachesPage');
export const RegistrationsPage = page(m14, 'RegistrationsPage');
export const CoachSessionsPage = page(m15, 'CoachSessionsPage');
export const LocationsPage = page(m16, 'LocationsPage');
export const FeePlansPage = page(m17, 'FeePlansPage');
export const SettingsPage = page(m18, 'SettingsPage');
export const AuditLogPage = page(m19, 'AuditLogPage');
export const AccountPage = page(m20, 'AccountPage');
export const SubstitutionsPage = page(m21, 'SubstitutionsPage');
export const PeoplePage = page(m22, 'PeoplePage');
export const PayeesPage = page(m23, 'PayeesPage');
const skillsModule = () => import('@/pages/skills');
export const SkillsPage = page(skillsModule, 'SkillsPage');
const sportsModule = () => import('@/pages/admin/sports');
export const SportsPage = page(sportsModule, 'SportsPage');
const shareModule = () => import('@/pages/public/share');
export const ShareReportPage = page(shareModule, 'ShareReportPage');
export const ShareInvoicePage = page(shareModule, 'ShareInvoicePage');

const ROUTES: [pattern: RegExp, load: () => Promise<unknown>][] = [
  [/^\/$/, m3],
  [/^\/calendar$/, calendarModule],
  [/^\/attendance$/, m4],
  [/^\/lesson-plans$/, m5],
  [/^\/feedback$/, m6],
  [/^\/students$/, m8],
  [/^\/students\/[^/]+$/, m9],
  [/^\/finance$/, m11],
  [/^\/batches$/, m12],
  [/^\/batches\/[^/]+$/, m12],
  [/^\/coaches$/, m13],
  [/^\/registrations$/, m14],
  [/^\/coach-sessions$/, m15],
  [/^\/locations$/, m16],
  [/^\/fee-plans$/, m17],
  [/^\/settings$/, m18],
  [/^\/audit-log$/, m19],
  [/^\/account$/, m20],
  [/^\/skills$/, skillsModule],
  [/^\/sports$/, sportsModule],
];

const started = new Set<() => Promise<unknown>>();

/** Starts downloading the code for a path (e.g. "/students" or "/students/abc"). Safe to call often. */
export function preloadRoute(path: string) {
  const clean = path.split(/[?#]/)[0] || '/';
  const hit = ROUTES.find(([rx]) => rx.test(clean));
  if (!hit || started.has(hit[1])) return;
  started.add(hit[1]);
  hit[1]().catch(() => started.delete(hit[1])); // retry on the next intent if offline
}

/** Preloads several routes once the browser is idle (after the first screen has rendered). */
export function preloadWhenIdle(paths: string[]) {
  const run = () => paths.forEach(preloadRoute);
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}
