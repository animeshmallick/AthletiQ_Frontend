import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, KeyRound, Pencil, Plus, UserCheck, UserX, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { Badge, Card, Input, Select } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';
import { formatInstant, formatPhone, plural } from '@/lib/format';
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

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  email: z.email('Enter a valid email'),
  phone: optionalPhoneSchema,
  role: z.enum(['coach', 'admin']),
});
type Values = z.infer<typeof schema>;

type Link = {
  title: string;
  description: string;
  url: string;
  phone?: string | null;
  message: string;
};

function UserDialog({
  user,
  onClose,
  onInvited,
}: {
  user?: User;
  onClose: () => void;
  onInvited: (l: Link) => void;
}) {
  const create = useCreateUser();
  const update = useUpdateUser();
  const settings = useSettings();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      role: user?.role ?? 'coach',
    },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      if (user) {
        await update.mutateAsync({
          id: user.id,
          name: v.name,
          email: v.email,
          phone: nullIfEmpty(v.phone),
        });
        toast.success('Details updated');
        onClose();
      } else {
        const res = await create.mutateAsync({
          name: v.name,
          email: v.email,
          phone: nullIfEmpty(v.phone),
          role: v.role,
        });
        onClose();
        onInvited({
          title: `Invite ${res.user.name}`,
          description:
            'Share this one-time link. It expires in 72 hours and lets them set their password.',
          url: res.inviteUrl,
          phone: res.user.phone,
          message: `Hi ${res.user.name.split(' ')[0]}, you've been invited to ${settings.data?.name ?? 'AthletiQ'} as a ${res.user.role}. Set up your account here:`,
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
        <form id="user-form" onSubmit={onSubmit} noValidate className="space-y-4">
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
          {!user && (
            <Field label="Role">
              <Select {...form.register('role')}>
                <option value="coach">Coach — runs batches</option>
                <option value="admin">Admin — manages the academy</option>
              </Select>
            </Field>
          )}
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
        <Card className="divide-y">
          {q.data.data.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={u.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {u.name}{' '}
                  {u.id === me.id && (
                    <span className="text-xs font-normal text-muted-foreground">(you)</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {u.email}
                  {u.phone && ` · ${formatPhone(u.phone)}`}
                </p>
              </div>
              {role === 'coach' && (
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {plural(u.activeBatches ?? 0, 'batch', 'batches')}
                </span>
              )}
              <span className="hidden text-xs text-muted-foreground md:inline">
                {u.lastLoginAt ? `Last seen ${formatInstant(u.lastLoginAt)}` : 'Never signed in'}
              </span>
              <Badge
                variant={
                  u.status === 'active' ? 'success' : u.status === 'invited' ? 'warning' : 'muted'
                }
                className="capitalize"
              >
                {u.status}
              </Badge>
              {u.id !== me.id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" aria-label={`Manage ${u.name}`}>
                      Manage <ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
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
          ))}
        </Card>
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
