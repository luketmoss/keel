// #718's demo trips: the sample open trip and an earlier closed one, and building, sorting, shopping,
// closing and throwing away in memory. Building here is a small stand-in for the API's trips.js (combining
// lines by food, the defaults, the need's rounding), enough for the sample plan; the live app computes none
// of it.
import { ApiError } from '../api/client';
import type {
  AddToTripInput,
  AddToTripResult,
  Food,
  LateMeal,
  PlanEntry,
  RecipeDetail,
  StartTripInput,
  StartTripResult,
  Trip,
  TripChoice,
  TripItem,
  TripItemChange,
  TripItemResult,
  TripStore,
  TripSummary,
} from '../api/types';
import { SLOTS, TRIP_STORES } from '../api/types';
import { addDays } from '../plan/dates';
import { displayName } from '../library/food-math';
import { DEMO_CLOSED_TRIP_ITEMS, DEMO_TRIP_ITEMS, DEMO_TRIP_UNMATCHED, type DemoTripItem } from './demo-data';

const DAY = 86400000;

type StoredLine = { plan_id: string; line_id: string; text: string; amt: string; grams: number | null };
type StoredItem = Omit<TripItem, 'lines'> & { lines: StoredLine[] };
interface StoredTrip {
  id: string;
  status: 'open' | 'closed';
  through: string;
  created: string;
  closed_at: string;
  items: StoredItem[];
  unmatched: Trip['unmatched'];
}

type PlanRow = Pick<PlanEntry, 'id' | 'date' | 'slot' | 'recipe_id' | 'note' | 'trip_id' | 'updated'>;

const isStore = (c: TripChoice): c is TripStore => (TRIP_STORES as string[]).includes(c);

function seedItem(d: DemoTripItem, i: number): StoredItem {
  return {
    food_id: d.food_id,
    name: d.name,
    category: d.category,
    choice: d.choice,
    suggested: d.suggested,
    bought: !!d.bought,
    buy: '',
    mine: !!d.mine,
    need: d.lines.length ? d.need : null,
    lines: d.lines.map((l, j) => ({ ...l, line_id: `L${i + 1}-${j + 1}`, grams: null })),
  };
}

/** The demo's short version of the API's need rule. */
function needOf(lines: StoredLine[], food: Food | undefined): string {
  const weighed = lines.filter((l) => typeof l.grams === 'number');
  const unitG = food?.buy_unit && food.buy_unit_g ? food.buy_unit_g : 0;
  if (!unitG || !weighed.length) return lines.map((l) => l.amt).join(' + ');
  const grams = weighed.reduce((s, l) => s + (l.grams ?? 0), 0);
  const n = Math.max(1, Math.ceil(Math.round((grams / unitG - 0.15) * 1e6) / 1e6));
  const unit = n > 1 ? food!.buy_unit_plural || food!.buy_unit : food!.buy_unit;
  return [`about ${n} ${unit}`, ...lines.filter((l) => typeof l.grams !== 'number').map((l) => l.amt)].join(' + ');
}

export interface DemoTripDeps {
  now: number;
  today: string;
  plan: PlanRow[];
  foods: Food[];
  recipes: RecipeDetail[];
  gramsOf: (line: RecipeDetail['lines'][number], food: Food | undefined) => number | null;
}

