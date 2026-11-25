/**
 * Attendance, in two sections: taking the day's attendance, and the monthly register of every
 * batch (admins: all; coaches: their own). A batch's register has its own page
 * (/attendance/register/:batchId).
 */
import { ClipboardCheck, TableProperties } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common';
import { Segmented } from '@/components/ui/controls';
import { AttendanceDay } from './attendance-coach';
import { MonthlyRegisterPage } from './register';
import { RegisterTiles } from './register/tiles';

export function AttendancePage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'register' ? 'register' : 'day';
  return (
    <div className="space-y-1.5">
      <PageHeader
        className="mb-0.5 sm:mb-2"
        title="Attendance"
        description={
          tab === 'day'
            ? 'Tap P, A, L or E for each student. Every tap saves.'
            : 'Every batch’s month at a glance. Tap one for its register and insights.'
        }
      />
      <Segmented
        ariaLabel="Attendance section"
        className="w-full sm:w-auto"
        value={tab}
        // Each section keeps its own day or month, so switching starts clean.
        onChange={(v) => setParams(v === 'register' ? { tab: v } : {}, { replace: true })}
        options={[
          {
            value: 'day',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <ClipboardCheck className="size-4" /> Today
              </span>
            ),
          },
          {
            value: 'register',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <TableProperties className="size-4" /> Monthly register
              </span>
            ),
          },
        ]}
      />
      {tab === 'register' ? <RegisterTiles /> : <AttendanceDay />}
    </div>
  );
}

export function AttendanceRegisterPage() {
  return <MonthlyRegisterPage />;
}
