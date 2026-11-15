import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Food, FoodLogEntry } from '../api/types';
import { gramsPer, fractionQty, stepQty, switchUnit, unitOptions, maxQty, minQty } from './amount-edit';
import { afterEditor, closeEditor, editing, openEditor, setDraft } from './eaten-store';
import { amountLine, servings, wholeKcal } from './format';
import { ServingPanel } from './serving-panel';
import { vagueServing } from './serving-edit';

/** What makes a row's amount editable in place (#882): the API, and the food (null for a recipe's entry). */
export interface RowEditing {
  api: ForageApi;
  food: Food | null;
}

/** The chip's words: the amount as set, and its grams when known. `none` is a recipe's `1 serving`. */
function chipParts(entry: FoodLogEntry, food: Food | null, qty: number, unit: string) {
  if (!food) return { main: servings(qty), grams: null as number | null, aria: `Amount, ${servings(qty)}. Edit` };
  const options = unitOptions(entry, food);
  const per = gramsPer(options, unit);
  const grams = unit === 'g' ? null : per === null ? null : Math.round(qty * per);
  if (unit === 'g') {
    return { main: `${fractionQty(qty)} g`, grams: null, aria: `Amount, ${fractionQty(qty)} grams. Edit` };
  }
  const main = `${fractionQty(qty)} ${unit}`;
  const aria = grams === null ? `Amount, ${main}. Edit` : `Amount, ${main}, ${grams} grams. Edit`;
  return { main, grams, aria };
}

/** A log entry as the day lists it (#712), and as the Add sheet's Added list does (#786); `fresh` fades in. */
export function EntryRow({
  entry,
  name,
  onOpen,
  fresh,
  amount,
  below,
  onSwap,
}: {
  entry: FoodLogEntry;
  name: string;
  onOpen: () => void;
  fresh?: boolean;
  /** Given on the day's own rows, so line two is the amount chip (#882); the Added list and a removed food's row leave it out. */
  amount?: RowEditing;
  /** What sits under line two, before the editor: a usual's pick-one choice (#885). */
  below?: ComponentChildren;
  /** Given on an Always line of a usual's group (#886): the ⇄ swap button after the amount. */
  onSwap?: () => void;
}) {
  const edit = editing.value?.id === entry.id ? editing.value : null;
  // While the editor is open the row shows the amount being set and the preview's calories (the stored ones until it answers).
  const shown = edit?.preview ?? entry;
  const unknown = shown.kcal === null;
  const line = amountLine(entry);
  const kcal = unknown ? (
    <span class="chip-flag">—</span>
  ) : (
    <span class="log-row-kcal tabular">
      {wholeKcal(shown.kcal!)} <span class="hint-inline">kcal</span>
    </span>
  );
  const label = `${name}, ${line}, ${unknown ? 'no nutrition' : `${wholeKcal(shown.kcal!)} kcal`}`;
  const cls = fresh ? 'log-row is-fresh' : 'log-row';

  if (!amount) {
    return (
      <li data-testid="entry-row">
        <button type="button" class={cls} onClick={onOpen} aria-label={label} data-testid="entry-open">
          <span class="recipe-text">
            <span class="recipe-name">{name}</span>
            <span class="recipe-meta">{line}</span>
          </span>
          {kcal}
        </button>
      </li>
    );
  }

  const qty = edit?.qty ?? entry.qty;
  const unit = edit?.unit ?? entry.unit;
  const chip = chipParts(entry, amount.food, qty, unit);
  // What follows the chip as text: a recipe's `partial`, or an entry with no nutrition.
  const suffix = entry.recipe_id
    ? entry.kcal === null
      ? ' · No nutrition'
      : entry.partial
        ? ' · partial'
        : ''
    : entry.kcal === null
      ? ' · No nutrition'
      : '';
  const grams = entry.kcal === null ? null : chip.grams;
  const toggle = () => {
    if (edit) void closeEditor(amount.api);
    else afterEditor(amount.api, () => openEditor(entry));
  };
  return (
    <li class="entry-li" data-testid="entry-row">
      <button type="button" class={`${cls} log-row-main`} onClick={onOpen} aria-label={label} data-testid="entry-open">
        <span class="recipe-text">
          <span class="recipe-name">{name}</span>
        </span>
        {kcal}
      </button>
      <div class="entry-amount recipe-meta">
        <button
          type="button"
          class={edit ? 'amount-chip is-open' : 'amount-chip'}
          onClick={toggle}
          aria-expanded={!!edit}
          aria-label={chip.aria}
          data-testid="amount-chip"
        >
          <span>{chip.main}</span>
          {grams !== null && <span class="amount-chip-g"> · {grams} g</span>}
        </button>
        {suffix}
        {onSwap && (
          <button
            type="button"
            class="text-btn swap-btn"
            aria-label={`Swap ${name}`}
            onClick={onSwap}
            data-testid="swap-entry"
          >
            ⇄ swap
          </button>
        )}
      </div>
      {below}
      {edit && <AmountEditor api={amount.api} entry={entry} name={name} food={amount.food} />}
    </li>
  );
}

