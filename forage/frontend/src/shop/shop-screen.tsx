import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Trip, TripItem, TripStore } from '../api/types';
import { TRIP_STORES } from '../api/types';
import { syncFromHash, tabHash } from '../shell/routes';
import { showToast } from '../ui/toast';
import {
  changeItem,
  clearView,
  lastTrip,
  loadTrip,
  remembered,
  saveView,
  shopFailed,
  shopMode,
  shopState,
  shopStore,
  shopTrip,
  showTrip,
  sortOpensOnEverything,
  tripMenuRequested,
} from './shop-store';
import {
  CHOICES,
  STORE_NAMES,
  breakdownLine,
  countItems,
  countsLine,
  haveLine,
  itemRecipes,
  lastTripLine,
  tripSubline,
  whyLine,
} from './trip-format';
import { DoneSheet, TripMenu } from './trip-sheets';
import { TripSetupSheet } from './trip-setup-sheet';

const NO_CATEGORY = 'Everything else';

/** Items grouped by category, the API's order kept: categories alphabetical, no category last. */
function groupByCategory(items: TripItem[]): { label: string; items: TripItem[] }[] {
  const groups: { label: string; items: TripItem[] }[] = [];
  for (const i of items) {
    const label = i.category || NO_CATEGORY;
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(i);
  }
  return groups.sort((a, b) =>
    a.label === NO_CATEGORY ? 1 : b.label === NO_CATEGORY ? -1 : a.label.localeCompare(b.label),
  );
}

/** Unbought first, then bought; each by category (none last), then name. */
function shopOrder(items: TripItem[]): string[] {
  const key = (i: TripItem) => [i.bought ? 1 : 0, i.category ? 0 : 1, i.category, i.name] as const;
  return [...items]
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]) || ka[3].localeCompare(kb[3]);
    })
    .map((i) => i.food_id);
}

