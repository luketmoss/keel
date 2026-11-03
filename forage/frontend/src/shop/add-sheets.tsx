// #719: the Add sheet, the buying amount sheet, and the two Shop banners, from
// forage/docs/design/719-trip-added-items.md. Every amount and every late meal is the API's: the app only
// shows them and sends what was tapped.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError, type ForageApi } from '../api/client';
import type { Food, LateMeal, Trip, TripItem } from '../api/types';
import { localDate } from '../cook/format';
import { displayName } from '../library/food-math';
import { FoodName } from '../library/food-name';
import { Sheet } from '../ui/sheet';
import { SAVE_FAILED, addQuery, grown, isTripGone, putItem, shopNotice, showTrip } from './shop-store';
import {
  addRowLabel,
  addRowLine,
  addedLine,
  choiceLabel,
  lateAddedLine,
  lateSentence,
  lineMeal,
  needStoreText,
  sizeChips,
} from './trip-format';

/** The most search results the Add sheet lists. */
const MAX_RESULTS = 8;
const SEARCH_DELAY_MS = 250;
/** The longest buying amount (the API's TRIP_BUY_MAX). */
export const BUY_MAX = 60;

const FOOD_GONE = "That food isn't in your library any more.";
const SEARCH_FAILED = "Couldn't search your foods.";
/** Shown on the Shop tab when a write finds the trip closed or thrown away elsewhere. */
export const LIST_CLOSED = 'That list was already closed.';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Autofocus the search only with a mouse or trackpad: a phone keyboard would cover the list. */
const finePointer = () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;

/**
 * "Add to the list": your regulars with no search text, library foods and `Add "…"` with it. It stays open
 * after an add; a food already on the list opens its buying amount (`onAmount`) instead of adding twice.
 */