/** The inline editor under a row (#882): a stepper, the unit pills, and Done. Its state is the store's `editing`. */
function AmountEditor({
  api,
  entry,
  name,
  food,
}: {
  api: ForageApi;
  entry: FoodLogEntry;
  name: string;
  food: Food | null;
}) {
  const edit = editing.value!;
  const [adding, setAdding] = useState(false);
  const options = unitOptions(entry, food);
  const per = gramsPer(options, edit.unit);
  const recipe = !food;
  const grams = edit.unit === 'g' ? null : per === null ? null : Math.round(edit.qty * per);
  const atMin = edit.qty <= minQty(edit.unit);
  const atMax = edit.qty >= maxQty(edit.unit);
  const qtyWords = edit.unit === 'g' ? String(edit.qty) : fractionQty(edit.qty);
  return (
    <div class="amount-editor" role="group" aria-label={`Edit amount, ${name}`} data-testid="amount-editor">
      <div class="amount-editor-step">
        <button
          type="button"
          class="icon-btn"
          aria-label="Less"
          disabled={edit.busy}
          aria-disabled={atMin ? 'true' : undefined}
          onClick={() => {
            if (!atMin) setDraft(stepQty(edit.qty, edit.unit, -1), edit.unit);
          }}
        >
          −
        </button>
        <span class="amount-editor-qty tabular" data-testid="editor-qty">
          {qtyWords}
        </span>
        <button
          type="button"
          class="icon-btn"
          aria-label="More"
          disabled={edit.busy}
          aria-disabled={atMax ? 'true' : undefined}
          onClick={() => {
            if (!atMax) setDraft(stepQty(edit.qty, edit.unit, 1), edit.unit);
          }}
        >
          +
        </button>
        <span class="hint amount-editor-unit">
          {recipe ? (edit.qty === 1 ? 'serving' : 'servings') : edit.unit === 'g' ? 'g' : edit.unit}
          {grams !== null && ` · ${grams} g`}
        </span>
      </div>
      {!recipe && (
        <div class="chip-row" role="group" aria-label="Unit">
          {options.map((o) => (
            <button
              key={o.unit}
              type="button"
              class="chip"
              aria-pressed={edit.unit === o.unit}
              disabled={edit.busy}
              onClick={() => {
                if (o.unit === edit.unit) return;
                setDraft(
                  switchUnit(
                    edit.qty,
                    options.find((x) => x.unit === edit.unit),
                    o,
                  ),
                  o.unit,
                );
              }}
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            class="chip chip-add"
            aria-expanded={adding}
            disabled={edit.busy}
            onClick={() => setAdding(!adding)}
            data-testid="add-serving"
          >
            ＋ Serving
          </button>
        </div>
      )}
      {food && !adding && vagueServing(food) && (
        <p class="hint serving-vague" data-testid="vague-serving">
          “serving” isn't a real amount.{' '}
          <button type="button" class="text-btn" onClick={() => setAdding(true)} data-testid="say-what">
            Say what it is
          </button>
        </p>
      )}
      {food && adding && (
        <ServingPanel
          api={api}
          food={food}
          foodName={food.name}
          from={() => options.find((o) => o.unit === editing.value?.unit)}
          onAdded={() => setAdding(false)}
        />
      )}
      {edit.error && (
        <p class="danger-text field-error" role="status" data-testid="editor-error">
          Couldn't save. Try again.
        </p>
      )}
      <div class="amount-editor-done">
        <button
          type="button"
          class="text-btn"
          onClick={() => void closeEditor(api)}
          disabled={edit.busy}
          aria-busy={edit.busy}
          data-testid="editor-done"
        >
          Done
        </button>
      </div>
    </div>
  );
}
