import { describe, it, expect } from 'vitest';
import {
  callDoGet,
  loadSources,
  makeContentService,
  makePropertiesService,
  makeUtilities,
  makeWritableSheet,
  type CellValue,
  type Sandbox,
} from './apps-script-sandbox';

// #457: every MCP write is attributed to `hive-mcp`, grouped by call id, logged
// whole where undo needs the row, and reversible with `undoCall`.
//
// Driven through the real sources and `doGet`, over writable fake sheets, so
// a write and its undo act on the same rows the API would.

const KEY = 'test-key';

interface Harness {
  sandbox: Sandbox;
  items: CellValue[][];
  labels: CellValue[][];
  audit: CellValue[][];
  locks: { held: number; released: number };
  call: (action: string, payload: Record<string, unknown>) => any;
  read: (params?: Record<string, string>) => any[];
}

function itemRow(id: string, over: Partial<Record<string, CellValue>> = {}): CellValue[] {
  const f = {
    title: 'Item ' + id, description: '', status: 'To Do', owner: '', due_date: '', labels: '',
    parent_id: '', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
    completed_at: '', sort_order: 1, created_by: 'luke', board_id: 'b1', ...over,
  };
  return [id, f.title, f.description, f.status, f.owner, f.due_date, f.labels, f.parent_id,
    f.created_at, f.updated_at, f.completed_at, f.sort_order, f.created_by, f.board_id];
}

function harness(opts: { items?: CellValue[][]; labels?: CellValue[][]; boards?: CellValue[][] } = {}): Harness {
  const sandbox = loadSources(
    ['types.js', 'utils.js', 'rules.js', 'boards.js', 'statuses.js', 'audit.js', 'labels.js', 'items.js', 'undo.js', 'main.js'],
    {
      ContentService: makeContentService(),
      PropertiesService: makePropertiesService({ MCP_API_KEY: KEY, SPREADSHEET_ID: 'sheet-id' }),
      Utilities: makeUtilities(),
      Date: globalThis.Date,
    },
  );
  const locks = { held: 0, released: 0 };
  sandbox.LockService = {
    getScriptLock: () => ({
      waitLock() { locks.held++; },
      releaseLock() { locks.released++; },
    }),
  };

  const items = (opts.items ?? []).map((r) => [...r]);
  const labels = (opts.labels ?? []).map((r) => [...r]);
  const audit: CellValue[][] = [];
  const statuses: CellValue[][] = [
    ['s1', 'b1', 'To Do', 1, '#ccc', false, ''],
    ['s2', 'b1', 'Done', 2, '#0c0', true, ''],
  ];
  const sheets: Record<string, unknown> = {
    Items: makeWritableSheet(items, sandbox.ITEM_COLUMN_COUNT),
    Labels: makeWritableSheet(labels, 3),
    'Audit Log': makeWritableSheet(audit, sandbox.AUDIT_COLUMN_COUNT),
    Statuses: makeWritableSheet(statuses, sandbox.STATUS_COLUMN_COUNT),
    Boards: makeWritableSheet((opts.boards ?? []).map((r) => [...r]), sandbox.BOARD_COLUMN_COUNT),
  };
  sandbox.SpreadsheetApp = {
    openById: () => ({ getSheetByName: (n: string) => sheets[n] ?? null }),
  };

  return {
    sandbox, items, labels, audit, locks,
    call: (action, payload) =>
      callDoGet<any>(sandbox, { action, key: KEY, payload: JSON.stringify(payload) }),
    read: (params = {}) =>
      callDoGet<any[]>(sandbox, { action: 'getAuditLog', key: KEY, ...params }).data,
  };
}

const item = (h: Harness, id: string) => h.items.find((r) => r[0] === id);

describe('#457 AC1: the key fixes the actor', () => {
  it('overrides whatever payload.actor says', () => {
    const h = harness();
    h.call('createItem', { data: { title: 'Milk' }, actor: 'someone-else', call_id: 'c1' });
    h.call('createLabel', { label: 'home', actor: 'someone-else', call_id: 'c2' });
    expect(h.audit.map((r) => r[6])).toEqual(['hive-mcp', 'hive-mcp']);
  });

  it('applies to the JSON-body write path too', () => {
    const h = harness();
    const out = h.sandbox.doPost({
      parameter: {},
      postData: { contents: JSON.stringify({ key: KEY, action: 'createItem', data: { title: 'x' }, actor: 'spoof', call_id: 'jb1' }) },
    });
    expect(JSON.parse(out.getContent()).success).toBe(true);
    expect(h.audit[0][6]).toBe('hive-mcp');
    expect(h.audit[0][7]).toBe('jb1');
  });
});

