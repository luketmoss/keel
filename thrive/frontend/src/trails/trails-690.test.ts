// #690: the like-for-like rule's two new conditions, the source's classes, the
// notes' wording, and the demo encoder. Pure.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { isLikeForLike, LIKE_FOR_LIKE_LENGTH_RATIO } from './compare';
import { buildTrailIndex } from './groups';
import { searchNote, trailScreenNote, notFoundNote } from './notes';
import { readTrailSource, type TrailWorkout } from './source';
import type { TrailPass } from './types';
import { parseTrailsCell } from '../api/trails-cell';
import { encodeTrailsCell } from '../api/demo-trails';

const here = dirname(fileURLToPath(import.meta.url));

function p(trail: string, startPct: number, endPct: number, metres: number | null): TrailPass {
  return {
    trail,
    metres,
    durationS: 100,
    climbM: 10,
    startPct,
    endPct,
    direction: endPct >= startPct ? 'forward' : 'reverse',
    entryOffsetS: 0,
  };
}

describe('like-for-like: same name as written, and a similar length', () => {
  it('exposes the ratio as a constant', () => {
    expect(LIKE_FOR_LIKE_LENGTH_RATIO).toBe(0.25);
  });

  const cases: [string, TrailPass, TrailPass, boolean][] = [
    ['same name, 3210 m and 3204 m', p('Juniper Ridge', 0, 100, 3210), p('Juniper Ridge', 0, 100, 3204), true],
    [
      'Juniper Ridge against Juniper Ridge Trail',
      p('Juniper Ridge', 0, 100, 3210),
      p('Juniper Ridge Trail', 0, 100, 3205),
      false,
    ],
    [
      'a connector against the other connector',
      p('Aspen Draw;Kestrel Connector', 0, 100, 164),
      p('Kestrel Connector', 0, 100, 3000),
      false,
    ],
    [
      '40 to 60% at 640 m against 30 to 70% at 1280 m',
      p('Juniper Ridge', 40, 60, 640),
      p('Juniper Ridge', 30, 70, 1280),
      false,
    ],
    ['750 m against 1000 m, exactly 25%', p('A', 0, 100, 750), p('A', 0, 100, 1000), true],
    ['749 m against 1000 m', p('A', 0, 100, 749), p('A', 0, 100, 1000), false],
    ['0 m against 0 m', p('A', 0, 100, 0), p('A', 0, 100, 0), true],
    ['unknown metres on one side', p('A', 0, 100, null), p('A', 0, 100, 1000), false],
    ['unknown metres on both', p('A', 0, 100, null), p('A', 0, 100, null), false],
    ['case and spacing count', p('Juniper ridge', 0, 100, 100), p('Juniper Ridge', 0, 100, 100), false],
    ['the first three rules still hold: direction', p('A', 0, 100, 100), p('A', 100, 0, 100), false],
    ['the first three rules still hold: 10 points', p('A', 0, 100, 100), p('A', 11, 100, 100), false],
  ];
  for (const [name, a, b, expected] of cases) {
    it(`${name}: ${expected ? 'yes' : 'no'}`, () => {
      expect(isLikeForLike(a, b)).toBe(expected);
      expect(isLikeForLike(b, a)).toBe(expected);
    });
  }
});

const w = (id: string, trails: string, track_ref = 'ref', date = '2025-01-01'): TrailWorkout => ({
  id,
  date,
  time: '07:00',
  track_ref,
  trails,
});

const tagged = encodeTrailsCell({ passes: [p('Juniper Ridge', 0, 100, 3000)], unmatchedM: 10 });
const taggedNone = '{"v":1,"m":1,"u":5,"n":[],"p":[]}';

describe('readTrailSource: one test per class', () => {
  it('a blank cell with a track is not tagged, and counted', () => {
    const s = readTrailSource([w('a', '')]);
    expect(s.byId.get('a')).toEqual({ status: 'untagged' });
    expect(s.untagged).toEqual([{ id: 'a', date: '2025-01-01', time: '07:00' }]);
  });

  it('a blank cell with no track is neither tagged nor counted', () => {
    const s = readTrailSource([w('a', '', '')]);
    expect(s.byId.has('a')).toBe(false);
    expect(s.untagged).toEqual([]);
    expect(s.activities).toEqual([]);
  });

  it('a valid value with passes is tagged', () => {
    const s = readTrailSource([w('a', tagged)]);
    expect(s.byId.get('a')).toEqual({ status: 'tagged', omitted: 0 });
    expect(s.activities).toHaveLength(1);
    expect(s.activities[0].passes).toHaveLength(1);
  });

  it('a valid value with n: [] is tagged with no trail, and not counted', () => {
    const s = readTrailSource([w('a', taggedNone)]);
    expect(s.byId.get('a')).toEqual({ status: 'tagged', omitted: 0 });
    expect(s.untagged).toEqual([]);
    expect(s.unreadable).toBe(0);
    expect(buildTrailIndex(s.activities).byActivity.has('a')).toBe(false);
  });

  it('anything else is unreadable, left out and counted, and the others are read as normal', () => {
    const s = readTrailSource([w('a', '{"v":2}'), w('b', 'not json'), w('c', tagged)]);
    expect(s.unreadable).toBe(2);
    expect(s.byId.get('a')).toEqual({ status: 'unreadable' });
    expect(s.activities.map((x) => x.id)).toEqual(['c']);
  });

  it('carries the omitted count', () => {
    const cell = encodeTrailsCell({ passes: [p('Juniper Ridge', 0, 100, 3000)], unmatchedM: 0, omitted: 3 });
    expect(readTrailSource([w('a', cell)]).byId.get('a')).toEqual({ status: 'tagged', omitted: 3 });
  });

  it('skips a pass whose name splits to nothing without an error', () => {
    const cell = encodeTrailsCell({ passes: [p(';', 0, 100, 100), p('Juniper Ridge', 0, 100, 3000)], unmatchedM: 0 });
    const index = buildTrailIndex(readTrailSource([w('a', cell)]).activities);
    expect([...index.groups.keys()]).toEqual(['juniper ridge']);
  });
});

