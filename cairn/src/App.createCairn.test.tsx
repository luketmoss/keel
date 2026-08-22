import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* #156 end to end, through the shell: the gesture opens the create face,
   the face commits, and what lands in the store is a placed cairn owned by
   whatever the gesture's context was.
 *
 * Its own file rather than more cases in `App.test.tsx` because it needs a
 * different map stub — that suite's `useMap: () => null` is deliberate (it
 * proves the app works with no map at all), and the gesture has nothing to
 * attach to under it. Here the map is stubbed just far enough to hand back
 * the `contextmenu` handler the gesture registers, which is the one thing
 * this flow starts from. */

let contextMenuHandler: ((event: { latLng: { lat: () => number; lng: () => number } }) => void) | undefined

/** Enough of a `google.maps.Map` for the layers the shell mounts around the
    gesture — they read the camera to decide clustering and fitting, and a
    missing method there fails the render before this flow starts. */
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
  AdvancedMarker: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="advanced-marker">{children}</div>
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

/** Installed per test rather than once at module scope: the teardown below
    deletes `window.google` — which is the same object — so a module-scope
    stub would only survive the first case. */
function installGoogleMaps() {
  ;(globalThis as unknown as { google: unknown }).google = {
    maps: {
      event: {
        addListener: (
          _map: unknown,
          event: string,
          handler: (e: { latLng: { lat: () => number; lng: () => number } }) => void,
        ) => {
          if (event === 'contextmenu') contextMenuHandler = handler
          return { remove: () => undefined }
        },
      },
    },
  }
}

async function renderApp(path = '/') {
  window.history.pushState({}, '', path)
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'a-browser-key')
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'a-client-id')
  vi.resetModules()
  const { App } = await import('./App')
  return render(<App />)
}

/** #95/#73: a disconnected shell shows nothing and refuses every write, so
    every case here signs in first. Drive is stubbed to the minimum the
    sign-in path reads. */
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
      return { ok: true, status: 200, json: async () => ({ user: { emailAddress: 'jane@gmail.com' } }) } as Response
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'cairn-folder-id', createdTime: '2024-01-01T00:00:00.000Z', files: [] }),
    } as Response
  })
}

async function signIn() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  })
  await screen.findByRole('button', { name: /Account: jane@gmail.com/ })
}

/** The gesture, as the map delivers it. */
async function rightClickMap(lat = -23.7, lng = 133.2) {
  await act(async () => {
    contextMenuHandler?.({ latLng: { lat: () => lat, lng: () => lng } })
  })
}

function storedLooseItems(): Record<string, unknown>[] {
  return JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
}

beforeEach(() => {
  contextMenuHandler = undefined
  installGoogleMaps()
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  window.localStorage.clear()
  delete (window as unknown as { google?: unknown }).google
})

describe('#156 — right-clicking the map opens the create face', () => {
  it('opens the face with the pin placed, and names it in the search card', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()

    // The face, with the name field focused and ready.
    expect(screen.getByLabelText('Name')).toBeDefined()
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
    // The search card's centre slot: the typed name over `new cairn`.
    expect(screen.getByText('New cairn')).toBeDefined()
    expect(screen.getByText('new cairn')).toBeDefined()
    // The pin is already down, drawn selected — a draft that showed a form
    // but no marker would not say where the cairn is going.
    const pin = document.querySelector('.cairn-draft-marker .cairn-marker--pin')
    expect(pin).not.toBeNull()
    expect(pin?.classList.contains('cairn-marker--selected')).toBe(true)
  })

  it('takes the pin away again on Cancel', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    expect(document.querySelector('.cairn-draft-marker')).toBeNull()
  })

  it('follows the icon picker live, so the pin shows what it will become', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()
    expect(document.querySelector('.cairn-draft-marker .cairn-marker__pin-dot')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'campsite' }))

    // The unmarked dot gives way to the chosen glyph.
    expect(document.querySelector('.cairn-draft-marker .cairn-marker__pin-dot')).toBeNull()
    expect(document.querySelector('.cairn-draft-marker .cairn-icon-glyph')).not.toBeNull()
  })

  it('defaults the date to today, in local time rather than UTC', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()

    /* Derived a different way from the implementation's, on purpose: `en-CA`
       formats as `yyyy-mm-dd` in the *local* zone, so this disagrees with a
       UTC-based default on every machine where the two dates differ — and
       disagrees with a wrong format everywhere. */
    const today = new Date().toLocaleDateString('en-CA')
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(today)
  })

  it('hides the filter chips while the face is open', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    expect(screen.getByRole('group', { name: 'Filter' })).toBeDefined()

    await rightClickMap()

    expect(screen.queryByRole('group', { name: 'Filter' })).toBeNull()
  })

  it('says the cairn will be loose when nothing was open', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()

    expect(screen.getByText('(nothing was open — this will be loose)')).toBeDefined()
  })

  it('keeps typed values when a second right-click moves the pin', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap(-23.7, 133.2)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ellery Creek camp' } })

    await rightClickMap(-24.9, 132.1)

    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Ellery Creek camp')
  })
})

