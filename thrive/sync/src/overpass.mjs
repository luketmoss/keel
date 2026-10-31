// The OpenStreetMap lookup for trail tagging (#688): one Overpass request per
// activity, for the named trails in its track's bounding box.
//
// Overpass is a public service that rate-limits, times out and can answer with
// a partial result, so a failure must never look like "no trails". Every
// failure here is an OverpassError with a fixed reason, and nothing in a
// message, a log line or a note quotes the response: Overpass echoes the
// query, and with it the box, in its error bodies.
//
// Overpass sees only the padded box, never the track.

import { withRetry } from './retry.mjs';
import { TRAIL_HIGHWAYS } from './trail-match.mjs';

export const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const USER_AGENT = 'keel-thrive-sync (+https://github.com/luketmoss/keel)';

/** Client-side limit per attempt, and the waits before the 2nd and 3rd attempts. */
export const ATTEMPT_TIMEOUT_MS = 45_000;
export const RETRY_DELAYS_MS = [10_000, 30_000];
/** The server's own `[timeout:N]`, in seconds, in every query the sync sends. */
export const SERVER_TIMEOUT_S = 40;

/** The track's box is padded by this much on every side, in metres. */
export const BOX_PADDING_M = 50;
/** A padded box wider or taller than this is not looked up. */
export const MAX_BOX_KM = 50;

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const EARTH_RADIUS_METERS = 6_371_008.8;
const DEG = 180 / Math.PI;

/** `THRIVE_OVERPASS_URL`, else the public instance. */
export const overpassUrl = (env = {}) => env.THRIVE_OVERPASS_URL || DEFAULT_OVERPASS_URL;

/**
 * The lookup failed. `reason` is one of `no response`, `HTTP <status>`,
 * `partial result` or `unreadable response`; fixed text, never the body.
 */
export class OverpassError extends Error {
  constructor(reason, retryable) {
    super(`the OpenStreetMap lookup failed (${reason})`);
    this.name = 'OverpassError';
    this.reason = reason;
    this.retryable = retryable;
  }
}

/**
 * The track's bounding box padded by BOX_PADDING_M, as `{ s, w, n, e }` in
 * degrees, and its size in km.
 */
export function paddedBox(feature) {
  const coords = feature?.geometry?.coordinates ?? [];
  const lons = coords.map((c) => c[0]).filter(Number.isFinite);
  const lats = coords.map((c) => c[1]).filter(Number.isFinite);
  if (!lons.length || !lats.length) throw new Error('the track has no coordinates');
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const padLat = (BOX_PADDING_M / EARTH_RADIUS_METERS) * DEG;
  const padLon = padLat / Math.cos(midLat / DEG);
  const box = {
    s: Math.min(...lats) - padLat,
    w: Math.min(...lons) - padLon,
    n: Math.max(...lats) + padLat,
    e: Math.max(...lons) + padLon,
  };
  const kmPerDeg = (EARTH_RADIUS_METERS / DEG) / 1000;
  return {
    box,
    heightKm: (box.n - box.s) * kmPerDeg,
    widthKm: (box.e - box.w) * kmPerDeg * Math.cos(midLat / DEG),
  };
}

/** Whether a padded box is over MAX_BOX_KM on either side. */
export const tooLarge = ({ heightKm, widthKm }) => heightKm > MAX_BOX_KM || widthKm > MAX_BOX_KM;

/** The Overpass QL for a box: named trail ways only, with their geometry. No relation. */
export function trailQuery({ s, w, n, e }, { timeoutS = SERVER_TIMEOUT_S } = {}) {
  const f = (v) => v.toFixed(6);
  return (
    `[out:json][timeout:${timeoutS}];way["highway"~"^(${TRAIL_HIGHWAYS.join('|')})$"]["name"]` +
    `(${f(s)},${f(w)},${f(n)},${f(e)});out geom;`
  );
}

/**
 * @param {{ url?: string, fetchImpl?: typeof fetch, wait?: (ms: number) => Promise<void>,
 *   startTimer?: (ms: number, onTimeout: () => void) => () => void,
 *   attemptTimeoutMs?: number, serverTimeoutS?: number, attempts?: number,
 *   retryDelaysMs?: number[] }} [opts]
 *   `startTimer` arms the per-attempt timeout and returns its cancel; injected so
 *   a test can fire it without waiting 45 s. The last four default to the sync's
 *   own values (45 s, 40 s, 3 attempts, 10 s / 30 s); only the hand-run backfill
 *   (#697) passes others, because the sync's run budget cannot afford longer
 *   attempts. `attempts` defaults to one more than `retryDelaysMs` has entries,
 *   and a wait list shorter than `attempts - 1` repeats its last entry.
 */
export function createOverpass({
  url = DEFAULT_OVERPASS_URL,
  fetchImpl = fetch,
  wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  startTimer = (ms, onTimeout) => {
    const t = setTimeout(onTimeout, ms);
    return () => clearTimeout(t);
  },
  attemptTimeoutMs = ATTEMPT_TIMEOUT_MS,
  serverTimeoutS = SERVER_TIMEOUT_S,
  retryDelaysMs = RETRY_DELAYS_MS,
  attempts = retryDelaysMs.length + 1,
} = {}) {
  let requests = 0;
  const delays = Array.from({ length: Math.max(0, attempts - 1) }, (_, i) => (
    retryDelaysMs[Math.min(i, retryDelaysMs.length - 1)] ?? 0
  ));

  async function attempt(query) {
    requests += 1;
    const controller = new AbortController();
    const cancel = startTimer(attemptTimeoutMs, () => controller.abort());
    let status;
    let text;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal,
      });
      status = res.status;
      text = await res.text();
    } catch {
      throw new OverpassError('no response', true);
    } finally {
      cancel();
    }

    if (status !== 200) throw new OverpassError(`HTTP ${status}`, RETRYABLE_STATUSES.has(status));
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new OverpassError('unreadable response', false);
    }
    if (!body || typeof body !== 'object') throw new OverpassError('unreadable response', false);
    // Overpass's marker for a runtime error or a partial result: never trusted as "no trails".
    if (body.remark) throw new OverpassError('partial result', true);
    if (!Array.isArray(body.elements)) throw new OverpassError('unreadable response', false);
    return body.elements;
  }

  return {
    /** Requests sent so far, every attempt counted. */
    get requests() { return requests; },

    /**
     * The named trail ways in `box`, retried per the configured waits. Throws the
     * last OverpassError when every attempt fails.
     */
    lookup(box) {
      const query = trailQuery(box, { timeoutS: serverTimeoutS });
      return withRetry(() => attempt(query), {
        isRetryable: (err) => err instanceof OverpassError && err.retryable,
        delays,
        wait,
      });
    },
  };
}
