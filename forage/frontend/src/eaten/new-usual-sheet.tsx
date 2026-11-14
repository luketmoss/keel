// The New usual sheet (#886): foods already logged, saved as a usual and grouped under it. Beside save-recipe-sheet.tsx.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Food, FoodLogEntry, Slot, Usual } from '../api/types';
import { labelOf, newUsualId, whenText } from '../library/usuals-store';
import { addDays } from '../plan/dates';
import { Sheet } from '../ui/sheet';
import { saveRefusal } from './amount-sheet';
import { macrosLine, wholeKcal } from './format';
import { matchFoods, needsOption, newUsualInput, optionCandidates, type NewLine } from './swap';
import type { SaveLine } from './save-recipe-sheet';

interface Props {
  api: ForageApi;
  lines: SaveLine[];
  foods: Food[];
  slot: Slot;
  date: string;
  today: string;
  /** A group's name when the sheet starts from one. */
  initialName?: string;
  /** Saved: the usual as the write answered it, and the entries as grouped (null when grouping failed). */
  onSaved: (usual: Usual, grouped: FoodLogEntry[] | null) => void;
  onClose: () => void;
}

/** The sum of a stored figure over the entries that have it; null when none does. */
function sum(entries: FoodLogEntry[], key: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'): number | null {
  const known = entries.filter((e) => typeof e[key] === 'number');
  return known.length ? known.reduce((t, e) => t + (e[key] as number), 0) : null;
}

