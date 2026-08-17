/**
 * Vitest setup: the jsdom gaps this library actually depends on.
 *
 * Only three things are stubbed, and each is stubbed because jsdom genuinely
 * does not implement it — not to make an assertion easier.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetTourState, setTourStepCount } from '../store';

/**
 * `matchMedia` does not exist in jsdom at all. The default answer is "no
 * preference"; the reduced-motion test overrides this per-case.
 */
function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  installMatchMedia(false);

  // jsdom has no layout engine, so `scrollIntoView` is simply absent. The
  // library optional-chains it, but a spy lets the reduced-motion test assert
  // which behaviour was requested.
  Element.prototype.scrollIntoView = vi.fn();

  // Module-level tour state outlives a `render()`. A leftover `active: true`
  // from one test would leak straight into the next one.
  resetTourState();
  setTourStepCount(0);

  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  resetTourState();
});