describe('#457 AC2: one call id groups a call\'s rows', () => {
  it('stamps every row of a cascading write with the call id', () => {
    const h = harness({
      items: [
        itemRow('p', { status: 'To Do' }),
        itemRow('c1', { parent_id: 'p' }),
        itemRow('c2', { parent_id: 'p' }),
      ],
    });
    h.call('updateItem', { id: 'p', changes: { status: 'Done' }, call_id: 'move-1' });
    const rows = h.audit.filter((r) => r[2] !== undefined);
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(new Set(rows.map((r) => r[7]))).toEqual(new Set(['move-1']));
  });

  it('replaces a missing or invalid call id rather than refusing the write', () => {
    const h = harness();
    const bad = h.call('createItem', { data: { title: 'a' }, call_id: 'has spaces!' });
    const none = h.call('createItem', { data: { title: 'b' } });
    const long = h.call('createItem', { data: { title: 'c' }, call_id: 'x'.repeat(65) });
    expect([bad.success, none.success, long.success]).toEqual([true, true, true]);
    for (const r of h.audit) {
      expect(String(r[7])).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
    expect(h.audit.map((r) => r[7])).not.toContain('has spaces!');
  });
});

describe('#457 AC3: creates and deletes carry the whole row', () => {
  it('logs a created item whole, and leaves updates blank', () => {
    const h = harness({ items: [itemRow('a')] });
    h.call('createItem', { data: { title: 'Milk', description: 'two %', board_id: 'b1' }, call_id: 'c1' });
    const created = h.audit[0];
    expect(created[2]).toBe('created');
    const whole = JSON.parse(String(created[8]));
    expect(whole).toMatchObject({ title: 'Milk', description: 'two %', board_id: 'b1' });
    expect(Object.keys(whole)).toHaveLength(14);

    h.call('updateItem', { id: 'a', changes: { title: 'New' }, call_id: 'c2' });
    const updated = h.audit.find((r) => r[2] === 'updated')!;
    expect(updated[8]).toBe('');
    expect([updated[3], updated[4], updated[5]]).toEqual(['title', 'Item a', 'New']);
  });

  it('logs every deleted row of a cascade whole, as it was before the delete', () => {
    const h = harness({ items: [itemRow('p'), itemRow('k', { parent_id: 'p', description: 'kid' })] });
    const preview = h.call('deleteItem', { id: 'p' }).data;
    h.call('deleteItem', { id: 'p', confirm: true, token: preview.token, call_id: 'del1' });
    const deleted = h.audit.filter((r) => r[2] === 'deleted');
    expect(deleted).toHaveLength(2);
    const byId = Object.fromEntries(deleted.map((r) => [r[1], JSON.parse(String(r[8]))]));
    expect(byId.k).toMatchObject({ id: 'k', parent_id: 'p', description: 'kid' });
    expect(byId.p).toMatchObject({ id: 'p' });
    expect(deleted.every((r) => r[7] === 'del1')).toBe(true);
  });

  it('round-trips an item with a maximal description', () => {
    const h = harness();
    const big = 'é"\n\\'.repeat(9000);
    h.call('createItem', { data: { title: 'big', description: big }, call_id: 'big1' });
    const logged = JSON.parse(String(h.audit[0][8]));
    expect(logged.description).toBe(big);
    h.call('undoCall', { call_id: 'big1', confirm: true });
    expect(h.items).toHaveLength(0);
    h.call('undoCall', { call_id: h.read({ call_id: 'big1' })[0].call_id, confirm: true });
  });
});

describe('#457 AC4: label creates are logged', () => {
  it('writes a label_created row and leaves action filters unchanged', () => {
    const h = harness({ items: [itemRow('a')] });
    h.call('createLabel', { label: 'home', color: '#fff', board_id: 'b1', call_id: 'l1' });
    const row = h.audit[0];
    expect([row[1], row[2], row[3], row[4], row[5]]).toEqual(['', 'label_created', 'label', '', 'home']);
    expect(JSON.parse(String(row[8]))).toEqual({ label: 'home', color: '#fff', board_id: 'b1' });
    expect(h.read({ audit_action: 'completed' })).toEqual([]);
  });
});

describe('#457 AC5: getAuditLog filters by actor and call', () => {
  it('narrows to one actor, one call, or both', () => {
    const h = harness({ items: [itemRow('a')] });
    h.call('updateItem', { id: 'a', changes: { title: 'x' }, call_id: 'one' });
    h.call('updateItem', { id: 'a', changes: { title: 'y' }, call_id: 'two' });
    h.audit.push([new Date().toISOString(), 'a', 'updated', 'title', 'y', 'z', 'luke@example.com']);

    expect(h.read({ call_id: 'one' }).map((e) => e.new_value)).toEqual(['x']);
    expect(h.read({ actor: 'hive-mcp' })).toHaveLength(2);
    expect(h.read({ actor: 'luke@example.com' })).toHaveLength(1);
    expect(h.read({ actor: 'hive-mcp', call_id: 'two' })).toHaveLength(1);
    const entry = h.read({ call_id: 'one' })[0];
    expect(entry).toHaveProperty('call_id', 'one');
    expect(entry).toHaveProperty('row_json', '');
  });
});

describe('#457 AC6: migration headers', () => {
  it('heads H and I once, leaves A:G alone, and a second run changes nothing', () => {
    const h = harness();
    const header = ['timestamp', 'item_id', 'action', 'field', 'old_value', 'new_value', 'actor'];
    const sheet: any = {
      row: [...header] as CellValue[],
      getRange(_r: number, c: number) {
        const self = this;
        return {
          getValues: () => [[self.row[c - 1], self.row[c]]],
          setValues: (v: CellValue[][]) => { self.row[c - 1] = v[0][0]; self.row[c] = v[0][1]; },
        };
      },
    };
    h.sandbox.getSheet = () => sheet;
    h.sandbox.migrateAuditLogHeaders();
    h.sandbox.migrateAuditLogHeaders();
    expect(sheet.row).toEqual([...header, 'call_id', 'row_json']);
  });
});

describe('#457 AC7: undoCall previews, then reverts one call exactly', () => {
  it('removes a created item; a dry run changes nothing', () => {
    const h = harness();
    h.call('createItem', { data: { title: 'Milk' }, call_id: 'mk' });
    const dry = h.call('undoCall', { call_id: 'mk' });
    expect(dry.data).toMatchObject({ dry_run: true, count: 1 });
    expect(dry.data.changes[0]).toMatchObject({ type: 'remove', title: 'Milk' });
    expect(h.items).toHaveLength(1);

    const done = h.call('undoCall', { call_id: 'mk', confirm: true });
    expect(done.data).toMatchObject({ dry_run: false, count: 1 });
    expect(h.items).toHaveLength(0);
    expect(h.locks.held).toBe(2);
    expect(h.locks.held).toBe(h.locks.released);

    const undoRow = h.audit.find((r) => r[2] === 'undo')!;
    expect(undoRow[6]).toBe('hive-mcp');
    expect(undoRow[7]).toBe(done.data.undo_call_id);
  });

  it('re-inserts a deleted cascade with its original ids and parent links', () => {
    const h = harness({
      items: [itemRow('p', { description: 'parent' }), itemRow('k', { parent_id: 'p', description: 'kid' })],
    });
    const original = h.items.map((r) => [...r]);
    const token = h.call('deleteItem', { id: 'p' }).data.token;
    h.call('deleteItem', { id: 'p', confirm: true, token, call_id: 'del' });
    expect(h.items).toHaveLength(0);

    h.call('undoCall', { call_id: 'del', confirm: true });
    expect(h.items).toHaveLength(2);
    for (const row of original) expect(item(h, String(row[0]))).toEqual(row);
  });

  it('puts an updated field back, and a status move back with its completion cleared', () => {
    const h = harness({ items: [itemRow('a', { title: 'Old', status: 'To Do' })] });
    h.call('updateItem', { id: 'a', changes: { title: 'New', status: 'Done' }, call_id: 'upd' });
    expect(item(h, 'a')![3]).toBe('Done');
    expect(item(h, 'a')![10]).not.toBe('');

    h.call('undoCall', { call_id: 'upd', confirm: true });
    const row = item(h, 'a')!;
    expect([row[1], row[3], row[10]]).toEqual(['Old', 'To Do', '']);
  });

  it('reverts a cascade of child status moves', () => {
    const h = harness({ items: [itemRow('p'), itemRow('k', { parent_id: 'p' })] });
    h.call('updateItem', { id: 'p', changes: { status: 'Done' }, call_id: 'casc' });
    expect(item(h, 'k')![3]).toBe('Done');
    h.call('undoCall', { call_id: 'casc', confirm: true });
    expect([item(h, 'p')![3], item(h, 'k')![3]]).toEqual(['To Do', 'To Do']);
  });

  it('removes a created label', () => {
    const h = harness();
    h.call('createLabel', { label: 'home', board_id: 'b1', call_id: 'lab' });
    expect(h.labels).toHaveLength(1);
    h.call('undoCall', { call_id: 'lab', confirm: true });
    expect(h.labels).toHaveLength(0);
  });

  it('is itself logged, so an undo can be undone', () => {
    const h = harness({ items: [itemRow('p'), itemRow('k', { parent_id: 'p' })] });
    const token = h.call('deleteItem', { id: 'p' }).data.token;
    h.call('deleteItem', { id: 'p', confirm: true, token, call_id: 'del' });
    const before = [];
    const undo1 = h.call('undoCall', { call_id: 'del', confirm: true }).data;
    expect(h.items).toHaveLength(2);
    h.items.forEach((r) => before.push([...r]));

    const undo2 = h.call('undoCall', { call_id: undo1.undo_call_id, confirm: true }).data;
    expect(h.items).toHaveLength(0);

    h.call('undoCall', { call_id: undo2.undo_call_id, confirm: true });
    expect(h.items).toHaveLength(2);
  });

  it('undoes an undo of a field change and of a label', () => {
    const h = harness({ items: [itemRow('a', { title: 'Old' })] });
    h.call('updateItem', { id: 'a', changes: { title: 'New' }, call_id: 'u' });
    h.call('createLabel', { label: 'x', call_id: 'lb' });
    const u1 = h.call('undoCall', { call_id: 'u', confirm: true }).data;
    const l1 = h.call('undoCall', { call_id: 'lb', confirm: true }).data;
    expect([item(h, 'a')![1], h.labels.length]).toEqual(['Old', 0]);
    h.call('undoCall', { call_id: u1.undo_call_id, confirm: true });
    h.call('undoCall', { call_id: l1.undo_call_id, confirm: true });
    expect([item(h, 'a')![1], h.labels.length]).toEqual(['New', 1]);
  });
});

describe('#457 AC8: undoCall is all or nothing', () => {
  it('reverts nothing, and names every conflict, when a field changed since', () => {
    const h = harness({ items: [itemRow('a', { title: 'Old' }), itemRow('b', { title: 'B-old' })] });
    h.call('updateItem', { id: 'a', changes: { title: 'New-a' }, call_id: 'two' });
    h.call('updateItem', { id: 'b', changes: { title: 'New-b' }, call_id: 'two' });
    h.call('updateItem', { id: 'a', changes: { title: 'Edited later' } });

    for (const confirm of [false, true]) {
      const res = h.call('undoCall', { call_id: 'two', confirm });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/^Nothing reverted/);
      expect(res.data.conflicts).toEqual([
        { item_id: 'a', field: 'title', current: 'Edited later', expected: 'New-a' },
      ]);
    }
    expect([item(h, 'a')![1], item(h, 'b')![1]]).toEqual(['Edited later', 'New-b']);
    expect(h.audit.some((r) => r[2] === 'undo')).toBe(false);
  });

  it('refuses a created item that was edited, and a deleted id that exists again', () => {
    const h = harness();
    h.call('createItem', { data: { title: 'Milk' }, call_id: 'mk' });
    const id = String(h.items[0][0]);
    h.call('updateItem', { id, changes: { owner: 'Luke' } });
    const res = h.call('undoCall', { call_id: 'mk', confirm: true });
    expect(res.success).toBe(false);
    expect(res.data.conflicts[0]).toMatchObject({ item_id: id, field: 'owner', current: 'Luke', expected: '' });
    expect(h.items).toHaveLength(1);

    const g = harness({ items: [itemRow('z')] });
    const token = g.call('deleteItem', { id: 'z' }).data.token;
    g.call('deleteItem', { id: 'z', confirm: true, token, call_id: 'dz' });
    g.items.push(itemRow('z', { title: 'back' }));
    const res2 = g.call('undoCall', { call_id: 'dz', confirm: true });
    expect(res2.success).toBe(false);
    expect(res2.data.conflicts[0]).toMatchObject({ item_id: 'z', current: 'exists again' });
    expect(g.items).toHaveLength(1);
  });

  it('says so, and changes nothing, for an unknown call id', () => {
    const h = harness({ items: [itemRow('a')] });
    const res = h.call('undoCall', { call_id: 'nope', confirm: true });
    expect(res).toMatchObject({ success: false, error: 'No MCP call nope in the Audit Log' });
    expect(h.audit).toHaveLength(0);
  });

  it('refuses a call that was logged before row_json existed', () => {
    const h = harness();
    h.audit.push(['2026-09-01T00:00:00.000Z', 'old', 'deleted', '', 'Old title', '', 'hive-mcp', 'legacy', '']);
    const res = h.call('undoCall', { call_id: 'legacy', confirm: true });
    expect(res.success).toBe(false);
    expect(res.data.conflicts[0]).toMatchObject({ item_id: 'old', current: '(not recorded)' });
  });

  it('refuses a missing or wrong key like every other action', () => {
    const h = harness();
    const out = callDoGet<any>(h.sandbox, { action: 'undoCall', key: 'wrong', payload: '{"call_id":"x"}' });
    expect(out).toMatchObject({ success: false, error: 'Invalid or missing API key' });
  });

  it('requires a call_id', () => {
    const h = harness();
    expect(h.call('undoCall', {})).toMatchObject({ success: false, error: 'payload.call_id field required' });
  });
});
