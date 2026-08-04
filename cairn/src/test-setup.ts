import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

// jsdom has no layout engine and doesn't implement ResizeObserver. Components
// that measure clamped text (see TripMetadataHeader's notes display) guard
// against its absence, but stub it here so the measurement effect that calls
// `observer.observe` still runs in tests rather than short-circuiting.
if (typeof ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverStub
}
