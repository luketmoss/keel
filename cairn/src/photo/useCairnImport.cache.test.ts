import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCairnImport, type CairnRecord } from './useCairnImport'
import { cairnCacheKey, readCachedCairns, writeCachedCairns } from '../store/cairnCache'

/* #243 — the cache read, end to end against a mocked `fetch`, with none of
   `src/drive/*` mocked out. This is its own file for the same reason
   `useCairnImport.hydration.test.ts` is: a criterion about *not waiting on
   a Drive request* can only be asserted where the requests are real, and
   the main suite mocks them away.

   **Every test uses its own trip id.** `tripFolder.ts` shares in-flight
   folder lookups through a module-level `pending` map keyed by
   `cairnFolderId:tripId`, and the tests below deliberately include ones
   whose Drive never answers — a shared id would leave that lookup pending
   for the rest of the file and every later test would await it instead of
   its own mock. */

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

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

/** A Drive that answers `tripId`'s hydration with `records`. */
function driveHolding(tripId: string, records: CairnRecord[]) {
  const folders = records.map((record) => ({ id: `folder-${record.id}`, name: record.id }))
  const byFileId = new Map(records.map((record) => [`file-folder-${record.id}`, record]))
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = decodeURIComponent(String(input))
    if (url.includes(`name='${tripId}'`)) {
      return jsonResponse({ files: [{ id: 'trip-folder-id', createdTime: '2024-01-01T00:00:00Z' }] })
    }
    if (url.includes("name='cairns'")) {
      return jsonResponse({ files: [{ id: 'cairns-folder-id', createdTime: '2024-01-01T00:00:00Z' }] })
    }
    if (url.includes("mimeType='application/vnd.google-apps.folder'")) {
      return jsonResponse({ files: folders })
    }
    if (url.includes("name='cairn.json'")) {
      return jsonResponse({
        files: folders.map((folder) => ({ id: `file-${folder.id}`, parents: [folder.id] })),
      })
    }
    if (url.includes('alt=media')) {
      const fileId = url.split('/files/')[1].split('?')[0]
      return jsonResponse(byFileId.get(fileId))
    }
    return jsonResponse({}, 500)
  })
}

/** A Drive that is reachable and never answers — anything rendered while
    this is in place came from the cache and nowhere else. */
