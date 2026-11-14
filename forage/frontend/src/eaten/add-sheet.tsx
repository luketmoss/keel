import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Combo, Food, FoodLogEntry, RecipeSummary, Slot, Usual } from '../api/types';
import { addSheetMeta, comboKcalText, comboMatches } from '../library/combos-store';
import { FoodName } from '../library/food-name';
import { displayName, hasNutrition } from '../library/food-math';
import { foodsInShort, startKcalText } from '../library/usuals-store';
import { addDays } from '../plan/dates';
import { Sheet } from '../ui/sheet';
import type { LogTarget } from './amount-sheet';
import { EntryRow } from './entry-row';
import { foodRowLine, recipeLoggable, recipeRowLine } from './format';
import { usualsFor } from './usual-group';

/** How far back the recents look, how many they list, and how many rows a search shows. */
const RECENT_DAYS = 60;
const RECENT_MAX = 10;
const RESULTS_MAX = 20;
const FALLBACK_RECIPES = 3;
/** Combos shown before a search (#888). */
const COMBOS_MAX = 3;

/** A row of the Add sheet: a food or a recipe. */
type Row = { key: string; target: LogTarget };

/** What the Add sheet lists from: loaded once a pass (#786), and kept for its returns. */
export interface AddLists {
  foods: Food[];
  recipes: RecipeSummary[];
  /** The last 60 days of the log, behind Recent. */
  log: FoodLogEntry[];
}

