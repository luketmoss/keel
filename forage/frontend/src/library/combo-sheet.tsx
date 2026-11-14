// The Combo sheet (#888): what a combo is made of and where it came from, with Save as a usual and Hide this combo.
import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Combo, Food, FoodLogEntry, Usual } from '../api/types';
import { fractionQty } from '../eaten/amount-edit';
import { dayTitle } from '../eaten/format';
import { Sheet } from '../ui/sheet';
import { chosen, joinLine, mealsFrom, optionNames, sheetMeta, usualFromCombo } from './combos-store';
import { displayName } from './food-math';

const MEALS_MAX = 10;

interface Props {
  api: ForageApi;
  combo: Combo;
  foods: Map<string, Food>;
  today: string;
  onSaved: (usual: Usual) => void;
  onHidden: (combo: Combo) => void;
  onClose: () => void;
}

const amount = (qty: number, unit: string) => `${fractionQty(qty)} ${unit}`;

export function ComboSheet({ api, combo, foods, today, onSaved, onHidden, onClose }: Props) {
  const hasPick = combo.lines.some((l) => l.options);
  const [name, setName] = useState(hasPick ? '' : combo.name.slice(0, 120));
  const [busy, setBusy] = useState<'save' | 'hide' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<FoodLogEntry[] | null>(null);
  const meals = mealsFrom(combo);
  const join = joinLine(combo, foods);

  // What was eaten at each of those meals, when the log can say; else the combo's own foods stand in.
  useEffect(() => {
    if (!meals.length) return;
    const from = meals[meals.length - 1].date;
    const to = meals[0].date;
    let live = true;
    api.getFoodLog(from, to).then(
      (l) => live && setLog(l),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [api, combo.key]);

  const own = combo.lines
    .map((l) => (l.options ? optionNames(l, foods).join(' / ') : (foods.get(l.food_id)?.name ?? 'A removed food')))
    .join(', ');
  const eaten = (date: string, slot: string) => {
    const names = (log ?? [])
      .filter((e) => e.date === date && e.slot === slot && e.food_id)
      .map((e) => {
        const f = foods.get(e.food_id);
        return f ? displayName(f) : 'A removed food';
      });
    return names.length ? names.join(', ') : own;
  };

  async function save() {
    if (busy || !name.trim()) return;
    setBusy('save');
    setError(null);
    try {
      const usual = await api.upsertUsual(usualFromCombo(combo, name));
      onSaved(usual);
    } catch {
      setError("Couldn't save. Try again.");
      setBusy(null);
    }
  }

  async function hide() {
    if (busy) return;
    setBusy('hide');
    setError(null);
    try {
      await api.hideCombo(combo.key);
      onHidden(combo);
    } catch {
      setError("Couldn't hide it. Try again.");
      setBusy(null);
    }
  }

  return (
    <Sheet title={combo.name} onClose={onClose} testId="combo-sheet" tall>
      <p class="hint" data-testid="combo-meta">
        {sheetMeta(combo, today)}
      </p>
      {join && (
        <p class="hint" data-testid="combo-join">
          {join}
        </p>
      )}

      <p class="card-label" id="combo-amounts-label">
        Typical amounts
      </p>
      <ul class="plain-list" aria-labelledby="combo-amounts-label" data-testid="combo-amounts">
        {combo.lines.map((l, i) => (
          <li class="combo-amount" key={i}>
            {l.options ? (
              <>
                <span class="combo-amount-name">
                  <span class="chip-flag">Pick one</span> {optionNames(l, foods).join(' / ')}
                </span>
                <span class="tabular">{amount(chosen(l).qty, chosen(l).unit)}</span>
              </>
            ) : (
              <>
                <span class="combo-amount-name">{foods.get(l.food_id)?.name ?? 'A removed food'}</span>
                <span class="tabular">{amount(l.qty, l.unit)}</span>
              </>
            )}
          </li>
        ))}
      </ul>

      <p class="card-label" id="combo-meals-label">
        Meals it came from
      </p>
      <ul class="plain-list" aria-labelledby="combo-meals-label" data-testid="combo-meals">
        {meals.slice(0, MEALS_MAX).map((m, i) => (
          <li class="combo-meal" key={i}>
            {dayTitle(m.date, today)} · {eaten(m.date, m.slot)}
          </li>
        ))}
      </ul>
      {meals.length > MEALS_MAX && <p class="hint">and {meals.length - MEALS_MAX} more</p>}

      <label class="field-label" for="combo-name">
        Save as a usual
      </label>
      <input
        id="combo-name"
        class="field"
        type="text"
        maxLength={120}
        placeholder="Name it"
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        data-testid="combo-name"
      />
      <div class="sheet-actions">
        <button
          type="button"
          class="btn btn-primary"
          onClick={() => void save()}
          disabled={!name.trim() || busy !== null}
          aria-busy={busy === 'save'}
          data-testid="combo-save"
        >
          Save as a usual
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          onClick={() => void hide()}
          disabled={busy !== null}
          aria-busy={busy === 'hide'}
          data-testid="combo-hide"
        >
          Hide this combo
        </button>
      </div>
      <p class="hint danger-text" role="status" data-testid="combo-error">
        {error ?? ''}
      </p>
    </Sheet>
  );
}
