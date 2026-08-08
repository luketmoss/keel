import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddToTripPicker, type TripChoice } from './AddToTripPicker'
import type { TripIndexEntry } from '../store/tripStore'

function entry(overrides: Partial<TripIndexEntry> = {}): TripIndexEntry {
  return {
    id: 't1',
    name: 'Larapinta Trail',
    startDate: null,
    endDate: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    origin: null,
    photoCount: null,
    ...overrides,
  }
}

function choice(overrides: Partial<TripChoice> = {}): TripChoice {
  return { entry: entry(), trackCount: 4, photoCount: 128, ...overrides }
}

function renderPicker(trips: TripChoice[]) {
  return render(
    <AddToTripPicker
      trips={trips}
      onChoose={vi.fn()}
      onCreate={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe('AddToTripPicker counts (#121)', () => {
  it('shows both counts for a trip whose photos have been counted', () => {
    renderPicker([choice()])

    expect(screen.getByText(/4T · 128P/)).toBeDefined()
  })

  it('shows a real zero for a trip counted and found to hold no photos', () => {
    renderPicker([choice({ trackCount: 3, photoCount: 0 })])

    expect(screen.getByText(/3T · 0P/)).toBeDefined()
  })

  /* The bug this issue exists to fix: a hard-coded `0P` said confidently
     that a trip had no photos when it might have had hundreds. Omitting the
     half is the honest alternative, applied per trip. */
  it('shows the track count alone when nobody has counted the photos', () => {
    const { container } = renderPicker([choice({ trackCount: 1, photoCount: null })])

    const counts = container.querySelector('.add-to-trip__counts')
    expect(counts?.textContent).toBe('1T')
    expect(counts?.textContent).not.toContain('P')
  })

  it('spells the counts out for a screen reader rather than reading 4T · 128P aloud', () => {
    renderPicker([
      choice(),
      choice({ entry: entry({ id: 't2', name: 'Overland Track' }), trackCount: 3, photoCount: 0 }),
      choice({ entry: entry({ id: 't3', name: 'Kokoda Track' }), trackCount: 1, photoCount: null }),
    ])

    expect(screen.getByRole('button', { name: 'Larapinta Trail, 4 tracks, 128 photos' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Overland Track, 3 tracks, no photos' })).toBeDefined()
    // Unknown says nothing about photos rather than guessing at them.
    expect(screen.getByRole('button', { name: 'Kokoda Track, 1 track' })).toBeDefined()
  })

  it('uses singulars at one', () => {
    renderPicker([choice({ trackCount: 1, photoCount: 1 })])

    expect(screen.getByRole('button', { name: 'Larapinta Trail, 1 track, 1 photo' })).toBeDefined()
  })

  it('still chooses the trip it names', () => {
    const onChoose = vi.fn()
    render(
      <AddToTripPicker
        trips={[choice()]}
        onChoose={onChoose}
        onCreate={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Larapinta Trail, 4 tracks, 128 photos' }))
    expect(onChoose).toHaveBeenCalledWith('t1')
  })
})
