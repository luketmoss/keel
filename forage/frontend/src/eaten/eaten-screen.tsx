import { MoreNutrition } from '../ui/more-nutrition';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import { SLOTS, type Food, type FoodLogDay, type FoodLogEntry, type PlanEntry, type Slot } from '../api/types';
import { BarcodeSheet } from '../library/barcode-sheet';
import { FoodForm, type FoodFormOrigin } from '../library/food-form';
import { hasNutrition } from '../library/food-math';
import { keepFood } from '../library/foods-store';
import { AddFoodSheet } from '../library/library-screen';
import { NutritionSheet } from '../library/nutrition-sheet';
import { StarterSheet } from '../library/starter-sheet';
import { showToast } from '../ui/toast';
import { AddSheet } from './add-sheet';
import { AmountSheet, type LogTarget, type SavedLog } from './amount-sheet';
import {
  dayEntries,
  dayPlan,
  dayState,
  dayTotals,
  eatenDate,
  eatenToday,
  knowFood,
  loadDay,
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
  return (
    <section class="card day-card" role="group" aria-label={`Totals for ${fullDate(date)}`} data-testid="day-card">
      <div class="day-main">
        <span class="day-kcal tabular" data-testid="day-kcal">
          {kcal === null ? '—' : wholeKcal(kcal)}
        </span>
        <span class="hint">{day && !allUnknown ? label : 'kcal'}</span>
      </div>
      <div class="day-macros tabular" data-testid="day-macros">
        <span>Protein {wholeGrams(day?.protein_g ?? null)}</span>
        <span>Carbs {wholeGrams(day?.carbs_g ?? null)}</span>
        <span>Fat {wholeGrams(day?.fat_g ?? null)}</span>
      </div>
      {day && !allUnknown && (
        <MoreNutrition
          values={day}
          fat={day.fat_g}
          carbs={day.carbs_g}
          rounding="whole"
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

function EntryRow({ entry, name, onOpen }: { entry: FoodLogEntry; name: string; onOpen: () => void }) {
  const unknown = entry.kcal === null;
  const line = amountLine(entry);
  return (
    <li>
      <button
        type="button"
        class="log-row"
        onClick={onOpen}
        aria-label={`${name}, ${line}, ${unknown ? 'no nutrition' : `${wholeKcal(entry.kcal!)} kcal`}`}
        data-testid="entry-row"
      >
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
  | { kind: 'nutrition'; recipeId: string; back?: Slot };

/**
 * The Eaten tab (#712): a day of the food log. The day card shows `getFoodLogTotals`, each meal its entries
 * (their stored snapshots), the day's planned meals not yet logged, and an Add row. The app adds nothing up.
 */
export function EatenScreen({ api }: { api: ForageApi }) {
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [failedPlan, setFailedPlan] = useState<string | null>(null);
  // One entry id per planned meal, kept across taps and retries, so they leave one entry.
  const planIds = useRef(new Map<string, string>());

  useEffect(() => {
    void loadDay(api);
    const onVisible = () => document.visibilityState === 'visible' && void loadDay(api);
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [api]);

  const date = eatenDate.value;
  const today = eatenToday.value;
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
    setOverlay(null);
    showToast(status);
    void refreshDay(api);
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

  async function openFood(id: string, slot: Slot) {
    try {
      const food = await api.getFood(id);
      keepFood(food);
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
          const headId = `meal-${slot.toLowerCase()}`;
          return (
            <section key={slot} class="card meal-card" aria-labelledby={headId} data-testid="meal-card">
              <h2 id={headId} class="meal-card-head">
                {slot}
              </h2>
              <ul class="plain-list">
                {mine.map((e) => (
                  <EntryRow key={e.id} entry={e} name={entryName(e, foods, recipes)} onOpen={() => openEntry(e)} />
                ))}
                {plans.map((p) => (
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
              <button
                type="button"
                class="meal-add"
                onClick={() => setOverlay({ kind: 'add', slot })}
                data-testid="add-to-meal"
              >
                <span aria-hidden="true">+</span> Add to {slot.toLowerCase()}
              </button>
            </section>
          );
        })}

      {overlay?.kind === 'add' && (
        <AddSheet
          api={api}
          slot={overlay.slot}
          today={today}
          initialQuery={overlay.q}
          onPick={(target) => setOverlay({ kind: 'amount', slot: overlay.slot, target })}
          onAddNutrition={(target) => addNutrition(target, overlay.slot)}
          onAddFood={() => setOverlay({ kind: 'addFood', slot: overlay.slot })}
          onClose={() => setOverlay(null)}
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
          onChanged={() => void refreshDay(api, true)}
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
          onSaved={done}
          onClose={() => setOverlay(null)}
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
