// #595 - the MCP's drink writes are change-logged and undoable. logDrink,
// updateDrinkTime, updateDrinkAmount and deleteDrink made with the MCP key
// append MCPChangeLog rows for the Drinks tab, keyed by id, and undoCall
// reverts each; source 'mcp' is accepted.

import { describe, it, expect } from 'vitest';
import { loadApi, callEntry, type CellValue, type LoadedApi } from './apps-script-sandbox';

const MCP = 'mcp-key';
const API = 'test-key';
const NOW = new Date('2026-10-23T15:00:00.000Z');

const row = (over: Partial<Record<string, string>> = {}): CellValue[] => {
  const d = {
    id: 'd-1', kind: 'water', amount: '118', date: '2026-10-22', time: '23:59:00',
    logged_at_utc: '2026-10-23T05:59:00.000Z', source: 'app',
    created: '2026-10-22T13:00:01.000Z', updated: '2026-10-22T13:00:01.000Z', ...over,
  };
  return [d.id, d.kind, d.amount, d.date, d.time, d.logged_at_utc, d.source, d.created, d.updated];
};

function load(drinks: CellValue[][] = []) {
  return loadApi(
    { changeLog: [], drinks },
    { now: NOW, properties: { MCP_API_KEY: MCP }, uuids: ['undo-1', 'undo-2', 'undo-3'] },
  );
}

type Res = { success: boolean; data?: any; error?: string };
function call(api: LoadedApi, action: string, payload?: unknown, key = MCP): Res {
  const params: Record<string, string> = { action, key };
  if (payload !== undefined) params.payload = JSON.stringify(payload);
  return callEntry<any>(api.sandbox, 'doGet', params).res as Res;
}

function log(api: LoadedApi) {
  return api.changeLogRows!.map((r) => ({
    call_id: String(r[1]), action: String(r[2]), tab: String(r[3]), key: JSON.parse(String(r[4])),
    before: r[5] ? JSON.parse(String(r[5])) : null, after: r[6] ? JSON.parse(String(r[6])) : null,
  }));
}
const drinkIds = (api: LoadedApi) => api.drinkRows!.map((r) => String(r[0]));

const logged = (id: string, over: Record<string, unknown> = {}) => ({
  id, kind: 'alcohol', amount: 1, logged_at_utc: '2026-10-23T05:59:00Z', source: 'mcp', call_id: 'beers', ...over,
});

describe('logDrink from the MCP', () => {
  it("accepts source 'mcp' and logs the new row under the call's id, keyed by drink id", () => {
    const api = load();
    const res = call(api, 'logDrink', logged('a', { kind: 'water', amount: 473, logged_at_utc: '2026-10-23T04:00:00Z' }));
    expect(res.success, res.error).toBe(true);
    expect(res.data).toMatchObject({ id: 'a', amount: '473', date: '2026-10-22', time: '22:00:00', source: 'mcp' });
    const [entry] = log(api);
    expect(entry).toMatchObject({ call_id: 'beers', action: 'logDrink', tab: 'Drinks', key: { id: 'a' }, before: null });
    expect(entry.after).toMatchObject({ id: 'a', kind: 'water', amount: '473', source: 'mcp' });
    expect(Object.keys(entry.after)).toHaveLength(9);
  });

  it('three entries under one call_id are one call, listed and reverted together', () => {
    const api = load([row({ id: 'keep' })]);
    for (const id of ['b1', 'b2', 'b3']) expect(call(api, 'logDrink', logged(id)).success).toBe(true);
    const listed = call(api, 'getChangeLog').data as Array<{ call_id: string }>;
    expect(listed).toHaveLength(3);
    expect(new Set(listed.map((r) => r.call_id))).toEqual(new Set(['beers']));

    const dry = call(api, 'undoCall', { call_id: 'beers' });
    expect(dry.data).toMatchObject({ dry_run: true, count: 3 });
    expect(drinkIds(api)).toEqual(['keep', 'b1', 'b2', 'b3']);
    const res = call(api, 'undoCall', { call_id: 'beers', confirm: true });
    expect(res.success, res.error).toBe(true);
    expect(drinkIds(api)).toEqual(['keep']);
  });

  it('a retry of the same id changes nothing and logs nothing', () => {
    const api = load([row({ id: 'a' })]);
    expect(call(api, 'logDrink', logged('a')).success).toBe(true);
    expect(log(api)).toEqual([]);
  });
});