/** A search over the library for one more option of a line. */
function OptionSearch({
  foods,
  exclude,
  onPick,
  onClose,
}: {
  foods: Food[];
  exclude: Set<string>;
  onPick: (food: Food) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const found = matchFoods(
    foods.filter((f) => !exclude.has(f.id)),
    q,
  )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 60);
  return (
    <Sheet title="Add an option" onClose={onClose} testId="option-search">
      <label class="visually-hidden" for="option-q">
        Search foods
      </label>
      <input
        id="option-q"
        class="field"
        type="search"
        placeholder="Search foods"
        value={q}
        autocomplete="off"
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        data-testid="option-q"
        data-autofocus
      />
      {found.length === 0 ? (
        <p class="library-status">{q.trim() ? `No food matches "${q.trim()}".` : 'No foods to add.'}</p>
      ) : (
        <ul class="choice-list">
          {found.map((f) => (
            <li key={f.id}>
              <button type="button" class="add-route" onClick={() => onPick(f)} data-testid="option-result">
                <span class="recipe-text">
                  <span class="recipe-name">{f.name}</span>
                  <span class="recipe-meta">{f.brand || 'No brand'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/**
 * Name, then each food with a Pick each time switch, the numbers as saved, and Save usual. Saving is `upsertUsual`
 * with an id made when the sheet opened, then `setLogGroup` putting the entries under it.
 */
export function NewUsualSheet({ api, lines, foods, slot, date, today, initialName, onSaved, onClose }: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [rows, setRows] = useState<NewLine[]>(() =>
    lines.flatMap(({ entry }) => {
      const food = foods.find((f) => f.id === entry.food_id);
      return food ? [{ entry, food, pick: false, options: [food] }] : [];
    }),
  );
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [searching, setSearching] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useRef(newUsualId());

  // Which foods were logged in the last 60 days, for each line's suggested options.
  useEffect(() => {
    let live = true;
    api.getFoodLog(addDays(date, -60), date).then(
      (log) => {
        if (!live) return;
        const c = new Map<string, number>();
        for (const e of log) if (e.food_id) c.set(e.food_id, (c.get(e.food_id) ?? 0) + 1);
        setCounts(c);
      },
      () => live && setCounts(new Map()),
    );
    return () => {
      live = false;
    };
  }, []);

  const change = (entryId: string, next: (l: NewLine) => NewLine) =>
    setRows((rs) => rs.map((l) => (l.entry.id === entryId ? next(l) : l)));

  function togglePick(l: NewLine) {
    if (saving) return;
    if (l.pick) {
      change(l.entry.id, (x) => ({ ...x, pick: false }));
      if (searching === l.entry.id) setSearching(null);
      return;
    }
    const suggested = optionCandidates(l.food, foods, counts ?? new Map());
    change(l.entry.id, (x) => ({ ...x, pick: true, options: [x.food, ...suggested] }));
    // With nothing to suggest, the search opens at once.
    if (!suggested.length) setSearching(l.entry.id);
  }

  const entries = rows.map((r) => r.entry);
  const kcal = sum(entries, 'kcal');
  const partial = entries.some((e) => e.kcal === null);
  const blank = !name.trim();
  const short = rows.some(needsOption);
  const when = date === today ? 'today' : `on ${whenText(date, today)}`;
  const searchRow = rows.find((r) => r.entry.id === searching);

  async function save() {
    if (blank || short || saving || !rows.length) return;
    setSaving(true);
    setError(null);
    let usual: Usual;
    try {
      usual = await api.upsertUsual(newUsualInput(id.current, name, slot, rows));
    } catch (err) {
      setError(saveRefusal(err));
      setSaving(false);
      return;
    }
    let grouped: FoodLogEntry[] | null = null;
    try {
      grouped = await api.setLogGroup(
        rows.map((r) => r.entry.id),
        { name: usual.name, usual_id: usual.id },
      );
    } catch {
      // The usual exists; the entries stay as they were.
    }
    onSaved(usual, grouped);
  }

  return (
    <>
      <Sheet
        title="New usual"
        onClose={() => !saving && onClose()}
        testId="new-usual-sheet"
        headerEnd={
          <button type="button" class="text-btn" onClick={onClose} disabled={saving} data-testid="new-usual-cancel">
            Cancel
          </button>
        }
      >
        <label class="field-label" for="usual-name">
          Name
        </label>
        <input
          id="usual-name"
          class="field"
          value={name}
          placeholder="Turkey sandwich"
          maxLength={120}
          autocomplete="off"
          disabled={saving}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          data-testid="usual-name"
          data-autofocus
        />

        <h3 class="field-label">Foods ({rows.length})</h3>
        <ul class="plain-list" data-testid="usual-lines">
          {rows.map((l) => (
            <li key={l.entry.id} class="usual-new-line" data-testid="usual-line">
              <div class="usual-new-head">
                <span class="recipe-text">
                  <span class="recipe-name">{labelOf(l.food)}</span>
                  <span class="recipe-meta">
                    {l.entry.unit === 'g' ? `${l.entry.qty} g` : `${l.entry.qty} ${l.entry.unit}`}
                  </span>
                </span>
                <button
                  type="button"
                  class="chip"
                  aria-pressed={l.pick}
                  disabled={saving}
                  onClick={() => togglePick(l)}
                  data-testid="pick-each-time"
                >
                  Pick each time
                </button>
              </div>
              {l.pick && (
                <div class="usual-new-options" data-testid="usual-options">
                  <p class="hint">Options: {l.options.map((f) => labelOf(f)).join(' · ')}</p>
                  <div class="chip-row">
                    {l.options.map((f, i) => (
                      <span key={f.id} class="chip usual-new-option" data-testid="usual-option">
                        {labelOf(f)}
                        {i > 0 && (
                          <button
                            type="button"
                            class="text-btn"
                            aria-label={`Remove ${labelOf(f)}`}
                            disabled={saving}
                            onClick={() =>
                              change(l.entry.id, (x) => ({ ...x, options: x.options.filter((o) => o.id !== f.id) }))
                            }
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    <button
                      type="button"
                      class="chip chip-add"
                      disabled={saving}
                      onClick={() => setSearching(l.entry.id)}
                      data-testid="add-option"
                    >
                      ＋ add
                    </button>
                  </div>
                  {needsOption(l) && (
                    <p class="hint danger-text" data-testid="option-needed">
                      Add a second option, or switch this off.
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        <div class="card amount-numbers" data-testid="usual-numbers">
          <span class="hint">as saved</span>
          <span class="amount-kcal tabular" data-testid="usual-kcal">
            {kcal === null ? '—' : `${partial ? 'about ' : ''}${wholeKcal(kcal)} kcal`}
          </span>
          <span class="amount-macros tabular">
            {macrosLine({
              protein_g: sum(entries, 'protein_g'),
              carbs_g: sum(entries, 'carbs_g'),
              fat_g: sum(entries, 'fat_g'),
            })}
          </span>
        </div>

        <p class="hint">
          Saved from {slot} {when}. Your log stays as it is.
        </p>

        {error && (
          <p class="danger-text amount-error" role="status" data-testid="new-usual-error">
            {error}
          </p>
        )}
        <button
          type="button"
          class="btn btn-primary btn-block"
          onClick={() => void save()}
          disabled={blank || short || saving}
          aria-busy={saving}
          data-testid="save-usual"
        >
          {saving ? 'Saving…' : 'Save usual'}
        </button>
      </Sheet>
      {searchRow && (
        <OptionSearch
          foods={foods}
          exclude={new Set(searchRow.options.map((f) => f.id))}
          onPick={(f) => {
            change(searchRow.entry.id, (x) => ({ ...x, options: [...x.options, f] }));
            setSearching(null);
          }}
          onClose={() => setSearching(null)}
        />
      )}
    </>
  );
}
