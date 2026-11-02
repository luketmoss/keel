import { useEffect, useState } from 'preact/hooks';
import { ApiError, type ForageApi } from '../api/client';
import { SLOTS, type RecipeSummary, type Slot } from '../api/types';
import { Stars } from '../cook/stars';
import { Sheet } from '../ui/sheet';
import { dayChip, newPlanId } from './dates';

const SEARCH_FROM = 8;
const NOTE_MAX = 120;
const NOTE_CHIPS = ['Eating out', 'Leftovers'];
export const SAVE_FAILED = "Couldn't save that. Try again.";
const RECIPE_GONE = "That recipe isn't in your library any more.";

interface ChipsProps<T extends string> {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

/** A wrapping group of chips, one pressed. */
export function ChoiceChips<T extends string>({ label, options, value, onChange, disabled }: ChipsProps<T>) {
  return (
    <div class="plan-field">
      <p class="field-label" id={`chips-${label}`}>
        {label}
      </p>
      <div class="chip-row" role="group" aria-labelledby={`chips-${label}`}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            class="chip"
            aria-pressed={value === o.id}
            disabled={disabled}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const dayOptions = (days: string[], today: string) => days.map((d) => ({ id: d, label: dayChip(d, today) }));
export const slotOptions = SLOTS.map((s) => ({ id: s, label: s }));

interface Props {
  api: ForageApi;
  days: string[];
  today: string;
  /** The day whose "Nothing planned" row was tapped, else Tomorrow. */
  date?: string;
  onPlanned: () => void;
  onClose: () => void;
}

/**
 * "Plan a meal" (#709): a day, a slot, then a recipe (tapping one plans it at
 * once) or a note. The entry's id is made when the sheet opens, so a double
 * tap or a retry after a timeout leaves one row.
 */
export function PlanMealSheet({ api, days, today, date, onPlanned, onClose }: Props) {
  const [id] = useState(newPlanId);
  const [day, setDay] = useState(date && days.includes(date) ? date : days[1]);
  const [slot, setSlot] = useState<Slot>('Dinner');
  const [mode, setMode] = useState<'recipe' | 'note'>('recipe');
  const [recipes, setRecipes] = useState<RecipeSummary[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function loadRecipes() {
    setLoadFailed(false);
    setRecipes(null);
    try {
      setRecipes(await api.getRecipes());
    } catch {
      setLoadFailed(true);
    }
  }

  useEffect(() => {
    void loadRecipes();
  }, [api]);

  async function plan(what: { recipe_id: string } | { note: string }, busyKey: string) {
    if (busy) return;
    setBusy(busyKey);
    setStatus('');
    try {
      await api.planMeal({ id, date: day, slot, ...what });
      onPlanned();
    } catch (err) {
      if ('recipe_id' in what && err instanceof ApiError && /is not a recipe/.test(err.message)) {
        setStatus(RECIPE_GONE);
        void loadRecipes();
      } else {
        setStatus(SAVE_FAILED);
      }
    } finally {
      setBusy(null);
    }
  }

  const needle = q.trim().toLowerCase();
  const shown = (recipes ?? []).filter((r) => !needle || r.name.toLowerCase().includes(needle));
  const trimmed = note.trim();

  return (
    <Sheet title="Plan a meal" onClose={onClose} tall testId="plan-meal-sheet">
      <ChoiceChips label="Day" options={dayOptions(days, today)} value={day} onChange={setDay} disabled={!!busy} />
      <ChoiceChips label="Meal" options={slotOptions} value={slot} onChange={setSlot} disabled={!!busy} />
      <div class="segmented" role="group" aria-label="What to plan">
        <button type="button" class="segment" aria-pressed={mode === 'recipe'} onClick={() => setMode('recipe')}>
          Recipe
        </button>
        <button type="button" class="segment" aria-pressed={mode === 'note'} onClick={() => setMode('note')}>
          Something else
        </button>
      </div>

      {mode === 'recipe' ? (
        <div aria-busy={!!busy}>
          {recipes && recipes.length > SEARCH_FROM && (
            <div class="list-search">
              <label class="visually-hidden" for="plan-recipe-search">
                Search recipes
              </label>
              <input
                id="plan-recipe-search"
                class="field"
                type="search"
                placeholder="Search recipes"
                value={q}
                onInput={(e) => setQ((e.target as HTMLInputElement).value)}
              />
            </div>
          )}
          {loadFailed ? (
            <div class="library-status danger-text" role="status">
              <p>Couldn't load your recipes.</p>
              <button type="button" class="text-btn" onClick={() => void loadRecipes()}>
                Try again
              </button>
            </div>
          ) : recipes === null ? (
            <div data-testid="recipes-loading">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} class="skeleton-row" />
              ))}
            </div>
          ) : recipes.length === 0 ? (
            <div class="library-status">
              <p>No recipes yet. Import one from Library.</p>
              <a class="text-btn" href="#/library" onClick={onClose}>
                Go to Library
              </a>
            </div>
          ) : (
            <ul class="plain-list plan-recipes" aria-label="Recipes">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    class="plan-recipe"
                    disabled={!!busy}
                    aria-busy={busy === r.id}
                    onClick={() => void plan({ recipe_id: r.id }, r.id)}
                    data-testid="plan-recipe"
                  >
                    <span class="recipe-text">
                      <span class="recipe-name">{r.name}</span>
                      <span class="recipe-meta">
                        <Stars rating={r.rating} />
                        {r.servings ? ` · serves ${r.servings}` : ''}
                      </span>
                    </span>
                    {busy === r.id && <span class="spinner" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div class="plan-field">
          <label class="field-label" for="plan-note">
            What's the plan?
          </label>
          <input
            id="plan-note"
            class="field"
            type="text"
            maxLength={NOTE_MAX}
            placeholder="Eating out, leftovers…"
            value={note}
            onInput={(e) => setNote((e.target as HTMLInputElement).value)}
          />
          <div class="chip-row">
            {NOTE_CHIPS.map((c) => (
              <button key={c} type="button" class="chip" aria-pressed={note === c} onClick={() => setNote(c)}>
                {c}
              </button>
            ))}
          </div>
          <div class="sheet-actions">
            <button
              type="button"
              class="btn btn-primary"
              disabled={!trimmed || !!busy}
              aria-busy={busy === 'note'}
              onClick={() => void plan({ note: trimmed }, 'note')}
            >
              Plan it
            </button>
          </div>
        </div>
      )}
      <p class="plan-status danger-text" role="status" data-testid="plan-status">
        {status}
      </p>
    </Sheet>
  );
}
