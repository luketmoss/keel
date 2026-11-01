import { describe, it, expect } from 'vitest';
import {
  callDoGet,
  denverMidnight,
  loadSources,
  makeContentService,
  makeItemsSheet,
  makePropertiesService,
  makeUtilities,
  makeWritableSheet,
  type CellValue,
} from './apps-script-sandbox';

// #728: a due date is text YYYY-MM-DD, never a date cell. The sandbox's Items
// sheet types column F the way Sheets does (a bare YYYY-MM-DD becomes a Date,
// an apostrophe-prefixed one stays text), so a write that skips `asText` fails
// here instead of silently dropping out of due_before / due_after in production.

const KEY = 'test-key';
const DUE = 5;

function itemRow(id: string, over: Partial<Record<string, CellValue>> = {}): CellValue[] {
  const f = {
    title: 'Item ' + id, description: '', status: 'To Do', owner: '', due_date: '', labels: '',
    parent_id: '', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
    completed_at: '', sort_order: 1, created_by: 'luke', board_id: 'b1', ...over,
  };
  return [id, f.title, f.description, f.status, f.owner, f.due_date, f.labels, f.parent_id,
    f.created_at, f.updated_at, f.completed_at, f.sort_order, f.created_by, f.board_id];
}

/** A Date cell for local Denver midnight, as Sheets hands back a date-typed cell. */
const dateCell = (ymd: string) => denverMidnight(ymd) as unknown as CellValue;

function harness(initial: CellValue[][] = []) {
  const sandbox = loadSources(
    ['types.js', 'utils.js', 'rules.js', 'boards.js', 'statuses.js', 'audit.js', 'labels.js', 'items.js', 'undo.js', 'main.js'],
    {
      ContentService: makeContentService(),
      PropertiesService: makePropertiesService({ MCP_API_KEY: KEY, SPREADSHEET_ID: 'sheet-id' }),
      Utilities: makeUtilities(),
      Date: globalThis.Date,
    },
  );
  sandbox.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  const items = initial.map((r) => [...r]);
  const audit: CellValue[][] = [];
  const statuses: CellValue[][] = [
    ['s1', 'b1', 'To Do', 1, '#ccc', false, ''],
    ['s2', 'b1', 'Done', 2, '#0c0', true, ''],
  ];
  const itemsSheet = makeItemsSheet(items, sandbox.ITEM_COLUMN_COUNT);
  const auditSheet = makeWritableSheet(audit, sandbox.AUDIT_COLUMN_COUNT);
  const sheets: Record<string, unknown> = {
    Items: itemsSheet,
    Labels: makeWritableSheet([], 3),
    'Audit Log': auditSheet,
    Statuses: makeWritableSheet(statuses, sandbox.STATUS_COLUMN_COUNT),
    Boards: makeWritableSheet([], sandbox.BOARD_COLUMN_COUNT),
  };
  sandbox.SpreadsheetApp = { openById: () => ({ getSheetByName: (n: string) => sheets[n] ?? null }) };
  return {
    sandbox,
    items,
    audit,
    sheet: itemsSheet,
    call: (action: string, payload: Record<string, unknown>) =>
      callDoGet<any>(sandbox, { action, key: KEY, payload: JSON.stringify(payload) }),
    get: (params: Record<string, string>) => callDoGet<any>(sandbox, { action: 'getItems', key: KEY, ...params }),
  };
}

const isDate = (v: unknown) => Object.prototype.toString.call(v) === '[object Date]';
const cell = (items: CellValue[][], id: string) => items.find((r) => r[0] === id)![DUE];

describe('#728 the sandbox models Sheets typing the due-date column', () => {
  it('turns a bare YYYY-MM-DD into a Date and keeps an apostrophe-prefixed one as text', () => {
    const h = harness();
    h.sheet.appendRow(itemRow('bare', { due_date: '2026-11-01' }));
    h.sheet.appendRow(itemRow('escaped', { due_date: "'2026-11-01" }));
    expect(isDate(cell(h.items, 'bare'))).toBe(true);
    expect(cell(h.items, 'escaped')).toBe('2026-11-01');
  });

  it('writes a Date for local Denver midnight, on DST-change days too', () => {
    expect(denverMidnight('2026-11-01').toISOString()).toBe('2026-11-01T06:00:00.000Z'); // still MDT
    expect(denverMidnight('2026-03-08').toISOString()).toBe('2026-03-08T07:00:00.000Z'); // still MST
  });

  it('does not touch other columns', () => {
    const h = harness();
    h.sheet.appendRow(itemRow('x', { title: '2026-11-01', created_at: '2026-11-01' }));
    expect(h.items[0][1]).toBe('2026-11-01');
    expect(h.items[0][8]).toBe('2026-11-01');
  });
});

