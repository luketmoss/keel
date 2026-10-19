import { describe, it, expect } from 'vitest';
import {
  loadSources,
  makeWritableSheet,
  makeUtilities,
  type CellValue,
  type Sandbox,
} from './apps-script-sandbox';

// #458 (explicit completed_at on updateItem; harness copied from
// items-completion-audit.test.ts). Original header: #239 AC1/AC2, Apps Script side — `updateItem` must emit a `completed` or
// `reopened` audit row alongside the existing `status_changed` row, for the
// item and for every child cascaded by #162.
//
// Driven through the real `items.js` + `rules.js` + `audit.js` sources in the
// sandbox (#243). The one seam is `getSpreadsheet`, so `getSheet` and
// `getStatuses` both resolve through the same fake spreadsheet.

interface AuditRow {
  timestamp: string;
  item_id: string;
  action: string;
  field: string;
  old_value: string;
  new_value: string;
  actor: string;
}

function itemRow(fields: {
  id: string;
  status?: string;
  parent_id?: string;
  completed_at?: string;
  board_id?: string;
}): CellValue[] {
  return [
    fields.id,
    'Item ' + fields.id,
    '', // description
    fields.status ?? 'To Do',
    '', // owner
    '', // due_date
    '', // labels
    fields.parent_id ?? '',
    '', // created_at
    '', // updated_at
    fields.completed_at ?? '',
    1, // sort_order
    '', // created_by
    fields.board_id ?? 'board-1',
  ];
}

function statusRow(name: string, sortOrder: number, isTerminal: boolean): CellValue[] {
  return ['st-' + name, 'board-1', name, sortOrder, '#ccc', isTerminal, ''];
}

// Two terminal columns on one board, so "terminal to terminal" is expressible.
const STATUS_ROWS = [
  statusRow('To Do', 1, false),
  statusRow('In Progress', 2, false),
  statusRow('Done', 3, true),
  statusRow('Shipped', 4, true),
];

interface Harness {
  sandbox: Sandbox;
  /** The Audit Log as appended, in order — read after the call under test. */
  readonly audit: AuditRow[];
  /** The live Items rows, so a test can assert what was persisted. */
  itemRows: CellValue[][];
}

function harness(rows: CellValue[][]): Harness {
  const sandbox = loadSources(
    ['types.js', 'utils.js', 'rules.js', 'boards.js', 'audit.js', 'statuses.js', 'items.js'],
    { Utilities: makeUtilities(), Date: globalThis.Date },
  );

  const itemRows = rows.map((r) => [...r]);
  const items = makeWritableSheet(itemRows, sandbox.ITEM_COLUMN_COUNT);
  const auditRows: CellValue[][] = [];
  const auditSheet = makeWritableSheet(auditRows, sandbox.AUDIT_COLUMN_COUNT);
  const statuses = makeWritableSheet(STATUS_ROWS.map((r) => [...r]), sandbox.STATUS_COLUMN_COUNT);

  const sheets: Record<string, unknown> = {
    Items: items,
    'Audit Log': auditSheet,
    Statuses: statuses,
  };
  sandbox.getSpreadsheet = () => ({
    getSheetByName: (name: string) => sheets[name] ?? null,
  });

  return {
    sandbox,
    itemRows,
    // A live view over the append-only rows, in append order.
    get audit(): AuditRow[] {
      return auditRows.map((r) => ({
        timestamp: String(r[0]),
        item_id: String(r[1]),
        action: String(r[2]),
        field: String(r[3]),
        old_value: String(r[4]),
        new_value: String(r[5]),
        actor: String(r[6]),
      }));
    },
  };
}

const DONE_AT = '2026-10-17T09:00:00.000Z';

function snapshot(h: Harness) {
  return JSON.stringify([h.itemRows, h.audit]);
}

describe('#458 AC1: backdate an item already in a terminal column', () => {
  it('stores the normalised date, leaves status, logs one updated row', () => {
    const h = harness([itemRow({ id: 'a', status: 'Done', completed_at: DONE_AT })]);
    const out = h.sandbox.updateItem('a', { completed_at: '2026-10-16' }, 'luke@example.com');
    expect(out.completed_at).toBe('2026-10-16T12:00:00.000Z');
    expect(h.itemRows[0][10]).toBe('2026-10-16T12:00:00.000Z');
    expect(h.itemRows[0][3]).toBe('Done');
    expect(h.audit).toHaveLength(1);
    expect(h.audit[0]).toMatchObject({
      item_id: 'a', action: 'updated', field: 'completed_at',
      old_value: DONE_AT, new_value: '2026-10-16T12:00:00.000Z', actor: 'luke@example.com',
    });
    expect(Date.parse(String(h.itemRows[0][9]))).toBeGreaterThan(Date.now() - 60_000);
  });

  it('stores a zoned timestamp as its UTC instant', () => {
    const h = harness([itemRow({ id: 'a', status: 'Done', completed_at: DONE_AT })]);
    h.sandbox.updateItem('a', { completed_at: '2026-10-16T18:30:00+01:00' }, 'api');
    expect(h.itemRows[0][10]).toBe('2026-10-16T17:30:00.000Z');
  });
});

