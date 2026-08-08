import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDistance } from './format/units'

const { findOrCreateTripFolder } = vi.hoisted(() => ({ findOrCreateTripFolder: vi.fn() }))
vi.mock('./drive/tripFolder', () => ({ findOrCreateTripFolder }))

const { startResumableUpload, uploadFileContent } = vi.hoisted(() => ({
  startResumableUpload: vi.fn(),
  uploadFileContent: vi.fn(),
}))
// A full passthrough except the two functions above — `imageCache.ts` and
// `usePhotoImport.ts` (exercised by the trip face, rendered by other tests
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
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: () => null,
  AdvancedMarker: () => null,
  Polyline: () => null,
  useMap: () => null,
}))

/* `env.ts` reads `import.meta.env` once at module evaluation — the key has
   to be stubbed and modules reset before App is imported. */
async function renderApp(path = '/', { googleClientId }: { googleClientId?: string } = {}) {
  window.history.pushState({}, '', path)
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'a-browser-key')
  if (googleClientId) vi.stubEnv('VITE_GOOGLE_CLIENT_ID', googleClientId)
  vi.resetModules()
  const { App } = await import('./App')
  return render(<App />)
}

/** #95: several tests below assert on trips seeded straight into
    `localStorage`, which no longer render while signed out. Stubs
    `window.google` and `fetch` enough to reach `signed-in`, so those tests
    can render their seeded data through a real sign-in. */
function mockGoogleSignIn(email = 'jane@gmail.com') {
  ;(window as unknown as { google?: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (config: { callback: (r: { access_token: string }) => void }) => ({
          requestAccessToken: () => config.callback({ access_token: 'tok' }),
        }),
      },
    },
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const href = String(url)
    if (href.includes('/about')) {
      return { ok: true, status: 200, json: async () => ({ user: { emailAddress: email } }) } as Response
    }
    // The `/Cairn/` folder lookup runs during sign-in and needs a real
    // `id`, or `cairnFolderId` ends up undefined and every Drive-backed
    // store stays disconnected — which since #120 includes the loose store,
    // so a move or a delete would be refused rather than performed.
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'cairn-folder-id', createdTime: '2024-01-01T00:00:00.000Z', files: [] }),
    } as Response
  })
}

async function signIn(email = 'jane@gmail.com') {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  })
  await screen.findByRole('button', { name: new RegExp(`Account: ${email}`) })
}

