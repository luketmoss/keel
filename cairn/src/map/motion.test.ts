import { afterEach, describe, expect, it } from 'vitest'
import { prefersReducedMotion } from './motion'

function stubMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: matches && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia
}

describe('prefersReducedMotion', () => {
  afterEach(() => {
    // @ts-expect-error -- undoing the per-test stub, not a real API
    delete window.matchMedia
  })

  it('is false when matchMedia does not exist at all, as in jsdom by default', () => {
    expect(prefersReducedMotion()).toBe(false)
  })

  it('reads true from a reduce-motion match', () => {
    stubMatchMedia(true)
    expect(prefersReducedMotion()).toBe(true)
  })

  it('reads false when the query does not match', () => {
    stubMatchMedia(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})
