// #714 - the Day screen's one read of Forage: what it sends, to where, and what it makes of the reply.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const URL_ = 'https://script.google.com/macros/s/forage/exec';

const day = {
  date: '2026-11-01',
  entries: 4,
  unknown_entries: 0,
  kcal: 1240.4,
  protein_g: 62,
  carbs_g: 140.2,
  fat_g: 48.1,
  partial: false,
};

function reply(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Response);
}

beforeEach(() => vi.stubEnv('VITE_FORAGE_API_URL', URL_));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('getFoodLogTotals', () => {
  it('posts the action and the window to Forage, with the token in the body and never the URL', async () => {
    const fetchMock = reply({ success: true, data: { from: '2026-10-26', to: '2026-11-01', days: [day] } });
    vi.stubGlobal('fetch', fetchMock);
    const { getFoodLogTotals } = await import('./forage-food');
    const res = await getFoodLogTotals('secret-token', '2026-10-26', '2026-11-01');
    expect(res).toEqual({ ok: true, days: [day] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_);
    expect(url).not.toContain('secret-token');
    const body = init.body as URLSearchParams;
    expect(body.get('action')).toBe('getFoodLogTotals');
    expect(body.get('access_token')).toBe('secret-token');
    expect(body.get('from')).toBe('2026-10-26');
    expect(body.get('to')).toBe('2026-11-01');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a null figure null and a reply with no days as none', async () => {
    vi.stubGlobal(
      'fetch',
      reply({
        success: true,
        data: { days: [{ ...day, kcal: null, protein_g: null, carbs_g: null, fat_g: null, partial: true }] },
      }),
    );
    const { getFoodLogTotals } = await import('./forage-food');
    const res = await getFoodLogTotals('t', 'a', 'b');
    expect(res.ok && res.days[0].kcal).toBeNull();
    vi.stubGlobal('fetch', reply({ success: true, data: { days: [] } }));
    expect(await getFoodLogTotals('t', 'a', 'b')).toEqual({ ok: true, days: [] });
  });

  it('answers a refusal by its code and never the token', async () => {
    vi.stubGlobal('fetch', reply({ success: false, code: 'token_forbidden', error: 'Access token is not permitted' }));
    const { getFoodLogTotals } = await import('./forage-food');
    const res = await getFoodLogTotals('secret-token', 'a', 'b');
    expect(res).toMatchObject({ ok: false, kind: 'token_forbidden' });
    expect(JSON.stringify(res)).not.toContain('secret-token');
  });

  it('fails on a network error, an HTTP error and a reply that is not the shape', async () => {
    const { getFoodLogTotals } = await import('./forage-food');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('offline'))),
    );
    expect(await getFoodLogTotals('t', 'a', 'b')).toEqual({ ok: false, kind: 'network' });
    vi.stubGlobal('fetch', reply({}, false));
    expect(await getFoodLogTotals('t', 'a', 'b')).toEqual({ ok: false, kind: 'http_500' });
    vi.stubGlobal('fetch', reply({ success: true, data: { days: [{ ...day, kcal: '1240' }] } }));
    expect(await getFoodLogTotals('t', 'a', 'b')).toEqual({ ok: false, kind: 'bad_response' });
    vi.stubGlobal('fetch', reply({ success: true, data: {} }));
    expect(await getFoodLogTotals('t', 'a', 'b')).toEqual({ ok: false, kind: 'bad_response' });
  });

  it('makes no request without VITE_FORAGE_API_URL', async () => {
    vi.stubEnv('VITE_FORAGE_API_URL', '');
    const fetchMock = reply({ success: true, data: { days: [] } });
    vi.stubGlobal('fetch', fetchMock);
    const { getFoodLogTotals } = await import('./forage-food');
    expect(await getFoodLogTotals('t', 'a', 'b')).toEqual({ ok: false, kind: 'no_api_url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
