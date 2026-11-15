// #913: the Trends screen's data and choices. The screen reads the signals; this file owns the fetching and the
// remembered controls. One `getFoodLogTotals` read covers the widest span shown; a shorter range slices it.
import { signal } from '@preact/signals';
import type { ForageApi } from '../api/client';
import type { FoodLogDay } from '../api/types';
import { localDate } from '../cook/format';
import { addDays } from '../plan/dates';
import { MAX_WINDOW, rangeFrom } from './energy';
import { AVERAGES, DEFAULT_AVERAGE, DEFAULT_RANGE, RANGES, type AverageId, type RangeId } from './trends-types';

export type TrendsState = 'loading' | 'ready' | 'error';

export const RANGE_KEY = 'forage-trends-range';
export const AVERAGE_KEY = 'forage-trends-average';
/** A `from` before anything can have been logged, for All: the client has no open-ended form. */
export const ALL_FROM = '2000-01-01';

// Every storage touch is wrapped: a missing or blocked localStorage gives the defaults and never breaks the screen.
function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignored: the choice holds for the visit.
  }
}

/** The range on screen: the stored choice, or the one a link asked for on this visit. */
export const viewRange = signal<RangeId>(read(RANGE_KEY, RANGES, DEFAULT_RANGE));
export const viewAverage = signal<AverageId>(read(AVERAGE_KEY, AVERAGES, DEFAULT_AVERAGE));
export const trendsState = signal<TrendsState>('loading');
/** The days read, by date. A date with nothing logged is absent. */
export const trendsDays = signal<Map<string, FoodLogDay>>(new Map());
/** The device's today when the data was read. */
export const trendsToday = signal(localDate());

/** What the held days cover: from this date through `trendsToday`. */
let coveredFrom: string | null = null;
let latest = 0;

/** A visit to Trends: its range is the link's, if it had one (and then it is not stored), else the stored one. */
export function applyTrendsRoute(range: RangeId | null): void {
  viewRange.value = range ?? read(RANGE_KEY, RANGES, DEFAULT_RANGE);
  viewAverage.value = read(AVERAGE_KEY, AVERAGES, DEFAULT_AVERAGE);
}

export function chooseRange(range: RangeId): void {
  viewRange.value = range;
  write(RANGE_KEY, range);
}

export function chooseAverage(avg: AverageId): void {
  viewAverage.value = avg;
  write(AVERAGE_KEY, avg);
}

/** The first date the range needs, with the average's look-back. */
function needFrom(range: RangeId, today: string): string {
  return range === 'All' ? ALL_FROM : addDays(rangeFrom(range, today), -(MAX_WINDOW - 1));
}

/**
 * Read what `range` needs, unless the held days already cover it. A slower, older answer never wins: the last
 * request is the only one that lands.
 */
export async function loadTrends(api: ForageApi, range: RangeId, force = false): Promise<void> {
  const today = localDate();
  const from = needFrom(range, today);
  if (!force && coveredFrom !== null && coveredFrom <= from && trendsToday.value === today) {
    latest++;
    trendsState.value = 'ready';
    return;
  }
  const seq = ++latest;
  trendsState.value = 'loading';
  try {
    const totals = await api.getFoodLogTotals(from, today);
    if (seq !== latest) return;
    trendsDays.value = new Map(totals.days.map((d) => [d.date, d]));
    trendsToday.value = today;
    coveredFrom = from;
    trendsState.value = 'ready';
  } catch {
    if (seq !== latest) return;
    trendsState.value = 'error';
  }
}

/** Forget what was read: Trends reads fresh each visit. */
export function resetTrends(): void {
  latest++;
  coveredFrom = null;
  trendsDays.value = new Map();
  trendsState.value = 'loading';
}

export function _resetTrends(): void {
  resetTrends();
  viewRange.value = read(RANGE_KEY, RANGES, DEFAULT_RANGE);
  viewAverage.value = read(AVERAGE_KEY, AVERAGES, DEFAULT_AVERAGE);
  trendsToday.value = localDate();
}
