import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Food, FoodLogEntry, RecipeSummary, Slot } from '../api/types';
import { displayName, hasNutrition } from '../library/food-math';
import { addDays } from '../plan/dates';
import { Sheet } from '../ui/sheet';
import type { LogTarget } from './amount-sheet';
import { foodRowLine, recipeLoggable, recipeRowLine } from './format';

/** How far back the recents look, how many they list, and how many rows a search shows. */
const RECENT_DAYS = 60;
const RECENT_MAX = 10;
const RESULTS_MAX = 20;
const FALLBACK_RECIPES = 3;

/** A row of the Add sheet: a food or a recipe. */
type Row = { key: string; target: LogTarget };

interface Props {
  api: ForageApi;
  slot: Slot;
  today: string;
  /** The search text to open with: a starter food just added. */
  initialQuery?: string;
  /** A food or recipe that can be logged: the amount sheet opens for it. */
  onPick: (target: LogTarget) => void;
  /** One with no nutrition: #707's food form, or the recipe's Nutrition sheet. */
  onAddNutrition: (target: LogTarget) => void;
  /** Not here? Add a food: #707's Add a food sheet. */
  onAddFood: () => void;
  onClose: () => void;
}

/** The foods and recipes most recently logged, newest first, each once, leaving out foods without nutrition. */
export function recentRows(log: FoodLogEntry[], foods: Food[], recipes: RecipeSummary[]): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  const newest = [...log].sort((a, b) => b.logged_at.localeCompare(a.logged_at));
  for (const e of newest) {
    const key = e.food_id || e.recipe_id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (e.food_id) {
      const f = foods.find((x) => x.id === e.food_id);
      if (f && hasNutrition(f)) out.push({ key, target: { kind: 'food', food: f } });
    } else {
      const r = recipes.find((x) => x.id === e.recipe_id);
      if (r) out.push({ key, target: { kind: 'recipe', recipe: r } });
    }
    if (out.length === RECENT_MAX) break;
  }
  return out;
}

/** Foods whose name or brand contains the text, ignoring case, then recipes by name; at most 20. */
export function searchRows(q: string, foods: Food[], recipes: RecipeSummary[]): Row[] {
  const needle = q.trim().toLowerCase();
  const fs: Row[] = foods
    .filter((f) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(needle))
    .map((f) => ({ key: f.id, target: { kind: 'food', food: f } }));
  const rs: Row[] = recipes
    .filter((r) => r.name.toLowerCase().includes(needle))
    .map((r) => ({ key: r.id, target: { kind: 'recipe', recipe: r } }));
  return [...fs, ...rs].slice(0, RESULTS_MAX);
}

const loggable = (t: LogTarget) => (t.kind === 'food' ? hasNutrition(t.food) : recipeLoggable(t.recipe));

function ResultRow({ row, onPick, onAddNutrition }: { row: Row; onPick: () => void; onAddNutrition: () => void }) {
  const t = row.target;
  const ok = loggable(t);
  const name = t.kind === 'food' ? displayName(t.food) : t.recipe.name;
  const line = t.kind === 'food' ? foodRowLine(t.food) : recipeRowLine(t.recipe);
  return (
    <li>
      <button
        type="button"
        class="log-row"
        onClick={ok ? onPick : onAddNutrition}
        aria-label={ok ? `${name}, ${line}` : `${name}, no nutrition yet, add nutrition`}
        data-testid="add-result"
      >
        <span class="recipe-text">
          <span class={ok ? 'recipe-name' : 'recipe-name status-muted'}>{name}</span>
          <span class="recipe-meta">{line}</span>
        </span>
        {ok ? (
          <span class="log-row-plus" aria-hidden="true">
            +
          </span>
        ) : (
          <span class="log-row-action">Add nutrition</span>
        )}
      </button>
    </li>
  );
}

/**
 * The Add sheet (#712): a search over foods and recipes, with what was logged most recently when it is empty.
 * Recents are derived from the last 60 days of the log itself; nothing new is stored for them.
 */
export function AddSheet({ api, slot, today, initialQuery = '', onPick, onAddNutrition, onAddFood, onClose }: Props) {
  const [q, setQ] = useState(initialQuery);
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [log, setLog] = useState<FoodLogEntry[]>([]);
  const [failed, setFailed] = useState(false);

  function load() {
    setFailed(false);
    setFoods(null);
    Promise.all([api.getFoods(), api.getRecipes(), api.getFoodLog(addDays(today, -RECENT_DAYS), today)]).then(
      ([f, r, l]) => {
        setFoods(f);
        setRecipes(r);
        setLog(l);
      },
      () => setFailed(true),
    );
  }
  useEffect(load, [api]);

  const meal = slot.toLowerCase();
  const text = q.trim();
  let body;
  if (failed) {
    body = (
      <div class="library-status danger-text" role="status">
        <p>Couldn't load your foods.</p>
        <button type="button" class="text-btn" onClick={load}>
          Try again
        </button>
      </div>
    );
  } else if (!foods) {
    body = (
      <div data-testid="add-loading">
        <div class="skeleton-row" />
        <div class="skeleton-row" />
        <div class="skeleton-row" />
      </div>
    );
  } else if (!foods.length && !recipes.length) {
    body = <p class="library-status">No foods in your library yet.</p>;
  } else if (text) {
    const rows = searchRows(text, foods, recipes);
    body = rows.length ? (
      <ul class="plain-list" aria-label="Results">
        {rows.map((r) => (
          <ResultRow
            key={r.key}
            row={r}
            onPick={() => onPick(r.target)}
            onAddNutrition={() => onAddNutrition(r.target)}
          />
        ))}
      </ul>
    ) : (
      <p class="library-status" data-testid="add-no-match">
        Nothing matches "{text}".
      </p>
    );
  } else {
    const recents = recentRows(log, foods, recipes);
    const rows: Row[] = recents.length
      ? recents
      : recipes.slice(0, FALLBACK_RECIPES).map((r) => ({ key: r.id, target: { kind: 'recipe', recipe: r } }));
    body = (
      <>
        {!recents.length && <p class="library-status">Nothing logged yet. Search for a food or recipe.</p>}
        {rows.length > 0 && (
          <>
            <p class="card-label" id="add-list-label">
              {recents.length ? 'Recent' : 'Your recipes'}
            </p>
            <ul class="plain-list" aria-labelledby="add-list-label">
              {rows.map((r) => (
                <ResultRow
                  key={r.key}
                  row={r}
                  onPick={() => onPick(r.target)}
                  onAddNutrition={() => onAddNutrition(r.target)}
                />
              ))}
            </ul>
          </>
        )}
      </>
    );
  }

  return (
    <Sheet title={`Add to ${meal}`} onClose={onClose} testId="add-sheet" tall>
      <label class="visually-hidden" for="add-search">
        Search foods and recipes
      </label>
      <input
        id="add-search"
        class="field"
        type="search"
        placeholder="Search foods and recipes"
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        data-autofocus
        data-testid="add-search"
      />
      {body}
      <button type="button" class="btn btn-secondary btn-block add-food-btn" onClick={onAddFood} data-testid="not-here">
        Not here? Add a food
      </button>
    </Sheet>
  );
}
