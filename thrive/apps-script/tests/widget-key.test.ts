// #519 - WIDGET_API_KEY: a third kind of key caller that may run logDrink and
// getDrinkTotals and nothing else. Also who may run the six drinks actions.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  loadApi, callEntry, workoutRow, exerciseRow, templateRow, setRow, type FetchReply,
} from './apps-script-sandbox';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

const NOW = new Date('2026-10-20T13:30:00.000Z');
const WIDGET_KEY = 'widget-phone-key';
const MCP_KEY = 'mcp-worker-key';
const CLIENT_ID = 'thrive-1234.apps.googleusercontent.com';
const EMAIL = 'owner@example.com';
const TOKEN = 'ya29.a0Live/Token+Value=_with-chars';
const REFUSED = '{"success":false,"error":"Invalid or missing API key"}';

const tokeninfo = (): FetchReply => ({
  status: 200,
  body: JSON.stringify({
    azp: CLIENT_ID, aud: CLIENT_ID, expires_in: '3599', email: EMAIL, email_verified: 'true',
  }),
});

function load(properties: Record<string, string> = { WIDGET_API_KEY: WIDGET_KEY, MCP_API_KEY: MCP_KEY }) {
  return loadApi(
    {
      workouts: [workoutRow()], exercises: [exerciseRow()], templates: [templateRow()],
      sets: [setRow()], dailySummary: [], dailyHealth: [], syncLog: [], bodyMeasurements: [],
      journal: [], changeLog: [], drinks: [], settings: [],
    },
    { now: NOW, tokeninfo, properties: { TOKEN_CLIENT_ID: CLIENT_ID, TOKEN_ALLOWED_EMAIL: EMAIL, ...properties } },
  );
}

const logPayload = (id: string) => JSON.stringify({
  id, kind: 'water', amount: 250, logged_at_utc: '2026-10-20T13:05:00Z', source: 'widget',
});

describe('the widget key runs logDrink and getDrinkTotals', () => {
  for (const entry of ['doGet', 'doPost'] as const) {
    it(`logs a drink and reads today's totals through ${entry}`, () => {
      const api = load();
      const logged = callEntry<any>(api.sandbox, entry, { action: 'logDrink', key: WIDGET_KEY, payload: logPayload('w1') });
      expect(logged.res.success, logged.text).toBe(true);
      expect(logged.res.data).toMatchObject({ id: 'w1', date: '2026-10-20', time: '07:05:00', source: 'widget' });
      const totals = callEntry<any>(api.sandbox, entry, { action: 'getDrinkTotals', key: WIDGET_KEY });
      expect(totals.res.data).toEqual({
        date: '2026-10-20', water_ml: 250, alcohol_drinks: 0, coffee_cups: 0, unwind_mg: 0, water_goal_ml: 1893,
      });
    });
  }

  it('is a retry-safe logger: the same id twice leaves one row', () => {
    const api = load();
    for (let i = 0; i < 2; i++) {
      callEntry(api.sandbox, 'doGet', { action: 'logDrink', key: WIDGET_KEY, payload: logPayload('w1') });
    }
    expect(api.drinkRows).toHaveLength(1);
  });
});

describe('the widget key is refused on everything else', () => {
  const refused = [
    'getDrinks', 'getWorkouts', 'getWorkout', 'getJournal', 'getSyncLog', 'getDailySummary',
    'deleteDrink', 'updateDrinkTime', 'updateDrinkAmount', 'updateSetting', 'createWorkout', 'deleteWorkout',
    'upsertJournal', 'requestSync', 'undoCall', 'noSuchAction',
  ];
  for (const action of refused) {
    it(`refuses ${action}, and nothing runs`, () => {
      const api = load();
      const before = JSON.stringify([api.rows, api.drinkRows, api.settingRows, api.journalRows]);
      const { res, text } = callEntry<any>(api.sandbox, 'doGet', {
        action, key: WIDGET_KEY, id: 'w_001', from: '2026-10-01', to: '2026-10-31',
        payload: JSON.stringify({ id: 'x', key: 'water_goal_ml', value: 2000, time: '01:00:00' }),
      });
      expect(res).toEqual({
        success: false, error: 'Widget caller: this action is not permitted', code: 'widget_forbidden',
      });
      expect(text).not.toContain(action === 'noSuchAction' ? 'noSuchAction' : '\u0000');
      expect(JSON.stringify([api.rows, api.drinkRows, api.settingRows, api.journalRows])).toBe(before);
      expect(api.lock.acquired).toBe(0);
    });
  }

  it('cannot edit or delete a drink it logged', () => {
    const api = load();
    callEntry(api.sandbox, 'doGet', { action: 'logDrink', key: WIDGET_KEY, payload: logPayload('w1') });
    for (const action of ['updateDrinkTime', 'updateDrinkAmount', 'deleteDrink']) {
      const { res } = callEntry<any>(api.sandbox, 'doGet', {
        action, key: WIDGET_KEY, payload: JSON.stringify({ id: 'w1', time: '01:00:00' }),
      });
      expect(res.code).toBe('widget_forbidden');
    }
    expect(api.drinkRows).toHaveLength(1);
    expect(api.drinkRows![0][4]).toBe('07:05:00');
  });
});

