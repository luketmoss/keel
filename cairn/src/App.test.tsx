import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDistance, formatElevationGain } from './format/units'

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

// jsdom has no `createImageBitmap` — every existing test that drops a photo
// only ever asserts on the local, synchronous half of an import (the row
// exists), never on `uploadState`/`image` actually landing `ok`, so a real
// `generateImagePair` failing silently has never mattered before. #157's
// attach tests do check the resulting `image`, so they need it to succeed.
vi.mock('./photo/thumbnail', async () => {
  const actual = await vi.importActual<typeof import('./photo/thumbnail')>('./photo/thumbnail')
  return {
    ...actual,
    generateImagePair: vi
      .fn()
      .mockResolvedValue({ ok: true, display: new Blob(['display']), thumbnail: new Blob(['thumb']) }),
  }
})

function loadKmlFixture(name: string, as = name): File {
  return new File([kmlFixtureText(name)], as)
}

/** The fixture's bytes, for building a zip around. `File#text()` is not
    implemented by jsdom, so this reads from disk rather than off the
    `File` — the same gap `kml/parse.ts` works around with a `FileReader`. */
function kmlFixtureText(name: string): string {
  return readFileSync(join(__dirname, 'kml/fixtures', name), 'utf8')
}

/* #188: expansion runs for real in every test but one. That one needs to
   observe the UI *during* unpacking, which means holding the doorway open —
   so the override slot below stands in only when it is set. */
