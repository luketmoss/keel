// #703 AC11: a token caller runs every allow-listed action and is refused the
// key-only ones; access_token wins over key; every action in main.js is on
// exactly one list.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_KEY, SRC_DIR, loadApi, type FetchReply } from './apps-script-sandbox';

const CLIENT_ID = 'forage-1234.apps.googleusercontent.com';
const EMAIL = 'owner@example.com';
const TOKEN = 'ya29.a0Live/Token+Value=_with-chars';
const TOKEN_PROPS = { TOKEN_CLIENT_ID: CLIENT_ID, TOKEN_ALLOWED_EMAIL: EMAIL };

/** The actions a token caller is refused. Adding one here is a deliberate decision. */
const KEY_ONLY = ['getConfig', 'setConfig', 'ensureSchema'];

function info(overrides: Record<string, unknown> = {}): FetchReply {
  return {
    status: 200,
    body: JSON.stringify({
      azp: CLIENT_ID, aud: CLIENT_ID, email: EMAIL, email_verified: 'true', expires_in: '3599', ...overrides,
    }),
  };
}

function tokenApi(reply: (url: string) => FetchReply = () => info(), properties = TOKEN_PROPS) {
  return loadApi({ properties, tokeninfo: reply });
}

/** Every `case '<action>'` in main.js's dispatcher. */
function mainActions(): string[] {
  const src = readFileSync(path.join(SRC_DIR, 'main.js'), 'utf8');
  return [...src.matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1]);
}

describe('AC11: every action is on exactly one list', () => {
  it('each case in main.js is on the token list or the key-only list, never both', () => {
    const { sandbox } = loadApi();
    const token: string[] = [...sandbox.TOKEN_ACTIONS];
    const actions = mainActions();
    expect(actions.length).toBeGreaterThan(30);
    for (const action of actions) {
      const onToken = token.includes(action);
      const onKey = KEY_ONLY.includes(action);
      expect(onToken || onKey, `${action} is on neither list`).toBe(true);
      expect(onToken && onKey, `${action} is on both lists`).toBe(false);
    }
    for (const action of token) expect(actions, `${action} has no case`).toContain(action);
  });
});

describe('AC11: a token caller', () => {
  it('runs every allow-listed action: none is refused as not permitted', () => {
    const api = tokenApi();
    const { sandbox } = api;
    for (const action of sandbox.TOKEN_ACTIONS as string[]) {
      const res = api.post({ action, access_token: TOKEN, payload: {} });
      expect(res.code, action).not.toBe('not_permitted');
      expect(res.error ?? '', action).not.toMatch(/token|API key/i);
    }
  });

  it('reads and writes through the API, and its log entries are marked app', () => {
    const api = tokenApi();
    const food = api.post({ action: 'upsertFood', access_token: TOKEN, payload: { id: 'f', name: 'Oats', kcal_100g: 380, protein_100g: 13, carbs_100g: 68, fat_100g: 7 } });
    expect(food.success).toBe(true);
    const entry = api.post({ action: 'logFood', access_token: TOKEN, payload: { date: '2026-11-01', slot: 'Breakfast', food_id: 'f', qty: 40, unit: 'g' } });
    expect(entry.data.source).toBe('app');
    expect(api.post({ action: 'getFoods', access_token: TOKEN }).data).toHaveLength(1);
  });

  it('is refused getConfig, setConfig and ensureSchema, which never run', () => {
    const api = tokenApi();
    for (const action of KEY_ONLY) {
      const res = api.post({ action, access_token: TOKEN, payload: { key: 'x', value: 'y' } });
      expect(res, action).toEqual({
        success: false,
        error: 'This action is not permitted with an access token',
        code: 'not_permitted',
      });
    }
    expect(api.rows('Config')).toEqual([]);
  });

  it('with both access_token and key is a token caller', () => {
    const api = tokenApi();
    const res = api.post({ action: 'getConfig', access_token: TOKEN, key: API_KEY });
    expect(res.code).toBe('not_permitted');
    expect(api.fetches).toHaveLength(1);
  });

  it('with a bad token is refused even with a good key', () => {
    const api = tokenApi(() => ({ status: 400, body: '{"error":"invalid_token"}' }));
    const res = api.post({ action: 'getFoods', access_token: TOKEN, key: API_KEY });
    expect(res).toMatchObject({ success: false, code: 'token_invalid' });
  });

  it('is refused a token from another client or account', () => {
    expect(tokenApi(() => info({ aud: 'other' })).post({ action: 'getFoods', access_token: TOKEN }).code).toBe(
      'token_forbidden',
    );
    expect(tokenApi(() => info({ email: 'someone@else.com' })).post({ action: 'getFoods', access_token: TOKEN }).code).toBe(
      'token_forbidden',
    );
  });

  it('is refused every call while TOKEN_CLIENT_ID or TOKEN_ALLOWED_EMAIL is unset, without asking Google', () => {
    const api = tokenApi(() => info(), { TOKEN_CLIENT_ID: CLIENT_ID, TOKEN_ALLOWED_EMAIL: '' });
    expect(api.post({ action: 'getFoods', access_token: TOKEN }).code).toBe('token_forbidden');
    expect(api.fetches).toEqual([]);
  });

  it('never sees its token in a cache key or an error', () => {
    const api = tokenApi();
    const res = api.post({ action: 'getFood', access_token: TOKEN, id: TOKEN });
    expect(res.error).toBe('Food "[redacted]" not found');
    for (const k of api.cache.keys()) expect(k).not.toContain(TOKEN);
  });
});

describe('a key caller', () => {
  it('needs the key: missing or wrong is refused', () => {
    const api = loadApi();
    expect(api.post({ action: 'getFoods' }).error).toBe('Invalid or missing API key');
    expect(api.post({ action: 'getFoods', key: 'wrong' }).error).toBe('Invalid or missing API key');
  });

  it('runs the key-only actions', () => {
    const api = loadApi();
    expect(api.ok('setConfig', { payload: { key: 'a', value: 'b' } })).toMatchObject({ key: 'a', value: 'b' });
    expect(api.ok('getConfig')).toEqual({ a: 'b' });
  });
});
