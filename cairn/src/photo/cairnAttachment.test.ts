import { describe, expect, it } from 'vitest'
import {
  cairnAttachments,
  fileDayCoverage,
  localDay,
  unattachedCairnIds,
  visibleCairnIds,
  type AttachableTrackFile,
} from './cairnAttachment'
import type { Track } from '../kml/parse'

/* Longitude 0 throughout unless a test says otherwise, so `tripUtcOffsetHours`
   returns +0 and the day keys read straight off the timestamps. The one
   offset test below moves the track east on purpose. */
function track(times: (string | undefined)[], lon = 0): Track {
  return {
    name: 't',
    points: times.map((time) => ({ lat: 0, lon, ...(time === undefined ? {} : { time }) })),
  }
}

function file(id: string, tracks: Track[], visible = true): AttachableTrackFile {
  return { id, tracks, visible }
}

describe('localDay', () => {
  it('shifts an absolute instant into the trip offset before taking the day', () => {
    // 22:30 UTC at +9 is 07:30 the next morning locally.
    expect(localDay('2024-06-01T22:30:00Z', 9)).toBe('2024-06-02')
    expect(localDay('2024-06-01T22:30:00Z', 0)).toBe('2024-06-01')
  })

  it('leaves a wall-clock string on its own day — those digits are already local', () => {
    expect(localDay('2024-06-01T23:30:00', 9)).toBe('2024-06-01')
  })

  it('reads a bare calendar date as itself', () => {
    expect(localDay('2024-06-01', 9)).toBe('2024-06-01')
  })

  it('is null for no date and for an unreadable one', () => {
    expect(localDay(null, 0)).toBeNull()
    expect(localDay('not a date', 0)).toBeNull()
  })
})

describe('fileDayCoverage', () => {
  it('covers the first and last day inclusive, and every day between', () => {
    const days = fileDayCoverage([track(['2024-06-01T08:00:00Z', '2024-06-03T18:00:00Z'])], 0)

    expect([...days].sort()).toEqual(['2024-06-01', '2024-06-02', '2024-06-03'])
  })

  it('covers nothing for a track carrying no timed points', () => {
    expect(fileDayCoverage([track([undefined, undefined])], 0).size).toBe(0)
  })

  it('reads the days in the trip offset, not UTC', () => {
    // 23:00 UTC on the 1st is the 2nd everywhere east of +1.
    const days = fileDayCoverage([track(['2024-06-01T23:00:00Z'], 135)], 9)

    expect([...days]).toEqual(['2024-06-02'])
  })

  it('handles a track with more points than a spread call can take', () => {
    // A 1 Hz logger over two days. `Math.min(...instants)` on this throws
    // `RangeError: Maximum call stack size exceeded` — the reason the
    // min/max are reduced in the walk instead.
    const start = Date.parse('2024-06-01T00:00:00Z')
    const times = Array.from({ length: 172_800 }, (_, i) =>
      new Date(start + i * 1000).toISOString(),
    )

    const days = fileDayCoverage([track(times)], 0)

    expect([...days].sort()).toEqual(['2024-06-01', '2024-06-02'])
  })

  it('unions the days of every track in the file', () => {
    const days = fileDayCoverage(
      [track(['2024-06-01T08:00:00Z']), track(['2024-06-05T08:00:00Z'])],
      0,
    )

    expect([...days].sort()).toEqual([
      '2024-06-01',
      '2024-06-02',
      '2024-06-03',
      '2024-06-04',
      '2024-06-05',
    ])
  })
})

