import { useState } from 'preact/hooks';
import { ApiError, type ForageApi } from '../api/client';
import type { BarcodeLookup, Food, FoodKind, Store, Weight } from '../api/types';
import { Sheet } from '../ui/sheet';
import {
  COLUMN,
  NUTRIENTS,
  STORE_LABELS,
  barcodeDigits,
  displayName,
  hasNutrition,
  macroKcal,
  numberOf,
  per100,
  perServing,
  type Nutrient,
} from './food-math';

/** Where the form was opened from, which decides its defaults and banner. */
export interface FoodFormOrigin {
  /** An Open Food Facts lookup's answer: the banner and the "checked" box. */
  lookup?: BarcodeLookup;
  /** Opened from "Type from a label": a saved food with nutrition is `label`. */
  fromLabel?: boolean;
  /** Focus the first nutrition field ("Add nutrition"). */
  focusNutrition?: boolean;
}

interface Props {
  api: ForageApi;
  /** The food to edit, or the prefill of a new one (no `id`). */
  food: Partial<Food>;
  origin?: FoodFormOrigin;
  onSaved: (food: Food) => void;
  onCancel: () => void;
}

const LABELS: Record<Nutrient, string> = { kcal: 'kcal', protein: 'Protein g', carbs: 'Carbs g', fat: 'Fat g' };

const text = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

interface WeightRow {
  key: number;
  name: string;
  g: string;
}

let rowSeq = 0;
const row = (w: Weight): WeightRow => ({ key: ++rowSeq, name: w.name, g: String(w.g) });

/** The form's fields as text, from a food: a packaged food's label serving is the serving row, not a weight. */
function initial(food: Partial<Food>) {
  const kind: FoodKind = food.kind ?? 'ingredient';
  const servings = food.servings_json ?? [];
  const serving = kind === 'packaged' ? servings[0] : undefined;
  const n = {} as Record<Nutrient, string>;
  for (const k of NUTRIENTS) {
    const v = food[COLUMN[k]];
    n[k] = typeof v !== 'number' ? '' : serving ? String(perServing(v, serving.g)) : String(v);
  }
  return {
    kind,
    n,
    servingName: serving?.name ?? '',
    servingG: serving ? String(serving.g) : '',
    weights: (serving ? servings.slice(1) : servings).map(row),
  };
}

