// The usual editor (#887): a full screen inside Library that saves as you go. Every change sends the whole usual
// through `upsertUsual`, debounced; a short name saves to the food. The API's reply gives the numbers card.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type ForageApi } from '../api/client';
import type { Food, Slot, Usual, UsualOptional, UsualOption } from '../api/types';
import { SLOTS } from '../api/types';
import { fractionQty, stepQty } from '../eaten/amount-edit';
import { MacroBar } from '../ui/macro-bar';
import { MacroCols } from '../ui/macro-cols';
import { Sheet } from '../ui/sheet';
import { showToast } from '../ui/toast';
import { displayName } from './food-math';
import { keepFood, libraryFoods } from './foods-store';
import {
  alwaysLine,
  createSaver,
  defaultAmount,
  dropUsual,
  draftFrom,
  keepUsual,
  labelOf,
  layoutNote,
  pickLayout,
  startKcalText,
  startOption,
  toInput,
  usuals,
  type Draft,
  type DraftLine,
  type SaveState,
  type Saver,
} from './usuals-store';

interface Props {
  api: ForageApi;
  id: string;
  /** ＋ New usual opens the editor with the food search already up. */
  openSearch?: boolean;
  onBack: () => void;
  onDeleted: () => void;
}

type Search = { kind: 'add' } | { kind: 'option'; key: string; revert: boolean } | null;

const grams1 = (g: number) => String(Math.round(g * 10) / 10);

/** The weight of an amount, for the text beside the stepper; null for grams or an unknown serving. */
function weightText(food: Food | undefined, o: Pick<UsualOption, 'qty' | 'unit'>): string | null {
  if (!food || o.unit === 'g') return null;
  const s = food.servings_json?.find((x) => x.name === o.unit);
  return s ? `${grams1(s.g * o.qty)} g` : null;
}

