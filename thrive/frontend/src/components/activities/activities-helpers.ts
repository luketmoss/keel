import type { WorkoutWithRow, SetWithRow, ExerciseWithRow, Effort, WorkoutType } from '../../api/types';
import { metersToMiles, metersToFeet, parse } from '../../api/units';
import { secondsToMinutes } from '../../api/duration';
import { provenanceSpeech } from '../../api/provenance';
import { spokenGroups } from './muscle-regions';

// ── Equipment / non-muscle tags to exclude from card pills ───────────
export const EQUIPMENT_TAGS = new Set(['BB', 'DB', 'FT', 'Warmup']);

// ── Week grouping (#528) ─────────────────────────────────────────────

export interface WorkoutGroup {
  /** The Monday that starts the week, 'YYYY-MM-DD'. */
  monday: string;
  /** "This week", "Last week" or the date range. */
  label: string;
  workouts: WorkoutWithRow[];
}

/** A 'YYYY-MM-DD' date moved by whole calendar days. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

/** The Monday on or before a 'YYYY-MM-DD' date, as 'YYYY-MM-DD'. */
export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toLocalDateStr(d);
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 5 – 11", "Sep 29 – Oct 5", or "Dec 29, 2025 – Jan 4" for the week starting `monday`. */
export function weekRange(monday: string): string {
  const start = new Date(monday + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startText = `${SHORT_MONTHS[start.getMonth()]} ${start.getDate()}`;
  if (start.getFullYear() !== end.getFullYear()) {
    return `${startText}, ${start.getFullYear()} – ${SHORT_MONTHS[end.getMonth()]} ${end.getDate()}`;
  }
  if (start.getMonth() !== end.getMonth()) return `${startText} – ${SHORT_MONTHS[end.getMonth()]} ${end.getDate()}`;
  return `${startText} – ${end.getDate()}`;
}

/**
 * Groups workouts into Monday-to-Sunday weeks, newest week first. A week's
 * heading is "This week", "Last week" or its date range. Each workout is in
 * exactly one group; the order of workouts within a group is preserved.
 */
export function groupWorkoutsByWeek(workouts: WorkoutWithRow[], todayStr: string): WorkoutGroup[] {
  const thisMonday = mondayOf(todayStr);
  const lastMonday = addDays(thisMonday, -7);
  const groups = new Map<string, WorkoutWithRow[]>();
  for (const w of workouts) {
    const monday = mondayOf(w.date);
    const arr = groups.get(monday);
    if (arr) arr.push(w);
    else groups.set(monday, [w]);
  }
  return [...groups.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((monday) => ({
      monday,
      label: monday === thisMonday ? 'This week' : monday === lastMonday ? 'Last week' : weekRange(monday),
      workouts: groups.get(monday)!,
    }));
}

/** A week heading's totals: "7 · 6 h 40 · 23.2 mi". Parts with nothing to sum are left out. */
export function weekTotals(ws: WorkoutWithRow[]): string {
  const sum = summarizeMonth(ws);
  return [
    String(sum.count),
    sum.timed > 0 ? formatMonthTime(sum.seconds) : '',
    sum.miles !== null && sum.miles > 0 ? `${sum.miles} mi` : '',
  ]
    .filter(Boolean)
    .join(' · ');
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

// ── Activity card (#528) ─────────────────────────────────────────────

const METERS_PER_MILE = 1609.344;
const DISTANCE_TYPES: readonly WorkoutType[] = ['bike', 'hike', 'run', 'walk'];

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One piece of a card's stats line: what is drawn, and what is spoken. */
export interface StatPart {
  text: string;
  spoken: string;
  /** Drawn in the effort's colour. */
  effort?: Effort;
}

export interface CardFigure {
  value: string;
  unit: string;
  spoken: string;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** The distance in metres when it is a real, positive measurement; blank and 0 are neither. */
export function distanceMeters(w: WorkoutWithRow): number | null {
  const m = parse(w.distance_m);
  return m !== null && m > 0 ? m : null;
}

/** Whether the big figure is a distance: a bike, hike, run or walk that has one. */
export function hasDistanceFigure(w: WorkoutWithRow): boolean {
  return DISTANCE_TYPES.includes(w.type) && distanceMeters(w) !== null;
}

/** 6472 -> "1:47:52", 2873 -> "47:53". */
export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 6472 -> "1 hour 47 minutes", 2873 -> "47 minutes", 40 -> "40 seconds". */
export function spokenElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${plural(h, 'hour')} ${plural(m, 'minute')}` : plural(h, 'hour');
  if (m > 0) return plural(m, 'minute');
  return plural(totalSeconds, 'second');
}

/** 760 -> "12 minutes 40 seconds", 480 -> "8 minutes": a pace keeps its seconds. */
export function spokenPace(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  if (m === 0) return plural(sec, 'second');
  return sec === 0 ? plural(m, 'minute') : `${plural(m, 'minute')} ${plural(sec, 'second')}`;
}

/** The card's one big figure, or null when there is neither a distance nor a duration. */
export function cardFigure(w: WorkoutWithRow): CardFigure | null {
  if (hasDistanceFigure(w)) {
    const miles = metersToMiles(w.distance_m)!;
    const value = miles.toFixed(1);
    return { value, unit: 'mi', spoken: `${value} ${miles === 1 ? 'mile' : 'miles'}` };
  }
  const mins = secondsToMinutes(w.elapsed_seconds);
  if (mins === null) return null;
  if (mins < 60) return { value: String(mins), unit: 'min', spoken: plural(mins, 'minute') };
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return {
    value: `${h}:${String(m).padStart(2, '0')}`,
    unit: 'h',
    spoken: m === 0 ? plural(h, 'hour') : `${plural(h, 'hour')} ${plural(m, 'minute')}`,
  };
}

/** The first line of a note, trimmed; '' when there is none. */
export function firstLine(note: string): string {
  return note.split(/\r?\n/)[0].trim();
}

function effortPart(effort: Effort): StatPart {
  return { text: effort.toLowerCase(), spoken: effort.toLowerCase(), effort };
}

/**
 * A card's stats line, one part per piece of data that exists. A blank source
 * leaves its part out; nothing is ever drawn as 0 or a dash (#101).
 */
export function cardStats(w: WorkoutWithRow): StatPart[] {
  const parts: StatPart[] = [];
  if (DISTANCE_TYPES.includes(w.type)) {
    const meters = distanceMeters(w);
    const secs = parse(w.elapsed_seconds);
    // Elapsed time is a stat only when the figure is the distance; speed and pace need both values.
    if (meters !== null && secs !== null && secs > 0) {
      const total = Math.round(secs);
      parts.push({ text: formatClock(total), spoken: spokenElapsed(total) });
      const miles = meters / METERS_PER_MILE;
      if (w.type === 'bike') {
        const mph = (miles / (secs / 3600)).toFixed(1);
        parts.push({ text: `${mph} mph`, spoken: `${mph} miles per hour` });
      } else {
        const perMile = Math.round(secs / miles);
        const pace = `${Math.floor(perMile / 60)}:${String(perMile % 60).padStart(2, '0')}`;
        parts.push({ text: `${pace} /mi`, spoken: `${spokenPace(perMile)} per mile` });
      }
    }
    const feet = metersToFeet(w.ascent_m);
    if (feet !== null && feet > 0) {
      const f = feet.toLocaleString('en-US');
      parts.push({ text: `↑${f} ft`, spoken: `${f} feet climbed` });
    }
  } else if (w.type === 'weight') {
    const hr = parse(w.avg_hr);
    if (hr !== null && hr > 0) {
      parts.push({ text: `${Math.round(hr)} bpm`, spoken: `average ${Math.round(hr)} beats per minute` });
    }
    if (w.effort) parts.push(effortPart(w.effort));
  } else if (w.type === 'stretch') {
    if (w.effort) parts.push(effortPart(w.effort));
    const line = firstLine(w.notes);
    if (line) parts.push({ text: line, spoken: line });
  }
  return parts;
}

/** The card's day: "Today", "Yesterday", otherwise the three-letter weekday. */
export function cardDay(dateStr: string, todayStr: string): string {
  const diff = dayDiff(todayStr, dateStr);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return WEEKDAYS_SHORT[new Date(dateStr + 'T00:00:00').getDay()];
}

/** "Sunday October 18", for the accessible name. */
export function spokenDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${WEEKDAYS_LONG[d.getDay()]} ${monthName(monthOf(dateStr))} ${d.getDate()}`;
}

/**
 * The card's accessible name (#528): name, type, day, the figure, each stats
 * part, then provenance (#157). Parts with no value are left out. The visible
 * text and this label come from the same functions, so they cannot drift.
 */
export function activityCardAriaLabel(w: WorkoutWithRow, worked: readonly string[] = []): string {
  return [
    w.name || w.type,
    w.type,
    spokenDay(w.date),
    cardFigure(w)?.spoken ?? '',
    ...cardStats(w).map((p) => p.spoken),
    provenanceSpeech(w),
    worked.length > 0 ? `worked ${spokenGroups(worked)}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

// ── Up next (#528) ───────────────────────────────────────────────────

/** Planned workouts for the Up next row: overdue first (oldest first), then by date, then sheet order. */
export function upNextOrder(planned: WorkoutWithRow[]): WorkoutWithRow[] {
  return [...planned].sort((a, b) => a.date.localeCompare(b.date) || a.sheetRow - b.sheetRow);
}

/** The Up next card's date line: "TODAY", "TUE 21", or for an overdue plan "OCT 18". */
export function upNextDate(dateStr: string, todayStr: string): string {
  if (dateStr === todayStr) return 'TODAY';
  const d = new Date(dateStr + 'T00:00:00');
  if (dateStr < todayStr) return `${SHORT_MONTHS[d.getMonth()].toUpperCase()} ${d.getDate()}`;
  return `${WEEKDAYS_SHORT[d.getDay()].toUpperCase()} ${d.getDate()}`;
}
