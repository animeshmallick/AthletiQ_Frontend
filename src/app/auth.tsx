import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, refreshSession, request, tokenStore, type Session } from '@/lib/api';
import type { Role, User } from '@/lib/types';
import { unregisterPush } from './native';
import { disableWebPush } from './web-push';

interface AuthState {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  /** Adopts a session returned by invite/reset/change-password flows. */
  adopt: (session: Session) => void;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  hasRole: (role: Role) => boolean;
  /** Switches this sign-in to another role the user holds, then reloads the app. */
  switchRole: (role: Role) => Promise<void>;
}

const chosenKey = (userId: string) => `atq-role-chosen:${userId}`;

/** Has this person (with several roles) already picked a role on this device? */
export function hasChosenRole(userId: string) {
  try {
    return localStorage.getItem(chosenKey(userId)) === '1';
  } catch {
    return true;
  }
}

export function rememberRoleChosen(userId: string) {
  try {
    localStorage.setItem(chosenKey(userId), '1');
  } catch {
    // Private mode: the chooser may show again next time, which is harmless.
  }
}

/** Reload the app (a separate function so tests can replace it). */
export const appReload = { now: () => window.location.assign('/') };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUserState] = useState<User | null>(null);

  // Keep React state in sync with the token store (e.g. refresh failure elsewhere → signed out).
  useEffect(
    () =>
      tokenStore.subscribe((session) => {
        if (session) {
          setUserState(session.user);
          setStatus('authenticated');
        } else {
          setUserState(null);
          setStatus('anonymous');
        }
      }),
    [],
  );

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    void refreshSession().then((s) => {
      if (!s) setStatus('anonymous');
    });
  }, []);

  const adopt = useCallback((session: Session) => tokenStore.set(session), []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await request<Session>('/auth/login', {
      method: 'POST',
      body: { email, password },
      noRetry: true,
    });
    tokenStore.set(session);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await Promise.all([unregisterPush(), disableWebPush()]);
      await request('/auth/logout', { method: 'POST', noRetry: true });
    } catch {
      // Signing out locally must succeed even if the network call fails.
    } finally {
      tokenStore.set(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const switchRole = useCallback(
    async (role: Role) => {
      const session = await request<Session>('/auth/switch-role', {
        method: 'POST',
        body: { role },
        noRetry: true,
      });
      rememberRoleChosen(session.user.id);
      queryClient.clear();
      tokenStore.set(session);
      appReload.now();
    },
    [queryClient],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      login,
      adopt,
      logout,
      setUser: setUserState,
      hasRole: (role) => user?.role === role,
      switchRole,
    }),
    [status, user, login, adopt, logout, switchRole],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in user (only call under an authenticated route). */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called without an authenticated user');
  return user;
}

export const authApi = {
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<Session>('/auth/change-password', { currentPassword, newPassword }),
};
