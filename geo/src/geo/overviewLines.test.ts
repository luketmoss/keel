import { describe, expect, it } from 'vitest'
import type { FeatureCollection, LineString } from 'geojson'
import { linesFromOverview } from './overviewLines'

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

describe('linesFromOverview (#271)', () => {
  it('returns nothing for null', () => {
    expect(linesFromOverview(null)).toEqual([])
  })

  it('converts [lng, lat] GeoJSON coordinates to {lat, lng} points, one array per feature', () => {
    const result = linesFromOverview(
      overview([
        [
          [-119.5, 37.7],
          [-119.4, 37.8],
        ],
        [[145.9, -41.6]],
      ]),
    )

    expect(result).toEqual([
      [
        { lat: 37.7, lng: -119.5 },
        { lat: 37.8, lng: -119.4 },
      ],
      [{ lat: -41.6, lng: 145.9 }],
    ])
  })

  it('skips a feature whose geometry is not a LineString', () => {
    const fc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [1, 2] } }],
    }
    expect(linesFromOverview(fc as FeatureCollection<LineString>)).toEqual([])
  })
})
