// #407: the Maps script is loaded once, only when asked for, and a failure
// does not stick.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMaps, mapsApiKey, resetMapsLoader } from './google-maps';
import { removeFakeGoogleMaps } from './fake-google-maps';

const KEY = 'AIza-test-key-not-real';
const scripts = () => [...document.querySelectorAll<HTMLScriptElement>('script#google-maps-js')];

beforeEach(() => {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', KEY);
  resetMapsLoader();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMapsLoader();
  removeFakeGoogleMaps();
  delete (window as any).__thriveMapsReady;
  delete (window as any).gm_authFailure;
});

/** What Google's bootstrap does once the script has run: define google.maps and call back. */
function scriptLoads() {
  (window as any).google = { maps: { importLibrary: async () => ({}) } };
  (window as any).__thriveMapsReady();
}

describe('loadMaps', () => {
  it('requests nothing until asked, then one script with the key, async loading and a callback', async () => {
    expect(scripts()).toHaveLength(0);
    const loaded = loadMaps();
    expect(scripts()).toHaveLength(1);
    const url = new URL(scripts()[0].src);
    expect(url.origin + url.pathname).toBe('https://maps.googleapis.com/maps/api/js');
    expect(url.searchParams.get('key')).toBe(KEY);
    expect(url.searchParams.get('loading')).toBe('async');
    expect(url.searchParams.get('callback')).toBe('__thriveMapsReady');
    scriptLoads();
    await expect(loaded).resolves.toBeUndefined();
  });

  it('loads once: a second call, in flight or after, reuses the same script', async () => {
    const first = loadMaps();
    const second = loadMaps();
    expect(scripts()).toHaveLength(1);
    scriptLoads();
    await Promise.all([first, second]);
    await loadMaps();
    expect(scripts()).toHaveLength(1);
  });

  it('a script that fails to load rejects and is forgotten, so Try again loads it afresh', async () => {
    const first = loadMaps();
    scripts()[0].onerror?.(new Event('error'));
    await expect(first).rejects.toThrow('maps_script');
    expect(scripts()).toHaveLength(0);

    const retry = loadMaps();
    expect(scripts()).toHaveLength(1);
    scriptLoads();
    await expect(retry).resolves.toBeUndefined();
  });

  it('gm_authFailure (a refused key) rejects, and the error never carries the key', async () => {
    const loaded = loadMaps();
    scriptLoads();
    await loaded;
    resetMapsLoader();
    const refused = loadMaps();
    (window as any).gm_authFailure();
    const err = (await refused.catch((e: Error) => e)) as Error;
    expect(err.message).toBe('maps_auth');
    expect(err.message).not.toContain(KEY);
    await expect(loadMaps()).rejects.toThrow('maps_auth');
  });

  it('with no key it rejects without adding a script', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    expect(mapsApiKey()).toBe('');
    await expect(loadMaps()).rejects.toThrow('maps_no_key');
    expect(scripts()).toHaveLength(0);
  });

  it('a library that will not import is a failure too', async () => {
    const loaded = loadMaps();
    (window as any).google = { maps: { importLibrary: async () => { throw new Error('x'); } } };
    (window as any).__thriveMapsReady();
    await expect(loaded).rejects.toThrow('maps_unavailable');
    expect(scripts()).toHaveLength(0);
  });
});
