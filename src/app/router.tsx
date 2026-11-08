import { Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import type { Role } from '@/lib/types';
import { useAuth } from './auth';
import { AppLayout, PageFallback } from './layout';
import {
  LoginPage,
  AcceptInvitePage,
  ResetPasswordPage,
  RegisterPage,
  TodayPage,
  AttendancePage,
  LessonPlansPage,
  FeedbackPage,
  FeedbackFormPage,
  StudentsPage,
  StudentDetailPage,
  InvoicesPage,
  FinancePage,
  BatchesPage,
  BatchDetailPage,
  CoachesPage,
  RegistrationsPage,
  CoachSessionsPage,
  LocationsPage,
  FeePlansPage,
  SettingsPage,
  AuditLogPage,
  AccountPage,
} from './pages';

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy aria-label="Loading">
      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

/** Signed-in area. Unauthenticated users are sent to /login and returned afterwards. */
function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <AppLayout />;
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== role) return <Navigate to="/" replace />;
  return children;
}

/** Login & token pages: already signed-in users go to the app. */
function GuestOnly() {
  const { status } = useAuth();
  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Outlet />
    </Suspense>
  );
}

function RouteError() {
  const error = useRouteError() as { status?: number } | undefined;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl font-semibold text-primary">
        {error?.status === 404 ? '404' : 'Oops'}
      </p>
      <h1 className="text-xl font-semibold">
        {error?.status === 404 ? 'Page not found' : 'Something went wrong'}
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error?.status === 404
          ? 'The page you are looking for does not exist.'
          : 'An unexpected error occurred. Reloading usually fixes it.'}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button onClick={() => (window.location.href = '/')}>Go home</Button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Button asChild variant="outline">
        <a href="/">Back to today</a>
      </Button>
    </div>
  );
}

const admin = (el: ReactNode) => <RequireRole role="admin">{el}</RequireRole>;

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/accept-invite', element: <AcceptInvitePage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
        ],
      },
      {
        path: '/register',
        element: (
          <Suspense fallback={<FullScreenLoader />}>
            <RegisterPage />
          </Suspense>
        ),
      },
      {
        element: <RequireAuth />,
        children: [
          { index: true, element: <TodayPage /> },
          { path: 'attendance', element: <AttendancePage /> },
          { path: 'lesson-plans', element: <LessonPlansPage /> },
          { path: 'feedback', element: <FeedbackPage /> },
          { path: 'feedback/:studentId/:weekStart', element: <FeedbackFormPage /> },
          { path: 'students', element: <StudentsPage /> },
          { path: 'students/:id', element: <StudentDetailPage /> },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'finance', element: <FinancePage /> },
          { path: 'batches', element: <BatchesPage /> },
          { path: 'batches/:id', element: <BatchDetailPage /> },
          { path: 'coach-sessions', element: <CoachSessionsPage /> },
          { path: 'account', element: <AccountPage /> },
          { path: 'coaches', element: admin(<CoachesPage />) },
          { path: 'registrations', element: admin(<RegistrationsPage />) },
          { path: 'locations', element: admin(<LocationsPage />) },
          { path: 'fee-plans', element: admin(<FeePlansPage />) },
          { path: 'settings', element: admin(<SettingsPage />) },
          { path: 'audit-log', element: admin(<AuditLogPage />) },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);

export { PageFallback };
