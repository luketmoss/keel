// The RideWorkouts and FtpHistory row mappings (#765): Thrive Spin's workout library and the
// owner's FTP settings.
//
// Mirrors RIDE_WORKOUT_FIELDS and FTP_HISTORY_FIELDS in apps-script/src/types.js (change both
// together; spin-rows.test.ts fails if they drift). Nothing in the SPA reads or writes these
// tabs yet: the Spin app uses the API's getRideWorkouts, getFtp and their writes, and #772 reads
// the FTP and the library here. So this file is the layout and its mappers, and renders nothing.
//
// Every cell is text, as every other row mapping here: `steps` is the stored steps JSON,
// `duration_s` the API's computed total in seconds, `ftp_w` whole watts.

/** RideWorkouts' A:H order. */
export const RIDE_WORKOUT_FIELDS = [
  'id',
  'name',
  'category',
  'description',
  'steps',
  'duration_s',
  'created',
  'updated',
] as const;

/** FtpHistory's A:F order. */
export const FTP_HISTORY_FIELDS = ['id', 'date', 'ftp_w', 'source', 'ride_id', 'created'] as const;

export const RIDE_WORKOUT_CATEGORIES = ['Endurance', 'Sweet spot', 'Threshold', 'VO2', 'Recovery'] as const;
export type RideWorkoutCategory = (typeof RIDE_WORKOUT_CATEGORIES)[number];

export const FTP_SOURCES = ['ramp_test', 'manual'] as const;
export type FtpSource = (typeof FTP_SOURCES)[number];

/** One library workout, as the sheet holds it. `category` is text: a hand edit can leave anything. */
export interface RideWorkoutRow {
  id: string;
  name: string;
  category: RideWorkoutCategory | string;
  description: string;
  /** The steps JSON (v1), stored text. */
  steps: string;
  /** Total seconds with repeats expanded, computed by the API. */
  duration_s: string;
  created: string;
  updated: string;
}

/** One FTP setting. The current FTP is the newest row, by `date` and then `created`. */
export interface FtpHistoryRow {
  id: string;
  date: string;
  ftp_w: string;
  source: FtpSource | string;
  /** The test ride's `Workouts!T`: set for `ramp_test`, blank for `manual`. */
  ride_id: string;
  created: string;
}

/** A `RideWorkouts` row. The Sheets API drops trailing empty cells, so every missing cell reads ''. */
export function rowToRideWorkout(row: readonly string[]): RideWorkoutRow {
  return {
    id: row[0] || '',
    name: row[1] || '',
    category: row[2] || '',
    description: row[3] || '',
    steps: row[4] || '',
    duration_s: row[5] || '',
    created: row[6] || '',
    updated: row[7] || '',
  };
}

/** A library workout as exactly eight cells. */
export function rideWorkoutToRow(w: RideWorkoutRow): string[] {
  return [w.id, w.name, w.category, w.description, w.steps, w.duration_s, w.created, w.updated];
}

/** An `FtpHistory` row. */
export function rowToFtpHistory(row: readonly string[]): FtpHistoryRow {
  return {
    id: row[0] || '',
    date: row[1] || '',
    ftp_w: row[2] || '',
    source: row[3] || '',
    ride_id: row[4] || '',
    created: row[5] || '',
  };
}

/** An FTP setting as exactly six cells. */
export function ftpHistoryToRow(f: FtpHistoryRow): string[] {
  return [f.id, f.date, f.ftp_w, f.source, f.ride_id, f.created];
}

/**
 * The newest FTP setting, by `date` and then `created`, or null on no rows: what the API's
 * `getFtp` calls `current`. A later row wins a tie on both.
 */
export function currentFtp(rows: readonly FtpHistoryRow[]): FtpHistoryRow | null {
  let best: FtpHistoryRow | null = null;
  for (const r of rows) {
    if (!r.id) continue;
    if (!best || r.date > best.date || (r.date === best.date && r.created >= best.created)) best = r;
  }
  return best;
}
