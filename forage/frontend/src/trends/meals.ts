// #915: the numbers behind the Meals tab, from `getFoodLogTotals` days read with `by_meal`
// (forage/docs/design/915-trends-meals.md). Pure, like energy.ts and series.ts: a meal-day is a slot on a counted day
// (through yesterday, a day with calories) whose kcal is known. Nothing is ever 0 for "not known".
import { SLOTS, type FoodLogDay } from '../api/types';
import { addDays } from '../plan/dates';
import { largestRemainder } from '../ui/macro-math';
import { daysBetween, mondayOf } from './energy';

/** Slots in display order: the five known, then any name from before a rename, in the order first seen. */
export function slotOrder(byDate: Map<string, FoodLogDay>, from: string, to: string): string[] {
  const order: string[] = [...SLOTS];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    for (const m of byDate.get(date)?.meals ?? []) if (!order.includes(m.slot)) order.push(m.slot);
  }
  return order;
}

/** The CSS name of a slot's colour; any name that is not one of the five is the muted one. */
export function slotClass(slot: string): string {
  switch (slot) {
    case 'Breakfast':
      return 'slot-breakfast';
    case 'Lunch':
      return 'slot-lunch';
    case 'Dinner':
      return 'slot-dinner';
    case 'After dinner':
      return 'slot-after-dinner';
    case 'Snacks':
      return 'slot-snacks';
    default:
      return 'slot-other';
  }
}

/** The CSS colour a hatched segment of the slot is striped in. */
export function slotColor(slot: string): string {
  return slotClass(slot) === 'slot-other' ? 'var(--color-text-muted)' : `var(--color-${slotClass(slot)})`;
}

export interface SlotStat {
  slot: string;
  /** Meal-days: counted days this slot had calories. */
  days: number;
  total: number;
  /** Mean kcal on the days it was eaten, to the whole number; null when never eaten. */
  average: number | null;
  /** Whole percentage of all meals' calories; the shares add to 100. */
  pct: number;
  /** `<1%` for a real value that rounds to 0. */
  shareText: string;
}

export interface TypicalDay {
  /** Counted days: through yesterday, with calories. */
  counted: number;
  slots: SlotStat[];
  /** Meal-days whose meal is low (some items have no nutrition). */
  low: number;
}

export function typicalDay(byDate: Map<string, FoodLogDay>, from: string, today: string): TypicalDay {
  const order = slotOrder(byDate, from, addDays(today, -1));
  const sums = new Map(order.map((s) => [s, { days: 0, total: 0 }]));
  let counted = 0;
  let low = 0;
  for (let date = from; date < today; date = addDays(date, 1)) {
    const d = byDate.get(date);
    if (!d || d.kcal === null) continue;
    counted++;
    for (const m of d.meals ?? []) {
      if (m.kcal === null) continue;
      const s = sums.get(m.slot)!;
      s.days++;
      s.total += m.kcal;
      if (m.partial) low++;
    }
  }
  const pcts = largestRemainder(order.map((s) => sums.get(s)!.total));
  const slots = order.map((slot, i): SlotStat => {
    const { days, total } = sums.get(slot)!;
    return {
      slot,
      days,
      total,
      average: days ? Math.round(total / days) : null,
      pct: pcts[i],
      shareText: total > 0 && pcts[i] === 0 ? '<1%' : `${pcts[i]}%`,
    };
  });
  return { counted, slots, low };
}

export interface MealPart {
  slot: string;
  /** null: entries, but no calories. */
  kcal: number | null;
  partial: boolean;
}

export interface MealDay {
  date: string;
  /** Something was logged (the date is in `days`). */
  logged: boolean;
  today: boolean;
  /** The meals logged, in slot order. */
  meals: MealPart[];
  /** What the stack shows: the sum of the meals' calories; null for a gap (nothing, or no calories). */
  total: number | null;
}

/** One point per day from `from` to `to`, its meals in `order`. */
export function buildMealDays(
  byDate: Map<string, FoodLogDay>,
  from: string,
  to: string,
  today: string,
  order: string[],
): MealDay[] {
  const out: MealDay[] = [];
  const n = daysBetween(from, to) + 1;
  for (let i = 0; i < n; i++) {
    const date = addDays(from, i);
    const d = byDate.get(date);
    const meals = (d?.meals ?? [])
      .map((m): MealPart => ({ slot: m.slot, kcal: m.kcal, partial: m.kcal !== null && m.partial }))
      .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
    const known = d && d.kcal !== null ? meals.filter((m) => m.kcal !== null) : [];
    const total = known.reduce((t, m) => t + m.kcal!, 0);
    out.push({ date, logged: !!d, today: date === today, meals, total: known.length && total > 0 ? total : null });
  }
  return out;
}

export interface MealWeek {
  /** The Monday. */
  date: string;
  /** Mean kcal a day per slot over the week's counted days; null for a slot not eaten that week. */
  perSlot: { slot: string; kcal: number | null; partial: boolean }[];
  /** The stack's height; null for a gap. */
  total: number | null;
  logged: number;
  /** Counted days of the week inside the range. */
  days: number;
}

/** Monday to Sunday weeks: each slot's sum over the week's counted days, over the week's counted days with calories. */
export function buildMealWeeks(days: MealDay[], byDate: Map<string, FoodLogDay>, order: string[]): MealWeek[] {
  const weeks = new Map<string, MealDay[]>();
  for (const d of days) {
    const key = mondayOf(d.date);
    weeks.set(key, [...(weeks.get(key) ?? []), d]);
  }
  return [...weeks].map(([date, mine]) => {
    const c = mine.filter((d) => !d.today);
    const logged = c.filter((d) => byDate.get(d.date)?.kcal != null);
    const perSlot = order.map((slot) => {
      let sum = 0;
      let eaten = false;
      let partial = false;
      for (const d of logged) {
        const m = d.meals.find((x) => x.slot === slot && x.kcal !== null);
        if (!m) continue;
        eaten = true;
        sum += m.kcal!;
        partial = partial || m.partial;
      }
      return { slot, kcal: eaten && logged.length ? sum / logged.length : null, partial };
    });
    const total = perSlot.reduce((t, s) => t + (s.kcal ?? 0), 0);
    return { date, perSlot, total: total > 0 ? total : null, logged: logged.length, days: c.length };
  });
}
