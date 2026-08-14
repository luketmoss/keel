import { describe, expect, it } from 'vitest'
import {
  buildPhotoListRows,
  flattenPhotoListRows,
  formatCaptureTime,
  orderPhotoListItems,
  type PhotoListRow,
} from './photoListGroups'
import type { CairnRecord } from './useCairnImport'

function cairnWithImage(overrides: Partial<CairnRecord> = {}): CairnRecord {
  return {
    id: 'p1',
    name: 'a.jpg',
    position: { lat: 1, lng: 1 },
    positionSource: 'exif',
    icon: null,
    image: { originalDriveFileId: 'orig-1', thumbnailDriveFileId: 'thumb-1' },
    description: '',
    date: null,
    ...overrides,
  }
}

function row(overrides: Partial<PhotoListRow> = {}): PhotoListRow {
  return {
    id: 'p1',
    name: 'a.jpg',
    thumbnailDriveFileId: 'thumb-1',
    originalDriveFileId: 'orig-1',
    source: 'exif',
    ...overrides,
  }
}

describe('buildPhotoListRows', () => {
  it('carries a cairn present with an image, and its position source', () => {
    const rows = buildPhotoListRows([cairnWithImage({ id: 'p1', positionSource: 'interpolated' })], [])

    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('interpolated')
  })

  it('omits a cairn with no image — nothing for this list to show', () => {
    const rows = buildPhotoListRows([cairnWithImage({ id: 'p1', image: null })], [])

    expect(rows).toHaveLength(0)
  })

  it('resolves capture time via gpsTimestamp directly, needing no track offset (criterion 2)', () => {
    const rows = buildPhotoListRows(
      [cairnWithImage({ id: 'p1', gpsTimestamp: '2024-06-01T09:14:00Z' })],
      [],
    )

    expect(rows[0].captureInstantMs).toBe(Date.parse('2024-06-01T09:14:00Z'))
  })

  it('leaves captureInstantMs undefined for a cairn with neither timestamp field (criterion 3)', () => {
    const rows = buildPhotoListRows([cairnWithImage({ id: 'p1' })], [])

    expect(rows[0].captureInstantMs).toBeUndefined()
  })
})

describe('orderPhotoListItems', () => {
  it('orders dated rows by capture time ascending (criterion 2)', () => {
    const rows = [
      row({ id: 'late', captureInstantMs: 200 }),
      row({ id: 'early', captureInstantMs: 100 }),
    ]

    const items = orderPhotoListItems(rows)

    expect(items.map((item) => (item.type === 'row' ? item.row.id : item.divider))).toEqual(['early', 'late'])
  })

  it('sorts undated photos under a No date divider, last, by filename, and never drops them (criterion 3)', () => {
    const rows = [
      row({ id: 'dated', name: 'z.jpg', captureInstantMs: 100 }),
      row({ id: 'undated-b', name: 'b.jpg' }),
      row({ id: 'undated-a', name: 'a.jpg' }),
    ]

    const items = orderPhotoListItems(rows)

    expect(items).toEqual([
      { type: 'row', row: rows[0] },
      { type: 'divider', divider: 'no-date' },
      { type: 'row', row: rows[2] },
      { type: 'row', row: rows[1] },
    ])
  })

  it('emits no dividers at all when every photo is dated', () => {
    const rows = [row({ id: 'a', captureInstantMs: 1 })]

    const items = orderPhotoListItems(rows)

    expect(items.every((item) => item.type === 'row')).toBe(true)
  })
})

describe('flattenPhotoListRows', () => {
  it('drops the dividers and keeps rows in displayed order (lightbox arrow-key order)', () => {
    const rows = [row({ id: 'a', captureInstantMs: 1 }), row({ id: 'b' })]
    const items = orderPhotoListItems(rows)

    expect(flattenPhotoListRows(items).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('formatCaptureTime', () => {
  it('renders HH:MM in the trip local time, adding the offset back onto the UTC instant', () => {
    // 09:14 UTC, trip offset +9 (e.g. Japan) -> 18:14 local.
    const instantMs = Date.parse('2024-06-01T09:14:00Z')

    expect(formatCaptureTime(instantMs, 9)).toBe('18:14')
    expect(formatCaptureTime(instantMs, 0)).toBe('09:14')
  })

  it('pads single-digit hours and minutes', () => {
    const instantMs = Date.parse('2024-06-01T01:05:00Z')

    expect(formatCaptureTime(instantMs, 0)).toBe('01:05')
  })
})
