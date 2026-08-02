import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImportPanel } from './ImportPanel'
import type { ImportFailure, ImportProgress } from '../import/types'

interface BaseProps {
  failures: ImportFailure[]
  progress: ImportProgress | null
  importFiles: (incoming: File[]) => Promise<void>
  dismissFailures: () => void
}

function baseProps(overrides: Partial<BaseProps> = {}): BaseProps {
  return {
    failures: [],
    progress: null,
    importFiles: vi.fn(),
    dismissFailures: vi.fn(),
    ...overrides,
  }
}

describe('ImportPanel', () => {
  it('reads "Import tracks" and is enabled when idle', () => {
    render(<ImportPanel {...baseProps()} />)

    const button = screen.getByRole('button', { name: 'Import tracks' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('opens the file picker with the accepted extensions and multiple selection', () => {
    render(<ImportPanel {...baseProps()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toBe('.kml,.kmz')
    expect(input.multiple).toBe(true)
  })

  it('passes every selected file to importFiles in one call', () => {
    const importFiles = vi.fn()
    render(<ImportPanel {...baseProps({ importFiles })} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const a = new File(['a'], 'a.kml')
    const b = new File(['b'], 'b.kml')
    fireEvent.change(input, { target: { files: [a, b] } })

    expect(importFiles).toHaveBeenCalledTimes(1)
    expect(importFiles).toHaveBeenCalledWith([a, b])
  })

  it('disables the button and shows a busy label naming the current file while importing', () => {
    render(
      <ImportPanel
        {...baseProps({ progress: { name: 'trip.kml', index: 2, total: 5 } })}
      />,
    )

    const button = screen.getByRole('button', { name: 'Importing…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText('trip.kml — 2 of 5')).toBeDefined()
  })

  it('lists a failure per file and clears them via dismiss', () => {
    const dismissFailures = vi.fn()
    render(
      <ImportPanel
        {...baseProps({
          failures: [{ id: 'f1', name: 'bad.gpx', message: 'only .kml and .kmz files can be imported' }],
          dismissFailures,
        })}
      />,
    )

    expect(screen.getByText('bad.gpx')).toBeDefined()
    expect(screen.getByText(/only \.kml and \.kmz files can be imported/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(dismissFailures).toHaveBeenCalledTimes(1)
  })
})