const { archiveOverride } = vi.hoisted(() => ({
  archiveOverride: { expandArchives: null as null | ((...args: never[]) => unknown) },
}))
vi.mock('./import/archive', async () => {
  const actual = await vi.importActual<typeof import('./import/archive')>('./import/archive')
  return {
    ...actual,
    expandArchives: (...args: never[]) =>
      (archiveOverride.expandArchives ?? (actual.expandArchives as never))(...args),
  }
})

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
    expect(screen.getByPlaceholderText('Search trips, tracks and cairns')).toBeDefined()
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

    for (const label of ['All', 'Trips', 'Tracks', 'Cairns']) {
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

  it('puts the layers control in the map corner, expanding to the three basemaps', async () => {
    await renderApp('/')

    const trigger = screen.getByRole('button', { name: 'Layers' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)

    for (const label of ['Map', 'Satellite', 'Terrain']) {
      expect(screen.getByRole('button', { name: label })).toBeDefined()
    }

    fireEvent.click(screen.getByRole('button', { name: 'Terrain' }))

    // Selecting collapses the strip and records the choice.
    expect(screen.queryByRole('button', { name: 'Satellite' })).toBeNull()
    expect(window.localStorage.getItem('cairn.baseMapType')).toBe('terrain')
  })

  // #263: the labels switch is the other half of what used to be the Hybrid
  // tile, and it persists on its own rather than as a fourth basemap.
  it('persists the labels switch and shares it with the tile preference', async () => {
    await renderApp('/')

    fireEvent.click(screen.getByRole('button', { name: 'Layers' }))
    fireEvent.click(screen.getByRole('switch', { name: /Labels/ }))

    expect(window.localStorage.getItem('cairn.baseMapLabels')).toBe('true')
    // The panel is still open, so the switch can be flipped back to compare.
    expect(screen.getByRole('switch', { name: /Labels/ }).getAttribute('aria-checked')).toBe('true')
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
    expect(screen.queryByPlaceholderText('Search trips, tracks and cairns')).toBeNull()
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

    const field = screen.getByPlaceholderText('Search trips, tracks and cairns')
    fireEvent.change(field, { target: { value: 'hokkaido' } })
    expect(screen.queryByText('Alta Via 1')).toBeNull()

    fireEvent.click(screen.getByText('Hokkaido'))
    await screen.findByRole('button', { name: 'Back to the list' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))
    await screen.findByRole('heading', { name: 'Everything' })

    expect(screen.getByPlaceholderText('Search trips, tracks and cairns')).toHaveProperty(
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

    expect(await screen.findByText('Only .kml, .kmz and .gpx files can be imported.')).toBeDefined()
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
  function seedLooseCairn(
    id: string,
    name: string,
    position: { lat: number; lng: number },
    positionSource = 'exif',
    overrides: Record<string, unknown> = {},
  ) {
    const existing = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
    window.localStorage.setItem(
      'cairn.loose.index',
      JSON.stringify([
        ...existing,
        {
          kind: 'cairn',
          id,
          name,
          createdAt: '2026-01-01T00:00:00.000Z',
          date: '2024-11-03T00:00:00.000Z',
          position,
          positionSource,
          icon: null,
          image: null,
          description: '',
          ...overrides,
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
    // #226: through the shared formatter, respecting the app's imperial
    // `SYSTEM` — the bug this issue fixes rendered `690 m` here regardless.
    expect(screen.getByText(formatElevationGain(690)!)).toBeDefined()
    expect(screen.getByText('512 points · Mount Rosea.kml')).toBeDefined()
    // The card says what it is, and that no trip owns it.
    expect(container.querySelector('.search-card__kind')?.textContent).toBe(
      'track · not in a trip',
    )
    fetchSpy.mockRestore()
  })

  // `cairns.md`: a cairn always has a position — there is no more unplaced
  // state for the detail face to explain.
  it('shows a placed photo its position and where that came from', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseCairn('lp-2', 'sapporo.jpg', { lat: 43.06, lng: 141.35 })

    await renderApp('/cairns/lp-2', { googleClientId: 'a-client-id' })
    await signIn()

    expect(await screen.findByText(/43\.06000, 141\.35000/)).toBeDefined()
    expect(screen.getByText(/Position came from the photo/)).toBeDefined()
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

  /* #150: a track's name is stored by whichever trip owns it, so a move has
     to write one into the destination — or the track arrives showing its
     filename and the name the user gave it is gone. */
  describe('#150 a name survives the move into a trip', () => {
    const overridesFor = (tripId: string) =>
      JSON.parse(window.localStorage.getItem(`cairn.trips.trackOverrides.${tripId}`) ?? '{}')

    it('gives the destination trip the name the track was already showing', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedTrip('t-150', 'Larapinta')
      seedLooseTrack('lt-150', 'Snowdon ridge', { driveFileId: 'drive-150' })

      await renderApp('/tracks/lt-150', { googleClientId: 'a-client-id' })
      await signIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Add to a trip' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Larapinta/ }))
      })

      expect(window.location.pathname).toBe('/trips/t-150')
      expect(overridesFor('t-150')).toEqual({
        'drive-150': { displayName: 'Snowdon ridge' },
      })
      fetchSpy.mockRestore()
    })

    it('leaves the names the destination trip already held alone', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedTrip('t-151', 'Larapinta')
      // A track already in that trip, with a name and a colour of its own.
      window.localStorage.setItem(
        'cairn.trips.trackOverrides.t-151',
        JSON.stringify({ 'drive-existing': { displayName: 'Day one', color: 3 } }),
      )
      seedLooseTrack('lt-151', 'Snowdon ridge', { driveFileId: 'drive-151' })

      await renderApp('/tracks/lt-151', { googleClientId: 'a-client-id' })
      await signIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Add to a trip' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Larapinta/ }))
      })

      expect(overridesFor('t-151')).toEqual({
        'drive-existing': { displayName: 'Day one', color: 3 },
        'drive-151': { displayName: 'Snowdon ridge' },
      })
      fetchSpy.mockRestore()
    })

    // The name #133's `Rename` gives a loose track is the same name, and it
    // travels the same way — renamed here rather than seeded, so the two
    // features are shown joined up rather than assumed to be.
    it('carries a name given by #133 Rename into the trip', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedTrip('t-153', 'Larapinta')
      seedLooseTrack('lt-153', 'Mount Rosea', { driveFileId: 'drive-153' })

      await renderApp('/tracks/lt-153', { googleClientId: 'a-client-id' })
      await signIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Mount Rosea' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
      const input = screen.getByDisplayValue('Mount Rosea')
      fireEvent.change(input, { target: { value: 'Rosea East' } })
      await act(async () => {
        fireEvent.keyDown(input, { key: 'Enter' })
      })

      fireEvent.click(screen.getByRole('button', { name: 'Add to a trip' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Larapinta/ }))
      })

      expect(overridesFor('t-153')).toEqual({ 'drive-153': { displayName: 'Rosea East' } })
      fetchSpy.mockRestore()
    })

    it('carries the name into a brand new trip too', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedLooseTrack('lt-152', 'Snowdon ridge', { driveFileId: 'drive-152' })

      await renderApp('/tracks/lt-152', { googleClientId: 'a-client-id' })
      await signIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Add to a trip' }))
      fireEvent.click(screen.getByRole('button', { name: /New trip/ }))
      fireEvent.change(screen.getByPlaceholderText('Name the new trip'), {
        target: { value: 'Snowdonia' },
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))
      })

      const tripId = window.location.pathname.replace('/trips/', '')
      expect(overridesFor(tripId)).toEqual({
        'drive-152': { displayName: 'Snowdon ridge' },
      })
      fetchSpy.mockRestore()
    })
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

      // #226: the inline swatch button moved off the body — `Change colour`
      // in the `⋮` is the one remaining way to reach the popover.
      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Mount Rosea' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Change colour' }))
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
      seedLooseCairn('lp-rename', 'sapporo.jpg', { lat: 43.06, lng: 141.35 })

      await renderApp('/cairns/lp-rename', { googleClientId: 'a-client-id' })
      await signIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for sapporo.jpg' }))
      expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeDefined()
      expect(screen.queryByRole('menuitem', { name: 'Change colour' })).toBeNull()
      fetchSpy.mockRestore()
    })
  })

  describe('#140 exporting a loose item', () => {
    /* jsdom has no `URL.createObjectURL` at all (verified against the
       pinned jsdom — see `imageCache.ts`'s own note on the same gap), so
       this stubs just enough of it for a download to run, scoped to this
       block rather than the whole suite. */
    beforeEach(() => {
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake-url'), revokeObjectURL: vi.fn() })
    })
    afterEach(() => {
      Reflect.deleteProperty(URL, 'createObjectURL')
      Reflect.deleteProperty(URL, 'revokeObjectURL')
    })

    it('downloads a track by its driveFileId, under its sourceName', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedLooseTrack('lt-export', 'Mount Rosea', { driveFileId: 'file-1', sourceName: 'rosea-day-1.kml' })

      await renderApp('/tracks/lt-export', { googleClientId: 'a-client-id' })
      await signIn()

      fetchSpy.mockImplementation(async (url) => {
        const href = String(url)
        if (href.includes('/files/file-1') && href.includes('alt=media')) {
          return { ok: true, status: 200, blob: async () => new Blob(['<kml/>']) } as Response
        }
        return { ok: true, status: 200, json: async () => ({ id: 'x', files: [] }) } as Response
      })
      // The synthetic anchor's `download` attribute is the one place the
      // filename this test is about actually shows up — `downloadTrackFile`
      // never puts it on the wire.
      const clickedDownloadNames: (string | null)[] = []
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          clickedDownloadNames.push(this.download)
        })

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Mount Rosea' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }))
      })

      await waitFor(() =>
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining('/files/file-1?alt=media'),
          expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
        ),
      )
      expect(clickedDownloadNames).toEqual(['rosea-day-1.kml'])
      expect(URL.createObjectURL).toHaveBeenCalled()
      // No failure toast — the download itself is the confirmation, #110's
      // stance on `Add to a trip` reused here.
      expect(screen.queryByText(/Couldn't export/)).toBeNull()
      clickSpy.mockRestore()
      fetchSpy.mockRestore()
    })

    it('omits Export for a loose track with no source file to download', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedLooseTrack('lt-no-export', 'Mount Rosea', { driveFileId: null, uploadState: 'ok' })

      await renderApp('/tracks/lt-no-export', { googleClientId: 'a-client-id' })
      await signIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Mount Rosea' }))
      expect(screen.queryByRole('menuitem', { name: 'Export' })).toBeNull()
      fetchSpy.mockRestore()
    })

    it('shows a toast when the download fails, and names the item', async () => {
      const fetchSpy = mockGoogleSignIn()
      seedLooseTrack('lt-export-fail', 'Mount Rosea', { driveFileId: 'file-1' })

      await renderApp('/tracks/lt-export-fail', { googleClientId: 'a-client-id' })
      await signIn()

      fetchSpy.mockImplementation(async (url) => {
        const href = String(url)
        if (href.includes('/files/file-1') && href.includes('alt=media')) {
          return { ok: false, status: 500 } as Response
        }
        return { ok: true, status: 200, json: async () => ({ id: 'x', files: [] }) } as Response
      })

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for Mount Rosea' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }))
      })

      expect(await screen.findByText("Couldn't export Mount Rosea — try again.")).toBeDefined()
      expect(URL.createObjectURL).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it('names a cairn export after the bytes Drive served, not after the record (#187)', async () => {
      const fetchSpy = mockGoogleSignIn()
      // A cairn imported from a PNG: the downscale stores JPEG bytes, so the
      // record still says `sunset.png` while Drive holds a `.jpg`.
      seedLooseCairn('lp-export', 'sunset.png', { lat: 43.06, lng: 141.35 }, 'exif', {
        image: { originalDriveFileId: 'img-1', thumbnailDriveFileId: 'thumb-1' },
      })

      await renderApp('/cairns/lp-export', { googleClientId: 'a-client-id' })
      await signIn()

      fetchSpy.mockImplementation(async (url) => {
        const href = String(url)
        if (href.includes('alt=media')) {
          return {
            ok: true,
            status: 200,
            blob: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
          } as Response
        }
        return { ok: true, status: 200, json: async () => ({ id: 'x', files: [] }) } as Response
      })
      const clickedDownloadNames: (string | null)[] = []
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(function (this: HTMLAnchorElement) {
          clickedDownloadNames.push(this.download)
        })

      fireEvent.click(await screen.findByRole('button', { name: 'Actions for sunset.png' }))
      await act(async () => {
        fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }))
      })

      await waitFor(() => expect(clickedDownloadNames).toEqual(['sunset.jpg']))
      clickSpy.mockRestore()
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
    expect(screen.getAllByText('Sign in to keep tracks and cairns.')).toHaveLength(1)
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(0)
  })

  // #188 — a zip is a bag of files, and dropping the bag means dropping the
  // files. These go through the real JSZip, so what is under test is the
  // doorway and not a fake of it.
  it('a dropped zip of tracks opens the draft exactly as the loose files would', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    const zip = new JSZip()
    zip.file('trip/day1.kml', kmlFixtureText('linestring.kml'))
    const archive = new File([await zip.generateAsync({ type: 'blob' })], 'trip.zip')

    await act(async () => {
      fireEvent.drop(shell, { dataTransfer: fileDataTransfer([archive]) })
    })

    // Same outcome as dropping day1.kml itself — nothing downstream knows
    // an archive was involved.
    expect(await screen.findByText('NOT SAVED')).toBeDefined()
  })

  it('a dropped .kmz is still a track and is never flattened into its inner KML', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    const zip = new JSZip()
    zip.file('doc.kml', kmlFixtureText('linestring.kml'))
    const kmz = new File([await zip.generateAsync({ type: 'blob' })], 'rosea.kmz')

    await act(async () => {
      fireEvent.drop(shell, { dataTransfer: fileDataTransfer([kmz]) })
    })

    // Seeded from the KMZ's own name. If it had been expanded as a generic
    // archive the draft would say `doc` instead, so this is what proves the
    // KMZ reached its own parser.
    expect(await screen.findByText('NOT SAVED')).toBeDefined()
    expect(screen.getByText('rosea')).toBeDefined()
    expect(screen.getByText('rosea.kmz · 1 track')).toBeDefined()
  })

  it('names an unreadable archive and lets the rest of the drop through', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    const kml = loadKmlFixture('linestring.kml', 'day1.kml')

    await act(async () => {
      fireEvent.drop(shell, {
        dataTransfer: fileDataTransfer([new File(['not a zip'], 'broken.zip'), kml]),
      })
    })

    expect(await screen.findByText('could not be read as a zip archive')).toBeDefined()
    // The track in the same drop still opened its draft.
    expect(screen.getByText('NOT SAVED')).toBeDefined()
  })

  it('says an archive is being unpacked rather than looking like an ignored drop', async () => {
    await renderApp('/')
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    archiveOverride.expandArchives = ((
      _files: File[],
      onProgress?: (name: string, index: number, total: number) => void,
    ) => {
      onProgress?.('photos.zip', 12, 30)
      return held.then(() => ({ files: [], rejections: [] }))
    }) as never

    await act(async () => {
      fireEvent.drop(shell, {
        dataTransfer: fileDataTransfer([new File(['PK'], 'photos.zip')]),
      })
    })

    // Same form as an import progress row, carrying the archive's name so
    // it reads differently from the per-photo rows that follow it.
    expect((await screen.findByRole('status')).textContent).toBe('photos.zip — 12 of 30')

    await act(async () => {
      release()
      await held
    })
    expect(screen.queryByRole('status')).toBeNull()
    archiveOverride.expandArchives = null
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
    expect(screen.queryByText('Sign in to keep tracks and cairns.')).toBeNull()
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

    expect(screen.getByText('Sign in to keep tracks and cairns.')).toBeDefined()
    // Nothing is lost — the files are still there to keep once signed in.
    expect(screen.getByText('NOT SAVED')).toBeDefined()
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(0)
  })
})

