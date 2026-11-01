import { cleanup } from '@testing-library/preact';
import { afterEach } from 'vitest';

// jsdom has no matchMedia: light, unless a test replaces it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList,
});

// jsdom logs "not implemented" for scrollTo.
window.scrollTo = (() => {}) as typeof window.scrollTo;

afterEach(cleanup);
