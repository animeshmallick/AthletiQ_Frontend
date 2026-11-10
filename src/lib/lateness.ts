/** How late a check-in was against the session start (IST), for the "30m late" badges. */
const istClock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Kolkata',
});
const toMin = (t: string) => {
  const [h = 0, m = 0] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Over 10 minutes after the start counts as late; null when on time. */
export function lateness(checkInAt: string, startTime: string): string | null {
  const lateBy = toMin(istClock.format(new Date(checkInAt))) - toMin(startTime);
  if (lateBy <= 10) return null;
  return lateBy >= 60
    ? `${Math.floor(lateBy / 60)}h${lateBy % 60 ? ` ${lateBy % 60}m` : ''} late`
    : `${lateBy}m late`;
}
