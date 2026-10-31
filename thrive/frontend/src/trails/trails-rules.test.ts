// #682 — the trail rules: name grouping, like-for-like comparison and search.

import { describe, it, expect } from 'vitest';
import { buildTrailIndex, splitTrailName, trailKey, trailPath } from './groups';
import { compareWithEarlier, isLikeForLike } from './compare';
import { searchTrails } from './search';
import type { TrailActivity, TrailPass } from './types';

function p(trail: string, startPct = 0, endPct = 100, over: Partial<TrailPass> = {}): TrailPass {
  return {
    trail,
    metres: 1000,
    durationS: 600,
    climbM: 50,
    startPct,
    endPct,
    direction: endPct >= startPct ? 'forward' : 'reverse',
    entryOffsetS: null,
    ...over,
  };
}

function act(id: string, date: string, passes: TrailPass[], time = '08:00'): TrailActivity {
  return { id, date, time, passes, unmatchedM: 0 };
}

describe('AC4: name variants', () => {
  it('splits on ";" and on " / ", trimming and dropping empty parts', () => {
    expect(splitTrailName('Aspen Draw;Kestrel Connector')).toEqual(['Aspen Draw', 'Kestrel Connector']);
    expect(splitTrailName('Fox Hollow / Kestrel Connector')).toEqual(['Fox Hollow', 'Kestrel Connector']);
    expect(splitTrailName(' A ; ;B ')).toEqual(['A', 'B']);
    expect(splitTrailName('Up/Down')).toEqual(['Up/Down']);
  });

  it('keys lowercase, whitespace collapsed, a trailing " Trail" dropped when something is left', () => {
    expect(trailKey('Heron Loop Trail')).toBe('heron loop');
    expect(trailKey('Heron  Loop')).toBe('heron loop');
    expect(trailKey('Trail')).toBe('trail');
    expect(trailKey('Lower Juniper')).toBe('lower juniper');
    expect(trailPath('heron loop')).toBe('/trail/heron%20loop');
  });

  it('"Heron Loop" and "Heron Loop Trail" are one trail, named by the variant with the most passes', () => {
    const index = buildTrailIndex([
      act('a', '2026-01-01', [p('Heron Loop Trail')]),
      act('b', '2026-01-02', [p('Heron Loop')]),
      act('c', '2026-01-03', [p('Heron Loop')]),
    ]);
    expect([...index.groups.keys()]).toEqual(['heron loop']);
    const g = index.groups.get('heron loop')!;
    expect(g.name).toBe('Heron Loop');
    expect(g.otherNames).toEqual(['Heron Loop Trail']);
    expect(g.visits.map((v) => v.activityId)).toEqual(['a', 'b', 'c']);
  });

  it('a tie goes to the variant on the most recent pass', () => {
    const index = buildTrailIndex([
      act('b', '2026-01-02', [p('Heron Loop Trail')]),
      act('a', '2026-01-01', [p('Heron Loop')]),
    ]);
    expect(index.groups.get('heron loop')!.name).toBe('Heron Loop Trail');
    expect(index.groups.get('heron loop')!.otherNames).toEqual(['Heron Loop']);
  });

  it('a name with ";" and one with " / " each count for both of their trails', () => {
    const index = buildTrailIndex([
      act('a', '2026-01-01', [p('Aspen Draw;Kestrel Connector')]),
      act('b', '2026-01-02', [p('Fox Hollow / Kestrel Connector')]),
    ]);
    expect(index.groups.get('aspen draw')!.visits).toHaveLength(1);
    expect(index.groups.get('fox hollow')!.visits).toHaveLength(1);
    expect(index.groups.get('kestrel connector')!.visits.map((v) => v.activityId)).toEqual(['a', 'b']);
    expect(index.byActivity.get('a')!.map((t) => t.group.key)).toEqual(['aspen draw', 'kestrel connector']);
  });

  it('"Lower Juniper" stays separate from "Juniper Ridge"', () => {
    const index = buildTrailIndex([act('a', '2026-01-01', [p('Lower Juniper'), p('Juniper Ridge')])]);
    expect([...index.groups.keys()].sort()).toEqual(['juniper ridge', 'lower juniper']);
  });

  it('lists each trail once per activity, its passes under it in time order', () => {
    const index = buildTrailIndex([
      act('a', '2026-01-01', [
        p('Juniper Ridge', 0, 100, { entryOffsetS: 900 }),
        p('Heron Loop', 0, 100, { entryOffsetS: 600 }),
        p('Juniper Ridge Trail', 0, 100, { entryOffsetS: 300 }),
      ]),
    ]);
    const trails = index.byActivity.get('a')!;
    expect(trails.map((t) => t.group.key)).toEqual(['juniper ridge', 'heron loop']);
    expect(trails[0].visit.passes.map((gp) => gp.pass.entryOffsetS)).toEqual([300, 900]);
  });
});

