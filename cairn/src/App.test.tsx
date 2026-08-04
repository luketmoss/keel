import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function fileDataTransfer(names: string[] = ['a.kml']): DataTransfer {
  return {
    types: ['Files'],
    files: names.map((name) => new File(['x'], name)) as unknown as FileList,
  } as unknown as DataTransfer
}

function textDataTransfer(): DataTransfer {
  return { types: ['text/plain'], files: [] as unknown as FileList } as unknown as DataTransfer
}

describe('App drag-and-drop', () => {
  it('shows no overlay before a drag starts', async () => {
    await renderApp()
    expect(screen.queryByTestId('drop-overlay')).toBeNull()
  })

  it('shows the overlay while a file drag is over the window', async () => {
    await renderApp()
    const app = screen.getByTestId('map').closest('.app') as HTMLElement

    fireEvent.dragEnter(app, { dataTransfer: fileDataTransfer() })

    expect(screen.getByTestId('drop-overlay')).toBeDefined()
  })

  it('does not show the overlay for a drag that carries no files', async () => {
    await renderApp()
    const app = screen.getByTestId('map').closest('.app') as HTMLElement

    fireEvent.dragEnter(app, { dataTransfer: textDataTransfer() })

    expect(screen.queryByTestId('drop-overlay')).toBeNull()
  })

  it('clears the overlay once the drag leaves every nested element', async () => {
    await renderApp()
    const app = screen.getByTestId('map').closest('.app') as HTMLElement
    const sidebar = screen
      .getByRole('button', { name: 'Import tracks' })
      .closest('.sidebar') as HTMLElement

    /* Entering the sidebar (nested inside .app) fires its own enter; leaving
       just the sidebar must not clear the overlay while still over .app. */
    fireEvent.dragEnter(app, { dataTransfer: fileDataTransfer() })
    fireEvent.dragEnter(sidebar, { dataTransfer: fileDataTransfer() })
    fireEvent.dragLeave(sidebar, { dataTransfer: fileDataTransfer() })
    expect(screen.getByTestId('drop-overlay')).toBeDefined()

    fireEvent.dragLeave(app, { dataTransfer: fileDataTransfer() })
    expect(screen.queryByTestId('drop-overlay')).toBeNull()
  })

  it('imports dropped files and clears the overlay', async () => {
    await renderApp()
    const app = screen.getByTestId('map').closest('.app') as HTMLElement

    fireEvent.dragEnter(app, { dataTransfer: fileDataTransfer() })
    await act(async () => {
      fireEvent.drop(app, { dataTransfer: fileDataTransfer(['trip.kml']) })
    })

    expect(screen.queryByTestId('drop-overlay')).toBeNull()
    await screen.findByText('trip.kml', { exact: false })
  })
})

describe('App account row', () => {
  it('renders no sign-in control when VITE_GOOGLE_CLIENT_ID is unset, and the rest of the app works', async () => {
    await renderApp('/')
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull()
    expect(screen.getByTestId('map')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Import tracks' })).toBeDefined()
  })

  it('shows a sign-in control when a client id is configured, and the rest of the app still works', async () => {
    await renderApp('/', { googleClientId: 'a-client-id' })
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeDefined()
    expect(screen.getByTestId('map')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Import tracks' })).toBeDefined()
  })

  it('signing out leaves tracks already loaded in the session untouched', async () => {
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
    const app = screen.getByTestId('map').closest('.app') as HTMLElement
    await act(async () => {
      fireEvent.drop(app, { dataTransfer: fileDataTransfer(['trip.kml']) })
    })
    await screen.findByText('trip.kml', { exact: false })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    })
    await screen.findByText('jane@gmail.com')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByText('trip.kml', { exact: false })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeDefined()

    fetchSpy.mockRestore()
    delete (window as unknown as { google?: unknown }).google
  })
})

describe('App routing', () => {
  it('renders the map and sidebar at /', async () => {
    await renderApp('/')
    expect(screen.getByTestId('map')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Map' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Trips' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Import tracks' })).toBeDefined()
  })

  it('keeps the sidebar and shows the trip list at /trips', async () => {
    await renderApp('/trips')
    expect(screen.queryByTestId('map')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Trips' })).toBeDefined()
    expect(screen.getByPlaceholderText('Trip name')).toBeDefined()
    expect(screen.getByText('No trips yet')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Import tracks' })).toBeDefined()
  })

  it('shows a not-found state at /trips/:id when no trip matches the id', async () => {
    await renderApp('/trips/abc')
    expect(screen.getByRole('link', { name: 'Back to trips' })).toBeDefined()
    expect(screen.getByText('Trip not found')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Import tracks' })).toBeNull()
  })

  it('redirects an unrecognized path to /', async () => {
    await renderApp('/nonsense')
    expect(screen.getByTestId('map')).toBeDefined()
    expect(window.location.pathname).toBe('/')
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

  it('marks "Map" active only at / and "Trips" active at /trips', async () => {
    const first = await renderApp('/')
    expect(screen.getByRole('link', { name: 'Map' }).className).toContain('--active')
    expect(screen.getByRole('link', { name: 'Trips' }).className).not.toContain('--active')
    first.unmount()

    const second = await renderApp('/trips')
    expect(screen.getByRole('link', { name: 'Map' }).className).not.toContain('--active')
    expect(screen.getByRole('link', { name: 'Trips' }).className).toContain('--active')
    second.unmount()

    // /trips/:id replaces the nav with a back arrow — see TripDetail.
    await renderApp('/trips/abc')
    expect(screen.queryByRole('link', { name: 'Map' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to trips' })).toBeDefined()
  })

  it('navigates via the sidebar links and supports back/forward', async () => {
    await renderApp('/')

    fireEvent.click(screen.getByRole('link', { name: 'Trips' }))
    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeDefined()
    expect(window.location.pathname).toBe('/trips')

    fireEvent.click(screen.getByRole('link', { name: 'Map' }))
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
})
