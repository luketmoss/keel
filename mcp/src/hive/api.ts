/**
 * Hive's Apps Script API, called with the Worker's MCP-only key.
 *
 * Apps Script payloads are untyped and the tools read only documented fields,
 * so results are `any` here rather than a model that would drift from Hive.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface HiveConfig {
  apiUrl: string
  apiKey: string
  defaultOwner: string
}

export interface ApiResult {
  success: boolean
  data?: any
  error?: string
}

/** Thrown for any failure reaching or reading Hive; the message is safe to show. */
export class HiveError extends Error {}

/** Strip the key and the URL from anything that might reach a response or a log. */
function scrub(text: string, cfg: HiveConfig): string {
  let out = text
  for (const secret of [cfg.apiKey, cfg.apiUrl]) if (secret) out = out.split(secret).join('[redacted]')
  return out
}

async function call(cfg: HiveConfig, url: string): Promise<ApiResult> {
  let res: Response
  try {
    res = await fetch(url, { redirect: 'follow' })
  } catch (err) {
    throw new HiveError(scrub(`Could not reach Hive: ${err instanceof Error ? err.message : String(err)}`, cfg))
  }
  const body = await res.text()
  if (!res.ok) throw new HiveError(scrub(`Hive returned HTTP ${res.status}: ${body.slice(0, 200)}`, cfg))
  try {
    return JSON.parse(body) as ApiResult
  } catch {
    throw new HiveError('Hive returned a response that was not JSON (the Apps Script may be misconfigured).')
  }
}

export function apiGet(cfg: HiveConfig, action: string, params: Record<string, string | undefined> = {}) {
  const url = new URL(cfg.apiUrl)
  url.searchParams.set('action', action)
  url.searchParams.set('key', cfg.apiKey)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v)
  }
  return call(cfg, url.toString())
}

export function apiWrite(cfg: HiveConfig, action: string, payload: unknown) {
  const url = new URL(cfg.apiUrl)
  // Apps Script redirects break POST for anonymous callers,
  // so write operations use GET with a URL-encoded payload param.
  const params = new URLSearchParams()
  params.set('action', action)
  params.set('key', cfg.apiKey)
  params.set('payload', JSON.stringify(payload))
  return call(cfg, `${url.origin}${url.pathname}?${params.toString()}`)
}

export async function resolveBoard(cfg: HiveConfig, boardName: string) {
  const result = await apiGet(cfg, 'getBoards')
  if (!result.success) throw new HiveError(result.error || 'Failed to fetch boards')
  const boards: any[] = result.data
  if (!boards.length) throw new HiveError('No boards found. Create a board in the Hive app first.')

  const lower = boardName.toLowerCase()
  const match = boards.find((b) => b.name.toLowerCase() === lower)
  if (match) return match

  // Fuzzy: check if board name is contained in any board name
  const partial = boards.find((b) => b.name.toLowerCase().includes(lower))
  if (partial) return partial

  const names = boards.map((b) => b.name).join(', ')
  throw new HiveError(`Board "${boardName}" not found. Available boards: ${names}`)
}

export function normalizeDate(value: string | undefined): string {
  if (!value) return ''
  // Already YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  // Try parsing whatever Claude sent
  const d = new Date(value)
  if (isNaN(d.getTime())) return '' // unparseable: drop it
  return d.toISOString().slice(0, 10)
}

export async function resolvePosition(
  cfg: HiveConfig,
  boardId: string,
  status: string,
  position: 'top' | 'bottom' | number | undefined,
): Promise<number | undefined> {
  if (position === undefined) return undefined

  const result = await apiGet(cfg, 'getItems', { board_id: boardId, status })
  const items: any[] = result.success ? result.data : []
  items.sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity))

  if (position === 'top') return items.length ? (items[0].sort_order ?? 1) - 1 : 1
  if (position === 'bottom') return items.length ? (items[items.length - 1].sort_order ?? 1) + 1 : 1

  // Numeric index (1-based): insert at that position
  const idx = Math.max(1, Math.min(Number(position), items.length + 1))
  if (idx === 1) return items.length ? (items[0].sort_order ?? 1) - 1 : 1
  if (idx > items.length) return (items[items.length - 1].sort_order ?? 1) + 1
  // Place between idx-1 and idx
  const before = items[idx - 2].sort_order ?? idx - 1
  const after = items[idx - 1].sort_order ?? idx
  return (before + after) / 2
}
