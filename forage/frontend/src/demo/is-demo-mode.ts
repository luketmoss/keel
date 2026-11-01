// Demo mode needs both, as in Hive:
//   1. VITE_DEMO_MODE=true at build time
//   2. ?demo=true at runtime
// Read once per load.

let cached: boolean | null = null;

export function isDemoMode(): boolean {
  if (cached !== null) return cached;
  const envEnabled = import.meta.env.VITE_DEMO_MODE === 'true';
  const paramEnabled = new URLSearchParams(window.location.search).get('demo') === 'true';
  cached = envEnabled && paramEnabled;
  return cached;
}

/** Reset the cached value (tests only). */
export function _resetDemoModeCache(): void {
  cached = null;
}