describe('cairnAttachments', () => {
  const dayOne = file('f1', [track(['2024-06-01T08:00:00Z', '2024-06-01T18:00:00Z'])])
  const dayTwo = file('f2', [track(['2024-06-02T08:00:00Z', '2024-06-02T18:00:00Z'])])

  it('attaches a cairn to every file covering its day', () => {
    const alsoDayOne = file('f3', [track(['2024-06-01T12:00:00Z'])])
    const attachments = cairnAttachments(
      [{ id: 'c1', date: '2024-06-01T10:00:00Z' }],
      [dayOne, dayTwo, alsoDayOne],
    )

    expect(attachments.get('c1')).toEqual(['f1', 'f3'])
  })

  it('attaches nothing when no file covers the day', () => {
    expect(cairnAttachments([{ id: 'c1', date: '2024-06-09' }], [dayOne]).get('c1')).toEqual([])
  })

  it('attaches nothing for a cairn with no date', () => {
    expect(cairnAttachments([{ id: 'c1', date: null }], [dayOne]).get('c1')).toEqual([])
  })

  it('attaches nothing when the trip carries no timed points at all', () => {
    const untimed = file('f1', [track([undefined])])

    expect(cairnAttachments([{ id: 'c1', date: '2024-06-01' }], [untimed]).get('c1')).toEqual([])
  })
})

describe('visibleCairnIds', () => {
  const dayOne = (visible = true) =>
    file('f1', [track(['2024-06-01T08:00:00Z', '2024-06-01T18:00:00Z'])], visible)
  const dayTwo = (visible = true) =>
    file('f2', [track(['2024-06-02T08:00:00Z', '2024-06-02T18:00:00Z'])], visible)
  const onDayOne = { id: 'c1', date: '2024-06-01T10:00:00Z' }

  it('hides an attached cairn once its only track is hidden, and shows it again', () => {
    expect(visibleCairnIds([onDayOne], [dayOne(false)], true).has('c1')).toBe(false)
    expect(visibleCairnIds([onDayOne], [dayOne(true)], true).has('c1')).toBe(true)
  })

  it('leaves a cairn visible while either of two covering tracks is visible', () => {
    const alsoDayOne = (visible: boolean) => file('f3', [track(['2024-06-01T12:00:00Z'])], visible)

    expect(visibleCairnIds([onDayOne], [dayOne(true), alsoDayOne(false)], true).has('c1')).toBe(true)
    expect(visibleCairnIds([onDayOne], [dayOne(false), alsoDayOne(true)], true).has('c1')).toBe(true)
    expect(visibleCairnIds([onDayOne], [dayOne(false), alsoDayOne(false)], true).has('c1')).toBe(false)
  })

  it('hides every attached cairn when every track is hidden', () => {
    const cairns = [onDayOne, { id: 'c2', date: '2024-06-02T10:00:00Z' }]

    expect(visibleCairnIds(cairns, [dayOne(false), dayTwo(false)], true).size).toBe(0)
  })

  it('leaves an unattached cairn untouched by every track toggle, and visible by default', () => {
    const unattached = { id: 'u1', date: null }

    expect(visibleCairnIds([unattached], [dayOne(true)], true).has('u1')).toBe(true)
    expect(visibleCairnIds([unattached], [dayOne(false)], true).has('u1')).toBe(true)
  })

  it('answers an unattached cairn to its own control alone', () => {
    const unattached = { id: 'u1', date: '2024-06-09' }

    expect(visibleCairnIds([unattached], [dayOne(true)], false).has('u1')).toBe(false)
    expect(visibleCairnIds([unattached], [dayOne(true)], true).has('u1')).toBe(true)
  })

  it("the unattached control does not touch an attached cairn's visibility", () => {
    expect(visibleCairnIds([onDayOne], [dayOne(true)], false).has('c1')).toBe(true)
  })

  it('hiding a track carrying no timed points affects no cairn', () => {
    const untimed = file('f9', [track([undefined])], false)

    expect(visibleCairnIds([onDayOne], [dayOne(true), untimed], true).has('c1')).toBe(true)
  })
})

describe('unattachedCairnIds', () => {
  it('names exactly the cairns no track covers, dated or not', () => {
    const dayOne = file('f1', [track(['2024-06-01T08:00:00Z'])])
    const ids = unattachedCairnIds(
      [
        { id: 'attached', date: '2024-06-01T10:00:00Z' },
        { id: 'wrong-day', date: '2024-06-09' },
        { id: 'undated', date: null },
      ],
      [dayOne],
    )

    expect([...ids].sort()).toEqual(['undated', 'wrong-day'])
  })
})
