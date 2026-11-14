import { MacroBar } from '../ui/macro-bar';
import { MACRO_KEYS, MACRO_NAMES, macroShares } from '../ui/macro-math';
import { MoreNutrition } from '../ui/more-nutrition';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import {
  SLOTS,
  type Food,
  type RecipeDetail,
  type FoodLogDay,
  type FoodLogEntry,
  type PlanEntry,
  type Slot,
} from '../api/types';
import { BarcodeSheet } from '../library/barcode-sheet';
import { FoodForm, type FoodFormOrigin } from '../library/food-form';
import { hasNutrition } from '../library/food-math';
import { keepFood } from '../library/foods-store';
import { addRecipe } from '../library/recipes-store';
import { AddFoodSheet } from '../library/library-screen';
import { NutritionSheet } from '../library/nutrition-sheet';
import { StarterSheet } from '../library/starter-sheet';
import { eatenHash } from '../shell/routes';
import { showToast } from '../ui/toast';
import { AddSheet, type AddLists } from './add-sheet';
import { AmountSheet, type LogTarget, type SavedLog } from './amount-sheet';
import { EntryRow } from './entry-row';
import { SaveRecipeSheet } from './save-recipe-sheet';
import {
  dayEntries,
  dayPlan,
  dayState,
  dayTotals,
  eatenDate,
  eatenToday,
  knowFood,
  loadDay,
  loadedDate,
  logFoods,
  logRecipes,
  moveDay,
  refreshDay,
  removeEntry,
  unloggedPlan,
  upsertEntry,
} from './eaten-store';
import {
  amountLine,
  dayPossessive,
  dayTitle,
  entryName,
  fullDate,
  newLogId,
  nothingLogged,
  wholeGrams,
  wholeKcal,
} from './format';

/** The Eaten header (#712): previous day, the day, next day (disabled on today). The day is the page's h1. */
export function EatenHeader({ api }: { api: ForageApi }) {
  const date = eatenDate.value;
  const today = eatenToday.value;
  return (
    <div class="eaten-nav">
      <button type="button" class="icon-btn" aria-label="Previous day" onClick={() => moveDay(api, -1)}>
        ‹
      </button>
      <div class="eaten-day">
        <h1 data-testid="eaten-day">{dayTitle(date, today)}</h1>
        <span class="eaten-date">{fullDate(date)}</span>
      </div>
      <button
        type="button"
        class="icon-btn"
        aria-label="Next day"
        onClick={() => moveDay(api, 1)}
        disabled={date >= today}
        data-testid="next-day"
      >
        ›
      </button>
    </div>
  );
}

/** The day card: `getFoodLogTotals` for the day, as it answered. Blank is never shown as 0. */
function DayCard({ day, date, today }: { day: FoodLogDay | null; date: string; today: string }) {
  const kcal = day?.kcal ?? null;
  const allUnknown = !!day && kcal === null;
  const low = !!day && day.partial && !allUnknown;
  const label = date === today ? 'kcal so far' : 'kcal';
  const macros = { protein: day?.protein_g ?? null, carbs: day?.carbs_g ?? null, fat: day?.fat_g ?? null };
  const shares = macroShares(macros);
  return (
    <section class="card day-card" role="group" aria-label={`Totals for ${fullDate(date)}`} data-testid="day-card">
      <div class="day-main">
        <span class="day-kcal tabular" data-testid="day-kcal">
          {kcal === null ? '—' : wholeKcal(kcal)}
        </span>
        <span class="hint">{day && !allUnknown ? label : 'kcal'}</span>
      </div>
      <div class="day-macros" data-testid="day-macros">
        <MacroBar protein={macros.protein} carbs={macros.carbs} fat={macros.fat} size="day" />
        <div class="macro-cols tabular">
          {MACRO_KEYS.map((k) => (
            <div class="macro-col" key={k} data-testid={`macro-col-${k}`}>
              <span class="macro-name">
                <span class={`macro-swatch macro-${k}`} aria-hidden="true" />
                {MACRO_NAMES[k]}
              </span>
              <span class="macro-grams">
                {macros[k] === null ? (
                  <span class="mn-unknown" role="img" aria-label="not known">
                    —
                  </span>
                ) : (
                  wholeGrams(macros[k])
                )}
              </span>
              <span class="macro-share">{shares.state === 'shares' ? `${shares.text[k]} of kcal` : ''}</span>
            </div>
          ))}
        </div>
      </div>
      {day && !allUnknown && (
        <MoreNutrition
          values={day}
          fat={day.fat_g}
          carbs={day.carbs_g}
          rounding="whole"
          parts
          unknown={day.unknown}
          atLeastNote="At least: some entries don't have this one."
          noneText={`None of ${dayPossessive(date, today)} entries has sodium, fiber or the rest yet.`}
        />
      )}
      {!day && (
        <p class="day-note" data-testid="day-note">
          {nothingLogged(date, today)}
        </p>
      )}
      {allUnknown && (
        <p class="day-note" data-testid="day-note">
          None of {dayPossessive(date, today)} entries has nutrition yet.
        </p>
      )}
      {low && (
        <p class="day-note" data-testid="day-low">
          <span class="chip-flag low-chip">Low</span> Some entries have no nutrition or are missing ingredients, so this
          total is low.
        </p>
      )}
    </section>
  );
}

