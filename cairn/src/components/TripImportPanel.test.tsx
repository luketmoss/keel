import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TripImportPanel } from './TripImportPanel'
import type { TripImportFailure, TripImportProgress } from '../import/useTripImport'
import type { CairnImportFailure, CairnImportProgress } from '../photo/useCairnImport'

interface BaseProps {
  signedIn: boolean
  progress: (TripImportProgress | CairnImportProgress)[]
  failures: (TripImportFailure | CairnImportFailure)[]
  importFiles: (incoming: File[]) => Promise<void>
  retryFailure: (id: string) => Promise<void>
  dismissFailures: () => void
}

function baseProps(overrides: Partial<BaseProps> = {}): BaseProps {
  return {
    signedIn: true,
    progress: [],
    failures: [],
    importFiles: vi.fn(),
    retryFailure: vi.fn(),
    dismissFailures: vi.fn(),
    ...overrides,
  }
}

describe('TripImportPanel', () => {
  it('reads "Import files" — #51 widens the control from tracks-only', () => {
    render(<TripImportPanel {...baseProps()} />)

    const button = screen.getByRole('button', { name: 'Import files' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('accepts tracks, photos and archives in the same picker, with multiple selection', () => {
    render(<TripImportPanel {...baseProps()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    // #188: `.zip` is here as well as in the rejection copy, because the
    // picker is where someone finds out an archive is allowed.
    expect(input.accept).toBe('.kml,.kmz,.gpx,.jpg,.jpeg,.png,.webp,.zip')
    expect(input.multiple).toBe(true)
  })

  it('passes every file the picker returns to importFiles in one call, regardless of type', () => {
    const importFiles = vi.fn()
    render(<TripImportPanel {...baseProps({ importFiles })} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const track = new File(['a'], 'day.kml')
    const photo = new File(['b'], 'IMG_1.jpg')
    fireEvent.change(input, { target: { files: [track, photo] } })

    expect(importFiles).toHaveBeenCalledTimes(1)
    expect(importFiles).toHaveBeenCalledWith([track, photo])
  })

  it('disables the button while either pipeline has anything in progress', () => {
    render(
      <TripImportPanel
        {...baseProps({ progress: [{ id: 'progress-1', name: 'IMG_1.jpg', index: 2, total: 5 }] })}
      />,
    )

    const button = screen.getByRole('button', { name: 'Importing…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText('IMG_1.jpg — 2 of 5')).toBeDefined()
  })

  it('#75: renders two progress rows for two files sharing a name, keyed on a unique id', () => {
    render(
      <TripImportPanel
        {...baseProps({
          progress: [
            { id: 'progress-1', name: 'photo.jpg', index: 1, total: 2 },
            { id: 'progress-2', name: 'photo.jpg', index: 1, total: 2 },
          ],
        })}
      />,
    )

    expect(screen.getAllByText('photo.jpg — 1 of 2')).toHaveLength(2)
  })

  it('renders failures from either pipeline and clears them together via Dismiss', () => {
    const dismissFailures = vi.fn()
    render(
      <TripImportPanel
        {...baseProps({
          failures: [
            { id: 'f1', name: 'day.kml', message: 'could not be uploaded, tap to retry' },
            { id: 'p1', name: 'IMG_1.heic', message: "iPhone HEIC photos aren't supported." },
          ],
          dismissFailures,
        })}
      />,
    )

    expect(screen.getByText('day.kml')).toBeDefined()
    expect(screen.getByText('IMG_1.heic')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismissFailures).toHaveBeenCalledTimes(1)
  })

  it('disables the control while signed out', () => {
    render(<TripImportPanel {...baseProps({ signedIn: false })} />)

    const button = screen.getByRole('button', { name: 'Import files' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('#75: names both tracks and photos in the signed-out line, not tracks alone', () => {
    render(<TripImportPanel {...baseProps({ signedIn: false })} />)

    expect(screen.getByText('Sign in to add tracks and photos to this trip.')).toBeDefined()
  })

  it('routes "tap to reconnect" through onReconnect rather than retrying directly (#72)', () => {
    const onReconnect = vi.fn()
    const retryFailure = vi.fn()
    const retryFile = new File(['a'], 'day.kml')
    render(
      <TripImportPanel
        {...baseProps({
          retryFailure,
          failures: [
            {
              id: 'f1',
              name: 'day.kml',
              message: 'signed out before this finished uploading, tap to reconnect',
              retryFile,
              reconnect: true,
            },
          ],
        })}
        onReconnect={onReconnect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /day\.kml/ }))

    expect(onReconnect).toHaveBeenCalledTimes(1)
    expect(retryFailure).not.toHaveBeenCalled()
  })

  it('does nothing when a reconnect-flagged failure is tapped and no onReconnect is wired', () => {
    const retryFailure = vi.fn()
    const retryFile = new File(['a'], 'day.kml')
    render(
      <TripImportPanel
        {...baseProps({
          retryFailure,
          failures: [
            {
              id: 'f1',
              name: 'day.kml',
              message: 'signed out before this finished uploading, tap to reconnect',
              retryFile,
              reconnect: true,
            },
          ],
        })}
      />,
    )

    expect(() => fireEvent.click(screen.getByRole('button', { name: /day\.kml/ }))).not.toThrow()
    expect(retryFailure).not.toHaveBeenCalled()
  })
})
