/**
 * The phone "More" sheet: profile, every screen that isn't a tab (as tiles and grouped
 * lists with task counts), appearance, sign out and — for admins — deployment status.
 */
import { ChevronRight, LogOut, Monitor, Moon, Sun, X } from 'lucide-react';
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
import { DeploymentsInfo } from './deployments';
import type { NavItem } from './nav';
import { preloadRoute } from './pages';
import { useTheme, type Theme } from './theme';

const GROUPS: { key: NavItem['group']; label: string }[] = [
  { key: 'main', label: 'Coaching' },
  { key: 'manage', label: 'Manage' },
  { key: 'system', label: 'System' },
];

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

const isActive = (to: string, path: string) => (to === '/' ? path === '/' : path.startsWith(to));

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
  const web = typeof __BUILD__ !== 'undefined' ? __BUILD__ : null;

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

      <div className="space-y-4 px-3 pt-3 pb-2">
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

        {/* Screens, grouped */}
        {GROUPS.map(({ key, label }) => {
          const group = rest.filter((i) => i.group === key);
          if (!group.length) return null;
          return (
            <section key={key} aria-label={label}>
              <h3 className="mb-1.5 px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {label}
              </h3>
              {key === 'main' ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {group.map((item) => {
                    const active = isActive(item.to, pathname);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/'}
                        onClick={onNavigate}
                        onPointerDown={() => preloadRoute(item.to)}
                        className={cn(
                          'relative flex flex-col items-center gap-1 rounded-xl border bg-card px-0.5 py-2 text-center shadow-e1 transition-transform active:scale-[0.97]',
                          active && 'border-primary/50 bg-primary/5',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary',
                            active && 'bg-primary text-primary-foreground',
                          )}
                        >
                          <item.icon className="size-4.5" />
                        </span>
                        <span className="w-full truncate text-[11px] leading-tight font-medium">
                          {item.short ?? item.label}
                        </span>
                        {!!counts[item.to] && (
                          <span className="absolute top-0.5 right-0.5">
                            <CountBadge n={counts[item.to]} />
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              ) : (
                <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-e1">
                  {group.map((item) => {
                    const active = isActive(item.to, pathname);
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          onClick={onNavigate}
                          onPointerDown={() => preloadRoute(item.to)}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors active:bg-muted/60',
                            active && 'bg-primary/5 text-primary',
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80">
                            <item.icon className="size-4.5" />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          <CountBadge n={counts[item.to]} />
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

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
