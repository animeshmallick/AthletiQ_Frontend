import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches (re-renders when it changes). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(query);
      mq?.addEventListener?.('change', cb);
      return () => mq?.removeEventListener?.('change', cb);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}

/** True on phone-width screens, where popups open as bottom sheets. */
export const usePhone = () => useMedia('(max-width: 639px)');
