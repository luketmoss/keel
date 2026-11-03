import { useEffect, useRef, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import { EXTRA_COLUMN, EXTRA_KEYS, type Extras, type FoodDetail, type Store } from '../api/types';
import { MoreNutrition, noneKnown } from '../ui/more-nutrition';
import { Sheet } from '../ui/sheet';
import { StoreChips } from './food-form';
import { displayName, hasNutrition } from './food-math';
import { deleteFood, keepFood } from './foods-store';

interface Props {
  api: ForageApi;
  id: string;
  /** Edit, or Add nutrition (focused on the first nutrition field). */
  onEdit: (food: FoodDetail, focusNutrition: boolean, focusExtras?: boolean) => void;
  onDeleted: (name: string) => void;
  onClose: () => void;
}

const SOURCE: Record<string, string> = { off: ' · Open Food Facts', usda: ' · USDA', label: ' · From the label' };

const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** The food sheet (#707): nutrition by each weight and per 100 g, stores and pantry chips saved on tap, uses. */
export function FoodSheet({ api, id, onEdit, onDeleted, onClose }: Props) {
  const [food, setFood] = useState<FoodDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  // The last value each chip was asked to take: rapid taps, the last wins.
  const latest = useRef<Record<string, unknown>>({});

  useEffect(() => {
    api
      .getFood(id)
      .then(setFood)
      .catch(() => setFailed(true));
  }, [api, id]);

  async function toggle(field: 'usual_store' | 'usually_have' | 'regular', value: Store | boolean) {
    if (!food) return;
    const before = food[field];
    latest.current[field] = value;
    setFood({ ...food, [field]: value });
    setBusy(field);
    setStatus(null);
    try {
      const saved = await api.saveFood({ id: food.id, [field]: value });
      keepFood(saved);
    } catch {
      if (latest.current[field] === value) {
        setFood((f) => (f ? { ...f, [field]: before } : f));
        setStatus("Couldn't save. Try again.");
      }
    } finally {
      if (latest.current[field] === value) setBusy(null);
    }
  }

  async function remove() {
    if (!food) return;
    const said = await deleteFood(api, food.id);
    if (said) {
      setConfirming(false);
      setRefused(said);
    } else {
      onDeleted(displayName(food));
    }
  }

  if (!food) {
    return (
      <Sheet title="Food" onClose={onClose} testId="food-sheet">
        <p role="status">{failed ? "Couldn't load this food." : 'Loading…'}</p>
      </Sheet>
    );
  }

  const name = displayName(food);
  const brand = (food.brand ?? '').trim();
  if (confirming || refused) {
    return (
      <Sheet title={`Delete ${name}?`} onClose={onClose} closable={false} testId="food-delete">
        <p class="sheet-message" role={refused ? 'status' : undefined}>
          {refused ?? 'Recipes and shopping lists can no longer use it.'}
        </p>
        <div class="sheet-actions">
          {!refused && (
            <button type="button" class="btn btn-danger" onClick={remove}>
              Delete
            </button>
          )}
          <button
            type="button"
            class="btn btn-secondary"
            data-autofocus
            onClick={() => {
              setConfirming(false);
              setRefused(null);
            }}
          >
            {refused ? 'OK' : 'Cancel'}
          </button>
        </div>
      </Sheet>
    );
  }

  const rows: { label: string; g: number }[] = [
    ...(food.servings_json ?? []).map((w) => ({ label: `1 ${w.name} (${fmt(w.g)} g)`, g: w.g })),
    { label: '100 g', g: 100 },
  ];
  const unchecked = food.source === 'off' && !food.verified;
  // #756: the seven for the food's default weight (its first, the label serving for a packaged food), else 100 g.
  const defaultWeight = food.servings_json?.[0];
  const dg = defaultWeight?.g ?? 100;
  const at = (v: number | null | undefined) => (typeof v === 'number' ? (v * dg) / 100 : null);
  const extras: Extras = {};
  for (const k of EXTRA_KEYS) extras[k] = at(food[EXTRA_COLUMN[k]]);
  return (
    <Sheet title={food.name.trim() || name} onClose={onClose} testId="food-sheet">
      <p class="hint">
        {brand ? `${brand} · ` : ''}
        {food.kind === 'packaged' ? 'Packaged food' : 'Ingredient'}
        {SOURCE[food.source] ?? ''}
      </p>
      {unchecked && <span class="chip-flag">Not checked against the label</span>}

      {hasNutrition(food) ? (
        <div class="table-scroll">
          <table class="per-table">
            <caption class="visually-hidden">Nutrition by weight</caption>
            <thead>
              <tr>
                <th scope="col">Per</th>
                <th scope="col">kcal</th>
                <th scope="col">P</th>
                <th scope="col">C</th>
                <th scope="col">F</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  <td>{Math.round((food.kcal_100g! * r.g) / 100)}</td>
                  <td>{fmt((food.protein_100g! * r.g) / 100)}</td>
                  <td>{fmt((food.carbs_100g! * r.g) / 100)}</td>
                  <td>{fmt((food.fat_100g! * r.g) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div class="notice is-warning">
          <p>No nutrition yet. Recipes that use it leave it out of their totals.</p>
          <button type="button" class="text-btn" onClick={() => onEdit(food, true)}>
            Add nutrition
          </button>
        </div>
      )}

      {hasNutrition(food) &&
        (noneKnown(extras) ? (
          <div class="more-missing" data-testid="more-missing">
            <p class="hint">Sodium, fiber and the rest aren't filled in.</p>
            <button type="button" class="text-btn" onClick={() => onEdit(food, false, true)}>
              Add them
            </button>
          </div>
        ) : (
          <MoreNutrition
            values={extras}
            fat={at(food.fat_100g)}
            carbs={at(food.carbs_100g)}
            rounding="tenth"
            caption={defaultWeight ? `Per 1 ${defaultWeight.name} (${fmt(defaultWeight.g)} g)` : 'Per 100 g'}
            noneText=""
          />
        ))}

      {food.buy_unit_plural && typeof food.buy_unit_g === 'number' && (
        <p class="hint">
          On a shopping list it's counted in {food.buy_unit_plural}, about {fmt(food.buy_unit_g)} g each.
        </p>
      )}

      <h3 class="choice-heading">Where you usually get it</h3>
      <StoreChips
        value={food.usual_store ?? ''}
        busy={busy === 'usual_store'}
        onChange={(s) => void toggle('usual_store', s)}
      />

      <h3 class="choice-heading">Pantry</h3>
      <div class="chip-row">
        <button
          type="button"
          class="chip"
          aria-pressed={!!food.usually_have}
          aria-busy={busy === 'usually_have' || undefined}
          onClick={() => void toggle('usually_have', !food.usually_have)}
        >
          Usually have it
        </button>
        <button
          type="button"
          class="chip"
          aria-pressed={!!food.regular}
          aria-busy={busy === 'regular' || undefined}
          onClick={() => void toggle('regular', !food.regular)}
        >
          A regular
        </button>
      </div>

      <h3 class="choice-heading">Used in</h3>
      <p class="hint">
        {food.used_by.length ? food.used_by.map((r) => r.name).join(', ') : 'Not used in any recipe yet.'}
      </p>

      {status && <p role="status">{status}</p>}
      <div class="sheet-actions">
        <button type="button" class="btn btn-secondary" onClick={() => onEdit(food, false)}>
          Edit
        </button>
        <button type="button" class="btn btn-danger-text" onClick={() => setConfirming(true)}>
          Delete food
        </button>
      </div>
    </Sheet>
  );
}
