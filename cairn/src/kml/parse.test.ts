import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseKmlOrKmz } from './parse'

const fixturesDir = join(__dirname, 'fixtures')

function loadFixture(name: string, type = 'application/octet-stream'): File {
  const buffer = readFileSync(join(fixturesDir, name))
  return new File([buffer], name, { type })
}

describe('parseKmlOrKmz', () => {
  it('parses a LineString placemark to a track with its coordinates and name', async () => {
    const result = await parseKmlOrKmz(loadFixture('linestring.kml'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0].name).toBe('Ridge Trail')
    expect(result.tracks[0].points).toEqual([
      { lat: 37.0, lon: -122.0 },
      { lat: 37.1, lon: -122.1 },
      { lat: 37.2, lon: -122.2 },
    ])
  })

  it('parses a gx:Track with per-point timestamps and elevations', async () => {
    const result = await parseKmlOrKmz(loadFixture('gx-track.kml'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0].name).toBe('Summit Loop')
    expect(result.tracks[0].points).toEqual([
      { lat: 37.0, lon: -122.0, elevation: 100, time: '2020-06-01T08:00:00Z' },
      { lat: 37.1, lon: -122.1, elevation: 150, time: '2020-06-01T08:05:00Z' },
      { lat: 37.2, lon: -122.2, elevation: 200, time: '2020-06-01T08:10:00Z' },
    ])
  })

  it('parses a KMZ to the same result as the equivalent bare KML', async () => {
    const kmlResult = await parseKmlOrKmz(loadFixture('linestring.kml'))
    const kmzResult = await parseKmlOrKmz(loadFixture('linestring.kmz'))

    expect(kmzResult).toEqual(kmlResult)
  })

  it('returns every track from a KML with several placemarks, each with its own name', async () => {
    const result = await parseKmlOrKmz(loadFixture('multi-placemark.kml'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tracks.map((t) => t.name)).toEqual(['Day 1', 'Day 2'])
  })

  it('omits elevation, rather than defaulting it to zero, when the source has none', async () => {
    const result = await parseKmlOrKmz(loadFixture('linestring.kml'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const point of result.tracks[0].points) {
      expect(point.elevation).toBeUndefined()
    }
  })

  it('omits timestamps, rather than fabricating them, for a LineString source', async () => {
    const result = await parseKmlOrKmz(loadFixture('linestring.kml'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    for (const point of result.tracks[0].points) {
      expect(point.time).toBeUndefined()
    }
  })

  it('returns a typed error, and does not throw, for a file that is neither valid KML nor KMZ', async () => {
    const result = await parseKmlOrKmz(loadFixture('invalid.kml'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns an empty, non-error track list for a well-formed KML with no track geometry', async () => {
    const result = await parseKmlOrKmz(loadFixture('no-track.kml'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tracks).toEqual([])
  })
})
