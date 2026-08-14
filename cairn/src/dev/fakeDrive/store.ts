/* The in-memory/IndexedDB-backed file table behind the fake Drive (#93).
   Modeled loosely on Drive's own files resource — id, name, mimeType,
   parents, trashed, version, content — just enough to answer the handful
   of query shapes cairn's own `drive/*` modules actually send. Persisted so
   a trip saved in one dev session is still there after a reload, the same
   guarantee the real Drive gives real trips. */

export interface FakeFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  trashed: boolean
  version: number
  /** Drive's `headRevisionId` — cairn's concurrency token since #149. A new
      one on every content overwrite, untouched by a metadata patch, which
      is the whole distinction from `version` above. Optional because a file
      persisted by a dev session from before #149 has none; the real
      `overwrite` treats a missing id as "no information" and writes anyway,
      so such a file heals on its next write rather than jamming. */
  headRevisionId?: string
  createdTime: string
  /** JSON files (`trip.json`, `overview.geojson`) store their parsed
      value; binary files (uploaded KML/KMZ, photos) store a `Blob`. The
      `alt=media` handler in `fetchInterceptor.ts` branches on which one
      this is. */
  content: unknown
}

const DB_NAME = 'cairn-fake-drive'
const DB_VERSION = 1
const STORE_NAME = 'files'

let nextIdCounter = 0
export function generateFakeFileId(): string {
  nextIdCounter += 1
  return `fake-file-${Date.now().toString(36)}-${nextIdCounter}`
}

let nextRevisionCounter = 0
export function generateFakeRevisionId(): string {
  nextRevisionCounter += 1
  return `fake-rev-${Date.now().toString(36)}-${nextRevisionCounter}`
}

/** Everything reads and writes through this class, never `indexedDB`
    directly — one seam a console-driven `reset()` (and, if it's ever
    needed, a test) can call without knowing anything about persistence. */
export class FakeDriveStore {
  private files = new Map<string, FakeFile>()
  private dbPromise: Promise<IDBDatabase> | null = null
  private readonly ready: Promise<void>

  constructor(private readonly seed: () => FakeFile[]) {
    this.ready = this.load()
  }

  /** Resolves once the store has either loaded a prior session's files
      from IndexedDB or, on a first run, seeded and persisted the
      fixtures — `installFakeDrive` awaits this before installing the
      fetch interceptor, so the very first request the app makes already
      sees a consistent file table. */
  whenReady(): Promise<void> {
    return this.ready
  }

  private openDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Failed to open fake Drive database'))
      })
    }
    return this.dbPromise
  }

  private async load(): Promise<void> {
    try {
      const db = await this.openDB()
      const all = await new Promise<FakeFile[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const request = tx.objectStore(STORE_NAME).getAll()
        request.onsuccess = () => resolve(request.result as FakeFile[])
        request.onerror = () => reject(request.error ?? new Error('Failed to read fake Drive database'))
      })
      if (all.length === 0) {
        for (const file of this.seed()) this.files.set(file.id, file)
        await this.persistAll()
      } else {
        for (const file of all) this.files.set(file.id, file)
      }
    } catch {
      // IndexedDB unavailable (private browsing, a locked-down dev
      // sandbox) — fall back to an in-memory-only fake Drive for this
      // session rather than failing to boot at all. Nothing survives a
      // reload in that case, same degradation `LocalTripStore` accepts for
      // `localStorage`.
      for (const file of this.seed()) this.files.set(file.id, file)
    }
  }

  private async persist(file: FakeFile): Promise<void> {
    try {
      const db = await this.openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(file)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('Failed to write fake Drive database'))
      })
    } catch {
      // Same graceful degradation as `load` above.
    }
  }

  private async persistAll(): Promise<void> {
    await Promise.all([...this.files.values()].map((file) => this.persist(file)))
  }

  /** The console-driven escape hatch back to a clean fixture set, without
      a full page reload — `window.__cairnFakeDrive.reset()`. */
  async reset(): Promise<void> {
    this.files.clear()
    try {
      const db = await this.openDB()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error ?? new Error('Failed to clear fake Drive database'))
      })
    } catch {
      // ignore — see `load`/`persist`
    }
    for (const file of this.seed()) this.files.set(file.id, file)
    await this.persistAll()
  }

  all(): FakeFile[] {
    return [...this.files.values()]
  }

  get(id: string): FakeFile | undefined {
    return this.files.get(id)
  }

  query(predicate: (file: FakeFile) => boolean): FakeFile[] {
    return this.all().filter(predicate)
  }

  async create(input: { name: string; mimeType: string; parents: string[]; content: unknown }): Promise<FakeFile> {
    const file: FakeFile = {
      id: generateFakeFileId(),
      name: input.name,
      mimeType: input.mimeType,
      parents: input.parents,
      trashed: false,
      version: 1,
      headRevisionId: generateFakeRevisionId(),
      createdTime: new Date().toISOString(),
      content: input.content,
    }
    this.files.set(file.id, file)
    await this.persist(file)
    return file
  }

  /** New content, so a new revision — and `version` moving **twice** while
      the caller is told about only the first (`reportedVersion`).
 *
 * That gap is real Drive's, not an invention: `version` "reflects every
 * change made to the file on the server, even those not visible to the
 * user", so a file's counter keeps moving after the upload response is
 * written. Modelling it is what makes #149 — every second edit rejected
 * against a file nobody else touched — reproducible in dev instead of
 * only against a real account. */
  async overwrite(id: string, content: unknown): Promise<{ file: FakeFile; reportedVersion: number }> {
    const existing = this.files.get(id)
    if (!existing) throw new Error(`fake Drive: overwrite of unknown file ${id}`)
    const next: FakeFile = {
      ...existing,
      content,
      version: existing.version + 2,
      headRevisionId: generateFakeRevisionId(),
    }
    this.files.set(id, next)
    await this.persist(next)
    return { file: next, reportedVersion: existing.version + 1 }
  }

  /** Metadata only — trashing, or #120's move between folders. `version`
      moves, `headRevisionId` does not: no new content, so no new revision.
      This is exactly the case that made `version` unusable as a
      concurrency token (#149). */
  async patch(id: string, patch: Partial<Pick<FakeFile, 'trashed' | 'parents'>>): Promise<FakeFile> {
    const existing = this.files.get(id)
    if (!existing) throw new Error(`fake Drive: patch of unknown file ${id}`)
    const next: FakeFile = { ...existing, ...patch, version: existing.version + 1 }
    this.files.set(id, next)
    await this.persist(next)
    // Real Drive trashes a folder's contents with it, and both `trashFolder`
    // callers rely on that — a trip's files, and #120's loose item folder.
    // Without the cascade the harness reports a folder as empty-and-trashed
    // while its children are still listable, which is the one thing anyone
    // inspecting it would want to be true.
    if (patch.trashed) {
      for (const child of [...this.files.values()]) {
        if (child.parents.includes(id) && !child.trashed) await this.patch(child.id, { trashed: true })
      }
    }
    return next
  }
}