describe('#728 AC1: createItem stores the due date as text', () => {
  it('is a string in the sheet and reads back as YYYY-MM-DD', () => {
    const h = harness();
    const out = h.call('createItem', { data: { title: 'Milk', due_date: '2026-11-01', board_id: 'b1' } });
    expect(out.success).toBe(true);
    const id = out.data.id;
    expect(typeof cell(h.items, id)).toBe('string');
    expect(cell(h.items, id)).toBe('2026-11-01');
    expect(h.sandbox.getItem(id).due_date).toBe('2026-11-01');
    expect(h.get({}).data[0].due_date).toBe('2026-11-01');
  });

  it('leaves an empty due date empty', () => {
    const h = harness();
    const id = h.call('createItem', { data: { title: 'No date', board_id: 'b1' } }).data.id;
    expect(cell(h.items, id)).toBe('');
    expect(h.sandbox.getItem(id).due_date).toBe('');
  });
});

describe('#728 AC2: updateItem, its cascades and undoCall store text', () => {
  it('stores a changed due_date as text', () => {
    const h = harness([itemRow('a', { due_date: '2026-10-01' })]);
    h.call('updateItem', { id: 'a', changes: { due_date: '2026-12-25' } });
    expect(cell(h.items, 'a')).toBe('2026-12-25');
    expect(h.sandbox.getItem('a').due_date).toBe('2026-12-25');
  });

  it('keeps an unchanged due_date text when another field changes', () => {
    const h = harness([itemRow('a', { due_date: '2026-10-01' })]);
    h.call('updateItem', { id: 'a', changes: { title: 'renamed' } });
    expect(cell(h.items, 'a')).toBe('2026-10-01');
  });

  it('keeps a child row text when a status cascade rewrites it', () => {
    const h = harness([itemRow('p'), itemRow('k', { parent_id: 'p', due_date: '2026-11-01' })]);
    h.call('updateItem', { id: 'p', changes: { status: 'Done' } });
    expect(h.items.find((r) => r[0] === 'k')![3]).toBe('Done');
    expect(cell(h.items, 'k')).toBe('2026-11-01');
  });

  it('keeps a sub-task row text when a board move rewrites it', () => {
    const h = harness([itemRow('p'), itemRow('k', { parent_id: 'p', due_date: '2026-11-01' })]);
    h.call('updateItem', { id: 'p', changes: { board_id: 'b2' } });
    expect(h.items.find((r) => r[0] === 'k')![13]).toBe('b2');
    expect(cell(h.items, 'k')).toBe('2026-11-01');
  });

  it('restores a deleted row with a text due date', () => {
    const h = harness([itemRow('a', { due_date: '2026-11-01' })]);
    const preview = h.call('deleteItem', { id: 'a' }).data;
    h.call('deleteItem', { id: 'a', confirm: true, token: preview.token, call_id: 'del-1' });
    expect(h.items).toHaveLength(0);
    const undo = h.call('undoCall', { call_id: 'del-1', confirm: true });
    expect(undo.success).toBe(true);
    expect(typeof cell(h.items, 'a')).toBe('string');
    expect(cell(h.items, 'a')).toBe('2026-11-01');
  });

  it('undoes a due_date change with a text due date', () => {
    const h = harness([itemRow('a', { due_date: '2026-10-01' })]);
    h.call('updateItem', { id: 'a', changes: { due_date: '2026-12-25' }, call_id: 'chg-1' });
    const undo = h.call('undoCall', { call_id: 'chg-1', confirm: true });
    expect(undo.success).toBe(true);
    expect(typeof cell(h.items, 'a')).toBe('string');
    expect(cell(h.items, 'a')).toBe('2026-10-01');
  });
});

describe('#728 AC3: a stray date cell reads as its Denver calendar date', () => {
  for (const day of ['2026-11-01', '2026-03-08', '2026-07-04', '2026-01-15']) {
    it('reads ' + day + ' through getItems and getItem', () => {
      const h = harness([itemRow('d', { due_date: dateCell(day) })]);
      expect(h.sandbox.getItem('d').due_date).toBe(day);
      expect(h.get({}).data[0].due_date).toBe(day);
    });
  }
});

