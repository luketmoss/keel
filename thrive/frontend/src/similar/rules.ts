// Routes like this and Near here (#692): which activities share ground with a
// viewed one, from their grid cells. Pure; the constants are the only thresholds.

import { ROW } from './grid';

/** An activity with fewer cells (about 1.1 km) is too small to say anything about, and is never compared. */
export const MIN_CELLS = 20;
/** Routes like this: each activity covers at least this percent of the other's cells. */
export const ROUTE_COVERAGE_PCT = 70;
/** Near here: at least this many of the viewed activity's cells are near the other. */
export const NEAR_MIN_SHARED = 15;
/** Near here: coverage one way of at least this percent. */
export const NEAR_COVERAGE_PCT = 25;
/** Each section lists up to this many. */
export const SECTION_LIMIT = 3;

/** An activity as the rules see it. */
export interface SimilarCandidate {
  id: string;
  date: string;
  time: string;
  /** Sorted, distinct cells. */
  cells: readonly number[];
}

export interface SimilarResult {
  /** Ids, newest first, up to 3. */
  routes: string[];
  /** Ids, newest first, up to 3, none of them in `routes`. */
  near: string[];
}

const NEIGHBOUR_OFFSETS = [-ROW - 1, -ROW, -ROW + 1, -1, 0, 1, ROW - 1, ROW, ROW + 1];

/** Whether the cell, or one of its 8 neighbours, is in the set. */
function isNear(set: ReadonlySet<number>, cell: number): boolean {
  for (const d of NEIGHBOUR_OFFSETS) if (set.has(cell + d)) return true;
  return false;
}

/** The set of a cell list and every neighbour of each cell. */
function withNeighbours(cells: readonly number[]): Set<number> {
  const out = new Set<number>();
  for (const c of cells) for (const d of NEIGHBOUR_OFFSETS) out.add(c + d);
  return out;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function boundsOf(cells: readonly number[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const x = Math.floor(c / ROW);
    const y = c - x * ROW;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/** Whether two boxes of cells are more than one cell apart, so no cell of one is near the other. */
function apart(a: Bounds, b: Bounds): boolean {
  return a.maxX + 1 < b.minX || b.maxX + 1 < a.minX || a.maxY + 1 < b.minY || b.maxY + 1 < a.minY;
}

/** Whether `part` is at least `pct` percent of `whole`, in whole numbers so 70% of 10 is exactly 7. */
function atLeastPct(part: number, whole: number, pct: number): boolean {
  return part * 100 >= pct * whole;
}

/**
 * How `other` relates to the viewed cells: 'route', 'near', or null. `viewedNear`
 * is the viewed cells with their neighbours, built once for all comparisons.
 */
function relate(
  viewed: readonly number[],
  viewedNear: ReadonlySet<number>,
  viewedBounds: Bounds,
  other: readonly number[],
): 'route' | 'near' | null {
  if (other.length < MIN_CELLS) return null;
  if (apart(viewedBounds, boundsOf(other))) return null;

  // The other's cells near the viewed ones: one set lookup each.
  let otherShared = 0;
  for (const c of other) if (viewedNear.has(c)) otherShared += 1;

  // The viewed cells near the other's: up to 9 lookups each, so it stops once the count cannot reach what
  // either section needs.
  const otherSet = new Set(other);
  const need = Math.min(NEAR_MIN_SHARED, Math.ceil((ROUTE_COVERAGE_PCT * viewed.length) / 100));
  const room = viewed.length - need;
  let shared = 0;
  let missed = 0;
  for (const c of viewed) {
    if (isNear(otherSet, c)) shared += 1;
    else if (++missed > room) return null;
  }

  if (
    atLeastPct(shared, viewed.length, ROUTE_COVERAGE_PCT) &&
    atLeastPct(otherShared, other.length, ROUTE_COVERAGE_PCT)
  ) {
    return 'route';
  }
  if (
    shared >= NEAR_MIN_SHARED &&
    (atLeastPct(shared, viewed.length, NEAR_COVERAGE_PCT) || atLeastPct(otherShared, other.length, NEAR_COVERAGE_PCT))
  ) {
    return 'near';
  }
  return null;
}

/** Newest first: date, then time. */
function newestFirst(a: SimilarCandidate, b: SimilarCandidate): number {
  return `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The Routes like this and Near here lists for the viewed activity. `others` may
 * include the viewed one; it is never listed against itself.
 */
export function similarTo(viewed: SimilarCandidate, others: readonly SimilarCandidate[]): SimilarResult {
  if (viewed.cells.length < MIN_CELLS) return { routes: [], near: [] };
  const viewedNear = withNeighbours(viewed.cells);
  const viewedBounds = boundsOf(viewed.cells);
  const routes: SimilarCandidate[] = [];
  const near: SimilarCandidate[] = [];
  for (const o of others) {
    if (o.id === viewed.id) continue;
    const kind = relate(viewed.cells, viewedNear, viewedBounds, o.cells);
    if (kind === 'route') routes.push(o);
    else if (kind === 'near') near.push(o);
  }
  return {
    routes: routes
      .sort(newestFirst)
      .slice(0, SECTION_LIMIT)
      .map((c) => c.id),
    near: near
      .sort(newestFirst)
      .slice(0, SECTION_LIMIT)
      .map((c) => c.id),
  };
}