describe('updateDrinkTime and updateDrinkAmount from the MCP', () => {
  it('log the whole row before and after, and undo restores it', () => {
    const api = load([row({ id: 'w' })]);
    expect(call(api, 'updateDrinkAmount', { id: 'w', amount: 473, call_id: 'amt' }).success).toBe(true);
    expect(call(api, 'updateDrinkTime', { id: 'w', time: '22:00:00', call_id: 'tm' }).success).toBe(true);
    const [amt, tm] = log(api);
    expect(amt).toMatchObject({ call_id: 'amt', action: 'updateDrinkAmount', tab: 'Drinks', key: { id: 'w' } });
    expect([amt.before.amount, amt.after.amount]).toEqual(['118', '473']);
    expect(tm).toMatchObject({ call_id: 'tm', action: 'updateDrinkTime', key: { id: 'w' } });
    expect([tm.before.time, tm.after.time]).toEqual(['23:59:00', '22:00:00']);

    expect(call(api, 'undoCall', { call_id: 'tm', confirm: true }).success).toBe(true);
    expect(String(api.drinkRows![0][4])).toBe('23:59:00');
    expect(call(api, 'undoCall', { call_id: 'amt', confirm: true }).success).toBe(true);
    expect(api.drinkRows!.map((r) => r.map(String))).toEqual([row({ id: 'w' }).map(String)]);
  });

  it('a refused update writes and logs nothing', () => {
    const api = load([row({ id: 'c', kind: 'coffee', amount: '1' })]);
    expect(call(api, 'updateDrinkAmount', { id: 'c', amount: 2, call_id: 'x' }).success).toBe(false);
    expect(log(api)).toEqual([]);
  });
});

describe('deleteDrink from the MCP', () => {
  it('logs the deleted row, and undo brings it back with its original id and values', () => {
    const original = row({ id: 'gone', kind: 'alcohol', amount: '1', source: 'widget' });
    const api = load([row({ id: 'keep' }), original]);
    expect(call(api, 'deleteDrink', { id: 'gone', call_id: 'del' }).success).toBe(true);
    expect(drinkIds(api)).toEqual(['keep']);
    const [entry] = log(api);
    expect(entry).toMatchObject({ call_id: 'del', action: 'deleteDrink', tab: 'Drinks', key: { id: 'gone' }, after: null });

    const res = call(api, 'undoCall', { call_id: 'del', confirm: true });
    expect(res.success, res.error).toBe(true);
    expect(drinkIds(api)).toEqual(['keep', 'gone']);
    expect(api.drinkRows![1].map(String)).toEqual(original.map(String));
  });

  it('undo refuses when the row has changed since', () => {
    const api = load([row({ id: 'w' })]);
    call(api, 'updateDrinkAmount', { id: 'w', amount: 300, call_id: 'one' });
    call(api, 'updateDrinkAmount', { id: 'w', amount: 400, call_id: 'two' });
    const res = call(api, 'undoCall', { call_id: 'one', confirm: true });
    expect(res.success).toBe(false);
    expect(String(api.drinkRows![0][2])).toBe('400');
  });
});

describe('the app key is not logged', () => {
  it('a drink write with the API key appends no change-log row', () => {
    const api = load([row({ id: 'w' })]);
    expect(call(api, 'updateDrinkAmount', { id: 'w', amount: 300 }, API).success).toBe(true);
    expect(log(api)).toEqual([]);
  });
});
