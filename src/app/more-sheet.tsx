/**
 * The phone "More" sheet: profile, every screen that isn't a tab as tiles grouped by purpose
 * (role-specific: Approvals for admins, Requests for coaches) with to-do counts, a quick screen
 * search, this device's app actions, appearance, sign out and — for admins — deployment status.
 */
import {
  Bell,
  ChevronRight,
  Download,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Smartphone,
  Sun,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { Avatar } from '@/components/common';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/overlays';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from './auth';
import { startAppUpdate } from './app-update';
import { DeploymentsInfo } from './deployments';
import { useInstallPrompt } from './install';
import { APK_URL, checkForAppUpdate, isAndroidBrowser, isNativeApp } from './native';
import { enableWebPush, webPushState } from './web-push';
import { matches, NAV_GROUPS, type NavItem } from './nav';
import { preloadRoute } from './pages';
import { useTheme, type Theme } from './theme';

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
];

function CountBadge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="tabular min-w-5 rounded-full bg-destructive px-1.5 py-px text-center text-[11px] font-bold text-white">
      {n > 99 ? '99+' : n}
    </span>
  );
}

interface AppAction {
  label: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
}

/** Icon colour per section, so each group is recognisable at a glance. */
const TONES: Record<NavItem['group'], string> = {
  main: 'bg-primary/10 text-primary',
  manage: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  approvals: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  system: 'bg-slate-500/12 text-slate-700 dark:text-slate-300',
};

/** Screens as large, tappable tiles with an active state and to-do counts. */
function TileGrid({
  items,
  counts,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  counts: Record<string, number>;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <ul className="grid grid-cols-4 gap-1.5">
      {items.map((item) => {
        const active = matches(item, pathname);
        const n = counts[item.to] ?? 0;
        return (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              onPointerDown={() => preloadRoute(item.to)}
              aria-current={active ? 'page' : undefined}
              aria-label={n ? `${item.label}, ${n} to do` : item.label}
              className={cn(
                'relative flex h-full min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border bg-card px-1 py-2 text-center shadow-e1 transition-[transform,background-color,border-color] duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/30 active:scale-[0.96]',
                active && 'border-primary/50 bg-primary/[0.06]',
              )}
            >
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-xl',
                  TONES[item.group],
                  active && 'bg-primary text-primary-foreground',
                )}
              >
                <item.icon className="size-[18px]" />
              </span>
              <span className="line-clamp-2 w-full text-[11px] leading-tight font-medium">
                {item.short ?? item.label}
              </span>
              {n > 0 && (
                <span aria-hidden className="absolute top-1 right-1">
                  <CountBadge n={n} />
                </span>
              )}
            </NavLink>
          </li>
        );
      })}
    </ul>
  );
}

