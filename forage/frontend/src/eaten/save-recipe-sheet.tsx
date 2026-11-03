import { useEffect, useRef, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { FoodLogEntry, NewRecipeLine, Nutrition, RecipeDetail, Slot } from '../api/types';
import { MoreNutrition } from '../ui/more-nutrition';
import { Sheet } from '../ui/sheet';
import { saveRefusal } from './amount-sheet';
import { entryLineText, macrosLine, newRecipeId, noteDate, wholeKcal } from './format';

/** One ticked entry, with the name the row shows it under. */
export interface SaveLine {
  entry: FoodLogEntry;
  name: string;
}

interface Props {
  api: ForageApi;
  lines: SaveLine[];
  slot: Slot;
  date: string;
  /** Saved: the recipe as the write answered it. */
  onSaved: (recipe: RecipeDetail) => void;
  onClose: () => void;
}

const MAX_SERVES = 99;
/** The preview is asked for this long after the last change to Serves. */
const PREVIEW_DELAY_MS = 400;

/**
 * The New recipe sheet (#788): a name, how many it serves, the lines it will save and the API's per-serving figures
 * for them (`computeNutrition`). Saving is one `upsertRecipe` with an id made when the sheet opened.
 */
export function SaveRecipeSheet({ api, lines, slot, date, onSaved, onClose }: Props) {
  const [name, setName] = useState('');
  const [serves, setServes] = useState(1);
  const [preview, setPreview] = useState<Nutrition | null>(null);
  const [updating, setUpdating] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useRef(newRecipeId());
  const seq = useRef(0);

  const note = `Saved from ${slot} on ${noteDate(date)}.`;
  const recipeLines: NewRecipeLine[] = lines.map(({ entry, name: foodName }) => ({
    text: entryLineText(entry, foodName),
    qty: entry.qty,
    unit: entry.unit,
    food_id: entry.food_id,
    grams: entry.grams,
  }));
  const blank = !name.trim();

  useEffect(() => {
    const mine = ++seq.current;
    setUpdating(true);
    const ask = () =>
      api.previewRecipe(recipeLines, serves).then(
        (n) => {
          if (mine !== seq.current) return;
          setPreview(n);
          setPreviewFailed(false);
          setUpdating(false);
        },
        () => {
          if (mine !== seq.current) return;
          setPreviewFailed(true);
          setUpdating(false);
        },
      );
    // The first preview is asked at once; later ones after the stepper stops.
    if (!preview && !previewFailed) {
      void ask();
      return;
    }
    const t = setTimeout(() => void ask(), PREVIEW_DELAY_MS);
    return () => clearTimeout(t);
  }, [serves]);

  async function save() {
    if (blank || saving) return;
    setSaving(true);
    setError(null);
    try {
      const recipe = await api.createRecipe({
        id: id.current,
        name: name.trim(),
        servings: serves,
        notes: note,
        lines: recipeLines,
      });
      onSaved(recipe);
    } catch (err) {
      setError(saveRefusal(err));
      setSaving(false);
    }
  }

  const per = preview?.per_serving;
  const kcal = per && per.kcal !== null ? per.kcal : null;
  const partial = !!preview?.partial;

  return (
    <Sheet
      title="New recipe"
      onClose={onClose}
      testId="save-recipe-sheet"
      headerEnd={
        <button type="button" class="text-btn" onClick={onClose} disabled={saving} data-testid="save-recipe-cancel">
          Cancel
        </button>
      }
    >
      <label class="field-label" for="recipe-name">
        Name
      </label>
      <input
        id="recipe-name"
        class="field"
        value={name}
        placeholder="Side salad"
        maxLength={120}
        autocomplete="off"
        disabled={saving}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        data-testid="recipe-name"
        data-autofocus
      />

      <div class="stepper">
        <span class="field-label" id="recipe-serves">
          Serves
        </span>
        <button
          type="button"
          class="icon-btn"
          aria-label="Fewer servings"
          onClick={() => setServes(serves - 1)}
          disabled={saving || serves <= 1}
        >
          −
        </button>
        <span class="stepper-value" aria-labelledby="recipe-serves" data-testid="recipe-serves">
          {serves}
        </span>
        <button
          type="button"
          class="icon-btn"
          aria-label="More servings"
          onClick={() => setServes(serves + 1)}
          disabled={saving || serves >= MAX_SERVES}
        >
          +
        </button>
      </div>
      {serves > 1 && <p class="hint">The amounts below make all {serves} servings.</p>}

      <h3 class="field-label">Ingredients ({lines.length})</h3>
      <ul class="plain-list" data-testid="recipe-lines">
        {recipeLines.map((l, i) => {
          const entry = lines[i].entry;
          return (
            <li key={entry.id} class="recipe-save-line">
              <span class="recipe-save-text">{l.text}</span>
              <span class="hint tabular recipe-save-g">
                {entry.kcal === null ? 'No nutrition' : l.grams === null ? '' : `${Math.round(l.grams)} g`}
              </span>
            </li>
          );
        })}
      </ul>

      <div class="card amount-numbers" data-testid="recipe-numbers">
        {updating ? (
          <span class="hint" role="status">
            Updating…
          </span>
        ) : (
          <span class="hint">A serving</span>
        )}
        <span class="amount-kcal tabular" data-testid="recipe-kcal">
          {kcal === null ? '—' : `${partial ? 'about ' : ''}${wholeKcal(kcal)} kcal`}
          {partial && kcal !== null && <span class="chip-flag plan-chip">partial</span>}
        </span>
        {per && (
          <span class="amount-macros tabular" data-testid="recipe-macros">
            {macrosLine(per)}
          </span>
        )}
        {per && kcal !== null && (
          <MoreNutrition
            values={per}
            fat={per.fat_g}
            carbs={per.carbs_g}
            rounding="tenth"
            noneText="These foods don't have sodium, fiber or the rest yet."
          />
        )}
        {partial && !updating && <span class="hint">Some ingredients have no nutrition, so this is low.</span>}
        {previewFailed && !updating && (
          <span class="hint danger-text" role="status">
            Couldn't work out the calories.
          </span>
        )}
      </div>

      <p class="hint">{note} Your log stays as it is.</p>

      {error && (
        <p class="danger-text amount-error" role="status" data-testid="save-recipe-error">
          {error}
        </p>
      )}
      <button
        type="button"
        class="btn btn-primary btn-block"
        onClick={() => void save()}
        disabled={blank || saving}
        aria-busy={saving}
        data-testid="save-recipe"
      >
        {saving ? 'Saving…' : 'Save recipe'}
      </button>
    </Sheet>
  );
}
