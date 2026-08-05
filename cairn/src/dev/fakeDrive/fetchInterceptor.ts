/* Routes every `fetch` bound for `www.googleapis.com` (Drive's REST API,
   including its `/upload/` endpoints) to `FakeDriveStore` instead of the
   network, and passes everything else — Maps tiles, Vite's own requests —
   straight through to the real `fetch`. Every `src/drive/*` module talks to
   Drive through plain `fetch`, so this is the one seam that has to be
   faithful; nothing downstream needs to know it's fake.

   Deliberately not a `Request`-based mock (`msw` or similar): every caller
   in this app builds its request with a plain object literal for `init`, so
   `init.body` is already the in-memory value the caller constructed — a
   `File` for the resumable upload, a JSON string everywhere else — and
   reading it directly here is simpler and more faithful than round-tripping
   it through a `Request`'s stream. */

import type { FakeDriveStore, FakeFile } from './store'
import { parseDriveQuery } from './queryParser'
import { FAKE_ACCOUNT } from './fixtures'

const DRIVE_ORIGIN = 'https://www.googleapis.com'
const RESUMABLE_PREFIX = `${DRIVE_ORIGIN}/upload/drive/v3/files/resumable/`

interface PendingResumableUpload {
  name: string
  parents: string[]
}

/** Every resumable session this emulator has opened, keyed by the fake
    session id embedded in its URI. Never trimmed — a dev session never
    opens enough of these to matter. */
const pendingUploads = new Map<string, PendingResumableUpload>()

let forceNext401 = false

/** `window.__cairnFakeDrive.force401()` — the console hook behind
    acceptance criterion 7: the *next* Drive request of any kind fails with
    a 401, exercising the real `token-expired` → `Reconnect` path against
    the fake exactly as it would against a real expired token. */
export function forceNextRequest401(): void {
  forceNext401 = true
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, message: string): Response {
  // Real Drive's error body always nests under `error` — `isQuotaExceeded`
  // in trackFiles.ts reads `body.error.errors`/`body.error.status`, so an
  // emulator error that doesn't nest the same way would silently defeat
  // that check on a real caller that hits it.
  return jsonResponse({ error: { message, errors: [] } }, status)
}

function fileMetadata(file: FakeFile) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    createdTime: file.createdTime,
    version: String(file.version),
  }
}

function contentResponse(file: FakeFile): Response {
  if (file.content instanceof Blob) return new Response(file.content, { status: 200 })
  return jsonResponse(file.content)
}

async function handleFilesList(store: FakeDriveStore, url: URL): Promise<Response> {
  const q = url.searchParams.get('q') ?? ''
  const filter = parseDriveQuery(q)
  const files = store.query(filter)
  return jsonResponse({ files: files.map(fileMetadata) })
}

function handleFilesGet(store: FakeDriveStore, id: string, url: URL): Response {
  const file = store.get(id)
  if (!file) return errorResponse(404, `fake Drive: no file ${id}`)
  if (url.searchParams.get('alt') === 'media') return contentResponse(file)
  // Every `fields=` this app asks for on a metadata read (`version`, or the
  // full set) is a subset of what `fileMetadata` always returns — this
  // emulator never bothers trimming to the requested fields, unlike real
  // Drive.
  return jsonResponse(fileMetadata(file))
}

async function handleFilesCreate(store: FakeDriveStore, body: string): Promise<Response> {
  const parsed = JSON.parse(body) as { name: string; mimeType: string; parents: string[] }
  const file = await store.create({
    name: parsed.name,
    mimeType: parsed.mimeType,
    parents: parsed.parents,
    content: null,
  })
  return jsonResponse(fileMetadata(file))
}

async function handleFilesPatch(store: FakeDriveStore, id: string, body: string): Promise<Response> {
  const file = store.get(id)
  if (!file) return errorResponse(404, `fake Drive: no file ${id}`)
  const parsed = JSON.parse(body) as { trashed?: boolean }
  await store.patch(id, { trashed: parsed.trashed ?? file.trashed })
  return jsonResponse({})
}

/** Reverses exactly the multipart body `tripMetadata.ts#create` builds:
    two `--boundary`-delimited parts, each a `Content-Type` header, a blank
    line, then a JSON blob. Not a general MIME parser — see this module's
    doc comment on why matching this app's one producer is enough. */
function parseMultipart(body: string, boundary: string): { metadata: { name: string; parents: string[] }; content: unknown } {
  const segments = body.split(`--${boundary}`)
  const jsonFrom = (segment: string): string => {
    const blankLine = segment.indexOf('\r\n\r\n')
    return segment.slice(blankLine + 4).trim()
  }
  const metadata = JSON.parse(jsonFrom(segments[1])) as { name: string; parents: string[] }
  const content = JSON.parse(jsonFrom(segments[2])) as unknown
  return { metadata, content }
}

async function handleUploadMultipartCreate(store: FakeDriveStore, body: string, contentType: string): Promise<Response> {
  const boundaryMatch = /boundary=([^;]+)/.exec(contentType)
  if (!boundaryMatch) return errorResponse(400, 'fake Drive: multipart upload missing a boundary')
  const { metadata, content } = parseMultipart(body, boundaryMatch[1])
  const file = await store.create({
    name: metadata.name,
    mimeType: 'application/json',
    parents: metadata.parents,
    content,
  })
  return jsonResponse(fileMetadata(file))
}

