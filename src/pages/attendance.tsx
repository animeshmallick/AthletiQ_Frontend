/**
 * Attendance: the same day view for coaches and admins. Coaches see their own (and covered)
 * sessions; admins see every session of the day, with the coach's name.
 */
import { AttendanceDay } from './attendance-coach';

export function AttendancePage() {
  return <AttendanceDay />;
}
