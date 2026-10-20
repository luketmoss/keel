// The Elevation card on the activity detail screen (#532): the track's elevation
// against distance along it, as an area chart. The series comes from @keel/geo
// (`computeElevationSeries`, which keeps a missing elevation as a gap); the
// ascent in the heading is the activity's own `ascent_m`, COROS's number, not
// one computed here.

import { computeElevationSeries } from '@keel/geo';
import type { Workout, WorkoutTrack } from '../../api/types';
import { parse } from '../../api/units';
import { MountainIcon } from './detail-icons';

const FEET_PER_METER = 1 / 0.3048;
const METERS_PER_MILE = 1609.344;
const W = 320;
const H = 96;
const HEADROOM = 0.08;

const grouped = (n: number) => Math.round(n).toLocaleString('en-US');

export interface ElevationData {
  /** Distance in miles and elevation in feet; a null elevation is a gap. */
  points: { miles: number; feet: number | null }[];
  lowFt: number;
  highFt: number;
  totalMiles: number;
}

/** The chart's data, or null when the track has fewer than two points with an elevation. */
export function elevationData(track: WorkoutTrack): ElevationData | null {
  const ele = track.properties?.ele ?? [];
  const coordinates = track.geometry?.coordinates ?? [];
  const series = computeElevationSeries(
    coordinates.map(([lon, lat], i) => {
      const e = ele[i];
      return { lat, lon, elevation: typeof e === 'number' ? e : undefined };
    }),
  );
  if (!series) return null;
  const points = series.map((p) => ({
    miles: p.distanceMeters / METERS_PER_MILE,
    feet: p.elevationMeters === null ? null : p.elevationMeters * FEET_PER_METER,
  }));
  const known = points.flatMap((p) => (p.feet === null ? [] : [p.feet]));
  const totalMiles = points[points.length - 1].miles;
  if (!Number.isFinite(totalMiles) || known.some((f) => !Number.isFinite(f))) return null;
  return { points, lowFt: Math.min(...known), highFt: Math.max(...known), totalMiles };
}

/** The activity's ascent in feet, or null when blank or not above zero. */
function ascentFeet(ascentM: string): number | null {
  const m = parse(ascentM);
  return m !== null && m > 0 ? m * FEET_PER_METER : null;
}

/** Four labels: 0 and thirds of the distance, whole miles (a tenth under 3 mi). */
export function axisLabels(totalMiles: number): string[] {
  return [0, 1, 2, 3].map((i) => {
    if (i === 0) return '0';
    const miles = (totalMiles * i) / 3;
    return `${totalMiles < 3 ? miles.toFixed(1) : Math.round(miles)} mi`;
  });
}

/** Path data for the line and the area of each unbroken run of known elevations. */
function paths(data: ElevationData): { line: string; area: string } {
  const { points, lowFt, highFt, totalMiles } = data;
  const span = highFt - lowFt || 1;
  const top = highFt + span * HEADROOM;
  const x = (miles: number) => (totalMiles > 0 ? (miles / totalMiles) * W : 0);
  const y = (feet: number) => H - ((feet - lowFt) / (top - lowFt)) * H;

  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.feet === null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push({ x: x(p.miles), y: y(p.feet) });
    }
  }
  if (run.length) runs.push(run);

  const usable = runs.filter((r) => r.length >= 2);
  const trace = (r: { x: number; y: number }[]) =>
    r.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return {
    line: usable.map(trace).join(' '),
    area: usable.map((r) => `${trace(r)} L${r[r.length - 1].x.toFixed(1)},${H} L${r[0].x.toFixed(1)},${H} Z`).join(' '),
  };
}

export function ElevationProfile({ track, ascentM }: { track: WorkoutTrack; ascentM: Workout['ascent_m'] }) {
  const data = elevationData(track);
  if (!data) return null;
  const { line, area } = paths(data);
  const ascent = ascentFeet(ascentM);
  const range = `${grouped(data.lowFt)} – ${grouped(data.highFt)} ft`;
  const name = `Elevation from ${grouped(data.lowFt)} to ${grouped(data.highFt)} ft over ${data.totalMiles.toFixed(1)} mi`;

  return (
    <section class="detail-elevation-card">
      <div class="detail-elevation-header">
        <h2 class="detail-elevation-heading">
          <MountainIcon />
          Elevation
        </h2>
        {ascent !== null && <span class="detail-elevation-ascent">↑ {grouped(ascent)} ft</span>}
      </div>
      <p class="detail-elevation-range">{range}</p>
      <svg
        class="detail-elevation-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={name}
      >
        <path class="detail-elevation-area" d={area} />
        <path class="detail-elevation-line" d={line} />
      </svg>
      <div class="detail-elevation-axis" aria-hidden="true">
        {axisLabels(data.totalMiles).map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </section>
  );
}