export function AddSheet({
  api,
  trip,
  initialStatus = '',
  onAmount,
  onGone,
  onClose,
}: {
  api: ForageApi;
  trip: Trip;
  initialStatus?: string;
  onAmount: (foodId: string) => void;
  onGone: () => void;
  onClose: () => void;
}) {
  const query = addQuery.value;
  const [regulars, setRegulars] = useState<Food[] | null>(null);
  const [results, setResults] = useState<Food[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [retry, setRetry] = useState(0);
  const focusAfter = useRef('');
  const list = useRef<HTMLDivElement>(null);
  const q = query.trim();

  useEffect(() => {
    let live = true;
    api.getFoods().then(
      (all) => live && setRegulars(all.filter((f) => f.regular && !f.never_shop).sort(byName)),
      () => live && setRegulars([]),
    );
    return () => {
      live = false;
    };
  }, [api, retry]);

  useEffect(() => {
    if (!q) {
      setResults(null);
      setSearchFailed(false);
      return;
    }
    let live = true;
    setResults(null);
    const timer = setTimeout(() => {
      api.getFoods(q).then(
        (found) => {
          if (!live) return;
          setSearchFailed(false);
          setResults(found.filter((f) => !f.never_shop).slice(0, MAX_RESULTS));
        },
        () => {
          if (!live) return;
          setSearchFailed(true);
          setResults([]);
        },
      );
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [api, q, retry]);

  // The row just added takes focus again, so a second tap opens its amount rather than adding twice.
  useEffect(() => {
    if (!focusAfter.current) return;
    const row = list.current?.querySelector<HTMLElement>(`[data-food="${focusAfter.current}"]`);
    if (row) {
      row.focus();
      focusAfter.current = '';
    }
  });

  const onList = (id: string) => trip.items.find((i) => i.food_id === id);

  async function add(input: { food_id: string } | { text: string }, key: string, typed = '') {
    if (busy) return;
    setBusy(key);
    setStatus('');
    try {
      const res = await api.addToTrip(trip.id, input);
      showTrip(res.trip);
      const food = res.food;
      if (food) {
        const item = res.trip.items.find((i) => i.food_id === food.id);
        setStatus(food.created ? `Added ${typed}. Pick its store on the list.` : addedLine(food.name, item));
        focusAfter.current = food.id;
        if (food.created) {
          addQuery.value = '';
          setRetry((n) => n + 1);
        }
      }
    } catch (err) {
      if (isTripGone(err)) {
        onGone();
        return;
      }
      if (err instanceof ApiError && err.code === 'not_found') {
        setStatus(FOOD_GONE);
        setRetry((n) => n + 1);
      } else {
        setStatus(SAVE_FAILED);
      }
    } finally {
      setBusy('');
    }
  }

  function row(f: Food) {
    const item = onList(f.id);
    const name = displayName(f);
    return (
      <li key={f.id}>
        <button
          type="button"
          class="add-row"
          data-food={f.id}
          data-testid="add-row"
          aria-label={addRowLabel(name, f, item)}
          disabled={!!busy && busy !== f.id}
          aria-busy={busy === f.id}
          onClick={() => (item ? onAmount(f.id) : void add({ food_id: f.id }, f.id))}
        >
          <span class="recipe-text">
            <span class="recipe-name">
              <FoodName food={f} />
            </span>
            <span class="recipe-meta">{addRowLine(f, item)}</span>
          </span>
          <span class={item ? 'add-mark is-on' : 'add-mark'} aria-hidden="true">
            {item ? '✓' : '+'}
          </span>
        </button>
      </li>
    );
  }

  let body;
  if (!q) {
    body = (
      <>
        <h3 class="card-label">Your regulars</h3>
        {regulars === null ? (
          <Skeleton />
        ) : regulars.length ? (
          <ul class="plain-list">{regulars.map(row)}</ul>
        ) : (
          <p class="meal-row ghost-row" data-testid="no-regulars">
            No regulars yet. Mark the foods you buy every week as regulars in your library, or type to search.
          </p>
        )}
      </>
    );
  } else {
    const exact = (results ?? []).some((f) => same(f.name, q) || same(displayName(f), q));
    body = (
      <>
        {results === null ? <Skeleton /> : <ul class="plain-list">{results.map(row)}</ul>}
        {searchFailed && (
          <div role="status" class="library-status danger-text">
            <p>{SEARCH_FAILED}</p>
            <button type="button" class="text-btn" onClick={() => setRetry((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
        {results !== null && !exact && (
          <ul class="plain-list">
            <li>
              <button
                type="button"
                class="add-row"
                data-testid="add-new"
                disabled={!!busy && busy !== 'new'}
                aria-busy={busy === 'new'}
                onClick={() => void add({ text: q }, 'new', q)}
              >
                <span class="recipe-text">
                  <span class="recipe-name">Add "{q}"</span>
                  <span class="recipe-meta">A new item. Forage remembers it for next time.</span>
                </span>
                <span class="add-mark" aria-hidden="true">
                  +
                </span>
              </button>
            </li>
          </ul>
        )}
      </>
    );
  }

  return (
    <Sheet title="Add to the list" onClose={onClose} testId="add-sheet" tall>
      <label for="add-search" class="visually-hidden">
        Search your foods, or type anything
      </label>
      <input
        id="add-search"
        class="field"
        type="search"
        placeholder="Search your foods, or type anything"
        autoComplete="off"
        value={query}
        data-autofocus={finePointer() ? true : undefined}
        onInput={(e) => (addQuery.value = e.currentTarget.value)}
        data-testid="add-search"
      />
      <div ref={list}>{body}</div>
      <p class="library-status" role="status" data-testid="add-status">
        {status}
      </p>
      <div class="sheet-actions">
        <button type="button" class="btn btn-secondary btn-block" onClick={onClose} data-testid="add-done">
          Done
        </button>
      </div>
    </Sheet>
  );
}

function byName(a: Food, b: Food) {
  return displayName(a).localeCompare(displayName(b));
}

function Skeleton() {
  return (
    <div data-testid="add-loading">
      <div class="skeleton-row" />
      <div class="skeleton-row" />
    </div>
  );
}

/**
 * The buying amount sheet: what the meals need, a free-text "You're buying", size chips, Save, Buy just what
 * the meals need (an item with meals and an amount), Take off the list (an added item with no meals).
 * `onDone` gets the status line to show, if any.
 */
export function BuyAmountSheet({
  api,
  trip,
  item,
  onDone,
  onGone,
}: {
  api: ForageApi;
  trip: Trip;
  item: TripItem;
  onDone: (status?: string) => void;
  onGone: () => void;
}) {
  const [value, setValue] = useState(item.buy);
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState('');
  const hasLines = item.lines.length > 0;
  const chips = sizeChips(item);
  const unchanged = value.trim() === item.buy;

  async function save(buy: string, key: string) {
    if (busy) return;
    setBusy(key);
    setStatus('');
    try {
      const res = await api.setTripItem(trip.id, item.food_id, { buy });
      putItem(res.item);
      onDone();
    } catch (err) {
      setBusy('');
      if (isTripGone(err)) onGone();
      else setStatus(SAVE_FAILED);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy('remove');
    setStatus('');
    try {
      showTrip(await api.removeTripItem(trip.id, item.food_id));
      onDone('Taken off the list.');
    } catch (err) {
      setBusy('');
      if (isTripGone(err)) onGone();
      else setStatus(SAVE_FAILED);
    }
  }

  return (
    <Sheet title={item.name} onClose={() => onDone()} testId="buy-sheet">
      <p class="card-label" data-testid="buy-store">
        {choiceLabel(item.choice)}
      </p>
      {hasLines ? (
        <div class="buy-need" data-testid="buy-need">
          <p class="card-label">Your meals need</p>
          <p class="buy-need-amount">{item.need}</p>
          <ul class="plain-list">
            {item.lines.map((l) => (
              <li key={`${l.plan_id}-${l.line_id}`} class="done-row">
                <span>{l.amt}</span>
                <span class="recipe-meta">{lineMeal(l)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p class="sheet-message" data-testid="buy-need">
          Not in any planned meal. You added it.
        </p>
      )}
      <label for="buy-field" class="field-label">
        You're buying
      </label>
      <input
        id="buy-field"
        class="field"
        type="text"
        autoComplete="off"
        maxLength={BUY_MAX}
        placeholder={hasLines ? 'Just what the meals need' : 'For example, 1 gallon'}
        value={value}
        onInput={(e) => setValue(e.currentTarget.value)}
        data-testid="buy-field"
      />
      {chips.length > 0 && (
        <div class="chip-row" role="group" aria-label="Sizes">
          {chips.map((c) => (
            <button
              key={c.text}
              type="button"
              class="chip"
              aria-pressed={value.trim() === c.text}
              onClick={() => setValue(value.trim() === c.text ? '' : c.text)}
              data-testid="buy-chip"
            >
              {c.last ? `${c.text} · last time` : c.text}
            </button>
          ))}
        </div>
      )}
      <div class="sheet-actions">
        <button
          type="button"
          class="btn btn-primary"
          disabled={unchanged || !!busy}
          aria-busy={busy === 'save'}
          onClick={() => void save(value.trim(), 'save')}
          data-testid="buy-save"
        >
          Save
        </button>
      </div>
      {hasLines && item.buy && (
        <button
          type="button"
          class="text-btn"
          disabled={!!busy}
          aria-busy={busy === 'clear'}
          onClick={() => void save('', 'clear')}
          data-testid="buy-clear"
        >
          Buy just what the meals need
        </button>
      )}
      {item.mine && !hasLines && (
        <button
          type="button"
          class="text-btn danger-text"
          disabled={!!busy}
          aria-busy={busy === 'remove'}
          onClick={() => void remove()}
          data-testid="buy-remove"
        >
          Take off the list
        </button>
      )}
      <p class="library-status danger-text" role="status">
        {status}
      </p>
    </Sheet>
  );
}

/** Above the store tabs: meals planned after the list was made, with Add its items. */
export function LateBanner({ api, trip, onGone }: { api: ForageApi; trip: Trip; onGone: () => void }) {
  const [busy, setBusy] = useState(false);
  const late: LateMeal[] = trip.late_meals ?? [];
  const said = lateSentence(late);
  if (!said) return null;

  async function addThem() {
    if (busy) return;
    setBusy(true);
    shopNotice.value = '';
    try {
      const res = await api.addToTrip(trip.id, { late_meals: true, today: localDate() });
      // A Have it or bought item that grew is flagged, so a bigger amount isn't missed.
      const before = new Map(trip.items.map((i) => [i.food_id, i]));
      const more = res.joined.filter((id) => {
        const was = before.get(id);
        return !!was && (was.choice === 'have' || was.bought);
      });
      if (more.length) grown.value = new Set([...grown.value, ...more]);
      showTrip(res.trip);
      shopNotice.value = lateAddedLine(res.added.length, res.joined.length, late);
    } catch (err) {
      if (isTripGone(err)) onGone();
      else shopNotice.value = SAVE_FAILED;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="plan-banner trip-banner" data-testid="late-banner">
      <p>
        <strong>{said.strong}</strong>
        {said.rest}
      </p>
      <button
        type="button"
        class="btn btn-primary btn-small"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void addThem()}
        data-testid="late-add"
      >
        {said.action}
      </button>
    </div>
  );
}

/** Shop mode, while anything is unsorted: `N added items need a store`, with Sort. */
export function NeedStoreBanner({ count, onSort }: { count: number; onSort: () => void }) {
  if (!count) return null;
  const t = needStoreText(count);
  return (
    <div class="plan-banner trip-banner" data-testid="store-banner">
      <p>
        <strong>{t.strong}</strong>
        {t.rest}
      </p>
      <button type="button" class="btn btn-secondary btn-small" onClick={onSort} data-testid="store-banner-sort">
        Sort
      </button>
    </div>
  );
}
