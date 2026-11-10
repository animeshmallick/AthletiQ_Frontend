import { zodResolver } from '@hookform/resolvers/zod';
import {
  Clock3,
  KeyRound,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  UserCheck,
  UserX,
  UsersRound,
} from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useUser } from '@/app/auth';
import {
  Avatar,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  ListSkeleton,
  PageHeader,
  SearchInput,
} from '@/components/common';
import { ShareLinkDialog } from '@/components/share-link-dialog';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/controls';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import { Badge, Card, Input } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatInstant, formatPhone, formatShortDate, money } from '@/lib/format';
import { applyServerErrors, nullIfEmpty, optionalPhoneSchema } from '@/lib/forms';
import {
  useAccessLink,
  useCreateUser,
  useSetUserStatus,
  useSettings,
  useUpdateUser,
  useUsers,
} from '@/lib/queries';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  email: z.email('Enter a valid email'),
  phone: optionalPhoneSchema,
  roles: z.array(z.enum(['admin', 'coach'])).min(1, 'Pick at least one role'),
});
type Values = z.infer<typeof schema>;

type Link = {
  title: string;
  description: string;
  url: string;
  phone?: string | null;
  message: string;
};

const ROLE_OPTIONS = [
  { value: 'coach', label: 'Coach', hint: 'Runs batches' },
  { value: 'admin', label: 'Admin', hint: 'Manages the academy' },
] as const;

