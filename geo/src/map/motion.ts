/** jsdom has no `matchMedia` at all — calling it unguarded throws in every
    component test that doesn't stub it, not just the ones that care about
    reduced motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
