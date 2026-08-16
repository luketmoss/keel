import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseGpx, parseKmlOrKmz, parseTrack } from './parse'

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
