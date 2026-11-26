import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { isIdle, onResume, pollWhileActive } from './idle';

describe('idle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stops polling while nobody uses the app and resumes on the next tap', () => {
    const poll = pollWhileActive(60_000);
    expect(poll()).toBe(60_000);
    const resumed = jest.fn();
    const off = onResume(resumed);
    const later = Date.now() + 16 * 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    expect(isIdle()).toBe(true);
    expect(poll()).toBe(false);
    window.dispatchEvent(new Event('pointerdown'));
    expect(resumed).toHaveBeenCalledTimes(1);
    expect(poll()).toBe(60_000);
    window.dispatchEvent(new Event('keydown'));
    expect(resumed).toHaveBeenCalledTimes(1);
    off();
  });
});