/**
 * An entry in select mode (#788): a toggle row with a check box. A recipe's entry, or one whose food was deleted,
 * is dimmed and cannot be ticked, and says why on line two.
 */
function SelectRow({
  entry,
  name,
  ticked,
  blocked,
  onToggle,
}: {
  entry: FoodLogEntry;
  name: string;
  ticked: boolean;
  blocked: string | null;
  onToggle: () => void;
}) {
  const unknown = entry.kcal === null;
  const line = blocked ? `${amountLine(entry)} · ${blocked}` : amountLine(entry);
  return (
    <li>
      <button
        type="button"
        class={blocked ? 'log-row select-row is-blocked' : 'log-row select-row'}
        aria-pressed={blocked ? undefined : ticked}
        aria-disabled={blocked ? true : undefined}
        aria-label={`${name}, ${line}`}
        onClick={blocked ? undefined : onToggle}
        data-testid="select-row"
      >
        <span class={ticked ? 'tick is-on' : 'tick'} aria-hidden="true">
          {ticked ? '✓' : ''}
        </span>
        <span class="recipe-text">
          <span class="recipe-name">{name}</span>
          <span class="recipe-meta">{line}</span>
        </span>
        {unknown ? (
          <span class="chip-flag">—</span>
        ) : (
          <span class="log-row-kcal tabular">
            {wholeKcal(entry.kcal!)} <span class="hint-inline">kcal</span>
          </span>
        )}
      </button>
    </li>
  );
}

/** `412 kcal a serving`, `about 412 kcal a serving, partial`, or `No nutrition yet`. */
function plannedLine(p: PlanEntry): string {
  if (p.kcal_serving === null) return 'No nutrition yet';
  const kcal = Math.round(p.kcal_serving);
  return p.partial ? `about ${kcal} kcal a serving, partial` : `${kcal} kcal a serving`;
}

interface PlannedProps {
  plan: PlanEntry;
  busy: boolean;
  failed: boolean;
  onLog: () => void;
  onNutrition: () => void;
}

/** A planned meal not yet logged: a ghost row, a suggestion that counts toward nothing. */
function PlannedRow({ plan, busy, failed, onLog, onNutrition }: PlannedProps) {
  const known = plan.kcal_serving !== null;
  const text = (
    <span class="recipe-text">
      <span class="recipe-name status-muted">Planned: {plan.recipe_name}</span>
      <span class="recipe-meta">{plannedLine(plan)}</span>
    </span>
  );
  return (
    <li class="planned-row" data-testid="planned-row">
      {known ? (
        <div class="log-row log-row-ghost">
          {text}
          <button
            type="button"
            class="btn btn-secondary btn-small"
            onClick={onLog}
            disabled={busy}
            aria-busy={busy}
            data-testid="log-planned"
          >
            Log 1 serving
          </button>
        </div>
      ) : (
        <button type="button" class="log-row log-row-ghost" onClick={onNutrition}>
          {text}
        </button>
      )}
      {failed && (
        <p class="danger-text field-error" role="status">
          Couldn't log. Try again.
        </p>
      )}
    </li>
  );
}

