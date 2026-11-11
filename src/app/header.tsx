/**
 * App bar (Material 3 "small top app bar" behaviour):
 *  - the brand mark always returns to Today,
 *  - elevates with a frosted background once the page scrolls,
 *  - on phones, the wordmark cross-fades into the current screen's name while scrolled,
 *  - a bell shows what needs attention (live count) and opens the task list.
 */
import {
  AlertTriangle,
  Bell,
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  IndianRupee,
  MapPin,
  MessageSquareText,
  ShieldAlert,
  UserPlus,
  type LucideIcon,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/overlays';
import { formatLongDate, today } from '@/lib/format';
import { useTasks } from '@/lib/queries';
import type { AppTask } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useUser } from './auth';
import { RoleBadge } from './role-switch';
import { parentPath, useGoBack } from './go-back';
import { activeItem, navFor, tabsFor } from './nav';
import { applyUpdate, useUpdateAvailable } from './version-check';
import { InboxList, useInbox } from './inbox';
import { Segmented } from '@/components/ui/controls';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';

import { BrandMark } from '@/components/brand-mark';

export { BrandMark };

function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > threshold);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return scrolled;
}

/** Name of the current screen, from the navigation (longest matching path). */
function useScreenTitle(): string {
  const { pathname } = useLocation();
  const user = useUser();
  if (pathname === '/') return 'Home';
  const match = navFor(user.role)
    .filter((n) => n.to !== '/' && (pathname === n.to || pathname.startsWith(n.to + '/')))
    .sort((a, b) => b.to.length - a.to.length)[0];
  if (match) return match.label;
  if (pathname.startsWith('/account')) return 'Account';
  // Detail screens that aren't in the menu.
  if (pathname.startsWith('/invoices/')) return 'Invoice';
  return 'AthletiQ';
}

/**
 * Where the phone header shows a back arrow (instead of the brand), and where it goes when there's
 * no history: detail screens (e.g. /students/123 → /students) and screens that aren't a bottom
 * tab (opened from More, e.g. /settings → Home).
 */
function useBackTarget(): string | null {
  const { pathname, search } = useLocation();
  const user = useUser();
  if (pathname === '/') return null;
  // An invoice goes back to the invoice list (under Finance).
  if (pathname.startsWith('/invoices/')) return '/finance?tab=invoices';
  if (pathname.split('/').filter(Boolean).length > 1) return parentPath(pathname);
  return activeItem(tabsFor(user.role), pathname, search) ? null : '/';
}

/** The back arrow and the screen's name, on phones. */
function HeaderBack({ title, to }: { title: string; to: string }) {
  const goBack = useGoBack(to);
  return (
    <div className="-ml-1.5 flex min-w-0 items-center gap-1 lg:hidden">
      <button
        type="button"
        onClick={goBack}
        aria-label={to === '/' ? 'Back' : `Back to ${title}`}
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted active:scale-95"
      >
        <ChevronLeft className="size-6" />
      </button>
      <span className="truncate text-[17px] font-bold tracking-tight">{title}</span>
    </div>
  );
}

/** A newer version is live: one tap clears the cached app and reloads into it (still signed in). */
function UpdateButton() {
  const available = useUpdateAvailable();
  const [busy, setBusy] = useState(false);
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => {
        setBusy(true);
        void applyUpdate('Updated to the new version (tapped Update)');
      }}
      disabled={busy}
      aria-label="Update the app to the new version"
      className="relative inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-e2 transition-transform active:scale-95 disabled:opacity-80"
    >
      {!busy && (
        <span className="absolute -top-0.5 -right-0.5 flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-70" />
          <span className="relative inline-flex size-2.5 rounded-full bg-success ring-2 ring-background" />
        </span>
      )}
      <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
      {busy ? 'Updating…' : 'Update'}
    </button>
  );
}

export function AppHeader({ userMenu }: { userMenu: ReactNode }) {
  const scrolled = useScrolled();
  const title = useScreenTitle();
  const back = useBackTarget();
  const deep = back !== null;
  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] transition-[background-color,box-shadow,border-color] duration-200',
        scrolled
          ? 'border-border/60 bg-background/80 shadow-e2 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70'
          : 'border-transparent bg-background/90 backdrop-blur',
      )}
    >
      <div className="flex h-[3.25rem] items-center gap-2 px-3.5 sm:h-14 sm:px-6">
        {back !== null && <HeaderBack title={title} to={back} />}
        {/* Phones / tablets: brand (→ Today), turning into the screen name while scrolled. */}
        <Link
          to="/"
          aria-label="AthletiQ, go to Today"
          className={cn(
            'group -ml-1 flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 transition-colors active:bg-muted/60 lg:hidden',
            deep && 'hidden',
          )}
        >
          <BrandMark />
          <span className="relative grid min-w-0">
            <span
              className={cn(
                'col-start-1 row-start-1 truncate text-[17px] font-bold tracking-tight transition-all duration-200',
                scrolled && title !== 'Home' ? '-translate-y-2 opacity-0' : 'opacity-100',
              )}
            >
              AthletiQ
            </span>
            <span
              aria-hidden={!scrolled}
              className={cn(
                'col-start-1 row-start-1 truncate text-[17px] font-bold tracking-tight transition-all duration-200',
                scrolled && title !== 'Home' ? 'opacity-100' : 'translate-y-2 opacity-0',
              )}
            >
              {title}
            </span>
          </span>
        </Link>
        {/* Desktop: the sidebar has the brand; show where you are and today's date. */}
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-[15px] leading-tight font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{formatLongDate(today())}</p>
        </div>
        <div className="flex-1" />
        <UpdateButton />
        <RoleBadge />
        <TasksBell />
        {userMenu}
      </div>
    </header>
  );
}