describe('AC3: like-for-like', () => {
  const base = p('Juniper Ridge', 20, 80);

  it('compares at exactly 10 points on start and on end, inclusive', () => {
    expect(isLikeForLike(base, p('Juniper Ridge', 30, 90))).toBe(true);
    expect(isLikeForLike(base, p('Juniper Ridge', 10, 70))).toBe(true);
  });

  it('does not compare just past 10 points, on either side', () => {
    expect(isLikeForLike(base, p('Juniper Ridge', 30.5, 80))).toBe(false);
    expect(isLikeForLike(base, p('Juniper Ridge', 9, 80))).toBe(false);
    expect(isLikeForLike(base, p('Juniper Ridge', 20, 91))).toBe(false);
    expect(isLikeForLike(base, p('Juniper Ridge', 20, 69.5))).toBe(false);
  });

  it('does not compare opposite directions over the same stretch', () => {
    expect(isLikeForLike(p('X', 0, 100), { ...p('X', 0, 100), direction: 'reverse' })).toBe(false);
    expect(isLikeForLike(p('X', 0, 100), p('X', 100, 0))).toBe(false);
  });

  it('compares with the last like-for-like pass on the most recent earlier activity that has one', () => {
    const index = buildTrailIndex([
      act('old', '2026-01-01', [p('Juniper Ridge', 0, 100, { durationS: 1000, climbM: 130 })]),
      act('mid', '2026-01-05', [
        p('Juniper Ridge', 0, 100, { durationS: 950, climbM: 134, entryOffsetS: 100 }),
        p('Juniper Ridge', 0, 100, { durationS: 944, climbM: 134, entryOffsetS: 2000 }),
      ]),
      act('partial', '2026-01-07', [p('Juniper Ridge', 40, 100)]),
      act('new', '2026-01-09', [p('Juniper Ridge', 0, 100, { durationS: 872, climbM: 128 })]),
    ]);
    const g = index.groups.get('juniper ridge')!;
    const newest = g.visits[3].passes[0];
    const c = compareWithEarlier(g, newest);
    expect(c.previous?.activityId).toBe('mid');
    expect(c.previous?.pass.durationS).toBe(944);
    expect(c.timeDiffS).toBe(-72);
    expect(c.climbDiffM).toBe(-6);
    // The partial pass has nothing over its stretch before it.
    expect(compareWithEarlier(g, g.visits[2].passes[0]).previous).toBeNull();
  });

  it('never compares laps within one activity with each other', () => {
    const index = buildTrailIndex([act('a', '2026-01-01', [p('Juniper Ridge'), p('Juniper Ridge')])]);
    const g = index.groups.get('juniper ridge')!;
    expect(compareWithEarlier(g, g.visits[0].passes[1]).previous).toBeNull();
  });

  it('orders by date, then time', () => {
    const index = buildTrailIndex([
      act('pm', '2026-01-01', [p('X', 0, 100, { durationS: 500 })], '17:00'),
      act('am', '2026-01-01', [p('X', 0, 100, { durationS: 600 })], '07:00'),
    ]);
    const g = index.groups.get('x')!;
    expect(g.visits.map((v) => v.activityId)).toEqual(['am', 'pm']);
    expect(compareWithEarlier(g, g.visits[1].passes[0]).previous?.activityId).toBe('am');
  });

  it('leaves a difference out when either side is unknown', () => {
    const index = buildTrailIndex([
      act('a', '2026-01-01', [p('X', 0, 100, { climbM: null })]),
      act('b', '2026-01-02', [p('X', 0, 100, { durationS: 590 })]),
    ]);
    const g = index.groups.get('x')!;
    expect(compareWithEarlier(g, g.visits[1].passes[0])).toMatchObject({ timeDiffS: -10, climbDiffM: null });
  });
});

describe('AC5: search', () => {
  const index = buildTrailIndex([
    act('a', '2026-01-01', [p('Juniper Ridge Trail'), p('Heron Loop')]),
    act('b', '2026-03-01', [p('Lower Juniper')]),
    act('c', '2026-02-01', [p('Juniper Ridge')]),
  ]);

  it('matches any variant by substring, ignoring case, newest last time first', () => {
    expect(searchTrails(index.groups.values(), 'juniper')!.map((g) => g.name)).toEqual([
      'Lower Juniper',
      'Juniper Ridge',
    ]);
    expect(searchTrails(index.groups.values(), 'RIDGE TRAIL')!.map((g) => g.key)).toEqual(['juniper ridge']);
    expect(searchTrails(index.groups.values(), '  heron ')!.map((g) => g.key)).toEqual(['heron loop']);
  });

  it('finds nothing for a query no name contains, and is no search when blank', () => {
    expect(searchTrails(index.groups.values(), 'juniper x')).toEqual([]);
    expect(searchTrails(index.groups.values(), '   ')).toBeNull();
  });
});
