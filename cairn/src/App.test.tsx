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
    return { ok: true, status: 200, json: async () => ({ files: [] }) } as Response
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

  it('renders the filter chips below the search card, and drives the list from them', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('t-planned', 'Kepler Track', { status: 'planned' })
    seedTrip('t-done', 'Larapinta', { status: 'completed' })

    await renderApp('/', { googleClientId: 'a-client-id' })
    await signIn()

    await screen.findByText('Kepler Track')
    expect(screen.getByText('Larapinta')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Planned' }))

    expect(screen.getByText('Kepler Track')).toBeDefined()
    expect(screen.queryByText('Larapinta')).toBeNull()
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
