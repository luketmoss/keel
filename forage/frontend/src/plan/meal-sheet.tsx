import { useState } from 'preact/hooks';
import { ApiError, type ForageApi } from '../api/client';
import type { PlanEntry, PlanMove, Slot } from '../api/types';
import { NutritionSheet } from '../library/nutrition-sheet';
import { Sheet } from '../ui/sheet';
import { dayPossessive, longDay } from './dates';
import { ChoiceChips, SAVE_FAILED, dayOptions, slotOptions } from './plan-meal-sheet';
import { kcalLine, mealName } from './plan-store';

const NOTE_MAX = 120;

interface Props {
  api: ForageApi;
  entry: PlanEntry;
  days: string[];
  today: string;
  /** Moved or removed: the plan reloads. */
  onDone: () => void;
  /** It was already removed elsewhere: the sheet closes and the plan reloads with that line. */
  onGone: () => void;
  onClose: () => void;
}

/**
 * A planned meal's sheet (#709): move it (day, slot, a note's text) or remove
 * it. Neither touches a shopping trip; what a list does about it is #710's.
 */
export function MealSheet({ api, entry, days, today, onDone, onGone, onClose }: Props) {
  const [day, setDay] = useState(entry.date);
  const [slot, setSlot] = useState<Slot>(entry.slot);
  const [note, setNote] = useState(entry.note);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [viewing, setViewing] = useState(false);

  const name = mealName(entry);
  const isNote = !entry.recipe_id;
  // A meal dated outside the 8 days (an agent can plan further out) keeps its own day as a chip.
  const choices = days.includes(entry.date) ? days : [entry.date, ...days];
  const changes: PlanMove = {};
  if (day !== entry.date) changes.date = day;
  if (slot !== entry.slot) changes.slot = slot;
  if (isNote && note.trim() !== entry.note) changes.note = note.trim();
  const changed = Object.keys(changes).length > 0;
  const noteOk = !isNote || note.trim().length > 0;

  async function run(write: () => Promise<unknown>) {
    setBusy(true);
    setStatus('');
    try {
      await write();
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_found') onGone();
      else setStatus(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  }

  const kcal = kcalLine(entry);
  return (
    <>
      <Sheet title={name} onClose={onClose} testId="meal-sheet">
        {asking ? (
          <div data-testid="remove-question">
            <p class="sheet-message">
              Remove {name} from {dayPossessive(entry.date, today)} {entry.slot.toLowerCase()}?
              {entry.on_trip && " It's on a shopping trip. Removing it doesn't change the trip."}
            </p>
            <div class="sheet-actions">
              <button
                type="button"
                class="btn btn-danger"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void run(() => api.removeMeal(entry.id))}
              >
                Remove
              </button>
              <button type="button" class="btn btn-secondary" disabled={busy} onClick={() => setAsking(false)}>
                Keep
              </button>
            </div>
          </div>
        ) : (
          <>
            <p class="sheet-message">
              {longDay(entry.date)} · {entry.slot}
            </p>
            {kcal && (
              <p class="meal-kcal">
                {kcal}
                {entry.partial && <span class="chip-flag plan-chip">Partial</span>}
              </p>
            )}
            <ChoiceChips
              label="Day"
              options={dayOptions(choices, today)}
              value={day}
              onChange={setDay}
              disabled={busy}
            />
            <ChoiceChips label="Meal" options={slotOptions} value={slot} onChange={setSlot} disabled={busy} />
            {isNote && (
              <div class="plan-field">
                <label class="field-label" for="meal-note">
                  What's the plan?
                </label>
                <input
                  id="meal-note"
                  class="field"
                  type="text"
                  maxLength={NOTE_MAX}
                  value={note}
                  onInput={(e) => setNote((e.target as HTMLInputElement).value)}
                />
              </div>
            )}
            {!isNote && (
              <button type="button" class="text-btn" onClick={() => setViewing(true)}>
                View recipe
              </button>
            )}
            <div class="sheet-actions">
              <button
                type="button"
                class="btn btn-primary"
                disabled={!changed || !noteOk || busy}
                aria-busy={busy}
                onClick={() => void run(() => api.moveMeal(entry.id, changes))}
              >
                Save
              </button>
              <button type="button" class="btn btn-danger-text" disabled={busy} onClick={() => setAsking(true)}>
                Remove from plan
              </button>
            </div>
          </>
        )}
        <p class="plan-status danger-text" role="status" data-testid="meal-status">
          {status}
        </p>
      </Sheet>
      {viewing && (
        <NutritionSheet api={api} recipeId={entry.recipe_id} onChanged={() => {}} onClose={() => setViewing(false)} />
      )}
    </>
  );
}
