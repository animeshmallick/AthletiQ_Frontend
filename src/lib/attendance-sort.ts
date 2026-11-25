/** How the attendance sheet lists students, remembered on this device. */
export type AttendanceSort = 'name' | 'rate';

const KEY = 'atq-attendance-sort';

export function savedSort(): AttendanceSort {
  try {
    return localStorage.getItem(KEY) === 'rate' ? 'rate' : 'name';
  } catch {
    return 'name';
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
 * By name, or by the 30-day attendance shown beside each name, highest first (students without
 * one last). That rate is from before this session, so nobody moves while being marked.
 */
export function sortStudents<T extends { fullName: string; rate30?: number | null }>(
  list: T[],
  sort: AttendanceSort,
): T[] {
  const byName = (a: T, b: T) => a.fullName.localeCompare(b.fullName);
  return [...list].sort((a, b) =>
    sort === 'name' ? byName(a, b) : (b.rate30 ?? -1) - (a.rate30 ?? -1) || byName(a, b),
  );
}
