import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/* Unmocked, APIProvider injects Google's script tag and the suite makes a
   network call from CI. The stubs render just enough to tell "the map mounted"
   apart from "a panel rendered instead". */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="api-provider">{children}</div>
  ),
  Map: () => <div data-testid="map" />,
}))

/* `env.ts` reads `import.meta.env` once at module evaluation, so a stub set
   after the first import has no effect — the module registry has to be reset
   and MapView re-imported for each key. */
async function renderMapView(key?: string) {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', key)
  vi.resetModules()
  const { MapView } = await import('./MapView')
  return render(<MapView />)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('MapView', () => {
  it('renders the setup panel when no key is configured', async () => {
    await renderMapView(undefined)

    expect(screen.getByText('Map unavailable')).toBeDefined()
    expect(screen.getByText('VITE_GOOGLE_MAPS_API_KEY')).toBeDefined()
    expect(screen.queryByTestId('api-provider')).toBeNull()
  })

  it('treats a whitespace-only key as no key at all', async () => {
    await renderMapView('   ')

    expect(screen.getByText('Map unavailable')).toBeDefined()
    expect(screen.getByText('VITE_GOOGLE_MAPS_API_KEY')).toBeDefined()
    expect(screen.queryByTestId('api-provider')).toBeNull()
  })

  it('mounts the map and the auth-failure hook when a key is configured', async () => {
    await renderMapView('a-browser-key')

    expect(screen.getByTestId('map')).toBeDefined()
    expect(screen.queryByText('Map unavailable')).toBeNull()
    expect(typeof window.gm_authFailure).toBe('function')
    /* The mock is the only thing keeping the suite off the network; assert it
       rather than trusting it. */
    expect(document.querySelector('script[src*="googleapis.com"]')).toBeNull()
  })

  it('replaces the map when Google rejects the key', async () => {
    await renderMapView('a-rejected-key')

    /* Google calls this global itself, from outside React's event system. */
    await act(async () => {
      window.gm_authFailure?.()
    })

    expect(screen.getByText(/rejected the API key/)).toBeDefined()
    expect(screen.queryByTestId('map')).toBeNull()
    /* The rejection is a different fault from a missing key and must not read
       as one. */
    expect(screen.queryByText('VITE_GOOGLE_MAPS_API_KEY')).toBeNull()
  })

  it('removes the auth-failure hook on unmount', async () => {
    const { unmount } = await renderMapView('a-browser-key')

    unmount()

    expect(window.gm_authFailure).toBeUndefined()
  })
})