describe('#728 AC4: due_before / due_after across mixed cell types', () => {
  const mixed = () =>
    harness([
      itemRow('text-in', { due_date: '2026-11-01', sort_order: 1 }),
      itemRow('date-in', { due_date: dateCell('2026-11-01'), sort_order: 2 }),
      itemRow('date-edge', { due_date: dateCell('2026-11-04'), sort_order: 3 }),
      itemRow('text-out', { due_date: '2026-11-05', sort_order: 4 }),
      itemRow('date-out', { due_date: dateCell('2026-11-05'), sort_order: 5 }),
      itemRow('date-early', { due_date: dateCell('2026-03-08'), sort_order: 6 }),
      itemRow('text-early', { due_date: '2026-03-08', sort_order: 7 }),
      itemRow('none', { sort_order: 8 }),
      itemRow('done', { status: 'Done', due_date: dateCell('2026-11-01'), sort_order: 9 }),
    ]);
  const ids = (d: any[]) => d.map((i) => i.id);

  it('due_before returns every To Do item due on or before, whatever its cell type', () => {
    expect(ids(mixed().get({ due_before: '2026-11-04', status: 'To Do' }).data)).toEqual([
      'text-in', 'date-in', 'date-edge', 'date-early', 'text-early',
    ]);
  });

  it('due_after excludes earlier items of either type', () => {
    expect(ids(mixed().get({ due_after: '2026-11-01', status: 'To Do' }).data)).toEqual([
      'text-in', 'date-in', 'date-edge', 'text-out', 'date-out',
    ]);
  });
});

describe('#728 AC5: the regression is caught', () => {
  it('a bare YYYY-MM-DD write reads back as a Date cell, not text', () => {
    const h = harness([itemRow('a')]);
    h.sheet.getRange(2, 1, 1, 14).setValues([itemRow('a', { due_date: '2026-11-01' })]);
    expect(typeof cell(h.items, 'a')).not.toBe('string');
  });

  it('the source leaves no date cell on any Items write path', () => {
    const h = harness([itemRow('p'), itemRow('k', { parent_id: 'p', due_date: '2026-11-01' })]);
    h.call('createItem', { data: { title: 'n', due_date: '2026-11-02', board_id: 'b1' } });
    h.call('updateItem', { id: 'p', changes: { due_date: '2026-11-03', status: 'Done' } });
    for (const row of h.items) expect(isDate(row[DUE])).toBe(false);
  });
});

describe('#728 AC6: migrateDueDatesToText', () => {
  const rows = () => [
    itemRow('d1', { due_date: dateCell('2026-11-01'), title: 'T1' }),
    itemRow('t1', { due_date: '2026-11-02' }),
    itemRow('e1'),
    itemRow('d2', { due_date: dateCell('2026-03-08'), description: 'keep' }),
  ];

  it('with no argument changes nothing and lists the date-cell rows', () => {
    const h = harness(rows());
    const before = JSON.stringify(h.items);
    const out = h.sandbox.migrateDueDatesToText();
    expect(out.dry_run).toBe(true);
    expect(out.count).toBe(2);
    expect(out.rows).toEqual([
      { id: 'd1', due_date: '2026-11-01' },
      { id: 'd2', due_date: '2026-03-08' },
    ]);
    expect(JSON.stringify(h.items)).toBe(before);
  });

  it('with true rewrites exactly those cells as text and nothing else', () => {
    const h = harness(rows());
    const others = h.items.map((r) => r.filter((_, c) => c !== DUE).map(String));
    const out = h.sandbox.migrateDueDatesToText(true);
    expect(out.dry_run).toBe(false);
    expect(out.count).toBe(2);
    expect(h.items.map((r) => r[DUE])).toEqual(['2026-11-01', '2026-11-02', '', '2026-03-08']);
    expect(h.items.map((r) => r.filter((_, c) => c !== DUE).map(String))).toEqual(others);
  });

  it('a second run finds nothing to change', () => {
    const h = harness(rows());
    h.sandbox.migrateDueDatesToText(true);
    const again = h.sandbox.migrateDueDatesToText(true);
    expect(again.count).toBe(0);
    expect(again.rows).toEqual([]);
  });

  it('writes no Audit Log row', () => {
    const h = harness(rows());
    h.sandbox.migrateDueDatesToText(true);
    expect(h.audit).toHaveLength(0);
  });
});

describe('#728 AC7: no due date still reads as an empty string', () => {
  it('reads an empty due-date cell as ""', () => {
    const h = harness([itemRow('n')]);
    expect(h.sandbox.getItem('n').due_date).toBe('');
    expect(h.get({}).data[0].due_date).toBe('');
  });
});
