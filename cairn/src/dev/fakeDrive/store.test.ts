/* #149 — the emulator's concurrency fields. These matter more than a fake
   normally would: `writeJsonFile`'s staleness check is the code this issue
   fixed, and if the emulator models it more forgivingly than real Drive
   does, dev proves nothing. The second `describe` runs the real
   `tripMetadata.ts` against the fake through its own fetch interceptor,
   which is the closest thing to the bug's actual conditions that can run in
   the suite. */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeDriveStore, type FakeFile } from './store'
import { installFetchInterceptor } from './fetchInterceptor'
import { findJsonFile, writeJsonFile } from '../../drive/tripMetadata'

function seedFile(): FakeFile {
  return {
    id: 'file-1',
    name: 'overrides.json',
    mimeType: 'application/json',
    parents: ['folder-1'],
    trashed: false,
    version: 1,
    headRevisionId: 'rev-seed',
    createdTime: '2026-01-01T00:00:00.000Z',
    content: { 'track-1': { displayName: 'Original' } },
  }
}

describe('FakeDriveStore concurrency fields (#149)', () => {
  it('gives a content overwrite a new head revision', async () => {
    const store = new FakeDriveStore(() => [seedFile()])
    await store.whenReady()

    const { file } = await store.overwrite('file-1', { 'track-1': { displayName: 'Renamed' } })

    expect(file.headRevisionId).not.toBe('rev-seed')
    expect(file.headRevisionId).toBeDefined()
  })

  it('leaves the head revision alone on a metadata-only patch', async () => {
    const store = new FakeDriveStore(() => [seedFile()])
    await store.whenReady()

    const patched = await store.patch('file-1', { parents: ['folder-2'] })

    expect(patched.headRevisionId).toBe('rev-seed')
    // `version` still moves — that asymmetry is the whole reason the
    // concurrency token is the revision id and not this counter.
    expect(patched.version).toBe(2)
  })

  it('moves version further than the value an overwrite reports back', async () => {
    const store = new FakeDriveStore(() => [seedFile()])
    await store.whenReady()

    const { file, reportedVersion } = await store.overwrite('file-1', { a: 1 })

    expect(reportedVersion).toBe(2)
    expect(file.version).toBe(3)
  })
})

describe('writeJsonFile against the fake Drive (#149)', () => {
  let originalFetch: typeof window.fetch

  beforeEach(() => {
    originalFetch = window.fetch
  })

  afterEach(() => {
    window.fetch = originalFetch
  })

  /* The regression. Under the old `version` token the second edit here
     failed: the first write's response reported a version the file had
     already moved past, so the pre-write check saw a mismatch and threw a
     conflict against a file nobody else had touched. */
  it('accepts two consecutive edits, each using the ref the previous one returned', async () => {
    const store = new FakeDriveStore(() => [seedFile()])
    await store.whenReady()
    installFetchInterceptor(store)

    const found = await findJsonFile('token', 'folder-1', 'overrides.json')
    expect(found).not.toBeNull()

    const first = await writeJsonFile(
      'token',
      'folder-1',
      'overrides.json',
      { 'track-1': { displayName: 'Renamed once' } },
      found,
    )
    const second = await writeJsonFile(
      'token',
      'folder-1',
      'overrides.json',
      { 'track-1': { displayName: 'Renamed twice' } },
      first,
    )

    expect(second.fileId).toBe('file-1')
    expect(store.get('file-1')?.content).toEqual({ 'track-1': { displayName: 'Renamed twice' } })
  })

  it('still rejects a write whose ref predates someone else writing the file', async () => {
    const store = new FakeDriveStore(() => [seedFile()])
    await store.whenReady()
    installFetchInterceptor(store)

    const stale = await findJsonFile('token', 'folder-1', 'overrides.json')
    // Another tab writes in between, giving the file a new revision.
    await store.overwrite('file-1', { 'track-1': { displayName: 'From another tab' } })

    await expect(
      writeJsonFile('token', 'folder-1', 'overrides.json', { 'track-1': {} }, stale),
    ).rejects.toThrow()
    expect(store.get('file-1')?.content).toEqual({
      'track-1': { displayName: 'From another tab' },
    })
  })
})