function SortItem({ item, onPick }: { item: TripItem; onPick: (choice: (typeof CHOICES)[number]['id']) => void }) {
  const [open, setOpen] = useState(false);
  const why = whyLine(item, remembered.value[item.food_id]);
  const groupId = `item-${item.food_id}`;
  return (
    <li class="trip-item" data-testid="sort-item">
      <div class="trip-item-head">
        <span class="trip-item-name" id={groupId}>
          {item.name}
        </span>
        {item.need && <strong class="trip-need">{item.need}</strong>}
      </div>
      {item.lines.length === 1 && <p class="trip-muted">{breakdownLine(item.lines[0])}</p>}
      {item.lines.length > 1 && (
        <>
          <button type="button" class="text-btn trip-more" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Show'} {item.lines.length} meals
          </button>
          {open && (
            <ul class="plain-list">
              {item.lines.map((l) => (
                <li key={`${l.plan_id}-${l.line_id}`} class="trip-muted">
                  {breakdownLine(l)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div class="choice-grid" role="group" aria-labelledby={groupId}>
        {CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            class="trip-choice"
            aria-pressed={item.choice === c.id}
            onClick={() => onPick(c.id)}
            data-choice={c.id}
          >
            {c.label}
          </button>
        ))}
      </div>
      {why && (
        <p class="trip-muted" data-testid="why">
          {why}
        </p>
      )}
    </li>
  );
}

function Footer({ children }: { children: ComponentChildren }) {
  return <div class="shop-footer">{children}</div>;
}

/** Sort (#718): each item to Have it or a store, then Make lists. */
function SortView({ api, trip, onGone }: { api: ForageApi; trip: Trip; onGone: () => void }) {
  const counts = countItems(trip.items);
  const [filter, setFilter] = useState<'todo' | 'all'>(() => {
    if (sortOpensOnEverything.value) {
      sortOpensOnEverything.value = false;
      return 'all';
    }
    return counts.todo ? 'todo' : 'all';
  });
  // A just-picked item stays in To sort until the filter changes or Shop is left.
  const [sticky, setSticky] = useState<Set<string>>(new Set());

  function pick(foodId: string, choice: (typeof CHOICES)[number]['id']) {
    if (filter === 'todo') setSticky(new Set(sticky).add(foodId));
    changeItem(api, foodId, { choice }, onGone);
  }

  function showFilter(f: 'todo' | 'all') {
    setFilter(f);
    setSticky(new Set());
  }

  const shown = filter === 'all' ? trip.items : trip.items.filter((i) => !i.choice || sticky.has(i.food_id));
  const progress = counts.all ? (counts.all - counts.todo) / counts.all : 1;

  let body: ComponentChildren;
  if (!trip.items.length) {
    body = (
      <div class="card" data-testid="trip-empty">
        <p>
          <strong>Nothing on this list.</strong>
        </p>
        <p class="trip-muted">This trip has no ingredients to sort.</p>
      </div>
    );
  } else if (!shown.length) {
    body = (
      <div class="card" data-testid="all-sorted">
        <p>
          <strong>Everything is sorted</strong>
        </p>
        <p class="trip-muted">
          Suggestions came from your foods' usual stores and pantry. Check them under Everything, or make your lists.
        </p>
      </div>
    );
  } else {
    body = groupByCategory(shown).map((g) => (
      <section key={g.label} class="card trip-group" data-testid="trip-group">
        <h2 class="card-label">{g.label}</h2>
        <ul class="plain-list">
          {g.items.map((i) => (
            <SortItem key={i.food_id} item={i} onPick={(c) => pick(i.food_id, c)} />
          ))}
        </ul>
      </section>
    ));
  }

  return (
    <>
      {trip.items.length > 0 && (
        <>
          <div class="card">
            <p>
              <strong>Do you have it, or where will you get it?</strong>
            </p>
            <div class="trip-progress" aria-hidden="true">
              <div class="trip-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p class="trip-counts" aria-live="polite" data-testid="sort-counts">
              {countsLine(counts)}
            </p>
          </div>
          <div class="segmented" role="group" aria-label="Show">
            <button type="button" class="segment" aria-pressed={filter === 'todo'} onClick={() => showFilter('todo')}>
              To sort ({counts.todo})
            </button>
            <button type="button" class="segment" aria-pressed={filter === 'all'} onClick={() => showFilter('all')}>
              Everything ({counts.all})
            </button>
          </div>
        </>
      )}
      {body}
      {trip.unmatched.length > 0 && (
        <section class="card" data-testid="unmatched">
          <h2 class="card-label">Not on the list</h2>
          <p class="trip-muted">
            These aren't matched to a food yet. Match them in the recipe and they'll be on your next trip.
          </p>
          <ul class="plain-list">
            {trip.unmatched.map((u) => (
              <li key={`${u.plan_id}-${u.line_id}`} class="trip-muted">
                {u.text} · {u.recipe_name}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Footer>
        {counts.todo ? (
          <button type="button" class="btn btn-primary btn-block" aria-disabled="true" data-testid="make-lists">
            Sort {counts.todo} more to make your lists
          </button>
        ) : (
          <button
            type="button"
            class="btn btn-primary btn-block"
            onClick={() => {
              shopMode.value = 'shop';
              shopStore.value = null;
              saveView();
            }}
            data-testid="make-lists"
          >
            Make lists: {counts.to_buy} to buy
          </button>
        )}
      </Footer>
    </>
  );
}

/** Shop mode (#718): a tab per store, tick items as they go in the basket. */
function ShopView({
  api,
  trip,
  onGone,
  onDone,
  onChangeWhere,
}: {
  api: ForageApi;
  trip: Trip;
  onGone: () => void;
  onDone: () => void;
  onChangeWhere: () => void;
}) {
  const counts = countItems(trip.items);
  const stores = TRIP_STORES.filter((s) => trip.items.some((i) => i.choice === s));
  const store: TripStore | null =
    shopStore.value && stores.includes(shopStore.value) ? shopStore.value : (stores[0] ?? null);
  const here = trip.items.filter((i) => i.choice === store);
  // Rows keep their places until the tab changes or Shop is entered again.
  const order = useMemo(() => shopOrder(here), [store, trip.id]);
  const rows = [...here].sort((a, b) => {
    const ia = order.indexOf(a.food_id);
    const ib = order.indexOf(b.food_id);
    return (ia === -1 ? 1e6 : ia) - (ib === -1 ? 1e6 : ib);
  });

  function pickStore(s: TripStore) {
    shopStore.value = s;
    saveView();
  }

  const have = (
    <div class="trip-have">
      {counts.have > 0 && <p class="trip-muted">{haveLine(counts.have)}</p>}
      <button type="button" class="text-btn" onClick={onChangeWhere} data-testid="change-where">
        Change what's where
      </button>
    </div>
  );

  return (
    <>
      {stores.length ? (
        <>
          <div
            class="segmented store-tabs"
            role="group"
            aria-label="Store"
            style={{ gridTemplateColumns: `repeat(${stores.length}, minmax(0, 1fr))` }}
          >
            {stores.map((s) => {
              const all = trip.items.filter((i) => i.choice === s);
              return (
                <button
                  key={s}
                  type="button"
                  class="segment"
                  aria-pressed={s === store}
                  onClick={() => pickStore(s)}
                  data-testid="store-tab"
                >
                  {STORE_NAMES[s]}{' '}
                  <span class="tabular">
                    {all.filter((i) => i.bought).length}/{all.length}
                  </span>
                </button>
              );
            })}
          </div>
          <div class="card">
            <ul class="plain-list">
              {rows.map((i) => {
                const recipes = itemRecipes(i).join(', ');
                const sub = [i.need, recipes].filter(Boolean).join(' · ');
                const label = [i.name, i.need, i.bought ? 'bought' : 'not bought'].filter(Boolean).join(', ');
                return (
                  <li key={i.food_id}>
                    <button
                      type="button"
                      class={i.bought ? 'shop-row is-bought' : 'shop-row'}
                      aria-pressed={i.bought}
                      aria-label={label}
                      onClick={() => changeItem(api, i.food_id, { bought: !i.bought }, onGone)}
                      data-testid="shop-row"
                    >
                      <span class={i.bought ? 'tick is-on' : 'tick'} aria-hidden="true">
                        {i.bought ? '✓' : ''}
                      </span>
                      <span class="recipe-text">
                        <span class="recipe-name">{i.name}</span>
                        {sub && <span class="recipe-meta">{sub}</span>}
                      </span>
                      <span class="trip-category">{i.category}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : (
        <div class="card" data-testid="nothing-to-buy">
          <p>
            <strong>Nothing to buy.</strong>
          </p>
        </div>
      )}
      {have}
      <Footer>
        <button type="button" class="btn btn-primary btn-block" onClick={onDone} data-testid="done-shopping">
          Done shopping · {counts.bought}/{counts.to_buy} bought
        </button>
      </Footer>
    </>
  );
}

type Overlay = 'setup' | 'done' | 'menu' | null;

/**
 * The Shop tab (#718): no trip, Sort, Shop mode, and the setup, done and trip-menu sheets. It reloads the
 * trip on entering the tab and when the page is visible again, so an agent's change shows up.
 */
export function ShopScreen({ api }: { api: ForageApi }) {
  const [overlay, setOverlay] = useState<Overlay>(null);

  useEffect(() => {
    void loadTrip(api);
    const onVisible = () => document.visibilityState === 'visible' && void loadTrip(api);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      remembered.value = {};
    };
  }, [api]);

  useEffect(() => {
    if (tripMenuRequested.value) {
      tripMenuRequested.value = false;
      if (shopTrip.value) setOverlay('menu');
    }
  }, [tripMenuRequested.value]);

  const trip = shopTrip.value;
  const state = shopState.value;

  function gone() {
    void loadTrip(api);
  }

  function changeWhere() {
    setOverlay(null);
    shopMode.value = 'sort';
    sortOpensOnEverything.value = true;
    saveView();
  }

  function built(t: Trip) {
    setOverlay(null);
    clearView();
    showTrip(t);
    shopMode.value = 'sort';
    window.scrollTo?.(0, 0);
  }

  function closed() {
    setOverlay(null);
    clearView();
    shopTrip.value = null;
    window.location.hash = tabHash('plan');
    syncFromHash();
    showToast('Trip closed. Its meals are marked shopped.');
  }

  function discarded() {
    setOverlay(null);
    clearView();
    shopTrip.value = null;
    showToast('List thrown away. Your meals are still planned.');
    void loadTrip(api);
  }

  const failure = shopFailed.value && (
    <div class="library-status danger-text" role="status" data-testid="shop-error">
      <p>Couldn't load your trip.</p>
      <button type="button" class="text-btn" onClick={() => void loadTrip(api)}>
        Try again
      </button>
    </div>
  );

  let body: ComponentChildren;
  if (state === 'idle' || state === 'loading') {
    body = (
      <div class="card" data-testid="shop-loading">
        <div class="skeleton-row" />
        <div class="skeleton-row" />
        <div class="skeleton-row" />
      </div>
    );
  } else if (!trip) {
    const last = lastTripLine(lastTrip.value);
    body =
      state === 'error' ? null : (
        <>
          <div class="card no-trip" data-testid="no-trip">
            <p>
              <strong>No trip in progress</strong>
            </p>
            <p class="trip-muted">
              A trip gathers what your planned meals need, so you can mark what you have and split the rest by store.
            </p>
            <button
              type="button"
              class="btn btn-primary btn-block"
              onClick={() => setOverlay('setup')}
              data-testid="plan-trip-btn"
            >
              Plan a trip
            </button>
          </div>
          {last && (
            <p class="trip-muted" data-testid="last-trip">
              {last}
            </p>
          )}
        </>
      );
  } else {
    body = (
      <>
        <p class="trip-subline" data-testid="trip-subline">
          {tripSubline(trip)}
        </p>
        {shopMode.value === 'sort' ? (
          <SortView key={trip.id} api={api} trip={trip} onGone={gone} />
        ) : (
          <ShopView api={api} trip={trip} onGone={gone} onDone={() => setOverlay('done')} onChangeWhere={changeWhere} />
        )}
      </>
    );
  }

  return (
    <>
      {failure}
      {body}
      {overlay === 'setup' && <TripSetupSheet api={api} onBuilt={built} onClose={() => setOverlay(null)} />}
      {overlay === 'done' && trip && (
        <DoneSheet api={api} trip={trip} onClosed={closed} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'menu' && trip && (
        <TripMenu
          api={api}
          trip={trip}
          shopping={shopMode.value === 'shop'}
          onChangeWhere={changeWhere}
          onDiscarded={discarded}
          onClose={() => setOverlay(null)}
        />
      )}
    </>
  );
}
