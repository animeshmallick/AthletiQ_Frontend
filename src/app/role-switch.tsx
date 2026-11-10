/**
 * For people who are both an admin and a coach: one account, two roles. They pick a role the
 * first time on a device (afterwards they open in the role they used last), see which role
 * they're in, and switch from the menu — the app reloads into the other role.
 */
import { ArrowLeftRight, Briefcase, Check, ChevronDown, ShieldCheck, Whistle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays';
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

const ROLE_TONE: Record<Role, { pill: string; icon: string }> = {
  admin: {
    pill: 'border-primary/25 bg-primary/8 text-primary hover:bg-primary/12',
    icon: 'bg-primary text-primary-foreground',
  },
  coach: {
    pill: 'border-success/30 bg-success/10 text-success hover:bg-success/15',
    icon: 'bg-success text-success-foreground',
  },
};
const ROLE_ICON: Record<Role, typeof Briefcase> = { admin: Briefcase, coach: Whistle };

/**
 * The role in use, as a pill in the header (only for people with both roles). Tapping it lists
 * both roles; picking the other switches and reloads the app.
 */
export function RoleBadge({ className }: { className?: string }) {
  const user = useUser();
  const { switchRole } = useAuth();
  const [busy, setBusy] = useState<Role | null>(null);
  if (!hasBothRoles(user.roles)) return null;
  const Icon = ROLE_ICON[user.role];
  const tone = ROLE_TONE[user.role];
  async function pick(r: Role) {
    if (r === user.role) return;
    setBusy(r);
    try {
      await switchRole(r);
    } catch (err) {
      setBusy(null);
      toast.error('Could not switch role', { description: errorMessage(err) });
    }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Signed in as ${ROLE_LABEL[user.role]}. Switch role`}
          className={cn(
            'flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-full border py-0.5 pr-1.5 pl-0.5 text-[12px] font-semibold transition-colors active:scale-[0.97]',
            tone.pill,
            className,
          )}
        >
          <span className={cn('flex size-5.5 items-center justify-center rounded-full', tone.icon)}>
            <Icon className="size-3" />
          </span>
          {ROLE_LABEL[user.role]}
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Signed in as
        </p>
        <div role="radiogroup" aria-label="Role" className="space-y-1">
          {(user.roles ?? [user.role]).map((r) => {
            const RIcon = ROLE_ICON[r];
            const on = r === user.role;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy !== null}
                onClick={() => void pick(r)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl p-2 text-left transition-colors disabled:opacity-60',
                  on ? 'bg-muted' : 'hover:bg-muted/60',
                )}
              >
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-xl',
                    ROLE_TONE[r].icon,
                  )}
                >
                  <RIcon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{ROLE_LABEL[r]}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {ROLE_INFO[r].text}
                  </span>
                </span>
                {on ? (
                  <Check className="size-4 shrink-0 text-primary" />
                ) : busy === r ? (
                  <span className="text-[11px] text-muted-foreground">Switching…</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
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
