// One day of one metric, written one way (#247 AC2). The table's cells and the
// chart's readout both come from `dayCells`, so they cannot disagree, and the
// screen-reader announcement is built from the same pieces.
//
// Charts show and never conclude: only the value, never a comparison.

import type { TrendMetric, TrendPoint } from './metrics';
import { rowDate, type MetricSeries } from './series';
import { sourceWordsLower } from './held';

/** A blank value or a missing average. Never `0`. */
export const BLANK = '—';

export const withUnit = (text: string, unit: string) => (unit ? `${text} ${unit}` : text);

export interface DayCells {
  /** The value as `metric.format` prints it (no unit), or BLANK. */
  value: string;
  /** The point's `partial` sentence, when it has one. */
  partial?: string;
  /** The readout's short form of `partial`, "(1 of 2)" (#303); the table and announcement keep `partial`. */
  partialShort?: string;
  /** The average as formatted, or BLANK; null when the average is Off. */
  average: string | null;
  /** A held value's words for the day (#772): its source on the entry's day, else "since Nov 7"; the readout and announcement carry it. */
  note?: string;
  /** The table's version: the source on an entry's day, or why there is no value. Never "since". */
  tableNote?: string;
}

const byDateCache = new WeakMap<MetricSeries, ReadonlyMap<string, TrendPoint>>();

/**
 * The series' points keyed by date. Built once per series (#270): a series is
 * never mutated, so every readout and announcement shares one map. Read only.
 */
export function pointsByDate(series: MetricSeries): ReadonlyMap<string, TrendPoint> {
  let m = byDateCache.get(series);
  if (!m) {
    m = new Map(series.points.map((p) => [p.date, p]));
    byDateCache.set(series, m);
  }
  return m;
}

/** What the table prints for `date` in this metric's columns. */
export function dayCells(
  metric: TrendMetric,
  series: MetricSeries,
  byDate: ReadonlyMap<string, TrendPoint>,
  date: string,
  avgDays: number,
): DayCells {
  const p = byDate.get(date);
  const avg = series.average.get(date);
  const cells: DayCells = {
    value: p ? metric.format(p.value) : BLANK,
    partial: p?.partial || undefined,
    partialShort: p?.partialShort || undefined,
    // A held value has no average, whatever the control says (#772).
    average: avgDays > 0 && !series.held ? (avg !== undefined ? metric.format(avg) : BLANK) : null,
  };
  const held = series.held?.cells.get(date);
  if (held) {
    // In effect that day: the entry's own value on its day and every day after it until the next entry.
    cells.value = held.value === null ? BLANK : metric.format(held.value);
    const noWeight = 'no weight that day';
    cells.note =
      held.value === null ? noWeight : held.entry ? sourceWordsLower(held.source) : `since ${held.sinceText}`;
    if (held.entry) cells.tableNote = held.value === null ? noWeight : sourceWordsLower(held.source);
  }
  return cells;
}

/** "53 bpm", or "—". The unit is never put beside a blank. */
export const valueText = (metric: TrendMetric, c: DayCells) =>
  c.value === BLANK ? BLANK : withUnit(c.value, metric.unit);

/** "7-day avg 52 bpm", or "7-day avg —"; null when the average is Off. */
export function averageText(metric: TrendMetric, c: DayCells, avgDays: number): string | null {
  if (c.average === null) return null;
  return `${avgDays}-day avg ${c.average === BLANK ? BLANK : withUnit(c.average, metric.unit)}`;
}

/** Line 2 of a card's readout: "53 bpm · 7-day avg 52 bpm", with any partial coverage, short form (#303). */
export function readoutLine(metric: TrendMetric, c: DayCells, avgDays: number): string {
  const parts = [valueText(metric, c)];
  const partial = c.partialShort ?? c.partial;
  if (partial) parts[0] += ` ${partial}`;
  if (c.note) parts.push(c.note);
  const avg = averageText(metric, c, avgDays);
  if (avg) parts.push(avg);
  return parts.join(' · ');
}

/** The date as the table's row header writes it: "Fri, Aug 28". */
export const readoutDate = rowDate;

export interface AnnouncePart {
  metric: TrendMetric;
  series: MetricSeries;
}

/**
 * The status region's sentence: "Fri, Aug 28. Resting HR 53 bpm, 7-day avg
 * 52 bpm. HRV —." One clause per card, in group order.
 */
export function announceText(date: string, today: string, parts: readonly AnnouncePart[], avgDays: number): string {
  const clauses = parts.map(({ metric, series }) => {
    const c = dayCells(metric, series, pointsByDate(series), date, avgDays);
    const bits = [`${metric.label} ${valueText(metric, c)}${c.partial ? ` ${c.partial}` : ''}`];
    if (c.note) bits.push(c.note);
    const avg = averageText(metric, c, avgDays);
    if (avg) bits.push(avg);
    return `${bits.join(', ')}.`;
  });
  return [`${readoutDate(date, today)}.`, ...clauses].join(' ');
}
