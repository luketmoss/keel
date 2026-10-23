// #576 - the rest defaults: what Settings shows and edits, what the template
// editor shows as "Default (m:ss)", and what a new workout's sets are resolved
// against when its template (or no template) leaves a section at Default.
//
// Read and written through the API (`getSettings`, `updateSetting`). Nothing
// here throws. Demo mode never calls the API: the defaults are ready at once
// and a change is kept in memory.

import { signal } from '@preact/signals';
import { isDemo } from '../api/demo-data';
import { updateSetting } from '../api/drinks';
import { DEFAULT_REST_SETTINGS, getRestSettings, type RestSettingKey, type RestSettings } from '../api/rest-times';

/** The defaults as the last read said them, or the built-in ones until a read lands. */
export const restSettings = signal<RestSettings>({ ...DEFAULT_REST_SETTINGS });
/** `loading` until the first read settles; `error` when it failed (Settings then disables the steppers). */
export const restSettingsStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

let inFlight: Promise<boolean> | null = null;

/** Read the defaults. Resolves true when they were read (or demo mode). */
export function loadRestSettings(token: string): Promise<boolean> {
  if (isDemo()) {
    restSettingsStatus.value = 'ready';
    return Promise.resolve(true);
  }
  if (inFlight) return inFlight;
  if (restSettingsStatus.value !== 'ready') restSettingsStatus.value = 'loading';
  inFlight = (async () => {
    const out = await getRestSettings(token);
    if (out.ok) {
      restSettings.value = out.data;
      restSettingsStatus.value = 'ready';
      return true;
    }
    if (restSettingsStatus.value !== 'ready') restSettingsStatus.value = 'error';
    return false;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * The defaults a new workout's sets are resolved against: the stored ones,
 * read now if they have not been yet. When they cannot be read (no API URL,
 * offline), the built-in defaults, the same values the API supplies for an
 * absent row, so creating a workout never waits on or fails for this.
 */
export async function restDefaultsForNewSets(token: string): Promise<RestSettings> {
  if (restSettingsStatus.value !== 'ready') await loadRestSettings(token);
  return restSettings.value;
}

/** Save one default, in whole seconds. Resolves true when it was saved; the signal then holds it. */
export async function saveRestSetting(key: RestSettingKey, seconds: number, token: string): Promise<boolean> {
  if (!isDemo()) {
    const out = await updateSetting(key, seconds, token);
    if (!out.ok) return false;
    const stored = Number(out.data.value);
    restSettings.value = { ...restSettings.value, [key]: Number.isInteger(stored) ? stored : seconds };
    return true;
  }
  restSettings.value = { ...restSettings.value, [key]: seconds };
  return true;
}

/** Test seam: forget everything held. */
export function resetRestSettings(): void {
  restSettings.value = { ...DEFAULT_REST_SETTINGS };
  restSettingsStatus.value = 'idle';
  inFlight = null;
}