describe('an unset or blank widget key is never a door', () => {
  for (const [name, properties] of [['unset', {}], ['blank', { WIDGET_API_KEY: '' }]] as const) {
    it(`WIDGET_API_KEY ${name} matches nothing`, () => {
      for (const key of [undefined, '', WIDGET_KEY]) {
        const params: Record<string, string> = { action: 'getDrinkTotals' };
        if (key !== undefined) params.key = key;
        expect(callEntry(load(properties).sandbox, 'doGet', params).text).toBe(REFUSED);
      }
    });
  }

  it('is not API_KEY: a key matching neither is refused', () => {
    expect(callEntry(load().sandbox, 'doGet', { action: 'getDrinkTotals', key: 'other' }).text).toBe(REFUSED);
  });

  it('leaves API_KEY at full access when set equal to the widget key', () => {
    const api = load({ WIDGET_API_KEY: 'test-key' });
    expect(callEntry<any>(api.sandbox, 'doGet', { action: 'getWorkouts', key: 'test-key' }).res.success).toBe(true);
  });

  it('a token present makes a token caller whatever key is sent with it', () => {
    const api = load();
    const { res } = callEntry<any>(api.sandbox, 'doPost', {
      action: 'getSettings', key: WIDGET_KEY, access_token: TOKEN,
    });
    expect(res.success).toBe(true);
    const bad = callEntry<any>(api.sandbox, 'doPost', {
      action: 'createWorkout', key: WIDGET_KEY, access_token: TOKEN,
    });
    expect(bad.res.code).toBe('read_only');
  });
});

describe('who may run the six drinks actions', () => {
  const calls: Array<[string, Record<string, string>]> = [
    ['logDrink', { payload: logPayload('k1') }],
    ['getDrinks', {}],
    ['getDrinkTotals', {}],
    ['updateDrinkTime', { payload: JSON.stringify({ id: 'k1', time: '08:00:00' }) }],
    ['updateSetting', { payload: JSON.stringify({ key: 'water_goal_ml', value: 2000 }) }],
    ['deleteDrink', { payload: JSON.stringify({ id: 'k1' }) }],
  ];

  for (const key of ['test-key', MCP_KEY]) {
    it(`runs all seven as ${key === MCP_KEY ? 'MCP_API_KEY' : 'API_KEY'}`, () => {
      const api = load();
      for (const [action, params] of calls) {
        const { res, text } = callEntry<any>(api.sandbox, 'doGet', { action, key, ...params });
        expect(res.success, `${action}: ${text}`).toBe(true);
      }
    });
  }

  it('lets a token caller run all seven (the app logs, re-times, deletes and sets the goal)', () => {
    const api = load();
    for (const [action, params] of calls) {
      const { res, text } = callEntry<any>(api.sandbox, 'doPost', { action, access_token: TOKEN, ...params });
      expect(res.success, `${action}: ${text}`).toBe(true);
    }
  });
});

describe('the widget actions are real dispatcher cases', () => {
  it('WIDGET_ACTIONS is exactly logDrink and getDrinkTotals, each a case in main.js', () => {
    const { sandbox } = load();
    expect([...sandbox.WIDGET_ACTIONS]).toEqual(['logDrink', 'getDrinkTotals']);
    const main = readFileSync(path.join(SRC, 'main.js'), 'utf8');
    const cases = [...main.matchAll(/^\s*case '(\w+)':/gm)].map((m) => m[1]);
    for (const action of sandbox.WIDGET_ACTIONS) expect(cases).toContain(action);
  });
});
