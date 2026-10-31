// The trail source (#690): every completed activity's `trails` cell (Workouts!AD,
// #688) read into #682's shapes, with the three states kept apart. Pure.
//
// Blank is not "no trails". A blank cell on an activity with a track has not been
// looked at yet (a later sync run or the backfill tags it), so the app says "not
// tagged yet" and counts it where an absence could be misread as "never". A
// tagged cell with no passes is knowledge (the sync looked and found no named
// trail) and shows nothing. A cell the decoder rejects is counted and left out,
// and never hides the others.

import { parseTrailsCell } from '../api/trails-cell';
import type { TrailActivity } from './types';

/** What the source needs of a workout: a `Workout` row is one. */
export interface TrailWorkout {
  id: string;
  date: string;
  time: string;
  track_ref: string;
  trails: string;
}

/** When an activity happened, for the rules that order by it. */
export interface ActivityWhen {
  id: string;
  date: string;
  time: string;
}

/**
 * One activity's state. An activity with no track and a blank cell has none:
 * there is nothing to tag. `omitted` is the passes left out to fit the column.
 */
export type ActivityTrails = { status: 'untagged' } | { status: 'unreadable' } | { status: 'tagged'; omitted: number };

export interface TrailSourceData {
  /** Every tagged activity, in the order given. */
  activities: TrailActivity[];
  byId: Map<string, ActivityTrails>;
  /** Tracked activities whose cell is blank. */
  untagged: ActivityWhen[];
  /** Activities whose cell could not be read. */
  unreadable: number;
}

/** Reads the cells of the completed activities it is given. Never throws. */
export function readTrailSource(workouts: readonly TrailWorkout[]): TrailSourceData {
  const data: TrailSourceData = { activities: [], byId: new Map(), untagged: [], unreadable: 0 };
  for (const w of workouts) {
    const cell = parseTrailsCell(w.trails);
    if (cell.status === 'untagged') {
      if (w.track_ref === '') continue;
      data.byId.set(w.id, { status: 'untagged' });
      data.untagged.push({ id: w.id, date: w.date, time: w.time });
    } else if (cell.status === 'unreadable') {
      data.byId.set(w.id, { status: 'unreadable' });
      data.unreadable++;
    } else {
      data.byId.set(w.id, { status: 'tagged', omitted: cell.omitted });
      data.activities.push({ id: w.id, date: w.date, time: w.time, passes: cell.passes, unmatchedM: cell.unmatchedM });
    }
  }
  return data;
}

/** Oldest first: by date, then time, then id, as the index orders activities. */
export function whenCompare(a: ActivityWhen, b: ActivityWhen): number {
  return a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id);
}

/** "1 activity's trails couldn't be read." / "3 activities' trails couldn't be read."; null for none. */
export function unreadableSentence(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? "1 activity's trails couldn't be read." : `${count} activities' trails couldn't be read.`;
}