describe('the notes', () => {
  it('search: the table, row by row', () => {
    expect(searchNote(0, 0)).toBeNull();
    expect(searchNote(1, 0)).toBe("1 activity not tagged yet. Its trails aren't listed.");
    expect(searchNote(12, 0)).toBe("12 activities not tagged yet. Their trails aren't listed.");
    expect(searchNote(0, 1)).toBe("1 activity's trails couldn't be read.");
    expect(searchNote(0, 3)).toBe("3 activities' trails couldn't be read.");
    expect(searchNote(12, 1)).toBe(
      "12 activities not tagged yet. Their trails aren't listed. 1 activity's trails couldn't be read.",
    );
  });

  const at = (id: string, date: string) => ({ id, date, time: '07:00' });
  const last = at('last', '2025-01-10');

  it('trail screen: newer wins over older, never both', () => {
    expect(trailScreenNote([at('n', '2025-01-11'), at('o', '2025-01-01')], 0, last)).toBe(
      '1 newer activity not tagged yet, so this may not be the last time.',
    );
    expect(trailScreenNote([at('n', '2025-01-11'), at('m', '2025-01-12')], 0, last)).toBe(
      '2 newer activities not tagged yet, so this may not be the last time.',
    );
  });

  it('trail screen: older ones, singular and plural, and nothing', () => {
    expect(trailScreenNote([at('o', '2025-01-01')], 0, last)).toBe(
      '1 activity not tagged yet. It may have been on this trail.',
    );
    expect(trailScreenNote([at('o', '2025-01-01'), at('p', '2025-01-02')], 0, last)).toBe(
      '2 activities not tagged yet. They may have been on this trail.',
    );
    expect(trailScreenNote([], 0, last)).toBeNull();
  });

  it('trail screen: the unreadable sentence follows either form', () => {
    expect(trailScreenNote([at('o', '2025-01-01')], 2, last)).toBe(
      "1 activity not tagged yet. It may have been on this trail. 2 activities' trails couldn't be read.",
    );
    expect(trailScreenNote([], 1, last)).toBe("1 activity's trails couldn't be read.");
  });

  it('not found: the untagged sentence, with the unreadable one appended', () => {
    expect(notFoundNote(0, 0)).toBeNull();
    expect(notFoundNote(1, 0)).toBe('1 activity not tagged yet, so it may be in there.');
    expect(notFoundNote(12, 1)).toBe(
      "12 activities not tagged yet, so it may be in one of them. 1 activity's trails couldn't be read.",
    );
  });
});

describe("the demo's encoder", () => {
  it("writes #688's committed example byte for byte", () => {
    const golden = readFileSync(resolve(here, '../../../sync/test/fixtures/trails-688-golden.txt'), 'utf-8').trim();
    const decoded = parseTrailsCell(golden);
    if (decoded.status !== 'tagged') throw new Error('golden is tagged');
    const lengths = { 'Heron Ridge Trail': 1000, 'Aspen Draw;Kestrel Connector': 150, 'Lower Heron': 380 };
    expect(encodeTrailsCell({ passes: decoded.passes, unmatchedM: decoded.unmatchedM }, lengths)).toBe(golden);
  });

  it('round-trips through the decoder, with x last', () => {
    const passes = [p('Juniper Ridge', 0, 100, 3000), p('Lower Juniper', 100, 20, 900)];
    const cell = encodeTrailsCell({ passes, unmatchedM: 42, omitted: 2 });
    expect(cell.endsWith(',"x":2}')).toBe(true);
    expect(parseTrailsCell(cell)).toMatchObject({ status: 'tagged', unmatchedM: 42, omitted: 2, passes });
  });

  it('the trail rules and the state import nothing from the demo', () => {
    for (const f of ['source.ts', 'notes.ts', 'compare.ts', 'groups.ts', '../state/trails.ts']) {
      expect(readFileSync(resolve(here, f), 'utf-8'), f).not.toMatch(/demo-trails/);
    }
  });
});
