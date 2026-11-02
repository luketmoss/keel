import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Food, FoodDetail, MissingReason, RecipeDetail } from '../api/types';
import { FoodChooser } from '../import/food-chooser';
import { Sheet } from '../ui/sheet';
import { FoodForm } from './food-form';
import { displayName } from './food-math';
import { keepFood, libraryFoods, loadFoods } from './foods-store';
import { SetWeightSheet } from './set-weight-sheet';

interface Props {
  api: ForageApi;
  recipeId: string;
  /** The recipe's figures changed: Library's list refreshes. */
  onChanged: () => void;
  onClose: () => void;
}

type Line = RecipeDetail['lines'][number];

type Overlay =
  | { kind: 'choose'; line: Line }
  | { kind: 'weight'; line: Line; food: FoodDetail }
  | { kind: 'nutrition'; food: FoodDetail };

const ACTION: Record<MissingReason, string> = {
  no_food: 'Choose a food',
  no_weight: 'Set a weight',
  no_nutrition: 'Add nutrition',
};

/** A saved line's ingredient name, roughly, for the chooser's search: the text after its amount and unit. */
function lineName(line: Line): string {
  let s = line.text.replace(/\([^)]*\)/g, ' ').replace(/^[\s\d½¼¾⅓⅔./-]+/, '');
  if (line.unit) s = s.replace(new RegExp(`^${line.unit}s?\\.?\\s+`, 'i'), '');
  return s.split(',')[0].trim();
}

/**
 * The recipe Nutrition sheet (#707): per serving, each line's share, and a
 * banner naming every line left out with the action that fixes it. Every
 * figure is the API's (`getRecipe`); after any fix the sheet refetches.
 */
export function NutritionSheet({ api, recipeId, onChanged, onClose }: Props) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function refetch() {
    setUpdating(true);
    try {
      setRecipe(await api.getRecipe(recipeId));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    void refetch();
    if (!libraryFoods.value.length) void loadFoods(api);
  }, [api, recipeId]);

  const foodOf = (id: string): Food | undefined => libraryFoods.value.find((f) => f.id === id);

  async function act(line: Line, reason: MissingReason) {
    setStatus(null);
    if (reason === 'no_food') {
      setOverlay({ kind: 'choose', line });
      return;
    }
    try {
      const food = await api.getFood(line.food_id);
      setOverlay(reason === 'no_weight' ? { kind: 'weight', line, food } : { kind: 'nutrition', food });
    } catch {
      setStatus("Couldn't open that food. Try again.");
    }
  }

  async function fixed() {
    setOverlay(null);
    await refetch();
    onChanged();
  }

  async function matchLine(line: Line, foodId: string) {
    setOverlay(null);
    setUpdating(true);
    try {
      await api.setLineFood(recipeId, line.line_id, foodId);
      await fixed();
    } catch {
      setUpdating(false);
      setStatus("Couldn't save. Try again.");
    }
  }

  if (!recipe) {
    return (
      <Sheet title="Nutrition" onClose={onClose} testId="nutrition-sheet">
        <p role="status">{failed ? "Couldn't load this recipe." : 'Loading…'}</p>
      </Sheet>
    );
  }

  const n = recipe.nutrition;
  const per = n.per_serving;
  const byLine = new Map((n.by_line ?? []).map((l) => [l.line_id, l]));
  const missing = new Map(n.missing.map((m) => [m.line_id, m.reason]));
  const meta = [recipe.servings ? `serves ${recipe.servings}` : '', recipe.source_site].filter(Boolean).join(' · ');
  const left = recipe.lines.filter((l) => missing.has(l.line_id));

  return (
    <>
      <Sheet title={recipe.name} onClose={onClose} tall testId="nutrition-sheet">
        {meta && <p class="hint">{meta}</p>}
        <section class="card" aria-live="polite" data-testid="nutrition-card">
          {updating ? (
            <p class="nutrition-big">Updating…</p>
          ) : per.kcal === null ? (
            <p class="nutrition-big">No nutrition yet</p>
          ) : (
            <>
              <p>
                <span class="nutrition-big">{Math.round(per.kcal)}</span> kcal a serving
                {n.partial && <strong>, partial</strong>}
              </p>
              <p class="hint">
                Protein {Math.round(per.protein_g ?? 0)} g · Carbs {Math.round(per.carbs_g ?? 0)} g · Fat{' '}
                {Math.round(per.fat_g ?? 0)} g
              </p>
            </>
          )}
        </section>

        {left.length > 0 && (
          <div class={n.partial ? 'notice is-warning' : 'notice is-neutral'} data-testid="missing-banner">
            {left.map((l) => {
              const reason = missing.get(l.line_id)!;
              const food = foodOf(l.food_id);
              return (
                <div key={l.line_id} class="missing-item">
                  <p>
                    {reason === 'no_food' && (
                      <>
                        <strong>{l.text}</strong> has no food yet.
                      </>
                    )}
                    {reason === 'no_weight' && (
                      <>
                        <strong>{l.text}</strong> has no weight yet, so it's left out.
                      </>
                    )}
                    {reason === 'no_nutrition' && (
                      <>
                        <strong>{food ? displayName(food) : l.text}</strong> is left out: it has no nutrition yet.
                      </>
                    )}
                  </p>
                  <button type="button" class="text-btn" onClick={() => void act(l, reason)}>
                    {ACTION[reason]}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {status && <p role="status">{status}</p>}

        <h3 class="choice-heading">Ingredients, as the source wrote them</h3>
        <table class="line-table">
          <thead>
            <tr>
              <th scope="col" class="visually-hidden">
                Line
              </th>
              <th scope="col">kcal per serving from each line</th>
            </tr>
          </thead>
          <tbody>
            {recipe.lines.map((l) => {
              const food = foodOf(l.food_id);
              const b = byLine.get(l.line_id);
              const grams = b?.grams ?? l.resolved_grams;
              const under = [
                food ? displayName(food) : '',
                grams !== null && grams !== undefined ? `${Math.round(grams)} g` : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <tr key={l.line_id} data-testid="nutrition-line">
                  <td>
                    <span class="line-source-text">{l.text}</span>
                    {l.optional && <span class="tag">optional</span>}
                    {under && <span class="status-muted line-under">{under}</span>}
                  </td>
                  <td class="line-kcal">
                    {b && typeof b.kcal === 'number' && !l.optional ? Math.round(b.kcal) : <span class="tag">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Sheet>

      {overlay?.kind === 'choose' && (
        <FoodChooser
          line={{ name: lineName(overlay.line), text: overlay.line.text, suggestions: [] }}
          library={libraryFoods.value}
          onClose={() => setOverlay(null)}
          onLeave={() => setOverlay(null)}
          onChoose={(f) => void matchLine(overlay.line, f.id)}
          onCreate={async (name) => {
            try {
              const food = await api.createFood(name);
              keepFood(food);
              await matchLine(overlay.line, food.id);
            } catch {
              setOverlay(null);
              setStatus("Couldn't add that food. Try again.");
            }
          }}
        />
      )}
      {overlay?.kind === 'weight' && (
        <SetWeightSheet
          api={api}
          food={overlay.food}
          unit={overlay.line.unit}
          alsoIn={overlay.food.used_by.filter((r) => r.id !== recipeId).map((r) => r.name)}
          onSaved={(food) => {
            keepFood(food);
            void fixed();
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'nutrition' && (
        <FoodForm
          api={api}
          food={overlay.food}
          origin={{ focusNutrition: true }}
          onSaved={(food) => {
            keepFood(food);
            void fixed();
          }}
          onCancel={() => setOverlay(null)}
        />
      )}
    </>
  );
}
