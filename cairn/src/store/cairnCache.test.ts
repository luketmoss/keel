import { beforeEach, describe, expect, it } from 'vitest'
import { cairnCacheKey, isCairnRecord, readCachedCairns, writeCachedCairns, dropCachedCairns } from './cairnCache'
import type { CairnRecord } from '../photo/useCairnImport'

/* #243 — the local cairn cache on its own terms. The hook's use of it is in
   `photo/useCairnImport.cache.test.ts`; what's here is the store's own
   contract: a miss is never an error, a write that throws is never fatal,
   and one trip's entry is untouchable from another's. */

function cairnRecord(overrides: Partial<CairnRecord> = {}): CairnRecord {
  return {
    id: 'cairn-a',
    name: 'a.jpg',
    position: { lat: 43, lng: 141 },
    positionSource: 'exif',
    icon: null,
    image: null,
    description: '',
    date: null,
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('cairnCache', () => {
  it('round-trips a trip’s cairns', () => {
    writeCachedCairns('trip-1', [cairnRecord(), cairnRecord({ id: 'cairn-b', name: 'b.jpg' })])

    expect(readCachedCairns('trip-1')).toEqual([
      cairnRecord(),
      cairnRecord({ id: 'cairn-b', name: 'b.jpg' }),
    ])
  })

  it('reads an absent entry as a miss, not an empty trip', () => {
    expect(readCachedCairns('trip-1')).toBeNull()
  })

  /* The distinction the whole design note rests on: a cached empty array is
     a fact about the trip and renders the empty state at once; a miss is
     the absence of any fact and waits for Drive. */
  it('reads a cached empty array as an empty trip, not a miss', () => {
    writeCachedCairns('trip-1', [])

    expect(readCachedCairns('trip-1')).toEqual([])
  })

  it('treats unparseable JSON as a miss', () => {
    window.localStorage.setItem(cairnCacheKey('trip-1'), '{not json')

    expect(readCachedCairns('trip-1')).toBeNull()
  })

  it('treats an entry holding anything that fails isCairnRecord as a miss', () => {
    window.localStorage.setItem(
      cairnCacheKey('trip-1'),
      JSON.stringify([cairnRecord(), { id: 'cairn-b', name: 'b.jpg' }]),
    )

    expect(readCachedCairns('trip-1')).toBeNull()
  })

  it('treats an entry that is not an array as a miss', () => {
    window.localStorage.setItem(cairnCacheKey('trip-1'), JSON.stringify({ 'cairn-a': cairnRecord() }))

    expect(readCachedCairns('trip-1')).toBeNull()
  })

  it('degrades to no caching when the storage write throws', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage

    expect(() => writeCachedCairns('trip-1', [cairnRecord()], storage)).not.toThrow()
  })

  it('degrades to a miss when the storage read throws', () => {
    const storage = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError')
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage

    expect(readCachedCairns('trip-1', storage)).toBeNull()
  })

  it('scopes entries per trip — writing one never reads or evicts another', () => {
    writeCachedCairns('trip-a', [cairnRecord({ id: 'a' })])
    writeCachedCairns('trip-b', [cairnRecord({ id: 'b' })])

    expect(readCachedCairns('trip-a')?.map((c) => c.id)).toEqual(['a'])
    expect(readCachedCairns('trip-b')?.map((c) => c.id)).toEqual(['b'])

    dropCachedCairns('trip-a')

    expect(readCachedCairns('trip-a')).toBeNull()
    expect(readCachedCairns('trip-b')?.map((c) => c.id)).toEqual(['b'])
  })

  it('validates the same shape a Drive read is held to', () => {
    expect(isCairnRecord(cairnRecord())).toBe(true)
    expect(isCairnRecord({ ...cairnRecord(), position: null })).toBe(false)
    expect(isCairnRecord({ ...cairnRecord(), positionSource: 'guessed' })).toBe(false)
    expect(isCairnRecord(null)).toBe(false)
  })
})
