/** How the attendance sheet lists students (highest attendance first), remembered on this device. */
export type AttendanceSort = 'name' | 'rate';

const KEY = 'atq-attendance-sort';

export function savedSort(): AttendanceSort {
  try {
    return localStorage.getItem(KEY) === 'name' ? 'name' : 'rate';
  } catch {
    return 'rate';
  }
}

export function rememberSort(sort: AttendanceSort) {
  try {
    localStorage.setItem(KEY, sort);
  } catch {
    // Private mode: it lasts while the screen is open.
  }
}

/**
 * A student's attendance over the last 30 days including this session, so it changes as soon as
 * they are marked. Excused and unmarked sessions don't count; a guest's counts in their own batch.
 */
export function rate30Now(s: {
  status: string | null;
  isMakeup?: boolean;
  rate30?: number | null;
  before30?: { marked: number; present: number };
}): number | null {
  const b = s.before30;
  if (!b || s.isMakeup) return s.rate30 ?? null;
  const counts = s.status !== null && s.status !== 'excused';
  const came = s.status === 'present' || s.status === 'late';
  const marked = b.marked + Number(counts);
  return marked ? Math.round(((b.present + Number(came)) * 100) / marked) : null;
}

type Row = Parameters<typeof rate30Now>[0] & { studentId: string; fullName: string };

/** By name, or by the 30-day attendance shown, highest first (students without one last). */
export function sortStudents<T extends Row>(list: T[], sort: AttendanceSort): T[] {
  const byName = (a: T, b: T) => a.fullName.localeCompare(b.fullName);
  return [...list].sort((a, b) =>
    sort === 'name' ? byName(a, b) : (rate30Now(b) ?? -1) - (rate30Now(a) ?? -1) || byName(a, b),
  );
}
