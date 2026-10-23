// #519 - the Drinks/Settings row mapping (mirrors apps-script/src/types.js) and
// the typed client for the six drinks actions.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

let demo = false;
vi.mock('./demo-data', async () => {
  const actual = await vi.importActual<typeof import('./demo-data')>('./demo-data');
  return { ...actual, isDemo: () => demo };
});

import * as thriveApi from './thrive-api';
import {
  DRINK_FIELDS,
  SETTING_FIELDS,
  DRINK_KINDS,
  DRINK_SOURCES,
  WATER_GOAL_KEY,
  WATER_GOAL_DEFAULT_ML,
  WATER_GOAL_MIN_ML,
  WATER_GOAL_MAX_ML,
  WATER_AMOUNT_MAX_ML,
  DRINKS_MAX_RANGE_DAYS,
  rowToDrink,
  rowToSetting,
  logDrink,
  getDrinks,
  getDrinkTotals,
  updateDrinkTime,
  deleteDrink,
  updateSetting,
} from './drinks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const typesJs = readFileSync(resolve(__dirname, '../../../apps-script/src/types.js'), 'utf-8');

const fieldsOf = (name: string): string[] => {
  const block = typesJs.match(new RegExp(`var ${name} = \\[([\\s\\S]*?)\\];`))?.[1];
  expect(block, name).toBeTruthy();
  return Array.from(block!.matchAll(/'([a-z_]+)'/g), (m) => m[1]);
};

const numberOf = (name: string): number => Number(typesJs.match(new RegExp(`var ${name} = (\\d+);`))?.[1]);

describe('the field lists mirror types.js', () => {
  it('DRINK_FIELDS matches name for name and in order (A:I)', () => {
    expect([...DRINK_FIELDS]).toEqual(fieldsOf('DRINK_FIELDS'));
    expect(DRINK_FIELDS).toHaveLength(9);
    expect(numberOf('DRINK_COLUMN_COUNT')).toBe(9);
  });

  it('SETTING_FIELDS matches name for name and in order (A:C)', () => {
    expect([...SETTING_FIELDS]).toEqual(fieldsOf('SETTING_FIELDS'));
    expect(SETTING_FIELDS).toHaveLength(3);
    expect(numberOf('SETTING_COLUMN_COUNT')).toBe(3);
  });

  it('the vocabularies and limits agree', () => {
    expect([...DRINK_KINDS]).toEqual(['water', 'alcohol', 'coffee']);
    expect(typesJs).toMatch(/var DRINK_KINDS = \['water', 'alcohol', 'coffee'\];/);
    expect([...DRINK_SOURCES]).toEqual(['widget', 'app', 'mcp']);
    expect(typesJs).toMatch(/var DRINK_SOURCES = \['widget', 'app', 'mcp'\];/);
    expect(typesJs).toContain(`var SETTING_WATER_GOAL = '${WATER_GOAL_KEY}';`);
    expect(numberOf('WATER_GOAL_DEFAULT_ML')).toBe(WATER_GOAL_DEFAULT_ML);
    expect(numberOf('WATER_GOAL_MIN_ML')).toBe(WATER_GOAL_MIN_ML);
    expect(numberOf('WATER_GOAL_MAX_ML')).toBe(WATER_GOAL_MAX_ML);
    expect(numberOf('WATER_AMOUNT_MAX_ML')).toBe(WATER_AMOUNT_MAX_ML);
    expect(numberOf('DRINKS_MAX_RANGE_DAYS')).toBe(DRINKS_MAX_RANGE_DAYS);
    expect(WATER_GOAL_DEFAULT_ML).toBe(1893);
  });
});

const ROW = ['d-1', 'water', '250', '2026-10-20', '07:05:00', '2026-10-20T13:05:00.000Z', 'widget', 'c', 'u'];
const DRINK = {
  id: 'd-1',
  kind: 'water',
  amount: 250,
  date: '2026-10-20',
  time: '07:05:00',
  logged_at_utc: '2026-10-20T13:05:00.000Z',
  source: 'widget',
  created: 'c',
  updated: 'u',
};

describe('rowToDrink / rowToSetting', () => {
  it('maps a sheet row, parsing amount to a number', () => {
    expect(rowToDrink(ROW)).toEqual(DRINK);
  });

  it("maps the API's string-valued object the same way", () => {
    const obj = Object.fromEntries(DRINK_FIELDS.map((f, i) => [f, ROW[i]]));
    expect(rowToDrink(obj)).toEqual(DRINK);
  });

  it('treats a short row\'s missing cells as blank, never "undefined"', () => {
    expect(rowToDrink(ROW.slice(0, 7))).toMatchObject({ created: '', updated: '' });
  });

  it('returns null for a row that is not a drink', () => {
    expect(rowToDrink([])).toBeNull();
    expect(rowToDrink(['', ...ROW.slice(1)])).toBeNull();
    expect(rowToDrink(['d', 'juice', ...ROW.slice(2)])).toBeNull();
    expect(rowToDrink([...ROW.slice(0, 2), '0', ...ROW.slice(3)])).toBeNull();
    expect(rowToDrink([...ROW.slice(0, 2), '1.5', ...ROW.slice(3)])).toBeNull();
    expect(rowToDrink([...ROW.slice(0, 6), 'chat', 'c', 'u'])).toBeNull();
  });

  it('keeps a drink the MCP logged (#595), so the Day view and Trends show it', () => {
    expect(rowToDrink([...ROW.slice(0, 6), 'mcp', 'c', 'u'])).toEqual({ ...DRINK, source: 'mcp' });
  });

  it('maps a settings row', () => {
    expect(rowToSetting(['water_goal_ml', '2500', 'u'])).toEqual({ key: 'water_goal_ml', value: '2500', updated: 'u' });
    expect(rowToSetting(['water_goal_ml'])).toEqual({ key: 'water_goal_ml', value: '', updated: '' });
  });
});

