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

const M_PER_DEG_LAT = 111_320;

/**
 * A copy of a track moved `northM` metres north and `eastM` metres east (negative for south and west), for the
 * similar-routes demo (#692). The distance moved is the hypotenuse.
 */
export function shiftTrack(base: WorkoutTrack, northM: number, eastM: number, activityId: string): WorkoutTrack {
  const dLat = northM / M_PER_DEG_LAT;
  const coordinates = base.geometry.coordinates.map(([lon, lat]) => {
    const dLon = eastM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
    return [Math.round((lon + dLon) * 1e5) / 1e5, Math.round((lat + dLat) * 1e5) / 1e5] as [number, number];
  });
  return withCoordinates(base, coordinates, base.properties.t, base.properties.ele, activityId);
}

/** A copy of a track's first `share` (0 to 1) of its points. */
export function firstShare(base: WorkoutTrack, share: number, activityId: string): WorkoutTrack {
  const n = Math.max(2, Math.round(base.geometry.coordinates.length * share));
  return withCoordinates(
    base,
    base.geometry.coordinates.slice(0, n),
    base.properties.t.slice(0, n),
    base.properties.ele.slice(0, n),
    activityId,
  );
}

function withCoordinates(
  base: WorkoutTrack,
  coordinates: [number, number][],
  t: number[],
  ele: (number | null)[],
  activityId: string,
): WorkoutTrack {
  const lons = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  return {
    ...base,
    bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
    properties: { ...base.properties, activity_id: activityId, t, ele, points_in: coordinates.length },
    geometry: { type: 'LineString', coordinates },
  };
}

const LOOP = loop();
const RIDE = ride();

/**
 * Demo workouts that have a route, by workout id. Besides the two bundled tracks, variants of them make the
 * real similar-routes rule (#692) find results: the ride moved 20 m and 10 m (Routes like this), its first 40%
 * and the ride moved 150 m, 120 north and 90 east (Near here), and the hike's loop moved 20 m and 10 m.
 */
export const DEMO_TRACKS: Record<string, WorkoutTrack> = {
  w_demo008: LOOP,
  w_demo011: RIDE,
  w_demo012: shiftTrack(RIDE, 20, 0, 'demo-ride-20'),
  w_demo034: shiftTrack(RIDE, 10, 0, 'demo-ride-10'),
  w_demo028: firstShare(RIDE, 0.4, 'demo-ride-part'),
  w_demo022: shiftTrack(RIDE, 120, 90, 'demo-ride-150'),
  w_demo031: shiftTrack(LOOP, 20, 0, 'demo-loop-20'),
  w_demo025: shiftTrack(LOOP, 10, 0, 'demo-loop-10'),
};
