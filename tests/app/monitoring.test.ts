import { reportError, scrubUrl } from '@/app/monitoring';

describe('monitoring', () => {
  it('strips query strings and fragments from URLs', () => {
    expect(scrubUrl('https://x.in/reset-password?token=abc#t')).toBe('https://x.in/reset-password');
    expect(scrubUrl(undefined)).toBeUndefined();
  });

  it('is a no-op without a DSN', () => {
    expect(() => reportError(new Error('x'))).not.toThrow();
  });
});
