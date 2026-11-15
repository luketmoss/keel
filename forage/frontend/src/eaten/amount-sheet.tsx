import { useRef, useState } from 'preact/hooks';
import { ApiError, type ForageApi } from '../api/client';
import { SLOTS, type Food, type FoodLogEntry, type LogEntryInput, type RecipeSummary, type Slot } from '../api/types';
import { parseAmount } from '../import/amount';
import { displayName } from '../library/food-math';
import { MacroBar } from '../ui/macro-bar';
import { MacroCols } from '../ui/macro-cols';
import { MoreNutrition } from '../ui/more-nutrition';
import { ConfirmSheet, Sheet } from '../ui/sheet';
import { MAX_QTY, dayPossessive, defaultQty, newLogId, qtyText, sheetGrams, stepFor, tenth, wholeKcal } from './format';
import { previewFood, previewRecipe, type EntryNutrition } from './preview';

/** What is being logged: a food, or a recipe in servings. */
export type LogTarget = { kind: 'food'; food: Food } | { kind: 'recipe'; recipe: RecipeSummary };

interface Props {
  api: ForageApi;
  target: LogTarget;
  /** The day the sheet was opened for: the entry is saved to it even past midnight. */
  date: string;
  today: string;
  slot: Slot;
  /** Editing this entry, in place of adding one. */
  entry?: FoodLogEntry;
  /** #786: inside a pass the meal is the Add row's, so the Meal chips are left out. */
  fixedSlot?: boolean;
  /**
   * Saved: the status line's text ("Logged Greek yogurt") and what the write answered (#785): the stored entry, or
   * the id of the one deleted. The screen patches its day from it, then closes the sheet.
   */
  onSaved: (status: string, saved: SavedLog) => void;
  onClose: () => void;
}

/** What a save answered: the stored entry, or the id of the entry that was deleted. */
export type SavedLog = { entry: FoodLogEntry } | { removed: string };

export const targetName = (t: LogTarget) => (t.kind === 'food' ? displayName(t.food) : t.recipe.name);

/** Why a save was refused, in fixed words: a food or recipe deleted meanwhile, else the API's own text. */
export function saveRefusal(err: unknown): string {
  if (err instanceof ApiError && err.code !== 'network' && err.code !== 'unconfigured') {
    if (/is not a food/.test(err.message)) return "Couldn't save: this food was deleted.";
    if (/is not a recipe/.test(err.message)) return "Couldn't save: this recipe was deleted.";
    return `Couldn't save: ${err.message}.`;
  }
  return "Couldn't save. Your changes are kept here. Try again.";
}

/**
 * The amount sheet (#712), for adding and editing: an amount in servings or grams, the calories and macros the
 * API will store for it, the meal, and Log it or Save. The figures are worked out here at once (#929, `preview.ts`,
 * pinned to the API's own arithmetic by a test) with no request; what is stored is what the write answers.
 */
