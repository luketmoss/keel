// #691: the app's trail rules against the golden fixture the MCP Worker's copy
// also reads (mcp/test/fixtures/trails-rules-golden.json). A rule change edits
// the fixture, and whichever side has not followed fails. Pure.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parseTrailsCell } from '../api/trails-cell';
import { compareWithEarlier, isLikeForLike } from './compare';
import { buildTrailIndex, splitTrailName, trailKey } from './groups';
import type { TrailActivity, TrailPass } from './types';

const here = dirname(fileURLToPath(import.meta.url));

interface Golden {
  example: { cell: string; matcherVersion: number; unmatchedM: number; omitted: number; passes: TrailPass[] };
  names: { name: string; variants: string[]; keys: string[] }[];
  likeForLike: { case: string; a: TrailPass; b: TrailPass; like: boolean }[];
  history: {
    activities: { id: string; date: string; time: string; passes: TrailPass[] }[];
    groups: { key: string; name: string; otherNames: string[]; visits: string[] }[];
    comparisons: {
      group: string;
      activity: string;
      pass: number;
      previous: { activity: string; pass: number } | null;
      timeDiffS?: number | null;
      climbDiffM?: number | null;
    }[];
  };
}

const GOLDEN: Golden = JSON.parse(
  readFileSync(resolve(here, '../../../../mcp/test/fixtures/trails-rules-golden.json'), 'utf-8'),
);

describe("the example cell is #688's", () => {
  it("equals #688's committed example string", () => {
    const committed = readFileSync(resolve(here, '../../../sync/test/fixtures/trails-688-golden.txt'), 'utf-8').trim();
    expect(GOLDEN.example.cell).toBe(committed);
  });

  it('decodes to the passes the fixture lists', () => {
    const { cell, matcherVersion, unmatchedM, omitted, passes } = GOLDEN.example;
    expect(parseTrailsCell(cell)).toEqual({ status: 'tagged', matcherVersion, unmatchedM, omitted, passes });
  });
});

describe('the rules agree with the fixture', () => {
  it('splits names into variants and keys them', () => {
    for (const { name, variants, keys } of GOLDEN.names) {
      expect(splitTrailName(name), name).toEqual(variants);
      expect(variants.map(trailKey), name).toEqual(keys);
    }
  });

  it('decides like-for-like for each pair, both ways round', () => {
    for (const { case: what, a, b, like } of GOLDEN.likeForLike) {
      expect(isLikeForLike(a, b), what).toBe(like);
      expect(isLikeForLike(b, a), `${what} (reversed)`).toBe(like);
    }
  });

  const activities: TrailActivity[] = GOLDEN.history.activities.map((a) => ({ ...a, unmatchedM: 0 }));
  const index = buildTrailIndex(activities);
  const passOf = (id: string, i: number) => activities.find((a) => a.id === id)!.passes[i];

  it('groups the history', () => {
    expect([...index.groups.keys()].sort()).toEqual(GOLDEN.history.groups.map((g) => g.key).sort());
    for (const want of GOLDEN.history.groups) {
      const g = index.groups.get(want.key)!;
      expect(g.name, want.key).toBe(want.name);
      expect(g.otherNames, want.key).toEqual(want.otherNames);
      expect(
        g.visits.map((v) => v.activityId),
        want.key,
      ).toEqual(want.visits);
    }
  });

  it('compares each pass with the pass the fixture names, or none', () => {
    for (const want of GOLDEN.history.comparisons) {
      const what = `${want.group}: ${want.activity} pass ${want.pass}`;
      const group = index.groups.get(want.group)!;
      const gp = group.visits
        .find((v) => v.activityId === want.activity)!
        .passes.find((p) => p.pass === passOf(want.activity, want.pass));
      expect(gp, what).toBeDefined();
      const c = compareWithEarlier(group, gp!);
      if (want.previous === null) {
        expect(c.previous, what).toBeNull();
        continue;
      }
      expect(c.previous?.activityId, what).toBe(want.previous.activity);
      expect(c.previous?.pass, what).toBe(passOf(want.previous.activity, want.previous.pass));
      expect(c.timeDiffS, what).toBe(want.timeDiffS);
      expect(c.climbDiffM, what).toBe(want.climbDiffM);
    }
    const covered = [...index.groups.values()].reduce(
      (n, g) => n + g.visits.reduce((m, v) => m + v.passes.length, 0),
      0,
    );
    expect(GOLDEN.history.comparisons).toHaveLength(covered);
  });
});
