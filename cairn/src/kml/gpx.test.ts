import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseGpx, parseKmlOrKmz, parseTrack } from './parse'
import { computeTrackStats } from './stats'

const fixturesDir = join(__dirname, 'fixtures')

function loadFixture(name: string, type = 'application/octet-stream'): File {
  const buffer = readFileSync(join(fixturesDir, name))
  return new File([buffer], name, { type })
}

describe('parseGpx', () => {
  it('parses a track with per-point elevation and time', async () => {
    const result = await parseGpx(loadFixture('track.gpx'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0].name).toBe('Ridge Trail')
    expect(result.tracks[0].points).toEqual([
      { lat: 37.0, lon: -122.0, elevation: 100, time: '2020-06-01T08:00:00Z' },
      { lat: 37.1, lon: -122.1, elevation: 150, time: '2020-06-01T08:05:00Z' },
      { lat: 37.2, lon: -122.2, elevation: 200, time: '2020-06-01T08:10:00Z' },
    ])
  })

  /* #223 criterion 8: a segment break is a recording pause, not a separate
     walk, so a multi-segment <trk> comes back as one track with every
     segment's points concatenated in order. */
  it('flattens a multi-segment track into one track rather than several', async () => {
    const result = await parseGpx(loadFixture('multi-segment.gpx'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tracks).toHaveLength(1)
    expect(result.tracks[0].points).toEqual([
      { lat: 37.0, lon: -122.0, elevation: 100, time: '2020-06-01T08:00:00Z' },
      { lat: 37.1, lon: -122.1, elevation: 150, time: '2020-06-01T08:05:00Z' },
      { lat: 37.2, lon: -122.2, elevation: 200, time: '2020-06-01T08:20:00Z' },
      { lat: 37.3, lon: -122.3, elevation: 250, time: '2020-06-01T08:25:00Z' },
    ])
  })

  it('returns a typed error, and does not throw, for a file that is not well-formed XML', async () => {
    const result = await parseGpx(loadFixture('invalid.gpx'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })

  it('rejects a well-formed XML file that is not GPX, naming the format', async () => {
    const result = await parseGpx(loadFixture('not-gpx.gpx'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('File is not a GPX document')
  })

  it('returns an empty, non-error track list for a GPX with waypoints but no track', async () => {
    const result = await parseGpx(loadFixture('no-track.gpx'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tracks).toEqual([])
  })
})

/* #223's acceptance criteria that are about what a parsed GPX reports,
   rather than about parsing itself — #218's stats module reads any
   `Track[]`, so these confirm a GPX's numbers come out the same way a
   KML's would, not that the stats logic is correct (that's stats.test.ts). */
describe('a parsed GPX track feeding #218 stats', () => {
  it('reports ascent, descent, high point and low point from <ele>', async () => {
    const result = await parseGpx(loadFixture('elevation-profile.gpx'))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const stats = computeTrackStats(result.tracks[0])
    expect(stats.elevationGainMeters).toBe(50)
    expect(stats.elevationLossMeters).toBe(50)
    expect(stats.highPointMeters).toBe(1050)
    expect(stats.lowPointMeters).toBe(1000)
  })

  it('reports a duration from <time>', async () => {
    const result = await parseGpx(loadFixture('elevation-profile.gpx'))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const stats = computeTrackStats(result.tracks[0])
    expect(stats.durationSeconds).toBe(4200)
  })

  it('reports elevation unavailable when every <ele> is identical, per #218', async () => {
    const result = await parseGpx(loadFixture('identical-elevation.gpx'))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const stats = computeTrackStats(result.tracks[0])
    expect(stats.elevationGainMeters).toBeUndefined()
    expect(stats.highPointMeters).toBeUndefined()
    expect(stats.distanceMeters).toBeGreaterThan(0)
  })

  it('reports distance only, with no <ele> at all, exactly as an altitude-less KML does', async () => {
    const gpxResult = await parseGpx(loadFixture('no-elevation.gpx'))
    const kmlResult = await parseKmlOrKmz(loadFixture('linestring.kml'))
    expect(gpxResult.ok).toBe(true)
    expect(kmlResult.ok).toBe(true)
    if (!gpxResult.ok || !kmlResult.ok) return

    const gpxStats = computeTrackStats(gpxResult.tracks[0])
    const kmlStats = computeTrackStats(kmlResult.tracks[0])
    expect(gpxStats.elevationGainMeters).toBeUndefined()
    expect(gpxStats.highPointMeters).toBeUndefined()
    expect(gpxStats.durationSeconds).toBeUndefined()
    expect(gpxStats.elevationGainMeters).toBe(kmlStats.elevationGainMeters)
  })

  /* #223 criterion 10: a GPX and a KML of the same activity — `track.gpx`
     and `linestring.kml` share the same three coordinates — produce
     distances within 1% of each other. */
  it('matches a KML of the same activity within 1% on distance', async () => {
    const gpxResult = await parseGpx(loadFixture('track.gpx'))
    const kmlResult = await parseKmlOrKmz(loadFixture('linestring.kml'))
    expect(gpxResult.ok).toBe(true)
    expect(kmlResult.ok).toBe(true)
    if (!gpxResult.ok || !kmlResult.ok) return

    const gpxDistance = computeTrackStats(gpxResult.tracks[0]).distanceMeters
    const kmlDistance = computeTrackStats(kmlResult.tracks[0]).distanceMeters
    expect(Math.abs(gpxDistance - kmlDistance) / kmlDistance).toBeLessThan(0.01)
  })
})

describe('parseTrack', () => {
  it('dispatches a .gpx file to parseGpx', async () => {
    const result = await parseTrack(loadFixture('track.gpx'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.tracks[0].name).toBe('Ridge Trail')
  })

  it('dispatches a .kml file to parseKmlOrKmz', async () => {
    const result = await parseTrack(loadFixture('linestring.kml'))
    const direct = await parseKmlOrKmz(loadFixture('linestring.kml'))

    expect(result).toEqual(direct)
  })

  it('is case-insensitive on the .gpx extension', async () => {
    const buffer = readFileSync(join(fixturesDir, 'track.gpx'))
    const file = new File([buffer], 'Ridge.GPX')

    const result = await parseTrack(file)

    expect(result.ok).toBe(true)
  })
})
