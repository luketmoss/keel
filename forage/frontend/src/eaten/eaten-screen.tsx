import { MacroBar } from '../ui/macro-bar';
import { MacroCols } from '../ui/macro-cols';
import { MoreNutrition } from '../ui/more-nutrition';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useAuth } from '../auth/auth-context';
import { isDemoMode } from '../demo/is-demo-mode';
import type { ForageApi } from '../api/client';
import {
  SLOTS,
  type CopyMealInput,
  type Food,
  type RecipeDetail,
  type RecipeSummary,
  type FoodLogDay,
  type FoodLogEntry,
  type FoodLogMeal,
  type PlanEntry,
  type Slot,
  type Usual,
  type UsualLine,
  type UsualOption,
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
import {
  addLists,
  beginAddPass,
  heldFoods,
  heldRecipes,
  heldUsuals,
  holdFood,
  holdRecipe,
  holdUsual,
} from './add-store';
import { AddSheet } from './add-sheet';
import { AmountSheet, type LogTarget, type SavedLog } from './amount-sheet';
import { EntryRow, type RowEditing } from './entry-row';
import { GroupHeading, GroupMenuSheet, PickOne } from './group-view';
import { NewUsualSheet } from './new-usual-sheet';
import { SaveRecipeSheet } from './save-recipe-sheet';
import { SwapSheet } from './swap-sheet';
import { pickOneInput, pickOneOffers, pickOneToast, swapAmount, swapToast } from './swap';
import {
  copiedToast,
  dayWord,
  loadLookback,
  lookback,
  mealsBefore,
  mealSummary,
  pulledToast,
  sameAsLabel,
  type DayMeal,
} from './copy-meal';
import { CopyFromSheet, CopySheet, MealMenuSheet } from './meal-sheets';
import {
  afterEditor,
  bindAccount,
  closeEditor,
  editing,
  dayEntries,
  dayMeals,
  dayPlan,
  dayState,
  dayTotals,
  eatenDate,
  eatenToday,
  loadDay,
  loadDayUsuals,
  loadedDate,
  moveDay,
  pendingMeals,
  type PendingMeal,
  refreshDay,
  removeEntry,
  saveMeal,
  sendMeal,
  discardMeal,
  unloggedPlan,
  upsertEntry,
} from './eaten-store';
import {
  amountLine,
  dayPossessive,
  dayTitle,
  entryName,
  fullDate,
  mealGrams,
  mealMg,
  newLogId,
  nothingLogged,
  recipeLoggable,
  wholeGrams,
  wholeKcal,
} from './format';
import { TRAY_MAX, couldntSave, lastEntries, liveItems, looseItem, newItem, type Pass, type TrayItem } from './tray';
import {
  dayItems,
  fromUsual,
  groupChanges,
  groupKcal,
  lineOf,
  updatedUsual,
  usualOf,
  type DayItem,
} from './usual-group';

type Group = Extract<DayItem, { kind: 'group' }>;

/** The Eaten header (#712): previous day, the day, next day (disabled on today). The day is the page's h1. */
export function EatenHeader({ api }: { api: ForageApi }) {
  const date = eatenDate.value;
  const today = eatenToday.value;
  return (
    <div class="eaten-nav">
      <button
        type="button"
        class="icon-btn"
        aria-label="Previous day"
        onClick={() => afterEditor(api, () => moveDay(api, -1))}
      >
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
        onClick={() => afterEditor(api, () => moveDay(api, 1))}
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
  return (
    <section class="card day-card" role="group" aria-label={`Totals for ${fullDate(date)}`} data-testid="day-card">
      <div class="day-main">
        <span class="day-kcal tabular" data-testid="day-kcal">
          {kcal === null ? '—' : wholeKcal(kcal)}
        </span>
        <span class="hint">{day && !allUnknown ? label : 'kcal'}</span>
      </div>
      <a class="day-trends" href="#/eaten/trends" aria-label="Trends" data-testid="day-trends">
        Trends ›
      </a>
      <div class="day-macros" data-testid="day-macros">
        <MacroBar protein={macros.protein} carbs={macros.carbs} fat={macros.fat} size="day" />
        <MacroCols protein={macros.protein} carbs={macros.carbs} fat={macros.fat} format={wholeGrams} />
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

/** One of the line's two figures: `Sodium 160 mg`, `Sodium 300+ mg`, `Fiber —`. Never split, never 0 when unknown. */
function ExtraFigure({
  name,
  value,
  unknown,
  render,
}: {
  name: string;
  value: number | null | undefined;
  unknown: number | undefined;
  render: (v: number) => string;
}) {
  if (typeof value !== 'number') {
    return (
      <span class="nowrap">
        {name}{' '}
        <span class="mn-unknown" role="img" aria-label="not known">
          —
        </span>
      </span>
    );
  }
  const text = render(value);
  const shown = unknown && unknown > 0 ? text.replace(/^([^ ]+)/, '$1+') : text;
  return (
    <span class="nowrap">
      {name} {shown}
    </span>
  );
}

/** The meal card's total (#866): the API's figures for the slot, shown as text under a thin split bar. */
function MealTotals({ meal }: { meal: FoodLogMeal }) {
  const macros = { protein: meal.protein_g, carbs: meal.carbs_g, fat: meal.fat_g };
  return (
    <div class="meal-totals" data-testid="meal-totals">
      <MacroBar protein={macros.protein} carbs={macros.carbs} fat={macros.fat} size="meal" />
      <p class="meal-line tabular" data-testid="meal-line">
        <span class="meal-group">
          <span class="nowrap">P {mealGrams(macros.protein)}</span> ·{' '}
          <span class="nowrap">C {mealGrams(macros.carbs)}</span> ·{' '}
          <span class="nowrap">F {mealGrams(macros.fat)}</span>
          <span aria-hidden="true"> |</span>
        </span>{' '}
        <span class="meal-group">
          <ExtraFigure name="Sodium" value={meal.sodium_mg} unknown={meal.unknown?.sodium_mg} render={mealMg} />
          {' · '}
          <ExtraFigure name="Fiber" value={meal.fiber_g} unknown={meal.unknown?.fiber_g} render={mealGrams} />
        </span>
      </p>
    </div>
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

/**
 * A meal the tray saved, while its write is out (#933): its rows muted with `Saving…` and not tappable, a group under
 * its heading. When the write failed they stay under `Couldn't save N items.` with Try again and Discard.
 */
function PendingMealView({
  meal,
  onRetry,
  onDiscard,
}: {
  meal: PendingMeal;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const names = new Map(meal.rows.map((r) => [r.entry.id, r.name]));
  const row = (e: FoodLogEntry) => (
    <li key={e.id} data-testid="pending-row">
      <div class="log-row is-pending" aria-busy={!meal.failed}>
        <span class="recipe-text">
          <span class="recipe-name">{names.get(e.id)}</span>
          <span class="recipe-meta">{amountLine(e)}</span>
        </span>
        {meal.failed ? (
          e.kcal === null ? null : (
            <span class="log-row-kcal tabular">
              {wholeKcal(e.kcal)} <span class="hint-inline">kcal</span>
            </span>
          )
        ) : (
          <span class="saving-tag" data-testid="saving-tag">
            Saving…
          </span>
        )}
      </div>
    </li>
  );
  return (
    <li class="pending-meal" data-testid="pending-meal">
      {meal.failed && (
        <div class="pending-failed" role="status" data-testid="pending-failed">
          <p class="danger-text">{couldntSave(meal.rows.length)}</p>
          <button type="button" class="text-btn" onClick={onRetry} data-testid="pending-retry">
            Try again
          </button>
          <button type="button" class="text-btn" onClick={onDiscard} data-testid="pending-discard">
            Discard
          </button>
        </div>
      )}
      <ul class="plain-list">
        {dayItems(meal.rows.map((r) => r.entry)).map((item) =>
          item.kind === 'entry' ? (
            row(item.entry)
          ) : (
            <li key={item.id} class="group-li" data-testid="pending-group">
              <div class="group-head">
                <span class="group-name">{item.name}</span>
              </div>
              <ul class="plain-list group-entries">{item.entries.map(row)}</ul>
            </li>
          ),
        )}
      </ul>
    </li>
  );
}

type Overlay =
  | { kind: 'add'; slot: Slot; q?: string }
  | { kind: 'addFood'; slot: Slot }
  | { kind: 'barcode'; slot: Slot }
  | { kind: 'starter'; slot: Slot }
  | { kind: 'form'; slot: Slot; food: Partial<Food>; origin: FoodFormOrigin }
  // An entry's amount sheet, opened from the day (#712); adding goes through the Add sheet's tray (#933).
  | { kind: 'amount'; slot: Slot; target: LogTarget; entry: FoodLogEntry }
  | { kind: 'nutrition'; recipeId: string; back?: Slot }
  // #788: the New recipe sheet, over the meal in select mode.
  | { kind: 'saveRecipe'; slot: Slot }
  // #884: a meal's ⋯ menu, and the two sheets it opens.
  | { kind: 'menu'; slot: Slot }
  | { kind: 'copyTo'; slot: Slot }
  | { kind: 'copyFrom'; slot: Slot }
  // #885: a group's ⋯ menu, and its Copy to… sheet.
  | { kind: 'groupMenu'; slot: Slot; groupId: string }
  | { kind: 'groupCopy'; slot: Slot; groupId: string }
  // #886: an entry's Swap sheet, and the New usual sheet over a meal in select mode or from a group's menu.
  | { kind: 'swap'; slot: Slot; entryId: string }
  | { kind: 'newUsual'; slot: Slot; ids: string[]; name?: string };

/**
 * The Eaten tab (#712): a day of the food log. The day card shows `getFoodLogTotals`, each meal its entries
 * (their stored snapshots), the day's planned meals not yet logged, and an Add row. The app adds nothing up.
 */
export function EatenScreen({ api }: { api: ForageApi }) {
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  // #933: the tray, from an Add row's tap until the Add sheet closes. The screen holds it because the Add sheet
  // unmounts while another sheet (Add a food, the barcode scanner) is over it.
  const [pass, setPass] = useState<Pass | null>(null);
  const sentPass = useRef(false);
  // The recipe the Nutrition sheet last saved from the Add sheet, which goes into the tray when it closes loggable.
  const nutritionRecipe = useRef<RecipeSummary | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [failedPlan, setFailedPlan] = useState<string | null>(null);
  // One entry id per planned meal, kept across taps and retries, so they leave one entry.
  const planIds = useRef(new Map<string, string>());
  // #788: the one meal in select mode, and the ids of the entries ticked in it.
  const [selecting, setSelecting] = useState<Slot | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);

  // #884: one copy at a time; a second tap while one is out does nothing.
  const copying = useRef(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  // #885: the pick-one list open (an entry id), a pick or a menu action saving.
  const [openPick, setOpenPick] = useState<string | null>(null);
  const [pickBusy, setPickBusy] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  // #886: a swap saving, or failed.
  const [swapBusy, setSwapBusy] = useState(false);
  const [swapFailed, setSwapFailed] = useState(false);

  function leaveSelect() {
    setSelecting(null);
    setTicked([]);
  }

  // #931: the Add sheet's held lists belong to the signed-in account; the demo user has none on the device.
  const { user } = useAuth();
  const account = isDemoMode() ? null : (user?.email ?? null);
  useEffect(() => bindAccount(account), [account]);

  useEffect(() => {
    void loadDay(api);
    void loadDayUsuals(api);
    const onVisible = () => {
      // #882: the app going to the background saves an editor's pending change.
      if (document.visibilityState !== 'visible') {
        void closeEditor(api);
        return;
      }
      leaveSelect();
      void loadDay(api);
      void loadDayUsuals(api);
      void loadLookback(api, eatenDate.value);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      // Leaving the tab saves a pending change too.
      void closeEditor(api);
    };
  }, [api]);

  const date = eatenDate.value;
  const today = eatenToday.value;
  // A day change leaves select mode with nothing saved.
  useEffect(() => {
    leaveSelect();
    // A day the hash moved to leaves an open editor saved and closed (#882).
    void closeEditor(api);
  }, [date]);
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
  // #884: the 7 days before the one shown, read once per day for the "Same as…" suggestion and Copy from another day….
  useEffect(() => {
    void loadLookback(api, date);
  }, [date, api]);
  // #885: opening an amount editor closes an open pick-one list.
  const editingId = editing.value?.id ?? null;
  useEffect(() => {
    if (editingId) setOpenPick(null);
  }, [editingId]);
  const state = dayState.value;
  const entries = dayEntries.value;
  const planned = unloggedPlan(dayPlan.value, entries);
  const foods = heldFoods.value;
  const recipes = heldRecipes.value;
  const usuals = heldUsuals.value;
  const foodMap = new Map(foods.map((f) => [f.id, f]));
  const pending = pendingMeals.value;
  const pendingFor = (slot: Slot): PendingMeal[] =>
    pending
      .filter((p) => p.date === date && p.slot === slot)
      .map((p) => ({ ...p, rows: p.rows.filter((r) => !entries.some((e) => e.id === r.entry.id)) }))
      .filter((p) => p.rows.length > 0);

  // The write's own answer goes into the day, then the sheet closes and the toast shows, in one update; the totals
  // catch up quietly behind it (#785).
  function done(status: string, saved: SavedLog) {
    if ('entry' in saved) {
      if (overlay?.kind === 'amount' && overlay.target.kind === 'food') holdFood(overlay.target.food);
      upsertEntry(saved.entry);
    } else removeEntry(saved.removed);
    void refreshDay(api);
    setOverlay(null);
    showToast(status);
  }

  function startPass(slot: Slot) {
    afterEditor(api, () => beginPass(slot));
  }

  function beginPass(slot: Slot) {
    sentPass.current = false;
    setPass({ slot, date, items: [], q: '' });
    beginAddPass();
    setOverlay({ kind: 'add', slot });
  }

  /** The sheet closes, whatever the tray held, and focus goes back to its Add row. */
  function endPass() {
    const slot = pass?.slot;
    setOverlay(null);
    setPass(null);
    if (!slot) return;
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-testid="add-to-meal"][data-slot="${slot}"]`)?.focus(),
    );
  }

  /** The footer's save (#933): the day shows the rows at once, `logMeal` goes out, and the sheet is gone. */
  function savePass() {
    if (!pass || !liveItems(pass.items).length || sentPass.current) return;
    sentPass.current = true;
    saveMeal(api, pass.date, pass.slot, pass.items);
    endPass();
  }

  function changeTray(change: (items: TrayItem[]) => TrayItem[]) {
    setPass((p) => p && { ...p, items: change(p.items) });
  }

  /** A food or recipe made or given nutrition while the Add sheet was open goes into the tray, as a tap would. */
  function addToTray(target: LogTarget) {
    const last = lastEntries(addLists.value?.log ?? []);
    changeTray((items) =>
      liveItems(items).length >= TRAY_MAX || looseItem(items, target) ? items : [...items, newItem(target, last)],
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
    afterEditor(api, () => openSheet(e));
  }

  function openSheet(e: FoodLogEntry) {
    const target: LogTarget | null = e.food_id
      ? { kind: 'food', food: foods.find((f) => f.id === e.food_id) ?? removedFood(e.food_id) }
      : {
          kind: 'recipe',
          recipe: recipes.find((r) => r.id === e.recipe_id) ?? ({ id: e.recipe_id, name: 'A removed recipe' } as never),
        };
    setOverlay({ kind: 'amount', slot: e.slot, target, entry: e });
  }

  /** The chip and inline editor (#882), for an entry whose food or recipe is still in the library. */
  function rowEditing(e: FoodLogEntry): RowEditing | undefined {
    if (e.recipe_id) return { api, food: null };
    const food = foods.find((f) => f.id === e.food_id);
    return food ? { api, food } : undefined;
  }

  function addNutrition(target: LogTarget, slot: Slot) {
    if (target.kind === 'food') {
      setOverlay({ kind: 'form', slot, food: target.food, origin: { focusNutrition: true } });
    } else {
      nutritionRecipe.current = null;
      setOverlay({ kind: 'nutrition', recipeId: target.recipe.id, back: slot });
    }
  }

  /** Why an entry can't go in a recipe, or null when it can: recipes are not lines, and a removed food has none. */
  function blockedReason(e: FoodLogEntry): string | null {
    if (!e.food_id) return "Recipes can't go in a usual or a recipe";
    return foods.some((f) => f.id === e.food_id) ? null : 'This food was deleted';
  }

  function toggle(id: string) {
    setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  }

  function startSelect(slot: Slot) {
    afterEditor(api, () => {
      setSelecting(slot);
      setTicked([]);
    });
  }

  function openMenu(slot: Slot) {
    afterEditor(api, () => setOverlay({ kind: 'menu', slot }));
  }

  /**
   * One copy (#884): the entries the write answered go into the day when it is the day on screen, the sheet closes
   * and the toast shows with Undo, in one update. `fail` is the toast for a failure with no sheet to hold it.
   */
  async function copy(input: CopyMealInput, ok: (n: number) => string, fail: string | null) {
    if (copying.current) return;
    copying.current = true;
    setCopyBusy(true);
    setCopyFailed(false);
    try {
      const made = await api.copyMeal(input);
      for (const e of made) upsertEntry(e);
      if (input.to_date === eatenDate.value) void refreshDay(api);
      else void loadLookback(api, eatenDate.value);
      setOverlay(null);
      const ids = made.map((e) => e.id);
      showToast(ok(made.length), { label: 'Undo', run: () => void undoCopy(ids) });
    } catch {
      if (fail) showToast(fail);
      else setCopyFailed(true);
    } finally {
      copying.current = false;
      setCopyBusy(false);
    }
  }

  /** Undo deletes exactly the copied entries, then the day patches. */
  async function undoCopy(ids: string[]) {
    try {
      await api.deleteLogEntries(ids);
      for (const id of ids) removeEntry(id);
      void refreshDay(api);
      void loadLookback(api, eatenDate.value);
    } catch {
      showToast("Couldn't undo. The copied items are still there.");
    }
  }

  /** Bring an earlier day's meal into the one shown, on the same slot. */
  function pull(from: DayMeal, slot: Slot, sheet: boolean) {
    const word = dayWord(from.date, today);
    void copy(
      { from_date: from.date, from_slot: slot, to_date: date, to_slot: slot },
      (n) => pulledToast(from.date, today, slot, n),
      sheet ? null : `Couldn't copy ${word}'s ${slot.toLowerCase()}. Try again.`,
    );
  }

  /** A pick-one's choice (#885): the entry becomes that option at the option's own amount, in place. */
  function pick(entry: FoodLogEntry, opt: UsualOption) {
    if (pickBusy) return;
    afterEditor(api, () => {
      setPickBusy(entry.id);
      api
        .updateLogEntry(entry.id, { food_id: opt.food_id, qty: opt.qty, unit: opt.unit })
        .then(
          (saved) => {
            upsertEntry(saved);
            void refreshDay(api);
            setOpenPick(null);
          },
          () => showToast("Couldn't save. Try again."),
        )
        .finally(() => setPickBusy(null));
    });
  }

  function openGroupMenu(slot: Slot, groupId: string) {
    afterEditor(api, () => setOverlay({ kind: 'groupMenu', slot, groupId }));
  }

  /** Update the usual (#885): the group's entries become its lines, and the entries are linked to them again. */
  async function updateUsual(group: Group, usual: Usual) {
    if (groupBusy) return;
    setGroupBusy(true);
    try {
      const saved = await api.upsertUsual(updatedUsual(group.entries, usual));
      holdUsual(saved);
      try {
        const linked = await api.setLogGroup(
          group.entries.map((e) => e.id),
          { name: group.name, usual_id: usual.id },
        );
        for (const e of linked) upsertEntry(e);
      } catch {
        void refreshDay(api);
        showToast("Couldn't save. Try again.");
        return;
      }
      setOverlay(null);
      showToast(`Updated ${usual.name}. Next time it starts like this.`);
    } catch {
      showToast("Couldn't save. Try again.");
    } finally {
      setGroupBusy(false);
    }
  }

  async function ungroup(group: Group) {
    if (groupBusy) return;
    setGroupBusy(true);
    try {
      const freed = await api.setLogGroup(
        group.entries.map((e) => e.id),
        null,
      );
      for (const e of freed) upsertEntry(e);
      setOverlay(null);
      showToast('Ungrouped');
    } catch {
      showToast("Couldn't save. Try again.");
    } finally {
      setGroupBusy(false);
    }
  }

  async function removeGroup(group: Group) {
    if (groupBusy) return;
    setGroupBusy(true);
    try {
      const ids = group.entries.map((e) => e.id);
      await api.deleteLogEntries(ids);
      for (const id of ids) removeEntry(id);
      void refreshDay(api);
      setOverlay(null);
      const first = group.entries[0];
      const items = group.entries
        .filter((e) => e.food_id)
        .map((e) => ({ food_id: e.food_id, qty: e.qty, unit: e.unit }));
      showToast(`Removed ${group.name}`, {
        label: 'Undo',
        run: () => void relogGroup(first.date, first.slot, group.name, items),
      });
    } catch {
      showToast("Couldn't save. Try again.");
    } finally {
      setGroupBusy(false);
    }
  }

  /** Undo of Remove all: the same foods again under the same name; a new group with no usual link. */
  async function relogGroup(
    day: string,
    slot: Slot,
    name: string,
    items: { food_id: string; qty: number; unit: string }[],
  ) {
    try {
      const { entries: made } = await api.logGroup({ date: day, slot, name, items });
      for (const e of made) upsertEntry(e);
      void refreshDay(api);
    } catch {
      showToast("Couldn't undo. Try again from your log.");
    }
  }

  function savedRecipe(recipe: RecipeDetail) {
    // The reply goes into the Library's list and the Add sheet's (`addRecipe` does both, #941), then the sheet closes
    // and the toast shows together.
    addRecipe(recipe);
    setOverlay(null);
    leaveSelect();
    showToast(`Saved ${recipe.name} to your recipes`);
  }

  async function openFood(id: string, slot: Slot) {
    try {
      const food = await api.getFood(id);
      keepFood(food);
      if (hasNutrition(food)) addToTray({ kind: 'food', food });
      setOverlay({ kind: 'add', slot });
    } catch {
      setOverlay({ kind: 'add', slot });
    }
  }

  /** Swap (#886): the entry becomes another food in place, for this day only; Undo puts it back. */
  async function swap(entry: FoodLogEntry, line: UsualLine, food: Food) {
    if (swapBusy) return;
    setSwapBusy(true);
    setSwapFailed(false);
    const was = { food_id: entry.food_id, qty: entry.qty, unit: entry.unit };
    const amount = swapAmount(entry, food);
    try {
      const saved = await api.updateLogEntry(entry.id, { food_id: food.id, qty: amount.qty, unit: amount.unit });
      holdFood(food);
      upsertEntry(saved);
      void refreshDay(api);
      void loadDayUsuals(api);
      setOverlay(null);
      showToast(swapToast(food.name, food.id === line.food_id), {
        label: 'Undo',
        run: () => void undoSwap(entry.id, was),
      });
    } catch {
      setSwapFailed(true);
    } finally {
      setSwapBusy(false);
    }
  }

  async function undoSwap(id: string, was: { food_id: string; qty: number; unit: string }) {
    try {
      upsertEntry(await api.updateLogEntry(id, was));
      void refreshDay(api);
      void loadDayUsuals(api);
    } catch {
      showToast("Couldn't undo. The swap is still there.");
    }
  }

  /** Make it a pick-one (#886): the swapped line becomes a pick-one of its food and the entry's. */
  async function makePickOne(group: Group, usual: Usual, entryId: string) {
    const entry = group.entries.find((e) => e.id === entryId);
    const offer = pickOneOffers(group.entries, usual, foodMap).find((o) => o.entryId === entryId);
    if (groupBusy || !entry || !offer) return;
    setGroupBusy(true);
    try {
      holdUsual(await api.upsertUsual(pickOneInput(usual, entry)));
      setOverlay(null);
      showToast(pickOneToast(usual.name, offer.from, offer.to));
    } catch {
      showToast("Couldn't save. Try again.");
    } finally {
      setGroupBusy(false);
    }
  }

  /** The usual saved from a meal (#886): the entries are its first group, or only the usual exists when grouping failed. */
  function usualSaved(usual: Usual, grouped: FoodLogEntry[] | null) {
    holdUsual(usual);
    for (const e of grouped ?? []) upsertEntry(e);
    void refreshDay(api);
    void loadDayUsuals(api);
    setOverlay(null);
    leaveSelect();
    showToast(grouped ? `Saved ${usual.name} to your usuals` : `Saved ${usual.name}. Couldn't group today's items.`);
  }

  /** An entry's row; one on a pick-one line of its usual shows the choice under it (#885). */
  function renderEntry(e: FoodLogEntry, usual: Usual | null) {
    const amount = rowEditing(e);
    const line = amount ? lineOf(e, usual) : null;
    return (
      <EntryRow
        key={e.id}
        entry={e}
        name={entryName(e, foods, recipes)}
        onOpen={() => openEntry(e)}
        amount={amount}
        onSwap={
          amount && usual && line && !line.options && e.food_id
            ? () =>
                afterEditor(api, () => {
                  setSwapFailed(false);
                  setOverlay({ kind: 'swap', slot: e.slot, entryId: e.id });
                })
            : undefined
        }
        below={
          line?.options ? (
            <PickOne
              foodId={e.food_id}
              options={line.options}
              foods={foodMap}
              open={openPick === e.id}
              busy={pickBusy === e.id}
              onToggle={() => {
                if (openPick === e.id) setOpenPick(null);
                else afterEditor(api, () => setOpenPick(e.id));
              }}
              onPick={(o) => pick(e, o)}
            />
          ) : undefined
        }
      />
    );
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
          const meal = mine.length ? dayMeals.value.find((m) => m.slot === slot) : undefined;
          const mealUnknown = !!meal && meal.kcal === null;
          const count = selectingHere ? mine.filter((e) => ticked.includes(e.id) && !blockedReason(e)).length : 0;
          // #933: the tray's meals still being written for this day and meal; a row the day already holds is not shown twice.
          const saving = state === 'ready' && !selectingHere ? pendingFor(slot) : [];
          return (
            <section key={slot} class="card meal-card" aria-labelledby={headId} data-testid="meal-card">
              <div class="meal-head-row">
                <h2 id={headId} class="meal-card-head">
                  {slot}
                </h2>
                {meal && (
                  <span class="meal-total" data-testid="meal-total">
                    {mealUnknown ? (
                      <span class="mn-unknown" role="img" aria-label="not known">
                        —
                      </span>
                    ) : (
                      <>
                        {meal.partial && (
                          <span
                            class="chip-flag low-chip"
                            role="img"
                            aria-label="Low: some entries have no nutrition or are missing ingredients"
                          >
                            Low
                          </span>
                        )}
                        <span class="log-row-kcal tabular" data-testid="meal-kcal">
                          {wholeKcal(meal.kcal!)} <span class="hint-inline">kcal</span>
                        </span>
                      </>
                    )}
                  </span>
                )}
                {state === 'ready' &&
                  (selectingHere ? (
                    <button type="button" class="text-btn" onClick={leaveSelect} data-testid="select-cancel">
                      Cancel
                    </button>
                  ) : (
                    <button
                      type="button"
                      class="icon-btn"
                      aria-label={`More for ${slot.toLowerCase()}`}
                      aria-haspopup="dialog"
                      onClick={() => openMenu(slot)}
                      data-testid="meal-menu"
                    >
                      <span aria-hidden="true">⋯</span>
                    </button>
                  ))}
              </div>
              {meal && !mealUnknown && <MealTotals meal={meal} />}
              {meal && mealUnknown && (
                <p class="meal-line" data-testid="meal-none">
                  None of these entries has nutrition yet.
                </p>
              )}
              <ul class="plain-list">
                {selectingHere
                  ? mine.map((e) => (
                      <SelectRow
                        key={e.id}
                        entry={e}
                        name={entryName(e, foods, recipes)}
                        ticked={ticked.includes(e.id)}
                        blocked={blockedReason(e)}
                        onToggle={() => toggle(e.id)}
                      />
                    ))
                  : dayItems(mine).map((item) => {
                      if (item.kind === 'entry') return renderEntry(item.entry, null);
                      const usual = usualOf(item.entries, usuals);
                      const changed = !!usual && groupChanges(item.entries, usual, foodMap).length > 0;
                      return (
                        <li key={item.id} class="group-li" data-testid="group">
                          <GroupHeading
                            name={item.name}
                            usual={fromUsual(item.entries)}
                            changed={changed}
                            kcal={groupKcal(item.entries)}
                            onMenu={() => openGroupMenu(slot, item.id)}
                          />
                          <ul class="plain-list group-entries">{item.entries.map((e) => renderEntry(e, usual))}</ul>
                        </li>
                      );
                    })}
                {saving.map((p) => (
                  <PendingMealView
                    key={p.id}
                    meal={p}
                    onRetry={() => void sendMeal(api, p.id)}
                    onDiscard={() => discardMeal(p.id)}
                  />
                ))}
                {!selectingHere &&
                  plans.map((p) => (
                    <PlannedRow
                      key={p.id}
                      plan={p}
                      busy={busyPlan === p.id}
                      failed={failedPlan === p.id}
                      onLog={() => void logPlanned(p)}
                      onNutrition={() =>
                        afterEditor(api, () => setOverlay({ kind: 'nutrition', recipeId: p.recipe_id }))
                      }
                    />
                  ))}
              </ul>
              {selectingHere ? (
                <>
                  <button
                    type="button"
                    class="btn btn-primary btn-block select-save"
                    disabled={count === 0}
                    onClick={() =>
                      setOverlay({
                        kind: 'newUsual',
                        slot,
                        ids: mine.filter((e) => ticked.includes(e.id) && !blockedReason(e)).map((e) => e.id),
                      })
                    }
                    data-testid="save-as-usual"
                  >
                    {count === 0 ? 'Save as a usual' : `Save ${count} as a usual`}
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary btn-block select-save"
                    disabled={count === 0}
                    onClick={() => setOverlay({ kind: 'saveRecipe', slot })}
                    data-testid="save-as-recipe"
                  >
                    {count === 0 ? 'Save as a recipe' : `Save ${count} as a recipe`}
                  </button>
                  {count === 0 && <p class="hint select-helper">Tick the items that go together.</p>}
                </>
              ) : (
                <>
                  {state === 'ready' &&
                    mine.length === 0 &&
                    saving.length === 0 &&
                    (() => {
                      const from = mealsBefore(date, slot)[0];
                      return from ? (
                        <button
                          type="button"
                          class="meal-suggest"
                          onClick={() => pull(from, slot, false)}
                          aria-busy={copyBusy}
                          data-testid="same-as"
                        >
                          <span class="meal-suggest-title">
                            <span aria-hidden="true">↻</span> {sameAsLabel(from.date, today)}
                          </span>
                          <span class="meal-suggest-names" data-testid="same-as-names">
                            {mealSummary(from.entries, foods, recipes)}
                          </span>
                        </button>
                      ) : null;
                    })()}
                  <button
                    type="button"
                    class="meal-add"
                    onClick={() => startPass(slot)}
                    data-testid="add-to-meal"
                    data-slot={slot}
                  >
                    <span aria-hidden="true">+</span> Add to {slot.toLowerCase()}
                  </button>
                </>
              )}
            </section>
          );
        })}

      {overlay?.kind === 'menu' &&
        (() => {
          const slot = overlay.slot;
          const mine = entries.filter((e) => e.slot === slot);
          return (
            <MealMenuSheet
              slot={slot}
              count={mine.length}
              selectable={mine.filter((e) => !blockedReason(e)).length}
              onCopyTo={() => setOverlay({ kind: 'copyTo', slot })}
              onSelect={() => {
                setOverlay(null);
                startSelect(slot);
              }}
              onCopyFrom={() => {
                setCopyFailed(false);
                setOverlay({ kind: 'copyFrom', slot });
              }}
              onClose={() => setOverlay(null)}
            />
          );
        })()}
      {overlay?.kind === 'groupMenu' &&
        (() => {
          const group = dayItems(entries.filter((e) => e.slot === overlay.slot)).find(
            (i): i is Group => i.kind === 'group' && i.id === overlay.groupId,
          );
          if (!group) return null;
          const usual = usualOf(group.entries, usuals);
          return (
            <GroupMenuSheet
              name={group.name}
              count={group.entries.length}
              update={usual ? { usual: usual.name, changes: groupChanges(group.entries, usual, foodMap) } : null}
              pickOnes={usual ? pickOneOffers(group.entries, usual, foodMap) : []}
              busy={groupBusy}
              onUpdate={() => usual && void updateUsual(group, usual)}
              onPickOne={(entryId) => usual && void makePickOne(group, usual, entryId)}
              onSaveUsual={
                usual
                  ? undefined
                  : () =>
                      setOverlay({
                        kind: 'newUsual',
                        slot: overlay.slot,
                        ids: group.entries.filter((e) => !blockedReason(e)).map((e) => e.id),
                        name: group.name,
                      })
              }
              onCopy={() => {
                setCopyFailed(false);
                setOverlay({ kind: 'groupCopy', slot: overlay.slot, groupId: group.id });
              }}
              onUngroup={() => void ungroup(group)}
              onRemove={() => void removeGroup(group)}
              onClose={() => !groupBusy && setOverlay(null)}
            />
          );
        })()}
      {overlay?.kind === 'groupCopy' &&
        (() => {
          const group = dayItems(entries.filter((e) => e.slot === overlay.slot)).find(
            (i): i is Group => i.kind === 'group' && i.id === overlay.groupId,
          );
          if (!group) return null;
          return (
            <CopySheet
              slot={overlay.slot}
              title={`Copy ${group.name}`}
              today={today}
              entries={group.entries}
              foods={foods}
              recipes={recipes}
              busy={copyBusy}
              failed={copyFailed}
              onCopy={(toDate, toSlot) =>
                void copy(
                  { from_date: date, from_slot: overlay.slot, group_id: group.id, to_date: toDate, to_slot: toSlot },
                  (n) => copiedToast(toDate, today, toSlot, n),
                  null,
                )
              }
              onClose={() => !copyBusy && setOverlay(null)}
            />
          );
        })()}
      {overlay?.kind === 'copyTo' && (
        <CopySheet
          slot={overlay.slot}
          today={today}
          entries={entries.filter((e) => e.slot === overlay.slot)}
          foods={foods}
          recipes={recipes}
          busy={copyBusy}
          failed={copyFailed}
          onCopy={(toDate, toSlot) => {
            const slot = overlay.slot;
            void copy(
              { from_date: date, from_slot: slot, to_date: toDate, to_slot: toSlot },
              (n) => copiedToast(toDate, today, toSlot, n),
              null,
            );
          }}
          onClose={() => !copyBusy && setOverlay(null)}
        />
      )}
      {overlay?.kind === 'copyFrom' && (
        <CopyFromSheet
          slot={overlay.slot}
          today={today}
          days={mealsBefore(date, overlay.slot)}
          ready={lookback.value?.date === date}
          foods={foods}
          recipes={recipes}
          busy={copyBusy}
          failed={copyFailed}
          onPick={(from) => {
            const day = mealsBefore(date, overlay.slot).find((d) => d.date === from);
            if (day) pull(day, overlay.slot, true);
          }}
          onClose={() => !copyBusy && setOverlay(null)}
        />
      )}
      {overlay?.kind === 'swap' &&
        (() => {
          const entry = entries.find((e) => e.id === overlay.entryId);
          const usual = entry ? (usuals.find((u) => u.id === entry.usual_id) ?? null) : null;
          const line = entry ? lineOf(entry, usual) : null;
          if (!entry || !usual || !line) return null;
          return (
            <SwapSheet
              api={api}
              entry={entry}
              name={entryName(entry, foods, recipes)}
              usualId={usual.id}
              usualName={usual.name}
              line={line}
              foods={foods}
              busy={swapBusy}
              failed={swapFailed}
              onPick={(food) => void swap(entry, line, food)}
              onClose={() => !swapBusy && setOverlay(null)}
            />
          );
        })()}
      {overlay?.kind === 'newUsual' && (
        <NewUsualSheet
          api={api}
          slot={overlay.slot}
          date={date}
          today={today}
          foods={foods}
          initialName={overlay.name}
          lines={entries
            .filter((e) => overlay.ids.includes(e.id))
            .map((e) => ({ entry: e, name: entryName(e, foods, recipes) }))}
          onSaved={usualSaved}
          onClose={() => setOverlay(null)}
        />
      )}
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
      {overlay?.kind === 'add' && pass && (
        <AddSheet
          api={api}
          slot={overlay.slot}
          today={today}
          items={pass.items}
          onItems={changeTray}
          initialQuery={overlay.q ?? pass.q}
          onQuery={(q) => setPass((p) => (p && p.q !== q ? { ...p, q } : p))}
          usuals={usuals}
          onAddNutrition={(target) => addNutrition(target, overlay.slot)}
          onAddFood={() => setOverlay({ kind: 'addFood', slot: overlay.slot })}
          onSave={savePass}
          onDiscard={endPass}
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
            // The held foods were loaded before these existed: fetch each, so a search finds it.
            for (const n of named) void api.getFood(n.id).then(holdFood, () => {});
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
            // #933: a food saved with nutrition goes into the tray at its first serving's default amount.
            if (hasNutrition(food)) addToTray({ kind: 'food', food });
            setOverlay({ kind: 'add', slot: overlay.slot });
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
              // A recipe given nutrition is loggable in the Add sheet's held list too.
              const { lines: _l, steps: _s, walkthrough: _w, walkthrough_check: _c, ...summary } = recipe;
              holdRecipe(summary);
              nutritionRecipe.current = summary;
            }
            void refreshDay(api, true);
          }}
          onClose={() => {
            const recipe = nutritionRecipe.current;
            nutritionRecipe.current = null;
            if (!overlay.back) return setOverlay(null);
            // #933: a recipe given nutrition goes into the tray, as a food does.
            if (recipe && recipeLoggable(recipe)) addToTray({ kind: 'recipe', recipe });
            setOverlay({ kind: 'add', slot: overlay.back });
          }}
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
