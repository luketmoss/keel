import { describe, it, expect } from 'vitest';
import {
  NO_FILTER,
  filterCompleted,
  formatCompletedDate,
  groupByMonth,
  isFilterOn,
  isRangeInverted,
  labelsUsed,
  type CompletedFilter,
} from './completed-filter';
import type { ItemWithRow } from '../api/types';

// Wed 14 Oct 2026, local noon.
const TODAY = new Date(2026, 9, 14, 12, 0, 0);

/** Local noon of a calendar date, as the ISO string the sheet stores. */
function at(y: number, m: number, d: number, h = 12): string {
  return new Date(y, m - 1, d, h, 0, 0).toISOString();
}

function item(id: string, overrides: Partial<ItemWithRow> = {}): ItemWithRow {
  return {
    id,
    title: id,
    description: '',
    status: 'Done',
    owner: '',
    due_date: '',
    labels: '',
    parent_id: '',
    created_at: '',
    updated_at: '',
    completed_at: at(2026, 10, 1),
    sort_order: 1,
    created_by: '',
    board_id: '',
    sheetRow: 2,
    ...overrides,
  };
}

const f = (over: Partial<CompletedFilter>): CompletedFilter => ({ ...NO_FILTER, ...over });
const ids = (xs: ItemWithRow[]) => xs.map((x) => x.id);

describe('filterCompleted: search', () => {
  const items = [
    item('a', { title: 'File taxes' }),
    item('b', { title: 'Book dentist', description: 'Ask about the FILE from last visit' }),
    item('c', { title: 'Water plants' }),
  ];

  it('matches the title, case-insensitively', () => {
    expect(ids(filterCompleted(items, f({ text: 'TAXES' }), TODAY))).toEqual(['a']);
  });

  it('matches the description too', () => {
    expect(ids(filterCompleted(items, f({ text: 'file' }), TODAY)).sort()).toEqual(['a', 'b']);
  });

  it('ignores surrounding spaces, and blank text filters nothing', () => {
    expect(ids(filterCompleted(items, f({ text: '  taxes ' }), TODAY))).toEqual(['a']);
    expect(filterCompleted(items, f({ text: '   ' }), TODAY)).toHaveLength(3);
  });
});

describe('filterCompleted: date presets, as local calendar dates', () => {
  // Today is 14 Oct. Last 7 days is 8..14 Oct; Last 30 days is 15 Sep..14 Oct.
  const run = (range: '7d' | '30d' | 'year', y: number, m: number, d: number, h = 12) =>
    filterCompleted([item('x', { completed_at: at(y, m, d, h) })], f({ range }), TODAY).length === 1;

  it('Last 7 days keeps today and the six before it', () => {
    expect(run('7d', 2026, 10, 14)).toBe(true);
    expect(run('7d', 2026, 10, 8)).toBe(true);
    expect(run('7d', 2026, 10, 7)).toBe(false);
  });

  it('judges a late-evening and a just-after-midnight completion by their local date', () => {
    expect(run('7d', 2026, 10, 8, 0)).toBe(true);
    expect(run('7d', 2026, 10, 7, 23)).toBe(false);
  });

  it('Last 30 days keeps today and the 29 before it', () => {
    expect(run('30d', 2026, 9, 15)).toBe(true);
    expect(run('30d', 2026, 9, 14)).toBe(false);
  });

  it('This year keeps 1 January onwards', () => {
    expect(run('year', 2026, 1, 1, 0)).toBe(true);
    expect(run('year', 2025, 12, 31, 23)).toBe(false);
  });

  it('an item with no completed date passes Any time and fails the other chips', () => {
    const undated = [item('u', { completed_at: '' })];
    expect(filterCompleted(undated, NO_FILTER, TODAY)).toHaveLength(1);
    for (const range of ['7d', '30d', 'year'] as const) {
      expect(filterCompleted(undated, f({ range }), TODAY)).toHaveLength(0);
    }
  });
});

