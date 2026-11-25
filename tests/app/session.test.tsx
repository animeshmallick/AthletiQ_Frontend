import { useQueryClient } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { useAuth } from '@/app/auth';
import { tokenStore } from '@/lib/api';
import { adminUser, coachUser, mockApi, renderPage } from '../utils';

const signIn = (user: typeof coachUser) =>
  act(() => tokenStore.set({ accessToken: 't', accessTokenExpiresIn: 900, user }));

function Probe() {
  const qc = useQueryClient();
  const { status } = useAuth();
  return (
    <div>
      <button onClick={() => qc.setQueryData(['private'], 1)}>load</button>
      <button onClick={() => (document.title = String(qc.getQueryData(['private']) ?? 'empty'))}>
        read
      </button>
      <span>{status}</span>
    </div>
  );
}

describe('signed-in data', () => {
  it('is dropped when the session ends or someone else signs in', async () => {
    mockApi({ 'POST /auth/refresh': () => ({ status: 401, body: { error: {} } }) });
    const { user } = await renderPage(<Probe />);
    const read = async () => {
      await user.click(screen.getByText('read'));
      return document.title;
    };
    signIn(coachUser);
    await user.click(await screen.findByText('load'));
    signIn(coachUser); // a token refresh keeps it
    expect(await read()).toBe('1');
    signIn(adminUser);
    expect(await read()).toBe('empty');
    await user.click(screen.getByText('load'));
    act(() => tokenStore.set(null));
    expect(await read()).toBe('empty');
  });

  it('comes back by itself after opening without a connection', async () => {
    let up = false;
    mockApi({
      'POST /auth/refresh': () =>
        up
          ? { accessToken: 't', accessTokenExpiresIn: 900, user: coachUser }
          : { status: 503, body: { error: {} } },
    });
    await renderPage(<Probe />);
    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    up = true;
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(screen.getByText('authenticated')).toBeInTheDocument());
    act(() => tokenStore.set(null));
  });
});
