import { useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Food } from '../api/types';
import { Sheet } from '../ui/sheet';
import { parseWeight, singular } from './food-math';
import { namesList } from './foods-store';

interface Props {
  api: ForageApi;
  food: Food;
  /** The line's own unit word (`carton`, `medium`, `cup`); blank for a bare count, stored as `each`. */
  unit: string;
  /** Other recipes that use the food, which the weight fixes too. */
  alsoIn: string[];
  onSaved: (food: Food) => void;
  onClose: () => void;
}

/** Set a weight (#707): one named weight on the food, so every recipe using it is fixed. */
export function SetWeightSheet({ api, food, unit, alsoIn, onSaved, onClose }: Props) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const grams = parseWeight(value);
  const name = unit.trim().toLowerCase() || 'each';
  const what = name === 'each' ? singular(food.name.toLowerCase()) : `${name}`;

  async function save() {
    if (grams === null) return;
    setSaving(true);
    setFailed(false);
    try {
      onSaved(await api.setFoodWeight(food.id, name, grams));
    } catch {
      setSaving(false);
      setFailed(true);
    }
  }

  return (
    <Sheet title="Set a weight" onClose={onClose} testId="set-weight">
      <p>
        How much does <strong>1 {what}</strong>
        {name === 'each' ? '' : ` of ${food.name.toLowerCase()}`} weigh?
      </p>
      <label for="weight-field" class="visually-hidden">
        Weight
      </label>
      <input
        id="weight-field"
        class="field"
        inputMode="decimal"
        placeholder="425"
        autoComplete="off"
        value={value}
        data-autofocus
        onInput={(e) => setValue(e.currentTarget.value)}
        data-testid="weight-field"
      />
      <p class={value.trim() && grams === null ? 'field-error' : 'hint'} aria-live="polite">
        {value.trim() && grams === null ? 'Enter a weight above 0, up to 5,000 g.' : 'In grams, or write 15 oz.'}
      </p>
      {grams !== null && <p data-testid="weight-understood">= {grams} g</p>}
      {alsoIn.length > 0 && <p class="hint">Also used in {namesList(alsoIn)}.</p>}
      {failed && <p role="status">Couldn't save. Try again.</p>}
      <div class="sheet-actions">
        <button
          type="button"
          class="btn btn-primary"
          disabled={grams === null || saving}
          onClick={save}
          data-testid="weight-save"
        >
          Save
        </button>
        <button type="button" class="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