describe('filterCompleted: custom range', () => {
  const items = [
    item('sep', { completed_at: at(2026, 9, 30) }),
    item('oct1', { completed_at: at(2026, 10, 1) }),
    item('oct10', { completed_at: at(2026, 10, 10) }),
    item('none', { completed_at: '' }),
  ];
  const run = (from: string, to: string) => ids(filterCompleted(items, f({ range: 'custom', from, to }), TODAY));

  it('From alone is on or after, inclusive', () => {
    expect(run('2026-10-01', '')).toEqual(['oct10', 'oct1']);
  });

  it('To alone is on or before, inclusive', () => {
    expect(run('', '2026-10-01')).toEqual(['oct1', 'sep']);
  });

  it('both bounds are inclusive', () => {
    expect(run('2026-10-01', '2026-10-01')).toEqual(['oct1']);
  });

  it('both blank filters nothing, undated items included', () => {
    expect(run('', '')).toHaveLength(4);
  });

  it('an undated item fails any bound', () => {
    expect(run('2020-01-01', '')).not.toContain('none');
  });

  it('To before From is ignored, so nothing is filtered by date', () => {
    expect(isRangeInverted({ range: 'custom', from: '2026-10-10', to: '2026-10-01' })).toBe(true);
    expect(run('2026-10-10', '2026-10-01')).toHaveLength(4);
  });

  it('an inverted range still lets search apply', () => {
    const out = filterCompleted(
      items,
      f({ range: 'custom', from: '2026-10-10', to: '2026-10-01', text: 'oct1' }),
      TODAY,
    );
    expect(ids(out).sort()).toEqual(['oct1', 'oct10']);
  });

  it('From and To are not an inversion for other chips', () => {
    expect(isRangeInverted({ range: '7d', from: '2026-10-10', to: '2026-10-01' })).toBe(false);
  });
});

describe('filterCompleted: label and combinations', () => {
  const items = [
    item('a', { labels: 'Errands, Home', completed_at: at(2026, 10, 12) }),
    item('b', { labels: 'Home', completed_at: at(2026, 10, 13) }),
    item('c', { labels: 'Errands', completed_at: at(2026, 6, 1), title: 'Post office' }),
  ];

  it('keeps items carrying the label', () => {
    expect(ids(filterCompleted(items, f({ label: 'Errands' }), TODAY))).toEqual(['a', 'c']);
  });

  it('does not match a label by prefix', () => {
    expect(filterCompleted(items, f({ label: 'Err' }), TODAY)).toHaveLength(0);
  });

  it('combines search, date and label with AND', () => {
    expect(ids(filterCompleted(items, f({ label: 'Errands', range: '30d' }), TODAY))).toEqual(['a']);
    expect(ids(filterCompleted(items, f({ label: 'Errands', range: 'year', text: 'post' }), TODAY))).toEqual(['c']);
    expect(filterCompleted(items, f({ label: 'Home', text: 'post' }), TODAY)).toHaveLength(0);
  });

  it('sorts newest first', () => {
    expect(ids(filterCompleted(items, NO_FILTER, TODAY))).toEqual(['b', 'a', 'c']);
  });
});

describe('isFilterOn', () => {
  it('is off for the defaults and for blank text', () => {
    expect(isFilterOn(NO_FILTER)).toBe(false);
    expect(isFilterOn(f({ text: '  ' }))).toBe(false);
  });

  it('is on for text, a date chip or a label', () => {
    expect(isFilterOn(f({ text: 'x' }))).toBe(true);
    expect(isFilterOn(f({ range: 'custom' }))).toBe(true);
    expect(isFilterOn(f({ label: 'Home' }))).toBe(true);
  });
});

describe('groupByMonth', () => {
  it('groups by local month, newest first, with the undated last', () => {
    const sorted = filterCompleted(
      [
        item('u', { completed_at: '' }),
        item('sep', { completed_at: at(2026, 9, 30, 23) }),
        item('oct-a', { completed_at: at(2026, 10, 14) }),
        item('oct-b', { completed_at: at(2026, 10, 2) }),
        item('old', { completed_at: at(2025, 10, 3) }),
      ],
      NO_FILTER,
      TODAY,
    );
    const groups = groupByMonth(sorted);
    expect(groups.map((g) => g.heading)).toEqual([
      'October 2026',
      'September 2026',
      'October 2025',
      'No completion date',
    ]);
    expect(ids(groups[0].items)).toEqual(['oct-a', 'oct-b']);
  });
});

describe('formatCompletedDate', () => {
  it('omits the year inside the current year and shows it outside', () => {
    expect(formatCompletedDate(at(2026, 10, 14), TODAY)).toBe('Oct 14');
    expect(formatCompletedDate(at(2025, 10, 14), TODAY)).toBe('Oct 14, 2025');
  });

  it('is empty without a date', () => {
    expect(formatCompletedDate('', TODAY)).toBe('');
  });
});

describe('labelsUsed', () => {
  it('follows the board order, then labels the board no longer has', () => {
    const items = [item('a', { labels: 'Zed, Gone' }), item('b', { labels: 'Alpha' }), item('c', { labels: '' })];
    expect(labelsUsed(items, ['Alpha', 'Unused', 'Zed'])).toEqual(['Alpha', 'Zed', 'Gone']);
  });

  it('is empty when no item has a label', () => {
    expect(labelsUsed([item('a')], ['Alpha'])).toEqual([]);
  });
});
