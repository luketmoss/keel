import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* #150: `Remove from trip` for a track, driven through the real `App` — the
   one place that decides which name comes out with it.
 *
 * Its own file rather than a block in `App.test.tsx`, because it needs
 * `useTripImport` mocked to put a track inside the trip. That suite drops
 * real KML fixtures and parses them for real, and a module-level mock would
 * quietly take that away from every test in it. */

const { useTripImport, defaultOverridesStore } = vi.hoisted(() => ({
  useTripImport: vi.fn(),
  defaultOverridesStore: { disconnect: vi.fn(), getOverrides: () => ({}), setOverride: vi.fn() },
}))
vi.mock('./import/useTripImport', () => ({ useTripImport, defaultOverridesStore }))

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="api-provider">{children}</div>
  ),
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: () => null,
  AdvancedMarker: () => null,
  Polyline: () => null,
  useMap: () => null,
  useMap3D: () => null,
  useMapsLibrary: () => null,
  useApiIsLoaded: () => true,
  MapMode: { HYBRID: 'HYBRID', SATELLITE: 'SATELLITE' },
  GestureHandling: { GREEDY: 'GREEDY' },
  Map3D: () => null,
}))

/** One track sitting in the open trip. `displayName` is what
    `useTripImport` sets when the trip holds a rename override for it, and
    absent on a track nobody has renamed. */
function tripTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    name: 'day-1.kml',
    sourceName: 'day-1.kml',
    driveFileId: 'drive-1',
    tracks: [{ name: 'Day one', points: [{ lat: 1, lon: 2 }] }],
    trackStats: [{ distanceMeters: 14200, pointCount: 2 }],
    colorIndex: 0,
    visible: true,
    ...overrides,
  }
}

function baseTripImport(overrides: Record<string, unknown> = {}) {
  return {
    tracks: [],
    missingFiles: [],
    loading: false,
    progress: [],
    failures: [],
    importFiles: vi.fn().mockResolvedValue(undefined),
    retryFailure: vi.fn().mockResolvedValue(undefined),
    dismissFailures: vi.fn(),
    toggleVisibility: vi.fn(),
    removeFile: vi.fn(),
    forgetFile: vi.fn().mockResolvedValue(undefined),
    removingTrackIds: new Set<string>(),
    trackRemoveErrors: {},
    renameTrack: vi.fn(),
    recolorTrack: vi.fn(),
    reorderTracks: vi.fn(),
    ...overrides,
  }
}

function seedTrip(tripId: string, name = 'Larapinta') {
  const entry = {
    id: tripId,
    name,
    status: 'planned',
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  window.localStorage.setItem('cairn.trips.index', JSON.stringify([entry]))
  window.localStorage.setItem(
    `cairn.trips.trip.${tripId}`,
    JSON.stringify({ ...entry, notes: '' }),
  )
}

/* Same sign-in stub `App.test.tsx` uses: the loose store refuses a move
   while disconnected, so `Remove from trip` needs a real signed-in session
   to get as far as writing anything. */
function mockGoogleSignIn() {
  ;(window as unknown as { google?: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (config: { callback: (r: { access_token: string }) => void }) => ({
          requestAccessToken: () => config.callback({ access_token: 'tok' }),
        }),
      },
    },
    // A trip holding a track draws one, and `TrackLayer` reads this off the
    // global rather than through the mocked `@vis.gl` components. Nothing in
    // `App.test.tsx` ever put a track inside a trip, so this is the first
    // test to need it.
    maps: { SymbolPath: { CIRCLE: 0 } },
  }
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

async function renderTripFace(tripId: string) {
  window.history.pushState({}, '', `/trips/${tripId}`)
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'a-browser-key')
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'a-client-id')
  vi.resetModules()
  const { App } = await import('./App')
  render(<App />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  })
  await screen.findByRole('button', { name: /Account: jane@gmail.com/ })
}

const looseIndex = () => JSON.parse(window.localStorage.getItem('cairn.loose.index') ?? '[]')

beforeEach(() => {
  window.history.pushState({}, '', '/')
  window.sessionStorage.clear()
  window.localStorage.clear()
  useTripImport.mockReset().mockReturnValue(baseTripImport())
  defaultOverridesStore.disconnect.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  window.localStorage.clear()
  delete (window as unknown as { google?: unknown }).google
})

/* #193 — the exit lives behind the row's `⋮` now, so reaching it is two
   steps. Same helper shape `TripsPanel.test.tsx` already uses. */
function openRowMenu(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Row actions for ${name}` }))
}

describe('App — Remove from trip carries the name out (#150)', () => {
  it('gives the loose track the name the user typed, not the one inside the KML', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('t-1')
    useTripImport.mockReturnValue(
      baseTripImport({ tracks: [tripTrack({ name: 'Snowdon ridge', displayName: 'Snowdon ridge' })] }),
    )

    await renderTripFace('t-1')
    // Opened outside the `act` below: nested inside it, the menu's own
    // state update would not flush until the callback returned, so the
    // item would not exist yet to be clicked.
    openRowMenu('Snowdon ridge')
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from trip' }))
    })

    // #177: the Source row is `sourceName`, not `name` — a rename must not
    // carry the display name into the field the detail face reads as the
    // file it came from.
    expect(looseIndex()).toMatchObject([
      { kind: 'track', name: 'Snowdon ridge', sourceName: 'day-1.kml', driveFileId: 'drive-1' },
    ])
    fetchSpy.mockRestore()
  })

  // The other half of the rule: a name the app derived is derived again on
  // the way out, so a track nobody renamed does not become `day-1.kml`.
  it('derives the name for a track nobody renamed', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('t-2')
    useTripImport.mockReturnValue(baseTripImport({ tracks: [tripTrack()] }))

    await renderTripFace('t-2')
    // Opened outside the `act` below: nested inside it, the menu's own
    // state update would not flush until the callback returned, so the
    // item would not exist yet to be clicked.
    openRowMenu('day-1.kml')
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from trip' }))
    })

    // #177: no regression on the untouched path — sourceName still matches
    // the actual Drive filename.
    expect(looseIndex()).toMatchObject([
      { kind: 'track', name: 'Day one', sourceName: 'day-1.kml' },
    ])
    fetchSpy.mockRestore()
  })

  it('falls back to the filename without its extension when the KML names nothing', async () => {
    const fetchSpy = mockGoogleSignIn()
    seedTrip('t-3')
    useTripImport.mockReturnValue(
      baseTripImport({
        tracks: [tripTrack({ tracks: [{ name: '', points: [{ lat: 1, lon: 2 }] }] })],
      }),
    )

    await renderTripFace('t-3')
    // Opened outside the `act` below: nested inside it, the menu's own
    // state update would not flush until the callback returned, so the
    // item would not exist yet to be clicked.
    openRowMenu('day-1.kml')
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from trip' }))
    })

    expect(looseIndex()).toMatchObject([{ kind: 'track', name: 'day-1' }])
    fetchSpy.mockRestore()
  })
})