async function handleUploadMediaOverwrite(store: FakeDriveStore, id: string, body: string): Promise<Response> {
  if (!store.get(id)) return errorResponse(404, `fake Drive: no file ${id}`)
  const content = JSON.parse(body) as unknown
  const file = await store.overwrite(id, content)
  return jsonResponse(fileMetadata(file))
}

function handleResumableInit(body: string): Response {
  const parsed = JSON.parse(body) as { name: string; parents: string[] }
  const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  pendingUploads.set(sessionId, { name: parsed.name, parents: parsed.parents })
  return new Response(null, { status: 200, headers: { Location: `${RESUMABLE_PREFIX}${sessionId}` } })
}

async function handleResumablePut(store: FakeDriveStore, sessionId: string, init: RequestInit): Promise<Response> {
  const pending = pendingUploads.get(sessionId)
  if (!pending) return errorResponse(404, `fake Drive: unknown upload session ${sessionId}`)

  const contentRange = new Headers(init.headers).get('Content-Range') ?? ''
  if (contentRange.startsWith('bytes */')) {
    // A resumed-upload status check — out of scope per #93 ("fault
    // injection beyond the forced 401"), since this emulator never fails
    // an upload mid-transfer for the real code to need to resume from.
    // Answered honestly (nothing received yet) rather than left to throw,
    // in case something ever does call it.
    return new Response(null, { status: 308, headers: { Range: 'bytes=0-0' } })
  }

  const body = init.body
  const blob = body instanceof Blob ? body : new Blob([body as BlobPart])
  const file = await store.create({
    name: pending.name,
    mimeType: blob.type || 'application/octet-stream',
    parents: pending.parents,
    content: blob,
  })
  pendingUploads.delete(sessionId)
  return jsonResponse({ id: file.id })
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/** Replaces `window.fetch` for the lifetime of the page. Idempotent against
    the real `fetch` is not attempted — this only ever runs once, from
    `installFakeDrive`, before the app renders. */
export function installFetchInterceptor(store: FakeDriveStore): void {
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input)
    if (!url.startsWith(DRIVE_ORIGIN)) return originalFetch(input, init)

    if (forceNext401) {
      forceNext401 = false
      return errorResponse(401, 'fake Drive: forced token expiry')
    }

    if (url.startsWith(RESUMABLE_PREFIX) && (init?.method ?? 'GET').toUpperCase() === 'PUT') {
      const sessionId = url.slice(RESUMABLE_PREFIX.length)
      try {
        return await handleResumablePut(store, sessionId, init ?? {})
      } catch (error) {
        return errorResponse(500, error instanceof Error ? error.message : 'fake Drive error')
      }
    }

    const parsed = new URL(url)
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = String(init?.body ?? '')

    try {
      if (parsed.pathname === '/drive/v3/about' && method === 'GET') {
        return jsonResponse({ user: FAKE_ACCOUNT })
      }
      if (parsed.pathname === '/upload/drive/v3/files' && method === 'POST') {
        const uploadType = parsed.searchParams.get('uploadType')
        if (uploadType === 'resumable') return handleResumableInit(body)
        if (uploadType === 'multipart') {
          const contentType = new Headers(init?.headers).get('Content-Type') ?? ''
          return await handleUploadMultipartCreate(store, body, contentType)
        }
        return errorResponse(400, `fake Drive: unsupported uploadType ${uploadType}`)
      }
      const uploadMatch = /^\/upload\/drive\/v3\/files\/([^/?]+)$/.exec(parsed.pathname)
      if (uploadMatch && method === 'PATCH') {
        return await handleUploadMediaOverwrite(store, uploadMatch[1], body)
      }
      if (parsed.pathname === '/drive/v3/files' && method === 'GET') {
        return await handleFilesList(store, parsed)
      }
      if (parsed.pathname === '/drive/v3/files' && method === 'POST') {
        return await handleFilesCreate(store, body)
      }
      const fileMatch = /^\/drive\/v3\/files\/([^/?]+)$/.exec(parsed.pathname)
      if (fileMatch && method === 'GET') {
        return handleFilesGet(store, fileMatch[1], parsed)
      }
      if (fileMatch && method === 'PATCH') {
        return await handleFilesPatch(store, fileMatch[1], body)
      }
    } catch (error) {
      // Acceptance criterion 8: real callers only ever check
      // `response.ok`, never the error body, so a message on the `Response`
      // alone would never actually reach anyone. `console.error` is what
      // makes an unhandled query loud rather than silently indistinguishable
      // from "no matching files".
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : 'fake Drive error', { url })
      return errorResponse(400, error instanceof Error ? error.message : 'fake Drive error')
    }

    // eslint-disable-next-line no-console
    console.error(`fake Drive: unhandled request ${method} ${url}`)
    return errorResponse(404, `fake Drive: unhandled request ${method} ${url}`)
  }
}
