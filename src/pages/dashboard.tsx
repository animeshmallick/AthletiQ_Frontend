/**
 * Dashboard: Today and the Calendar on one screen, as two tabs (?tab=calendar). Each tab keeps
 * its own URL filters; switching starts the other one clean.
 */
import { CalendarDays, Home } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { ListSkeleton } from '@/components/common';
import { Segmented } from '@/components/ui/controls';

const TodayPage = lazy(() => import('./today').then((m) => ({ default: m.TodayPage })));
const CalendarPage = lazy(() => import('./calendar').then((m) => ({ default: m.CalendarPage })));

type Tab = 'today' | 'calendar';

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'calendar' ? 'calendar' : 'today';
  return (
    <div>
      <Segmented
        ariaLabel="Dashboard view"
        className="mb-2 w-full sm:w-auto"
        value={tab}
        onChange={(v) => setParams(v === 'calendar' ? { tab: 'calendar' } : {}, { replace: true })}
        options={[
          {
            value: 'today',
            className: 'flex-1 sm:flex-none',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Home className="size-4" /> Today
              </span>
            ),
          },
          {
            value: 'calendar',
            className: 'flex-1 sm:flex-none',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" /> Calendar
              </span>
            ),
          },
        ]}
      />
      <Suspense fallback={<ListSkeleton rows={4} />}>
        {tab === 'calendar' ? <CalendarPage /> : <TodayPage />}
      </Suspense>
    </div>
  );
}