/** Coach, admin or both: two toggles, at least one on. */
function RolePicker({
  value,
  onChange,
  lockAdmin,
}: {
  value: ('admin' | 'coach')[];
  onChange: (roles: ('admin' | 'coach')[]) => void;
  /** You can't take away your own admin role. */
  lockAdmin: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Roles">
      {ROLE_OPTIONS.map((o) => {
        const on = value.includes(o.value);
        const locked = o.value === 'admin' && lockAdmin && on;
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={locked}
            title={locked ? 'You can’t remove your own admin role' : undefined}
            onClick={() =>
              onChange(
                on
                  ? value.filter((r) => r !== o.value)
                  : (['admin', 'coach'] as const).filter((r) => r === o.value || value.includes(r)),
              )
            }
            className={cn(
              'flex cursor-pointer flex-col items-start rounded-xl border p-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70',
              on ? 'border-primary bg-primary/8 ring-1 ring-primary' : 'hover:bg-muted/60',
            )}
          >
            <span className="flex items-center gap-1.5 text-[13px] font-semibold">
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded border text-[10px]',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
                )}
              >
                {on ? '✓' : ''}
              </span>
              {o.label}
            </span>
            <span className="text-[11px] text-muted-foreground">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

function UserDialog({
  user,
  onClose,
  onInvited,
}: {
  user?: User;
  onClose: () => void;
  onInvited: (l: Link) => void;
}) {
  const me = useUser();
  const create = useCreateUser();
  const update = useUpdateUser();
  const settings = useSettings();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      roles: user?.roles ?? (user ? [user.role] : ['coach']),
    },
  });
  const e = form.formState.errors;
  const roles = useWatch({ control: form.control, name: 'roles' });

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      if (user) {
        await update.mutateAsync({
          id: user.id,
          name: v.name,
          email: v.email,
          phone: nullIfEmpty(v.phone),
          roles: v.roles,
        });
        toast.success('Details updated');
        onClose();
      } else {
        const res = await create.mutateAsync({
          name: v.name,
          email: v.email,
          phone: nullIfEmpty(v.phone),
          role: v.roles.includes('coach') ? 'coach' : 'admin',
          roles: v.roles,
        });
        onClose();
        onInvited({
          title: `Invite ${res.user.name}`,
          description:
            'Share this one-time link. It expires in 72 hours and lets them set their password.',
          url: res.inviteUrl,
          phone: res.user.phone,
          message: `Hi ${res.user.name.split(' ')[0]}, you've been invited to ${settings.data?.name ?? 'AthletiQ'} as ${(res.user.roles ?? [res.user.role]).length > 1 ? 'an admin and coach' : `a ${res.user.role}`}. Set up your account here:`,
        });
      }
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not save user');
    }
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? `Edit ${user.name}` : 'Invite a team member'}</DialogTitle>
          <DialogDescription>
            {user ? 'Update contact details.' : 'They’ll get a link to set their own password.'}
          </DialogDescription>
        </DialogHeader>
        <form id="user-form" onSubmit={onSubmit} noValidate className="space-y-3">
          <Field label="Full name" required error={e.name?.message}>
            <Input autoFocus {...form.register('name')} />
          </Field>
          <Field label="Email" required error={e.email?.message}>
            <Input type="email" {...form.register('email')} />
          </Field>
          <Field
            label="Mobile"
            error={e.phone?.message}
            hint="Used to share the invite on WhatsApp."
          >
            <Input type="tel" inputMode="tel" {...form.register('phone')} />
          </Field>
          <Field
            label="Roles"
            error={e.roles?.message}
            hint="Someone with both signs in once and switches between admin and coach."
          >
            <RolePicker
              value={roles}
              onChange={(r) =>
                form.setValue('roles', r, { shouldValidate: true, shouldDirty: true })
              }
              lockAdmin={!!user && user.id === me.id}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" loading={form.formState.isSubmitting}>
            {user ? 'Save' : 'Create invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CoachesPage() {
  const me = useUser();
  const [role, setRole] = useState<'coach' | 'admin'>('coach');
  const [search, setSearch] = useState('');
  const q = useUsers({ role, search: search || undefined, pageSize: 100 });
  const accessLink = useAccessLink();
  const setStatus = useSetUserStatus();
  const settings = useSettings();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [disabling, setDisabling] = useState<User | null>(null);

  async function sendLink(u: User) {
    try {
      const res = await accessLink.mutateAsync(u.id);
      setLink({
        title: res.type === 'invite' ? `Invite link for ${u.name}` : `Password reset for ${u.name}`,
        description:
          res.type === 'invite'
            ? 'A fresh invite link — earlier links no longer work.'
            : 'A one-time link to choose a new password. Valid for 24 hours.',
        url: res.url,
        phone: u.phone,
        message:
          res.type === 'invite'
            ? `Hi ${u.name.split(' ')[0]}, here's your invite to ${settings.data?.name ?? 'AthletiQ'}:`
            : `Hi ${u.name.split(' ')[0]}, use this link to reset your ${settings.data?.name ?? 'AthletiQ'} password:`,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        description="Coaches and admins who can sign in."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Invite
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Segmented
          ariaLabel="Role"
          value={role}
          onChange={setRole}
          options={[
            { value: 'coach', label: 'Coaches' },
            { value: 'admin', label: 'Admins' },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search name, email or phone…"
          className="sm:w-80"
        />
      </div>
      {q.isPending ? (
        <ListSkeleton rows={5} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : q.data.data.length === 0 ? (
        <EmptyState
          icon={<UsersRound />}
          title={`No ${role}s yet`}
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus /> Invite
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-1.5 *:min-w-0 sm:grid-cols-2 sm:gap-2 xl:grid-cols-3">
          {q.data.data.map((u) => (
            <Card
              key={u.id}
              className={cn('flex flex-col gap-1.5 p-1.5', u.status === 'disabled' && 'opacity-70')}
            >
              <div className="flex items-start gap-2">
                <span className="relative shrink-0">
                  <Avatar name={u.name} className="size-9" />
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-card',
                      u.status === 'active'
                        ? 'bg-success'
                        : u.status === 'invited'
                          ? 'bg-warning'
                          : 'bg-muted-foreground/50',
                    )}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[14px] font-semibold">{u.name}</span>
                    {u.id === me.id && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">(you)</span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {/* Every role they hold (someone can be both admin and coach). */}
                    {(u.roles ?? [u.role]).map((r) => (
                      <Badge key={r} variant="muted" className="h-5 px-1.5 text-[10px] capitalize">
                        {r}
                      </Badge>
                    ))}
                    {u.status !== 'active' && (
                      <Badge
                        variant={u.status === 'invited' ? 'warning' : 'muted'}
                        className="capitalize"
                      >
                        {u.status}
                      </Badge>
                    )}
                  </div>
                </div>
                {u.id !== me.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Manage ${u.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing(u)}>
                        <Pencil /> Edit details
                      </DropdownMenuItem>
                      {u.status !== 'disabled' && (
                        <DropdownMenuItem onSelect={() => void sendLink(u)}>
                          <KeyRound />{' '}
                          {u.status === 'invited' ? 'New invite link' : 'Password reset link'}
                        </DropdownMenuItem>
                      )}
                      {u.status === 'disabled' ? (
                        <DropdownMenuItem
                          onSelect={() =>
                            setStatus.mutate(
                              { id: u.id, status: 'active' },
                              {
                                onSuccess: () => toast.success(`${u.name} re-enabled`),
                                onError: (e) => toast.error(errorMessage(e)),
                              },
                            )
                          }
                        >
                          <UserCheck /> Enable account
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem destructive onSelect={() => setDisabling(u)}>
                          <UserX /> Disable account
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {role === 'coach' && (
                <div className="grid grid-cols-3 gap-0.5">
                  {[
                    { label: 'Batches', value: String(u.activeBatches ?? 0) },
                    { label: 'Students', value: String(u.students ?? 0) },
                    {
                      label: 'On time · 30d',
                      value:
                        u.onTimeRate === null || u.onTimeRate === undefined
                          ? '—'
                          : `${u.onTimeRate}%`,
                      hint: `${u.checkIns30 ?? 0} check-ins`,
                    },
                    {
                      label: 'Cash held',
                      value: money(u.cashHeld ?? 0),
                      warn: (u.cashHeld ?? 0) > 0,
                    },
                    { label: 'Owed to them', value: money(u.owed ?? 0) },
                    {
                      label: 'Last seen',
                      value: u.lastLoginAt ? formatShortDate(u.lastLoginAt.slice(0, 10)) : 'Never',
                    },
                  ].map((x) => (
                    <div
                      key={x.label}
                      className="min-w-0 rounded-md bg-muted/40 px-1.5 py-0.5"
                      title={x.hint}
                    >
                      <p className="truncate text-[10px] font-medium text-muted-foreground">
                        {x.label}
                      </p>
                      <p
                        className={cn(
                          'tabular truncate text-[12px] font-bold',
                          x.warn && 'text-warning-foreground dark:text-warning',
                        )}
                      >
                        {x.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {role === 'admin' && (
                <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Clock3 className="size-3.5" />
                  {u.lastLoginAt
                    ? `Last signed in ${formatInstant(u.lastLoginAt)}`
                    : 'Never signed in'}
                </p>
              )}

              {u.phone && (
                <div className="mt-auto flex gap-1">
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 text-[12px] pointer-coarse:h-7"
                  >
                    <a href={`tel:${u.phone}`} aria-label={`Call ${u.name}`}>
                      <Phone /> {formatPhone(u.phone)}
                    </a>
                  </Button>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="h-7 pointer-coarse:h-7"
                    aria-label={`WhatsApp ${u.name}`}
                  >
                    <a
                      href={`https://wa.me/${u.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="text-success" />
                    </a>
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <UserDialog
          user={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onInvited={setLink}
        />
      )}
      <ShareLinkDialog link={link} onClose={() => setLink(null)} />
      <ConfirmDialog
        open={disabling !== null}
        onOpenChange={(o) => !o && setDisabling(null)}
        title={`Disable ${disabling?.name}?`}
        description="They’ll be signed out everywhere and can’t sign in until re-enabled. Coaches with active batches must have those reassigned first."
        confirmLabel="Disable"
        destructive
        loading={setStatus.isPending}
        onConfirm={() =>
          disabling &&
          setStatus.mutate(
            { id: disabling.id, status: 'disabled' },
            {
              onSuccess: () => (toast.success('Account disabled'), setDisabling(null)),
              onError: (e) => toast.error(errorMessage(e)),
            },
          )
        }
      />
    </div>
  );
}
