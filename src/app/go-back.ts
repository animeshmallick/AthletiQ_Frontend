import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/**
 * Back like a native app: return to the previous screen when there is one in this session,
 * otherwise go up to `fallback` (replacing, so back doesn't bounce between the two).
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}

/** "/students/123" → "/students"; "/feedback/a/b" → "/feedback". */
export function parentPath(path: string) {
  const first = path.split('/').filter(Boolean)[0];
  return first ? `/${first}` : '/';
}