describe('#156 — the gesture’s context decides ownership', () => {
  /** A trip in `localStorage`, which is where the shell reads its index
      from — enough to have one *open*, which is all this case is about. */
  function seedTrip(tripId: string) {
    const entry = {
      id: tripId,
      name: 'Larapinta',
      status: 'planned',
      startDate: null,
      endDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    window.localStorage.setItem('cairn.trips.index', JSON.stringify([entry]))
    window.localStorage.setItem(`cairn.trips.trip.${tripId}`, JSON.stringify({ ...entry, notes: '' }))
  }

  it('names the open trip in the readout, before there is anything to undo', async () => {
    mockGoogleSignIn()
    seedTrip('trip-7')
    await renderApp('/trips/trip-7')
    await signIn()

    await rightClickMap()

    expect(screen.getByText('(a trip was open when you clicked)')).toBeDefined()
    expect(screen.getByText('trip-7')).toBeDefined()
    // A trip-owned cairn is not a loose one — nothing goes to the loose
    // store, whatever happens next.
    expect(storedLooseItems()).toHaveLength(0)
  })

  /* The trip face holds the writer that owns the trip's `cairns/` folder,
     so it has to survive the create face being open. Replacing it instead
     of hiding it unmounts that writer — and Create then has nothing to call
     and fails on every trip-scoped cairn. */
  it('keeps the trip face mounted underneath, so Create has a writer to call', async () => {
    mockGoogleSignIn()
    seedTrip('trip-7')
    await renderApp('/trips/trip-7')
    await signIn()
    await waitFor(() => expect(document.querySelector('.trip-detail')).not.toBeNull())

    await rightClickMap()

    // Still mounted, just not shown.
    const tripFace = document.querySelector('.trip-detail')
    expect(tripFace).not.toBeNull()
    expect(tripFace?.closest('[hidden]')).not.toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    })

    // A missing writer reports itself; its absence is the whole assertion.
    expect(screen.queryByText("Couldn't save this cairn — try again.")).toBeNull()
    // And the face closed, which only happens on a write that landed.
    expect(screen.queryByLabelText('Name')).toBeNull()
  })
})

describe('#156 — Create', () => {
  it('saves a loose cairn whose positionSource is placed, and opens it', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap(-23.7, 133.2)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ellery Creek camp' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    })

    const [saved] = storedLooseItems()
    expect(saved).toMatchObject({
      kind: 'cairn',
      name: 'Ellery Creek camp',
      positionSource: 'placed',
      position: { lat: -23.7, lng: 133.2 },
      icon: null,
      image: null,
    })
    // Landing on the new cairn's own face is the confirmation.
    await waitFor(() => expect(window.location.pathname).toBe(`/cairns/${saved.id}`))
  })

  it('commits the icon’s label when the name is left empty', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()
    fireEvent.click(screen.getByRole('button', { name: 'campsite' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    })

    expect(storedLooseItems()[0]).toMatchObject({ name: 'Campsite', icon: 'campsite' })
  })

  it('commits `Cairn` when neither a name nor an icon was chosen', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    })

    expect(storedLooseItems()[0]).toMatchObject({ name: 'Cairn', icon: null })
  })

  it('leaves the map out of any placement mode afterwards', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    })

    expect(screen.queryByLabelText('Name')).toBeNull()
  })
})

describe('#156 — Cancel', () => {
  it('writes nothing and returns to the list face', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Discarded' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })

    expect(storedLooseItems()).toHaveLength(0)
    expect(screen.queryByLabelText('Name')).toBeNull()
    // The chips are back, which is the list face being back.
    expect(screen.getByRole('group', { name: 'Filter' })).toBeDefined()
  })

  it('treats Escape as Cancel', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })

    expect(storedLooseItems()).toHaveLength(0)
    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('treats Back in the search card as Cancel', async () => {
    mockGoogleSignIn()
    await renderApp()
    await signIn()

    await rightClickMap()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))
    })

    expect(storedLooseItems()).toHaveLength(0)
    expect(screen.queryByLabelText('Name')).toBeNull()
  })
})
