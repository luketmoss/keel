/* #211 — the negated mimetype clause `trackFiles.ts` sends when loading a
   trip's track files. Before this, `parseDriveQuery` fell through every
   branch on `mimeType!='...'` and hit the deliberate unrecognized-clause
   throw, which put the fake Drive session into `token-expired` and left
   every cairn image on a trip face rendering as the placeholder forever. */

import { describe, expect, it } from 'vitest'
import { parseDriveQuery } from './queryParser'
import type { FakeFile } from './store'

function makeFile(overrides: Partial<FakeFile> = {}): FakeFile {
  return {
    id: 'file-1',
    name: 'track.gpx',
    mimeType: 'application/octet-stream',
    parents: ['folder-1'],
    trashed: false,
    version: 1,
    headRevisionId: 'rev-1',
    createdTime: '2026-01-01T00:00:00.000Z',
    content: null,
    ...overrides,
  }
}

describe('parseDriveQuery negated mimetype clause (#211)', () => {
  it('excludes files matching the negated mimetype', () => {
    const filter = parseDriveQuery("mimeType!='application/vnd.google-apps.folder'")

    expect(filter(makeFile({ mimeType: 'application/vnd.google-apps.folder' }))).toBe(false)
    expect(filter(makeFile({ mimeType: 'image/jpeg' }))).toBe(true)
  })

  it('resolves the exact shape trackFiles.ts sends without throwing', () => {
    const query =
      "'folder-1' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false"

    let filter: ReturnType<typeof parseDriveQuery> | undefined
    expect(() => {
      filter = parseDriveQuery(query)
    }).not.toThrow()

    expect(
      filter?.(makeFile({ mimeType: 'application/vnd.google-apps.folder', parents: ['folder-1'] })),
    ).toBe(false)
    expect(filter?.(makeFile({ mimeType: 'image/jpeg', parents: ['folder-1'] }))).toBe(true)
    expect(
      filter?.(makeFile({ mimeType: 'image/jpeg', parents: ['folder-1'], trashed: true })),
    ).toBe(false)
    expect(filter?.(makeFile({ mimeType: 'image/jpeg', parents: ['folder-2'] }))).toBe(false)
  })

  it('still throws on any other unrecognized clause shape', () => {
    expect(() => parseDriveQuery("mimeType>'image/jpeg'")).toThrow(
      /unrecognized query clause/,
    )
  })
})
