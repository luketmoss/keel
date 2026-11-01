import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _resetDemoModeCache, isDemoMode } from './is-demo-mode';

const env = import.meta.env as Record<string, string | undefined>;

function setQuery(search: string) {
  window.history.replaceState(null, '', `/${search}`);
}

describe('isDemoMode()', () => {
  beforeEach(_resetDemoModeCache);
  afterEach(() => {
    _resetDemoModeCache();
    delete env.VITE_DEMO_MODE;
    setQuery('');
  });

  it('is on with VITE_DEMO_MODE=true and ?demo=true', () => {
    env.VITE_DEMO_MODE = 'true';
    setQuery('?demo=true');
    expect(isDemoMode()).toBe(true);
  });

  it('a build without VITE_DEMO_MODE ignores ?demo=true', () => {
    setQuery('?demo=true');
    expect(isDemoMode()).toBe(false);
  });

  it('is off with the build flag but no query', () => {
    env.VITE_DEMO_MODE = 'true';
    expect(isDemoMode()).toBe(false);
  });

  it('VITE_DEMO_MODE=false is off', () => {
    env.VITE_DEMO_MODE = 'false';
    setQuery('?demo=true');
    expect(isDemoMode()).toBe(false);
  });

  it('is read once per load', () => {
    env.VITE_DEMO_MODE = 'true';
    setQuery('?demo=true');
    expect(isDemoMode()).toBe(true);
    delete env.VITE_DEMO_MODE;
    expect(isDemoMode()).toBe(true);
  });
});
