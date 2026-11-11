/**
 * Attendance: the same day view for coaches and admins. Coaches see their own (and covered)
 * sessions; admins see every session of the day, with the coach's name. A batch's monthly
 * register has its own page (/attendance/register/:batchId).
 */
import { useParams } from 'react-router';
import { PageHeader } from '@/components/common';
import { useBatches } from '@/lib/queries';
import { AttendanceDay } from './attendance-coach';
import { MonthlyRegister } from './attendance-parts';

export function AttendancePage() {
  return <AttendanceDay />;
}

export function AttendanceRegisterPage() {
  const { batchId = '' } = useParams();
  const batch = useBatches().data?.find((b) => b.id === batchId);
  return (
    <div>
      <PageHeader
        className="mb-2 sm:mb-3"
        title="Monthly register"
        description={batch ? `${batch.name}: every session this month.` : undefined}
      />
      <MonthlyRegister batchId={batchId} />
    </div>
  );
}
