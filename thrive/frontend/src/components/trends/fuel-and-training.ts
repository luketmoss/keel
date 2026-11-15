// Fuel and training (#892): the average kcal eaten on ride, lift and rest days. Pure; the card draws it.
//
// A date counts only when Forage reported it with a kcal value, it is not low (`partial`), it is in
// from..to and it is not today. A gap is never 0: it enters neither the sum nor the count. The kinds
// come from ride-days.ts, the one rule #891's shade uses.

import type { FoodDay } from '../../api/forage-food';
import { isRideDay, isLiftDay, isRestDay } from './ride-days';

type SummaryLike = { date?: string; activity_types?: string; activity_count?: string };

export type FuelKind = 'ride' | 'lift' | 'rest';

export interface FuelRow {
  kind: FuelKind;
  label: string;
  /** The mean kcal of the counted days, or null with none. */
  avg: number | null;
  count: number;
}

export interface Fuel {
  rows: FuelRow[];
  /** Low days that would have been in a row, left out. */
  lowLeftOut: number;
  /** Days with food and activities but no ride or lift: in no row. */
  otherDays: number;
}

const LABELS: Record<FuelKind, string> = { ride: 'Ride days', lift: 'Lift days', rest: 'Rest days' };

export function fuelAndTraining(
  food: readonly FoodDay[],
  summary: readonly SummaryLike[],
  from: string,
  to: string,
  today: string,
): Fuel {
  const byDate = new Map<string, SummaryLike>();
  for (const r of summary) if (r.date) byDate.set(r.date, r);
  const sums: Record<FuelKind, { total: number; count: number }> = {
    ride: { total: 0, count: 0 },
    lift: { total: 0, count: 0 },
    rest: { total: 0, count: 0 },
  };
  let lowLeftOut = 0;
  let otherDays = 0;
  const seen = new Set<string>();
  for (const d of food) {
    if (d.kcal === null || d.kcal === undefined) continue;
    if (d.date < from || d.date > to || d.date === today || seen.has(d.date)) continue;
    seen.add(d.date);
    const row = byDate.get(d.date);
    if (!row) continue;
    const kinds: FuelKind[] = [];
    if (isRideDay(row.activity_types)) kinds.push('ride');
    if (isLiftDay(row.activity_types)) kinds.push('lift');
    if (isRestDay(row.activity_count)) kinds.push('rest');
    if (d.partial) {
      if (kinds.length > 0) lowLeftOut++;
      continue;
    }
    if (kinds.length === 0) {
      otherDays++;
      continue;
    }
    for (const k of kinds) {
      sums[k].total += d.kcal;
      sums[k].count++;
    }
  }
  const rows = (['ride', 'lift', 'rest'] as const).map((kind) => ({
    kind,
    label: LABELS[kind],
    avg: sums[kind].count > 0 ? sums[kind].total / sums[kind].count : null,
    count: sums[kind].count,
  }));
  return { rows, lowLeftOut, otherDays };
}