describe('#458 AC2: an explicit value wins over the automatic stamp on a move', () => {
  it('stores the explicit value, logs status_changed, completed and one updated row', () => {
    const h = harness([itemRow({ id: 'a', status: 'In Progress' })]);
    h.sandbox.updateItem('a', { status: 'Done', completed_at: '2026-10-15T08:00:00Z' }, 'api');
    expect(h.itemRows[0][10]).toBe('2026-10-15T08:00:00.000Z');
    expect(h.audit.map((e) => [e.action, e.field])).toEqual([
      ['status_changed', 'status'], ['completed', 'status'], ['updated', 'completed_at'],
    ]);
    expect(h.audit[2]).toMatchObject({ old_value: '', new_value: '2026-10-15T08:00:00.000Z' });
  });

  it('still stamps now when the same move carries no completed_at', () => {
    const h = harness([itemRow({ id: 'a', status: 'In Progress' })]);
    h.sandbox.updateItem('a', { status: 'Done' }, 'api');
    expect(Date.parse(String(h.itemRows[0][10]))).toBeGreaterThan(Date.now() - 60_000);
    expect(h.audit.map((e) => e.action)).toEqual(['status_changed', 'completed']);
  });
});

describe('#458 AC3: refused when the item would not be in a terminal column', () => {
  it.each([
    ['already in a non-terminal column', { id: 'a', status: 'To Do' }, { completed_at: '2026-10-16' }],
    ['moving to a non-terminal column', { id: 'a', status: 'Done', completed_at: DONE_AT }, { status: 'To Do', completed_at: '2026-10-16' }],
    ['a board with no Statuses rows', { id: 'a', status: 'Done', completed_at: DONE_AT, board_id: 'no-statuses' }, { completed_at: '2026-10-16' }],
  ])('%s writes nothing, even with other changes', (_n, row, changes) => {
    const h = harness([itemRow(row)]);
    const before = snapshot(h);
    expect(() => h.sandbox.updateItem('a', { ...changes, title: 'Renamed' }, 'api')).toThrow(
      'completed_at can only be set on an item in a terminal column',
    );
    expect(snapshot(h)).toBe(before);
  });
});

describe('#458 AC4: bad values are refused without a write', () => {
  const bad: unknown[] = ['', null, 'yesterday', '2026-02-30', '2026-10-16T10:00:00', 123,
    new Date(Date.now() + 3 * 86_400_000).toISOString()];
  it.each(bad.map((v) => [String(v), v]))('refuses %s', (_n, value) => {
    const h = harness([itemRow({ id: 'a', status: 'Done', completed_at: DONE_AT })]);
    const before = snapshot(h);
    expect(() => h.sandbox.updateItem('a', { completed_at: value, title: 'Renamed' }, 'api')).toThrow(/completed_at/);
    expect(snapshot(h)).toBe(before);
  });

  it('accepts a value under 24 hours ahead', () => {
    const h = harness([itemRow({ id: 'a', status: 'Done', completed_at: DONE_AT })]);
    const soon = new Date(Date.now() + 3_600_000).toISOString();
    h.sandbox.updateItem('a', { completed_at: soon }, 'api');
    expect(h.itemRows[0][10]).toBe(soon);
  });

  it('has no lower bound: before created_at is fine', () => {
    const h = harness([itemRow({ id: 'a', status: 'Done', completed_at: DONE_AT })]);
    h.sandbox.updateItem('a', { completed_at: '2001-01-01' }, 'api');
    expect(h.itemRows[0][10]).toBe('2001-01-01T12:00:00.000Z');
  });
});

describe('#458 AC5: a no-op is not logged, and the cascade is untouched', () => {
  it('writes no completed_at row when the value is already there, but updated_at advances', () => {
    const h = harness([itemRow({ id: 'a', status: 'Done', completed_at: '2026-10-16T12:00:00.000Z' })]);
    h.sandbox.updateItem('a', { completed_at: '2026-10-16' }, 'api');
    expect(h.audit).toEqual([]);
    expect(h.itemRows[0][10]).toBe('2026-10-16T12:00:00.000Z');
    expect(Date.parse(String(h.itemRows[0][9]))).toBeGreaterThan(Date.now() - 60_000);
  });

  it('applies the explicit value to the parent only; children get now', () => {
    const h = harness([
      itemRow({ id: 'p', status: 'In Progress' }),
      itemRow({ id: 'c', status: 'To Do', parent_id: 'p' }),
    ]);
    h.sandbox.updateItem('p', { status: 'Done', completed_at: '2026-10-15' }, 'api');
    expect(h.itemRows[0][10]).toBe('2026-10-15T12:00:00.000Z');
    expect(Date.parse(String(h.itemRows[1][10]))).toBeGreaterThan(Date.now() - 60_000);
    expect(h.itemRows[1][10]).not.toBe('2026-10-15T12:00:00.000Z');
  });
});
