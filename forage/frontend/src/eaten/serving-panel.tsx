// The "＋ Serving" panel under the inline amount editor (#883): say what a vague `serving` is on the label, or weigh a
// portion of your own. Either way it is one `upsertFood` on the food, then the entry switches to the new serving.
import { useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Food, Weight } from '../api/types';
import { keepFood } from '../library/foods-store';
import { showToast } from '../ui/toast';
import type { UnitOption } from './amount-edit';
import { knowFood, switchEditorTo } from './eaten-store';
import { tenth } from './format';
import {
  fieldNumber,
  labelServing,
  MAX_GRAMS,
  MAX_NAME_CHARS,
  MAX_UNIT_CHARS,
  nameProblem,
  ownLine,
  vagueServing,
  withLabelServing,
  withOwnServing,
} from './serving-edit';

export function ServingPanel({
  api,
  food,
  foodName,
  from,
  onAdded,
}: {
  api: ForageApi;
  food: Food;
  foodName: string;
  /** The unit being edited, as the editor offers it now: the weight the entry keeps. */
  from: () => UnitOption | undefined;
  /** The serving was saved: the panel closes. */
  onAdded: () => void;
}) {
  const vague = vagueServing(food);
  const [qtyField, setQtyField] = useState('2');
  const [unitField, setUnitField] = useState('tbsp');
  const [ownName, setOwnName] = useState('');
  const [ownGrams, setOwnGrams] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const label = vague ? labelServing(vague, qtyField, unitField) : null;
  const labelProblem = vague ? nameProblem(food, foodName, unitField) : null;
  const labelOk = label !== null && labelProblem === null;
  const grams = fieldNumber(ownGrams);
  const ownProblem = nameProblem(food, foodName, ownName);
  const ownOk = ownName.trim().length > 0 && grams !== null && grams <= MAX_GRAMS && ownProblem === null;

  async function save(servings: Weight[], added: Weight) {
    if (saving) return;
    const was = from();
    setSaving(true);
    setFailed(false);
    let saved: Food;
    try {
      saved = await api.saveFood({ id: food.id, servings_json: servings });
    } catch {
      setSaving(false);
      setFailed(true);
      return;
    }
    keepFood(saved);
    knowFood(saved);
    const stored = saved.servings_json?.find((s) => s.name.toLowerCase() === added.name.toLowerCase()) ?? added;
    const ok = await switchEditorTo(api, was, { unit: stored.name, grams: stored.g, label: stored.name });
    setSaving(false);
    onAdded();
    if (ok) showToast(`Added ${stored.name} (${tenth(stored.g)} g) to ${foodName}`);
  }

  const own = (
    <div class="serving-block">
      {!vague && <p class="serving-heading">New serving for {foodName}</p>}
      <div class="serving-fields">
        <label class="visually-hidden" for="serving-own-name">
          Serving name
        </label>
        <input
          id="serving-own-name"
          class="field"
          placeholder="bowl"
          maxLength={MAX_NAME_CHARS}
          autoComplete="off"
          value={ownName}
          disabled={saving}
          onInput={(e) => setOwnName(e.currentTarget.value)}
          data-testid="serving-own-name"
        />
        <label class="visually-hidden" for="serving-own-grams">
          Grams
        </label>
        <input
          id="serving-own-grams"
          class="field serving-grams"
          inputMode="decimal"
          placeholder="grams"
          autoComplete="off"
          value={ownGrams}
          disabled={saving}
          onInput={(e) => setOwnGrams(e.currentTarget.value)}
          data-testid="serving-own-grams"
        />
      </div>
      {ownProblem && (
        <p class="field-error" data-testid="serving-own-problem">
          {ownProblem}
        </p>
      )}
      <p class="hint" data-testid="serving-own-line">
        {ownOk && grams !== null
          ? ownLine(food, ownName, grams)
          : "Weigh it once, name it, and it's a serving from now on."}
      </p>
      <button
        type="button"
        class={vague ? 'btn btn-secondary btn-block' : 'btn btn-primary btn-block'}
        disabled={!ownOk || saving}
        aria-busy={saving}
        onClick={() =>
          grams !== null && void save(withOwnServing(food, ownName, grams), { name: ownName.trim(), g: grams })
        }
        data-testid="serving-own-add"
      >
        {saving ? 'Saving…' : 'Add serving'}
      </button>
      <p class="hint serving-note">Saved to {foodName}, so it's there next time. Past days don't change.</p>
    </div>
  );

  return (
    <div class="serving-panel" data-testid="serving-panel">
      {vague && (
        <div class="serving-block">
          <p class="serving-heading">What is 1 serving ({tenth(vague.g)} g) on the label?</p>
          <div class="serving-fields">
            <label class="visually-hidden" for="serving-qty">
              Amount on the label
            </label>
            <input
              id="serving-qty"
              class="field serving-qty"
              inputMode="decimal"
              autoComplete="off"
              value={qtyField}
              disabled={saving}
              onInput={(e) => setQtyField(e.currentTarget.value)}
              data-testid="serving-qty"
            />
            <label class="visually-hidden" for="serving-unit">
              Unit on the label
            </label>
            <input
              id="serving-unit"
              class="field"
              maxLength={MAX_UNIT_CHARS}
              autoComplete="off"
              value={unitField}
              disabled={saving}
              onInput={(e) => setUnitField(e.currentTarget.value)}
              data-testid="serving-unit"
            />
          </div>
          {labelProblem && (
            <p class="field-error" data-testid="serving-label-problem">
              {labelProblem}
            </p>
          )}
          <p class="hint" data-testid="serving-label-line">
            {label
              ? `Adds 1 ${label.unit} = ${tenth(label.grams)} g, and renames the serving “${label.label}”.`
              : "Type the label's serving, like 2 tbsp."}
          </p>
          <button
            type="button"
            class="btn btn-primary btn-block"
            disabled={!labelOk || saving}
            aria-busy={saving}
            onClick={() => label && void save(withLabelServing(food, label), { name: label.unit, g: label.grams })}
            data-testid="serving-label-add"
          >
            {saving ? 'Saving…' : label ? `Add ${label.unit}` : 'Add it'}
          </button>
          <p class="serving-divider">or weigh your own</p>
        </div>
      )}
      {own}
      {failed && (
        <p class="danger-text field-error" role="status" data-testid="serving-error">
          Couldn't save the serving. Try again.
        </p>
      )}
    </div>
  );
}
