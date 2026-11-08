import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth, useUser } from '@/app/auth';
import { Field, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
} from '@/components/ui/primitives';
import { applyServerErrors, nullIfEmpty, optionalPhoneSchema, passwordSchema } from '@/lib/forms';
import { useChangePassword, useUpdateProfile } from '@/lib/queries';
import { NotificationsCard } from '@/components/notifications';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(120),
  phone: optionalPhoneSchema,
});
const passwordForm = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

function ProfileCard() {
  const user = useUser();
  const { setUser } = useAuth();
  const update = useUpdateProfile();
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, phone: user.phone ?? '' },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const u = await update.mutateAsync({ name: v.name, phone: nullIfEmpty(v.phone) });
      setUser(u);
      form.reset({ name: u.name, phone: u.phone ?? '' });
      toast.success('Profile updated');
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not update profile');
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Signed in as {user.email} · <span className="capitalize">{user.role}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={e.name?.message}>
            <Input autoComplete="name" {...form.register('name')} />
          </Field>
          <Field label="Mobile" error={e.phone?.message}>
            <Input type="tel" autoComplete="tel" {...form.register('phone')} />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            type="submit"
            loading={form.formState.isSubmitting}
            disabled={!form.formState.isDirty}
          >
            Save
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const { adopt } = useAuth();
  const change = useChangePassword();
  const form = useForm<z.infer<typeof passwordForm>>({
    resolver: zodResolver(passwordForm),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const e = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const session = await change.mutateAsync({
        currentPassword: v.currentPassword,
        newPassword: v.newPassword,
      });
      adopt(session);
      form.reset();
      toast.success('Password changed', {
        description: 'You’ve been signed out on all other devices.',
      });
    } catch (err) {
      applyServerErrors(err, form.setError, 'Could not change password');
    }
  });

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing your password signs you out everywhere else.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password" error={e.currentPassword?.message}>
            <Input
              type="password"
              autoComplete="current-password"
              {...form.register('currentPassword')}
            />
          </Field>
          <Field label="New password" error={e.newPassword?.message}>
            <Input type="password" autoComplete="new-password" {...form.register('newPassword')} />
          </Field>
          <Field label="Confirm" error={e.confirm?.message}>
            <Input type="password" autoComplete="new-password" {...form.register('confirm')} />
          </Field>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={form.formState.isSubmitting}>
            Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export function AccountPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Account" />
      <div className="space-y-4 sm:space-y-6">
        <ProfileCard />
        <NotificationsCard />
        <PasswordCard />
      </div>
    </div>
  );
}
