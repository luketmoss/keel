// The Ride card of a Spin ride (#771): the FTP it was ridden at, its intensity, the Spin workout it
// followed and its pauses. Label and value rows with no heading. A row with no value is left out, and
// the card is hidden when every row is. The first three read the row (and the library) and never wait
// on the streams.

import type { RideDerived } from '../../api/spin-streams';
import type { Workout } from '../../api/types';
import type { RideLibraryState } from '../../spin/ride-library';
import { rowFtp } from '../../spin/streams-cache';
import { formatClock } from './activities-helpers';
import { workoutMeta } from '../workout/spin-picker';

export interface RideCardRow {
  label: string;
  value: string;
}

/** "100% · as written", or "<n>%". Blank, zero and non-numeric leave the row out. */
export function intensityText(intensityPct: string): string | null {
  const n = Number(intensityPct);
  if (!intensityPct.trim() || !Number.isFinite(n) || n <= 0) return null;
  return n === 100 ? '100% · as written' : `${Math.round(n)}%`;
}

/** "1 pause · 0:45", "<n> pauses · <total>". Null with none. */
export function pausesText(ride: RideDerived | null): string | null {
  if (!ride || ride.pauses.length === 0) return null;
  const count = ride.pauses.length;
  return `${count} ${count === 1 ? 'pause' : 'pauses'} · ${formatClock(ride.pauseTotalS)}`;
}

/** The library's answer for the linked workout: its name, a reason, or nothing while it loads. */
export function spinWorkoutText(id: string, library: RideLibraryState): string | null {
  if (!id) return null;
  if (library.status === 'error') return "Couldn't load it";
  if (library.status !== 'loaded') return null;
  const found = library.workouts.find((w) => w.id === id);
  return found ? found.name || 'Unnamed workout' : 'Removed from your library';
}

/**
 * A planned bike's Spin workout on its detail screen (#772), one line under the title: the workout's
 * name, category and length; or that it was removed from the library; or that the library would not
 * load. Null while it loads, and with no link.
 */
export function planSpinLine(id: string, library: RideLibraryState): { label: string; value: string } | null {
  if (!id) return null;
  if (library.status === 'error') return { label: 'Spin workout:', value: "Couldn't load it" };
  if (library.status !== 'loaded') return null;
  const found = library.workouts.find((w) => w.id === id);
  if (!found) return { label: 'Spin workout', value: 'removed from your library' };
  return {
    label: 'Spin workout:',
    value: [found.name || 'Unnamed workout', workoutMeta(found)].filter(Boolean).join(' · '),
  };
}

export function rideCardRows(
  w: Pick<Workout, 'ftp_w' | 'intensity_pct' | 'ride_workout_id'>,
  ride: RideDerived | null,
  library: RideLibraryState,
): RideCardRow[] {
  const rows: RideCardRow[] = [];
  const ftp = rowFtp(w) ?? ride?.ftp ?? null;
  if (ftp) rows.push({ label: 'FTP for this ride', value: `${ftp} W` });
  const intensity = intensityText(w.intensity_pct);
  if (intensity) rows.push({ label: 'Intensity', value: intensity });
  const workout = spinWorkoutText(w.ride_workout_id, library);
  if (workout) rows.push({ label: 'Spin workout', value: workout });
  const pauses = pausesText(ride);
  if (pauses) rows.push({ label: 'Pauses', value: pauses });
  return rows;
}

export function RideCard({ rows }: { rows: RideCardRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section class="detail-card ride-card" aria-label="Ride">
      <dl class="ride-card-rows">
        {rows.map((r) => (
          <div class="ride-card-row" key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
