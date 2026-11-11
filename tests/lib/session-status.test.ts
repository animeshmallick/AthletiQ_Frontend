import { lateLabel, lateMinutes, missingParts, sessionStatus } from '@/lib/session-status';

// A 6:00–7:00 pm session on 2026-03-09 (IST).
const base = {
  startTime: '18:00:00',
  endTime: '19:00:00',
  expectedStudents: 4,
  attendanceComplete: false,
  lessonPlanFilled: false,
  coachFeedback: true,
};
const DAY = '2026-03-09';
const at = (h: number, m = 0) => ({ today: DAY, minutes: h * 60 + m });
// 6:12 pm IST
const LATE_IN = '2026-03-09T12:42:00Z';
const ON_TIME_IN = '2026-03-09T12:28:00Z';

describe('session status', () => {
  it('is Scheduled before the start, Delayed after it without a check-in', () => {
    expect(sessionStatus(base, DAY, at(17, 30))).toBe('scheduled');
    expect(sessionStatus(base, DAY, at(18, 5))).toBe('delayed');
    expect(sessionStatus(base, '2026-03-10', at(10))).toBe('scheduled'); // a future day
  });

  it('is Live from the check-in until the end time', () => {
    expect(sessionStatus({ ...base, checkInAt: ON_TIME_IN }, DAY, at(17, 58))).toBe('live');
    expect(sessionStatus({ ...base, checkInAt: LATE_IN }, DAY, at(18, 30))).toBe('live');
  });

  it('after the end: Completed, Partial or Missed', () => {
    const done = {
      ...base,
      checkInAt: ON_TIME_IN,
      attendanceComplete: true,
      lessonPlanFilled: true,
    };
    expect(sessionStatus(done, DAY, at(19))).toBe('completed');
    expect(sessionStatus({ ...done, lessonPlanFilled: false }, DAY, at(19, 30))).toBe('partial');
    expect(sessionStatus({ ...done, attendanceComplete: false }, DAY, at(20))).toBe('partial');
    expect(sessionStatus(base, DAY, at(19))).toBe('missed');
    // A past day is judged the same way.
    expect(sessionStatus(done, DAY, { today: '2026-03-10', minutes: 0 })).toBe('completed');
    expect(sessionStatus(base, DAY, { today: '2026-03-10', minutes: 0 })).toBe('missed');
  });

  it('needs no plan for attendance-only batches, and no marks when nobody is expected', () => {
    const attendanceOnly = {
      ...base,
      checkInAt: ON_TIME_IN,
      attendanceComplete: true,
      coachFeedback: false,
    };
    expect(sessionStatus(attendanceOnly, DAY, at(19))).toBe('completed');
    const empty = { ...base, checkInAt: ON_TIME_IN, expectedStudents: 0, lessonPlanFilled: true };
    expect(sessionStatus(empty, DAY, at(19))).toBe('completed');
    expect(missingParts({ ...base, checkInAt: ON_TIME_IN })).toEqual(['attendance', 'lesson plan']);
  });

  it('stays Cancelled', () => {
    expect(sessionStatus({ ...base, cancelled: 'Rain' }, DAY, at(18, 30))).toBe('cancelled');
  });

  it('marks a check-in over 10 minutes after the start as late', () => {
    expect(lateMinutes({ startTime: base.startTime, checkInAt: LATE_IN })).toBe(12);
    expect(lateMinutes({ startTime: base.startTime, checkInAt: ON_TIME_IN })).toBeNull();
    expect(lateMinutes({ startTime: base.startTime, checkInAt: null })).toBeNull();
    expect(lateLabel(12)).toBe('12m late');
    expect(lateLabel(75)).toBe('1h 15m late');
  });
});