type Overlay =
  | { kind: 'add'; slot: Slot; q?: string }
  | { kind: 'addFood'; slot: Slot }
  | { kind: 'barcode'; slot: Slot }
  | { kind: 'starter'; slot: Slot }
  // `fill`: opened by a search row's Add nutrition, which comes back to the Add sheet rather than logging.
  | { kind: 'form'; slot: Slot; food: Partial<Food>; origin: FoodFormOrigin; fill?: boolean }
  | { kind: 'amount'; slot: Slot; target: LogTarget; entry?: FoodLogEntry }
  | { kind: 'nutrition'; recipeId: string; back?: Slot }
  // #788: the New recipe sheet, over the meal in select mode.
  | { kind: 'saveRecipe'; slot: Slot };

/**
 * A pass (#786): from an Add row's tap until the Add sheet closes, one meal's adding. The screen holds it because the
 * Add sheet unmounts while the amount sheet is open.
 */
interface Pass {
  slot: Slot;
  /** The entries logged in the pass, in the order logged; one deleted again stays here but leaves the list. */
  ids: string[];
  /** The Add sheet's lists, loaded at the pass's first open and kept for its returns. */
  lists: AddLists | null;
  /** The search text, kept while the amount sheet is open. */
  q: string;
  /** The last save's status line, and the entry it touched. */
  status: string | null;
  fresh: string | null;
}

/**
 * The Eaten tab (#712): a day of the food log. The day card shows `getFoodLogTotals`, each meal its entries
 * (their stored snapshots), the day's planned meals not yet logged, and an Add row. The app adds nothing up.
 */
