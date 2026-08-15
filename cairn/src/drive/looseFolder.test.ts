import { afterEach, describe, expect, it, vi } from 'vitest'
import { findOrCreateLooseItemFolder } from './looseFolder'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('findOrCreateChild concurrency (via findOrCreateLooseItemFolder)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Regression: two loose items dropped together each resolve
  // `loose/tracks/` (or `loose/cairns/`) independently — `DriveLooseStore`
  // only serializes writes per item id, not per shared parent folder. Before
  // the in-flight cache in `findOrCreateChild`, both callers could see an
  // empty list for the same missing folder and each create one, leaving two
  // `loose` (or two `tracks`/`cairns`) folders with the same name.
  it('shares one lookup/create between concurrent calls for the same parent/name', async () => {
    let resolveList: (value: Response) => void
    const listPromise = new Promise<Response>((resolve) => {
      resolveList = resolve
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // loose/ lookup — shared by both calls, resolved manually below
      .mockImplementationOnce(() => listPromise)
      // loose/ create
      .mockResolvedValueOnce(jsonResponse({ id: 'loose-id', createdTime: '2026-01-01' }))
      // tracks/ lookup, per item
      .mockResolvedValue(jsonResponse({ files: [{ id: 'tracks-id', createdTime: '2025-01-01' }] }))

    const first = findOrCreateLooseItemFolder('token', 'cairn-folder-id', 'track', 'item-a')
    const second = findOrCreateLooseItemFolder('token', 'cairn-folder-id', 'track', 'item-b')

    resolveList!(jsonResponse({ files: [] }))
    await Promise.all([first, second])

    // Exactly one lookup + one create for `loose/`, shared by both calls,
    // instead of each item racing its own list-then-create.
    const looseCreateCalls = fetchSpy.mock.calls.filter(([, init]) => {
      const body = init?.body
      return typeof body === 'string' && JSON.parse(body).name === 'loose'
    })
    expect(looseCreateCalls).toHaveLength(1)
  })
})
