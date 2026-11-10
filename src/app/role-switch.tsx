/**
 * For people who are both an admin and a coach: one account, two roles. They pick a role the
 * first time on a device (afterwards they open in the role they used last), see which role
 * they're in, and switch from the menu — the app reloads into the other role.
 */
import { ArrowLeftRight, Briefcase, ShieldCheck, Whistle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api';
import type { Role } from '@/lib/types';
import { cn } from '@/lib/utils';
import { hasChosenRole, rememberRoleChosen, useAuth, useUser } from './auth';

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', coach: 'Coach' };

const ROLE_INFO: Record<Role, { icon: typeof ShieldCheck; text: string }> = {
  admin: { icon: ShieldCheck, text: 'Run the academy: students, fees, money, team and reports.' },
  coach: { icon: Whistle, text: 'Your batches: check in, attendance, lesson plans and your cash.' },
};

export const hasBothRoles = (roles?: Role[]) => (roles?.length ?? 0) > 1;

/** Shows the role chooser the first time a two-role person opens the app on this device. */
export function useNeedsRoleChoice() {
  const user = useUser();
  const [chosen, setChosen] = useState(() => hasChosenRole(user.id));
  return {
    needed: hasBothRoles(user.roles) && !chosen,
    done: () => {
      rememberRoleChosen(user.id);
      setChosen(true);
    },
  };
}

export function RoleChooser({ onDone }: { onDone: () => void }) {
  const user = useUser();
  const { switchRole } = useAuth();
  const [busy, setBusy] = useState<Role | null>(null);
  async function pick(role: Role) {
    if (role === user.role) return onDone();
    setBusy(role);
    try {
      await switchRole(role);
    } catch (err) {
      setBusy(null);
      toast.error('Could not switch role', { description: errorMessage(err) });
    }
  }
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-5 py-10">
      <BrandMark />
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight">Hi {user.name.split(' ')[0]}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          You’re both an admin and a coach. How do you want to continue?
        </p>
      </div>
      <div className="grid w-full max-w-md gap-2.5" role="radiogroup" aria-label="Continue as">
        {(user.roles ?? [user.role]).map((r) => {
          const Icon = ROLE_INFO[r].icon;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={false}
              disabled={busy !== null}
              onClick={() => void pick(r)}
              className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3.5 text-left shadow-e1 transition-all hover:border-primary hover:shadow-e2 active:scale-[0.99] disabled:opacity-60"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">Continue as {ROLE_LABEL[r]}</span>
                <span className="block text-[12px] text-muted-foreground">{ROLE_INFO[r].text}</span>
              </span>
              {busy === r && <span className="text-[11px] text-muted-foreground">Switching…</span>}
            </button>
          );
        })}
      </div>
      <p className="max-w-md text-center text-[11px] text-muted-foreground">
        You can switch any time from the menu. Next time you’ll open in the role you used last.
      </p>
    </main>
  );
}

/** A small pill showing which role is in use (only for people with both). */
export function RoleBadge({ className }: { className?: string }) {
  const user = useUser();
  if (!hasBothRoles(user.roles)) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase',
        user.role === 'admin'
          ? 'bg-primary/10 text-primary'
          : 'bg-success/12 text-success dark:text-success',
        className,
      )}
    >
      {user.role === 'admin' ? <Briefcase className="size-3" /> : <Whistle className="size-3" />}
      {ROLE_LABEL[user.role]}
    </span>
  );
}

/** "Switch to coach / admin" for the menu. */
export function SwitchRoleButton({ className }: { className?: string }) {
  const user = useUser();
  const { switchRole } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!hasBothRoles(user.roles)) return null;
  const other = (user.roles ?? []).find((r) => r !== user.role)!;
  return (
    <Button
      variant="outline"
      className={cn('w-full justify-start rounded-2xl', className)}
      loading={busy}
      onClick={() => {
        setBusy(true);
        switchRole(other).catch((err: unknown) => {
          setBusy(false);
          toast.error('Could not switch role', { description: errorMessage(err) });
        });
      }}
    >
      <ArrowLeftRight /> Switch to {ROLE_LABEL[other]}
      <span className="ml-auto text-[11px] font-normal text-muted-foreground">
        Now: {ROLE_LABEL[user.role]}
      </span>
    </Button>
  );
}