export function AmountSheet({
  api,
  target,
  date,
  today,
  slot: initialSlot,
  entry,
  fixedSlot,
  onSaved,
  onClose,
}: Props) {
  const name = targetName(target);
  const weights = target.kind === 'food' ? (target.food.servings_json ?? []) : [];
  const units = target.kind === 'food' ? [...weights.map((w) => w.name), 'g'] : ['serving'];
  const startUnit = entry?.unit ?? units[0];
  const [unit, setUnit] = useState(startUnit);
  const [typed, setTyped] = useState(qtyText(entry?.qty ?? defaultQty(startUnit)));
  const [slot, setSlot] = useState<Slot>(entry?.slot ?? initialSlot);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // One id per sheet open: a repeated tap or a retry after a lost answer leaves one entry.
  const id = useRef(entry?.id ?? newLogId());
  // An amount that can't be typed into a figure (blank, 0) leaves the last one in place.
  const lastFigures = useRef<EntryNutrition | FoodLogEntry | null>(entry ?? null);
  // A second tap on Delete while the first is out sends no second write.
  const deleting = useRef(false);

  const qty = parseAmount(typed);
  const valid = typeof qty === 'number' && qty > 0 && qty <= MAX_QTY;
  const step = stepFor(unit);
  // #870: aria-disabled, not disabled, so Less keeps focus when a tap reaches the minimum.
  const atMin = valid && (qty as number) <= step;

  function input(q: number): LogEntryInput {
    return target.kind === 'food'
      ? { id: id.current, date, slot, food_id: target.food.id, qty: q, unit }
      : { id: id.current, date, slot, recipe_id: target.recipe.id, qty: q, unit: 'serving' };
  }

  // The figures follow the amount and the unit, never the meal: moving an entry keeps its numbers.
  let preview: EntryNutrition | FoodLogEntry | null = lastFigures.current;
  let previewFailed = false;
  if (valid) {
    if (entry && qty === entry.qty && unit === entry.unit) {
      preview = entry;
    } else {
      preview =
        target.kind === 'food'
          ? previewFood(target.food, qty as number, unit, entry)
          : previewRecipe(target.recipe, qty as number);
      previewFailed = preview === null;
    }
    lastFigures.current = preview;
  }

  function chooseUnit(next: string) {
    setUnit(next);
    setTyped(qtyText(defaultQty(next)));
  }

  function nudge(by: number) {
    const now = valid ? (qty as number) : 0;
    const next = Math.max(step, Math.round((now + by) * 1000) / 1000);
    setTyped(qtyText(Math.min(MAX_QTY, next)));
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (entry) {
        const changes: { slot?: Slot; qty?: number; unit?: string } = {};
        if (slot !== entry.slot) changes.slot = slot;
        if (qty !== entry.qty) changes.qty = qty as number;
        if (unit !== entry.unit) changes.unit = unit;
        const stored = Object.keys(changes).length ? await api.updateLogEntry(entry.id, changes) : entry;
        onSaved(`Saved ${name}`, { entry: stored });
      } else {
        onSaved(`Logged ${name}`, { entry: await api.logEntry(input(qty as number)) });
      }
    } catch (err) {
      setError(saveRefusal(err));
      setSaving(false);
    }
  }

  async function remove() {
    if (!entry || deleting.current) return;
    deleting.current = true;
    try {
      await api.deleteLogEntry(entry.id);
      onSaved(`Deleted ${name}`, { removed: entry.id });
    } catch {
      deleting.current = false;
      setConfirming(false);
      setError("Couldn't delete. Try again.");
    }
  }

  if (confirming && entry) {
    return (
      <ConfirmSheet
        title={`Delete ${name} from ${entry.slot}?`}
        message={`Its calories come off ${dayPossessive(entry.date, today)} total.`}
        confirm="Delete"
        cancel="Cancel"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  const first = weights[0];
  const subline =
    target.kind === 'recipe'
      ? target.recipe.servings
        ? `Serves ${target.recipe.servings}`
        : ''
      : first
        ? `${name} · 1 ${first.name} = ${tenth(first.g)} g`
        : '';
  const recalculated =
    !!entry &&
    !!preview &&
    preview !== entry &&
    (qty !== entry.qty || unit !== entry.unit) &&
    preview.kcal !== entry.kcal;
  const macros = { protein: preview?.protein_g ?? null, carbs: preview?.carbs_g ?? null, fat: preview?.fat_g ?? null };
  const partial = target.kind === 'recipe' && !!preview?.partial && preview.kcal !== null;

  return (
    <Sheet title={name} onClose={onClose} testId="amount-sheet" focusPanel>
      {subline && (
        <p class="hint" data-testid="amount-subline">
          {subline}
        </p>
      )}

      <div class="stepper amount-stepper">
        <label class="field-label" for="log-amount">
          Amount
        </label>
        <button
          type="button"
          class="icon-btn"
          aria-label="Less"
          onClick={() => {
            if (!atMin) nudge(-step);
          }}
          aria-disabled={atMin ? 'true' : undefined}
        >
          −
        </button>
        <input
          id="log-amount"
          class="field amount-field"
          inputMode="decimal"
          value={typed}
          onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
          aria-describedby={valid ? undefined : 'log-amount-help'}
          data-testid="log-amount"
        />
        <button type="button" class="icon-btn" aria-label="More" onClick={() => nudge(step)}>
          +
        </button>
      </div>
      {!valid && (
        <p id="log-amount-help" class="field-error">
          Enter an amount above 0.
        </p>
      )}

      {target.kind === 'food' ? (
        <>
          <label class="field-label" for="log-unit">
            Unit
          </label>
          <select
            id="log-unit"
            class="field"
            value={unit}
            onChange={(e) => chooseUnit((e.target as HTMLSelectElement).value)}
            data-testid="log-unit"
          >
            {weights.map((w) => (
              <option key={w.name} value={w.name}>
                {`${w.name} (${tenth(w.g)} g)`}
              </option>
            ))}
            <option value="g">grams</option>
          </select>
        </>
      ) : (
        <p class="field-label">servings</p>
      )}

      <div class="card amount-numbers" data-testid="amount-numbers">
        <span class="amount-kcal tabular" data-testid="amount-kcal">
          {preview && preview.kcal !== null ? wholeKcal(preview.kcal) : '—'}
        </span>
        <span class="hint">kcal{partial && <span class="chip-flag plan-chip">partial</span>}</span>
        <MacroBar protein={macros.protein} carbs={macros.carbs} fat={macros.fat} size="day" />
        <MacroCols protein={macros.protein} carbs={macros.carbs} fat={macros.fat} format={sheetGrams} />
        {preview && preview.kcal !== null && (
          <MoreNutrition
            values={preview}
            fat={preview.fat_g}
            carbs={preview.carbs_g}
            rounding="tenth"
            parts
            noneText={
              target.kind === 'food'
                ? "This food doesn't have sodium, fiber or the rest yet."
                : "This recipe doesn't have sodium, fiber or the rest yet."
            }
          />
        )}
        {partial && <span class="hint">Some ingredients are left out.</span>}
        {recalculated && <span class="hint">Recalculated from the food as it is now.</span>}
        {previewFailed && (
          <span class="hint danger-text" role="status">
            Couldn't work out the calories.
          </span>
        )}
      </div>

      {!fixedSlot && (
        <>
          <p class="field-label" id="log-meal">
            Meal
          </p>
          <div class="chip-row" role="group" aria-labelledby="log-meal">
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                class="chip"
                aria-pressed={slot === s}
                onClick={() => setSlot(s)}
                disabled={saving}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}

      {error && (
        <p class="danger-text amount-error" role="status" data-testid="amount-error">
          {error}
        </p>
      )}
      <button
        type="button"
        class="btn btn-primary btn-block"
        onClick={() => void save()}
        disabled={!valid || saving}
        aria-busy={saving}
        data-testid="log-it"
      >
        {entry ? 'Save' : 'Log it'}
      </button>
      {entry && (
        <button
          type="button"
          class="text-btn danger-text delete-entry"
          onClick={() => setConfirming(true)}
          disabled={saving}
          data-testid="delete-entry"
        >
          Delete entry
        </button>
      )}
    </Sheet>
  );
}
