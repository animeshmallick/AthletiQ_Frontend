/**
 * Makes "back" close overlays, like a native app.
 *
 * Opening a dialog, sheet, picker or menu adds a history entry (same URL). Pressing back —
 * Android's button or gesture, the iPhone swipe, or the browser's back button — pops that entry
 * and closes the overlay instead of leaving the screen. Closing an overlay any other way (its
 * close button, tapping outside, Escape) quietly removes the entry again, so history never
 * fills up with dead steps.
 */
import { useEffect, useRef } from 'react';

const KEY = '__atqOverlay';

interface Entry {
  id: number;
  close: () => void;
}

const stack: Entry[] = [];
let seq = 0;
/** history.back() calls we made ourselves; their popstate must not close anything. */
let ownPops = 0;
/** Overlays opened while one of our own back() calls is still in flight. */
const queued: number[] = [];

const overlayOf = (state: unknown) =>
  (state as Record<string, unknown> | null)?.[KEY] as number | undefined;

function push(id: number) {
  const state = (window.history.state as Record<string, unknown> | null) ?? {};
  window.history.pushState({ ...state, [KEY]: id }, '');
}

function goBackQuietly() {
  ownPops++;
  window.history.back();
}

function onPopState() {
  if (ownPops > 0) {
    ownPops--;
    // Push entries for overlays that opened while we were stepping back.
    if (ownPops === 0) queued.splice(0).forEach(push);
    return;
  }
  const current = overlayOf(window.history.state);
  // Close every overlay opened after the entry we've landed on (top first).
  while (stack.length && (current === undefined || stack.at(-1)!.id > current)) {
    stack.pop()!.close();
  }
  // Landed on an entry whose overlay is already gone (e.g. after leaving the screen from
  // inside a dialog): step over it so one press of back always does something visible.
  if (current !== undefined && !stack.some((e) => e.id === current)) goBackQuietly();
}

if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState);

/** Is any history-aware overlay open? (Android's back button closes it first.) */
export const overlayOnStack = () => stack.length > 0;

/** Registers an open overlay; returns a function to call when it closes by other means. */
export function pushOverlay(close: () => void): () => void {
  const id = ++seq;
  stack.push({ id, close });
  if (ownPops > 0) queued.push(id);
  else push(id);
  return () => {
    const i = stack.findIndex((e) => e.id === id);
    if (i === -1) return; // Already closed by back.
    stack.splice(i, 1);
    const q = queued.indexOf(id);
    if (q !== -1) queued.splice(q, 1);
    else if (overlayOf(window.history.state) === id) goBackQuietly();
  };
}

/** While `open`, back closes this overlay (by calling `close`). */
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    return pushOverlay(() => closeRef.current());
  }, [open]);
}
