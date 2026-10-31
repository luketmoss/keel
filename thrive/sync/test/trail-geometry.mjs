// Synthetic tracks and trails for the #688 tests. Everything is laid out in
// metres on a plane around 0°, 0° and converted to degrees, so no real place
// appears here. Trail names are invented; the date is the placeholder
// 2000-01-01.

import { readFileSync } from 'node:fs';

const R = 6_371_008.8;
const toDeg = (m) => (m / R) * (180 / Math.PI);
export const ll = ([x, y]) => ({ lon: toDeg(x), lat: toDeg(y) });

export const START_UTC = '2000-01-01T13:00:00.000Z';

/**
 * A stored-track Feature through `vertices` (metres), at `speed` m/s, climbing
 * `grade`. `timeUntil` / `eleUntil` blank `t` / `ele` from that vertex index on,
 * so a test can ask for the `null`s the column format allows.
 */
export function track(vertices, { speed = 4, grade = 0, timeUntil = Infinity, eleUntil = Infinity } = {}) {
  let cum = 0;
  const t = [0];
  const ele = [1000];
  for (let i = 1; i < vertices.length; i++) {
    const d = Math.hypot(vertices[i][0] - vertices[i - 1][0], vertices[i][1] - vertices[i - 1][1]);
    cum += d;
    t.push(Math.round(cum / speed));
    ele.push(1000 + cum * grade);
  }
  return {
    type: 'Feature',
    properties: {
      format: 'thrive-track',
      start_utc: START_UTC,
      t: t.map((v, i) => (i >= timeUntil ? null : v)),
      ele: ele.map((v, i) => (i >= eleUntil ? null : v)),
    },
    geometry: { type: 'LineString', coordinates: vertices.map((v) => [ll(v).lon, ll(v).lat]) },
  };
}

/** One Overpass `out geom` way. */
export const way = (name, vertices, highway = 'path') => ({
  type: 'way',
  tags: { name, highway },
  geometry: vertices.map(ll),
});

/** The committed golden string (#688), also read by frontend/src/api/trails-cell.test.ts. */
export const GOLDEN = readFileSync(new URL('./fixtures/trails-688-golden.txt', import.meta.url), 'utf8').trim();

/** The golden activity: three trails, an out-and-back on one, `null`s where the track has no t or ele. */
export const GOLDEN_FEATURE = track(
  [[-300, 0], [0, 0], [1000, 0], [1000, 150], [1000, 0], [400, 0], [400, -500]],
  { grade: 0.03, timeUntil: 4, eleUntil: 3 },
);
export const GOLDEN_ELEMENTS = [
  way('Heron Ridge Trail', [[0, 0], [1000, 0]]),
  way('Aspen Draw;Kestrel Connector', [[1000, 0], [1000, 150]], 'track'),
  way('Lower Heron', [[400, -100], [400, -480]], 'footway'),
];

