import { useSyncExternalStore } from 'react';

const PHONE = '(max-width: 639px)';

/** True on phone-width screens, where popups open as bottom sheets. */
export function usePhone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(PHONE);
      mq?.addEventListener?.('change', cb);
      return () => mq?.removeEventListener?.('change', cb);
    },
    () => window.matchMedia?.(PHONE).matches ?? false,
    () => false,
  );
}
