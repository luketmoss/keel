// The Shop tab's data (#718), loaded through the API. Components read the signals; this file owns the
// fetching and the writes. A choice or a tick shows at once and is saved behind it, one write at a time per
// item, so the last tap wins; a failure puts the item back to what the API last confirmed.
import { signal } from '@preact/signals';
import { ApiError, type ForageApi } from '../api/client';
import type { Trip, TripItem, TripItemChange, TripStore, TripSummary } from '../api/types';
import { showToast } from '../ui/toast';

export type ShopState = 'idle' | 'loading' | 'ready' | 'error';
export type ShopMode = 'sort' | 'shop';

/** The open trip, or null. */
export const shopTrip = signal<Trip | null>(null);
export const shopState = signal<ShopState>('idle');
/** A load failed: shown above a trip already on screen, or alone. */
export const shopFailed = signal(false);
/** The latest closed trip, for "Last trip". */
export const lastTrip = signal<TripSummary | null>(null);
export const shopMode = signal<ShopMode>('sort');
/** The selected store tab in Shop mode. */
export const shopStore = signal<TripStore | null>(null);
/** Foods whose store pick changed their usual store, until Shop is left or reloaded. */
export const remembered = signal<Record<string, TripStore>>({});
/** Change what's where was tapped: the next Sort opens on Everything rather than To sort. */
export const sortOpensOnEverything = signal(false);
/** The header's Trip button was tapped: the Shop screen opens its menu. */
export const tripMenuRequested = signal(false);

export const SAVE_FAILED = "Couldn't save that. Try again.";
export const TRIP_GONE = 'This trip was closed or thrown away.';

/** A refusal meaning the trip on screen is no longer open. */
export const isTripGone = (err: unknown) =>
  err instanceof ApiError && ['trip_closed', 'not_found', 'no_open_trip'].includes(err.code);

// ---- the Sort / Shop view, kept per device (#718: the app's own state, not the API's)

const VIEW_KEY = 'forage_trip_view';

interface SavedView {
  trip_id: string;
  mode: ShopMode;
  store: TripStore | null;
}

function readView(): SavedView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    return raw ? (JSON.parse(raw) as SavedView) : null;
  } catch {
    return null;
  }
}

export function saveView(): void {
  const trip = shopTrip.value;
  if (!trip) return;
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ trip_id: trip.id, mode: shopMode.value, store: shopStore.value }));
  } catch {
    // Private mode: the view is a convenience.
  }
}

export function clearView(): void {
  try {
    localStorage.removeItem(VIEW_KEY);
  } catch {
    // As above.
  }
}

/** The mode a trip opens in: its saved view, else Shop when nothing is unsorted and something is bought. */
function viewFor(trip: Trip): { mode: ShopMode; store: TripStore | null } {
  const saved = readView();
  if (saved && saved.trip_id === trip.id) return { mode: saved.mode, store: saved.store };
  const ready = trip.items.length > 0 && trip.items.every((i) => i.choice) && trip.items.some((i) => i.bought);
  return { mode: ready ? 'shop' : 'sort', store: null };
}

// ---- loading

let latest = 0;

/** Put a trip on screen, the view it opens in with it. */
export function showTrip(trip: Trip | null): void {
  const was = shopTrip.value;
  shopTrip.value = trip;
  if (trip && (!was || was.id !== trip.id)) {
    const view = viewFor(trip);
    shopMode.value = view.mode;
    shopStore.value = view.store;
  }
}

/** Load the open trip, and the last closed one. A trip already on screen stays under a failed refresh. */
export async function loadTrip(api: ForageApi): Promise<void> {
  const seq = ++latest;
  if (shopState.value === 'idle') shopState.value = 'loading';
  try {
    const [trip, closed] = await Promise.all([api.getTrip(), api.getClosedTrips()]);
    if (seq !== latest) return;
    // A write still on its way would be undone by this read; it lands and confirms on its own.
    if (pendingWrites > 0 && trip && shopTrip.value?.id === trip.id) return;
    showTrip(trip);
    lastTrip.value = closed[0] ?? null;
    shopFailed.value = false;
    shopState.value = 'ready';
  } catch {
    if (seq !== latest) return;
    shopFailed.value = true;
    if (shopState.value === 'loading') shopState.value = 'error';
  }
}

// ---- choices and ticks

/** What the API last confirmed, per food; queued changes per food. */
const confirmed = new Map<string, TripItem>();
const queues = new Map<string, TripItemChange[]>();
let pendingWrites = 0;

function replaceItem(foodId: string, next: (item: TripItem) => TripItem): void {
  const trip = shopTrip.value;
  if (!trip) return;
  shopTrip.value = { ...trip, items: trip.items.map((i) => (i.food_id === foodId ? next(i) : i)) };
}

function applyChange(item: TripItem, change: TripItemChange): TripItem {
  const out = { ...item };
  if (change.choice) {
    out.choice = change.choice;
    out.suggested = false;
    if (change.choice === 'have') out.bought = false;
  }
  if (change.bought !== undefined) out.bought = change.bought;
  return out;
}

/**
 * Change one item: shown at once, then saved. `onGone` runs when the trip turns out to be closed or thrown
 * away elsewhere, after the toast.
 */
export function changeItem(api: ForageApi, foodId: string, change: TripItemChange, onGone: () => void): void {
  const trip = shopTrip.value;
  const item = trip?.items.find((i) => i.food_id === foodId);
  if (!trip || !item) return;
  if (!confirmed.has(foodId)) confirmed.set(foodId, item);
  replaceItem(foodId, (i) => applyChange(i, change));
  const queue = queues.get(foodId) ?? [];
  queue.push(change);
  queues.set(foodId, queue);
  if (queue.length === 1) void drain(api, trip.id, foodId, onGone);
}

async function drain(api: ForageApi, tripId: string, foodId: string, onGone: () => void): Promise<void> {
  const queue = queues.get(foodId)!;
  while (queue.length) {
    pendingWrites++;
    try {
      const res = await api.setTripItem(tripId, foodId, queue[0]);
      confirmed.set(foodId, res.item);
      if (res.remembered && res.item.choice && res.item.choice !== 'have') {
        remembered.value = { ...remembered.value, [foodId]: res.item.choice };
      } else if (queue[0].choice && remembered.value[foodId]) {
        const next = { ...remembered.value };
        delete next[foodId];
        remembered.value = next;
      }
      queue.shift();
      // The last write's answer is the item as stored; earlier ones would undo taps still queued.
      if (!queue.length) replaceItem(foodId, () => res.item);
    } catch (err) {
      queue.length = 0;
      const back = confirmed.get(foodId);
      if (back) replaceItem(foodId, () => back);
      if (isTripGone(err)) {
        showToast(TRIP_GONE);
        onGone();
      } else {
        showToast(SAVE_FAILED);
      }
    } finally {
      pendingWrites--;
    }
  }
  confirmed.delete(foodId);
  queues.delete(foodId);
}

/** Forget what was loaded (tests and sign-out). */
export function _resetShop(): void {
  shopTrip.value = null;
  shopState.value = 'idle';
  shopFailed.value = false;
  lastTrip.value = null;
  shopMode.value = 'sort';
  shopStore.value = null;
  remembered.value = {};
  tripMenuRequested.value = false;
  sortOpensOnEverything.value = false;
  confirmed.clear();
  queues.clear();
  pendingWrites = 0;
}
