import type { WorkoutTrack } from './types';

// Demo mode's route (#407): a made-up loop of a few hundred points around an
// invented spot, not anyone's real route. It is bundled so the demo path never
// calls the API, and built from a formula so it is deterministic.

const CENTER = { lat: 45.0, lon: -100.0 };
const POINTS = 320;
const START_MS = Date.UTC(2025, 0, 9, 15, 10, 0);

function loop(): WorkoutTrack {
  const coordinates: [number, number][] = [];
  const t: number[] = [];
  const ele: number[] = [];
  for (let i = 0; i < POINTS; i++) {
    const a = (i / (POINTS - 1)) * 2 * Math.PI;
    // A lobed ellipse, about 2.5 km by 1.5 km, so it reads as a trail loop and not a circle.
    const r = 1 + 0.18 * Math.sin(3 * a) + 0.07 * Math.cos(5 * a);
    const lon = CENTER.lon + 0.016 * r * Math.cos(a);
    const lat = CENTER.lat + 0.009 * r * Math.sin(a);
    coordinates.push([Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
    t.push(i * 16);
    ele.push(Math.round((1200 + 160 * Math.sin(a) + 40 * Math.sin(4 * a)) * 10) / 10);
  }
  // The loop closes: the last point is the first.
  coordinates[POINTS - 1] = coordinates[0];
  const lons = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  return {
    type: 'Feature',
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
    properties: {
      format: 'thrive-track',
      version: 1,
      source: 'coros',
      activity_id: 'demo',
      start_utc: new Date(START_MS).toISOString(),
      t,
      ele,
      simplify: { algorithm: 'rdp', tolerance_m: 5 },
      points_in: POINTS,
    },
    geometry: { type: 'LineString', coordinates },
  };
}

// The demo ride (#526): a point-to-point line of about 12 km with a 300 m climb,
// somewhere else invented. Its elevation has a run of 5 gaps in the middle, as a
// watch that lost its barometer for a moment would leave, so the elevation
// profile has a gap to draw.
const RIDE_CENTER = { lat: 44.5, lon: -99.5 };
const RIDE_POINTS = 240;
const RIDE_START_MS = Date.UTC(2025, 0, 6, 15, 40, 0);
const RIDE_GAP_FROM = 118;
const RIDE_GAP_LEN = 5;

function ride(): WorkoutTrack {
  const coordinates: [number, number][] = [];
  const t: number[] = [];
  const ele: (number | null)[] = [];
  for (let i = 0; i < RIDE_POINTS; i++) {
    const f = i / (RIDE_POINTS - 1);
    // West to east, about 12 km, bending a little so it reads as a road and not a ruler.
    const lon = RIDE_CENTER.lon - 0.076 + 0.152 * f;
    const lat = RIDE_CENTER.lat + 0.012 * Math.sin(f * 2 * Math.PI) + 0.004 * Math.sin(f * 9);
    coordinates.push([Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]);
    t.push(i * 12);
    // A steady 300 m climb with a little rolling on top.
    const gap = i >= RIDE_GAP_FROM && i < RIDE_GAP_FROM + RIDE_GAP_LEN;
    ele.push(gap ? null : Math.round((1100 + 300 * f + 12 * Math.sin(f * 20)) * 10) / 10);
  }
  const lons = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  return {
    type: 'Feature',
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
    properties: {
      format: 'thrive-track',
      version: 1,
      source: 'coros',
      activity_id: 'demo-ride',
      start_utc: new Date(RIDE_START_MS).toISOString(),
      t,
      ele,
      simplify: { algorithm: 'rdp', tolerance_m: 5 },
      points_in: RIDE_POINTS,
    },
    geometry: { type: 'LineString', coordinates },
  };
}

/** Demo workouts that have a route, by workout id. */
export const DEMO_TRACKS: Record<string, WorkoutTrack> = { w_demo008: loop(), w_demo011: ride() };
