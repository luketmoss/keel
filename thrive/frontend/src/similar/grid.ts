// The map grid behind Routes like this and Near here (#692): a track becomes the
// set of web-map tiles at zoom 19 it passes through. Framework-free and pure, so
// a later sync-side index can reuse it unchanged.

/** The tile zoom. A cell is about 76 m x cos(latitude) square: 54 m at 45 N. */
export const ZOOM = 19;

/** Points along a segment are added every this many metres or less. */
export const FILL_STEP_M = 25;

/** A segment longer than this is not filled in: a recording that lost signal draws no phantom line. */
export const MAX_FILL_M = 1000;

const TILES = 2 ** ZOOM;
/** Cell id = x * ROW + y; y < 2^19, so ids are whole numbers below 2^40. */
export const ROW = 2 ** 20;

const EARTH_M = 6_371_000;
const MAX_LAT = 85.0511287798;

/** The cell holding a point, as `x * 2^20 + y` of the slippy-map tile. */
export function cellOf(lon: number, lat: number): number {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * TILES);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TILES);
  const cx = Math.max(0, Math.min(TILES - 1, x));
  const cy = Math.max(0, Math.min(TILES - 1, y));
  return cx * ROW + cy;
}

/** Ground distance between two nearby points in metres (equirectangular; ample at segment scale). */
export function segmentMetres(a: readonly [number, number], b: readonly [number, number]): number {
  const toRad = Math.PI / 180;
  const midLat = ((a[1] + b[1]) / 2) * toRad;
  const dx = (b[0] - a[0]) * toRad * Math.cos(midLat);
  const dy = (b[1] - a[1]) * toRad;
  return EARTH_M * Math.sqrt(dx * dx + dy * dy);
}

/**
 * A track's cells, sorted and without duplicates: the cell of each point, and of
 * a point every 25 m or less along each segment up to 1 km long. Fewer than two
 * points give none.
 */
export function trackCells(coordinates: readonly (readonly [number, number])[]): number[] {
  if (coordinates.length < 2) return [];
  const cells = new Set<number>();
  for (let i = 0; i < coordinates.length; i++) {
    const p = coordinates[i];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    cells.add(cellOf(p[0], p[1]));
    if (i === 0) continue;
    const q = coordinates[i - 1];
    if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
    const metres = segmentMetres(q as [number, number], p as [number, number]);
    if (metres <= FILL_STEP_M || metres > MAX_FILL_M) continue;
    const steps = Math.ceil(metres / FILL_STEP_M);
    for (let s = 1; s < steps; s++) {
      const f = s / steps;
      cells.add(cellOf(q[0] + (p[0] - q[0]) * f, q[1] + (p[1] - q[1]) * f));
    }
  }
  return [...cells].sort((a, b) => a - b);
}
