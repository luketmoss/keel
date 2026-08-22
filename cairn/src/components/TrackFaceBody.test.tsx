import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TrackFaceBody } from './TrackFaceBody'
import type { TrackStats } from '../kml/stats'

const STATS: TrackStats = {
  distanceMeters: 10_000,
  durationSeconds: 3600,
  elevationGainMeters: 500,
  elevationLossMeters: 400,
  highPointMeters: 2000,
  lowPointMeters: 1500,
}

describe('TrackFaceBody — the Fly over control (#274)', () => {
  it('carries the track name, given a subject with geometry', () => {
    render(
      <TrackFaceBody
        stats={STATS}
        profile={undefined}
        pointCount={100}
        sourceName="rosea.kml"
        color="#FF7A4D"
        name="Mount Rosea"
        flyoverPoints={[{ lat: -37, lng: 142 }]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Fly over Mount Rosea' })).not.toBeNull()
  })

  it('does not render at all for a track with no usable geometry', () => {
    render(
      <TrackFaceBody
        stats={STATS}
        profile={undefined}
        pointCount={0}
        sourceName="rosea.kml"
        color="#FF7A4D"
        name="Mount Rosea"
        flyoverPoints={[]}
      />,
    )

    expect(screen.queryByRole('button', { name: /Fly over/ })).toBeNull()
  })
})
