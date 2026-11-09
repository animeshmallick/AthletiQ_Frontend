export const minutes = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};

/** A stable colour per batch, so the same batch looks the same everywhere. */
const PALETTE = [
  'border-l-indigo-500 bg-indigo-500/12 text-indigo-900 dark:text-indigo-100',
  'border-l-emerald-500 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100',
  'border-l-amber-500 bg-amber-500/15 text-amber-900 dark:text-amber-100',
  'border-l-rose-500 bg-rose-500/12 text-rose-900 dark:text-rose-100',
  'border-l-sky-500 bg-sky-500/12 text-sky-900 dark:text-sky-100',
  'border-l-violet-500 bg-violet-500/12 text-violet-900 dark:text-violet-100',
  'border-l-teal-500 bg-teal-500/12 text-teal-900 dark:text-teal-100',
];
export function batchTone(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** "Live now" / "Starts in 20 min" for a session today, else null. */
export function liveStatus(start: string, end: string, now: number, isToday: boolean) {
  if (!isToday) return null;
  const s = minutes(start);
  const e = minutes(end);
  if (now >= s && now < e) return 'Live now';
  if (now < s && s - now <= 60) return `Starts in ${s - now} min`;
  return null;
}