function seedTrip(tripId: string, name = 'Hokkaido', extra: Record<string, unknown> = {}) {
  const entry = {
    id: tripId,
    name,
    status: 'planned',
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
  const existing = JSON.parse(window.localStorage.getItem('cairn.trips.index') ?? '[]')
  window.localStorage.setItem('cairn.trips.index', JSON.stringify([...existing, entry]))
  window.localStorage.setItem(
    `cairn.trips.trip.${tripId}`,
    JSON.stringify({ ...entry, notes: '' }),
  )
}

function seedLooseTrack(id: string, name: string, extra: Record<string, unknown> = {}) {
  const existing = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
  window.localStorage.setItem(
    'cairn.loose.index',
    JSON.stringify([
      ...existing,
      {
        kind: 'track',
        id,
        name,
        createdAt: '2026-01-01T00:00:00.000Z',
        date: '2024-03-09T00:00:00.000Z',
        distanceMeters: 14200,
        ascentMeters: 690,
        pointCount: 512,
        sourceName: `${name}.kml`,
        colorIndex: 0,
        position: { lat: -37, lng: 142 },
        driveFileId: null,
        ...extra,
      },
    ]),
  )
}

beforeEach(() => {
  window.history.pushState({}, '', '/')
  // #72's session persistence writes here on sign-in — cleared so one
  // test's signed-in session doesn't read back as a stored session.
  window.sessionStorage.clear()
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllEnvs()
  window.localStorage.clear()
  delete (window as unknown as { google?: unknown }).google
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
    const fetchSpy = mockGoogleSignIn()

    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()

    fireEvent.click(screen.getByRole('button', { name: /Account: jane@gmail.com/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined()
    fetchSpy.mockRestore()
  })

  it('mounts the account inside the search card rather than as its own floating element', async () => {
    const { container } = await renderApp('/', { googleClientId: 'a-client-id' })

    const card = container.querySelector('.search-card')
    expect(card).not.toBeNull()
    expect(card?.querySelector('.search-card__account .account-bubble')).not.toBeNull()
    // Nothing renders an account bubble outside the card.
    expect(container.querySelectorAll('.account-bubble')).toHaveLength(1)
  })
})

describe('App shell (#109)', () => {
  it('renders no navigation bar and no World/Trips links', async () => {
    const { container } = await renderApp('/')

    expect(container.querySelector('.top-bar')).toBeNull()
    expect(screen.queryByRole('link', { name: 'World' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Trips' })).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('renders the search card with its three slots', async () => {
    const { container } = await renderApp('/', { googleClientId: 'a-client-id' })

    const card = container.querySelector('.search-card') as HTMLElement
    expect(card.querySelector('.search-card__mark')).not.toBeNull()
    expect(screen.getByPlaceholderText('Search trips, tracks and photos')).toBeDefined()
    expect(card.querySelector('.search-card__account')).not.toBeNull()
  })

  it('opens with the panel showing the list', async () => {
    const { container } = await renderApp('/')

    expect(screen.getByRole('heading', { name: 'Everything' })).toBeDefined()
    expect(container.querySelector('.shell-column--collapsed')).toBeNull()
  })

  it('renders the four kind chips below the search card, and drives the list from them', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('t-planned', 'Kepler Track', { status: 'planned' })
    seedLooseTrack('lt-1', 'Mount Rosea')

    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()

    for (const label of ['All', 'Trips', 'Tracks', 'Photos']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined()
    }

    await screen.findByText('Kepler Track')
    expect(screen.getByText('Mount Rosea')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Tracks' }))

    expect(screen.getByRole('heading', { name: 'Loose tracks' })).toBeDefined()
    expect(screen.getByText('Mount Rosea')).toBeDefined()
    expect(screen.queryByText('Kepler Track')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Trips' }))

    expect(screen.getByRole('heading', { name: 'Trips' })).toBeDefined()
    expect(screen.getByText('Kepler Track')).toBeDefined()
    expect(screen.queryByText('Mount Rosea')).toBeNull()
    fetchSpy.mockRestore()
  })

  it('collapses the column via its edge tab and slides the layers control to the map edge', async () => {
    const { container } = await renderApp('/')

    expect(container.querySelector('.layers-control--clear')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }))

    expect(container.querySelector('.shell-column--collapsed')).not.toBeNull()
    expect(container.querySelector('.layers-control--clear')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Show panel' })).toBeDefined()
  })

  it('puts the layers control in the map corner, expanding to the four basemaps', async () => {
    await renderApp('/')

    const trigger = screen.getByRole('button', { name: 'Layers' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)

    for (const label of ['Map', 'Satellite', 'Hybrid', 'Terrain']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined()
    }

    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))

    // Selecting collapses the strip and records the choice.
    expect(screen.queryByRole('button', { name: 'Hybrid' })).toBeNull()
    expect(window.localStorage.getItem('cairn.baseMapType')).toBe('terrain')
  })

  it('renders zoom and fit-to-everything in the map corner', async () => {
    await renderApp('/')

    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Fit to everything' })).toBeDefined()
  })

  it('renders the year range in the list header and nothing floating at bottom-centre', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('t-early', 'Early', { startDate: '2020-01-01' })
    seedTrip('t-late', 'Late', { startDate: '2026-01-01' })

    const { container } = await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()

    const range = await screen.findByLabelText('Range start')
    expect(range.closest('.trips-panel__header')).not.toBeNull()
    expect(container.querySelector('.world-map__date-range')).toBeNull()
    fetchSpy.mockRestore()
  })
})

describe('App routing (#109)', () => {
  it('redirects /map, /world, /trips and an unrecognised path to /', async () => {
    for (const path of ['/map', '/world', '/trips', '/nonsense']) {
      const view = await renderApp(path)
      expect(screen.getByTestId('map')).toBeDefined()
      expect(window.location.pathname).toBe('/')
      view.unmount()
    }
  })

  it('shows a not-found state at /trips/:id when no trip matches the id', async () => {
    await renderApp('/trips/abc')
    expect(screen.getByText('Trip not found')).toBeDefined()
  })

  it('keeps the same map node mounted across a list to trip round trip', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('trip-round-trip')

    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    const mapNode = screen.getByTestId('map')

    fireEvent.click(await screen.findByText('Hokkaido'))
    await screen.findByRole('button', { name: 'Back to the list' })
    // The identical DOM node, not a fresh one — nothing unmounted the map.
    expect(screen.getByTestId('map')).toBe(mapNode)

    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))
    await screen.findByRole('heading', { name: 'Everything' })
    expect(screen.getByTestId('map')).toBe(mapNode)
    fetchSpy.mockRestore()
  })

  it('leaves the search card, the account, the layers control and zoom in place while a trip is open', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('trip-chrome')

    const { container } = await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    fireEvent.click(await screen.findByText('Hokkaido'))
    await screen.findByRole('button', { name: 'Back to the list' })

    expect(container.querySelector('.search-card')).not.toBeNull()
    expect(container.querySelector('.search-card__account .account-bubble')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Layers' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDefined()
    fetchSpy.mockRestore()
  })

  it('swaps the card to Back plus the trip name and kind, and hides the chips', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('trip-card')

    const { container } = await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    expect(container.querySelector('.filter-chips')).not.toBeNull()

    fireEvent.click(await screen.findByText('Hokkaido'))
    await screen.findByRole('button', { name: 'Back to the list' })

    expect(container.querySelector('.search-card__mark')).toBeNull()
    expect(screen.queryByPlaceholderText('Search trips, tracks and photos')).toBeNull()
    expect(container.querySelector('.search-card__name')?.textContent).toBe('Hokkaido')
    expect(container.querySelector('.search-card__kind')?.textContent).toBe('trip')
    expect(container.querySelector('.filter-chips')).toBeNull()
    fetchSpy.mockRestore()
  })

  it('back returns to the list even when the trip was opened by a typed URL', async () => {
    seedTrip('trip-typed-url')

    await renderApp('/trips/trip-typed-url')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))

    expect(await screen.findByRole('heading', { name: 'Everything' })).toBeDefined()
    expect(window.location.pathname).toBe('/')
  })

  it('a search term survives a visit to a trip and back', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('trip-filter', 'Hokkaido')
    seedTrip('trip-other', 'Alta Via 1')

    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    await screen.findByText('Hokkaido')

    const field = screen.getByPlaceholderText('Search trips, tracks and photos')
    fireEvent.change(field, { target: { value: 'hokkaido' } })
    expect(screen.queryByText('Alta Via 1')).toBeNull()

    fireEvent.click(screen.getByText('Hokkaido'))
    await screen.findByRole('button', { name: 'Back to the list' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))
    await screen.findByRole('heading', { name: 'Everything' })

    expect(screen.getByPlaceholderText('Search trips, tracks and photos')).toHaveProperty(
      'value',
      'hokkaido',
    )
    expect(screen.queryByText('Alta Via 1')).toBeNull()
    fetchSpy.mockRestore()
  })

  it('renders trip metadata for an existing trip, read-only while signed out (#73)', async () => {
    seedTrip('trip-existing-1')

    await renderApp('/trips/trip-existing-1')

    expect(screen.getAllByText('Hokkaido').length).toBeGreaterThan(0)
    expect(screen.getByText('planned')).toBeDefined()
    expect(screen.queryByText('Trip not found')).toBeNull()

    // #73: no usable token — the status field doesn't offer editing and the
    // surface states why.
    fireEvent.click(screen.getByText('planned'))
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Sign in to edit this trip.')).toBeDefined()
  })

  it('hides a locally-cached trip while disconnected and reveals it again on sign-in (#95)', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('trip-local-only', 'Kepler Track', { origin: { lat: -45, lng: 167 } })

    await renderApp('/', { googleClientId: 'a-client-id' })

    expect(screen.queryByText('Kepler Track')).toBeNull()
    // Both the panel and the map underneath say the same thing.
    expect(screen.getAllByText('Sign in to see your map.')).toHaveLength(2)

    await signIn()
    expect(await screen.findByText('Kepler Track')).toBeDefined()
    expect(screen.queryByText('Sign in to see your map.')).toBeNull()
    fetchSpy.mockRestore()
  })
})