describe('App placement queue (#168)', () => {
  function noGpsPhoto(as = 'no-gps.jpg'): File {
    const buffer = readFileSync(join(__dirname, 'photo/fixtures/gps-stripped.jpg'))
    return new File([buffer], as, { type: 'image/jpeg' })
  }

  // jsdom has no `URL.createObjectURL` — the placement queue panel's own
  // local preview needs it. Stubbed once, module-level, rather than torn
  // down per test: `PlacementQueuePanel.test.tsx` hit the same ordering
  // hazard `#140`'s describe-scoped teardown risks — an `afterEach` nested
  // inside a `describe` runs *before* `test-setup.ts`'s root-level
  // `afterEach(cleanup)`, so deleting the stub here would race the unmount
  // that actually calls `revokeObjectURL`.
  beforeEach(() => {
    startResumableUpload.mockReset().mockResolvedValue('session-uri')
    uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-1' })
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake-url'), revokeObjectURL: vi.fn() })
  })

  /** The fixture that carries real EXIF GPS — the point of #188 is that a
      zip is lossless, so this must place exactly as the loose file does. */
  function gpsPhoto(as: string): File {
    const buffer = readFileSync(join(__dirname, 'photo/fixtures/gps-and-timestamps.jpg'))
    return new File([buffer], as, { type: 'image/jpeg' })
  }

  it('a zipped photo keeps its EXIF GPS and places exactly as the loose file does (#188)', async () => {
    const fetchSpy = mockGoogleSignIn()
    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    // What the loose file resolves to, for comparison.
    await act(async () => {
      fireEvent.drop(shell, { dataTransfer: fileDataTransfer([gpsPhoto('loose.jpg')]) })
    })
    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(1)
    })
    const [loose] = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')

    const zip = new JSZip()
    const gpsBytes = readFileSync(join(__dirname, 'photo/fixtures/gps-and-timestamps.jpg'))
    zip.file('trip/day one/zipped.jpg', gpsBytes)
    // A second entry, so this also shows every expanded entry reaching the
    // pipeline rather than the archive counting as one item (criterion 11).
    zip.file('trip/day two/zipped-2.jpg', gpsBytes)
    // Every macOS zip carries these; neither may become a cairn.
    zip.file('__MACOSX/._zipped.jpg', 'applesauce')
    zip.file('.DS_Store', 'junk')
    const archive = new File([await zip.generateAsync({ type: 'blob' })], 'photos.zip')

    await act(async () => {
      fireEvent.drop(shell, { dataTransfer: fileDataTransfer([archive]) })
    })

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(3)
    })
    const index = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
    const zipped = index.find((item: { name: string }) => item.name === 'zipped.jpg')

    // Same coordinate, same provenance — the archive changed nothing.
    expect(zipped.positionSource).toBe('exif')
    expect(zipped.positionSource).toBe(loose.positionSource)
    expect(zipped.position).toEqual(loose.position)
    // Folders flattened: `trip/day one/zipped.jpg` arrived as `zipped.jpg`.
    expect(index.map((item: { name: string }) => item.name).sort()).toEqual([
      'loose.jpg',
      'zipped-2.jpg',
      'zipped.jpg',
    ])
    // The junk entries are in this archive on purpose, but what proves they
    // are *skipped* rather than merely failing later is
    // `archive.test.ts`'s "skips junk silently" — from here a fork that got
    // through would fail EXIF and go to the placement queue, which this
    // assertion cannot tell apart from it never arriving.
    fetchSpy.mockRestore()
  })

  it('replaces the list with the placement queue when a dropped photo resolves neither by EXIF nor interpolation', async () => {
    const fetchSpy = mockGoogleSignIn()
    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    await act(async () => {
      fireEvent.drop(shell, { dataTransfer: fileDataTransfer([noGpsPhoto()]) })
    })

    expect(await screen.findByText('Not saved')).toBeDefined()
    expect(screen.getByText('1 photo · 0 placed · 1 needs a location')).toBeDefined()
    // The chips and the "needs a location" search-card title are the same
    // "replaces the list face" treatment a draft already gets.
    expect(screen.queryByRole('group', { name: 'Filter' })).toBeNull()
    expect(screen.getByText('needs a location')).toBeDefined()
    // Nothing has been written — it waits in the queue, not the store.
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(0)
    fetchSpy.mockRestore()
  })

  it('Back in the search card discards the queue, the same as Discard n', async () => {
    const fetchSpy = mockGoogleSignIn()
    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    await act(async () => {
      fireEvent.drop(shell, { dataTransfer: fileDataTransfer([noGpsPhoto()]) })
    })
    await screen.findByText('Not saved')

    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))

    expect(screen.queryByText('Not saved')).toBeNull()
    expect(await screen.findByRole('group', { name: 'Filter' })).toBeDefined()
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(0)
    fetchSpy.mockRestore()
  })

  it('Discard n on the placement queue panel returns to the list, saving nothing', async () => {
    const fetchSpy = mockGoogleSignIn()
    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    await act(async () => {
      fireEvent.drop(shell, { dataTransfer: fileDataTransfer([noGpsPhoto()]) })
    })
    await screen.findByText('Not saved')

    fireEvent.click(screen.getByRole('button', { name: 'Discard 1' }))

    expect(screen.queryByText('Not saved')).toBeNull()
    expect(await screen.findByRole('group', { name: 'Filter' })).toBeDefined()
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(0)
    fetchSpy.mockRestore()
  })

  it('a resolved photo in the same drop saves immediately and counts toward the batch total', async () => {
    const fetchSpy = mockGoogleSignIn()
    const gpsBuffer = readFileSync(join(__dirname, 'photo/fixtures/gps-and-timestamps.jpg'))
    const gpsPhoto = new File([gpsBuffer], 'sapporo.jpg', { type: 'image/jpeg' })
    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    await act(async () => {
      fireEvent.drop(shell, { dataTransfer: fileDataTransfer([gpsPhoto, noGpsPhoto()]) })
    })

    expect(await screen.findByText('2 photos · 1 placed · 1 needs a location')).toBeDefined()
    // The resolved file saved on its own, without waiting on the straggler.
    expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(1)
    fetchSpy.mockRestore()
  })
})

