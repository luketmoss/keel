import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { apiLoaded } = vi.hoisted(() => ({ apiLoaded: { current: true } }))
vi.mock('@vis.gl/react-google-maps', () => ({
  useApiIsLoaded: () => apiLoaded.current,
}))

import { use3DSupport } from './use3DSupport'

function stubGoogle(importLibrary: (name: string) => Promise<unknown>) {
  vi.stubGlobal('google', { maps: { importLibrary } })
}

function stubCustomElements(hasIt: boolean) {
  vi.stubGlobal('customElements', { get: (name: string) => (hasIt && name === 'gmp-map-3d' ? {} : undefined) })
}

describe('use3DSupport (#271)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    apiLoaded.current = true
  })

  it('reports checking before the API has loaded', () => {
    apiLoaded.current = false
    const { result } = renderHook(() => use3DSupport())
    expect(result.current.support).toBe('checking')
  })

  it('reports available once the library resolves and the custom element is registered', async () => {
    const library = { Map3DElement: class {} }
    stubGoogle(() => Promise.resolve(library))
    stubCustomElements(true)

    const { result } = renderHook(() => use3DSupport())

    await waitFor(() => expect(result.current.support).toBe('available'))
    expect(result.current.library).toBe(library)
  })

  it('reports unavailable when the library resolves but the custom element never registers (no WebGL)', async () => {
    stubGoogle(() => Promise.resolve({}))
    stubCustomElements(false)

    const { result } = renderHook(() => use3DSupport())

    await waitFor(() => expect(result.current.support).toBe('unavailable'))
  })

  it('reports unavailable when importLibrary rejects', async () => {
    stubGoogle(() => Promise.reject(new Error('nope')))

    const { result } = renderHook(() => use3DSupport())

    await waitFor(() => expect(result.current.support).toBe('unavailable'))
  })
})
