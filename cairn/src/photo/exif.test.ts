import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readPhotoExif } from './exif'

const fixturesDir = join(__dirname, 'fixtures')

function loadFixture(name: string, type = 'image/jpeg'): File {
  const buffer = readFileSync(join(fixturesDir, name))
  return new File([buffer], name, { type })
}

describe('readPhotoExif', () => {
  it('parses latitude and longitude from a JPEG carrying GPS EXIF', async () => {
    const result = await readPhotoExif(loadFixture('gps-and-timestamps.jpg'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.exif.latitude).toBeCloseTo(37.7749, 4)
    expect(result.exif.longitude).toBeCloseTo(-122.4194, 4)
  })

  it('leaves location absent, not zero, for a JPEG with GPS tags stripped', async () => {
    const result = await readPhotoExif(loadFixture('gps-stripped.jpg'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.exif.latitude).toBeUndefined()
    expect(result.exif.longitude).toBeUndefined()
  })

  it('parses a photo genuinely recorded at latitude 0, longitude 0 as located there', async () => {
    const result = await readPhotoExif(loadFixture('null-island.jpg'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.exif.latitude).toBe(0)
    expect(result.exif.longitude).toBe(0)
    // Distinguishable from "no location": the fields are present, not merely falsy.
    expect('latitude' in result.exif).toBe(true)
    expect('longitude' in result.exif).toBe(true)
  })

  it('combines GPSDateStamp and GPSTimeStamp into a single absolute UTC instant', async () => {
    const result = await readPhotoExif(loadFixture('gps-and-timestamps.jpg'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.exif.gpsTimestamp).toBe('2021-06-15T21:45:10.000Z')
  })

  it('returns DateTimeOriginal as wall-clock time with no timezone applied', async () => {
    const result = await readPhotoExif(loadFixture('gps-and-timestamps.jpg'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.exif.dateTimeOriginal).toBe('2021-06-15T14:30:00')
    // Not an instant: no trailing Z or numeric offset.
    expect(result.exif.dateTimeOriginal).not.toMatch(/Z|[+-]\d{2}:\d{2}$/)
  })

  it('returns both timestamps independently when a file carries both', async () => {
    const result = await readPhotoExif(loadFixture('gps-and-timestamps.jpg'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.exif.gpsTimestamp).toBe('2021-06-15T21:45:10.000Z')
    expect(result.exif.dateTimeOriginal).toBe('2021-06-15T14:30:00')
    // The two disagree by several hours, proving neither was derived from the other.
    expect(result.exif.gpsTimestamp).not.toBe(result.exif.dateTimeOriginal)
  })

  it('returns EXIF orientation when present', async () => {
    const result = await readPhotoExif(loadFixture('gps-and-timestamps.jpg'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.exif.orientation).toBe(6)
  })

  it('returns every optional field absent, without error, for a valid image with no EXIF block', async () => {
    const result = await readPhotoExif(loadFixture('no-exif.jpg'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.exif.latitude).toBeUndefined()
    expect(result.exif.longitude).toBeUndefined()
    expect(result.exif.orientation).toBeUndefined()
    expect(result.exif.gpsTimestamp).toBeUndefined()
    expect(result.exif.dateTimeOriginal).toBeUndefined()
  })

  it('returns a typed error, and does not throw, for a file that is not a readable image', async () => {
    const result = await readPhotoExif(loadFixture('not-an-image.jpg'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })
})