/** A food search over the library, for ＋ Add a food and ＋ Option. */
export function FoodSearchSheet({
  title,
  exclude,
  onPick,
  onClose,
}: {
  title: string;
  exclude: Set<string>;
  onPick: (food: Food) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const want = q.trim().toLowerCase();
  const found = libraryFoods.value
    .filter((f) => !exclude.has(f.id))
    .filter((f) => !want || `${f.name} ${f.brand ?? ''} ${f.short_name ?? ''}`.toLowerCase().includes(want))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 60);
  return (
    <Sheet title={title} onClose={onClose} testId="usual-food-search">
      <label class="visually-hidden" for="usual-food-q">
        Search foods
      </label>
      <input
        id="usual-food-q"
        class="field"
        type="search"
        placeholder="Search foods"
        value={q}
        data-autofocus
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        data-testid="usual-food-q"
      />
      {found.length === 0 ? (
        <p class="library-status">{want ? `No food matches "${q.trim()}".` : 'No foods to add.'}</p>
      ) : (
        <ul class="choice-list">
          {found.map((f) => (
            <li key={f.id}>
              <button type="button" class="add-route" onClick={() => onPick(f)} data-testid="usual-food-result">
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

const HOW_OFTEN: { value: UsualOptional; label: string }[] = [
  { value: '', label: 'Every time' },
  { value: 'in', label: 'Usually' },
  { value: 'out', label: 'Sometimes' },
];

/** #942: how often a line is eaten: every time, usually (in by default) or sometimes (out by default). */
function HowOften({
  label,
  value,
  onChange,
}: {
  label: string;
  value: UsualOptional;
  onChange: (value: UsualOptional) => void;
}) {
  function onKey(e: KeyboardEvent) {
    const at = HOW_OFTEN.findIndex((o) => o.value === value);
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? at + 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? at - 1
          : null;
    if (to === null) return;
    e.preventDefault();
    const next = HOW_OFTEN[(to + HOW_OFTEN.length) % HOW_OFTEN.length];
    onChange(next.value);
    const group = (e.currentTarget as HTMLElement).closest('[role="radiogroup"]');
    requestAnimationFrame(() => group?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }
  return (
    <div class="usual-how-often">
      <span class="hint">How often</span>
      <div class="chip-row" role="radiogroup" aria-label={`How often ${label}`} data-testid="how-often">
        {HOW_OFTEN.map((o) => (
          <button
            key={o.value || 'always'}
            type="button"
            role="radio"
            class="chip"
            aria-checked={value === o.value}
            tabIndex={value === o.value ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={onKey}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function UsualEditor({ api, id, openSearch, onBack, onDeleted }: Props) {
  const stored = usuals.value.find((u) => u.id === id);
  const [reply, setReply] = useState<Usual | undefined>(stored);
  const [draft, setDraft] = useState<Draft>(() =>
    stored ? draftFrom(stored) : { name: '', slot: 'Breakfast', lines: [] },
  );
  const draftRef = useRef(draft);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [search, setSearch] = useState<Search>(openSearch ? { kind: 'add' } : null);
  const [confirming, setConfirming] = useState(false);
  const [shorts, setShorts] = useState<Record<string, string>>({});
  const [shortErrors, setShortErrors] = useState<Record<string, boolean>>({});
  const shortTimers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>());
  const saverRef = useRef<Saver | null>(null);
  const foods = useMemo(() => new Map(libraryFoods.value.map((f) => [f.id, f])), [libraryFoods.value]);

  if (!saverRef.current) {
    saverRef.current = createSaver(api, {
      onState: setSaveState,
      onSaved(usual, job) {
        keepUsual(usual);
        setReply(usual);
        // The API numbered the lines that were new; keep those ids so the next save keeps the lines.
        const lines = draftRef.current.lines.map((l) => {
          const at = job.keys.indexOf(l.key);
          return !l.line_id && at >= 0 && usual.lines[at] ? { ...l, line_id: usual.lines[at].line_id } : l;
        });
        draftRef.current = { ...draftRef.current, lines };
        setDraft(draftRef.current);
      },
    });
  }
  const saver = saverRef.current;

  // `Saved` shows for two seconds, then the hint comes back.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState('idle'), 2000);
    return () => clearTimeout(t);
  }, [saveState]);

  // Leaving with a change waiting sends it first.
  useEffect(
    () => () => {
      void saver.flush();
      for (const t of shortTimers.current.values()) {
        clearTimeout(t.timer);
        t.run();
      }
    },
    [],
  );

  function update(fn: (d: Draft) => Draft) {
    const next = fn(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    if (next.name.trim()) {
      saver.schedule({ input: toInput(id, next), keys: next.lines.map((l) => l.key) });
    }
  }

  const patchLine = (key: string, fn: (l: DraftLine) => DraftLine) =>
    update((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? fn(l) : l)) }));

  function move(index: number, by: -1 | 1) {
    update((d) => {
      const lines = [...d.lines];
      const to = index + by;
      if (to < 0 || to >= lines.length) return d;
      [lines[index], lines[to]] = [lines[to], lines[index]];
      return { ...d, lines };
    });
  }

  function step(line: DraftLine, dir: 1 | -1) {
    patchLine(line.key, (l) => {
      if (l.options) {
        const start = startOption(l.options, l.last_pick);
        return {
          ...l,
          options: l.options.map((o) => (o === start ? { ...o, qty: stepQty(o.qty, o.unit, dir) } : o)),
        };
      }
      return { ...l, qty: stepQty(l.qty, l.unit, dir) };
    });
  }

  function togglePick(line: DraftLine) {
    if (line.options) {
      // Off: the option that starts stays, as an Always line.
      const start = startOption(line.options, line.last_pick);
      patchLine(line.key, (l) => ({
        ...l,
        food_id: start.food_id,
        qty: start.qty,
        unit: start.unit,
        options: null,
        last_pick: '',
      }));
    } else {
      patchLine(line.key, (l) => ({
        ...l,
        options: [{ food_id: l.food_id, qty: l.qty, unit: l.unit }],
        food_id: '',
        last_pick: '',
      }));
      setSearch({ kind: 'option', key: line.key, revert: true });
    }
  }

  function removeOption(line: DraftLine, foodId: string) {
    const rest = (line.options ?? []).filter((o) => o.food_id !== foodId);
    if (rest.length === 0) return update((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }));
    patchLine(line.key, (l) =>
      rest.length === 1
        ? { ...l, food_id: rest[0].food_id, qty: rest[0].qty, unit: rest[0].unit, options: null, last_pick: '' }
        : { ...l, options: rest, last_pick: rest.some((o) => o.food_id === l.last_pick) ? l.last_pick : '' },
    );
  }

  function pickFood(food: Food) {
    const s = search;
    setSearch(null);
    if (!s) return;
    const amount = defaultAmount(food);
    if (s.kind === 'add') {
      update((d) => ({ ...d, lines: [...d.lines, alwaysLine(amount)] }));
    } else {
      patchLine(s.key, (l) => ({ ...l, options: [...(l.options ?? []), amount] }));
    }
  }

  function closeSearch() {
    const s = search;
    setSearch(null);
    // A line switched to Pick each time, with no second option chosen, goes back to what it was.
    if (s?.kind === 'option' && s.revert) {
      const line = draftRef.current.lines.find((l) => l.key === s.key);
      if (line?.options && line.options.length === 1) togglePick(line);
    }
  }

  // ---- short names, saved to the food

  function shortValue(food: Food) {
    return shorts[food.id] ?? food.short_name ?? '';
  }

  function onShort(food: Food, value: string) {
    setShorts((s) => ({ ...s, [food.id]: value }));
    const old = shortTimers.current.get(food.id);
    if (old) clearTimeout(old.timer);
    const run = () => {
      shortTimers.current.delete(food.id);
      void saveShort(food, value);
    };
    shortTimers.current.set(food.id, { timer: setTimeout(run, 600), run });
  }

  function blurShort(food: Food) {
    const t = shortTimers.current.get(food.id);
    if (!t) return;
    clearTimeout(t.timer);
    t.run();
  }

  async function saveShort(food: Food, value: string) {
    const short_name = value.trim();
    if (short_name === (food.short_name ?? '')) return;
    try {
      const saved = await api.saveFood({ id: food.id, short_name });
      keepFood(saved);
      setShortErrors((e) => ({ ...e, [food.id]: false }));
    } catch {
      setShortErrors((e) => ({ ...e, [food.id]: true }));
    }
  }

  // ---- name, slot, back, delete

  function blurName() {
    if (!draftRef.current.name.trim()) {
      // A usual needs a name: put back the one it had.
      const name = reply?.name ?? stored?.name ?? 'New usual';
      update((d) => ({ ...d, name }));
    }
    void saver.flush();
  }

  async function back() {
    await saver.flush();
    onBack();
  }

  async function remove() {
    const name = draftRef.current.name || 'this usual';
    saver.cancel();
    await saver.flush();
    try {
      await api.deleteUsual(id);
    } catch {
      setConfirming(false);
      showToast(`Couldn't delete ${name}. Try again.`);
      return;
    }
    dropUsual(id);
    showToast(`Deleted ${name}`);
    onDeleted();
  }

  if (!stored && !reply) {
    return (
      <div class="library-status" role="status">
        <p>That usual isn't here any more.</p>
        <button type="button" class="text-btn" onClick={onBack}>
          Usuals
        </button>
      </div>
    );
  }

  const hint = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Changes save as you go';
  const start = reply?.start;
  const used = new Set<string>();
  if (search?.kind === 'option') {
    for (const o of draft.lines.find((l) => l.key === search.key)?.options ?? []) used.add(o.food_id);
  }
  const kcal = reply ? startKcalText(reply) : null;
  const n = draft.lines.length;

  return (
    <section class="usual-editor" data-testid="usual-editor" aria-label="Usual">
      <div class="usual-editor-head">
        <button type="button" class="text-btn" onClick={() => void back()} data-testid="usual-back">
          ‹ Usuals
        </button>
        <span class="hint" role="status" data-testid="usual-hint">
          {hint}
        </span>
      </div>
      {saveState === 'failed' && (
        <div class="library-status danger-text" role="status" data-testid="save-failed">
          <p>Couldn't save. Your changes are kept here.</p>
          <button type="button" class="text-btn" onClick={() => void saver.retry()}>
            Try again
          </button>
        </div>
      )}

      <label class="field-label" for="usual-name">
        Name
      </label>
      <input
        id="usual-name"
        class="field"
        type="text"
        maxLength={120}
        value={draft.name}
        onInput={(e) => {
          const name = (e.target as HTMLInputElement).value;
          update((d) => ({ ...d, name }));
        }}
        onBlur={blurName}
        data-testid="usual-name"
      />

      <span class="field-label" id="usual-slot-label">
        Usually for
      </span>
      <div class="chip-row" role="group" aria-labelledby="usual-slot-label">
        {SLOTS.map((s: Slot) => (
          <button
            key={s}
            type="button"
            class="chip"
            aria-pressed={draft.slot === s}
            onClick={() => update((d) => ({ ...d, slot: s }))}
          >
            {s}
          </button>
        ))}
      </div>

      <h2 class="usual-heading">Foods ({n})</h2>
      {n === 0 && <p class="hint">No foods yet.</p>}
      <ul class="usual-lines">
        {draft.lines.map((line, i) => {
          const pick = !!line.options;
          const startO = line.options ? startOption(line.options, line.last_pick) : null;
          const amount = startO ?? { food_id: line.food_id, qty: line.qty, unit: line.unit };
          const food = foods.get(amount.food_id);
          const gone = !pick && !food && libraryFoods.value.length > 0;
          const name = pick ? 'Pick one' : labelOf(food);
          const w = weightText(food, amount);
          return (
            <li class="usual-line" key={line.key} data-testid="usual-line">
              <div class="usual-line-head">
                {pick ? (
                  <span class="chip-flag">Pick one</span>
                ) : (
                  <span class="usual-line-name" data-testid="usual-line-name">
                    {gone ? 'A removed food' : displayName(food ?? { name: '…', brand: '' })}
                  </span>
                )}
                <div class="usual-line-tools">
                  {!gone && (
                    <>
                      <button
                        type="button"
                        class="icon-btn"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        class="icon-btn"
                        aria-label="Move down"
                        disabled={i === n - 1}
                        onClick={() => move(i, 1)}
                      >
                        ↓
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label="Remove line"
                    onClick={() => update((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== line.key) }))}
                  >
                    ×
                  </button>
                </div>
              </div>

              {pick && (
                <>
                  {line.options!.map((o) => {
                    const f = foods.get(o.food_id);
                    const starts = o.food_id === startO!.food_id;
                    return (
                      <div class="usual-option" key={o.food_id} data-testid="usual-option">
                        <div class="usual-option-head">
                          <span class="recipe-text">
                            <span class="recipe-name" data-testid="option-name">
                              {f ? f.name : 'A removed food'}
                            </span>
                            <span class="recipe-meta">
                              {f ? f.brand || 'No brand' : ''}
                              {starts && ' · starts here'}
                            </span>
                          </span>
                          <button
                            type="button"
                            class="icon-btn"
                            aria-label={`Remove ${f ? f.name : 'option'}`}
                            onClick={() => removeOption(line, o.food_id)}
                          >
                            ×
                          </button>
                        </div>
                        {f && (
                          <>
                            <input
                              class="field"
                              type="text"
                              maxLength={20}
                              placeholder="Short name (saved to the food)"
                              aria-label={`Short name for ${f.name}`}
                              value={shortValue(f)}
                              onInput={(e) => onShort(f, (e.target as HTMLInputElement).value)}
                              onBlur={() => blurShort(f)}
                              data-testid="short-name"
                            />
                            {shortErrors[f.id] && (
                              <p class="field-error" role="status">
                                Couldn't save the short name. Try again.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    class="chip chip-add"
                    onClick={() => setSearch({ kind: 'option', key: line.key, revert: false })}
                  >
                    ＋ Option
                  </button>
                  <p class="hint" data-testid="layout-note">
                    {layoutNote(pickLayout(line.options!, foods))}
                  </p>
                </>
              )}

              {!gone && (
                <div class="stepper usual-stepper">
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label={`Less ${pick ? labelOf(food) : name}`}
                    onClick={() => step(line, -1)}
                  >
                    −
                  </button>
                  <span class="stepper-value" data-testid="usual-amount">
                    {`${fractionQty(amount.qty)} ${amount.unit}`}
                  </span>
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label={`More ${pick ? labelOf(food) : name}`}
                    onClick={() => step(line, 1)}
                  >
                    +
                  </button>
                  {w && <span class="hint">{w}</span>}
                </div>
              )}
              {!gone && (
                <label class="switch-row">
                  <span>Pick each time</span>
                  <input type="checkbox" role="switch" checked={pick} onChange={() => togglePick(line)} />
                </label>
              )}
              {!gone && (
                <HowOften
                  label={pick ? `${labelOf(food)} or another` : name}
                  value={line.optional ?? ''}
                  onChange={(optional) => patchLine(line.key, (l) => ({ ...l, optional }))}
                />
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        class="chip chip-add"
        onClick={() => setSearch({ kind: 'add' })}
        data-testid="add-usual-food"
      >
        ＋ Add a food
      </button>

      {start && (
        <div class="card amount-numbers" data-testid="usual-numbers">
          <p class="usual-kcal-big tabular">
            <strong>{kcal ?? '—'}</strong> <span class="hint">as it starts</span>
          </p>
          <MacroBar protein={start.protein_g} carbs={start.carbs_g} fat={start.fat_g} size="day" />
          <MacroCols
            protein={start.protein_g}
            carbs={start.carbs_g}
            fat={start.fat_g}
            format={(g) => `${grams1(g)} g`}
          />
        </div>
      )}

      {confirming ? (
        <div class="usual-confirm" role="alertdialog" aria-label="Delete usual" data-testid="usual-confirm">
          <p>
            <strong>Delete {draft.name}?</strong>
          </p>
          <p class="hint">Days you logged it keep their entries.</p>
          <div class="sheet-actions">
            <button type="button" class="btn btn-danger" onClick={() => void remove()}>
              Delete
            </button>
            <button type="button" class="btn btn-secondary" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" class="text-btn danger-text" onClick={() => setConfirming(true)}>
          Delete usual
        </button>
      )}

      {search && (
        <FoodSearchSheet
          title={search.kind === 'add' ? 'Add a food' : 'Add an option'}
          exclude={used}
          onPick={pickFood}
          onClose={closeSearch}
        />
      )}
    </section>
  );
}
