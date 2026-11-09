import { scheduleLabel, timeLabel, timesOn, timesVary } from '@/lib/batch-times';

const b = {
  weekdays: [6, 1, 3],
  startTime: '06:00:00',
  endTime: '08:00:00',
  dayTimes: { '6': { start: '07:00:00', end: '09:00:00' } },
};

describe('batch times', () => {
  it('resolves a day’s own time, or the usual one', () => {
    expect(timesOn(b, 6)).toEqual({ startTime: '07:00:00', endTime: '09:00:00' });
    expect(timesOn(b, '2026-03-09')).toEqual({ startTime: '06:00:00', endTime: '08:00:00' });
    expect(timesOn({ ...b, dayTimes: null }, 6).startTime).toBe('06:00:00');
  });

  it('labels schedules compactly', () => {
    const same = { ...b, dayTimes: {} };
    expect(timesVary(same)).toBe(false);
    expect(scheduleLabel(same)).toBe('Mon, Wed, Sat · 6:00 am – 8:00 am');
    expect(timeLabel(same)).toBe('6:00 am – 8:00 am');
    expect(timesVary(b)).toBe(true);
    expect(scheduleLabel(b)).toBe('Mon, Wed 6:00 am – 8:00 am · Sat 7:00 am – 9:00 am');
    expect(timeLabel(b)).toBe('Times vary');
  });
});
