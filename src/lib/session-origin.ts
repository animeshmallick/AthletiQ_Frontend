import { today } from './format';

export const hhmm = (t: string) => t.slice(0, 5);

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** True until the session's start (academy time, like the rest of the app). */
export function notStarted(date: string, startTime: string, now: Date = new Date()) {
  const d = today(now);
  return date === d ? hhmm(startTime) > clock.format(now) : date > d;
}
