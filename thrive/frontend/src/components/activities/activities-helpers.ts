import type { WorkoutWithRow, SetWithRow, ExerciseWithRow, Effort, WorkoutType } from '../../api/types';
import { metersToMiles } from '../../api/units';
import { formatDuration } from '../../api/duration';
import { provenanceSpeech } from '../../api/provenance';

// ── Equipment / non-muscle tags to exclude from card pills ───────────
export const EQUIPMENT_TAGS = new Set(['BB', 'DB', 'FT', 'Warmup']);

// ── Date grouping (week-based) ───────────────────────────────────────

export interface WorkoutGroup {
  label: string;
  workouts: WorkoutWithRow[];
}

/**
 * Groups workouts into weekly sections: "This Week" (current Mon–Sun),
 * "Last Week" (previous Mon–Sun), and "Earlier" (everything before last week).
 * Each workout appears in exactly one section. Empty sections are omitted.
 * Preserves the order of workouts within each section.
 */
export function groupWorkoutsByDate(workouts: WorkoutWithRow[], todayStr: string): WorkoutGroup[] {
  if (workouts.length === 0) return [];

  const today = new Date(todayStr + 'T00:00:00');
  const day = today.getDay(); // 0=Sun…6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;

  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - diffToMonday);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const thisMondayStr = toLocalDateStr(thisMonday);
  const lastMondayStr = toLocalDateStr(lastMonday);

  const groups = new Map<string, WorkoutWithRow[]>();

  for (const w of workouts) {
    let label: string;
    if (w.date >= thisMondayStr) {
      label = 'This Week';
    } else if (w.date >= lastMondayStr) {
      label = 'Last Week';
    } else {
      label = 'Earlier';
    }

    let arr = groups.get(label);
    if (!arr) {
      arr = [];
      groups.set(label, arr);
    }
    arr.push(w);
  }

  // Enforce canonical order regardless of insertion order
  const ORDER = ['This Week', 'Last Week', 'Earlier'];
  return ORDER.filter((label) => groups.has(label)).map((label) => ({ label, workouts: groups.get(label)! }));
}

