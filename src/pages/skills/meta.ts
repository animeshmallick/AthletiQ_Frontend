/** Formatting helpers shared by the skills screens. */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-03-01" → "March 2026". */
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export const monthShort = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]!.slice(0, 3)}`;

/** First of the month, n months from `m`. */
export function addMonth(m: string, n: number) {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7)) - 1 + n;
  const d = new Date(Date.UTC(y, mo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Badge colours by band: A Beginner (teal), B Intermediate (blue), C Advanced (violet). */
export function levelTone(code: string | null | undefined) {
  switch (code?.[0]) {
    case 'A':
      return 'bg-teal-500/14 text-teal-800 dark:text-teal-300';
    case 'B':
      return 'bg-blue-500/14 text-blue-800 dark:text-blue-300';
    case 'C':
      return 'bg-violet-500/14 text-violet-700 dark:text-violet-300';
    default:
      return 'bg-primary/10 text-primary';
  }
}

/** Heat colour for an average (× 100) on the 1–5 scale. */
export function heat(avg: number | null) {
  if (avg === null) return 'bg-muted text-muted-foreground';
  if (avg >= 400) return 'bg-success/22 text-success';
  if (avg >= 325) return 'bg-success/12 text-success';
  if (avg >= 250) return 'bg-warning/18 text-warning-foreground dark:text-warning';
  return 'bg-destructive/12 text-destructive';
}
