import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCairnImport } from './useCairnImport'

/* #242 — the one place this issue's request-count acceptance criteria (1-3,
   9) can actually be verified: end to end, against a mocked `fetch`, with
   none of `src/drive/*` mocked out. Every other `useCairnImport` test mocks
   `../drive/tripMetadata` directly (see `useCairnImport.test.ts`) — cheaper,
   but it can't count real HTTP requests since none are made. */

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function foldersInParentsClause(query: string): string[] {
  const normalized = query.replace(/\+/g, ' ')
  return Array.from(normalized.matchAll(/'([^']+)' in parents/g)).map((match) => match[1])
}

describe('useCairnImport hydration — request volume (#242)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hydrating 50 cairns costs at most 60 Drive requests, none for headRevisionId', async () => {
    const CAIRN_COUNT = 50
    const folders = Array.from({ length: CAIRN_COUNT }, (_, i) => ({ id: `folder-${i}`, name: `cairn-${i}` }))
    const cairnJsonFileId = (folderId: string) => `file-${folderId}`

    let findBatchCalls = 0
    const unmatched: string[] = []
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = decodeURIComponent(String(input))

      if (url.includes("name='trip-1'")) {
        return jsonResponse({ files: [{ id: 'trip-folder-id', createdTime: '2024-01-01T00:00:00Z' }] })
      }
      if (url.includes("name='cairns'")) {
        return jsonResponse({ files: [{ id: 'cairns-folder-id', createdTime: '2024-01-01T00:00:00Z' }] })
      }
      if (url.includes("mimeType='application/vnd.google-apps.folder'") && url.includes('cairns-folder-id')) {
        return jsonResponse({ files: folders })
      }
      if (url.includes("name='cairn.json'")) {
        findBatchCalls += 1
        const batchFolderIds = foldersInParentsClause(url)
        return jsonResponse({
          files: batchFolderIds.map((folderId) => ({
            id: cairnJsonFileId(folderId),
            parents: [folderId],
          })),
        })
      }
      if (url.includes('alt=media')) {
        return jsonResponse({
          id: 'cairn',
          name: 'a.jpg',
          position: { lat: 1, lng: 2 },
          positionSource: 'exif',
          icon: null,
          image: null,
          description: '',
          date: null,
        })
      }
      unmatched.push(url)
      return jsonResponse({}, 500)
    })

    const { result } = renderHook(() => useCairnImport('trip-1', 'token', 'cairn-folder-id', []))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(unmatched).toEqual([])
    expect(result.current.cairns).toHaveLength(CAIRN_COUNT)
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(60)
    expect(findBatchCalls).toBe(2)
    for (const call of fetchSpy.mock.calls) {
      const url = decodeURIComponent(String(call[0]))
      expect(url).not.toContain('headRevisionId')
    }
  })
})
