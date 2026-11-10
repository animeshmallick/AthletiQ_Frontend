/**
 * Attendance without signal. When a mark can't reach the server (no connection, or the network
 * drops mid-save), it is kept on the phone and sent as soon as the connection is back: on the
 * "online" event, when the app returns to the screen, and every 30 seconds while anything waits.
 *
 * Marks for the same session merge (the latest tap per student wins), so a coach can keep marking
 * the whole session offline. If the server refuses a queued change (e.g. the day is locked), the
 * coach is told why and it is logged.
 */
import { useSyncExternalStore } from 'react';
import { logClientEvent } from '@/app/client-log';
import { ApiError, api } from './api';
import type { AttendanceStatus } from './types';

export interface QueuedMark {
  studentId: string;
  status: AttendanceStatus | null;
  note?: string | null;
}
interface Entry {
  batchId: string;
  date: string;
  /** studentId → latest mark. */
  records: Record<string, QueuedMark>;
  queuedAt: number;
}
type Outbox = Record<string, Entry>;

const KEY = 'atq-attendance-outbox';
const RETRY_MS = 30_000;

let cache: Outbox | null = null;
const listeners = new Set<() => void>();
let flushing: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function read(): Outbox {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Outbox;
  } catch {
    cache = {};
  }
  return cache;
}
function write(next: Outbox) {
  cache = next;
  try {
    if (Object.keys(next).length) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or unavailable: the in-memory copy still syncs while the app is open.
  }
  listeners.forEach((l) => l());
}

const keyOf = (batchId: string, date: string) => `${batchId}:${date}`;

/** Keeps marks on the phone to send later. */
export function queueMarks(batchId: string, date: string, records: QueuedMark[]) {
  const all = { ...read() };
  const k = keyOf(batchId, date);
  const entry = all[k] ?? { batchId, date, records: {}, queuedAt: Date.now() };
  const merged = { ...entry.records };
  for (const r of records) merged[r.studentId] = r;
  all[k] = { ...entry, records: merged };
  write(all);
  scheduleRetry();
}

/** How many marks are waiting to sync for a session (or overall). */
export function pendingCount(batchId?: string, date?: string) {
  const all = read();
  const entries =
    batchId && date ? [all[keyOf(batchId, date)]].filter(Boolean) : Object.values(all);
  return entries.reduce((n, e) => n + Object.keys(e!.records).length, 0);
}

/** Re-renders when the outbox changes. */
export function usePendingMarks(batchId?: string, date?: string) {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pendingCount(batchId, date),
    () => 0,
  );
}

/** Applies queued marks over a sheet fetched from the server (so they don't flicker away). */
export function pendingMarks(batchId: string, date: string): QueuedMark[] {
  return Object.values(read()[keyOf(batchId, date)]?.records ?? {});
}

function scheduleRetry() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushOutbox();
  }, RETRY_MS);
}

export type SyncResult = { synced: { batchId: string; date: string; n: number }[] };
let started = false;
let onSynced: (r: SyncResult) => void = () => {};
let onRejected: (batchId: string, date: string, message: string) => void = () => {};

/** Sends everything waiting. Stops at the first sign the connection is still down. */
export function flushOutbox(): Promise<void> {
  flushing ??= (async () => {
    const synced: SyncResult['synced'] = [];
    for (const entry of Object.values(read())) {
      const records = Object.values(entry.records);
      try {
        await api.put('/attendance/session', {
          batchId: entry.batchId,
          date: entry.date,
          records,
        });
        synced.push({ batchId: entry.batchId, date: entry.date, n: records.length });
        removeIfUnchanged(entry);
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0;
        if (status === 0 || status >= 500) {
          // Still offline (or the server is busy): try again later.
          scheduleRetry();
          break;
        }
        // Refused (locked day, not allowed…): drop it and tell the coach why.
        removeIfUnchanged(entry);
        const message = err instanceof Error ? err.message : 'Not saved';
        logClientEvent('shown', `Offline attendance not synced: ${message}`, {
          details: { batchId: entry.batchId, date: entry.date, status, marks: records.length },
        });
        onRejected(entry.batchId, entry.date, message);
      }
    }
    if (synced.length) onSynced({ synced });
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Removes a sent entry, unless more marks were queued for it meanwhile (those stay). */
function removeIfUnchanged(sent: Entry) {
  const all = { ...read() };
  const k = keyOf(sent.batchId, sent.date);
  const now = all[k];
  if (!now) return;
  const left = Object.fromEntries(
    Object.entries(now.records).filter(([id, r]) => {
      const was = sent.records[id];
      return !was || was.status !== r.status || (was.note ?? null) !== (r.note ?? null);
    }),
  );
  if (Object.keys(left).length) all[k] = { ...now, records: left };
  else delete all[k];
  write(all);
}

/** Starts syncing in the background (once): on reconnect, on return, and on a timer. */
export function startAttendanceSync(handlers: {
  onSynced: (r: SyncResult) => void;
  onRejected: (batchId: string, date: string, message: string) => void;
}) {
  onSynced = handlers.onSynced;
  onRejected = handlers.onRejected;
  if (started) return;
  started = true;
  window.addEventListener('online', () => void flushOutbox());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && pendingCount()) void flushOutbox();
  });
  if (pendingCount()) void flushOutbox();
}

/** Test hook. */
export function __resetOutbox() {
  cache = null;
  if (timer) clearTimeout(timer);
  timer = null;
  flushing = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
