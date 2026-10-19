import { isDemo } from './demo-data';
import type { WorkoutTrack } from './types';

// The one call the SPA makes to the Apps Script API (#410). Everything else
// still reads and writes Sheets directly.
//
// After a "Sync now" press appends its SyncRequests rows, `requestSync` asks
// the API to dispatch those rows at once instead of waiting up to 5 minutes for
// the poller. The rows are already recorded, so every failure here is silent:
// the poller takes them on its next tick. This never throws.
//
// Transport (#144's): a form-encoded POST, so the access token travels in the
// body and never in a URL. A form POST is a simple request (no preflight), and
// `fetch` follows Apps Script's 302 as a GET; both hops allow any origin.

/** The live `/exec` URL. Unset means no call is made, by design. */
const API_URL: string | undefined = import.meta.env.VITE_THRIVE_API_URL;

/** Well clear of the 2-6 s a warm call takes. */
export const THRIVE_API_TIMEOUT_MS = 20_000;

/**
 * What became of the call. `kind` names a failure without carrying the token
 * or the response body: `no_api_url`, `demo`, `timeout`, `network`,
 * `http_<status>`, `bad_response`, an API error `code` (`token_invalid`,
 * `token_forbidden`, `token_unavailable`, `read_only`, `bad_request`, or
 * `failed` when the envelope has none), or `not_found`.
 */
export type RequestSyncOutcome = { ok: true } | { ok: false; kind: string };

interface RequestSyncOptions {
  url?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Ask the API to dispatch the just-appended request rows now. The answer is
 * ignored beyond ok / not ok: the sheet is the truth, and the caller re-reads it.
 */
export async function requestSync(
  requestIds: readonly string[],
  token: string,
  options: RequestSyncOptions = {},
): Promise<RequestSyncOutcome> {
  const url = 'url' in options ? options.url : API_URL;
  if (isDemo()) return { ok: false, kind: 'demo' };
  if (!url) return { ok: false, kind: 'no_api_url' };

  const body = new URLSearchParams();
  body.set('action', 'requestSync');
  body.set('access_token', token);
  body.set('payload', JSON.stringify({ request_ids: requestIds }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? THRIVE_API_TIMEOUT_MS);
  try {
    const res = await (options.fetchImpl ?? fetch)(url, { method: 'POST', body, signal: controller.signal });
    if (!res.ok) return { ok: false, kind: `http_${res.status}` };
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return { ok: false, kind: 'bad_response' };
    }
    return outcomeOf(parsed);
  } catch {
    return { ok: false, kind: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

const CODE = /^[a-z_]{1,40}$/;

function outcomeOf(parsed: unknown): RequestSyncOutcome {
  if (!parsed || typeof parsed !== 'object') return { ok: false, kind: 'bad_response' };
  const env = parsed as { success?: unknown; code?: unknown; data?: { requests?: unknown } };
  if (env.success !== true) {
    // Only a plain code word passes through to the log, never the message.
    return { ok: false, kind: typeof env.code === 'string' && CODE.test(env.code) ? env.code : 'failed' };
  }
  const requests = env.data?.requests;
  if (!Array.isArray(requests)) return { ok: false, kind: 'bad_response' };
  if (requests.some((r) => r && (r as { status?: unknown }).status === 'not_found')) {
    return { ok: false, kind: 'not_found' };
  }
  return { ok: true };
}

// --- getWorkoutTrack (#432) ---------------------------------------------

/**
 * What became of a track read. `kind` names a failure without carrying the
 * token, the response body or anything from the track: the same words as
 * RequestSyncOutcome's, plus `no_track` for an activity the API answered has
 * none (a blank `track_ref`, or a file it would not vouch for).
 */
export type WorkoutTrackOutcome = { ok: true; track: WorkoutTrack } | { ok: false; kind: string };

/**
 * A workout's simplified GPS track, read through the API with the user's
 * Google token: the sync stores it in the bot's Drive, which the app cannot
 * read. Never throws, and never logs: a track shows where the user rides.
 * Demo mode and an unset API URL make no call.
 */
export async function getWorkoutTrack(
  workoutId: string,
  token: string,
  options: RequestSyncOptions = {},
): Promise<WorkoutTrackOutcome> {
  const url = 'url' in options ? options.url : API_URL;
  if (isDemo()) return { ok: false, kind: 'demo' };
  if (!url) return { ok: false, kind: 'no_api_url' };

  const body = new URLSearchParams();
  body.set('action', 'getWorkoutTrack');
  body.set('access_token', token);
  body.set('id', workoutId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? THRIVE_API_TIMEOUT_MS);
  try {
    const res = await (options.fetchImpl ?? fetch)(url, { method: 'POST', body, signal: controller.signal });
    if (!res.ok) return { ok: false, kind: `http_${res.status}` };
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      return { ok: false, kind: 'bad_response' };
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, kind: 'bad_response' };
    const env = parsed as { success?: unknown; code?: unknown; data?: { track?: unknown } };
    if (env.success !== true) {
      // The API refuses with fixed text and, for a token problem, a code word. Anything else is "no track".
      return { ok: false, kind: typeof env.code === 'string' && CODE.test(env.code) ? env.code : 'no_track' };
    }
    return isWorkoutTrack(env.data?.track) ? { ok: true, track: env.data.track } : { ok: false, kind: 'bad_response' };
  } catch {
    return { ok: false, kind: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** The shape the map needs, checked at the boundary: a LineString of [lon, lat] pairs, with `t` beside it. */
function isWorkoutTrack(value: unknown): value is WorkoutTrack {
  const f = value as Partial<WorkoutTrack> | null;
  if (!f || f.type !== 'Feature' || f.properties?.format !== 'thrive-track') return false;
  const coordinates = f.geometry?.coordinates;
  return (
    f.geometry?.type === 'LineString' &&
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    coordinates.every((c) => Array.isArray(c) && c.length === 2 && c.every((n) => Number.isFinite(n)))
  );
}
