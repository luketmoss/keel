// A usual logged as a group (#885): how a day's entries fall into groups, when a group has changed from its usual, what
// the Update item saves, and the words for each. Display and wiring only: the API stores every figure and does every
// write; the one sum here is the group heading's total of its entries' stored snapshots, which no read gives.
import type { Food, FoodLogEntry, Slot, Usual, UsualInput, UsualLine, UsualLineInput, UsualOption } from '../api/types';
import { labelOf } from '../library/usuals-store';
import { fractionQty } from './amount-edit';

/** A day's meal as the card lists it: a loose entry, or the entries sharing a group, where the first of them sits. */
export type DayItem =
  { kind: 'entry'; entry: FoodLogEntry } | { kind: 'group'; id: string; name: string; entries: FoodLogEntry[] };

/** Entries are in `logged_at` order; a group sits where its first entry would, and keeps that order inside. */
export function dayItems(mine: FoodLogEntry[]): DayItem[] {
  const out: DayItem[] = [];
  const groups = new Map<string, Extract<DayItem, { kind: 'group' }>>();
  for (const e of mine) {
    const id = e.group_id ?? '';
    if (!id) {
      out.push({ kind: 'entry', entry: e });
      continue;
    }
    const g = groups.get(id);
    if (g) g.entries.push(e);
    else {
      const made = { kind: 'group' as const, id, name: e.group_name ?? '', entries: [e] };
      groups.set(id, made);
      out.push(made);
    }
  }
  return out;
}

/** The group's total kcal: its entries' stored snapshots summed, null when none of them has any. */
export function groupKcal(entries: FoodLogEntry[]): number | null {
  const known = entries.filter((e) => typeof e.kcal === 'number');
  return known.length ? known.reduce((t, e) => t + e.kcal!, 0) : null;
}

/** The usual a group came from, as the app has loaded it; null for a group with none, or one that was deleted. */
export function usualOf(entries: FoodLogEntry[], usuals: Usual[]): Usual | null {
  const id = entries.find((e) => e.usual_id)?.usual_id;
  return (id && usuals.find((u) => u.id === id)) || null;
}

/** A group came from a usual (its entries still carry the link, which deleting the usual clears). */
export const fromUsual = (entries: FoodLogEntry[]) => entries.some((e) => !!e.usual_id);

const same = (qty: number | null, unit: string, o: { qty: number | null; unit: string }) =>
  qty !== null && o.qty !== null && Math.abs(qty - o.qty) < 1e-9 && unit === o.unit;

const amountText = (qty: number | null, unit: string) => `${fractionQty(qty ?? 0)} ${unit}`;

/** The line a pick-one entry is on: the options, and its logged one. */
export function lineOf(entry: FoodLogEntry, usual: Usual | null): UsualLine | null {
  if (!usual || !entry.usual_line_id) return null;
  return usual.lines.find((l) => l.line_id === entry.usual_line_id) ?? null;
}

/** Where a line starts: its Always food, or its last pick (else its first option). */
function startOf(line: UsualLine): { food_id: string; qty: number | null; unit: string } {
  if (!line.options) return { food_id: line.food_id, qty: line.qty, unit: line.unit };
  return line.options.find((o) => o.food_id === line.last_pick) ?? line.options[0];
}

/**
 * How a group differs from its usual, one phrase each, in line order then what was added. A line's entry gone, an
 * Always line's food changed, an amount other than the one the usual gives that food, or an entry added is a
 * difference; picking another option of a pick-one is not.
 */
export function groupChanges(entries: FoodLogEntry[], usual: Usual, foods: Map<string, Food>): string[] {
  const out: string[] = [];
  const label = (id: string) => labelOf(foods.get(id));
  const used = new Set<string>();
  for (const line of usual.lines) {
    const e = entries.find((x) => x.usual_line_id === line.line_id && !used.has(x.id));
    const start = startOf(line);
    if (!e) {
      out.push(`${label(start.food_id)} removed`);
      continue;
    }
    used.add(e.id);
    const want = line.options
      ? line.options.find((o) => o.food_id === e.food_id)
      : e.food_id === line.food_id
        ? line
        : null;
    if (!want) {
      out.push(`${label(e.food_id)} instead of ${label(start.food_id)}`);
    } else if (!same(e.qty, e.unit, { qty: want.qty, unit: want.unit })) {
      out.push(`${label(e.food_id)} ${amountText(e.qty, e.unit)}, was ${amountText(want.qty, want.unit)}`);
    }
  }
  for (const e of entries) if (!used.has(e.id)) out.push(`${label(e.food_id)} added`);
  return out;
}

/**
 * What Update the usual saves: the group's entries as the lines. A line keeps its id and, for a pick-one, its other
 * options, with the picked one at the amount the group has and as the last pick. An entry with no line is a new one,
 * and a line with no entry is dropped.
 */
export function updatedUsual(entries: FoodLogEntry[], usual: Usual): UsualInput {
  const lines: UsualLineInput[] = [];
  const used = new Set<string>();
  for (const line of usual.lines) {
    const e = entries.find((x) => x.usual_line_id === line.line_id && !used.has(x.id));
    if (!e) continue;
    used.add(e.id);
    const now: UsualOption = { food_id: e.food_id, qty: e.qty, unit: e.unit };
    if (line.options && line.options.some((o) => o.food_id === e.food_id)) {
      lines.push({
        line_id: line.line_id,
        options: line.options.map((o) => (o.food_id === e.food_id ? now : { ...o })),
        last_pick: e.food_id,
      });
    } else lines.push({ line_id: line.line_id, ...now });
  }
  for (const e of entries) {
    if (!used.has(e.id) && e.food_id) lines.push({ food_id: e.food_id, qty: e.qty, unit: e.unit });
  }
  return { id: usual.id, name: usual.name, slot: usual.slot, lines };
}

/** `Added Oatmeal · 4 items. Change anything below.` */
export function addedToast(name: string, n: number): string {
  return `Added ${name} · ${n === 1 ? '1 item' : `${n} items`}. Change anything below.`;
}

/** An option's kcal at its own amount, worked out from the food for the list; null when the food has no nutrition. */
export function optionKcal(food: Food | undefined, o: UsualOption): number | null {
  if (!food || typeof food.kcal_100g !== 'number') return null;
  const per = o.unit === 'g' ? 1 : food.servings_json?.find((s) => s.name === o.unit)?.g;
  return typeof per === 'number' ? (food.kcal_100g * o.qty * per) / 100 : null;
}

/** The usuals for a meal's Add sheet: those usually for this meal first, then the rest, each most recently used first. */
export function usualsFor(usuals: Usual[], slot: Slot, q: string): Usual[] {
  const needle = q.trim().toLowerCase();
  const byUse = (a: Usual, b: Usual) => {
    if (a.last_used !== b.last_used) {
      if (!a.last_used) return 1;
      if (!b.last_used) return -1;
      return a.last_used < b.last_used ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  };
  return usuals
    .filter((u) => !needle || u.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.slot === slot) - Number(a.slot === slot) || byUse(a, b));
}
