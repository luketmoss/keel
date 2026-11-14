// The meal menu, the Copy sheet and the Copy from another day sheet (#884).
import { useState } from 'preact/hooks';
import { SLOTS, type Food, type FoodLogEntry, type RecipeSummary, type Slot } from '../api/types';
import { Sheet } from '../ui/sheet';
import {
  chipDays,
  chipLabel,
  itemCount,
  listDay,
  mealNames,
  mealSummary,
  pickable,
  targetWord,
  type DayMeal,
  mealKcal,
} from './copy-meal';
import { wholeKcal } from './format';

interface MenuProps {
  slot: Slot;
  /** Entries in the meal, and how many of them can be ticked for Select. */
  count: number;
  selectable: number;
  onCopyTo: () => void;
  onSelect: () => void;
  onCopyFrom: () => void;
  onClose: () => void;
}

/** The meal's ⋯ menu (#884): Copy to…, Select (#788) and Copy from another day…. */
export function MealMenuSheet({ slot, count, selectable, onCopyTo, onSelect, onCopyFrom, onClose }: MenuProps) {
  const row = (testId: string, name: string, line: string, onClick: () => void, disabled = false) => (
    <li>
      <button
        type="button"
        class={disabled ? 'log-row is-blocked' : 'log-row'}
        onClick={disabled ? undefined : onClick}
        aria-disabled={disabled || undefined}
        data-testid={testId}
      >
        <span class="recipe-text">
          <span class="recipe-name">{name}</span>
          <span class="recipe-meta">{line}</span>
        </span>
      </button>
    </li>
  );
  return (
    <Sheet title={slot} onClose={onClose} testId="meal-menu-sheet">
      <ul class="plain-list">
        {row(
          'menu-copy-to',
          'Copy to…',
          count ? 'Another day or meal, exactly as it is' : 'Nothing to copy yet',
          onCopyTo,
          !count,
        )}
        {row(
          'menu-select',
          'Select',
          selectable ? 'Pick items to save as a usual or a recipe' : 'Nothing to select yet',
          onSelect,
          !selectable,
        )}
        {row(
          'menu-copy-from',
          'Copy from another day…',
          `Pick a day's ${slot.toLowerCase()} to bring here`,
          onCopyFrom,
        )}
      </ul>
    </Sheet>
  );
}

interface CopyProps {
  slot: Slot;
  today: string;
  entries: FoodLogEntry[];
  foods: Food[];
  recipes: RecipeSummary[];
  busy: boolean;
  failed: boolean;
  onCopy: (toDate: string, toSlot: Slot) => void;
  onClose: () => void;
}

/** The Copy sheet (#884): the meal as it is, a day, a meal and one button. Adds; nothing is replaced. */
export function CopySheet({ slot, today, entries, foods, recipes, busy, failed, onCopy, onClose }: CopyProps) {
  const [day, setDay] = useState(today);
  const [to, setTo] = useState<Slot>(slot);
  const [picking, setPicking] = useState(false);
  const days = chipDays(today);
  const onChip = days.includes(day);
  const kcal = mealKcal(entries);
  const summary = [
    itemCount(entries.length),
    kcal === null ? '' : `${wholeKcal(kcal)} kcal`,
    mealNames(entries, foods, recipes),
  ]
    .filter(Boolean)
    .join(' · ');
  // The Pick a date… chip shows the date once one past the chips is chosen.
  const pickLabel = onChip || !picking ? 'Pick a date…' : listDay(day, today);

  return (
    <Sheet title={`Copy ${slot.toLowerCase()}`} onClose={onClose} testId="copy-sheet">
      <p class="hint" data-testid="copy-summary">
        {summary}
      </p>

      <p class="field-label" id="copy-day">
        Day
      </p>
      <div class="chip-row" role="group" aria-labelledby="copy-day">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            class="chip"
            aria-pressed={day === d}
            disabled={busy}
            onClick={() => {
              setDay(d);
              setPicking(false);
            }}
            data-testid="copy-day-chip"
          >
            {chipLabel(d, today)}
          </button>
        ))}
        <button
          type="button"
          class="chip"
          aria-pressed={!onChip}
          disabled={busy}
          onClick={() => setPicking(true)}
          data-testid="copy-pick-date"
        >
          {pickLabel}
        </button>
      </div>
      {picking && (
        <input
          type="date"
          class="field copy-date"
          aria-label="Pick a date"
          max={today}
          value={onChip ? '' : day}
          disabled={busy}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (pickable(v, today)) setDay(v);
          }}
          data-testid="copy-date"
        />
      )}

      <p class="field-label" id="copy-meal">
        Meal
      </p>
      <div class="chip-row" role="group" aria-labelledby="copy-meal">
        {SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            class="chip"
            aria-pressed={to === s}
            disabled={busy}
            onClick={() => setTo(s)}
            data-testid="copy-meal-chip"
          >
            {s}
          </button>
        ))}
      </div>

      {failed && (
        <p class="danger-text amount-error" role="status" data-testid="copy-error">
          Couldn't copy. Try again.
        </p>
      )}
      <button
        type="button"
        class="btn btn-primary btn-block"
        onClick={() => onCopy(day, to)}
        disabled={busy}
        aria-busy={busy}
        data-testid="copy-go"
      >
        {busy ? 'Copying…' : `Copy ${itemCount(entries.length)} to ${targetWord(day, today)}`}
      </button>
      <p class="hint copy-note">Adds to what's there already; nothing is replaced.</p>
    </Sheet>
  );
}

interface FromProps {
  slot: Slot;
  today: string;
  days: DayMeal[];
  /** Whether the earlier days have been read yet. */
  ready: boolean;
  foods: Food[];
  recipes: RecipeSummary[];
  busy: boolean;
  failed: boolean;
  onPick: (date: string) => void;
  onClose: () => void;
}

/** Copy from another day… (#884): the last 7 days with entries in this meal, newest first. */
export function CopyFromSheet({ slot, today, days, ready, foods, recipes, busy, failed, onPick, onClose }: FromProps) {
  return (
    <Sheet title="Copy from another day" onClose={onClose} testId="copy-from-sheet">
      {failed && (
        <p class="danger-text amount-error" role="status" data-testid="copy-error">
          Couldn't copy. Try again.
        </p>
      )}
      {days.length === 0 ? (
        <p class="hint" data-testid="copy-from-empty">
          {ready ? `No ${slot.toLowerCase()} in the last 7 days.` : 'Looking…'}
        </p>
      ) : (
        <ul class="plain-list">
          {days.map((d) => (
            <li key={d.date}>
              <button
                type="button"
                class="log-row"
                disabled={busy}
                aria-busy={busy}
                onClick={() => onPick(d.date)}
                data-testid="copy-from-day"
              >
                <span class="recipe-text">
                  <span class="recipe-name">{listDay(d.date, today)}</span>
                  <span class="recipe-meta copy-names">{mealSummary(d.entries, foods, recipes)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
