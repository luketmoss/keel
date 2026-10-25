import { describe, it, expect } from 'vitest';
import { loadAuthPath, callDoGet, type CellValue, type Sandbox } from './apps-script-sandbox';

// Moving an item between boards through updateItem: the status is judged
// against the board it lands on, and its sub-tasks go with it.

const API_KEY = 'test-key';

function itemRow(id: string, boardId: string, status: string, parentId = ''): CellValue[] {
  return [id, 'Item ' + id, '', status, '', '', '', parentId, '', '', '', 0, '', boardId];
}

function statusRow(id: string, boardId: string, name: string, isTerminal = false): CellValue[] {
  return [id, boardId, name, 0, '', isTerminal, ''];
}

function load(): Sandbox {
  return loadAuthPath({
    boardRows: [
      ['work', 'Work', '', '', '', ''],
      ['shop', 'Shop', '', '', '', ''],
    ],
    itemRows: [
      itemRow('p1', 'work', 'To Do'),
      itemRow('c1', 'work', 'To Do', 'p1'),
      itemRow('q1', 'work', 'Doing'),
    ],
    statusRows: [
      statusRow('w1', 'work', 'To Do'),
      statusRow('w2', 'work', 'Doing'),
      statusRow('w3', 'work', 'Done', true),
      statusRow('s1', 'shop', 'To Do'),
      statusRow('s2', 'shop', 'Done', true),
      statusRow('s3', 'shop', 'Bought'),
    ],
    properties: { MCP_API_KEY: API_KEY },
  });
}

function rows(sandbox: Sandbox): CellValue[][] {
  return sandbox.SpreadsheetApp.openById('sheet-id').getSheetByName('Items').rows;
}

function update(sandbox: Sandbox, id: string, changes: object) {
  return callDoGet<unknown>(sandbox, {
    key: API_KEY,
    action: 'updateItem',
    payload: JSON.stringify({ id, changes }),
  });
}

describe('moving an item to another board', () => {
  it('changes its board and takes its sub-tasks along', () => {
    const sandbox = load();
    expect(update(sandbox, 'p1', { board_id: 'shop' }).success).toBe(true);
    const byId = Object.fromEntries(rows(sandbox).map((r) => [r[0], r]));
    expect(byId.p1[13]).toBe('shop');
    expect(byId.c1[13]).toBe('shop');
    expect(byId.q1[13]).toBe('work');
  });

  it('refuses when the status does not exist on the target board', () => {
    const sandbox = load();
    const res = update(sandbox, 'q1', { board_id: 'shop' });
    expect(res).toMatchObject({ success: false });
    expect((res as { error: string }).error).toContain('does not exist on the target board');
    expect(rows(sandbox).find((r) => r[0] === 'q1')![13]).toBe('work');
  });

  it('accepts a status that exists only on the target board, moving in one call', () => {
    const sandbox = load();
    expect(update(sandbox, 'q1', { board_id: 'shop', status: 'Bought' }).success).toBe(true);
    const q1 = rows(sandbox).find((r) => r[0] === 'q1')!;
    expect(q1[13]).toBe('shop');
    expect(q1[3]).toBe('Bought');
  });

  it('refuses to move a sub-task on its own', () => {
    const sandbox = load();
    const res = update(sandbox, 'c1', { board_id: 'shop' });
    expect(res).toMatchObject({ success: false });
    expect((res as { error: string }).error).toContain('moves with its parent');
  });
});