function driveThatNeverAnswers() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}))
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCairnImport — cached cairns (#243)', () => {
  it('renders a cached trip without waiting on any Drive request', () => {
    writeCachedCairns('trip-cached', [cairnRecord({ id: 'a' }), cairnRecord({ id: 'b' })])
    const fetchSpy = driveThatNeverAnswers()

    const { result } = renderHook(() => useCairnImport('trip-cached', 'token', 'cairn-folder-id', []))

    expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['a', 'b'])
    expect(result.current.loading).toBe(false)
    // ...and the revalidation still went out behind them.
    expect(fetchSpy).toHaveBeenCalled()
    expect(result.current.hydrated).toBe(false)
  })

  it('leaves a trip with no cached cairns empty until the Drive read lands', async () => {
    driveHolding('trip-cold', [cairnRecord({ id: 'a' })])

    const { result } = renderHook(() => useCairnImport('trip-cold', 'token', 'cairn-folder-id', []))

    expect(result.current.loading).toBe(true)
    expect(result.current.cairns).toEqual([])

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['a'])
    expect(result.current.hydrated).toBe(true)
  })

  it('renders a cached empty trip immediately rather than sitting in Fetching', () => {
    writeCachedCairns('trip-empty', [])
    driveThatNeverAnswers()

    const { result } = renderHook(() => useCairnImport('trip-empty', 'token', 'cairn-folder-id', []))

    expect(result.current.loading).toBe(false)
    expect(result.current.cairns).toEqual([])
  })

  it('replaces the cached set with what Drive holds when the read settles', async () => {
    // Cached: a and b. Drive: b (renamed) and c. One replacement, not a merge.
    writeCachedCairns('trip-replace', [
      cairnRecord({ id: 'a' }),
      cairnRecord({ id: 'b', name: 'stale.jpg' }),
    ])
    driveHolding('trip-replace', [cairnRecord({ id: 'b', name: 'renamed.jpg' }), cairnRecord({ id: 'c' })])

    const { result } = renderHook(() => useCairnImport('trip-replace', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(result.current.cairns.map((cairn) => cairn.id).sort()).toEqual(['b', 'c'])
    expect(result.current.cairns.find((cairn) => cairn.id === 'b')?.name).toBe('renamed.jpg')
    expect(
      readCachedCairns('trip-replace')
        ?.map((cairn) => cairn.id)
        .sort(),
    ).toEqual(['b', 'c'])
  })

  it('shows the Drive version of an edited cairn, not the cached one', async () => {
    writeCachedCairns('trip-edited', [cairnRecord({ id: 'a', name: 'old', position: { lat: 1, lng: 2 } })])
    driveHolding('trip-edited', [
      cairnRecord({
        id: 'a',
        name: 'new',
        icon: 'campsite',
        position: { lat: 9, lng: 9 },
        image: { originalDriveFileId: 'o2', thumbnailDriveFileId: 't2' },
      }),
    ])

    const { result } = renderHook(() => useCairnImport('trip-edited', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(result.current.cairns[0]).toMatchObject({
      name: 'new',
      icon: 'campsite',
      position: { lat: 9, lng: 9 },
      image: { originalDriveFileId: 'o2', thumbnailDriveFileId: 't2' },
    })
  })

  it('leaves the cached cairns rendered when the Drive read fails', async () => {
    writeCachedCairns('trip-failed', [cairnRecord({ id: 'a' })])
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useCairnImport('trip-failed', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['a'])
    // Never hydrated, so nothing downstream may take this for Drive's word
    // on the trip — the cairn count above all (#121).
    expect(result.current.hydrated).toBe(false)
    expect(readCachedCairns('trip-failed')?.map((cairn) => cairn.id)).toEqual(['a'])
  })

  it('renders cached cairns while signed out, with no Drive read to issue', () => {
    writeCachedCairns('trip-signed-out', [cairnRecord({ id: 'a' })])
    const fetchSpy = driveThatNeverAnswers()

    const { result } = renderHook(() => useCairnImport('trip-signed-out', null, null, []))

    expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['a'])
    expect(result.current.loading).toBe(false)
    expect(result.current.hydrated).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('treats an unparseable cache entry as a miss and loads from Drive', async () => {
    window.localStorage.setItem(cairnCacheKey('trip-corrupt'), '{not json')
    driveHolding('trip-corrupt', [cairnRecord({ id: 'a' })])

    const { result } = renderHook(() => useCairnImport('trip-corrupt', 'token', 'cairn-folder-id', []))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.hydrated).toBe(true))
    expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['a'])
  })

  it('never serves one trip the cache belonging to another', async () => {
    writeCachedCairns('trip-other', [cairnRecord({ id: 'other' })])
    driveHolding('trip-scoped', [cairnRecord({ id: 'a' })])

    const { result } = renderHook(() => useCairnImport('trip-scoped', 'token', 'cairn-folder-id', []))

    expect(result.current.cairns).toEqual([])
    await waitFor(() => expect(result.current.hydrated).toBe(true))

    expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['a'])
    expect(readCachedCairns('trip-other')?.map((cairn) => cairn.id)).toEqual(['other'])
  })

  it('re-reads the cache for the trip it is asked about when the id changes', async () => {
    writeCachedCairns('trip-first', [cairnRecord({ id: 'a' })])
    writeCachedCairns('trip-second', [cairnRecord({ id: 'b' })])
    driveThatNeverAnswers()

    const { result, rerender } = renderHook(
      ({ tripId }) => useCairnImport(tripId, 'token', 'cairn-folder-id', []),
      { initialProps: { tripId: 'trip-first' } },
    )
    expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['a'])

    rerender({ tripId: 'trip-second' })

    await waitFor(() => expect(result.current.cairns.map((cairn) => cairn.id)).toEqual(['b']))
  })
})
