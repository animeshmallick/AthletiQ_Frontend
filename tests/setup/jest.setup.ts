import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { TextDecoder, TextEncoder } from 'node:util';
import { tokenStore } from '@/lib/api';

// jsdom gaps used by Radix UI, Recharts and the app.
Object.assign(globalThis, {
  TextEncoder: globalThis.TextEncoder ?? TextEncoder,
  TextDecoder: globalThis.TextDecoder ?? TextDecoder,
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Element.prototype.scrollIntoView = function scrollIntoView() {};
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => undefined;
window.HTMLElement.prototype.scrollTo = () => undefined;
window.open = jest.fn(() => null) as unknown as typeof window.open;
URL.createObjectURL = jest.fn(() => 'blob:test');
URL.revokeObjectURL = jest.fn();

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: jest.fn(async () => undefined) },
  configurable: true,
});

afterEach(() => {
  cleanup();
  tokenStore.set(null);
  localStorage.clear();
  jest.useRealTimers();
});

// Recharts measures its container; jsdom has no layout, so silence that one expected warning.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('of chart should be greater than 0')) return;
  originalWarn(...args);
};
