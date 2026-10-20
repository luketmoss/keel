// The Google Maps JS API, loaded once and only when something asks for it
// (#407). Opening the app, the Day view or the Activities list requests nothing
// from maps.googleapis.com: the first Route section to render calls `loadMaps`.
//
// Google's own bootstrap, as its docs give it: a script tag with `loading=async`
// and a `callback`, then `importLibrary('maps')`. No third-party loader. A
// failure forgets the attempt, so Try again starts clean, and `gm_authFailure`
// (a bad or unauthorised key) is turned into a rejection the section can show.
//
// Nothing here logs a key, and the key is never put in an error message.

const SCRIPT_ID = 'google-maps-js';

let pending: Promise<void> | null = null;
let authFailed = false;

/** The browser key the build was given, or '' when this build has none. */
export function mapsApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim();
}

/** Forget what was loaded and what failed: for tests, and for Try again after a failed script. */
export function resetMapsLoader(): void {
  pending = null;
  authFailed = false;
  document.getElementById(SCRIPT_ID)?.remove();
}

/**
 * Resolves once `google.maps.Map` is usable. The same promise is returned
 * while one is in flight and after it succeeded, so a second Route section
 * (back, then another activity) never loads the script twice. A rejection is
 * not remembered.
 */
export function loadMaps(): Promise<void> {
  if (authFailed) return Promise.reject(new Error('maps_auth'));
  if (pending) return pending;

  const key = mapsApiKey();
  if (!key) return Promise.reject(new Error('maps_no_key'));

  const attempt = new Promise<void>((resolve, reject) => {
    const w = window as unknown as {
      google?: { maps?: { importLibrary?: (name: string) => Promise<unknown> } };
      gm_authFailure?: () => void;
      __thriveMapsReady?: () => void;
    };

    // Google calls this when the key is refused, after the script itself loaded.
    w.gm_authFailure = () => {
      authFailed = true;
      pending = null;
      reject(new Error('maps_auth'));
    };

    const fail = (reason: string) => {
      pending = null;
      document.getElementById(SCRIPT_ID)?.remove();
      reject(new Error(reason));
    };

    w.__thriveMapsReady = () => {
      const lib = w.google?.maps?.importLibrary;
      if (!lib) return fail('maps_unavailable');
      lib.call(w.google!.maps, 'maps').then(
        () => resolve(),
        () => fail('maps_unavailable'),
      );
    };

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      'https://maps.googleapis.com/maps/api/js?' +
      new URLSearchParams({ key, v: 'weekly', loading: 'async', callback: '__thriveMapsReady' }).toString();
    script.onerror = () => fail('maps_script');
    document.head.appendChild(script);
  });

  pending = attempt;
  return attempt;
}
