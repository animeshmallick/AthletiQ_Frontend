import { Ellipsis, WifiOff } from 'lucide-react';
import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { Avatar } from '@/components/common';
import { Dialog } from '@/components/ui/overlays';
import { Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { useUser } from './auth';
import { RoleChooser, useNeedsRoleChoice } from './role-switch';
import { IosInstallBanner } from '@/components/notifications';
import { checkForAppUpdate, isNativeApp, registerPush } from './native';
import { activeItem, NAV_GROUPS, navFor, tabsFor, UNPAID_INVOICES, type NavItem } from './nav';
import { preloadRoute, preloadWhenIdle } from './pages';
import { PullToRefresh } from './pull-to-refresh';
import { refreshWebPush } from './web-push';
import { AppHeader, BrandMark } from './header';
import { DeploymentsInfo } from './deployments';
import { MoreSheet } from './more-sheet';
import { useInvoices, useTasks } from '@/lib/queries';
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
  const user = useUser();
  const { pathname, search } = useLocation();
  const current = activeItem(items, pathname, search);
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV_GROUPS.map(({ key, label: title }) => {
        const label = key === 'main' ? undefined : title(user.role);
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
                className={() =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    current === item && 'bg-sidebar-accent text-sidebar-foreground',
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

export function AppLayout() {
  const choice = useNeedsRoleChoice();
  // Someone who is both an admin and a coach picks a role the first time on this device.
  if (choice.needed) return <RoleChooser onDone={choice.done} />;
  return <AppShell />;
}

function AppShell() {
  const user = useUser();
  const items = navFor(user.role);
  const tabs = tabsFor(user.role);
  const [moreOpen, setMoreOpen] = useState(false);
  const taskCounts = useTasks().data?.counts;
  // The coach's Unpaid tab badge: how many invoices are overdue.
  const overdue =
    useInvoices({ status: 'overdue', page: 1, pageSize: 1 }, user.role === 'coach').data?.meta
      ?.total ?? 0;
  const counts: Record<string, number> = { ...taskCounts, [UNPAID_INVOICES]: overdue };
  const tabPaths = new Set(tabs.map((t) => t.to));
  // "More" shows the total for screens that aren't tabs.
  const moreCount = items
    .filter((i) => !tabPaths.has(i.to))
    .reduce((n, i) => n + (counts[i.to] ?? 0), 0);
  usePreloadOnIntent(tabs.map((t) => t.to));
  useNativeApp();
  const location = useLocation();
  // "More" lights up when the current screen isn't one of the tabs.
  // One tab lights up: a tab with a query (Unpaid) wins over its plain screen (Finance).
  const activeTab = activeItem(tabs, location.pathname, location.search);
  const onTab = !!activeTab;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto bg-sidebar px-3 py-5 text-sidebar-foreground lg:flex">
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
        <AppHeader
          userMenu={
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className="flex cursor-pointer items-center rounded-full p-0.5 transition-opacity hover:opacity-80 active:scale-95"
              aria-label="Open menu"
              aria-haspopup="dialog"
            >
              <Avatar name={user.name} />
            </button>
          }
        />

        <OfflineBanner />
        <PullToRefresh />
        <IosInstallBanner />
        <main
          id="main"
          className="mx-auto w-full max-w-7xl flex-1 px-1.25 pt-0 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:px-2 lg:px-3 lg:pb-8"
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
              className={() => tabClass(activeTab === item)}
              aria-label={counts[item.to] ? `${item.label}, ${counts[item.to]} to do` : undefined}
            >
              {() => (
                <>
                  <TabIcon icon={item.icon} active={activeTab === item} badge={counts[item.to]} />
                  <span className="max-w-full truncate px-0.5">{item.short ?? item.label}</span>
                </>
              )}
            </NavLink>
          ))}
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
        </nav>
        <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
          <MoreSheet
            items={items}
            tabs={tabs}
            counts={counts}
            onNavigate={() => setMoreOpen(false)}
          />
        </Dialog>
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
    <div className="space-y-3" aria-busy aria-label="Loading page">
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
