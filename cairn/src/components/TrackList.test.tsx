import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackList } from './TrackList'
import type { ImportedFile } from '../import/types'

function importedFile(overrides: Partial<ImportedFile> = {}): ImportedFile {
  const tracks = overrides.tracks ?? [{ name: 'Track', points: [] }]
  return {
    id: 'f1',
    name: 'trip.kml',
    colorIndex: 0,
    visible: true,
    tracks,
    trackStats: tracks.map(() => ({
      distanceMeters: 0,
      durationSeconds: undefined,
      elevationGainMeters: undefined,
    })),
    ...overrides,
  }
}

describe('TrackList', () => {
  it('shows an empty state pointing at the import control when nothing is imported', () => {
    render(<TrackList files={[]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('No tracks yet')).toBeDefined()
    expect(screen.getByText(/Import tracks/)).toBeDefined()
  })

  it('renders one row per imported file', () => {
    render(
      <TrackList
        files={[importedFile({ id: 'a' }), importedFile({ id: 'b', name: 'other.kmz' })]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText('trip.kml', { exact: false })).toBeDefined()
    expect(screen.getByText('other.kmz', { exact: false })).toBeDefined()
  })

  it('shows a swatch matching the file colour and names how many tracks a multi-track file holds', () => {
    const { container } = render(
      <TrackList
        files={[
          importedFile({
            tracks: [
              { name: 'a', points: [] },
              { name: 'b', points: [] },
              { name: 'c', points: [] },
            ],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    const swatch = container.querySelector('.track-row__swatch') as HTMLElement
    expect(swatch.style.backgroundColor).toBe('rgb(255, 59, 48)') // #FF3B30
    expect(screen.getByText('3 tracks', { exact: false })).toBeDefined()
  })

  it('shows the formatted statistics line for a single-track file', () => {
    render(
      <TrackList
        files={[
          importedFile({
            trackStats: [
              { distanceMeters: 8.1 * 1609.344, durationSeconds: 47 * 60, elevationGainMeters: 0 },
            ],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText('8.1 mi · 47m · 0 ft ↑')).toBeDefined()
  })

  it('shows no statistics line for a multi-track file — aggregation is out of scope', () => {
    render(
      <TrackList
        files={[
          importedFile({
            tracks: [
              { name: 'a', points: [] },
              { name: 'b', points: [] },
            ],
            trackStats: [
              { distanceMeters: 1000, durationSeconds: 60, elevationGainMeters: 10 },
              { distanceMeters: 2000, durationSeconds: 120, elevationGainMeters: 20 },
            ],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(document.querySelector('.track-row__stats')).toBeNull()
  })

  it('keeps the statistics line present when the row is hidden', () => {
    render(
      <TrackList
        files={[
          importedFile({
            visible: false,
            trackStats: [{ distanceMeters: 1609.344, durationSeconds: 60, elevationGainMeters: 5 }],
          }),
        ]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(document.querySelector('.track-row__stats')).not.toBeNull()
  })

  it('says nothing about count for a single-track file', () => {
    render(
      <TrackList
        files={[importedFile({ tracks: [{ name: 'a', points: [] }] })]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.queryByText(/track(s)?$/)).toBeNull()
  })

  it('carries the full name in the title attribute for hover', () => {
    render(
      <TrackList
        files={[importedFile({ name: '2024-08-01T09-14-22Z-morning-run.kml' })]}
        onToggleVisibility={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    const name = screen.getByTitle('2024-08-01T09-14-22Z-morning-run.kml')
    expect(name).toBeDefined()
  })

  it('toggles visibility via an accessible button and reflects the hidden state', () => {
    const onToggleVisibility = vi.fn()
    const { rerender } = render(
      <TrackList
        files={[importedFile({ visible: true })]}
        onToggleVisibility={onToggleVisibility}
        onRemove={vi.fn()}
      />,
    )

    const hideButton = screen.getByRole('button', { name: 'Hide trip.kml' })
    fireEvent.click(hideButton)
    expect(onToggleVisibility).toHaveBeenCalledWith('f1')

    rerender(
      <TrackList
        files={[importedFile({ visible: false })]}
        onToggleVisibility={onToggleVisibility}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Show trip.kml' })).toBeDefined()
  })

  it('removes a file via an accessible button', () => {
    const onRemove = vi.fn()
    render(
      <TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={onRemove} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove trip.kml' }))
    expect(onRemove).toHaveBeenCalledWith('f1')
  })

  it('returns to the empty state after the last file is removed', () => {
    const { rerender } = render(
      <TrackList files={[importedFile()]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />,
    )
    expect(screen.queryByText('No tracks yet')).toBeNull()

    rerender(<TrackList files={[]} onToggleVisibility={vi.fn()} onRemove={vi.fn()} />)

    expect(screen.getByText('No tracks yet')).toBeDefined()
  })
})
