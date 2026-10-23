// #551 - the seven bars under each Water, Coffee, Alcohol and Unwind tile: the 7 days ending on
// the viewed day. Pure. Water is the day's ml, alcohol its count; the tile turns
// them into heights (`barHeight`) and words (`weekLabel`).
//
// A day before the first drink ever logged is `null`, an empty slot; a later day
// with none is `0`, a zero-height bar (#521's rule). The viewed day is read from
// the Day's own entries, which carry the optimistic taps, the others from the
// history Trends reads, so a tap moves the highlighted bar at once.

import type { Drink, DrinkKind } from '../../api/drinks';
import { addDays } from '../../day/dates';
import { formatOz, type DayDrinks } from '../../state/drinks';
import type { HealthTabState } from '../../state/store';

export const WEEK_DAYS = 7;
/** Alcohol bars are full at this many drinks. */
export const ALCOHOL_FULL = 4;
/** Coffee bars are full at this many cups. */
export const COFFEE_FULL = 4;
/** Unwind bars are full at this many mg (#590). */
export const UNWIND_FULL = 20;

export function drinkWeek(
  kind: DrinkKind,
  date: string,
  history: HealthTabState<Drink>,
  viewed: DayDrinks | undefined,
): (number | null)[] {
  const rows = history.state === 'loaded' ? history.rows : [];
  const shown = viewed && viewed.status === 'loaded' ? viewed.entries : null;

  let first = '';
  const note = (d: string) => {
    if (d && (first === '' || d < first)) first = d;
  };
  for (const r of rows) note(r.date);
  for (const e of shown ?? []) note(e.date);

  const sums = new Map<string, number>();
  for (const r of rows) if (r.kind === kind) sums.set(r.date, (sums.get(r.date) ?? 0) + r.amount);
  const days: string[] = [];
  for (let i = WEEK_DAYS - 1; i >= 0; i--) days.push(addDays(date, -i));

  return days.map((d) => {
    if (first === '' || d < first) return null;
    if (d === date) {
      if (!shown) return null;
      return shown.filter((e) => e.kind === kind).reduce((sum, e) => sum + e.amount, 0);
    }
    return history.state === 'loaded' ? (sums.get(d) ?? 0) : null;
  });
}

/** A bar's height as a fraction of the chart, 0 to 1: water against the goal, alcohol and coffee against four, Unwind against 20 mg. */
export function barHeight(kind: DrinkKind, amount: number, goalMl: number): number {
  const full =
    kind === 'water' ? goalMl : kind === 'coffee' ? COFFEE_FULL : kind === 'unwind' ? UNWIND_FULL : ALCOHOL_FULL;
  if (!(full > 0) || !(amount > 0)) return 0;
  return Math.min(1, amount / full);
}

/** "Water, last 7 days: 32, 48, 64, 20, 56, 40, 8 ounces"; "no data" for an empty slot. */
export function weekLabel(kind: DrinkKind, days: readonly (number | null)[]): string {
  const spoken = days.map((v) => (v === null ? 'no data' : kind === 'water' ? formatOz(v) : String(v))).join(', ');
  if (kind === 'water') return `Water, last ${days.length} days: ${spoken} ounces`;
  if (kind === 'unwind') return `Unwind, last ${days.length} days: ${spoken} mg`;
  return kind === 'coffee'
    ? `Coffee, last ${days.length} days: ${spoken} cups`
    : `Alcohol, last ${days.length} days: ${spoken} drinks`;
}
