// #713: the MCP change log and undo. Key-caller writes are logged row by row
// under their call id, token writes and dry runs are not, and undoCall reverts
// one call all or nothing, refusing a changed row or a row still in use.
// That every write action is logged or deliberately not is in mcp-parity.test.ts.

import { describe, expect, it } from 'vitest';
import { loadApi, type Api } from './apps-script-sandbox';

const CLIENT_ID = 'forage-1234.apps.googleusercontent.com';
const EMAIL = 'owner@example.com';
const TOKEN = 'ya29.test-token';

function tokenApi(): Api {
  return loadApi({
    properties: { TOKEN_CLIENT_ID: CLIENT_ID, TOKEN_ALLOWED_EMAIL: EMAIL },
    tokeninfo: () => ({
      status: 200,
      body: JSON.stringify({ aud: CLIENT_ID, azp: CLIENT_ID, email: EMAIL, email_verified: 'true', expires_in: '3599' }),
    }),
  });
}

const STEW = {
  name: 'Beef Stew',
  servings: 6,
  source_url: 'https://example.com/beef-stew',
  lines: ['1.5 lb beef chuck', '2 tbsp olive oil', '3 carrots'],
  steps: [{ text: 'Brown the beef.' }, { text: 'Simmer for two hours.' }],
};

function importStew(api: Api, callId = 'call-1') {
  return api.ok('importRecipe', { payload: { recipe: STEW, dry_run: false, call_id: callId } });
}

function logRows(api: Api) {
  return api.rows('MCPChangeLog').map((r) => ({ call_id: r[1], action: r[2], tab: r[3] }));
}

describe('logging', () => {
  it('logs each row a key write creates under its call id', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_1', name: 'Onion', call_id: 'abc-1' } });
    expect(logRows(api)).toEqual([{ call_id: 'abc-1', action: 'upsertFood', tab: 'Foods' }]);
    const row = api.rows('MCPChangeLog')[0];
    expect(JSON.parse(String(row[4]))).toEqual({ id: 'fd_1' });
    expect(row[5]).toBe('');
    expect(JSON.parse(String(row[6]))).toMatchObject({ id: 'fd_1', name: 'Onion' });
  });

  it('a saved import logs the recipe, every line and every step under one call id', () => {
    const api = loadApi();
    importStew(api, 'imp-1');
    const rows = logRows(api);
    expect(rows.every((r) => r.call_id === 'imp-1' && r.action === 'importRecipe')).toBe(true);
    expect(rows.map((r) => r.tab).sort()).toEqual(
      ['RecipeLines', 'RecipeLines', 'RecipeLines', 'Recipes', 'Steps', 'Steps'],
    );
  });

  it('a dry run writes no change-log row', () => {
    const api = loadApi();
    api.ok('importRecipe', { payload: { recipe: STEW, call_id: 'dry-1' } });
    api.ok('importRecipe', { payload: { recipe: STEW, dry_run: true, call_id: 'dry-2' } });
    expect(api.rows('MCPChangeLog')).toEqual([]);
  });

  it('a key write with no call id gets a generated one; a bad one is replaced', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_1', name: 'Onion' } });
    api.ok('upsertFood', { payload: { id: 'fd_2', name: 'Leek', call_id: 'not valid!' } });
    const ids = api.rows('MCPChangeLog').map((r) => String(r[1]));
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("the app's writes are not logged", () => {
    const api = tokenApi();
    const res = api.post({ action: 'upsertFood', access_token: TOKEN, payload: { id: 'fd_1', name: 'Onion' } });
    expect(res.success).toBe(true);
    expect(api.rows('MCPChangeLog')).toEqual([]);
  });

  it('a write that changes nothing logs nothing, and a refused one logs nothing', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_1', name: 'Onion', call_id: 'a' } });
    expect(api.call('deleteFood', { payload: { id: 'fd_missing', call_id: 'b' } }).success).toBe(false);
    expect(logRows(api).map((r) => r.call_id)).toEqual(['a']);
  });
});

describe('key-only', () => {
  it('getChangeLog and undoCall are refused to a token caller', () => {
    const api = tokenApi();
    for (const action of ['getChangeLog', 'undoCall']) {
      const res = api.post({ action, access_token: TOKEN, payload: { call_id: 'x' } });
      expect(res, action).toMatchObject({ success: false, code: 'not_permitted' });
    }
  });
});

describe('getChangeLog', () => {
  it('answers calls newest first, filtered by call_id', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_1', name: 'Onion', call_id: 'first' } });
    api.ok('upsertFood', { payload: { id: 'fd_2', name: 'Leek', call_id: 'second' } });
    expect(api.ok('getChangeLog').map((r: { call_id: string }) => r.call_id)).toEqual(['second', 'first']);
    const one = api.ok('getChangeLog', { call_id: 'first' });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ action: 'upsertFood', tab: 'Foods', row_key: { id: 'fd_1' }, before: null });
  });
});

