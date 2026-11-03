// The activity detail screen's stats card (#531): one headline figure and a grid
// of what else is known, for a completed bike, hike, run, walk or stretch. A
// source that is blank leaves its cell out; nothing is ever drawn as 0 or a dash
// (#101). Weight's body is #533's.

import type { WorkoutWithRow } from '../../api/types';
import { metersToFeet, parse } from '../../api/units';
import {
  cardFigure,
  distanceMeters,
  formatClock,
  hasDistanceFigure,
  spokenElapsed,
  spokenPace,
  type CardFigure,
} from './activities-helpers';

const METERS_PER_MILE = 1609.344;

export interface StatCell {
  label: string;
  value: string;
  unit: string;
  /** The value spelled out with its unit, for the accessible name. */
  spoken: string;
}

export interface DetailStatsData {
  headline: CardFigure | null;
  cells: StatCell[];
}

/** A positive count of seconds, or null for blank, 0 and non-numeric. */
export function positive(value: string): number | null {
  const n = parse(value);
  return n !== null && n > 0 ? n : null;
}

export const grouped = (n: number) => n.toLocaleString('en-US');

/** Whether this activity gets a stats card: completed, and not weight. */
export function hasStatsCard(w: WorkoutWithRow): boolean {
  return w.type !== 'weight' && w.status !== 'planned' && w.status !== 'active';
}

/**
 * The headline and the cells that have a value, in the order they are drawn. `avgCadence` is a Spin
 * ride's mean cadence from its streams (#771): it comes last, once the streams are in.
 */
export function detailStats(w: WorkoutWithRow, avgCadence: number | null = null): DetailStatsData {
  const headline = cardFigure(w);
  const cells: StatCell[] = [];
  const elapsed = positive(w.elapsed_seconds);
  const meters = distanceMeters(w);

  // The duration is the headline when there is no distance figure; then it is not repeated.
  if (hasDistanceFigure(w) && elapsed !== null) {
    const total = Math.round(elapsed);
    cells.push({ label: 'Activity time', value: formatClock(total), unit: '', spoken: spokenElapsed(total) });
  }

  if (meters !== null && elapsed !== null) {
    const miles = meters / METERS_PER_MILE;
    if (w.type === 'bike') {
      const mph = (miles / (elapsed / 3600)).toFixed(1);
      cells.push({ label: 'Avg speed', value: mph, unit: 'mph', spoken: `${mph} miles per hour` });
    } else if (w.type !== 'stretch') {
      const perMile = Math.round(elapsed / miles);
      const pace = `${Math.floor(perMile / 60)}:${String(perMile % 60).padStart(2, '0')}`;
      cells.push({ label: 'Avg pace', value: pace, unit: '/mi', spoken: `${spokenPace(perMile)} per mile` });
    }
  }

  // #771: a Thrive Spin ride's power figures (AE:AI), each left out when blank.
  const avgPower = positive(w.avg_power_w);
  if (avgPower !== null) {
    const watts = Math.round(avgPower);
    cells.push({ label: 'Avg power', value: String(watts), unit: 'W', spoken: `${watts} watts` });
  }
  const np = positive(w.np_w);
  if (np !== null) {
    const watts = Math.round(np);
    cells.push({ label: 'Norm. power', value: String(watts), unit: 'W', spoken: `${watts} watts normalized` });
  }
  const intensity = positive(w.intensity_factor);
  if (intensity !== null) {
    const value = intensity.toFixed(2);
    cells.push({ label: 'IF', value, unit: '', spoken: `intensity factor ${value}` });
  }
  const tss = positive(w.tss);
  if (tss !== null) {
    const value = String(Math.round(tss));
    cells.push({ label: 'TSS', value, unit: '', spoken: `training stress score ${value}` });
  }
  const work = positive(w.work_kj);
  if (work !== null) {
    const kj = grouped(Math.round(work));
    cells.push({ label: 'Work', value: kj, unit: 'kJ', spoken: `${kj} kilojoules` });
  }

  const hr = positive(w.avg_hr);
  if (hr !== null) {
    const bpm = Math.round(hr);
    cells.push({ label: 'Avg heart rate', value: String(bpm), unit: 'bpm', spoken: `${bpm} beats per minute` });
  }

  const gain = metersToFeet(w.ascent_m);
  if (gain !== null && gain > 0) {
    cells.push({ label: 'Elev gain', value: grouped(gain), unit: 'ft', spoken: `${grouped(gain)} feet` });
  }
  const loss = metersToFeet(w.descent_m);
  if (loss !== null && loss > 0) {
    cells.push({ label: 'Elev loss', value: grouped(loss), unit: 'ft', spoken: `${grouped(loss)} feet` });
  }

  const calories = positive(w.calories);
  if (calories !== null) {
    const kcal = grouped(Math.round(calories));
    cells.push({ label: 'Calories', value: kcal, unit: 'kcal', spoken: `${kcal} kilocalories` });
  }

  const moving = positive(w.moving_seconds);
  // Moving time that matches the elapsed time to the minute says nothing more.
  if (moving !== null && (elapsed === null || Math.round(moving / 60) !== Math.round(elapsed / 60))) {
    const total = Math.round(moving);
    cells.push({ label: 'Moving time', value: formatClock(total), unit: '', spoken: spokenElapsed(total) });
  }

  if (avgCadence !== null && avgCadence > 0) {
    cells.push({
      label: 'Avg cadence',
      value: String(avgCadence),
      unit: 'rpm',
      spoken: `${avgCadence} revolutions per minute`,
    });
  }

  return { headline, cells };
}

/** One cell of a stats grid: the value with its unit, over its label. */
export function StatCellView({ cell: c }: { cell: StatCell }) {
  return (
    <div class="detail-stat">
      <span class="detail-stat-value" role="img" aria-label={c.spoken}>
        {c.value}
        {c.unit && <span class="detail-stat-unit">{c.unit === '/mi' ? c.unit : ` ${c.unit}`}</span>}
      </span>
      <span class="detail-stat-label">{c.label}</span>
    </div>
  );
}

/**
 * `hideEmpty`: the route is shown (#407), so an activity with nothing else to say
 * is not told "No details recorded" under its map.
 */
export function DetailStats({
  workout,
  hideEmpty = false,
  avgCadence = null,
}: {
  workout: WorkoutWithRow;
  hideEmpty?: boolean;
  avgCadence?: number | null;
}) {
  const { headline, cells } = detailStats(workout, avgCadence);
  if (!headline && cells.length === 0) {
    if (hideEmpty) return null;
    return <p class="detail-no-details">No details recorded</p>;
  }
  return (
    <section class="detail-stats-card" aria-label="Stats">
      {headline && (
        <p class="detail-headline" role="img" aria-label={headline.spoken}>
          <span class="detail-headline-figure">{headline.value}</span>
          <span class="detail-headline-unit">{headline.unit}</span>
        </p>
      )}
      {cells.length > 0 && (
        <div class={`detail-stats-grid${headline ? ' with-rule' : ''}`}>
          {cells.map((c) => (
            <StatCellView key={c.label} cell={c} />
          ))}
        </div>
      )}
    </section>
  );
}