describe('App attach a photo to an existing cairn (#157)', () => {
  function seedLooseCairn(id: string, name: string, overrides: Record<string, unknown> = {}) {
    const existing = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
    window.localStorage.setItem(
      'cairn.loose.index',
      JSON.stringify([
        ...existing,
        {
          kind: 'cairn',
          id,
          name,
          createdAt: '2026-01-01T00:00:00.000Z',
          date: null,
          position: { lat: 43, lng: 141 },
          positionSource: 'placed',
          icon: 'campsite',
          image: null,
          description: '',
          uploadState: 'ok',
          ...overrides,
        },
      ]),
    )
  }

  beforeEach(() => {
    startResumableUpload.mockReset().mockResolvedValue('session-uri')
    uploadFileContent.mockReset().mockResolvedValue({ id: 'drive-file-1' })
  })

  // #95: a loose item — cairn included — is withheld entirely while
  // disconnected (its route shows "Not found" rather than its face), so
  // "drop refused, signed out" for a *loose* cairn's own detail can't
  // actually happen — there is no detail open to drop onto. The disconnected
  // refusal this design note describes is reachable for a trip-owned cairn's
  // lightbox instead, which stays mounted while signed out; see
  // `TripDetail`'s own coverage.

  it("the overlay names the cairn while its detail is open, and imports as new cairns from the list", async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseCairn('c-2', 'Ellery Creek camp')
    await renderApp('/cairns/c-2', { googleClientId: 'a-client-id' })
    await signIn()
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    fireEvent.dragEnter(shell, { dataTransfer: fileDataTransfer([new File(['jpeg'], 'a.jpg')]) })
    expect(await screen.findByText('Add a photo to Ellery Creek camp')).toBeDefined()

    fetchSpy.mockRestore()
  })

  it('drops one image onto an open cairn and attaches it, updating image with no new cairn created', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseCairn('c-3', 'Ellery Creek camp')
    uploadFileContent
      .mockResolvedValueOnce({ id: 'original-1' })
      .mockResolvedValueOnce({ id: 'thumb-1' })
    await renderApp('/cairns/c-3', { googleClientId: 'a-client-id' })
    await signIn()
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    await act(async () => {
      fireEvent.drop(shell, { dataTransfer: fileDataTransfer([new File(['jpeg'], 'a.jpg')]) })
    })

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
      expect(stored).toHaveLength(1)
      expect(stored[0].image).toEqual({ originalDriveFileId: 'original-1', thumbnailDriveFileId: 'thumb-1' })
    })
    fetchSpy.mockRestore()
  })

  it('drops two images onto an open cairn: the first attaches, the second is refused', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseCairn('c-4', 'Ellery Creek camp')
    uploadFileContent
      .mockResolvedValueOnce({ id: 'original-1' })
      .mockResolvedValueOnce({ id: 'thumb-1' })
    await renderApp('/cairns/c-4', { googleClientId: 'a-client-id' })
    await signIn()
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement

    await act(async () => {
      fireEvent.drop(shell, {
        dataTransfer: fileDataTransfer([new File(['jpeg'], 'a.jpg'), new File(['jpeg'], 'b.jpg')]),
      })
    })

    expect(await screen.findByText('only one photo per cairn')).toBeDefined()
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
      expect(stored[0].image).not.toBeNull()
    })
    fetchSpy.mockRestore()
  })

  it('dropping while the list face is open still imports as new cairns (#155)', async () => {
    const fetchSpy = mockGoogleSignIn()
    uploadFileContent
      .mockResolvedValueOnce({ id: 'original-1' })
      .mockResolvedValueOnce({ id: 'thumb-1' })
    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()
    const shell = screen.getByTestId('map').closest('.shell') as HTMLElement
    const gpsBuffer = readFileSync(join(__dirname, 'photo/fixtures/gps-and-timestamps.jpg'))

    await act(async () => {
      fireEvent.drop(shell, {
        dataTransfer: fileDataTransfer([new File([gpsBuffer], 'sapporo.jpg', { type: 'image/jpeg' })]),
      })
    })

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')).toHaveLength(1)
    })
    fetchSpy.mockRestore()
  })
})

