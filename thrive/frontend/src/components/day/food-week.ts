// #714 - the seven bars under the Food card's figures: the 7 days ending on the viewed day, from
// what Forage reported. Pure. A day Forage did not report, or reported with no kcal at all, is a
// gap, never a zero-height bar: the bar is drawn from kcal and a day with nothing logged has none.

import type { FoodDay } from '../../api/forage-food';
import { weekdayLetter, weekdayName } from '../../day/format';
import { foodWindowDates } from '../../state/food';

export interface FoodWeekDay {
  date: string;
  /** The weekday initial under the bar. */
  letter: string;
  /** Bar height as a fraction of the chart, 0 to 1, or null for a gap. */
  height: number | null;
  partial: boolean;
  /** What a screen reader says: "Monday, 1,240 kcal", "Tuesday, nothing logged", "Wednesday, 980 kcal, low". */
  name: string;
}

/** Whole kcal or grams with a thousands separator: 1240.4 is "1,240". */
export function wholeNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function foodWeek(date: string, reported: readonly FoodDay[]): FoodWeekDay[] {
  const byDate = new Map(reported.map((d) => [d.date, d]));
  const dates = foodWindowDates(date);
  const top = Math.max(0, ...dates.map((d) => byDate.get(d)?.kcal ?? 0));
  return dates.map((d) => {
    const day = byDate.get(d);
    const weekday = weekdayName(d);
    const base = { date: d, letter: weekdayLetter(d) };
    if (!day) return { ...base, height: null, partial: false, name: `${weekday}, nothing logged` };
    if (day.kcal === null) return { ...base, height: null, partial: day.partial, name: `${weekday}, no nutrition yet` };
    const height = Math.max(0.04, top > 0 ? day.kcal / top : 0); // a reported day always shows a bar
    return {
      ...base,
      height,
      partial: day.partial,
      name: `${weekday}, ${wholeNumber(day.kcal)} kcal${day.partial ? ', low' : ''}`,
    };
  });
}