export function EatenScreen({ api }: { api: ForageApi }) {
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [pass, setPass] = useState<Pass | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [failedPlan, setFailedPlan] = useState<string | null>(null);
  // One entry id per planned meal, kept across taps and retries, so they leave one entry.
  const planIds = useRef(new Map<string, string>());
  // #788: the one meal in select mode, and the ids of the entries ticked in it.
  const [selecting, setSelecting] = useState<Slot | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);

  function leaveSelect() {
    setSelecting(null);
    setTicked([]);
  }

  useEffect(() => {
    void loadDay(api);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      leaveSelect();
      void loadDay(api);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [api]);

  const date = eatenDate.value;
  const today = eatenToday.value;
  // A day change leaves select mode with nothing saved.
  useEffect(() => leaveSelect(), [date]);
  // #825: the hash follows the day on screen, rewritten in place; and a day the hash moved to is loaded here.
  useEffect(() => {
    const want = eatenHash(date, today);
    if (window.location.hash !== want) {
      const { pathname, search } = window.location;
      window.history.replaceState(window.history.state, '', `${pathname}${search}${want}`);
    }
    if (date !== loadedDate) {
      dayState.value = 'loading';
      void loadDay(api, date);
    }
  }, [date, today, api]);
  const state = dayState.value;
  const entries = dayEntries.value;
  const planned = unloggedPlan(dayPlan.value, entries);
  const foods = logFoods.value;
  const recipes = logRecipes.value;

  // The write's own answer goes into the day, then the sheet closes and the toast shows, in one update; the totals
  // catch up quietly behind it (#785).
  function done(status: string, saved: SavedLog) {
    if ('entry' in saved) {
      if (overlay?.kind === 'amount' && overlay.target.kind === 'food') knowFood(overlay.target.food);
      upsertEntry(saved.entry);
    } else removeEntry(saved.removed);
    void refreshDay(api);
    if (pass && overlay?.kind === 'amount') {
      // #786: back to the Add sheet; a new entry joins the Added list and clears the search.
      const isNew = !overlay.entry;
      const id = 'entry' in saved ? saved.entry.id : null;
      setPass(
        (p) =>
          p && {
            ...p,
            ids: id && !p.ids.includes(id) ? [...p.ids, id] : p.ids,
            q: isNew ? '' : p.q,
            status,
            fresh: id,
          },
      );
      setOverlay({ kind: 'add', slot: pass.slot, q: isNew ? '' : pass.q });
      return;
    }
    setOverlay(null);
    showToast(status);
  }

  function startPass(slot: Slot) {
    setPass({ slot, ids: [], lists: null, q: '', status: null, fresh: null });
    setOverlay({ kind: 'add', slot });
  }

  /** Done, close, Escape or the backdrop: one toast for what the pass left on the day, and focus on its Add row. */
  function endPass() {
    setOverlay(null);
    setPass(null);
    if (!pass) return;
    const left = dayEntries.value.filter((e) => pass.ids.includes(e.id));
    if (left.length === 1) showToast(`Logged ${entryName(left[0], foods, recipes)}`);
    else if (left.length > 1) showToast(`Logged ${left.length} items to ${pass.slot.toLowerCase()}`);
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-testid="add-to-meal"][data-slot="${pass.slot}"]`)?.focus(),
    );
  }

  /** A food added or opened inside a pass joins its loaded foods, so a later search finds it. */
  function passFood(food: Food) {
    setPass((p) =>
      p?.lists ? { ...p, lists: { ...p.lists, foods: [...p.lists.foods.filter((f) => f.id !== food.id), food] } } : p,
    );
  }

  async function logPlanned(p: PlanEntry) {
    if (busyPlan) return;
    const id = planIds.current.get(p.id) ?? newLogId();
    planIds.current.set(p.id, id);
    setBusyPlan(p.id);
    setFailedPlan(null);
    try {
      const entry = await api.logEntry({ id, date, slot: p.slot, recipe_id: p.recipe_id, qty: 1, unit: 'serving' });
      upsertEntry(entry);
      showToast(`Logged ${p.recipe_name}`);
      void refreshDay(api);
    } catch {
      setFailedPlan(p.id);
    } finally {
      setBusyPlan(null);
    }
  }

  function openEntry(e: FoodLogEntry) {
    const target: LogTarget | null = e.food_id
      ? { kind: 'food', food: foods.find((f) => f.id === e.food_id) ?? removedFood(e.food_id) }
      : {
          kind: 'recipe',
          recipe: recipes.find((r) => r.id === e.recipe_id) ?? ({ id: e.recipe_id, name: 'A removed recipe' } as never),
        };
    setOverlay({ kind: 'amount', slot: e.slot, target, entry: e });
  }

  function addNutrition(target: LogTarget, slot: Slot) {
    if (target.kind === 'food') {
      setOverlay({ kind: 'form', slot, food: target.food, origin: { focusNutrition: true }, fill: true });
    } else {
      setOverlay({ kind: 'nutrition', recipeId: target.recipe.id, back: slot });
    }
  }

  /** Why an entry can't go in a recipe, or null when it can: recipes are not lines, and a removed food has none. */
  function blockedReason(e: FoodLogEntry): string | null {
    if (!e.food_id) return "Recipes can't go in a recipe";
    return foods.some((f) => f.id === e.food_id) ? null : 'This food was deleted';
  }

  function toggle(id: string) {
    setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  }

  function startSelect(slot: Slot) {
    setSelecting(slot);
    setTicked([]);
  }

  function savedRecipe(recipe: RecipeDetail) {
    // The reply goes into the Add sheet's and the Library's lists, then the sheet closes and the toast shows together.
    const { lines: _lines, steps: _steps, walkthrough: _walkthrough, walkthrough_check: _check, ...summary } = recipe;
    logRecipes.value = [summary, ...logRecipes.value.filter((r) => r.id !== summary.id)];
    addRecipe(recipe);
    setOverlay(null);
    leaveSelect();
    showToast(`Saved ${recipe.name} to your recipes`);
  }

  async function openFood(id: string, slot: Slot) {
    try {
      const food = await api.getFood(id);
      keepFood(food);
      passFood(food);
      setOverlay(hasNutrition(food) ? { kind: 'amount', slot, target: { kind: 'food', food } } : { kind: 'add', slot });
    } catch {
      setOverlay({ kind: 'add', slot });
    }
  }

  return (
    <>
      {state === 'loading' ? (
        <div class="card day-card day-skeleton" data-testid="day-loading" aria-hidden="true">
          <div class="skeleton-row" />
        </div>
      ) : state === 'error' ? (
        <div class="library-status danger-text" role="status" data-testid="day-error">
          <p>Couldn't load your log.</p>
          <button
            type="button"
            class="text-btn"
            onClick={() => {
              dayState.value = 'loading';
              void loadDay(api);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <DayCard day={dayTotals.value} date={date} today={today} />
      )}

      {state !== 'error' &&
        SLOTS.map((slot) => {
          const mine = state === 'ready' ? entries.filter((e) => e.slot === slot) : [];
          const plans = state === 'ready' ? planned.filter((p) => p.slot === slot) : [];
          const headId = `meal-${slot.toLowerCase().replace(/ /g, '-')}`;
          const selectingHere = selecting === slot;
          const canSelect = mine.some((e) => !blockedReason(e));
          const count = selectingHere ? mine.filter((e) => ticked.includes(e.id) && !blockedReason(e)).length : 0;
          return (
            <section key={slot} class="card meal-card" aria-labelledby={headId} data-testid="meal-card">
              <div class="meal-head-row">
                <h2 id={headId} class="meal-card-head">
                  {slot}
                </h2>
                {state === 'ready' && (canSelect || selectingHere) && (
                  <button
                    type="button"
                    class="text-btn"
                    onClick={() => (selectingHere ? leaveSelect() : startSelect(slot))}
                    data-testid={selectingHere ? 'select-cancel' : 'select-meal'}
                  >
                    {selectingHere ? 'Cancel' : 'Select'}
                  </button>
                )}
              </div>
              <ul class="plain-list">
                {mine.map((e) =>
                  selectingHere ? (
                    <SelectRow
                      key={e.id}
                      entry={e}
                      name={entryName(e, foods, recipes)}
                      ticked={ticked.includes(e.id)}
                      blocked={blockedReason(e)}
                      onToggle={() => toggle(e.id)}
                    />
                  ) : (
                    <EntryRow key={e.id} entry={e} name={entryName(e, foods, recipes)} onOpen={() => openEntry(e)} />
                  ),
                )}
                {!selectingHere &&
                  plans.map((p) => (
                    <PlannedRow
                      key={p.id}
                      plan={p}
                      busy={busyPlan === p.id}
                      failed={failedPlan === p.id}
                      onLog={() => void logPlanned(p)}
                      onNutrition={() => setOverlay({ kind: 'nutrition', recipeId: p.recipe_id })}
                    />
                  ))}
              </ul>
              {selectingHere ? (
                <>
                  <button
                    type="button"
                    class="btn btn-primary btn-block select-save"
                    disabled={count === 0}
                    onClick={() => setOverlay({ kind: 'saveRecipe', slot })}
                    data-testid="save-as-recipe"
                  >
                    {count === 0 ? 'Save as a recipe' : `Save ${count} as a recipe`}
                  </button>
                  {count === 0 && <p class="hint select-helper">Tick the items that go together.</p>}
                </>
              ) : (
                <button
                  type="button"
                  class="meal-add"
                  onClick={() => startPass(slot)}
                  data-testid="add-to-meal"
                  data-slot={slot}
                >
                  <span aria-hidden="true">+</span> Add to {slot.toLowerCase()}
                </button>
              )}
            </section>
          );
        })}

      {overlay?.kind === 'saveRecipe' && (
        <SaveRecipeSheet
          api={api}
          slot={overlay.slot}
          date={date}
          lines={entries
            .filter((e) => e.slot === overlay.slot && ticked.includes(e.id) && !blockedReason(e))
            .map((e) => ({ entry: e, name: entryName(e, foods, recipes) }))}
          onSaved={savedRecipe}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'add' && (
        <AddSheet
          api={api}
          slot={overlay.slot}
          today={today}
          initialQuery={overlay.q ?? pass?.q}
          lists={pass?.lists ?? null}
          onLoaded={(lists) => setPass((p) => p && { ...p, lists })}
          onQuery={(q) => setPass((p) => (p && p.q !== q ? { ...p, q } : p))}
          added={(pass?.ids ?? []).flatMap((id) => {
            const e = entries.find((x) => x.id === id);
            return e ? [{ entry: e, name: entryName(e, foods, recipes) }] : [];
          })}
          onOpenAdded={openEntry}
          fresh={pass?.fresh}
          status={pass?.status}
          done={!!pass?.ids.length}
          onPick={(target) => setOverlay({ kind: 'amount', slot: overlay.slot, target })}
          onAddNutrition={(target) => addNutrition(target, overlay.slot)}
          onAddFood={() => setOverlay({ kind: 'addFood', slot: overlay.slot })}
          onClose={endPass}
        />
      )}
      {overlay?.kind === 'addFood' && (
        <AddFoodSheet
          onPick={(o) => {
            const slot = overlay.slot;
            if (o.kind === 'barcode') setOverlay({ kind: 'barcode', slot });
            else if (o.kind === 'starter') setOverlay({ kind: 'starter', slot });
            else if (o.kind === 'form') setOverlay({ kind: 'form', slot, food: o.food, origin: o.origin });
          }}
          onClose={() => setOverlay({ kind: 'add', slot: overlay.slot })}
        />
      )}
      {overlay?.kind === 'barcode' && (
        <BarcodeSheet
          api={api}
          onFound={(food, lookup) =>
            setOverlay({ kind: 'form', slot: overlay.slot, food: { ...food, id: undefined }, origin: { lookup } })
          }
          onTypeIt={(barcode) =>
            setOverlay({
              kind: 'form',
              slot: overlay.slot,
              food: { kind: 'packaged', barcode },
              origin: { fromLabel: true },
            })
          }
          onOpen={(id) => void openFood(id, overlay.slot)}
          onClose={() => setOverlay({ kind: 'add', slot: overlay.slot })}
        />
      )}
      {overlay?.kind === 'starter' && (
        <StarterSheet
          api={api}
          onAdded={(result) => {
            const named = [...result.added, ...result.filled];
            // The pass's foods were loaded before these existed: fetch each, so a search in the pass finds it.
            for (const n of named) void api.getFood(n.id).then(passFood, () => {});
            setOverlay({ kind: 'add', slot: overlay.slot, q: named.length === 1 ? named[0].name : '' });
          }}
          onClose={() => setOverlay({ kind: 'add', slot: overlay.slot })}
        />
      )}
      {overlay?.kind === 'form' && (
        <FoodForm
          api={api}
          food={overlay.food}
          origin={overlay.origin}
          onSaved={(food) => {
            keepFood(food);
            passFood(food);
            setOverlay(
              hasNutrition(food) && !overlay.fill
                ? { kind: 'amount', slot: overlay.slot, target: { kind: 'food', food } }
                : { kind: 'add', slot: overlay.slot },
            );
          }}
          onCancel={() => setOverlay({ kind: 'add', slot: overlay.slot })}
        />
      )}
      {overlay?.kind === 'nutrition' && (
        <NutritionSheet
          api={api}
          recipeId={overlay.recipeId}
          onChanged={(recipe) => {
            if (recipe) {
              // A recipe given nutrition inside a pass is loggable in the pass's list too.
              const { lines: _l, steps: _s, walkthrough: _w, walkthrough_check: _c, ...summary } = recipe;
              setPass((p) =>
                p?.lists
                  ? {
                      ...p,
                      lists: { ...p.lists, recipes: p.lists.recipes.map((r) => (r.id === summary.id ? summary : r)) },
                    }
                  : p,
              );
            }
            void refreshDay(api, true);
          }}
          onClose={() => setOverlay(overlay.back ? { kind: 'add', slot: overlay.back } : null)}
        />
      )}
      {overlay?.kind === 'amount' && (
        <AmountSheet
          api={api}
          target={overlay.target}
          date={date}
          today={today}
          slot={overlay.slot}
          entry={overlay.entry}
          fixedSlot={!!pass}
          onSaved={done}
          onClose={() => setOverlay(pass ? { kind: 'add', slot: pass.slot } : null)}
        />
      )}
    </>
  );
}

/** A food deleted since it was logged: the entry still opens, named as removed, in grams. */
function removedFood(id: string): Food {
  return {
    id,
    name: 'A removed food',
    kind: 'ingredient',
    brand: '',
    category: '',
    kcal_100g: null,
    protein_100g: null,
    carbs_100g: null,
    fat_100g: null,
    servings_json: null,
    source: '',
    created: '',
    updated: '',
  };
}