const KIND_ICON: Record<AppTask['kind'], LucideIcon> = {
  'check-in': MapPin,
  'missed-check-in': AlertTriangle,
  attendance: CalendarCheck2,
  'lesson-plan': ClipboardList,
  feedback: MessageSquareText,
  registrations: UserPlus,
  'flagged-check-ins': ShieldAlert,
  'overdue-fees': IndianRupee,
};

const SEVERITY_STYLE: Record<AppTask['severity'], string> = {
  critical: 'bg-destructive/12 text-destructive',
  warning: 'bg-warning/22 text-warning-foreground dark:text-warning',
  info: 'bg-primary/12 text-primary',
};

/** Bell with a live count; opens "Needs your attention". */
export function TasksBell() {
  const tasks = useTasks();
  const inbox = useInbox();
  const [open, setOpen] = useState(false);
  const todo = tasks.data?.total ?? 0;
  const unread = inbox.data?.unread ?? 0;
  const total = todo + unread;
  // Opens on notifications when there are unread ones, else on to-dos.
  const [tab, setTab] = useState<'todo' | 'inbox'>('todo');
  const urgent = tasks.data?.items.some((t) => t.severity === 'critical') ?? false;
  // Wiggle the bell when new items arrive.
  const prev = useRef(total);
  const [ring, setRing] = useState(false);
  useEffect(() => {
    if (total > prev.current) {
      setRing(true);
      const t = setTimeout(() => setRing(false), 900);
      prev.current = total;
      return () => clearTimeout(t);
    }
    prev.current = total;
  }, [total]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => {
          setTab(unread > 0 ? 'inbox' : 'todo');
          setOpen(true);
        }}
        aria-label={
          total
            ? `${todo} to-do${todo === 1 ? '' : 's'}, ${unread} unread notification${unread === 1 ? '' : 's'}`
            : 'Nothing needs attention'
        }
        className="relative flex size-10 cursor-pointer items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted active:scale-95"
      >
        <Bell className={cn('size-5', ring && 'animate-[wiggle_0.9s_ease-in-out]')} />
        {total > 0 && (
          <span
            key={total}
            className={cn(
              'absolute top-1 right-1 flex h-[18px] min-w-[18px] animate-[pop_0.3s_ease-out] items-center justify-center rounded-full px-1 text-[10px] leading-none font-bold text-white ring-2 ring-background',
              urgent ? 'bg-destructive' : 'bg-primary',
            )}
          >
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        <div className="space-y-2 border-b px-4 pt-5 pb-3">
          <div>
            <DialogTitle className="text-base">
              {tab === 'inbox' ? 'Notifications' : 'Needs your attention'}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {tab === 'inbox'
                ? unread
                  ? `${unread} unread`
                  : 'You’re all caught up'
                : tasks.isError
                  ? 'Couldn’t load your tasks'
                  : todo
                    ? `${todo} item${todo === 1 ? '' : 's'}, most urgent first`
                    : 'Everything is up to date'}
            </DialogDescription>
          </div>
          <Segmented
            ariaLabel="To-dos or notifications"
            size="sm"
            className="w-full"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'todo', label: `To-dos${todo ? ` · ${todo}` : ''}`, className: 'flex-1' },
              {
                value: 'inbox',
                label: `Notifications${unread ? ` · ${unread}` : ''}`,
                className: 'flex-1',
              },
            ]}
          />
        </div>
        {tab === 'inbox' ? (
          <InboxList onNavigate={() => setOpen(false)} />
        ) : tasks.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <p className="text-[13px] text-muted-foreground">
              Check your connection and try again.
            </p>
            <Button size="sm" variant="tonal" onClick={() => void tasks.refetch()}>
              Try again
            </Button>
          </div>
        ) : tasks.isPending ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : todo === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-success/14 text-success">
              <CheckCircle2 className="size-6" />
            </span>
            <p className="font-semibold">You're all caught up</p>
            <p className="text-[13px] text-muted-foreground">
              New tasks appear here as your day goes on.
            </p>
          </div>
        ) : (
          <ul className="max-h-[60dvh] divide-y overflow-y-auto">
            {tasks.data!.items.map((t, i) => {
              const Icon = KIND_ICON[t.kind];
              return (
                <li key={t.id} className="animate-rise" style={{ animationDelay: `${i * 30}ms` }}>
                  <Link
                    to={t.link}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted"
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl',
                        SEVERITY_STYLE[t.severity],
                      )}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{t.title}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {t.detail}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
