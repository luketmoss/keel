// Workouts!AD `trails` (#688) decoded into #682's trail shapes. Pure, and it
// never throws: the cell is the sync's to write, and a value the app cannot
// read is a state to show, not an error.
//
// Three states. Blank is "not tagged yet", never "no trails": the sync or the
// backfill (#689) has not looked, or its last try failed. A tagged value with
// no passes is "no named trail". Anything else is unreadable.
//
// The format is #688's: `{"v":1,"m":<matcher>,"u":<metres>,"n":[[name,lengthM],…],
// "p":[[i,s,e,d,metres,durationS,climbM,entryOffsetS],…]}`, with `x` when passes
// were left out to fit the column. Names are OpenStreetMap's as written,
// unsplit; splitting and grouping stay in `src/trails/`.

import type { TrailPass } from '../trails/types';

export type TrailsCell =
  | { status: 'untagged' }
  | { status: 'unreadable' }
  | {
      status: 'tagged';
      /** The matcher version that produced it (`m`). */
      matcherVersion: number;
      /** Metres of the track on no kept pass (`u`): `TrailActivity.unmatchedM`. */
      unmatchedM: number;
      /** In activity time order; empty for "no named trail". */
      passes: TrailPass[];
      /** Passes left out to fit the column (`x`), or 0. */
      omitted: number;
    };

const KEYS = new Set(['v', 'm', 'u', 'n', 'p', 'x']);
const isWhole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isWholeOrNull = (v: unknown): v is number | null => v === null || isWhole(v);

/** The one decoder for Workouts!AD. Never throws. */
export function parseTrailsCell(cell: string): TrailsCell {
  if (cell === '') return { status: 'untagged' };
  const unreadable = { status: 'unreadable' } as const;
  let t: unknown;
  try {
    t = JSON.parse(cell);
  } catch {
    return unreadable;
  }
  if (!t || typeof t !== 'object' || Array.isArray(t)) return unreadable;
  const o = t as Record<string, unknown>;
  if (Object.keys(o).some((k) => !KEYS.has(k))) return unreadable;
  if (o.v !== 1 || !isWhole(o.m) || o.m < 1 || !isWhole(o.u)) return unreadable;
  if ('x' in o && (!isWhole(o.x) || o.x < 1)) return unreadable;
  if (!Array.isArray(o.n) || !Array.isArray(o.p)) return unreadable;

  const names: string[] = [];
  for (const entry of o.n as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 2) return unreadable;
    if (typeof entry[0] !== 'string' || entry[0] === '' || !isWhole(entry[1])) return unreadable;
    names.push(entry[0]);
  }

  const used = new Set<number>();
  const passes: TrailPass[] = [];
  for (const pass of o.p as unknown[]) {
    if (!Array.isArray(pass) || pass.length !== 8) return unreadable;
    const [i, s, e, d, metres, durationS, climbM, entryOffsetS] = pass as unknown[];
    if (!isWhole(i) || i >= names.length) return unreadable;
    if (!isWhole(s) || s > 100 || !isWhole(e) || e > 100) return unreadable;
    if (d !== 1 && d !== -1) return unreadable;
    if (!isWhole(metres) || !isWholeOrNull(durationS) || !isWholeOrNull(climbM) || !isWholeOrNull(entryOffsetS)) {
      return unreadable;
    }
    used.add(i);
    passes.push({
      trail: names[i],
      startPct: s,
      endPct: e,
      direction: d === 1 ? 'forward' : 'reverse',
      metres,
      durationS,
      climbM,
      entryOffsetS,
    });
  }
  if (used.size !== names.length) return unreadable;

  return { status: 'tagged', matcherVersion: o.m, unmatchedM: o.u, passes, omitted: 'x' in o ? (o.x as number) : 0 };
}