/** Format a Date as 'YYYY-MM-DD' in local time (avoids UTC shift from toISOString). */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── Month summary (#527) ─────────────────────────────────────────────

/** The six types in the order the chips, the split bar and its legend use. */
export const TYPE_ORDER: readonly WorkoutType[] = ['weight', 'bike', 'stretch', 'hike', 'run', 'walk'];

/** The app's existing type words, capitalised for a chip. */
export const TYPE_WORDS: Record<WorkoutType, string> = {
  weight: 'Weight',
  bike: 'Bike',
  stretch: 'Stretch',
  hike: 'Hike',
  run: 'Run',
  walk: 'Walk',
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** 'YYYY-MM' of a 'YYYY-MM-DD' date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The month's name alone: "October". */
export function monthName(ym: string): string {
  return MONTH_NAMES[parseInt(ym.slice(5, 7), 10) - 1] ?? ym;
}

/** The month button's text and the picker's options: "October 2026". */
export function monthYearLabel(ym: string): string {
  return `${monthName(ym)} ${ym.slice(0, 4)}`;
}

/**
 * The summary card's title: "October so far" while the month is the current
 * one, otherwise its name, with the year when it is not the current year.
 */
export function monthTitle(ym: string, currentYm: string): string {
  if (ym === currentYm) return `${monthName(ym)} so far`;
  return ym.slice(0, 4) === currentYm.slice(0, 4) ? monthName(ym) : monthYearLabel(ym);
}

export interface MonthOption {
  ym: string;
  count: number;
}

/**
 * The picker's options, newest first: the current month always, then each
 * earlier month with at least one completed activity. `completed` must already
 * exclude planned and active rows; the count ignores the type chip.
 */
export function monthOptions(completed: WorkoutWithRow[], currentYm: string): MonthOption[] {
  const counts = new Map<string, number>();
  for (const w of completed) {
    const ym = monthOf(w.date);
    if (ym < currentYm) counts.set(ym, (counts.get(ym) ?? 0) + 1);
  }
  const earlier = [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([ym, count]) => ({ ym, count }));
  const current = completed.filter((w) => monthOf(w.date) === currentYm).length;
  return [{ ym: currentYm, count: current }, ...earlier];
}

/** The types that have any activity in `completed`, in chip order. */
export function typesPresent(completed: WorkoutWithRow[]): WorkoutType[] {
  const seen = new Set(completed.map((w) => w.type));
  return TYPE_ORDER.filter((t) => seen.has(t));
}

export interface TypeCount {
  type: WorkoutType;
  count: number;
}

/** Per-type counts for the split bar, in chip order, types with none left out. */
export function typeCounts(ws: WorkoutWithRow[]): TypeCount[] {
  return TYPE_ORDER.map((type) => ({ type, count: ws.filter((w) => w.type === type).length })).filter(
    (t) => t.count > 0,
  );
}

export interface MonthSummary {
  count: number;
  /** Sum of the durations that exist, in seconds. */
  seconds: number;
  /** How many activities have a duration. Blank is not zero, so the rest are skipped, not counted as 0. */
  timed: number;
  /** Sum of the distances that exist, in miles to one decimal; null when no activity has one. */
  miles: number | null;
}

export function summarizeMonth(ws: WorkoutWithRow[]): MonthSummary {
  let seconds = 0;
  let timed = 0;
  let meters = 0;
  let measured = 0;
  for (const w of ws) {
    const s = parseInt(w.elapsed_seconds, 10);
    if (!isNaN(s)) {
      seconds += s;
      timed += 1;
    }
    const d = parseFloat(w.distance_m);
    if (w.distance_m.trim() !== '' && !isNaN(d)) {
      meters += d;
      measured += 1;
    }
  }
  return {
    count: ws.length,
    seconds,
    timed,
    miles: measured > 0 ? metersToMiles(String(meters)) : null,
  };
}

/** Seconds as whole hours and minutes, the minutes rounded once from the total. */
export function splitDuration(seconds: number): { hours: number; minutes: number } {
  const total = Math.round(seconds / 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/** "14 h 2" / "45 min" as one string, for the accessible name and tests. */
export function formatMonthTime(seconds: number): string {
  const { hours, minutes } = splitDuration(seconds);
  return hours > 0 ? `${hours} h ${minutes}` : `${minutes} min`;
}

// ── Tag aggregation ──────────────────────────────────────────────────

/**
 * Returns up to 3 most common muscle-group tags for a workout's exercises.
 * Excludes equipment tags (BB, DB, FT) and Warmup.
 */
export function getWorkoutTags(workoutSets: SetWithRow[], allExercises: ExerciseWithRow[]): string[] {
  if (workoutSets.length === 0) return [];

  // Unique exercise IDs in this workout
  const exerciseIds = new Set(workoutSets.map((s) => s.exercise_id));

  // Count tag occurrences across exercises (not sets)
  const tagCounts = new Map<string, number>();
  for (const ex of allExercises) {
    if (!exerciseIds.has(ex.id)) continue;
    const tags = ex.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    for (const tag of tags) {
      if (EQUIPMENT_TAGS.has(tag)) continue;
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  // Sort by count desc, then alphabetically for ties
  return Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([tag]) => tag);
}

// ── Planned workout scheduling (issue #99) ───────────────────────────

/** Whole-day difference between two 'YYYY-MM-DD' strings (b - a), local time. */
function dayDiff(fromStr: string, toStr: string): number {
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T00:00:00');
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Formats a planned workout's scheduled date for display on its card.
 *
 * Today/Tomorrow/Yesterday read relatively; dates 2–6 days out get a weekday
 * so the user can plan around them; everything else falls back to a short
 * date, carrying the year only when it differs from the current one.
 */
export function formatPlannedDate(dateStr: string, todayStr: string): string {
  const diff = dayDiff(todayStr, dateStr);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';

  const date = new Date(dateStr + 'T00:00:00');
  const sameYear = date.getFullYear() === new Date(todayStr + 'T00:00:00').getFullYear();

  // 2–6 days out: weekday is more useful than the bare date
  if (diff >= 2 && diff <= 6) {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** True when a planned workout's scheduled date has already passed. */
export function isOverdue(dateStr: string, todayStr: string): boolean {
  return dateStr < todayStr;
}

/**
 * Orders planned workouts soonest-first. A single ascending date sort also
 * satisfies "overdue above upcoming", since past dates sort before today.
 * Ties break on `created` then `id` so the order is stable across renders.
 */
export function sortPlannedWorkouts(workouts: WorkoutWithRow[]): WorkoutWithRow[] {
  return [...workouts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created) || a.id.localeCompare(b.id),
  );
}

// ── Card effort indicator (#113) ─────────────────────────────────────

/** `"5 exercises"` / `"1 exercise"`. */
export function pluralExercise(n: number): string {
  return `${n} exercise${n !== 1 ? 's' : ''}`;
}

/**
 * The spoken form of a workout's session effort, or `''` when nobody said.
 *
 * `''` is a legitimate permanent state (#101), so an unrated workout adds
 * nothing to its label rather than announcing "no effort" — which would be a
 * claim the data does not make.
 */
export function effortForSpeech(effort: Effort | ''): string {
  return effort ? `${effort.toLowerCase()} effort` : '';
}

/**
 * The full `aria-label` for a completed workout card.
 *
 * Lives here, and is the single source for the label, because the visible card
 * and its label are assembled from the same parts. When they were two separate
 * expressions in the screen, adding one optional part meant getting the
 * separator right twice.
 *
 * Effort is appended last so the opening of the label stays stable — screen
 * reader users scan these by their first words, and an unrated card's label is
 * unchanged from what it has always been. Provenance (#157) goes after it for
 * the same reason: a manual card, most of them, keeps exactly its old label.
 */
export function workoutCardAriaLabel(w: WorkoutWithRow, exerciseCount: number): string {
  return [
    w.name || w.type,
    w.type,
    w.date,
    formatDuration(w.elapsed_seconds),
    exerciseCount > 0 ? pluralExercise(exerciseCount) : '',
    effortForSpeech(w.effort),
    provenanceSpeech(w),
  ]
    .filter(Boolean)
    .join(', ');
}
