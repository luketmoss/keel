import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TripStats } from './TripStats'
import type { TrackStats } from '../kml/stats'

function withElevation(overrides: Partial<TrackStats> = {}): TrackStats {
  return {
    distanceMeters: 10_000,
    durationSeconds: 3600,
    elevationGainMeters: 500,
    elevationLossMeters: 400,
    highPointMeters: 2000,
    lowPointMeters: 1500,
    ...overrides,
  }
}

function withoutElevation(distanceMeters = 5_000): TrackStats {
  return {
    distanceMeters,
    durationSeconds: undefined,
    elevationGainMeters: undefined,
    elevationLossMeters: undefined,
    highPointMeters: undefined,
    lowPointMeters: undefined,
  }
}

describe('TripStats', () => {
  it('shows six values and no footnote when every track carries elevation', () => {
    render(<TripStats tripName="Test Trip" flyoverPoints={[]} trackStats={[withElevation(), withElevation({ distanceMeters: 5_000 })]} />)

    expect(screen.getByText('Distance')).toBeDefined()
    expect(screen.getByText('9.3 mi')).toBeDefined() // 15,000m
    expect(screen.getByText('Ascent')).toBeDefined()
    expect(screen.getByText('3,281 ft ↑')).toBeDefined() // 1000m
    expect(screen.getByText('Descent')).toBeDefined()
    expect(screen.getByText('2,625 ft ↓')).toBeDefined() // 800m
    expect(screen.getByText('High point')).toBeDefined()
    expect(screen.getByText('6,562 ft')).toBeDefined() // max(2000,2000)
    expect(screen.getByText('Low point')).toBeDefined()
    expect(screen.getByText('4,921 ft')).toBeDefined() // min(1500,1500)
    expect(screen.getByText('Tracks')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
    expect(document.querySelector('.trip-stats__note')).toBeNull()
  })

  it('sums distance over every track, including ones carrying no elevation', () => {
    render(<TripStats tripName="Test Trip" flyoverPoints={[]} trackStats={[withElevation({ distanceMeters: 10_000 }), withoutElevation(5_000)]} />)

    expect(screen.getByText('9.3 mi')).toBeDefined() // 15,000m total
  })

  it('names partial coverage in the footnote, and says distance covers them all', () => {
    render(<TripStats tripName="Test Trip" flyoverPoints={[]} trackStats={[withElevation(), withElevation(), withoutElevation(), withoutElevation()]} />)

    expect(
      screen.getByText('Elevation from 2 of 4 tracks. Distance covers them all.'),
    ).toBeDefined()
  })

  it('shows em dashes for the four elevation cells and a naming footnote when no track carries elevation', () => {
    render(<TripStats tripName="Test Trip" flyoverPoints={[]} trackStats={[withoutElevation(), withoutElevation()]} />)

    expect(screen.getByText('No track in this trip carries elevation.')).toBeDefined()
    const values = document.querySelectorAll('.stat__value--muted')
    // Ascent, descent, high point, low point — distance and track count are real.
    expect(values.length).toBe(4)
  })

  it('shows an em dash in every stat cell and 0 tracks for a trip with no tracks at all', () => {
    render(<TripStats tripName="Test Trip" flyoverPoints={[]} trackStats={[]} />)

    expect(screen.getByText('Add a track to see totals.')).toBeDefined()
    // Distance, ascent, descent, high point, low point — five dashes, not the track count.
    expect(document.querySelectorAll('.stat__value--muted').length).toBe(5)
    expect(screen.getByText('0')).toBeDefined()
  })

  it('aggregates ascent and descent only over tracks carrying elevation, not a subset silently', () => {
    render(
      <TripStats tripName="Test Trip" flyoverPoints={[]}
        trackStats={[
          withElevation({ elevationGainMeters: 100, elevationLossMeters: 90 }),
          withElevation({ elevationGainMeters: 200, elevationLossMeters: 150 }),
          withoutElevation(),
        ]}
      />,
    )

    // 300m -> 984ft, 240m -> 787ft
    expect(screen.getByText('984 ft ↑')).toBeDefined()
    expect(screen.getByText('787 ft ↓')).toBeDefined()
  })

  // #224
  it('marks every elevation figure with ~ and names the source when every track is sampled', () => {
    render(<TripStats tripName="Test Trip" flyoverPoints={[]} trackStats={[withElevation({ elevationSource: 'sampled' })]} />)

    expect(screen.getByText('~1,640 ft ↑')).toBeDefined()
    expect(screen.getByText('~1,312 ft ↓')).toBeDefined()
    expect(screen.getByText('~6,562 ft')).toBeDefined()
    expect(screen.getByText('~4,921 ft')).toBeDefined()
    expect(screen.getByText('Elevation estimated from terrain data.')).toBeDefined()
  })

  it('names the count when only some tracks are sampled', () => {
    render(
      <TripStats tripName="Test Trip" flyoverPoints={[]}
        trackStats={[withElevation({ elevationSource: 'sampled' }), withElevation(), withoutElevation()]}
      />,
    )

    expect(
      screen.getByText('Elevation estimated from terrain data for 1 of 3 tracks.'),
    ).toBeDefined()
  })

  it('marks a total mixing recorded and sampled tracks with ~ — the weaker claim governs', () => {
    render(<TripStats tripName="Test Trip" flyoverPoints={[]} trackStats={[withElevation({ elevationSource: 'sampled' }), withElevation()]} />)

    // 500m + 500m = 1000m ascent, summed over both tracks.
    expect(screen.getByText('~3,281 ft ↑')).toBeDefined()
  })

  // #274
  describe('the Fly over control', () => {
    it('carries the trip name and beneath the grid, given a subject with geometry', () => {
      render(
        <TripStats
          trackStats={[withElevation()]}
          tripName="Ridge Traverse"
          flyoverPoints={[{ lat: 1, lng: 2 }]}
        />,
      )

      expect(screen.getByRole('button', { name: 'Fly over Ridge Traverse' })).not.toBeNull()
    })

    it('does not render at all for a trip with no tracks — "no usable geometry", not disabled', () => {
      render(<TripStats trackStats={[]} tripName="Empty Trip" flyoverPoints={[]} />)

      expect(screen.queryByRole('button', { name: /Fly over/ })).toBeNull()
    })
  })
})