describe('App trip row counts (#131)', () => {
  // The row's track count is read fresh on every render rather than
  // memoized on the trip index: `saveOverview` only changes the index's
  // own array reference when a trip's `origin` moves with it, so a track
  // added to a trip whose origin doesn't change would show a stale count
  // on return to the list under the old memoized computation. Reproduced
  // here by writing the trip's overview directly to storage — standing in
  // for what a real import's `saveOverview` effect persists — without
  // going through anything that would touch the trip index, so a
  // memoization bug and a correct fresh read are distinguishable.
  it("shows a trip's raised track count after returning from it, even when the trip's origin did not change", async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('trip-track-count', 'Kepler Track')

    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()

    expect(await screen.findByText(/0 tracks/)).toBeDefined()

    fireEvent.click(screen.getByText('Kepler Track'))
    await screen.findByRole('button', { name: 'Back to the list' })
    // Settles the trip's own effect, which writes its overview to match
    // the (empty, per the fetch mock) file list Drive actually reports —
    // origin stays `null`, exactly as it was.
    await screen.findByText('No tracks yet')

    window.localStorage.setItem(
      'cairn.trips.overview.trip-track-count',
      JSON.stringify({ type: 'FeatureCollection', features: [{}, {}] }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))
    await screen.findByRole('heading', { name: 'Everything' })

    expect(await screen.findByText(/2 tracks/)).toBeDefined()
    expect(screen.queryByText(/0 tracks/)).toBeNull()
    fetchSpy.mockRestore()
  })
})

