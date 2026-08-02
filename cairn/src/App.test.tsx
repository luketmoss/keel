import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/* Unmocked, APIProvider injects Google's script tag and the suite makes a
   network call from CI. The stub renders just enough to tell "the map
   mounted" apart from a panel rendered instead. */
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="api-provider">{children}</div>
  ),
  Map: () => <div data-testid="map" />,
}))

/* `env.ts` reads `import.meta.env` once at module evaluation, mirroring
   MapView.test.tsx — the key has to be stubbed and modules reset before App
   (which pulls in MapView) is imported. */
async function renderApp() {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'a-browser-key')
  vi.resetModules()
  const { App } = await import('./App')
  return render(<App />)
}

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
