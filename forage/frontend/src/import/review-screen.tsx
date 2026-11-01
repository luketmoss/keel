import { useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import { ApiError } from '../api/client';
import { isDemoMode } from '../demo/is-demo-mode';
import { DemoBanner } from '../demo/demo-banner';
import { loadRecipes } from '../library/recipes-store';
import { ConfirmSheet } from '../ui/sheet';
import { FoodChooser } from './food-chooser';
import { LineEdit } from './line-edit';
import {
  addNewFoods,
  closeReview,
  createFood,
  foods,
  patchReview,
  review,
  saveBlocker,
  saveErrorText,
  savedNotice,
  toStructured,
  unmatched,
  unmatchedNames,
  updateLines,
  type DraftLine,
  type Review,
} from './review-state';

function sections<T extends { section: string }>(items: T[]): [string, T[]][] {
  const out: [string, T[]][] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last[0] === item.section) last[1].push(item);
    else out.push([item.section, [item]]);
  }
  return out;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/** `1.5 cup · all-purpose flour`. */
function parsed(l: DraftLine): string {
  const amount = [l.qty === null ? '' : fmt(l.qty), l.unit].filter(Boolean).join(' ');
  return amount ? `${amount} · ${l.name}` : l.name;
}

function NutritionLine({ r }: { r: Review }) {
  const kcal = r.nutrition.per_serving.kcal;
  const missing = r.nutrition.missing.filter((m) => m.reason !== 'no_nutrition').length;
  return (
    <section class="card review-nutrition" aria-live="polite" data-testid="review-nutrition">
      {r.refreshing ? (
        <p class="nutrition-figure">Updating…</p>
      ) : kcal === null ? (
        <p class="hint">No nutrition yet. Foods get theirs from the library.</p>
      ) : (
        <>
          <p class="nutrition-figure">About {Math.round(kcal)} kcal a serving</p>
          <p class="hint">
            {r.nutrition.partial
              ? `Partial: ${missing} ${missing === 1 ? 'line has' : 'lines have'} no food or weight`
              : 'Every line is counted'}
          </p>
        </>
      )}
    </section>
  );
}

function LineRow({ line, onOpen, onChoose }: { line: DraftLine; onOpen: () => void; onChoose: () => void }) {
  const food = foods.value.find((f) => f.id === line.food_id);
  // The source's own words, unless they say just what the parsed line says.
  const plain = parsed(line).replace(' · ', ' ').toLowerCase();
  const sameText = line.text.trim().toLowerCase() === plain;
  const second = [sameText ? '' : line.text, line.note].filter(Boolean).join(' — ');
  const tags: { label: string; title: string }[] = [];
  if (line.flags.includes('range'))
    tags.push({
      label: 'range',
      title: `Used the low end, ${line.text.match(/[\d½¼¾⅓⅔/.]+\s*(?:-|–|to)\s*[\d½¼¾⅓⅔/.]+/)?.[0] ?? ''}`,
    });
  if (line.flags.includes('package')) {
    tags.push({
      label: 'package',
      title:
        line.grams !== null
          ? `${fmt(line.qty ?? 1)} ${line.unit || 'pack'}, ${Math.round(line.grams)} g`
          : 'A package size',
    });
  }
  if (line.flags.includes('alternative')) {
    const alt = line.note.split('; ').find((n) => n.startsWith('or '));
    if (alt) tags.push({ label: alt, title: 'An alternative in the source' });
  }

  let status;
  if (line.optional) {
    status = (
      <span class="status-muted">
        {line.flags.includes('to_taste') ? 'To taste, not counted' : 'Optional, not counted'}
      </span>
    );
  } else if (food) {
    status = (
      <span class="status-matched">
        <span aria-hidden="true">✓ </span>
        {food.name}
      </span>
    );
  } else {
    status = (
      <button
        type="button"
        class="status-unmatched text-btn"
        onClick={(e) => {
          e.stopPropagation();
          onChoose();
        }}
      >
        Which food is this?
      </button>
    );
  }

  return (
    <li class="line-row" data-testid="review-line">
      <button type="button" class="line-main" onClick={onOpen} aria-label={`Edit ${line.text}`}>
        <span class="line-parsed">
          {parsed(line)}
          {tags.map((t) => (
            <span key={t.label} class="tag" title={t.title}>
              {t.label}
            </span>
          ))}
        </span>
        {second && <span class="line-source">{second}</span>}
      </button>
      <span class="line-status">{status}</span>
    </li>
  );
}

