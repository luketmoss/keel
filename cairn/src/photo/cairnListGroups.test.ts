import { describe, expect, it } from 'vitest'
import {
  buildCairnListRows,
  cairnRowMetaLine,
  flattenCairnListRows,
  formatCaptureTime,
  orderCairnListItems,
  type CairnListRow,
} from './cairnListGroups'
import type { CairnRecord } from './useCairnImport'
import { formatShortDate } from '../format/dates'

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

function row(overrides: Partial<CairnListRow> = {}): CairnListRow {
  return {
    id: 'p1',
    name: 'a.jpg',
    icon: null,
    thumbnailDriveFileId: 'thumb-1',
    originalDriveFileId: 'orig-1',
    date: null,
    source: 'exif',
    ...overrides,
  }
}

describe('buildCairnListRows', () => {
  it('carries a cairn present with an image, and its position source', () => {
    const rows = buildCairnListRows([cairnWithImage({ id: 'p1', positionSource: 'interpolated' })], [])

    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('interpolated')
  })

  it('#169: includes an icon-only cairn with no image — the unified list folds it in', () => {
    const rows = buildCairnListRows(
      [cairnWithImage({ id: 'p1', image: null, icon: 'campsite' })],
      [],
    )

    expect(rows).toHaveLength(1)
    expect(rows[0].icon).toBe('campsite')
    expect(rows[0].thumbnailDriveFileId).toBeNull()
  })

  it('resolves capture time via gpsTimestamp directly, needing no track offset', () => {
    const rows = buildCairnListRows(
      [cairnWithImage({ id: 'p1', gpsTimestamp: '2024-06-01T09:14:00Z' })],
      [],
    )

    expect(rows[0].captureInstantMs).toBe(Date.parse('2024-06-01T09:14:00Z'))
  })

  it('leaves captureInstantMs undefined for a cairn with neither timestamp field', () => {
    const rows = buildCairnListRows([cairnWithImage({ id: 'p1' })], [])

    expect(rows[0].captureInstantMs).toBeUndefined()
  })

  it('carries the display date through unchanged', () => {
    const rows = buildCairnListRows([cairnWithImage({ id: 'p1', date: '2023-06-13' })], [])

    expect(rows[0].date).toBe('2023-06-13')
  })
})

describe('orderCairnListItems', () => {
  it('orders dated rows by date ascending', () => {
    const rows = [
      row({ id: 'late', date: '2024-06-02' }),
      row({ id: 'early', date: '2024-06-01' }),
    ]

    const items = orderCairnListItems(rows)

    expect(items.map((item) => (item.type === 'row' ? item.row.id : item.divider))).toEqual(['early', 'late'])
  })

  it('sorts undated cairns under a No date divider, last, by filename, and never drops them', () => {
    const rows = [
      row({ id: 'dated', name: 'z.jpg', date: '2024-06-01' }),
      row({ id: 'undated-b', name: 'b.jpg' }),
      row({ id: 'undated-a', name: 'a.jpg' }),
    ]

    const items = orderCairnListItems(rows)

    expect(items).toEqual([
      { type: 'row', row: rows[0] },
      { type: 'divider', divider: 'no-date' },
      { type: 'row', row: rows[2] },
      { type: 'row', row: rows[1] },
    ])
  })

  it('emits no dividers at all when every cairn is dated', () => {
    const rows = [row({ id: 'a', date: '2024-06-01' })]

    const items = orderCairnListItems(rows)

    expect(items.every((item) => item.type === 'row')).toBe(true)
  })
})

describe('flattenCairnListRows', () => {
  it('drops the dividers and keeps rows in displayed order (lightbox arrow-key order)', () => {
    const rows = [row({ id: 'a', date: '2024-06-01' }), row({ id: 'b' })]
    const items = orderCairnListItems(rows)

    expect(flattenCairnListRows(items).map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('cairnRowMetaLine (#169 — cairns.md "The row")', () => {
  it('a photo with no icon reads "date · photo"', () => {
    const when = formatShortDate('2023-06-16')
    expect(cairnRowMetaLine(row({ date: '2023-06-16', icon: null, thumbnailDriveFileId: 'thumb-1' }))).toBe(
      `${when} · photo`,
    )
  })

  it('a campsite with no photo reads "date · campsite"', () => {
    const when = formatShortDate('2023-06-13')
    expect(
      cairnRowMetaLine(row({ date: '2023-06-13', icon: 'campsite', thumbnailDriveFileId: null })),
    ).toBe(`${when} · campsite`)
  })

  it('a campsite with a photo reads clauses for both', () => {
    const when = formatShortDate('2023-06-13')
    expect(
      cairnRowMetaLine(row({ date: '2023-06-13', icon: 'campsite', thumbnailDriveFileId: 'thumb-1' })),
    ).toBe(`${when} · campsite · photo`)
  })

  it('neither an icon nor a photo reads "date · cairn"', () => {
    const when = formatShortDate('2026-08-14')
    expect(
      cairnRowMetaLine(row({ date: '2026-08-14', icon: null, thumbnailDriveFileId: null })),
    ).toBe(`${when} · cairn`)
  })

  it('undated reads "undated" in place of the date', () => {
    expect(cairnRowMetaLine(row({ date: null, icon: null, thumbnailDriveFileId: 'thumb-1' }))).toBe(
      'undated · photo',
    )
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
