// #432: the SPA reads a workout's track through the API with its Google token.

import { describe, it, expect, vi } from 'vitest';

vi.mock('./demo-data', () => ({ isDemo: () => false }));

const { getWorkoutTrack } = await import('./thrive-api');

const URL_ = 'https://script.google.com/macros/s/x/exec';
const TRACK = {
  type: 'Feature',
  bbox: [-100.01, 45, -100, 45.002],
  properties: {
    format: 'thrive-track', version: 1, source: 'coros', activity_id: '1', start_utc: '2026-06-01T14:00:00.000Z',
    t: [0, 60], ele: [800, null], simplify: { algorithm: 'rdp', tolerance_m: 5 }, points_in: 100,
  },
  geometry: { type: 'LineString', coordinates: [[-100, 45], [-100.01, 45.002]] },
};

const answer = (body: unknown, init: ResponseInit = { status: 200 }) =>
  vi.fn(async () => new Response(JSON.stringify(body), init)) as unknown as typeof fetch;

describe('getWorkoutTrack', () => {
  it('POSTs the token in the body, never the URL, and returns the track', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      new Response(JSON.stringify({ success: true, data: { workout_id: 'w1', track: TRACK } }), { status: 200 }),
    );
    const out = await getWorkoutTrack('w1', 'tok-secret', { url: URL_, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ ok: true, track: TRACK });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(URL_);
    expect(String(url)).not.toContain('tok-secret');
    expect(init?.method).toBe('POST');
    const form = init?.body as URLSearchParams;
    expect(form.get('action')).toBe('getWorkoutTrack');
    expect(form.get('access_token')).toBe('tok-secret');
    expect(form.get('id')).toBe('w1');
  });

  it('makes no call without an API URL', async () => {
    const fetchImpl = vi.fn();
    const out = await getWorkoutTrack('w1', 't', { url: undefined, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ ok: false, kind: 'no_api_url' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('says no_track for a refusal, and passes a token code word through', async () => {
    const none = await getWorkoutTrack('w1', 't', { url: URL_, fetchImpl: answer({ success: false, error: 'has no GPS track' }) });
    expect(none).toEqual({ ok: false, kind: 'no_track' });
    const bad = await getWorkoutTrack('w1', 't', { url: URL_, fetchImpl: answer({ success: false, code: 'token_invalid', error: 'x' }) });
    expect(bad).toEqual({ ok: false, kind: 'token_invalid' });
  });

  it('never carries the response body or the token in a failure', async () => {
    const out = await getWorkoutTrack('w1', 'tok-secret', {
      url: URL_, fetchImpl: answer({ success: false, error: 'tok-secret leaked here' }),
    });
    expect(JSON.stringify(out)).not.toContain('leaked');
    expect(JSON.stringify(out)).not.toContain('tok-secret');
  });

  it('refuses a file that is not a track Feature, rather than handing a map garbage', async () => {
    for (const track of [
      { ...TRACK, type: 'FeatureCollection' },
      { ...TRACK, properties: { ...TRACK.properties, format: 'other' } },
      { ...TRACK, geometry: { type: 'Point', coordinates: [0, 0] } },
      { ...TRACK, geometry: { type: 'LineString', coordinates: [[1, 2]] } },
      { ...TRACK, geometry: { type: 'LineString', coordinates: [[1, 2], ['a', 'b']] } },
    ]) {
      const out = await getWorkoutTrack('w1', 't', { url: URL_, fetchImpl: answer({ success: true, data: { track } }) });
      expect(out).toEqual({ ok: false, kind: 'bad_response' });
    }
  });

  it('classifies http, network and timeout failures without throwing', async () => {
    expect(await getWorkoutTrack('w1', 't', { url: URL_, fetchImpl: answer({}, { status: 500 }) })).toEqual({ ok: false, kind: 'http_500' });
    const down = vi.fn(async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    expect(await getWorkoutTrack('w1', 't', { url: URL_, fetchImpl: down })).toEqual({ ok: false, kind: 'network' });
    const hang = vi.fn((_u: unknown, init?: RequestInit) =>
      new Promise((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    ) as unknown as typeof fetch;
    expect(await getWorkoutTrack('w1', 't', { url: URL_, fetchImpl: hang, timeoutMs: 5 })).toEqual({ ok: false, kind: 'timeout' });
  });
});