describe('App row actions (#109)', () => {
  it('replaces the row × with a ⋮ carrying named actions', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('trip-menu')

    const { container } = await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    await screen.findByText('Hokkaido')

    expect(container.querySelector('.trips-panel__row-remove')).toBeNull()
    const trigger = screen.getByRole('button', { name: 'Actions for Hokkaido' })
    fireEvent.click(trigger)

    expect(screen.getByRole('menuitem', { name: 'Mark as completed' })).toBeDefined()
    const destructive = screen.getByRole('menuitem', { name: 'Delete trip…' })
    expect(destructive.className).toContain('--danger')
    fetchSpy.mockRestore()
  })

  /* Whether the confirm's Delete actually removes the trip is
     `TripsPanel.test.tsx`'s (it asserts `onDelete` fires with the id) and
     `driveTripStore.test.ts`'s. What this level owns is that the menu's
     destructive item opens the confirm instead of destroying anything, and
     that backing out leaves the row alone. */
  it('the destructive action opens the existing inline confirm rather than deleting outright', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('trip-confirm')

    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    await screen.findByText('Hokkaido')

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Hokkaido' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete trip…' }))

    expect(screen.getByText('Delete "Hokkaido"?')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Delete "Hokkaido"?')).toBeNull()
    expect(screen.getByText('Hokkaido')).toBeDefined()
    fetchSpy.mockRestore()
  })

  it('#73: mutating controls are disabled while disconnected', async () => {
    seedTrip('trip-disabled')
    // Disconnected hides trips entirely (#95), so this checks the control
    // that stays visible: creating a trip.
    await renderApp('/')

    expect(screen.getByRole('button', { name: 'New trip' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Sign in to add or remove trips.')).toBeDefined()
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

    fireEvent.drop(shell, {
      dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]),
    })

    expect(await screen.findByText('NOT SAVED')).toBeDefined()
    expect(screen.getByText('day1')).toBeDefined()
    expect(screen.getByText('day1.kml · 1 track')).toBeDefined()
  })

  // #75's rule, now that the shell owns the overlay rather than the trip
  // page: it is the app's promise that a drop will be handled, so inside a
  // trip while signed out it does not appear at all.
  it('shows the drop overlay outside a trip even while signed out', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    fireEvent.dragEnter(shell, { dataTransfer: fileDataTransfer([new File(['x'], 'a.jpg')]) })

    expect(screen.queryByTestId('drop-overlay')).not.toBeNull()
  })

  it('does not show the drop overlay inside a trip while signed out', async () => {
    seedTrip('trip-overlay')
    await renderApp('/trips/trip-overlay')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    fireEvent.dragEnter(shell, { dataTransfer: fileDataTransfer([new File(['x'], 'a.jpg')]) })

    expect(screen.queryByTestId('drop-overlay')).toBeNull()
  })

  it('dropping a file with the wrong extension shows a toast and opens no draft', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    fireEvent.drop(shell, { dataTransfer: fileDataTransfer([new File(['x'], 'notes.txt')]) })

    expect(await screen.findByText('Only .kml and .kmz files can be imported.')).toBeDefined()
    expect(screen.queryByText('NOT SAVED')).toBeNull()
  })

  it('a draft replaces the list in the panel and hides the chips', async () => {
    const { container } = await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    fireEvent.drop(shell, {
      dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]),
    })

    expect(await screen.findByText('NOT SAVED')).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Everything' })).toBeNull()
    expect(container.querySelector('.filter-chips')).toBeNull()
    expect(window.location.pathname).toBe('/')
    // #110: the draft gains a third exit — keep the files without making a
    // trip of them.
    expect(screen.getByRole('button', { name: 'Keep loose' })).toBeDefined()
  })

  it('cancel discards the draft and returns the list', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    fireEvent.drop(shell, {
      dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]),
    })
    await screen.findByText('NOT SAVED')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('NOT SAVED')).toBeNull()
    // #95: disconnected — the panel reads "sign in", not "nothing here".
    // Two matches: the map underneath shows the same overlay text.
    expect(await screen.findAllByText('Sign in to see your map.')).toHaveLength(2)
  })

  it('while signed out, Save is replaced by a sign-in prompt, and the draft stays after signing in', async () => {
    const fetchSpy = mockGoogleSignIn()

    await renderApp('/', { googleClientId: 'a-client-id' })
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    fireEvent.drop(shell, {
      dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]),
    })
    await screen.findByText('NOT SAVED')

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign in to save' })).toBeDefined()

    await signIn()

    expect(screen.getByText('NOT SAVED')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
    fetchSpy.mockRestore()
  })

  it('Save creates the trip, uploads the file, and replaces the draft with the list', async () => {
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
      // The `/Cairn/` folder lookup runs during sign-in and needs a real
      // `id`, or `cairnFolderId` ends up undefined and `save()` bails out
      // as if signed out.
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

    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()

    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    fireEvent.drop(shell, {
      dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'Hokkaido.kml')]),
    })
    await screen.findByText('NOT SAVED')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(screen.queryByText('NOT SAVED')).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Everything' })).toBeDefined()
    expect(uploadFileContent).toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