export function MoreSheet({
  items,
  tabs,
  counts,
  onNavigate,
}: {
  items: NavItem[];
  tabs: NavItem[];
  counts: Record<string, number>;
  onNavigate: () => void;
}) {
  const user = useUser();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tabPaths = new Set(tabs.map((t) => t.to));
  const rest = items.filter((i) => !tabPaths.has(i.to));
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const found = rest.filter((i) => `${i.label} ${i.short ?? ''}`.toLowerCase().includes(needle));
  const web = typeof __BUILD__ !== 'undefined' ? __BUILD__ : null;
  const install = useInstallPrompt();
  const [pushState, setPushState] = useState(webPushState);
  const appActions: AppAction[] = [];
  if (pushState === 'off') {
    appActions.push({
      label: 'Turn on notifications',
      icon: Bell,
      onClick: () =>
        void enableWebPush()
          .then((st) => {
            setPushState(st);
            if (st === 'on') toast.success('Notifications are on for this device');
            else if (st === 'blocked') toast.error('Notifications are blocked in settings');
          })
          .catch(() => toast.error("Couldn't turn on notifications. Try again.")),
    });
  }
  if (isAndroidBrowser())
    appActions.push({ label: 'Get the Android app', icon: Smartphone, href: APK_URL });
  if (isNativeApp()) {
    appActions.push({
      label: 'Check for app update',
      icon: RefreshCw,
      onClick: () =>
        void checkForAppUpdate(true).then((u) =>
          u
            ? void startAppUpdate(u, { interactive: true })
            : toast.success('You have the latest version of the app'),
        ),
    });
  }
  if (install && !isAndroidBrowser()) {
    appActions.push({
      label: 'Install app',
      icon: Download,
      onClick: () =>
        void install().then((ok) => ok && toast.success('AthletiQ installed on this device')),
    });
  }

  return (
    <DialogContent
      hideClose
      className="gap-0 bg-background p-0 pt-0 sm:max-w-md sm:p-0"
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 pt-5 pb-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-lg">Menu</DialogTitle>
          <DialogDescription className="text-xs">
            All screens, your account and settings
          </DialogDescription>
        </div>
        <DialogClose className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground active:scale-95">
          <X className="size-4.5" />
          <span className="sr-only">Close</span>
        </DialogClose>
      </div>

      <div className="space-y-3 px-3 pt-3 pb-2">
        {/* Profile */}
        <NavLink
          to="/account"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-e1 transition-colors active:bg-muted/60"
        >
          <Avatar name={user.name} className="size-11 text-sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary capitalize">
            {user.role}
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </NavLink>

        {/* Find a screen (handy when there are many) */}
        {rest.length > 8 && (
          <label className="relative block">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a screen…"
              aria-label="Find a screen"
              className="h-10 w-full rounded-xl border bg-card pr-3 pl-9 text-[15px] shadow-e1 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 sm:text-sm"
            />
          </label>
        )}

        {/* Screens, grouped by what they're for — every one a tile */}
        {needle ? (
          <section aria-label="Search results">
            {found.length === 0 ? (
              <p className="rounded-2xl border bg-card px-3 py-4 text-center text-sm text-muted-foreground shadow-e1">
                No screen matches “{query.trim()}”.
              </p>
            ) : (
              <TileGrid items={found} counts={counts} pathname={pathname} onNavigate={onNavigate} />
            )}
          </section>
        ) : (
          NAV_GROUPS.map(({ key, label }) => {
            const group = rest.filter((i) => i.group === key);
            if (!group.length) return null;
            const pending = group.reduce((n, i) => n + (counts[i.to] ?? 0), 0);
            return (
              <section key={key} aria-labelledby={`more-${key}`}>
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <h3
                    id={`more-${key}`}
                    className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {label(user.role)}
                  </h3>
                  {pending > 0 && (
                    <span className="rounded-full bg-destructive/10 px-1.5 text-[10px] font-semibold text-destructive">
                      {pending} to review
                    </span>
                  )}
                </div>
                <TileGrid
                  items={group}
                  counts={counts}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              </section>
            );
          })
        )}

        {/* This device: notifications, app install and updates (only what applies here) */}
        {appActions.length > 0 && (
          <section aria-labelledby="more-app">
            <h3
              id="more-app"
              className="mb-1.5 px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
            >
              This device
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {appActions.map((a) => {
                const body = (
                  <>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
                      <a.icon className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-left text-[13px] leading-tight font-medium">
                      {a.label}
                    </span>
                  </>
                );
                const cls =
                  'flex min-h-14 cursor-pointer items-center gap-2 rounded-2xl border bg-card px-2.5 py-2 shadow-e1 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/30 active:scale-[0.97]';
                return a.href ? (
                  <a key={a.label} href={a.href} className={cls}>
                    {body}
                  </a>
                ) : (
                  <button key={a.label} type="button" onClick={a.onClick} className={cls}>
                    {body}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Appearance */}
        <section aria-label="Appearance">
          <h3 className="mb-1.5 px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Appearance
          </h3>
          <div className="grid grid-cols-3 gap-1 rounded-2xl border bg-card p-1 shadow-e1">
            {THEMES.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setTheme(o.value)}
                aria-pressed={theme === o.value}
                className={cn(
                  'flex cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-medium text-muted-foreground transition-colors',
                  theme === o.value && 'bg-primary text-primary-foreground shadow-e1',
                )}
              >
                <o.icon className="size-4" />
                {o.label}
              </button>
            ))}
          </div>
        </section>

        {user.role === 'admin' && (
          <DeploymentsInfo className="bg-card shadow-e1 [--color-sidebar-accent:var(--color-muted)] [--color-sidebar-border:var(--color-border)] [--color-sidebar-foreground:var(--color-foreground)] [--color-sidebar-muted:var(--color-muted-foreground)] [--sidebar-accent:var(--muted)] [--sidebar-border:var(--border)] [--sidebar-foreground:var(--foreground)] [--sidebar-muted:var(--muted-foreground)]" />
        )}

        <button
          type="button"
          onClick={() => {
            onNavigate();
            void logout().then(() => navigate('/login'));
          }}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border bg-card py-2.5 text-sm font-semibold text-destructive shadow-e1 transition-colors active:bg-destructive/10"
        >
          <LogOut className="size-4" /> Sign out
        </button>

        <p className="pb-1 text-center text-[11px] text-muted-foreground">
          AthletiQ{web?.commit ? ` · build ${web.commit}` : ''}
        </p>
      </div>
    </DialogContent>
  );
}
