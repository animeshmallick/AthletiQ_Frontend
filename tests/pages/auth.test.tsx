import { LoginPage } from '@/pages/auth/login';
import { AcceptInvitePage } from '@/pages/auth/token-password';
import { coachUser, mockApi, renderPage, screen, sessionFor, waitFor } from '../utils';

describe('LoginPage', () => {
  it('validates before calling the API', async () => {
    const api = mockApi({});
    const { user } = await renderPage(<LoginPage />, { path: '/login', route: '/login' });
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(api.find('POST /auth/login')).toHaveLength(0);
  });

  it('shows the server error for wrong credentials', async () => {
    mockApi({
      'POST /auth/login': () => ({
        status: 401,
        body: { error: { code: 'UNAUTHENTICATED', message: 'Incorrect email or password' } },
      }),
    });
    const { user } = await renderPage(<LoginPage />, { path: '/login', route: '/login' });
    await user.type(await screen.findByLabelText('Email'), 'coach@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password');
  });

  it('signs in and redirects', async () => {
    const api = mockApi({ 'POST /auth/login': () => sessionFor(coachUser) });
    const { user, router } = await renderPage(<LoginPage />, { path: '/login', route: '/login' });
    await user.type(await screen.findByLabelText('Email'), 'coach@example.com');
    await user.type(screen.getByLabelText('Password'), 'Passw0rd!');
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.find('POST /auth/login')[0]!.body).toEqual({
      email: 'coach@example.com',
      password: 'Passw0rd!',
    });
  });
});

describe('AcceptInvitePage', () => {
  it('sets a password from an invite link', async () => {
    const api = mockApi({
      'GET /auth/invite': () => ({ name: 'Ravi Kumar', email: 'ravi@example.com' }),
      'POST /auth/accept-invite': () => sessionFor(coachUser),
    });
    const { user, router } = await renderPage(<AcceptInvitePage />, {
      path: '/accept-invite',
      route: '/accept-invite?token=abcdefghijklmnop',
    });
    expect(await screen.findByText('ravi@example.com')).toBeInTheDocument();
    await user.type(screen.getByLabelText('New password'), 'NewPass123');
    await user.type(screen.getByLabelText('Confirm password'), 'Mismatch123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'NewPass123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(api.find('POST /auth/accept-invite')[0]!.body).toEqual({
      token: 'abcdefghijklmnop',
      password: 'NewPass123',
    });
  });

  it('explains expired links', async () => {
    mockApi({
      'GET /auth/invite': () => ({
        status: 400,
        body: { error: { code: 'BAD_REQUEST', message: 'This link is invalid or has expired.' } },
      }),
    });
    await renderPage(<AcceptInvitePage />, {
      path: '/accept-invite',
      route: '/accept-invite?token=expiredtoken123',
    });
    expect(await screen.findByText('Link expired')).toBeInTheDocument();
    expect(screen.getByText('This link is invalid or has expired.')).toBeInTheDocument();
  });

  it('handles a missing token', async () => {
    mockApi({});
    await renderPage(<AcceptInvitePage />, { path: '/accept-invite', route: '/accept-invite' });
    expect(await screen.findByText('This link is missing its token.')).toBeInTheDocument();
  });
});
