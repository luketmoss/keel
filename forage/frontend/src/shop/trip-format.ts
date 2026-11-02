// The Shop tab's wording (#718), from forage/docs/design/718-shopping-trips.md. Only words and dates: every
// amount (`need`) and breakdown is the API's.
import type {
  Food,
  LateMeal,
  Trip,
  TripChoice,
  TripCounts,
  TripItem,
  TripLine,
  TripStore,
  TripSummary,
} from '../api/types';
import { TRIP_STORES } from '../api/types';
import { localDate } from '../cook/format';
import { shortDay } from '../plan/dates';

export const STORE_NAMES: Record<TripStore, string> = { ks: 'King Soopers', costco: 'Costco', other: 'Other' };

/** The four choices, in button order. */
export const CHOICES: { id: Exclude<TripChoice, ''>; label: string }[] = [
  { id: 'have', label: 'Have it' },
  { id: 'ks', label: 'King Soopers' },
  { id: 'costco', label: 'Costco' },
  { id: 'other', label: 'Other' },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** `Fri`. */
export const weekday = (date: string) => WEEKDAYS[weekdayIndex(date)];

/** A through-date chip: `Fri 7`. */
export const chipDay = (date: string) => `${weekday(date)} ${Number(date.slice(8, 10))}`;

/** `Wed Nov 5`. */
export const longDate = (date: string) => `${weekday(date)} ${shortDay(date)}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** #719: an item added by hand that no meal needs. */
export const addedByYou = (i: TripItem) => i.mine && !i.lines.length;

/** `2 meals · through Fri Nov 7`, `1 meal · …`, `No meals · …`; #719 adds ` · 2 added by you` above 0. */
export function tripSubline(trip: Trip): string {
  const n = trip.meals.length;
  const mine = trip.items.filter(addedByYou).length;
  return `${n ? plural(n, 'meal') : 'No meals'} · through ${longDate(trip.through)}${mine ? ` · ${mine} added by you` : ''}`;
}

/** `King Soopers, Costco and Other`. */
function andList(parts: string[]): string {
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** `Last trip: Oct 27, King Soopers and Costco, 19 items.`, or '' when no trip has closed. */
export function lastTripLine(t: TripSummary | null): string {
  if (!t || !t.closed_at) return '';
  const parts = [shortDay(localDate(new Date(t.closed_at)))];
  if (t.stores.length) parts.push(andList(t.stores.map((s) => STORE_NAMES[s])));
  return `Last trip: ${parts.join(', ')}, ${plural(t.items, 'item')}.`;
}

/** The counts the screen shows, from the items as they are on screen (a pick shows at once). */
export function countItems(items: TripItem[]): TripCounts {
  const c: TripCounts = { all: items.length, todo: 0, have: 0, ks: 0, costco: 0, other: 0, to_buy: 0, bought: 0 };
  for (const i of items) {
    if (!i.choice) c.todo++;
    else c[i.choice]++;
    if (isStore(i.choice)) {
      c.to_buy++;
      if (i.bought) c.bought++;
    }
  }
  return c;
}

export const isStore = (c: TripChoice): c is TripStore => (TRIP_STORES as string[]).includes(c);

/** `5 of 12 sorted · 3 have · 1 King Soopers · 1 Costco · 0 other`. */
export function countsLine(c: TripCounts): string {
  return (
    `${c.all - c.todo} of ${c.all} sorted · ${c.have} have · ${c.ks} King Soopers · ${c.costco} Costco · ` +
    `${c.other} other`
  );
}

/** One breakdown line: `Beef Stew · Fri: 2 lb beef chuck, cubed`, or the snapshot's amount when the line is gone. */
export function breakdownLine(l: TripLine): string {
  const day = l.date ? ` · ${weekday(l.date)}` : '';
  return `${l.recipe_name || 'A recipe'}${day}: ${l.text || l.amt}`;
}

/** The item's distinct recipes, in the order its lines name them. */
export function itemRecipes(item: TripItem): string[] {
  const out: string[] = [];
  for (const l of item.lines) if (l.recipe_name && !out.includes(l.recipe_name)) out.push(l.recipe_name);
  return out;
}

/** The why line under a sorted item, or ''. */
export function whyLine(item: TripItem, remembered: TripStore | undefined): string {
  if (remembered) return `Forage will suggest ${STORE_NAMES[remembered]} next time`;
  if (!item.suggested) return '';
  if (item.choice === 'have') return 'Suggested: you usually have this';
  return isStore(item.choice) ? `Suggested: you usually get this at ${STORE_NAMES[item.choice]}` : '';
}

/** The setup sheet's count line. */
export function ingredientsLine(n: number): string {
  if (!n) return 'No ingredients.';
  return `${plural(n, 'ingredient')}, combined where meals share them. Things you usually have start as "Have it".`;
}

export function unmatchedCountLine(n: number): string {
  if (!n) return '';
  return n === 1
    ? "1 ingredient isn't matched to a food yet, so it won't be on the list."
    : `${n} ingredients aren't matched to a food yet, so they won't be on the list.`;
}

/** `Have it: 4 items, not on any list.` */
export const haveLine = (n: number) => `Have it: ${plural(n, 'item')}, not on any list.`;

export { plural };

// ---- #719: added items, buying amounts and late meals, from forage/docs/design/719-trip-added-items.md

/** How many meals an item's lines come from. */
export const mealCount = (i: TripItem) => new Set(i.lines.map((l) => l.plan_id)).size;

/** The Add sheet's second line for a food: `King Soopers · last time 18 pack`, or what the list says of it. */
export function addRowLine(food: Food, onList: TripItem | undefined): string {
  if (onList) {
    if (onList.lines.length) return `On the list for ${plural(mealCount(onList), 'meal')} · tap to change how much`;
    return onList.buy ? `On the list: ${onList.buy}` : 'On the list';
  }
  const store = food.usual_store ? STORE_NAMES[food.usual_store] : '';
  const parts = [store, food.last_buy ? `last time ${food.last_buy}` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No usual store yet';
}

/** A food row's accessible name: `Milk, King Soopers, last time 1 gallon, add to list`. */
export function addRowLabel(name: string, food: Food, onList: TripItem | undefined): string {
  if (onList) return `${name}, on the list, change how much`;
  const store = food.usual_store ? STORE_NAMES[food.usual_store] : '';
  return [name, store, food.last_buy ? `last time ${food.last_buy}` : '', 'add to list'].filter(Boolean).join(', ');
}

/** The status line after an add: `Added Milk to King Soopers: 1 gallon.`, or its shorter forms. */
export function addedLine(name: string, item: TripItem | undefined): string {
  const store = item && isStore(item.choice) ? STORE_NAMES[item.choice] : '';
  const buy = item?.buy ?? '';
  const where = store ? ` to ${store}` : '';
  const amount = buy ? `: ${buy}` : '';
  return `Added ${name}${where}${amount}.${store ? '' : ' Pick its store on the list.'}`;
}

/** The amount sheet's small label: the store, `Have it`, or `Not sorted yet`. */
export function choiceLabel(c: TripChoice): string {
  if (c === 'have') return 'Have it';
  return isStore(c) ? STORE_NAMES[c] : 'Not sorted yet';
}

/** The size chips: the food's pack sizes, then last time's amount when it isn't one; `last` marks the last-time chip. */
export function sizeChips(item: TripItem): { text: string; last: boolean }[] {
  const packs = item.packs ?? [];
  const last = (item.last_buy ?? '').trim();
  const chips = packs.map((p) => ({ text: p, last: !!last && p === last }));
  if (last && !packs.includes(last)) chips.push({ text: last, last: true });
  return chips;
}

/** `Beef Stew · Tue`, for a line in the amount sheet. */
export const lineMeal = (l: TripLine) => `${l.recipe_name || 'A recipe'}${l.date ? ` · ${weekday(l.date)}` : ''}`;

/** The late-meals sentence: the bold part, the rest, and the button. */
export function lateSentence(late: LateMeal[]): { strong: string; rest: string; action: string } | null {
  if (!late.length) return null;
  if (late.length === 1) {
    return {
      strong: late[0].recipe_name || 'A meal',
      rest: ` (${longDate(late[0].date)}) was planned after this list was made.`,
      action: 'Add its items',
    };
  }
  return { strong: `${late.length} meals`, rest: ' were planned after this list was made.', action: 'Add their items' };
}

/** After Add its items: `3 new items, and more of 2 already on the list.`, or its shorter forms. */
export function lateAddedLine(added: number, joined: number, late: LateMeal[]): string {
  if (added && joined) return `${plural(added, 'new item')}, and more of ${joined} already on the list.`;
  if (added) return `${plural(added, 'new item')} on the list.`;
  if (joined) return `More of ${plural(joined, 'item')} already on the list.`;
  if (late.length === 1)
    return `${late[0].recipe_name || 'That meal'} is on the trip. It needs nothing new on the list.`;
  return `${plural(late.length, 'meal')} are on the trip. They need nothing new on the list.`;
}

/** Shop mode's banner while anything is unsorted: `2 added items need a store`. */
export function needStoreText(n: number): { strong: string; rest: string } {
  return n === 1
    ? { strong: '1 added item needs a store', rest: ' before it shows on a list.' }
    : { strong: `${n} added items need a store`, rest: ' before they show on a list.' };
}