describe('App loose tracks and photos (#110)', () => {
  function seedLoosePhoto(id: string, name: string, position: unknown) {
    const existing = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
    window.localStorage.setItem(
      'cairn.loose.index',
      JSON.stringify([
        ...existing,
        {
          kind: 'photo',
          id,
          name,
          createdAt: '2026-01-01T00:00:00.000Z',
          takenAt: '2024-11-03T00:00:00.000Z',
          position,
          driveFileId: null,
        },
      ]),
    )
  }

  it('opens a loose track on its own face, with its stats and source', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseTrack('lt-1', 'Mount Rosea')

    const { container } = await renderApp('/tracks/lt-1', { googleClientId: 'a-client-id' })
    await signIn()

    expect(await screen.findByText(formatDistance(14200))).toBeDefined()
    expect(screen.getByText('690 m')).toBeDefined()
    expect(screen.getByText('512')).toBeDefined()
    expect(screen.getByText('Mount Rosea.kml')).toBeDefined()
    // The card says what it is, and that no trip owns it.
    expect(container.querySelector('.search-card__kind')?.textContent).toBe(
      'track · not in a trip',
    )
    fetchSpy.mockRestore()
  })

  it('explains an unplaced photo rather than erroring', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLoosePhoto('lp-1', 'no-gps.jpg', null)

    await renderApp('/photos/lp-1', { googleClientId: 'a-client-id' })
    await signIn()

    expect(await screen.findByText('No location')).toBeDefined()
    expect(screen.getByText(/Adding it to a trip whose tracks cover its timestamp/)).toBeDefined()
    fetchSpy.mockRestore()
  })

  it('shows a placed photo its position and where that came from', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLoosePhoto('lp-2', 'sapporo.jpg', { lat: 43.06, lng: 141.35 })

    await renderApp('/photos/lp-2', { googleClientId: 'a-client-id' })
    await signIn()

    expect(await screen.findByText('EXIF GPS')).toBeDefined()
    expect(screen.getByText(/43\.06000, 141\.35000/)).toBeDefined()
    expect(screen.queryByText('No location')).toBeNull()
    fetchSpy.mockRestore()
  })

  it('the picker lists existing trips with counts, plus New trip', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('t-1', 'Larapinta')
    seedLooseTrack('lt-2', 'Mount Rosea')

    await renderApp('/tracks/lt-2', { googleClientId: 'a-client-id' })
    await signIn()

    fireEvent.click(await screen.findByRole('button', { name: 'Add to a trip' }))

    expect(screen.getByRole('heading', { name: 'Add to a trip' })).toBeDefined()
    expect(screen.getByRole('button', { name: /New trip/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Larapinta/ })).toBeDefined()
    fetchSpy.mockRestore()
  })

  it('choosing a trip moves the item into it and opens that trip', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('t-2', 'Larapinta')
    seedLooseTrack('lt-3', 'Mount Rosea')

    await renderApp('/tracks/lt-3', { googleClientId: 'a-client-id' })
    await signIn()

    fireEvent.click(await screen.findByRole('button', { name: 'Add to a trip' }))
    // #120: the move is Drive file work now — the picker stays open until it
    // settles, and the navigation happens after.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Larapinta/ }))
    })

    // Landing on the destination is the confirmation.
    expect(window.location.pathname).toBe('/trips/t-2')
    // It has left the top-level list.
    const looseIndex = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
    expect(looseIndex).toHaveLength(0)
    fetchSpy.mockRestore()
  })

  it('New trip takes a name, creates it, and moves the item in one step', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseTrack('lt-4', 'Mount Rosea')

    await renderApp('/tracks/lt-4', { googleClientId: 'a-client-id' })
    await signIn()

    fireEvent.click(await screen.findByRole('button', { name: 'Add to a trip' }))
    fireEvent.click(screen.getByRole('button', { name: /New trip/ }))
    fireEvent.change(screen.getByPlaceholderText('Name the new trip'), {
      target: { value: 'Grampians' },
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    })

    expect(window.location.pathname).toMatch(/^\/trips\//)
    const trips = JSON.parse(window.localStorage.getItem('cairn.trips.index') ?? '[]')
    expect(trips.map((t: { name: string }) => t.name)).toContain('Grampians')
    // Creating an empty trip is not a state the user passes through.
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(0)
    fetchSpy.mockRestore()
  })

  it('deleting a loose item is a separate named action behind the confirm', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseTrack('lt-5', 'Mount Rosea')

    await renderApp('/tracks/lt-5', { googleClientId: 'a-client-id' })
    await signIn()

    fireEvent.click(await screen.findByRole('button', { name: 'Actions for Mount Rosea' }))
    // Two exits, never one: getting rid of it is one click from here.
    expect(screen.getByRole('menuitem', { name: 'Add to a trip…' })).toBeDefined()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))

    expect(screen.getByText('Delete "Mount Rosea"?')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(window.location.pathname).toBe('/')
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(0)
    fetchSpy.mockRestore()
  })

  it('#95: a loose item is withheld while disconnected, typed URL included', async () => {
    seedLooseTrack('lt-6', 'Mount Rosea')

    await renderApp('/tracks/lt-6')

    // Withheld exactly as trips are — and a typed URL is not the way
    // around that.
    expect(screen.queryByText('Mount Rosea')).toBeNull()
    expect(screen.getByText('Not found')).toBeDefined()
  })

  it('#73: the loose face refuses to move or delete while disconnected', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseTrack('lt-7', 'Mount Rosea')

    await renderApp('/tracks/lt-7', { googleClientId: 'a-client-id' })
    await signIn()
    await screen.findByRole('button', { name: 'Add to a trip' })

    // Signed out again: the primary action and the menu both go to the
    // Disabled treatment rather than failing against a dead token.
    fireEvent.click(screen.getByRole('button', { name: /Account: jane@gmail.com/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.queryByRole('button', { name: 'Add to a trip' })).toBeNull()
    fetchSpy.mockRestore()
  })

  describe('#133 renaming and recolouring a loose item', () => {
    it('renames a loose track from its face, and it survives a reload', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedLooseTrack('lt-rename', 'Mount Rosea')

      await renderApp('/tracks/lt-rename', { googleClientId: 'a-client-id' })
      await signIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Mount Rosea' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

      const input = screen.getByDisplayValue('Mount Rosea')
      fireEvent.change(input, { target: { value: 'Rosea East' } })
      await act(async () => {
        fireEvent.keyDown(input, { key: 'Enter' })
      })

      // Both the face heading and the search card's crumb show the new name.
      expect((await screen.findAllByText('Rosea East')).length).toBeGreaterThan(0)
      const looseIndex = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
      expect(looseIndex[0].name).toBe('Rosea East')
      fetchSpy.mockRestore()
    })

    it('recolours a loose track from its face', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedLooseTrack('lt-recolor', 'Mount Rosea', { colorIndex: 0 })

      await renderApp('/tracks/lt-recolor', { googleClientId: 'a-client-id' })
      await signIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Change colour for Mount Rosea' }))
      const options = screen
        .getAllByRole('button')
        .filter((el) => el.className.includes('color-popover__option'))

      await act(async () => {
        fireEvent.click(options[3])
      })

      await waitFor(() => {
        const looseIndex = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
        expect(looseIndex[0].colorIndex).toBe(3)
      })
      fetchSpy.mockRestore()
    })

    it('offers no Change colour item for a loose photo', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedLoosePhoto('lp-rename', 'sapporo.jpg', { lat: 43.06, lng: 141.35 })

      await renderApp('/photos/lp-rename', { googleClientId: 'a-client-id' })
      await signIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for sapporo.jpg' }))
      expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeDefined()
      expect(screen.queryByRole('menuitem', { name: 'Change colour' })).toBeNull()
      fetchSpy.mockRestore()
    })
  })
})