interface Props {
  api: ForageApi;
  slot: Slot;
  today: string;
  /** The search text to open with: the pass's, or a starter food just added. */
  initialQuery?: string;
  /** The pass's lists (#786), or null until they load: the sheet loads them once and hands them up. */
  lists: AddLists | null;
  onLoaded: (lists: AddLists) => void;
  /** The search text as it changes, so the pass can keep it while the amount sheet is open. */
  onQuery?: (q: string) => void;
  /** The entries the pass logged that are still on the day, in the order logged. */
  added?: { entry: FoodLogEntry; name: string }[];
  /** A row of the Added list: that entry's amount sheet, in edit mode. */
  onOpenAdded?: (entry: FoodLogEntry) => void;
  /** The Added row just logged or saved, which fades in. */
  fresh?: string | null;
  /** "Logged Gnocchi": the pass's last save, as a status line under the search. */
  status?: string | null;
  /** The pass has logged something: the header's close is Done. */
  done?: boolean;
  /** The usuals (#885), most recently used first; empty until they load, or when there are none. */
  usuals?: Usual[];
  /** The usual being logged, whose row is disabled. */
  loggingUsual?: string | null;
  /** A usual row tapped: the screen logs it with `logUsual`. */
  onLogUsual?: (usual: Usual) => void;
  /** The combo being logged (#888), whose row is disabled. */
  loggingCombo?: string | null;
  /** A combo row tapped: the screen logs its foods as a group with `logGroup`. */
  onLogCombo?: (combo: Combo) => void;
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

/** The Usuals section (#885): one row per usual, those usually for this meal first. Renders nothing when none match. */
function UsualRows({
  usuals,
  slot,
  q,
  foods,
  logging,
  onLog,
}: {
  usuals: Usual[];
  slot: Slot;
  q: string;
  foods: Food[];
  logging: string | null;
  onLog: (u: Usual) => void;
}) {
  const rows = usualsFor(usuals, slot, q);
  if (!rows.length) return null;
  const byId = new Map(foods.map((f) => [f.id, f]));
  return (
    <>
      <p class="card-label" id="usuals-label">
        Usuals
      </p>
      <ul class="plain-list" aria-labelledby="usuals-label" data-testid="usuals-list">
        {rows.map((u) => {
          const short = foodsInShort(u, byId);
          const kcal = startKcalText(u);
          return (
            <li key={u.id}>
              <button
                type="button"
                class="log-row"
                onClick={() => onLog(u)}
                disabled={!!logging}
                aria-busy={logging === u.id}
                aria-label={`${u.name}, ${short}${kcal ? `, ${kcal}` : ''}`}
                data-testid="usual-result"
              >
                <span class="recipe-text">
                  <span class="recipe-name">{u.name}</span>
                  <span class="recipe-meta">{short}</span>
                </span>
                {kcal ? <span class="log-row-kcal tabular">{kcal}</span> : <span class="chip-flag">—</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The Combos section (#888): the top 3 before a search, every match with one. Renders nothing when none show. */
function ComboRows({
  combos,
  q,
  foods,
  today,
  logging,
  onLog,
}: {
  combos: Combo[];
  q: string;
  foods: Food[];
  today: string;
  logging: string | null;
  onLog: (c: Combo) => void;
}) {
  const rows = q ? combos.filter((c) => comboMatches(c, q)) : combos.slice(0, COMBOS_MAX);
  if (!rows.length) return null;
  const byId = new Map(foods.map((f) => [f.id, f]));
  return (
    <>
      <p class="card-label" id="combos-label">
        Combos you've logged
      </p>
      <ul class="plain-list" aria-labelledby="combos-label" data-testid="combos-list">
        {rows.map((c) => {
          const kcal = comboKcalText(c, byId);
          const meta = addSheetMeta(c, today);
          return (
            <li key={c.key}>
              <button
                type="button"
                class="log-row"
                onClick={() => onLog(c)}
                disabled={!!logging}
                aria-busy={logging === c.key}
                aria-label={`${c.name}, ${meta}${kcal ? `, ${kcal}` : ''}`}
                data-testid="combo-result"
              >
                <span class="recipe-text">
                  <span class="recipe-name usual-foods">{c.name}</span>
                  <span class="recipe-meta">{meta}</span>
                </span>
                {kcal ? <span class="log-row-kcal tabular">{kcal}</span> : <span class="chip-flag">—</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

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
          <span class={ok ? 'recipe-name' : 'recipe-name status-muted'}>
            {t.kind === 'food' ? <FoodName food={t.food} /> : name}
          </span>
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
 * Recents are derived from the last 60 days of the log itself; nothing new is stored for them. During a pass
 * (#786) it lists what the pass added above Recent, and comes back with the lists it loaded first.
 */
export function AddSheet({
  api,
  slot,
  today,
  initialQuery = '',
  lists,
  onLoaded,
  onQuery,
  added = [],
  onOpenAdded,
  fresh,
  status,
  done,
  usuals = [],
  loggingUsual = null,
  onLogUsual,
  loggingCombo = null,
  onLogCombo,
  onPick,
  onAddNutrition,
  onAddFood,
  onClose,
}: Props) {
  const [q, setQ] = useState(initialQuery);
  const [failed, setFailed] = useState(false);
  /** #888: the combos for this meal; empty until they load, and when that fails, so the sheet works without them. */
  const [combos, setCombos] = useState<Combo[]>([]);
  const foods = lists?.foods ?? null;
  const recipes = lists?.recipes ?? [];
  const log = lists?.log ?? [];

  function load() {
    setFailed(false);
    Promise.all([api.getFoods(), api.getRecipes(), api.getFoodLog(addDays(today, -RECENT_DAYS), today)]).then(
      ([f, r, l]) => onLoaded({ foods: f, recipes: r, log: l }),
      () => setFailed(true),
    );
  }
  useEffect(() => {
    if (!lists) load();
  }, [api]);
  useEffect(() => onQuery?.(q), [q]);
  useEffect(() => {
    let live = true;
    api.getCombos({ slot }).then(
      (r) => live && setCombos(r.combos),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [api, slot]);

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
    const usualRows = (
      <UsualRows
        usuals={usuals}
        slot={slot}
        q={text}
        foods={foods}
        logging={loggingUsual}
        onLog={(u) => onLogUsual?.(u)}
      />
    );
    const comboRows = (
      <ComboRows
        combos={combos}
        q={text}
        foods={foods}
        today={today}
        logging={loggingCombo}
        onLog={(c) => onLogCombo?.(c)}
      />
    );
    body =
      rows.length || usualsFor(usuals, slot, text).length || combos.some((c) => comboMatches(c, text)) ? (
        <>
          {usualRows}
          {comboRows}
          {rows.length > 0 && (
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
          )}
        </>
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
        <UsualRows
          usuals={usuals}
          slot={slot}
          q=""
          foods={foods}
          logging={loggingUsual}
          onLog={(u) => onLogUsual?.(u)}
        />
        <ComboRows
          combos={combos}
          q=""
          foods={foods}
          today={today}
          logging={loggingCombo}
          onLog={(c) => onLogCombo?.(c)}
        />
        {added.length > 0 && (
          <>
            <p class="card-label" id="added-label">
              Added to {meal}
            </p>
            <ul class="plain-list added-list" aria-labelledby="added-label" data-testid="added-list">
              {added.map(({ entry, name }) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  name={name}
                  fresh={entry.id === fresh}
                  onOpen={() => onOpenAdded?.(entry)}
                />
              ))}
            </ul>
          </>
        )}
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
    <Sheet
      title={`Add to ${meal}`}
      onClose={onClose}
      testId="add-sheet"
      tall
      headerEnd={
        done ? (
          <button type="button" class="btn btn-secondary" onClick={onClose} data-testid="add-done">
            Done
          </button>
        ) : undefined
      }
    >
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
      <p class="hint add-status" role="status" data-testid="add-status">
        {status ?? ''}
      </p>
      {body}
      <button type="button" class="btn btn-secondary btn-block add-food-btn" onClick={onAddFood} data-testid="not-here">
        Not here? Add a food
      </button>
    </Sheet>
  );
}
