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

/** The demo COROS hike's `track_ref`: not a Drive file id, so it can never be mistaken for one. */
export const DEMO_TRACK_REF = 'demo-track';

/** Demo workouts that have a route, by workout id. */
export const DEMO_TRACKS: Record<string, WorkoutTrack> = { w_demo008: loop() };
