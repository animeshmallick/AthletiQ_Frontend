/**
 * Whether someone is using the app. Background refreshes stop after a while without a tap, key or
 * scroll: an app left open on a desk must not keep the database awake all day.
 */
const IDLE_MS = 15 * 60_000;
let lastInput = Date.now();
const resumed = new Set<() => void>();

export const isIdle = () => Date.now() - lastInput >= IDLE_MS;

function onInput() {
  const was = isIdle();
  lastInput = Date.now();
  if (was) for (const f of resumed) f();
}
if (typeof window !== 'undefined')
  for (const e of ['pointerdown', 'keydown', 'scroll', 'touchstart'])
    window.addEventListener(e, onInput, { passive: true, capture: true });

/** A refetchInterval that pauses while nobody is using the app. */
export const pollWhileActive = (ms: number) => () => (isIdle() ? false : ms);

/** Runs when someone uses the app again after being away. */
export function onResume(f: () => void) {
  resumed.add(f);
  return () => void resumed.delete(f);
}
