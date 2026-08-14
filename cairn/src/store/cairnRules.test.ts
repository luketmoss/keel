import { describe, expect, it } from 'vitest'
import { cairnDrawsAsThumbnail, interpolateCairn, isValidCairnImage, placeCairn } from './cairnRules'
import type { LooseCairnRecord } from './looseStore'

function makeCairn(overrides: Partial<LooseCairnRecord> = {}): LooseCairnRecord {
  return {
    kind: 'cairn',
    id: 'cairn-1',
    name: 'Campsite',
    createdAt: '2026-01-01T00:00:00.000Z',
    uploadState: 'ok',
    position: { lat: 10, lng: 20 },
    positionSource: 'exif',
    icon: null,
    image: null,
    description: '',
    date: null,
    ...overrides,
  }
}

describe('placeCairn', () => {
  it('sets positionSource to placed from exif', () => {
    const cairn = makeCairn({ positionSource: 'exif' })
    const placed = placeCairn(cairn, { lat: 1, lng: 2 })
    expect(placed.positionSource).toBe('placed')
    expect(placed.position).toEqual({ lat: 1, lng: 2 })
  })

  it('sets positionSource to placed from interpolated', () => {
    const cairn = makeCairn({ positionSource: 'interpolated' })
    expect(placeCairn(cairn, { lat: 1, lng: 2 }).positionSource).toBe('placed')
  })

  it('sets positionSource to placed even when already placed', () => {
    const cairn = makeCairn({ positionSource: 'placed' })
    expect(placeCairn(cairn, { lat: 1, lng: 2 }).positionSource).toBe('placed')
  })
})

describe('interpolateCairn', () => {
  it('writes to a cairn whose source is interpolated', () => {
    const cairn = makeCairn({ positionSource: 'interpolated', position: { lat: 0, lng: 0 } })
    const next = interpolateCairn(cairn, { lat: 5, lng: 6 })
    expect(next.position).toEqual({ lat: 5, lng: 6 })
    expect(next.positionSource).toBe('interpolated')
  })

  it('never writes to a placed cairn', () => {
    const cairn = makeCairn({ positionSource: 'placed', position: { lat: 0, lng: 0 } })
    const next = interpolateCairn(cairn, { lat: 5, lng: 6 })
    expect(next).toBe(cairn)
    expect(next.position).toEqual({ lat: 0, lng: 0 })
  })

  it('never writes to an exif cairn', () => {
    const cairn = makeCairn({ positionSource: 'exif', position: { lat: 0, lng: 0 } })
    const next = interpolateCairn(cairn, { lat: 5, lng: 6 })
    expect(next).toBe(cairn)
    expect(next.position).toEqual({ lat: 0, lng: 0 })
  })
})

describe('cairnDrawsAsThumbnail', () => {
  const image = { originalDriveFileId: 'orig', thumbnailDriveFileId: 'thumb' }

  it('draws as a thumbnail when it has an image and no icon', () => {
    expect(cairnDrawsAsThumbnail({ image, icon: null })).toBe(true)
  })

  it('draws as a pin when it has an icon, even with an image', () => {
    expect(cairnDrawsAsThumbnail({ image, icon: 'campsite' })).toBe(false)
  })

  it('draws as a pin when it has an icon and no image', () => {
    expect(cairnDrawsAsThumbnail({ image: null, icon: 'campsite' })).toBe(false)
  })

  it('draws as a pin when it has neither an image nor an icon', () => {
    expect(cairnDrawsAsThumbnail({ image: null, icon: null })).toBe(false)
  })
})

describe('isValidCairnImage', () => {
  it('accepts null', () => {
    expect(isValidCairnImage(null)).toBe(true)
  })

  it('accepts both ids present', () => {
    expect(isValidCairnImage({ originalDriveFileId: 'a', thumbnailDriveFileId: 'b' })).toBe(true)
  })

  it('rejects only the original id present', () => {
    expect(isValidCairnImage({ originalDriveFileId: 'a' })).toBe(false)
  })

  it('rejects only the thumbnail id present', () => {
    expect(isValidCairnImage({ thumbnailDriveFileId: 'b' })).toBe(false)
  })

  it('rejects a non-object, non-null value', () => {
    expect(isValidCairnImage('a')).toBe(false)
    expect(isValidCairnImage(42)).toBe(false)
  })
})