describe('App cairn facets (#159)', () => {
  function seedLooseCairn(id: string, name: string, overrides: Record<string, unknown> = {}) {
    const existing = JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')
    window.localStorage.setItem(
      'cairn.loose.index',
      JSON.stringify([
        ...existing,
        {
          kind: 'cairn',
          id,
          name,
          createdAt: '2026-01-01T00:00:00.000Z',
          date: null,
          position: { lat: 43, lng: 141 },
          positionSource: 'placed',
          icon: 'campsite',
          image: null,
          description: '',
          uploadState: 'ok',
          ...overrides,
        },
      ]),
    )
  }

  it('shows the facet row only while Cairns is the active chip', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseCairn('c-1', 'Ellery Creek camp')
    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()

    expect(screen.queryByRole('group', { name: 'Filter cairns' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cairns' }))
    expect(screen.getByRole('group', { name: 'Filter cairns' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Any' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.queryByRole('group', { name: 'Filter cairns' })).toBeNull()

    fetchSpy.mockRestore()
  })

  it('resets the facet to Any when the top-level chip leaves Cairns and returns', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseCairn('c-1', 'Ellery Creek camp', { icon: 'campsite' })
    seedLooseCairn('c-2', 'Spring', { icon: 'water' })
    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()

    fireEvent.click(screen.getByRole('button', { name: 'Cairns' }))
    fireEvent.click(screen.getByRole('button', { name: 'water' }))
    expect(screen.queryByText('Ellery Creek camp')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cairns' }))

    expect(screen.getByRole('button', { name: 'Any' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Ellery Creek camp')).toBeDefined()
    expect(screen.getByText('Spring')).toBeDefined()

    fetchSpy.mockRestore()
  })

  it('hides the facet row on a detail face, and never applies it to a loose track', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedLooseCairn('c-1', 'Ellery Creek camp')
    seedLooseTrack('lt-1', 'Mount Rosea')
    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()

    fireEvent.click(screen.getByRole('button', { name: 'Cairns' }))
    expect(screen.getByRole('group', { name: 'Filter cairns' })).toBeDefined()

    await act(async () => {
      fireEvent.click(screen.getByText('Ellery Creek camp'))
    })
    expect(screen.queryByRole('group', { name: 'Filter cairns' })).toBeNull()

    fetchSpy.mockRestore()
  })
})