/** The food form (#707), for Add and Edit: packaged foods are typed per serving, ingredients per 100 g. */
export function FoodForm({ api, food, origin = {}, onSaved, onCancel }: Props) {
  const start = initial(food);
  const isOff = food.source === 'off';
  const [kind, setKind] = useState<FoodKind>(start.kind);
  const [brand, setBrand] = useState(food.brand ?? '');
  const [name, setName] = useState(food.name ?? '');
  const [servingName, setServingName] = useState(start.servingName);
  const [servingG, setServingG] = useState(start.servingG);
  const [n, setN] = useState(start.n);
  const [weights, setWeights] = useState<WeightRow[]>(start.weights);
  const [buyUnit, setBuyUnit] = useState(food.buy_unit ?? '');
  const [buyPlural, setBuyPlural] = useState(food.buy_unit_plural ?? '');
  const [buyG, setBuyG] = useState(text(food.buy_unit_g));
  const [store, setStore] = useState<Store>(food.usual_store ?? '');
  const [packs, setPacks] = useState<string[]>(food.packs_json ?? []);
  const [pack, setPack] = useState('');
  const [usuallyHave, setUsuallyHave] = useState(!!food.usually_have);
  const [regular, setRegular] = useState(!!food.regular);
  const [neverShop, setNeverShop] = useState(!!food.never_shop);
  const [barcode, setBarcode] = useState(food.barcode ?? '');
  const [checked, setChecked] = useState(!!food.verified);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packaged = kind === 'packaged';
  const values = NUTRIENTS.map((k) => numberOf(n[k]));
  const filled = values.filter((v) => v !== null).length;
  const partly = filled > 0 && filled < 4;
  const badNumber = NUTRIENTS.some((k, i) => n[k].trim() !== '' && (values[i] === null || values[i]! < 0));
  const sg = numberOf(servingG);
  const needsServing = packaged && filled > 0 && !(sg !== null && sg > 0);
  const badServing =
    packaged &&
    (servingName.trim() !== '' || servingG.trim() !== '') &&
    (!servingName.trim() || !(sg !== null && sg > 0));
  const badWeight = weights.some((w) => !w.name.trim() || !((numberOf(w.g) ?? 0) > 0) || (numberOf(w.g) ?? 0) > 9999);
  const badBarcode = barcode.trim() !== '' && !barcodeDigits(barcode);
  const unchecked = isOff && !checked;
  const blocked =
    !name.trim() || partly || badNumber || needsServing || badServing || badWeight || badBarcode || unchecked;

  const per100g =
    filled === 4 && !needsServing && !badNumber ? values.map((v) => (packaged ? per100(v!, sg!) : v!)) : null;

  function setNutrient(k: Nutrient, v: string) {
    setN({ ...n, [k]: v });
    // The numbers changed, so a check against the label no longer holds.
    if (isOff && food.verified) setChecked(false);
  }

  function build(): Partial<Food> {
    const out: Partial<Food> = {
      name: name.trim(),
      kind,
      brand: packaged ? brand.trim() : '',
      buy_unit: buyUnit.trim(),
      buy_unit_plural: buyPlural.trim(),
      buy_unit_g: numberOf(buyG),
      usual_store: store,
      packs_json: packs.length ? packs : null,
      usually_have: usuallyHave,
      regular,
      never_shop: neverShop,
      barcode: barcodeDigits(barcode) ?? '',
    };
    if (food.id) out.id = food.id;
    for (const [i, k] of NUTRIENTS.entries()) out[COLUMN[k]] = per100g ? per100g[i] : null;
    const list: Weight[] = [];
    if (packaged && servingName.trim() && sg) list.push({ name: servingName.trim(), g: sg });
    for (const w of weights) list.push({ name: w.name.trim(), g: numberOf(w.g)! });
    out.servings_json = list.length ? list : null;
    if (isOff) {
      out.verified = checked;
      if (!food.id) Object.assign(out, { source: 'off', source_ref: food.source_ref ?? '' });
    } else if (!food.id) {
      out.source = origin.fromLabel && per100g ? 'label' : 'manual';
    }
    return out;
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api.saveFood(build()));
    } catch (err) {
      setSaving(false);
      if (err instanceof ApiError && err.code !== 'network' && err.code !== 'unconfigured') {
        setError(`Couldn't save: ${err.message}`);
      } else {
        setError("Couldn't save. Your edits are kept here. Try again.");
      }
    }
  }

  const lookup = origin.lookup;
  const mismatch = lookup?.warnings.includes('energy_mismatch') && lookup.food && hasNutrition(lookup.food);
  let mismatchText = '';
  if (mismatch && lookup?.food) {
    const f = lookup.food;
    const g = f.servings_json?.[0]?.g ?? 100;
    const scale = (v: number | null) => ((v ?? 0) * g) / 100;
    mismatchText =
      `The calories don't match the macros: protein, carbs and fat add up to about ` +
      `${Math.round(macroKcal(scale(f.protein_100g), scale(f.carbs_100g), scale(f.fat_100g)))} kcal, ` +
      `and this says ${Math.round(scale(f.kcal_100g))}. Check the label.`;
  }

  const title = food.id ? `Edit ${displayName(food as Food) || 'food'}` : 'New food';
  return (
    <Sheet
      title={title}
      onClose={onCancel}
      tall
      testId="food-form"
      headerStart={
        <button type="button" class="text-btn" onClick={onCancel}>
          Cancel
        </button>
      }
      headerEnd={
        <button
          type="button"
          class="btn btn-primary"
          disabled={blocked || saving}
          onClick={save}
          data-testid="food-save"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      }
    >
      {lookup && (
        <div class="notice is-warning" role="note" data-testid="off-banner">
          <p>
            <strong>Found on Open Food Facts</strong> ({food.barcode}). It's shared data, so check it against the label
            before saving.
          </p>
          {lookup.reason === 'no_nutrition' && (
            <p>Open Food Facts has no nutrition for this one. Type it from the label.</p>
          )}
          {mismatchText && <p data-testid="energy-warning">{mismatchText}</p>}
        </div>
      )}

      <fieldset class="form-group">
        <legend class="field-label">Kind</legend>
        <div class="chip-row">
          {(['packaged', 'ingredient'] as const).map((k) => (
            <button key={k} type="button" class="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === 'packaged' ? 'Packaged' : 'Ingredient'}
            </button>
          ))}
        </div>
      </fieldset>

      {packaged && (
        <label class="form-group">
          <span class="field-label">Brand</span>
          <input class="field" value={brand} onInput={(e) => setBrand(e.currentTarget.value)} />
        </label>
      )}
      <label class="form-group">
        <span class="field-label">Name</span>
        <input
          class="field"
          value={name}
          required
          onInput={(e) => setName(e.currentTarget.value)}
          data-testid="food-name"
        />
      </label>

      <fieldset class="form-group">
        <legend class="field-label">Nutrition</legend>
        {packaged && (
          <div class="field-pair">
            <label>
              <span class="hint">Serving</span>
              <input
                class="field"
                placeholder="bar"
                value={servingName}
                onInput={(e) => setServingName(e.currentTarget.value)}
                data-testid="serving-name"
              />
            </label>
            <label>
              <span class="hint">Serving weight (g)</span>
              <input
                class="field"
                inputMode="decimal"
                value={servingG}
                onInput={(e) => setServingG(e.currentTarget.value)}
                data-testid="serving-g"
              />
            </label>
          </div>
        )}
        <p class="hint">{packaged ? 'Per serving' : 'Per 100 g'}</p>
        <div class="nutrient-grid">
          {NUTRIENTS.map((k, i) => (
            <label key={k}>
              <span class="hint">{LABELS[k]}</span>
              <input
                class="field"
                inputMode="decimal"
                value={n[k]}
                data-autofocus={origin.focusNutrition && i === 0 ? true : undefined}
                onInput={(e) => setNutrient(k, e.currentTarget.value)}
                data-testid={`n-${k}`}
              />
              {partly && values[i] === null && <span class="field-error">Needed if you enter any</span>}
            </label>
          ))}
        </div>
        {needsServing && <span class="field-error">Needed if you enter any: the serving weight</span>}
        {packaged && per100g && (
          <p class="hint" data-testid="per-100">
            That's {Math.round(per100g[0])} kcal per 100 g.
          </p>
        )}
      </fieldset>

      <fieldset class="form-group">
        <legend class="field-label">Weights</legend>
        <ul class="weight-list">
          {packaged && servingName.trim() && sg ? (
            <li class="weight-row">
              <span>
                {servingName.trim()} · {sg} g <span class="hint">Default</span>
              </span>
            </li>
          ) : null}
          {weights.map((w, i) => (
            <li key={w.key} class="weight-row">
              <input
                class="field"
                aria-label="Weight name"
                placeholder="cup"
                value={w.name}
                onInput={(e) =>
                  setWeights(weights.map((x) => (x.key === w.key ? { ...x, name: e.currentTarget.value } : x)))
                }
              />
              <input
                class="field"
                aria-label="Grams"
                inputMode="decimal"
                placeholder="g"
                value={w.g}
                onInput={(e) =>
                  setWeights(weights.map((x) => (x.key === w.key ? { ...x, g: e.currentTarget.value } : x)))
                }
              />
              {i === 0 && !(packaged && servingName.trim() && sg) && <span class="hint">Default</span>}
              <button type="button" class="text-btn" onClick={() => setWeights(weights.filter((x) => x.key !== w.key))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          class="text-btn"
          onClick={() => setWeights([...weights, { key: ++rowSeq, name: '', g: '' }])}
        >
          Add a weight
        </button>
        <p class="hint">Recipes use these to turn cups and cloves into grams.</p>
      </fieldset>

      <fieldset class="form-group">
        <legend class="field-label">Shopping unit</legend>
        <div class="unit-grid">
          <label>
            <span class="hint">Singular</span>
            <input
              class="field"
              placeholder="onion"
              value={buyUnit}
              onInput={(e) => setBuyUnit(e.currentTarget.value)}
            />
          </label>
          <label>
            <span class="hint">Plural</span>
            <input
              class="field"
              placeholder="onions"
              value={buyPlural}
              onInput={(e) => setBuyPlural(e.currentTarget.value)}
            />
          </label>
          <label>
            <span class="hint">Grams each</span>
            <input
              class="field"
              inputMode="decimal"
              placeholder="110"
              value={buyG}
              onInput={(e) => setBuyG(e.currentTarget.value)}
            />
          </label>
        </div>
        <p class="hint">On a shopping list it's counted in these.</p>
      </fieldset>

      <fieldset class="form-group">
        <legend class="field-label">Where you usually get it</legend>
        <StoreChips value={store} onChange={setStore} />
      </fieldset>

      <fieldset class="form-group">
        <legend class="field-label">Pack sizes</legend>
        <div class="chip-row">
          {packs.map((p) => (
            <button
              key={p}
              type="button"
              class="chip"
              aria-label={`Remove ${p}`}
              onClick={() => setPacks(packs.filter((x) => x !== p))}
            >
              {p} ×
            </button>
          ))}
        </div>
        <div class="inline-add">
          <input
            class="field"
            aria-label="Add a size"
            placeholder="Add a size, for example 1 gallon"
            value={pack}
            onInput={(e) => setPack(e.currentTarget.value)}
          />
          <button
            type="button"
            class="btn btn-secondary"
            disabled={!pack.trim() || packs.includes(pack.trim())}
            onClick={() => {
              setPacks([...packs, pack.trim()]);
              setPack('');
            }}
          >
            Add
          </button>
        </div>
      </fieldset>

      <label class="switch-row">
        <span>
          Usually have it<span class="hint">Shopping lists start these as 'Have it'</span>
        </span>
        <input type="checkbox" checked={usuallyHave} onChange={(e) => setUsuallyHave(e.currentTarget.checked)} />
      </label>
      <label class="switch-row">
        <span>
          A regular<span class="hint">Offered on every shopping list</span>
        </span>
        <input type="checkbox" checked={regular} onChange={(e) => setRegular(e.currentTarget.checked)} />
      </label>
      <label class="switch-row">
        <span>
          Never on a list<span class="hint">For things like water</span>
        </span>
        <input type="checkbox" checked={neverShop} onChange={(e) => setNeverShop(e.currentTarget.checked)} />
      </label>

      <label class="form-group">
        <span class="field-label">Barcode</span>
        <input class="field" inputMode="numeric" value={barcode} onInput={(e) => setBarcode(e.currentTarget.value)} />
        {badBarcode && <span class="field-error">A barcode is 8, 12, 13 or 14 digits.</span>}
      </label>

      {isOff && (
        <label class="switch-row" data-testid="off-check">
          <span>I've checked these numbers against the label</span>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} />
        </label>
      )}

      {error && (
        <p class="field-error" role="status">
          {error}
        </p>
      )}
    </Sheet>
  );
}

/** King Soopers | Costco | Other; tapping the selected chip clears it. */
export function StoreChips({ value, onChange, busy }: { value: Store; onChange: (s: Store) => void; busy?: boolean }) {
  return (
    <div class="chip-row">
      {(Object.keys(STORE_LABELS) as Exclude<Store, ''>[]).map((s) => (
        <button
          key={s}
          type="button"
          class="chip"
          aria-pressed={value === s}
          aria-busy={busy || undefined}
          onClick={() => onChange(value === s ? '' : s)}
        >
          {STORE_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
