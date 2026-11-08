import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '@/app/auth';
import { Field } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input, Skeleton } from '@/components/ui/primitives';
import { api, errorMessage, request, type Session } from '@/lib/api';
import { passwordSchema } from '@/lib/forms';
import { AuthShell } from './auth-shell';

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });
type Values = z.infer<typeof schema>;

function TokenPasswordPage({ kind }: { kind: 'invite' | 'reset' }) {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { adopt } = useAuth();
  const navigate = useNavigate();

  const info = useQuery({
    queryKey: ['token', kind, token],
    queryFn: () =>
      api.get<{ name: string; email: string }>(
        kind === 'invite' ? '/auth/invite' : '/auth/password-reset',
        { token },
      ),
    enabled: token.length > 0,
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    try {
      const session = await request<Session>(
        kind === 'invite' ? '/auth/accept-invite' : '/auth/reset-password',
        {
          method: 'POST',
          body: { token, password },
          noRetry: true,
        },
      );
      adopt(session);
      toast.success(
        kind === 'invite'
          ? `Welcome to AthletiQ, ${session.user.name.split(' ')[0]}!`
          : 'Password updated',
      );
      navigate('/', { replace: true });
    } catch (err) {
      toast.error('Could not set password', { description: errorMessage(err) });
    }
  });

  const title = kind === 'invite' ? 'Set up your account' : 'Choose a new password';

  if (!token || info.isError) {
    return (
      <AuthShell
        title="Link expired"
        subtitle={info.isError ? errorMessage(info.error) : 'This link is missing its token.'}
      >
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={title}
      subtitle={
        info.isPending ? (
          <Skeleton className="h-4 w-48" />
        ) : (
          <>
            Signing in as <span className="font-medium text-foreground">{info.data.email}</span>
          </>
        )
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4 sm:space-y-5">
        <Field
          label="New password"
          htmlFor="password"
          error={errors.password?.message}
          hint="At least 8 characters with letters and numbers."
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            {...register('confirm')}
          />
        </Field>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={isSubmitting}
          disabled={info.isPending}
        >
          {kind === 'invite' ? 'Create account' : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  );
}

export const AcceptInvitePage = () => <TokenPasswordPage kind="invite" />;
export const ResetPasswordPage = () => <TokenPasswordPage kind="reset" />;
