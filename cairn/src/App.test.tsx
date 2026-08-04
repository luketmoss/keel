import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { findOrCreateTripFolder } = vi.hoisted(() => ({ findOrCreateTripFolder: vi.fn() }))
vi.mock('./drive/tripFolder', () => ({ findOrCreateTripFolder }))

const { startResumableUpload, uploadFileContent } = vi.hoisted(() => ({
  startResumableUpload: vi.fn(),
  uploadFileContent: vi.fn(),
}))
// A full passthrough except the two functions above — `imageCache.ts` and
// `usePhotoImport.ts` (exercised by `TripDetail`, rendered by other tests
// in this file) import `DriveAuthError`/`DriveRequestError` from this same
// module, which a narrower mock would silently replace with `undefined`.
vi.mock('./drive/trackFiles', async () => {
  const actual = await vi.importActual<typeof import('./drive/trackFiles')>('./drive/trackFiles')
  return { ...actual, startResumableUpload, uploadFileContent }
})

function loadKmlFixture(name: string, as = name): File {
  const buffer = readFileSync(join(__dirname, 'kml/fixtures', name))
  return new File([buffer], as)
}

function fileDataTransfer(files: File[]): DataTransfer {
  return { types: ['Files'], files: files as unknown as FileList } as unknown as DataTransfer
}

/* Unmocked, APIProvider injects Google's script tag and the suite makes a
   network call from CI. The stub renders just enough to tell "the map
   mounted" apart from a panel rendered instead. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="api-provider">{children}</div>
  ),
  Map: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  Marker: () => null,
  Polyline: () => null,
  useMap: () => null,
}))

/* `env.ts` reads `import.meta.env` once at module evaluation, mirroring
   MapView.test.tsx — the key has to be stubbed and modules reset before App
   (which pulls in MapView) is imported. */
async function renderApp(path = '/', { googleClientId }: { googleClientId?: string } = {}) {
  window.history.pushState({}, '', path)
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'a-browser-key')
  if (googleClientId) vi.stubEnv('VITE_GOOGLE_CLIENT_ID', googleClientId)
  vi.resetModules()
  const { App } = await import('./App')
  return render(<App />)
}

beforeEach(() => {
  window.history.pushState({}, '', '/')
  // #72's session persistence writes here on sign-in — cleared so one
  // test's signed-in session doesn't read back as a stored session (and a
  // "Reconnecting…" restore) in the next.
  window.sessionStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('App account bubble', () => {
  it('renders no sign-in control when VITE_GOOGLE_CLIENT_ID is unset, and the rest of the app works', async () => {
    await renderApp('/')
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(screen.getByTestId('map')).toBeDefined()
  })

  it('shows a sign-in control when a client id is configured, and the rest of the app still works', async () => {
    await renderApp('/', { googleClientId: 'a-client-id' })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined()
    expect(screen.getByTestId('map')).toBeDefined()
  })

  it('signing out returns the bubble to signed-out', async () => {
    ;(window as unknown as { google?: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback: (r: { access_token: string }) => void }) => ({
            requestAccessToken: () => config.callback({ access_token: 'tok' }),
          }),
        },
      },
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const href = String(url)
      if (href.includes('/about')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: { emailAddress: 'jane@gmail.com' } }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({ files: [] }) } as Response
    })

    await renderApp('/', { googleClientId: 'a-client-id' })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    })
    await screen.findByRole('button', { name: /Account: jane@gmail.com/ })

    fireEvent.click(screen.getByRole('button', { name: /Account: jane@gmail.com/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined()

    fetchSpy.mockRestore()
    delete (window as unknown as { google?: unknown }).google
  })
})

