/**
 * Forage's Apps Script API (#703), called with the Worker's key.
 *
 * Every request is a form-encoded POST, so the key and the payload stay out of
 * the URL: Apps Script fills `e.parameter` from the body exactly as from a
 * query string, and `fetch` follows its 302 to the answer. Writes are sent
 * once and never retried.
 *
 * Apps Script payloads are untyped and the tools read only documented fields,
 * so results are `any` here rather than a model that would drift from Forage.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { currentCallId, markWrote, reserveWrite } from '../call-context.js'

export interface ForageConfig {
  apiUrl: string
  apiKey: string
  /** The hourly write counter (#410), on the write endpoint only. */
  budget?: { reserve(rows: number): Promise<{ allowed: boolean }> }
  /** Rows one call may write before it is previewed instead (#410's `MAX_ROWS_PER_CALL`). */
  maxRowsPerCall?: number
}

export interface ApiResult {
  success: boolean
  data?: any
  error?: string
  code?: string
  duplicate_of?: { id: string; name: string } | null
}

/**
 * Thrown for any failure reaching or reading Forage; the message is safe to
 * show. `reason` is fixed text naming what failed, for `forage_status`.
 */
export class ForageError extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message)
  }
}

/** Strip the key and the URL, as sent and URL-encoded, from anything that might reach a response or a log. */
function scrub(text: string, cfg: ForageConfig): string {
  let out = text
  for (const secret of [cfg.apiKey, cfg.apiUrl]) {
    if (!secret) continue
    for (const form of [secret, encodeURIComponent(secret)]) out = out.split(form).join('[redacted]')
  }
  return out
}

async function post(cfg: ForageConfig, fields: Record<string, string>): Promise<ApiResult> {
  let res: Response
  try {
    res = await fetch(cfg.apiUrl, { method: 'POST', body: new URLSearchParams({ ...fields, key: cfg.apiKey }) })
  } catch (err) {
    throw new ForageError(
      scrub(`Could not reach Forage: ${err instanceof Error ? err.message : String(err)}`, cfg),
      'unreachable',
    )
  }
  const body = await res.text()
  if (!res.ok) {
    throw new ForageError(scrub(`Forage returned HTTP ${res.status}: ${body.slice(0, 200)}`, cfg), `HTTP ${res.status}`)
  }
  try {
    const result = JSON.parse(body) as ApiResult
    if (result.error) result.error = scrub(result.error, cfg)
    return result
  } catch {
    throw new ForageError(
      'Forage returned a response that was not JSON (the Apps Script may be misconfigured).',
      'the answer was not JSON',
    )
  }
}

/** A read: filters as parameters, no payload, no call id. */
export function apiRead(cfg: ForageConfig, action: string, params: Record<string, string | number | undefined> = {}) {
  const fields: Record<string, string> = { action }
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') fields[k] = String(v)
  return post(cfg, fields)
}

/**
 * A write. Admits the tool call to the hourly budget at its first request
 * (`rows` is what it will write, unless `declareRows` already said), and
 * carries the call's id so the API logs every row under it for undo. A
 * payload that names a `call_id` of its own keeps it: `undoCall`'s is the call
 * to revert, and the API logs the revert under an id it makes.
 */
export async function apiWrite(cfg: ForageConfig, action: string, payload: object, rows = 1) {
  await reserveWrite(cfg.budget, 'Forage', rows)
  const callId = currentCallId()
  const own = callId && !('call_id' in payload)
  const result = await post(cfg, {
    action,
    payload: JSON.stringify(own ? { ...payload, call_id: callId } : payload),
  })
  // Only a write Forage accepted counts: a refusal changed nothing.
  if (result.success) markWrote()
  return result
}

/**
 * A request that takes a payload but changes nothing: an import's dry run, an
 * undo's preview. Not a write to count, and it carries no call id.
 */
export function apiDry(cfg: ForageConfig, action: string, payload: object) {
  return post(cfg, { action, payload: JSON.stringify(payload) })
}

/** Whether a refusal is the API saying it has no such action: an Apps Script deployed before the Worker. */
export function isUnknownAction(result: ApiResult): boolean {
  return !result.success && /^Unknown action/.test(result.error ?? '')
}
