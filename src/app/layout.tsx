import {
  Bell,
  Download,
  Ellipsis,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Smartphone,
  Sun,
  WifiOff,
} from 'lucide-react';
import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '@/components/common';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/overlays';
import { Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from './auth';
import { IosInstallBanner } from '@/components/notifications';
import { useInstallPrompt } from './install';
import { APK_URL, checkForAppUpdate, isAndroidBrowser, isNativeApp, registerPush } from './native';
import { navFor, tabsFor, type NavItem } from './nav';
import { preloadRoute, preloadWhenIdle } from './pages';
import { PullToRefresh } from './pull-to-refresh';
import { enableWebPush, refreshWebPush, webPushState } from './web-push';
import { useTheme, type Theme } from './theme';
import { AppHeader, BrandMark } from './header';
import { DeploymentsInfo } from './deployments';
import { useTasks } from '@/lib/queries';
import { startAppUpdate } from './app-update';

function SidebarNav({
  items,
  onNavigate,
  counts = {},
}: {
  items: NavItem[];
  onNavigate?: () => void;
  counts?: Record<string, number>;
}) {
  const groups: { key: NavItem['group']; label?: string }[] = [
    { key: 'main' },
    { key: 'manage', label: 'Manage' },
    { key: 'system', label: 'System' },
  ];
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map(({ key, label }) => {
        const groupItems = items.filter((i) => i.group === key);
        if (!groupItems.length) return null;
        return (
          <div key={key} className="flex flex-col gap-0.5">
            {label && (
              <p className="mb-1 px-3 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">
                {label}
              </p>
            )}
            {groupItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    isActive && 'bg-sidebar-accent text-sidebar-foreground',
                  )
                }
              >
                <item.icon className="size-4.5" />
                <span className="flex-1">{item.label}</span>
                {!!counts[item.to] && (
                  <span className="tabular rounded-full bg-destructive px-1.5 py-px text-[11px] font-bold text-white">
                    {counts[item.to]! > 99 ? '99+' : counts[item.to]}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function UserMenu() {
  const user = useUser();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const install = useInstallPrompt();
  const [pushState, setPushState] = useState(webPushState);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex cursor-pointer items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-80"
          aria-label="Account menu"
        >
          <Avatar name={user.name} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs">{user.email}</p>
          <p className="mt-1 text-xs capitalize">{user.role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 px-1 pb-1">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setTheme(o.value)}
              aria-pressed={theme === o.value}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1 rounded-lg border py-2 text-xs transition-colors hover:bg-accent',
                theme === o.value && 'border-primary bg-accent text-accent-foreground',
              )}
            >
              <o.icon className="size-4" />
              {o.label}
            </button>
          ))}
        </div>
        <DropdownMenuSeparator />
        {pushState === 'off' && (
          <DropdownMenuItem
            onSelect={() =>
              void enableWebPush()
                .then((s) => {
                  setPushState(s);
                  if (s === 'on') toast.success('Notifications are on for this device');
                  else if (s === 'blocked') toast.error('Notifications are blocked in settings');
                })
                .catch(() => toast.error("Couldn't turn on notifications. Try again."))
            }
          >
            <Bell /> Turn on notifications
          </DropdownMenuItem>
        )}
        {isAndroidBrowser() && (
          <DropdownMenuItem asChild>
            <a href={APK_URL}>
              <Smartphone /> Get the Android app
            </a>
          </DropdownMenuItem>
        )}
        {isNativeApp() && (
          <DropdownMenuItem
            onSelect={() =>
              void checkForAppUpdate(true).then((u) =>
                u
                  ? void startAppUpdate(u, { interactive: true })
                  : toast.success('You have the latest version of the app'),
              )
            }
          >
            <RefreshCw /> Check for app update
          </DropdownMenuItem>
        )}
        {install && !isAndroidBrowser() && (
          <DropdownMenuItem
            onSelect={() =>
              void install().then((ok) => ok && toast.success('AthletiQ installed on this device'))
            }
          >
            <Download /> Install app
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigate('/account')}>
          <KeyRound /> Account & password
        </DropdownMenuItem>
        <DropdownMenuItem destructive onSelect={() => void logout().then(() => navigate('/login'))}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppLayout() {
  const user = useUser();
  const items = navFor(user.role);
  const tabs = tabsFor(user.role);
  const [moreOpen, setMoreOpen] = useState(false);
  const counts = useTasks().data?.counts ?? {};
  const tabPaths = new Set(tabs.map((t) => t.to));
  // "More" shows the total for screens that aren't tabs.
  const moreCount = items
    .filter((i) => !tabPaths.has(i.to))
    .reduce((n, i) => n + (counts[i.to] ?? 0), 0);
  usePreloadOnIntent(tabs.map((t) => t.to));
  useNativeApp();
  const location = useLocation();
  // "More" lights up when the current screen isn't one of the tabs.
  const onTab = tabs.some((t) =>
    t.to === '/' ? location.pathname === '/' : location.pathname.startsWith(t.to),
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto bg-sidebar px-3 py-5 text-sidebar-foreground lg:flex">
        <Link
          to="/"
          className="group flex items-center gap-2.5 rounded-xl px-3"
          aria-label="AthletiQ, go to Today"
        >
          <BrandMark />
          <span className="text-base font-semibold tracking-tight">AthletiQ</span>
        </Link>
        <SidebarNav items={items} counts={counts} />
        {user.role === 'admin' && <DeploymentsInfo className="mt-auto" />}
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Top bar */}
        <AppHeader userMenu={<UserMenu />} />

        <OfflineBanner />
        <PullToRefresh />
        <IosInstallBanner />
        <main
          id="main"
          className="mx-auto w-full max-w-7xl flex-1 px-3 pt-3.5 pb-24 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10"
        >
          <Suspense fallback={<PageFallback />} key={location.pathname}>
            <div className="animate-page">
              <Outlet />
            </div>
          </Suspense>
        </main>

        {/* Phone tab bar: the role's main screens + "More" for everything else */}
        <nav
          aria-label="Quick navigation"
          className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}
        >
          {tabs.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => tabClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  <TabIcon icon={item.icon} active={isActive} badge={counts[item.to]} />
                  <span className="max-w-full truncate px-0.5">{item.short ?? item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={tabClass(!onTab || moreOpen)}
            >
              <TabIcon icon={Ellipsis} active={!onTab || moreOpen} badge={moreCount} />
              More
            </button>
            <DialogContent className="gap-3 bg-sidebar text-sidebar-foreground [&>button]:text-sidebar-muted">
              <DialogTitle className="text-base">All screens</DialogTitle>
              <SidebarNav items={items} counts={counts} onNavigate={() => setMoreOpen(false)} />
              {user.role === 'admin' && <DeploymentsInfo className="mt-2" />}
            </DialogContent>
          </Dialog>
        </nav>
        <ScrollRestoration />
      </div>
    </div>
  );
}

/** Inside the Android app: register for push and offer new APK versions (once per sign-in). */
function useNativeApp() {
  const navigate = useNavigate();
  // Notification tapped while the web app is open (sent by the service worker).
  useEffect(() => {
    const go = (e: Event) => navigate((e as CustomEvent<string>).detail);
    window.addEventListener('atq:navigate', go);
    void refreshWebPush();
    return () => window.removeEventListener('atq:navigate', go);
  }, [navigate]);
  useEffect(() => {
    if (!isNativeApp()) return;
    void registerPush();
    // New version: download quietly, then offer a one-tap install.
    void checkForAppUpdate().then((u) => u && startAppUpdate(u));
  }, []);
}

/**
 * Fetches a page's code before navigation: when any in-app link is touched, hovered or focused,
 * and the main tabs once the app is idle. Makes tab switches instant on slow mobile data.
 */
function usePreloadOnIntent(idlePaths: string[]) {
  const key = idlePaths.join('|');
  useEffect(() => {
    preloadWhenIdle(key.split('|'));
    const onIntent = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement) || a.origin !== window.location.origin) return;
      preloadRoute(a.pathname);
    };
    const opts = { passive: true, capture: true } as const;
    document.addEventListener('pointerover', onIntent, opts);
    document.addEventListener('touchstart', onIntent, opts);
    document.addEventListener('focusin', onIntent, opts);
    return () => {
      document.removeEventListener('pointerover', onIntent, opts);
      document.removeEventListener('touchstart', onIntent, opts);
      document.removeEventListener('focusin', onIntent, opts);
    };
  }, [key]);
}

function tabClass(active: boolean) {
  return cn(
    'flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[11px] font-medium text-muted-foreground transition-colors',
    active && 'font-semibold text-foreground',
  );
}

function TabIcon({
  icon: Icon,
  active,
  badge,
}: {
  icon: NavItem['icon'];
  active: boolean;
  badge?: number;
}) {
  return (
    <span
      className={cn(
        'relative flex h-7 w-12 items-center justify-center rounded-full transition-colors',
        active && 'bg-primary/12 text-primary',
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.25 : 2} />
      {!!badge && <CountBadge n={badge} className="absolute -top-1 right-1.5" />}
    </span>
  );
}

/** Small red count bubble (pops in when the number changes). */
export function CountBadge({ n, className }: { n: number; className?: string }) {
  return (
    <span
      key={n}
      aria-label={`${n} pending`}
      className={cn(
        'flex h-4 min-w-4 animate-[pop_0.3s_ease-out] items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-bold text-white ring-2 ring-card',
        className,
      )}
    >
      {n > 9 ? '9+' : n}
    </span>
  );
}

/** Warns when the device is offline (common at grounds with patchy mobile data). */
function OfflineBanner() {
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground"
    >
      <WifiOff className="size-4" /> You're offline. Changes will fail until your connection is
      back.
    </div>
  );
}

export function PageFallback() {
  return (
    <div className="space-y-4" aria-busy aria-label="Loading page">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
