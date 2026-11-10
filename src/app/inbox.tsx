/**
 * Notifications inside the app:
 *  - the inbox (in the header bell): everything a person was sent, unread first marked, tap to
 *    open; so nothing is lost when it's swiped away on the phone;
 *  - the banner: when a notification arrives while the app is open, a neat slide-down card
 *    (title, message, Open) instead of the phone's system banner;
 *  - the app icon badge (installed web app) follows the unread count.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, CheckCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { relativeTime } from '@/app/deployments';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface InboxItem {
  id: string;
  category: 'sessions' | 'students' | 'money' | 'approvals' | 'summaries';
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
interface Inbox {
  items: InboxItem[];
  unread: number;
}

const KEY = ['me', 'notifications'] as const;

/** The inbox; refreshed when a notification arrives, the app returns, or every few minutes. */
export function useInbox(enabled = true) {
  const q = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => api.get<Inbox>('/me/notifications', undefined, signal),
    refetchInterval: 5 * 60_000,
    enabled,
  });
  const unread = q.data?.unread ?? 0;
  // The installed web app's icon shows the unread count.
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!q.data) return;
    void (unread ? nav.setAppBadge?.(unread) : nav.clearAppBadge?.())?.catch(() => {});
  }, [q.data, unread]);
  return q;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      api.post<{ unread: number }>('/me/notifications/read', ids ? { ids } : {}),
    // Show it read straight away.
    onMutate: (ids) => {
      qc.setQueryData<Inbox>(KEY, (old) => {
        if (!old) return old;
        const now = new Date().toISOString();
        const items = old.items.map((n) =>
          !n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n,
        );
        return { items, unread: items.filter((n) => !n.readAt).length };
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Marks one notification read (e.g. opened from the phone's notification). */
export function markNotificationRead(id: string) {
  void api.post('/me/notifications/read', { ids: [id] }).catch(() => {});
}

const dayOf = (iso: string) => new Date(iso).toDateString();

/** The inbox list (inside the header bell). */
export function InboxList({ onNavigate }: { onNavigate: () => void }) {
  const q = useInbox();
  const read = useMarkRead();
  const navigate = useNavigate();
  if (q.isPending)
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    );
  const items = q.data?.items ?? [];
  if (!items.length)
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <BellOff className="size-6" />
        </span>
        <p className="font-semibold">No notifications yet</p>
        <p className="text-[13px] text-muted-foreground">
          Session reminders, new students, fees and approvals show up here.
        </p>
      </div>
    );
  const today = new Date().toDateString();
  return (
    <div>
      {(q.data?.unread ?? 0) > 0 && (
        <div className="flex justify-end border-b px-3 py-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[12px]"
            onClick={() => read.mutate(undefined)}
          >
            <CheckCheck className="size-3.5" /> Mark all read
          </Button>
        </div>
      )}
      <ul className="max-h-[60dvh] overflow-y-auto">
        {items.map((n, i) => {
          const first = i === 0 || dayOf(items[i - 1]!.createdAt) !== dayOf(n.createdAt);
          return (
            <li key={n.id}>
              {first && (
                <p className="sticky top-0 z-10 bg-background/95 px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur">
                  {dayOf(n.createdAt) === today
                    ? 'Today'
                    : new Date(n.createdAt).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!n.readAt) read.mutate([n.id]);
                  if (n.link?.startsWith('/')) {
                    onNavigate();
                    void navigate(n.link);
                  }
                }}
                className={cn(
                  'flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 active:bg-muted',
                  !n.readAt && 'bg-primary/[0.04]',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    n.readAt ? 'bg-transparent' : 'bg-primary',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'line-clamp-2 text-[13.5px] leading-snug',
                      n.readAt ? 'font-medium text-foreground/80' : 'font-semibold',
                    )}
                  >
                    {n.title}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-muted-foreground">
                    {n.body}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                    {relativeTime(n.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── In-app banner ──────────────────────────────────────────────────────────

export interface IncomingPush {
  title: string;
  body: string;
  link?: string;
  notificationId?: string;
}

/** Shows a notification that arrives while the app is open (call from native / service worker). */
export function showIncomingPush(p: IncomingPush) {
  window.dispatchEvent(new CustomEvent<IncomingPush>('atq:push', { detail: p }));
}

/** The slide-down card for notifications that arrive while the app is open. */
export function PushBanner() {
  const [current, setCurrent] = useState<IncomingPush | null>(null);
  const [leaving, setLeaving] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startY = useRef<number | null>(null);

  const close = () => {
    setLeaving(true);
    setTimeout(() => {
      setCurrent(null);
      setLeaving(false);
    }, 220);
  };

  useEffect(() => {
    const on = (e: Event) => {
      const p = (e as CustomEvent<IncomingPush>).detail;
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['me', 'tasks'] });
      setLeaving(false);
      setCurrent(p);
      try {
        navigator.vibrate?.(30);
      } catch {
        // not supported
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(close, 6_000);
    };
    window.addEventListener('atq:push', on);
    return () => window.removeEventListener('atq:push', on);
  }, [qc]);

  if (!current) return null;
  const open = () => {
    if (current.notificationId) markNotificationRead(current.notificationId);
    if (current.link?.startsWith('/')) void navigate(current.link);
    close();
  };
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
    >
      <div
        onTouchStart={(e) => (startY.current = e.touches[0]?.clientY ?? null)}
        onTouchEnd={(e) => {
          const y = e.changedTouches[0]?.clientY ?? 0;
          if (startY.current !== null && startY.current - y > 30) close(); // swipe up
          startY.current = null;
        }}
        className={cn(
          'pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border bg-card/95 p-2.5 pl-3 shadow-e3 backdrop-blur-xl transition-all duration-200',
          leaving
            ? '-translate-y-6 opacity-0'
            : 'animate-[banner-in_260ms_cubic-bezier(0.2,0,0,1)]',
        )}
      >
        <button type="button" onClick={open} className="min-w-0 flex-1 cursor-pointer text-left">
          <span className="line-clamp-2 block text-[14px] leading-snug font-semibold">
            {current.title}
          </span>
          {current.body && (
            <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-muted-foreground">
              {current.body}
            </span>
          )}
        </button>
        {current.link?.startsWith('/') && (
          <Button size="sm" className="h-8 shrink-0 px-3 text-[12px]" onClick={open}>
            Open
          </Button>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
