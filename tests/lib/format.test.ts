import {
  coachTimes,
  addDays,
  addMonths,
  eachDay,
  endOfMonth,
  formatClock,
  formatDate,
  formatDuration,
  formatInstant,
  formatLongDate,
  formatMonth,
  formatShortDate,
  formatTime,
  formatTimeRange,
  initials,
  isoWeekday,
  money,
  moneyCompact,
  paiseToRupees,
  plural,
  relativeDay,
  rupeesToPaise,
  startOfMonth,
  startOfWeek,
  today,
  weekdaysLabel,
} from '@/lib/format';

describe('money', () => {
  it('formats paise as Indian rupees', () => {
    expect(money(250_000)).toBe('₹2,500');
    expect(money(12_345_678)).toBe('₹1,23,456.78');
    expect(moneyCompact(12_500_000)).toMatch(/₹1\.3L|₹1\.25L|₹1\.3 L/);
    expect(rupeesToPaise('2500.5')).toBe(250_050);
    expect(paiseToRupees(250_050)).toBe(2500.5);
  });
});

describe('dates', () => {
  it('formats calendar dates without timezone drift', () => {
    expect(formatDate('2026-11-08')).toBe('8 Nov 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatShortDate('2026-11-08')).toBe('8 Nov');
    expect(formatLongDate('2026-11-08')).toBe('Sunday, 8 November');
    expect(formatMonth('2026-03')).toBe('Mar 26');
  });

  it('formats times and durations', () => {
    expect(formatTime('06:30:00')).toBe('6:30 am');
    expect(formatTime('12:05')).toBe('12:05 pm');
    expect(formatTime('00:00')).toBe('12:00 am');
    expect(formatTimeRange('17:00:00', '18:30:00')).toBe('5:00 pm – 6:30 pm');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(125)).toBe('2h 5m');
  });

  it('formats instants in IST', () => {
    expect(formatClock('2026-03-09T00:30:00Z')).toBe('6:00 am');
    expect(formatInstant('2026-03-09T00:30:00Z')).toMatch(/9 Mar.*6:00 am/);
    expect(formatInstant(null)).toBe('—');
  });

  it('does calendar arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(isoWeekday('2026-11-08')).toBe(7);
    expect(isoWeekday('2026-11-09')).toBe(1);
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02');
    expect(startOfMonth('2026-02-17')).toBe('2026-02-01');
    expect(endOfMonth('2028-02-03')).toBe('2028-02-29');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
    expect(eachDay('2026-03-01', '2026-03-03')).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('knows "today" in IST and labels relative days', () => {
    expect(today(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
    expect(relativeDay('2026-03-09', '2026-03-09')).toBe('Today');
    expect(relativeDay('2026-03-08', '2026-03-09')).toBe('Yesterday');
    expect(relativeDay('2026-03-10', '2026-03-09')).toBe('Tomorrow');
    expect(relativeDay('2026-03-01', '2026-03-09')).toBe('1 Mar 2026');
  });
});

describe('labels', () => {
  it('summarises weekday sets', () => {
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe('Weekdays');
    expect(weekdaysLabel([6, 1, 2, 3, 4, 5])).toBe('Mon – Sat');
    expect(weekdaysLabel([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
    expect(weekdaysLabel([5, 1, 3])).toBe('Mon, Wed, Fri');
  });

  it('builds initials and plurals', () => {
    expect(initials('Ravi  Kumar Sharma')).toBe('RK');
    expect(initials('asha')).toBe('A');
    expect(plural(1, 'student')).toBe('1 student');
    expect(plural(3, 'batch', 'batches')).toBe('3 batches');
  });
});

describe('coachTimes', () => {
  it('shows check-in and check-out, or what is missing', () => {
    expect(coachTimes(null)).toBe('Not in');
    expect(coachTimes({ checkInAt: '2026-03-09T00:32:00Z', checkOutAt: null })).toMatch(
      /^In 6:02\s?am · not out$/i,
    );
    expect(
      coachTimes({ checkInAt: '2026-03-09T00:32:00Z', checkOutAt: '2026-03-09T02:31:00Z' }),
    ).toMatch(/^6:02\s?am – 8:01\s?am$/i);
  });
});
