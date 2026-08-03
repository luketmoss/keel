import { describe, expect, it } from 'vitest'
import { positionPhotos } from './positionPhotos'
import type { PhotoRecord } from './photoIndex'
import type { Track } from '../kml/parse'

function photo(overrides: Partial<PhotoRecord> = {}): PhotoRecord {
  return {
    id: 'p1',
    name: 'photo.jpg',
    originalDriveFileId: 'orig-1',
    thumbnailDriveFileId: 'thumb-1',
    ...overrides,
  }
}

// Track points within MAX_INTERPOLATION_GAP_MS (10 minutes) of each other —
// interpolate.ts refuses to bridge a wider gap (its own criterion 7).
const track: Track = {
  name: 'Track',
  points: [
    { lat: 10, lon: 20, time: '2024-01-01T00:00:00Z' },
    { lat: 11, lon: 21, time: '2024-01-01T00:05:00Z' },
  ],
}

describe('positionPhotos', () => {
  it('positions a photo with its own recorded GPS at that position (criterion 1)', () => {
    const photos = [photo({ latitude: 5, longitude: 6 })]

    const positioned = positionPhotos(photos, [track])

    expect(positioned).toEqual([
      {
        id: 'p1',
        name: 'photo.jpg',
        thumbnailDriveFileId: 'thumb-1',
        latitude: 5,
        longitude: 6,
        source: 'exif',
      },
    ])
  })

  it('positions a photo with no GPS by interpolating against the track (criterion 2)', () => {
    const photos = [photo({ gpsTimestamp: '2024-01-01T00:02:30Z' })]

    const positioned = positionPhotos(photos, [track])

    expect(positioned).toHaveLength(1)
    expect(positioned[0].source).toBe('interpolated')
    expect(positioned[0].latitude).toBeCloseTo(10.5)
    expect(positioned[0].longitude).toBeCloseTo(20.5)
  })

  it('drops a photo that cannot be positioned at all, rather than erroring (criterion 3)', () => {
    const photos = [photo({ id: 'unlocated' }), photo({ id: 'located', latitude: 1, longitude: 2 })]

    const positioned = positionPhotos(photos, [track])

    expect(positioned.map((p) => p.id)).toEqual(['located'])
  })

  it('a trip with every photo unlocated positions nothing and does not throw (edge case)', () => {
    const photos = [photo({ id: 'a' }), photo({ id: 'b' })]

    expect(() => positionPhotos(photos, [track])).not.toThrow()
    expect(positionPhotos(photos, [track])).toEqual([])
  })

  it('an empty photo list against real tracks positions nothing', () => {
    expect(positionPhotos([], [track])).toEqual([])
  })

  it('carries through the thumbnail file id and name unchanged', () => {
    const photos = [photo({ latitude: 1, longitude: 2, thumbnailDriveFileId: 'thumb-xyz', name: 'a.jpg' })]

    const [positioned] = positionPhotos(photos, [track])

    expect(positioned.thumbnailDriveFileId).toBe('thumb-xyz')
    expect(positioned.name).toBe('a.jpg')
  })
})
