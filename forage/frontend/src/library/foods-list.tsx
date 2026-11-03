import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Food } from '../api/types';
import { FoodName } from './food-name';
import { STORE_LABELS, displayName, kcalLine } from './food-math';
import { foodsKind, foodsNotice, foodsState, libraryFoods, type FoodKind } from './foods-store';

interface Props {
  onOpen: (id: string) => void;
  /** Search had no match: the label form with this name filled in. */
  onAddNamed: (name: string) => void;
  onAddStarter: () => void;
  onAddFood: () => void;
  onRetry: () => void;
  /** #704's empty-state icon. */
  icon: () => ComponentChildren;
}

/** The search field appears once the library holds this many foods. */
const SEARCH_FROM = 8;

function FoodRow({ food, onOpen }: { food: Food; onOpen: () => void }) {
  const kcal = kcalLine(food);
  const unchecked = food.source === 'off' && !food.verified;
  const store = food.usual_store ? STORE_LABELS[food.usual_store] : '';
  return (
    <li>
      <button type="button" class="food-row" onClick={onOpen} data-testid="food-row">
        <span class="food-text">
          <span class="recipe-name">
            <FoodName food={food} />
          </span>
          <span class="food-meta">
            {kcal ? <span>{kcal}</span> : <span class="chip-flag">No nutrition yet</span>}
            {food.usually_have && <span> · usually have</span>}
            {unchecked && <span class="chip-flag">Not checked</span>}
          </span>
        </span>
        {store && <span class="tag store-chip">{store}</span>}
      </button>
    </li>
  );
}

const KINDS: { id: FoodKind; label: string }[] = [
  { id: 'ingredient', label: 'Ingredients' },
  { id: 'packaged', label: 'Packaged' },
];

const kindOf = (f: Food): FoodKind => (f.kind === 'packaged' ? 'packaged' : 'ingredient');

/**
 * Library → Foods (#707), sorted by name, with a search. With both kinds in the library, chips show one kind
 * at a time (#787); a search ignores them and shows both cards, Ingredients first.
 */
export function FoodsList({ onOpen, onAddNamed, onAddStarter, onAddFood, onRetry, icon }: Props) {
  const [q, setQ] = useState('');
  const all = libraryFoods.value;
  const state = foodsState.value;

  if (state === 'error' && !all.length) {
    return (
      <div role="status" class="library-status danger-text">
        <p>Couldn't load your foods.</p>
        <button type="button" class="text-btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (state !== 'ready' && !all.length) {
    return (
      <ul class="card" aria-label="Loading foods" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <li key={i} class="skeleton-row" />
        ))}
      </ul>
    );
  }
  if (!all.length) {
    return (
      <section class="empty-state">
        <span class="empty-state-icon">{icon()}</span>
        <h2>No foods yet</h2>
        <p>
          Add the starter list, about 75 pantry staples with their nutrition, or add a packaged food from its barcode.
        </p>
        <div class="notice-actions">
          <button type="button" class="btn btn-primary" onClick={onAddStarter}>
            Add the starter list
          </button>
          <button type="button" class="btn btn-secondary" onClick={onAddFood}>
            Add a food
          </button>
        </div>
        {foodsNotice.value && <p role="status">{foodsNotice.value}</p>}
      </section>
    );
  }

  const query = q.trim().toLowerCase();
  const matches = all
    .filter((f) => !query || displayName(f).toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  const counts = Object.fromEntries(KINDS.map((k) => [k.id, all.filter((f) => kindOf(f) === k.id).length]));
  const chips = !query && KINDS.every((k) => counts[k.id] > 0);
  const kind = foodsKind.value;
  const cards: [string, Food[]][] = KINDS.filter((k) => !chips || k.id === kind).map((k) => [
    k.label,
    matches.filter((f) => kindOf(f) === k.id),
  ]);

  return (
    <>
      {all.length >= SEARCH_FROM && (
        <>
          <label for="food-list-search" class="visually-hidden">
            Search foods
          </label>
          <input
            id="food-list-search"
            class="field list-search"
            type="search"
            placeholder="Search foods"
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
          />
        </>
      )}
      {chips && (
        <div class="chip-row sort-chips" role="group" aria-label="Show">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              class="chip"
              aria-pressed={kind === k.id}
              onClick={() => (foodsKind.value = k.id)}
            >
              {k.label} ({counts[k.id]})
            </button>
          ))}
        </div>
      )}
      {query && !matches.length && (
        <div class="library-status">
          <p>No food matches "{q.trim()}".</p>
          <button type="button" class="btn btn-secondary" onClick={() => onAddNamed(q.trim())}>
            Add "{q.trim()}"
          </button>
        </div>
      )}
      {cards
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <section key={label} class="card" aria-label={label}>
            {!chips && (
              <h2 class="card-label">
                {label} ({list.length})
              </h2>
            )}
            <ul class="food-list">
              {list.map((f) => (
                <FoodRow key={f.id} food={f} onOpen={() => onOpen(f.id)} />
              ))}
            </ul>
          </section>
        ))}
      {foodsNotice.value && (
        <p class="library-status" role="status">
          {foodsNotice.value}
        </p>
      )}
    </>
  );
}