describe('undoCall', () => {
  it('after a real import, a dry run lists every row and changes nothing; confirm removes the recipe, lines and steps', () => {
    const api = loadApi();
    importStew(api, 'imp-1');
    const before = JSON.stringify(api.rows('Recipes'));

    const dry = api.ok('undoCall', { payload: { call_id: 'imp-1' } });
    expect(dry).toMatchObject({ dry_run: true, call_id: 'imp-1', count: 6 });
    expect(dry.rows.every((r: { restore: unknown }) => r.restore === null)).toBe(true);
    expect(JSON.stringify(api.rows('Recipes'))).toBe(before);

    const done = api.ok('undoCall', { payload: { call_id: 'imp-1', confirm: true } });
    expect(done).toMatchObject({ dry_run: false, count: 6 });
    expect(done.undo_call_id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(api.rows('Recipes')).toEqual([]);
    expect(api.rows('RecipeLines')).toEqual([]);
    expect(api.rows('Steps')).toEqual([]);
  });

  it('removes the Foods rows the call created, and its own revert can be undone', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_1', name: 'Onion', call_id: 'food-1' } });
    const done = api.ok('undoCall', { payload: { call_id: 'food-1', confirm: true } });
    expect(api.rows('Foods')).toEqual([]);
    expect(logRows(api).filter((r) => r.call_id === done.undo_call_id)).toEqual([
      { call_id: done.undo_call_id, action: 'undo', tab: 'Foods' },
    ]);
    api.ok('undoCall', { payload: { call_id: done.undo_call_id, confirm: true } });
    expect(api.ok('getFood', { id: 'fd_1' })).toMatchObject({ name: 'Onion' });
  });

  it('restores a changed row and brings back a deleted one', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_1', name: 'Onion' } });
    api.ok('upsertFood', { payload: { id: 'fd_2', name: 'Leek' } });
    api.ok('upsertFood', { payload: { id: 'fd_1', name: 'Red onion', call_id: 'rename' } });
    api.ok('deleteFood', { payload: { id: 'fd_2', call_id: 'drop' } });
    api.ok('undoCall', { payload: { call_id: 'rename', confirm: true } });
    api.ok('undoCall', { payload: { call_id: 'drop', confirm: true } });
    expect(api.ok('getFood', { id: 'fd_1' }).name).toBe('Onion');
    expect(api.ok('getFood', { id: 'fd_2' }).name).toBe('Leek');
  });

  it('refuses the whole call, naming every changed row, when a row it touched has changed since', () => {
    const api = loadApi();
    const saved = importStew(api, 'imp-1');
    api.ok('upsertRecipe', { payload: { id: saved.id, name: 'Beef Stew 2' } });
    const lines = api.rows('RecipeLines').length;

    const res = api.call('undoCall', { payload: { call_id: 'imp-1', confirm: true } });
    expect(res).toMatchObject({ success: false, code: 'undo_refused' });
    expect(res.data.conflicts).toHaveLength(1);
    expect(res.data.conflicts[0]).toMatchObject({
      tab: 'Recipes',
      row_key: { id: saved.id },
      current: { name: 'Beef Stew 2' },
      expected: { name: 'Beef Stew' },
    });
    expect(api.rows('Recipes')).toHaveLength(1);
    expect(api.rows('RecipeLines')).toHaveLength(lines);
  });

  it('refuses to remove a recipe a plan entry now uses, naming the use', () => {
    const api = loadApi();
    const saved = importStew(api, 'imp-1');
    api.ok('upsertPlanEntry', { payload: { id: 'pl_1', date: '2026-11-03', slot: 'Dinner', recipe_id: saved.id } });

    for (const confirm of [false, true]) {
      const res = api.call('undoCall', { payload: { call_id: 'imp-1', confirm } });
      expect(res).toMatchObject({ success: false, code: 'undo_refused' });
      expect(res.data.uses).toEqual([
        {
          tab: 'Recipes',
          id: saved.id,
          name: 'Beef Stew',
          by: 'Plan',
          row: expect.objectContaining({ id: 'pl_1', date: '2026-11-03', slot: 'Dinner' }),
        },
      ]);
    }
    expect(api.rows('Recipes')).toHaveLength(1);
  });

  it('refuses to remove a recipe a food log entry now uses', () => {
    const api = loadApi();
    const saved = importStew(api, 'imp-1');
    api.ok('logFood', { payload: { id: 'lg_1', date: '2026-11-04', slot: 'Lunch', recipe_id: saved.id, qty: 1 } });
    const res = api.call('undoCall', { payload: { call_id: 'imp-1', confirm: true } });
    expect(res.data.uses.map((u: { by: string }) => u.by)).toEqual(['FoodLog']);
  });

  it('refuses to remove a food a recipe line outside the call uses', () => {
    const api = loadApi();
    api.ok('upsertFood', { payload: { id: 'fd_1', name: 'Onion', call_id: 'food-1' } });
    api.ok('upsertRecipe', {
      payload: { id: 'rc_1', name: 'Soup', servings: 2, lines: [{ text: '1 onion', food_id: 'fd_1' }], steps: [] },
    });
    const res = api.call('undoCall', { payload: { call_id: 'food-1', confirm: true } });
    expect(res.data.uses).toEqual([
      expect.objectContaining({ tab: 'Foods', id: 'fd_1', name: 'Onion', by: 'RecipeLines' }),
    ]);
    expect(api.rows('Foods')).toHaveLength(1);
  });

  it('refuses an unknown call id', () => {
    const api = loadApi();
    expect(api.call('undoCall', { payload: { call_id: 'nope' } }).error).toMatch(/No call nope/);
    expect(api.call('undoCall', { payload: {} }).error).toMatch(/call_id is required/);
  });

  it('holds the script lock and releases it', () => {
    const api = loadApi();
    importStew(api, 'imp-1');
    api.ok('undoCall', { payload: { call_id: 'imp-1', confirm: true } });
    expect(api.lock.held).toBe(false);
  });
});