/** The trips' part of the demo API, over the demo's own plan, foods and recipes. */
export function createDemoTrips({ now, today, plan, foods, recipes, gramsOf }: DemoTripDeps) {
  const trips: StoredTrip[] = [
    {
      id: 'tr_demo_closed',
      status: 'closed',
      through: addDays(today, 1),
      created: new Date(now - 5 * DAY).toISOString(),
      closed_at: new Date(now - 4 * DAY).toISOString(),
      items: DEMO_CLOSED_TRIP_ITEMS.map(seedItem),
      unmatched: [],
    },
    {
      id: 'tr_demo_open',
      status: 'open',
      through: addDays(today, 5),
      created: new Date(now - DAY).toISOString(),
      closed_at: '',
      items: DEMO_TRIP_ITEMS.map(seedItem),
      unmatched: [{ ...DEMO_TRIP_UNMATCHED, recipe_name: 'Weeknight chili' }],
    },
  ];
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  const recipeName = (p: PlanRow | undefined) => recipes.find((r) => r.id === p?.recipe_id)?.name ?? '';
  const mealOrder = (a: PlanRow, b: PlanRow) =>
    a.date.localeCompare(b.date) || SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot);

  /** As the API: an open trip drops the lines of meals no longer on it, and the items left with none. */
  function prune(t: StoredTrip) {
    if (t.status !== 'open') return;
    const on = new Set(plan.filter((p) => p.trip_id === t.id).map((p) => p.id));
    t.items = t.items
      .map((i) => ({ ...i, lines: i.lines.filter((l) => on.has(l.plan_id)) }))
      .filter((i) => i.lines.length || i.mine);
  }

  /** #719: recipe meals after today and through the open trip's date, on no trip. */
  function lateOf(t: StoredTrip, day = today): LateMeal[] {
    if (t.status !== 'open') return [];
    return plan
      .filter((p) => p.recipe_id && !p.trip_id && p.date > day && p.date <= t.through)
      .sort(mealOrder)
      .map((p) => ({ plan_id: p.id, recipe_name: recipeName(p), date: p.date, slot: p.slot }));
  }

  function view(t: StoredTrip, meals = plan.filter((p) => p.trip_id === t.id), day = today): Trip {
    const sorted = [...meals].sort(mealOrder);
    const items: TripItem[] = t.items
      .map((i) => ({
        ...clone(i),
        packs: foods.find((f) => f.id === i.food_id)?.packs_json ?? [],
        last_buy: foods.find((f) => f.id === i.food_id)?.last_buy ?? '',
        last_bought_on: foods.find((f) => f.id === i.food_id)?.last_bought_on ?? '',
        lines: i.lines.map((l) => {
          const p = plan.find((x) => x.id === l.plan_id);
          return {
            plan_id: l.plan_id,
            date: p?.date ?? '',
            slot: p?.slot ?? '',
            recipe_name: recipeName(p),
            line_id: l.line_id,
            text: l.text,
            amt: l.amt,
          };
        }),
      }))
      .sort(
        (a, b) =>
          Number(!a.category) - Number(!b.category) ||
          a.category.localeCompare(b.category) ||
          a.name.localeCompare(b.name),
      );
    const counts = { all: items.length, todo: 0, have: 0, ks: 0, costco: 0, other: 0, to_buy: 0, bought: 0 };
    for (const i of items) {
      if (!i.choice) counts.todo++;
      else counts[i.choice]++;
      if (isStore(i.choice)) {
        counts.to_buy++;
        if (i.bought) counts.bought++;
      }
    }
    const on = new Set(sorted.map((m) => m.id));
    return {
      id: t.id,
      status: t.status,
      through: t.through,
      created: t.created,
      closed_at: t.closed_at,
      meals: sorted.map((p) => ({
        plan_id: p.id,
        date: p.date,
        slot: p.slot,
        recipe_id: p.recipe_id,
        recipe_name: recipeName(p),
      })),
      items,
      counts,
      unmatched: t.unmatched.filter((u) => on.has(u.plan_id)),
      late_meals: lateOf(t, day),
    };
  }

  function build(id: string, through: string, meals: PlanRow[]): StoredTrip {
    const items: StoredItem[] = [];
    const unmatched: Trip['unmatched'] = [];
    for (const meal of [...meals].sort(mealOrder)) {
      const recipe = recipes.find((r) => r.id === meal.recipe_id);
      for (const line of recipe?.lines ?? []) {
        if (line.optional) continue;
        if (!line.food_id) {
          unmatched.push({ plan_id: meal.id, recipe_name: recipe!.name, line_id: line.line_id, text: line.text });
          continue;
        }
        const food = foods.find((f) => f.id === line.food_id);
        if (!food || food.never_shop) continue;
        let item = items.find((i) => i.food_id === food.id);
        if (!item) {
          const choice: TripChoice = food.usually_have ? 'have' : (food.usual_store ?? '');
          item = {
            food_id: food.id,
            name: displayName(food),
            category: food.category,
            choice,
            suggested: choice !== '',
            bought: false,
            buy: '',
            mine: false,
            need: null,
            lines: [],
          };
          items.push(item);
        }
        const amt =
          typeof line.qty === 'number'
            ? `${Math.round(line.qty * 100) / 100}${line.unit ? ` ${line.unit}` : ''}`
            : line.text;
        item.lines.push({ plan_id: meal.id, line_id: line.line_id, text: line.text, amt, grams: gramsOf(line, food) });
      }
    }
    for (const i of items)
      i.need = needOf(
        i.lines,
        foods.find((f) => f.id === i.food_id),
      );
    return { id, status: 'open', through, created: new Date().toISOString(), closed_at: '', items, unmatched };
  }

  function find(id: string): StoredTrip {
    const t = trips.find((x) => x.id === id);
    if (!t) throw new ApiError(`No trip ${id}.`, 'not_found');
    return t;
  }

  return {
    getTrip: async (day?: string): Promise<Trip | null> => {
      const t = trips.find((x) => x.status === 'open');
      if (!t) return null;
      prune(t);
      return view(t, undefined, day || today);
    },
    getClosedTrips: async (): Promise<TripSummary[]> =>
      trips
        .filter((t) => t.status === 'closed')
        .sort((a, b) => b.closed_at.localeCompare(a.closed_at))
        .map((t) => ({
          id: t.id,
          status: t.status,
          through: t.through,
          created: t.created,
          closed_at: t.closed_at,
          items: t.items.length,
          bought: t.items.filter((i) => i.bought && isStore(i.choice)).length,
          stores: TRIP_STORES.filter((s) => t.items.some((i) => i.choice === s)),
        })),
    startTrip: async (input: StartTripInput): Promise<StartTripResult> => {
      const existing = trips.find((t) => t.id === input.id);
      if (existing) return { trip: view(existing), written: false, dry_run: input.dry_run };
      const open = trips.find((t) => t.status === 'open');
      if (open) {
        throw new ApiError(`A trip is already open (${open.id}). Close it or throw it away first.`, 'trip_open');
      }
      const problems: string[] = [];
      const chosen = input.plan_ids.map((id) => {
        const p = plan.find((x) => x.id === id);
        if (!p) problems.push(`${id} is not in the plan.`);
        else if (!p.recipe_id) problems.push(`${id} is a note, not a recipe meal.`);
        else if (p.trip_id) problems.push(`${id} is already on trip ${p.trip_id}.`);
        else if (p.date <= input.today) problems.push(`${id} is dated ${p.date}, today or earlier.`);
        else if (p.date > input.through) problems.push(`${id} is dated ${p.date}, after ${input.through}.`);
        return p!;
      });
      if (problems.length) throw new ApiError(problems.join(' '), 'ineligible');
      const trip = build(input.id, input.through, chosen);
      if (input.dry_run) return { trip: view(trip, chosen), written: false, dry_run: true };
      trips.push(trip);
      for (const p of chosen) p.trip_id = trip.id;
      return { trip: view(trip), written: true, dry_run: false };
    },
    setTripItem: async (tripId: string, foodId: string, change: TripItemChange): Promise<TripItemResult> => {
      const t = find(tripId);
      if (t.status !== 'open') {
        throw new ApiError(
          change.buy !== undefined ? 'That trip is closed.' : `Trip ${t.id} is closed.`,
          'trip_closed',
        );
      }
      const item = t.items.find((i) => i.food_id === foodId);
      if (!item) throw new ApiError(`That food isn't on trip ${t.id}.`, 'not_on_trip');
      const choice = change.choice ?? item.choice;
      if (change.bought && !isStore(choice)) throw new ApiError('Only an item with a store can be bought.', 'no_store');
      let remembered = false;
      if (change.choice) {
        item.choice = change.choice;
        item.suggested = false;
        if (change.choice === 'have') item.bought = false;
        const food = foods.find((f) => f.id === foodId);
        if (food && isStore(change.choice) && food.usual_store !== change.choice) {
          food.usual_store = change.choice;
          remembered = true;
        }
      }
      if (change.bought !== undefined) item.bought = change.bought;
      if (change.buy !== undefined) item.buy = change.buy.trim().slice(0, 60);
      const out = view(t).items.find((i) => i.food_id === foodId)!;
      return remembered ? { item: out, remembered: true } : { item: out };
    },
    closeTrip: async (tripId: string): Promise<Trip> => {
      const t = find(tripId);
      if (t.status !== 'open') throw new ApiError(`Trip ${t.id} is already closed.`, 'trip_closed');
      prune(t);
      // #719: what was bought, from a store, with a buying amount is remembered on the food.
      for (const i of t.items) {
        const food = foods.find((f) => f.id === i.food_id);
        if (food && i.bought && isStore(i.choice) && i.buy) {
          food.last_buy = i.buy;
          food.last_bought_on = today;
        }
      }
      t.status = 'closed';
      t.closed_at = new Date().toISOString();
      return view(t);
    },
    discardTrip: async (tripId: string): Promise<void> => {
      const t = find(tripId);
      if (t.status !== 'open')
        throw new ApiError(`Trip ${t.id} is closed; only an open trip can be thrown away.`, 'trip_closed');
      trips.splice(trips.indexOf(t), 1);
      for (const p of plan) if (p.trip_id === t.id) p.trip_id = '';
    },
    addToTrip: async (tripId: string, input: AddToTripInput): Promise<AddToTripResult> => {
      const t = find(tripId);
      if (t.status !== 'open') throw new ApiError('That trip is closed.', 'trip_closed');
      prune(t);
      const out: AddToTripResult = { trip: view(t), added: [], joined: [], meals: [], food: null };
      if ('late_meals' in input) {
        const late = plan.filter((p) => lateOf(t, input.today).some((m) => m.plan_id === p.id));
        const built = build(t.id, t.through, late);
        for (const b of built.items) {
          const item = t.items.find((i) => i.food_id === b.food_id);
          if (!item) {
            t.items.push(b);
            out.added.push(b.food_id);
          } else {
            item.lines.push(...b.lines);
            item.need = needOf(
              item.lines,
              foods.find((f) => f.id === item.food_id),
            );
            out.joined.push(b.food_id);
          }
        }
        for (const p of late) p.trip_id = t.id;
        out.meals = late.map((p) => p.id);
        t.unmatched.push(...built.unmatched);
      } else {
        let food: Food | undefined;
        let created = false;
        if ('food_id' in input) {
          food = foods.find((f) => f.id === input.food_id);
          if (!food) throw new ApiError(`No such food: ${input.food_id}`, 'not_found');
        } else {
          const name = input.text.trim().replace(/\s+/g, ' ');
          if (!name || name.length > 80) throw new ApiError('Give the item a name of 1 to 80 characters.', 'bad_name');
          food = foods.find(
            (f) => f.name.toLowerCase() === name.toLowerCase() || displayName(f).toLowerCase() === name.toLowerCase(),
          );
          if (!food) {
            const now = new Date().toISOString();
            food = {
              id: `fd_demo_${foods.length + 1}`,
              name: name.charAt(0).toUpperCase() + name.slice(1),
              kind: 'ingredient',
              brand: '',
              category: '',
              kcal_100g: null,
              protein_100g: null,
              carbs_100g: null,
              fat_100g: null,
              servings_json: null,
              source: 'manual',
              created: now,
              updated: now,
            };
            foods.push(food);
            created = true;
          }
        }
        if (food.never_shop) {
          throw new ApiError(
            `${displayName(food)} is set to never go on a list. Change that on the food first.`,
            'never_shop',
          );
        }
        out.food = { id: food.id, name: displayName(food), created, matched_existing: !created && 'text' in input };
        if (!t.items.some((i) => i.food_id === food!.id)) {
          const choice: TripChoice = isStore(food.usual_store ?? '') ? (food.usual_store as TripStore) : '';
          t.items.push({
            food_id: food.id,
            name: displayName(food),
            category: food.category,
            choice,
            suggested: choice !== '',
            bought: false,
            buy: food.last_buy ?? '',
            mine: true,
            need: null,
            lines: [],
          });
          out.added.push(food.id);
        }
      }
      out.trip = view(t, undefined, 'late_meals' in input ? input.today : today);
      return out;
    },
    removeTripItem: async (tripId: string, foodId: string): Promise<Trip> => {
      const t = find(tripId);
      if (t.status !== 'open') throw new ApiError('That trip is closed.', 'trip_closed');
      const item = t.items.find((i) => i.food_id === foodId);
      if (!item) throw new ApiError("That food isn't on the list.", 'not_on_trip');
      if (item.lines.length) {
        const n = new Set(item.lines.map((l) => l.plan_id)).size;
        throw new ApiError(`${item.name} is on the list for ${n} planned meal${n === 1 ? '' : 's'}.`, 'has_meals');
      }
      t.items.splice(t.items.indexOf(item), 1);
      return view(t);
    },
    /** The open trip's late meals, for getPlan. */
    lateMeals: (day: string): LateMeal[] => {
      const t = trips.find((x) => x.status === 'open');
      return t ? lateOf(t, day) : [];
    },
    /** The trip's status, for the plan's chips. */
    statusOf: (id: string): '' | 'open' | 'closed' => trips.find((t) => t.id === id)?.status ?? '',
  };
}