const URL_ = 'https://script.google.com/macros/s/EXAMPLE/exec';
const TOKEN = 'ya29.SPA/token+value=';

function reply(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
}

beforeEach(() => {
  demo = false;
});

// callAction reads VITE_THRIVE_API_URL at module load, so the transport tests
// drive it through its own `url` and `fetchImpl` options.
describe('callAction', () => {
  it('POSTs action, access_token, fields and payload form-encoded, nothing in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ success: true, data: { a: 1 } }));
    const out = await thriveApi.callAction(
      'getDrinks',
      TOKEN,
      { fields: { from: '2026-10-01', to: '2026-10-31' }, payload: { x: 1 } },
      { url: URL_, fetchImpl },
    );
    expect(out).toEqual({ ok: true, data: { a: 1 } });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(URL_);
    expect(init.method).toBe('POST');
    expect(init.headers).toBeUndefined();
    const body = init.body as URLSearchParams;
    expect([...body.keys()]).toEqual(['action', 'access_token', 'from', 'to', 'payload']);
    expect(body.get('action')).toBe('getDrinks');
    expect(body.get('access_token')).toBe(TOKEN);
    expect(JSON.parse(body.get('payload')!)).toEqual({ x: 1 });
  });

  it('makes no call in demo mode or with no URL', async () => {
    const fetchImpl = vi.fn();
    expect(await thriveApi.callAction('getDrinkTotals', TOKEN, {}, { url: '', fetchImpl })).toEqual({
      ok: false,
      kind: 'no_api_url',
    });
    demo = true;
    expect(await thriveApi.callAction('getDrinkTotals', TOKEN, {}, { url: URL_, fetchImpl })).toEqual({
      ok: false,
      kind: 'demo',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('names a refusal by its code and fixed message, and never throws', async () => {
    const refused = reply({ success: false, error: 'amount for water must be a whole number of ml, 1 to 2000' });
    expect(
      await thriveApi.callAction('logDrink', TOKEN, {}, { url: URL_, fetchImpl: vi.fn().mockResolvedValue(refused) }),
    ).toEqual({
      ok: false,
      kind: 'failed',
      message: 'amount for water must be a whole number of ml, 1 to 2000',
    });
    const coded = reply({
      success: false,
      error: 'Access token is invalid or expired. Sign in again.',
      code: 'token_invalid',
    });
    expect(
      await thriveApi.callAction('logDrink', TOKEN, {}, { url: URL_, fetchImpl: vi.fn().mockResolvedValue(coded) }),
    ).toMatchObject({
      ok: false,
      kind: 'token_invalid',
    });
    expect(
      await thriveApi.callAction(
        'x',
        TOKEN,
        {},
        { url: URL_, fetchImpl: vi.fn().mockResolvedValue(reply('nope', 502)) },
      ),
    ).toEqual({
      ok: false,
      kind: 'http_502',
    });
    expect(
      await thriveApi.callAction('x', TOKEN, {}, { url: URL_, fetchImpl: vi.fn().mockResolvedValue(reply('<html>')) }),
    ).toEqual({
      ok: false,
      kind: 'bad_response',
    });
    expect(
      await thriveApi.callAction(
        'x',
        TOKEN,
        {},
        { url: URL_, fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) },
      ),
    ).toEqual({
      ok: false,
      kind: 'network',
    });
  });

  it('does not pass on a long message, which is not fixed text', async () => {
    const long = reply({ success: false, error: 'x'.repeat(500) });
    expect(
      await thriveApi.callAction('x', TOKEN, {}, { url: URL_, fetchImpl: vi.fn().mockResolvedValue(long) }),
    ).toEqual({
      ok: false,
      kind: 'failed',
    });
  });
});

describe('the typed client', () => {
  // The client functions use the build's API URL; without one they make no call.
  it('makes no call without VITE_THRIVE_API_URL, and says so', async () => {
    if (import.meta.env.VITE_THRIVE_API_URL) return;
    expect(await getDrinkTotals(TOKEN)).toEqual({ ok: false, kind: 'no_api_url' });
    expect(
      await logDrink(
        { id: 'a', kind: 'water', amount: 250, logged_at_utc: '2026-10-20T13:05:00Z', source: 'app' },
        TOKEN,
      ),
    ).toEqual({ ok: false, kind: 'no_api_url' });
  });

  describe('with a URL', () => {
    // thrive-api.ts captures the URL at import; re-import it fresh with one set.
    async function client(response: Response) {
      vi.resetModules();
      vi.stubEnv('VITE_THRIVE_API_URL', URL_);
      const fetchImpl = vi.fn().mockResolvedValue(response);
      vi.stubGlobal('fetch', fetchImpl);
      const mod = await import('./drinks');
      return { mod, fetchImpl };
    }
    const sent = (fetchImpl: ReturnType<typeof vi.fn>) => {
      const [, init] = fetchImpl.mock.calls[0];
      return init.body as URLSearchParams;
    };
    const after = () => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    };

    it('logDrink sends the six fields as the payload and returns the drink', async () => {
      const { mod, fetchImpl } = await client(
        reply({ success: true, data: Object.fromEntries(DRINK_FIELDS.map((f, i) => [f, ROW[i]])) }),
      );
      const input = {
        id: 'd-1',
        kind: 'water' as const,
        amount: 250,
        logged_at_utc: '2026-10-20T13:05:00Z',
        source: 'widget' as const,
      };
      const out = await mod.logDrink(input, TOKEN);
      expect(out).toEqual({ ok: true, data: DRINK });
      expect(sent(fetchImpl).get('action')).toBe('logDrink');
      expect(JSON.parse(sent(fetchImpl).get('payload')!)).toEqual(input);
      after();
    });

    it('getDrinks sends from/to as fields, or nothing for today, and maps every row', async () => {
      const data = { drinks: [Object.fromEntries(DRINK_FIELDS.map((f, i) => [f, ROW[i]]))], water_goal_ml: 1893 };
      const a = await client(reply({ success: true, data }));
      expect(await a.mod.getDrinks({ from: '2026-10-01', to: '2026-10-31' }, TOKEN)).toEqual({
        ok: true,
        data: { drinks: [DRINK], water_goal_ml: 1893 },
      });
      const body = sent(a.fetchImpl);
      expect([body.get('from'), body.get('to'), body.has('payload')]).toEqual(['2026-10-01', '2026-10-31', false]);
      after();
      const b = await client(reply({ success: true, data }));
      await b.mod.getDrinks(undefined, TOKEN);
      expect(sent(b.fetchImpl).has('from')).toBe(false);
      after();
    });

    it('getDrinkTotals returns the five numbers', async () => {
      const totals = { date: '2026-10-20', water_ml: 750, alcohol_drinks: 1, coffee_cups: 2, water_goal_ml: 1893 };
      const { mod, fetchImpl } = await client(reply({ success: true, data: totals }));
      expect(await mod.getDrinkTotals(TOKEN)).toEqual({ ok: true, data: totals });
      expect(sent(fetchImpl).get('action')).toBe('getDrinkTotals');
      after();
    });

    it('updateDrinkTime, deleteDrink and updateSetting send what the API expects', async () => {
      const drink = Object.fromEntries(DRINK_FIELDS.map((f, i) => [f, ROW[i]]));
      const t = await client(reply({ success: true, data: drink }));
      expect((await t.mod.updateDrinkTime('d-1', '08:00:00', TOKEN)).ok).toBe(true);
      expect(JSON.parse(sent(t.fetchImpl).get('payload')!)).toEqual({ id: 'd-1', time: '08:00:00' });
      after();
      const d = await client(reply({ success: true, data: drink }));
      expect((await d.mod.deleteDrink('d-1', TOKEN)).ok).toBe(true);
      expect(sent(d.fetchImpl).get('action')).toBe('deleteDrink');
      expect(JSON.parse(sent(d.fetchImpl).get('payload')!)).toEqual({ id: 'd-1' });
      after();
      const s = await client(reply({ success: true, data: { key: 'water_goal_ml', value: '2500', updated: 'u' } }));
      expect(await s.mod.updateSetting('water_goal_ml', 2500, TOKEN)).toEqual({
        ok: true,
        data: { key: 'water_goal_ml', value: '2500', updated: 'u' },
      });
      expect(JSON.parse(sent(s.fetchImpl).get('payload')!)).toEqual({ key: 'water_goal_ml', value: 2500 });
      after();
    });

    it('a refusal comes back as an outcome, and a malformed success as bad_response', async () => {
      const refused = await client(reply({ success: false, error: 'No drink with that id' }));
      expect(await refused.mod.deleteDrink('nope', TOKEN)).toEqual({
        ok: false,
        kind: 'failed',
        message: 'No drink with that id',
      });
      after();
      const odd = await client(reply({ success: true, data: { date: '2026-10-20', water_ml: '750' } }));
      expect(await odd.mod.getDrinkTotals(TOKEN)).toEqual({ ok: false, kind: 'bad_response' });
      after();
    });
  });
});