describe('App loose items in Drive (#120)', () => {
  it('refuses a loose photo dropped while signed out, and writes nothing', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    await act(async () => {
      fireEvent.drop(shell, {
        dataTransfer: fileDataTransfer([new File(['jpeg'], 'a.jpg'), new File(['jpeg'], 'b.jpg')]),
      })
    })

    // One toast for the batch, not one per file — the reason is the same
    // for all of them.
    expect(screen.getAllByText('Sign in to keep tracks and photos.')).toHaveLength(1)
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(0)
  })

  it('still opens the draft for a track dropped while signed out', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    fireEvent.drop(shell, {
      dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]),
    })

    // #81 designed this to work signed out, and #120 does not take it
    // away — the draft is visible, and it survives signing in.
    expect(await screen.findByText('NOT SAVED')).toBeDefined()
    expect(screen.queryByText('Sign in to keep tracks and photos.')).toBeNull()
  })

  it('refuses Keep loose while signed out and leaves the draft open', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    fireEvent.drop(shell, {
      dataTransfer: fileDataTransfer([loadKmlFixture('linestring.kml', 'day1.kml')]),
    })
    await screen.findByText('NOT SAVED')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep loose' }))
    })

    expect(screen.getByText('Sign in to keep tracks and photos.')).toBeDefined()
    // Nothing is lost — the files are still there to keep once signed in.
    expect(screen.getByText('NOT SAVED')).toBeDefined()
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(0)
  })
})