type Overlay =
  { kind: 'edit'; key: number } | { kind: 'choose'; key: number; draft?: DraftLine } | { kind: 'discard' } | null;

/** Review an import before it is saved (#706): every line, its food, the steps and the preview. */
export function ReviewScreen({ api }: { api: ForageApi }) {
  const r = review.value;
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  if (!r) return null;

  const lineByKey = (key: number) => r.lines.find((l) => l.key === key);
  const replaceLine = (next: DraftLine) =>
    updateLines(api, (lines) => lines.map((l) => (l.key === next.key ? next : l)));
  const newNames = unmatchedNames(r);
  const needFood = unmatched(r).length;
  const blocker = saveBlocker(r);

  function back() {
    if (r!.edited) setOverlay({ kind: 'discard' });
    else closeReview();
  }

  async function addAll() {
    setAdding(true);
    setAddStatus(null);
    const { added, of } = await addNewFoods(api);
    setAdding(false);
    if (added < of) setAddStatus(`Added ${added} of ${of}. Try again for the rest.`);
  }

  async function save() {
    const current = review.value!;
    patchReview({ saving: true, saveError: null });
    try {
      await api.saveImport(toStructured(current), current.allowDuplicate);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'duplicate') {
        patchReview({
          saving: false,
          duplicate_of: (err.details.duplicate_of as Review['duplicate_of']) ?? current.duplicate_of,
          allowDuplicate: false,
        });
        return;
      }
      patchReview({ saving: false, saveError: saveErrorText(err, current) });
      return;
    }
    closeReview();
    savedNotice.value = `Saved ${current.name.trim()}`;
    setTimeout(() => {
      if (savedNotice.value === `Saved ${current.name.trim()}`) savedNotice.value = null;
    }, 4000);
    void loadRecipes(api);
  }

  async function chooseFood(key: number, draft: DraftLine | undefined, foodId: string) {
    const base = draft ?? lineByKey(key);
    setOverlay(null);
    if (base) await replaceLine({ ...base, food_id: foodId });
  }

  const editing = overlay?.kind === 'edit' ? lineByKey(overlay.key) : undefined;
  const choosing = overlay?.kind === 'choose' ? (overlay.draft ?? lineByKey(overlay.key)) : undefined;

  return (
    <div class="review" inert={r.saving} data-testid="review-screen">
      <header class="review-header">
        <button type="button" class="text-btn back-btn" onClick={back}>
          Back
        </button>
        <h1>Review recipe</h1>
        <span class="back-btn" aria-hidden="true" />
      </header>
      {isDemoMode() && <DemoBanner />}

      <main class="review-body">
        {r.duplicate_of && !r.allowDuplicate && (
          <section class="notice is-warning" role="status" data-testid="duplicate-notice">
            <p>
              <strong>Already in your library</strong> as “{r.duplicate_of.name}”.
            </p>
            <div class="notice-actions">
              <button type="button" class="btn btn-secondary" onClick={() => patchReview({ allowDuplicate: true })}>
                Import again
              </button>
              <button type="button" class="btn btn-secondary" onClick={closeReview}>
                Cancel
              </button>
            </div>
          </section>
        )}

        <section class="card review-recipe">
          <label for="review-name" class="field-label">
            Name
          </label>
          <input
            id="review-name"
            class="field"
            value={r.name}
            onInput={(e) => patchReview({ name: e.currentTarget.value, edited: true })}
          />
          <div class="field-pair">
            <div>
              <label for="review-servings" class="field-label">
                Servings
              </label>
              <input
                id="review-servings"
                class="field"
                inputMode="numeric"
                value={r.servings}
                aria-invalid={!r.servings.trim()}
                aria-describedby={!r.servings.trim() ? 'review-servings-error' : undefined}
                onInput={(e) => patchReview({ servings: e.currentTarget.value, edited: true })}
                onChange={() => void updateLines(api, (l) => l)}
              />
            </div>
            <div>
              <label for="review-minutes" class="field-label">
                Time (min)
              </label>
              <input
                id="review-minutes"
                class="field"
                inputMode="numeric"
                value={r.minutes}
                onInput={(e) => patchReview({ minutes: e.currentTarget.value, edited: true })}
              />
            </div>
          </div>
          {!r.servings.trim() && (
            <p id="review-servings-error" class="field-error">
              How many does it serve?
            </p>
          )}
          {r.source_site && (
            <a class="source-link" href={r.source_url} target="_blank" rel="noopener noreferrer">
              {r.source_site}
            </a>
          )}
        </section>

        <NutritionLine r={r} />

        {newNames.length > 0 && (
          <button type="button" class="btn btn-secondary btn-block" disabled={adding} onClick={addAll}>
            {adding ? 'Adding…' : `Add ${newNames.length} new ${newNames.length === 1 ? 'food' : 'foods'}`}
          </button>
        )}
        {addStatus && (
          <p class="hint" role="status">
            {addStatus}
          </p>
        )}

        {sections(r.lines).map(([section, lines], i) => (
          <section key={`${i}-${section}`} class="card" aria-label={section || 'Ingredients'}>
            {section && <h2 class="card-label">{section}</h2>}
            <ul class="line-list">
              {lines.map((l) => (
                <LineRow
                  key={l.key}
                  line={l}
                  onOpen={() => setOverlay({ kind: 'edit', key: l.key })}
                  onChoose={() => setOverlay({ kind: 'choose', key: l.key })}
                />
              ))}
            </ul>
          </section>
        ))}

        <section class="card">
          <button
            type="button"
            class="row-btn"
            aria-expanded={stepsOpen}
            aria-controls="review-steps"
            onClick={() => setStepsOpen(!stepsOpen)}
          >
            <span>Steps ({r.steps.length})</span>
            <span aria-hidden="true">{stepsOpen ? '▴' : '▾'}</span>
          </button>
          {stepsOpen && (
            <div id="review-steps">
              {sections(r.steps).map(([section, steps], i) => (
                <div key={`${i}-${section}`}>
                  {section && <h3 class="card-label">{section}</h3>}
                  <ol class="step-list" start={steps[0].position}>
                    {steps.map((s) => (
                      <li key={s.position}>{s.text}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer class="review-actions">
        {r.saveError && (
          <p class="field-error" role="status">
            {r.saveError}
          </p>
        )}
        {!r.saveError && blocker === 'A recipe needs at least one ingredient' && (
          <p class="field-error" role="status">
            {blocker}
          </p>
        )}
        {needFood > 0 && (
          <p class="hint">
            {needFood} {needFood === 1 ? 'line still needs' : 'lines still need'} a food
          </p>
        )}
        <button
          type="button"
          class="btn btn-primary btn-block"
          disabled={!!blocker || r.saving}
          onClick={save}
          data-testid="save-recipe"
        >
          {r.saving ? 'Saving…' : 'Save recipe'}
        </button>
      </footer>

      {editing && (
        <LineEdit
          line={editing}
          library={foods.value}
          onClose={() => setOverlay(null)}
          onDone={(next) => {
            setOverlay(null);
            void replaceLine(next);
          }}
          onRemove={() => {
            setOverlay(null);
            void updateLines(api, (lines) => lines.filter((l) => l.key !== editing.key));
          }}
          onChooseFood={(draft) => setOverlay({ kind: 'choose', key: editing.key, draft })}
        />
      )}
      {choosing && overlay?.kind === 'choose' && (
        <FoodChooser
          line={choosing}
          library={foods.value}
          onClose={() => setOverlay(null)}
          onChoose={(f) => void chooseFood(overlay.key, overlay.draft, f.id)}
          onLeave={() => void chooseFood(overlay.key, overlay.draft, '')}
          onCreate={async (name) => {
            try {
              const food = await createFood(api, name);
              await chooseFood(overlay.key, overlay.draft, food.id);
            } catch {
              setOverlay(null);
              setAddStatus("Couldn't add that food. Try again.");
            }
          }}
        />
      )}
      {overlay?.kind === 'discard' && (
        <ConfirmSheet
          title="Discard this import?"
          confirm="Discard"
          cancel="Keep editing"
          danger
          onConfirm={closeReview}
          onCancel={() => setOverlay(null)}
        />
      )}
    </div>
  );
}
