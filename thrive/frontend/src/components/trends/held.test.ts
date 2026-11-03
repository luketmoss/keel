// #772 — a held value's cells: in effect from an entry's day until the day before the next.

import { describe, it, expect } from 'vitest';
import { buildHeld, heldRuns, sourceWords, sourceWordsLower, type HeldEntry } from './held';
import { datesBetween } from './series';

const since = (d: string) => `since ${d}`;
const E = (date: string, value: number | null, source = 'ramp_test'): HeldEntry => ({ date, value, source });

describe('buildHeld', () => {
  const dates = datesBetween('2026-10-01', '2026-10-10');

  it('holds an entry from its day until the day before the next, and the last through the end', () => {
    const h = buildHeld([E('2026-10-03', 200), E('2026-10-07', 210, 'manual')], dates, '2026-10-10', since);
    const at = (d: string) => h.cells.get(d);
    expect(at('2026-10-02')).toBeUndefined();
    expect(at('2026-10-03')).toMatchObject({ value: 200, entry: true, since: '2026-10-03' });
    expect(at('2026-10-06')).toMatchObject({ value: 200, entry: false });
    expect(at('2026-10-07')).toMatchObject({ value: 210, entry: true, source: 'manual' });
    expect(at('2026-10-10')).toMatchObject({ value: 210, entry: false, sinceText: 'since 2026-10-07' });
    expect(h.current).toMatchObject({ value: 210, since: '2026-10-07' });
  });

  it('starts at the range start when an earlier entry is still in effect, with no entry day', () => {
    const h = buildHeld([E('2026-09-01', 190), E('2026-10-05', 195)], dates, '2026-10-10', since);
    expect(h.cells.get('2026-10-01')).toMatchObject({ value: 190, entry: false });
    expect(h.entries.map((e) => e.date)).toEqual(['2026-10-05']);
  });

  it('lists the entries in range newest first, and has no cells before the first entry', () => {
    const h = buildHeld([E('2026-10-02', 1), E('2026-10-04', 2), E('2026-10-08', 3)], dates, '2026-10-10', since);
    expect(h.entries.map((e) => e.date)).toEqual(['2026-10-08', '2026-10-04', '2026-10-02']);
    expect(h.cells.has('2026-10-01')).toBe(false);
  });

  it('has no current with no entries', () => {
    expect(buildHeld([], dates, '2026-10-10', since).current).toBeNull();
  });
});

describe('heldRuns', () => {
  const dates = datesBetween('2026-10-01', '2026-10-08');

  it('breaks at an entry with no value and resumes at the next entry that has one', () => {
    const h = buildHeld([E('2026-10-02', 3), E('2026-10-04', null), E('2026-10-06', 4)], dates, '2026-10-08', since);
    const runs = heldRuns(dates, h.cells);
    expect(runs.map((r) => [r[0].date, r[r.length - 1].date])).toEqual([
      ['2026-10-02', '2026-10-03'],
      ['2026-10-06', '2026-10-08'],
    ]);
  });
});

describe('source words', () => {
  it('writes a ramp test as one, and anything else as set by hand', () => {
    expect(sourceWords('ramp_test')).toBe('Ramp test');
    expect(sourceWords('manual')).toBe('Set by hand');
    expect(sourceWords('anything')).toBe('Set by hand');
    expect(sourceWordsLower('ramp_test')).toBe('ramp test');
  });
});