describe('App routing', () => {
  it('renders the map and top bar at /', async () => {
    await renderApp('/')
    expect(screen.getByTestId('map')).toBeDefined()
    expect(screen.getByRole('link', { name: 'World' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Trips' })).toBeDefined()
  })

  it('moves the status pills from the map to the trips panel when the panel is open (#80)', async () => {
    const tripId = 'trip-with-a-place'
    window.localStorage.setItem(
      'cairn.trips.index',
      JSON.stringify([
        {
          id: tripId,
          name: 'Hokkaido',
          status: 'planned',
          startDate: null,
          endDate: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          origin: { lat: 37, lng: -122 },
        },
      ]),
    )

    try {
      await renderApp('/')
      // The map draws its own pills when nothing else owns them.
      expect(screen.getAllByRole('button', { name: 'Planned' })).toHaveLength(1)

      fireEvent.click(screen.getByRole('link', { name: 'Trips' }))
      await screen.findByRole('heading', { name: 'Trips' })

      // Still exactly one — the panel's copy, not a second one alongside
      // the map's, which would let the two disagree.
      expect(screen.getAllByRole('button', { name: 'Planned' })).toHaveLength(1)
    } finally {
      window.localStorage.removeItem('cairn.trips.index')
    }
  })

  it('shows the trips panel at /trips, with the map still mounted behind it (#80)', async () => {
    await renderApp('/trips')
    expect(screen.getByTestId('map')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Trips' })).toBeDefined()
    expect(screen.getByPlaceholderText('Trip name')).toBeDefined()
    expect(screen.getByText('No trips yet')).toBeDefined()
  })

  it('closing the trips panel returns to / without unmounting the map', async () => {
    await renderApp('/trips')
    const mapNode = screen.getByTestId('map')

    fireEvent.click(screen.getByRole('button', { name: 'Close trips' }))

    expect(window.location.pathname).toBe('/')
    expect(screen.queryByRole('heading', { name: 'Trips' })).toBeNull()
    // Same DOM node, not a fresh one — the map was never unmounted by the
    // panel closing, only the panel itself was.
    expect(screen.getByTestId('map')).toBe(mapNode)
  })

  it('redirects /map to /', async () => {
    await renderApp('/map')
    expect(screen.getByTestId('map')).toBeDefined()
    expect(window.location.pathname).toBe('/')
  })

  it('redirects /world to /', async () => {
    await renderApp('/world')
    expect(screen.getByTestId('map')).toBeDefined()
    expect(window.location.pathname).toBe('/')
  })

  it('redirects an unrecognized path to /', async () => {
    await renderApp('/nonsense')
    expect(screen.getByTestId('map')).toBeDefined()
    expect(window.location.pathname).toBe('/')
  })

  it('shows a not-found state at /trips/:id when no trip matches the id', async () => {
    await renderApp('/trips/abc')
    expect(screen.getByRole('button', { name: 'Back' })).toBeDefined()
    expect(screen.getByText('Trip not found')).toBeDefined()
  })

  it('renders trip metadata for an existing trip at /trips/:id, read-only while signed out (#73)', async () => {
    const tripId = 'trip-existing-1'
    window.localStorage.setItem(
      'cairn.trips.index',
      JSON.stringify([
        { id: tripId, name: 'Hokkaido', status: 'planned', startDate: null, endDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
      ]),
    )
    window.localStorage.setItem(
      `cairn.trips.trip.${tripId}`,
      JSON.stringify({
        id: tripId,
        name: 'Hokkaido',
        status: 'planned',
        startDate: null,
        endDate: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    )

    try {
      await renderApp(`/trips/${tripId}`)

      expect(screen.getByText('Hokkaido')).toBeDefined()
      expect(screen.getByText('planned')).toBeDefined()
      expect(screen.queryByText('Trip not found')).toBeNull()

      // #73: no usable token — nothing is signed in in this render — so
      // the status field doesn't even offer editing (no select on click)
      // and the surface states why, same as a live sign-out would.
      fireEvent.click(screen.getByText('planned'))
      expect(screen.queryByRole('combobox')).toBeNull()
      expect(screen.getByText('Sign in to edit this trip.')).toBeDefined()
      expect(JSON.parse(window.localStorage.getItem(`cairn.trips.trip.${tripId}`) ?? '{}').status).toBe(
        'planned',
      )
    } finally {
      window.localStorage.removeItem('cairn.trips.index')
      window.localStorage.removeItem(`cairn.trips.trip.${tripId}`)
    }
  })

  it('marks "World" active only at / and "Trips" active at /trips', async () => {
    const first = await renderApp('/')
    expect(screen.getByRole('link', { name: 'World' }).className).toContain('--active')
    expect(screen.getByRole('link', { name: 'Trips' }).className).not.toContain('--active')
    first.unmount()

    const second = await renderApp('/trips')
    expect(screen.getByRole('link', { name: 'World' }).className).not.toContain('--active')
    expect(screen.getByRole('link', { name: 'Trips' }).className).toContain('--active')
    second.unmount()

    // /trips/:id replaces the nav with a back control — see TripDetail.
    await renderApp('/trips/abc')
    expect(screen.queryByRole('link', { name: 'World' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back' })).toBeDefined()
  })

  it('navigates via the top bar links and supports back/forward', async () => {
    await renderApp('/')

    fireEvent.click(screen.getByRole('link', { name: 'Trips' }))
    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeDefined()
    expect(window.location.pathname).toBe('/trips')

    fireEvent.click(screen.getByRole('link', { name: 'World' }))
    expect(await screen.findByTestId('map')).toBeDefined()
    expect(window.location.pathname).toBe('/')

    await act(async () => {
      window.history.back()
    })
    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeDefined()

    await act(async () => {
      window.history.forward()
    })
    expect(await screen.findByTestId('map')).toBeDefined()
  })

  function seedTrip(tripId: string) {
    window.localStorage.setItem(
      'cairn.trips.index',
      JSON.stringify([
        { id: tripId, name: 'Hokkaido', status: 'planned', startDate: null, endDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
      ]),
    )
    window.localStorage.setItem(
      `cairn.trips.trip.${tripId}`,
      JSON.stringify({
        id: tripId,
        name: 'Hokkaido',
        status: 'planned',
        startDate: null,
        endDate: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    )
  }

  function clearSeededTrip(tripId: string) {
    window.localStorage.removeItem('cairn.trips.index')
    window.localStorage.removeItem(`cairn.trips.trip.${tripId}`)
  }

  it('the back control returns to /trips when the trip was opened from a row there', async () => {
    const tripId = 'trip-from-trips'
    seedTrip(tripId)

    try {
      await renderApp('/trips')
      fireEvent.click(screen.getByText('Hokkaido'))
      expect(await screen.findByRole('button', { name: 'Back' })).toBeDefined()
      expect(window.location.pathname).toBe(`/trips/${tripId}`)

      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(await screen.findByRole('heading', { name: 'Trips' })).toBeDefined()
      expect(window.location.pathname).toBe('/trips')
    } finally {
      clearSeededTrip(tripId)
    }
  })

  it('the back control goes to / when the trip was opened by a typed URL', async () => {
    const tripId = 'trip-typed-url'
    seedTrip(tripId)

    try {
      await renderApp(`/trips/${tripId}`)
      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      expect(await screen.findByTestId('map')).toBeDefined()
      expect(window.location.pathname).toBe('/')
    } finally {
      clearSeededTrip(tripId)
    }
  })

  it('a name filter set on the panel survives a visit to a trip and back (#80)', async () => {
    const tripId = 'trip-from-trips-2'
    window.localStorage.setItem(
      'cairn.trips.index',
      JSON.stringify([
        { id: tripId, name: 'Hokkaido', status: 'planned', startDate: null, endDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'trip-other', name: 'Alta Via 1', status: 'planned', startDate: null, endDate: null, createdAt: '2026-01-01T00:00:00.000Z' },
      ]),
    )
    window.localStorage.setItem(
      `cairn.trips.trip.${tripId}`,
      JSON.stringify({
        id: tripId,
        name: 'Hokkaido',
        status: 'planned',
        startDate: null,
        endDate: null,
        notes: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    )

    try {
      await renderApp('/trips')
      fireEvent.change(screen.getByPlaceholderText('Filter trips'), { target: { value: 'hokkaido' } })
      expect(screen.getByText('Hokkaido')).toBeDefined()
      expect(screen.queryByText('Alta Via 1')).toBeNull()

      fireEvent.click(screen.getByText('Hokkaido'))
      expect(await screen.findByRole('button', { name: 'Back' })).toBeDefined()

      fireEvent.click(screen.getByRole('button', { name: 'Back' }))
      await screen.findByRole('heading', { name: 'Trips' })

      expect(screen.getByPlaceholderText('Filter trips')).toHaveProperty('value', 'hokkaido')
      expect(screen.getByText('Hokkaido')).toBeDefined()
      expect(screen.queryByText('Alta Via 1')).toBeNull()
    } finally {
      window.localStorage.removeItem('cairn.trips.index')
      window.localStorage.removeItem(`cairn.trips.trip.${tripId}`)
    }
  })
})

describe('App drop-to-draft (#81)', () => {
  beforeEach(() => {
    findOrCreateTripFolder.mockReset().mockResolvedValue('folder-1')
    startResumableUpload.mockReset().mockResolvedValue('session-uri')
    uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-1' })
  })

  it('dropping a KML outside a trip opens the draft panel, seeded from the filename', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    fireEvent.drop(shell, { dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]) })

    expect(await screen.findByText('NOT SAVED')).toBeDefined()
    expect(screen.getByText('day1')).toBeDefined()
    expect(screen.getByText('day1.kml · 1 track')).toBeDefined()
  })

  it('dropping a file with the wrong extension shows a toast and opens no draft', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    fireEvent.drop(shell, { dataTransfer: fileDataTransfer([new File(['x'], 'notes.txt')]) })

    expect(await screen.findByText('Only .kml and .kmz files can be imported.')).toBeDefined()
    expect(screen.queryByText('NOT SAVED')).toBeNull()
  })

  it('dropping while the trips panel is open closes it and opens the draft instead', async () => {
    await renderApp('/trips')
    expect(screen.getByRole('heading', { name: 'Trips' })).toBeDefined()
    const shell = screen.getByRole('heading', { name: 'Trips' }).closest('.shell') as HTMLElement

    fireEvent.drop(shell, { dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]) })

    expect(await screen.findByText('NOT SAVED')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Trips' })).toBeNull()
    expect(window.location.pathname).toBe('/')
  })

  it('cancel discards the draft — no trip appears in the panel', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    fireEvent.drop(shell, { dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]) })
    await screen.findByText('NOT SAVED')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('NOT SAVED')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Trips' }))
    expect(await screen.findByText('No trips yet')).toBeDefined()
  })

  it('while signed out, Save is replaced by a sign-in prompt, and the draft stays after signing in', async () => {
    ;(window as unknown as { google?: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback: (r: { access_token: string }) => void }) => ({
            requestAccessToken: () => config.callback({ access_token: 'tok' }),
          }),
        },
      },
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const href = String(url)
      if (href.includes('/about')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: { emailAddress: 'jane@gmail.com' } }),
        } as Response
      }
      return { ok: true, status: 200, json: async () => ({ files: [] }) } as Response
    })

    await renderApp('/', { googleClientId: 'a-client-id' })
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    fireEvent.drop(shell, { dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]) })
    await screen.findByText('NOT SAVED')

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign in to save' })).toBeDefined()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    })
    await screen.findByRole('button', { name: /Account: jane@gmail.com/ })

    expect(screen.getByText('NOT SAVED')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()

    fetchSpy.mockRestore()
    delete (window as unknown as { google?: unknown }).google
  })

  it('Save creates the trip, uploads the file, and replaces the draft with a normal trips list', async () => {
    ;(window as unknown as { google?: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback: (r: { access_token: string }) => void }) => ({
            requestAccessToken: () => config.callback({ access_token: 'tok' }),
          }),
        },
      },
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const href = String(url)
      if (href.includes('/about')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: { emailAddress: 'jane@gmail.com' } }),
        } as Response
      }
      // The `/Cairn/` folder lookup/creation `findOrCreateCairnFolder` runs
      // during sign-in (separately from `findOrCreateTripFolder`, mocked
      // above for the trip's own folder) — it needs a real `id` here or
      // `cairnFolderId` ends up `undefined`, which would make `save()`
      // bail out as if signed out.
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'cairn-folder-id', createdTime: '2024-01-01T00:00:00.000Z', files: [] }),
      } as Response
    })

    await renderApp('/', { googleClientId: 'a-client-id' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    })
    await screen.findByRole('button', { name: /Account:/ })

    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    fireEvent.drop(shell, { dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'Hokkaido.kml')]) })
    await screen.findByText('NOT SAVED')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(screen.queryByText('NOT SAVED')).toBeNull()
    expect(startResumableUpload).toHaveBeenCalledWith('tok', 'folder-1', 'Hokkaido.kml')

    fireEvent.click(screen.getByRole('link', { name: 'Trips' }))
    expect(await screen.findByText('Hokkaido')).toBeDefined()

    fetchSpy.mockRestore()
    delete (window as unknown as { google?: unknown }).google
  })
})
