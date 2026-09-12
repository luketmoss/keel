import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* #335 end to end, through the shell: the locate control asks the browser
   for a fix, the dot draws where the fix landed, and the callout's action
   opens the create face at that exact coordinate — the second half of the
   sequence the issue is about.
 *
 * Its own file for the same reason `App.createCairn.test.tsx` is one: the
 * map has to be stubbed far enough to hand back the handlers the layers
 * register, which `App.test.tsx`'s deliberate `useMap: () => null` does not.
 * Built on that file's stubs, kept deliberately parallel to it. */

const mapDiv = document.createElement('div')
const fakeMap = {
  getDiv: () => mapDiv,
  getBounds: () => null,
  getZoom: () => 4,
  getCenter: () => ({ lat: () => 0, lng: () => 0 }),
  setZoom: vi.fn(),
  setCenter: vi.fn(),
  fitBounds: vi.fn(),
  panTo: vi.fn(),
  setOptions: vi.fn(),
  addListener: () => ({ remove: () => undefined }),
}

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Map: () => <div data-testid="map" />,
  Marker: () => null,
  AdvancedMarker: ({ onClick, children }: { onClick?: () => void; children?: React.ReactNode }) => (
    <div data-testid="advanced-marker" onClick={onClick}>
      {children}
    </div>
  ),
  Polyline: () => null,
  useMap: () => fakeMap,
  useMap3D: () => null,
  useMapsLibrary: () => null,
  useApiIsLoaded: () => true,
  MapMode: { HYBRID: 'HYBRID', SATELLITE: 'SATELLITE' },
  GestureHandling: { GREEDY: 'GREEDY' },
  Map3D: () => null,
}))

class FakeCircle {
  constructor(public options: Record<string, unknown>) {}
  setMap() {}
}

function installGoogleMaps() {
  ;(globalThis as unknown as { google: unknown }).google = {
    maps: {
      Circle: FakeCircle,
      LatLngBounds: class {
        extend() {}
        getNorthEast() {
          return { equals: () => false }
        }
        getSouthWest() {
          return {}
        }
      },
      event: {
        addListener: () => ({ remove: () => undefined }),
        addListenerOnce: () => ({ remove: () => undefined }),
      },
    },
  }
}

let getCurrentPosition: ReturnType<typeof vi.fn>

function installGeolocation() {
  getCurrentPosition = vi.fn()
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
}

/** The browser answering the locate request. */
async function landFix(lat = 39.5, lng = -105.5, accuracy = 12) {
  await act(async () => {
    getCurrentPosition.mock.calls.at(-1)![0]({
      coords: { latitude: lat, longitude: lng, accuracy },
      timestamp: Date.now(),
    })
  })
}

async function landFailure(code: number) {
  await act(async () => {
    getCurrentPosition.mock.calls.at(-1)![1]({
      code,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    })
  })
}

async function renderApp(path = '/') {
  window.history.pushState({}, '', path)
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'a-browser-key')
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'a-client-id')
  vi.resetModules()
  const { App } = await import('./App')
  return render(<App />)
}

function mockGoogleSignIn() {
  Object.assign((globalThis as unknown as { google: Record<string, unknown> }).google, {
    accounts: {
      oauth2: {
        initTokenClient: (config: { callback: (r: { access_token: string }) => void }) => ({
          requestAccessToken: () => config.callback({ access_token: 'tok' }),
        }),
      },
    },
  })
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const href = String(url)
    if (href.includes('/about')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ user: { emailAddress: 'jane@gmail.com' } }),
      } as Response
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'cairn-folder-id',
        createdTime: '2024-01-01T00:00:00.000Z',
        files: [],
      }),
    } as Response
  })
}

async function signIn() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  })
  await screen.findByRole('button', { name: /Account: jane@gmail.com/ })
}

async function pressLocate() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Show my location' }))
  })
}

/** The dot, once a fix has landed. It is the only marker on an empty map. */
function positionDot(): HTMLElement {
  const dot = document.querySelector('.position-marker')
  if (!dot) throw new Error('no position marker')
  return dot as HTMLElement
}

function storedLooseItems(): Record<string, unknown>[] {
  return JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
}

beforeEach(() => {
  installGoogleMaps()
  installGeolocation()
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  window.localStorage.clear()
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
  delete (window as unknown as { google?: unknown }).google
})

describe('#335 — showing where you are', () => {
  it('draws no dot until the control is pressed and a fix lands', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    expect(document.querySelector('.position-marker')).toBeNull()

    await pressLocate()
    expect(document.querySelector('.position-marker')).toBeNull()

    await landFix()
    expect(document.querySelector('.position-marker')).not.toBeNull()
  })

  it('moves the dot to the fresh fix on a second press', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await pressLocate()
    await landFix(39.5, -105.5)
    fireEvent.click(positionDot().closest('[data-testid="advanced-marker"]')!)
    expect(screen.getByText('Accurate to about 39 ft')).toBeDefined()

    await pressLocate()
    await landFix(40.1, -106.2, 400)
    fireEvent.click(positionDot().closest('[data-testid="advanced-marker"]')!)

    expect(screen.getByText('Accurate to about 0.2 mi')).toBeDefined()
  })

  it('says location is blocked on a denial, and draws no dot', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await pressLocate()
    await landFailure(1)

    expect(
      screen.getByText(
        'Location is blocked. Allow location for this site in your browser, then try again.',
      ),
    ).toBeDefined()
    expect(document.querySelector('.position-marker')).toBeNull()
  })

  it('says something different when the fix is simply unavailable', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await pressLocate()
    await landFailure(2)

    expect(
      screen.getByText("Couldn't find your location. Try again with a clearer view of the sky."),
    ).toBeDefined()
  })

  it('retries after a denial rather than staying stuck', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await pressLocate()
    await landFailure(1)
    await pressLocate()
    await landFix()

    expect(document.querySelector('.position-marker')).not.toBeNull()
  })
})

describe('#335 — dropping a cairn on the fix', () => {
  it('opens the create face at the fix, and saves a placed cairn there', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await pressLocate()
    await landFix(39.5, -105.5)

    fireEvent.click(positionDot().closest('[data-testid="advanced-marker"]')!)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Drop a cairn here' }))
    })

    // The existing create face, not a second one invented for this path.
    expect(screen.getByLabelText('Name')).toBeDefined()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Camp 2' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    })

    const [saved] = storedLooseItems()
    expect(saved).toMatchObject({
      kind: 'cairn',
      name: 'Camp 2',
      // A person pressed a button to put a cairn at a coordinate — which is
      // what `placed` means, and it earns `placed`'s guarantee that
      // interpolation will never move it again.
      positionSource: 'placed',
      position: { lat: 39.5, lng: -105.5 },
    })
    await waitFor(() => expect(window.location.pathname).toBe(`/cairns/${saved.id}`))
  })

  it('leaves the dot on the map after the cairn is created', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await pressLocate()
    await landFix()
    fireEvent.click(positionDot().closest('[data-testid="advanced-marker"]')!)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Drop a cairn here' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    })

    expect(document.querySelector('.position-marker')).not.toBeNull()
  })

  it('takes the pin away on Cancel and keeps the dot', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await pressLocate()
    await landFix()
    fireEvent.click(positionDot().closest('[data-testid="advanced-marker"]')!)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Drop a cairn here' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    expect(document.querySelector('.cairn-draft-marker')).toBeNull()
    expect(document.querySelector('.position-marker')).not.toBeNull()
  })
})
