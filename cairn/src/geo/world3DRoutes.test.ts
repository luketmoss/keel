import { describe, expect, it } from 'vitest'
import type { FeatureCollection, LineString } from 'geojson'
import type { TripIndexEntry } from '../store/tripStore'
import type { LooseRecord } from '../store/looseStore'
import { trackColor } from '../map/palette'
import { worldTrackGeometry } from './world3DRoutes'

function overview(coords: [number, number][][]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: coords.map((line) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: line },
    })),
  }
}

function trip(id: string): TripIndexEntry {
  return { id, name: id, status: 'planned' } as unknown as TripIndexEntry
}

function looseTrack(id: string, colorIndex: number): Extract<LooseRecord, { kind: 'track' }> {
  return { id, kind: 'track', colorIndex } as unknown as Extract<LooseRecord, { kind: 'track' }>
}

describe('worldTrackGeometry (#271)', () => {
  it('draws every visible trip\'s tracks, one per overview feature, cycling the palette by position', () => {
    const trips = [trip('t1')]
    const tripStore = { getOverview: () => overview([[[0, 0], [1, 1]], [[2, 2], [3, 3]]]) }
    const looseStore = { getOverview: () => null }

    const result = worldTrackGeometry(trips, tripStore, [], looseStore)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      key: 'trip-t1-0',
      color: trackColor(0),
      points: [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ],
    })
    expect(result[1].color).toBe(trackColor(1))
  })

  it('draws every visible loose track, keeping its own stored colour', () => {
    const looseStore = { getOverview: () => overview([[[10, 20], [11, 21]]]) }
    const tripStore = { getOverview: () => null }

    const result = worldTrackGeometry([], tripStore, [looseTrack('l1', 5)], looseStore)

    expect(result).toEqual([
      {
        key: 'loose-l1-0',
        color: trackColor(5),
        points: [
          { lat: 20, lng: 10 },
          { lat: 21, lng: 11 },
        ],
      },
    ])
  })

  it('skips a trip or loose track with no overview yet', () => {
    const result = worldTrackGeometry(
      [trip('t1')],
      { getOverview: () => null },
      [looseTrack('l1', 0)],
      { getOverview: () => null },
    )
    expect(result).toEqual([])
  })
})
