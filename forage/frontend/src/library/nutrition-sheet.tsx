import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { Cook, Food, FoodDetail, MissingReason, RecipeDetail } from '../api/types';
import { CookChoice } from '../cook/cook-choice';
import { readRateSkips, skipRating } from '../cook/cook-store';
import { shortDate } from '../cook/format';
import { Stars } from '../cook/stars';
import { FoodChooser } from '../import/food-chooser';
import { MoreNutrition } from '../ui/more-nutrition';
import { Sheet } from '../ui/sheet';
import { FoodForm } from './food-form';
import { displayName } from './food-math';
import { keepFood, libraryFoods, loadFoods } from './foods-store';
import { HistorySection, RateCard, StepsSection } from './recipe-cooks';
import { SetWeightSheet } from './set-weight-sheet';

interface Props {
  api: ForageApi;
  recipeId: string;
  /** The recipe's figures changed: Library's list refreshes. */
  /** A change was saved: the recipe as it now is, when the sheet has it, for the list behind to patch (#785). */
  onChanged: (recipe?: RecipeDetail) => void;
  onClose: () => void;
  /** #708: coming back from log mode, the Cook button takes focus. */
  focusCook?: boolean;
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
 * The recipe sheet: #707's Nutrition sheet (per serving, each line's share, and a
 * banner naming every line left out with the action that fixes it), which #708
 * extends with the rating, "How was it?", Cook, the steps and the cook history.
 * Every figure is the API's (`getRecipe`, `getCooks`); after any change the sheet refetches.
 */
export function NutritionSheet({ api, recipeId, onChanged, onClose, focusCook }: Props) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [cooks, setCooks] = useState<Cook[]>([]);
  const [busyCook, setBusyCook] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [skipped, setSkipped] = useState<string[]>(() => readRateSkips());
  /** The cook the "How was it?" card is for, kept once rated so the card can take a note. */
  const [rateFor, setRateFor] = useState<Cook | null>(null);

  async function refetch(): Promise<RecipeDetail | null> {
    setUpdating(true);
    try {
      // The history is not worth failing the sheet over: without it, the rest still shows.
      const [r, c] = await Promise.all([api.getRecipe(recipeId), api.getCooks(recipeId).catch(() => null)]);
      setRecipe(r);
      if (c) setCooks(c);
      setFailed(false);
      return r;
    } catch {
      setFailed(true);
      return null;
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
    onChanged((await refetch()) ?? undefined);
  }

  /** Rate, re-rate, note or clear a cook; the sheet and Library's row refresh after. */
  async function saveCook(cook: Cook, fields: { rating?: number | null; note?: string }) {
    setBusyCook(cook.id);
    try {
      await api.saveCook({ id: cook.id, ...fields });
      const [r, c] = await Promise.all([api.getRecipe(recipeId), api.getCooks(recipeId)]);
      setRecipe(r);
      setCooks(c);
      onChanged(r);
    } finally {
      setBusyCook(null);
    }
  }

  async function rateFromHistory(cook: Cook, rating: number | null) {
    setStatus(null);
    try {
      await saveCook(cook, { rating });
    } catch {
      setStatus("Couldn't save the rating.");
    }
  }

  async function removeCook(cook: Cook) {
    setStatus(null);
    setBusyCook(cook.id);
    try {
      await api.deleteCook(cook.id);
      onChanged((await refetch()) ?? undefined);
    } catch {
      setStatus("Couldn't remove the cook. Try again.");
    } finally {
      setBusyCook(null);
    }
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
  const stepCount = recipe.steps.filter((s) => s.text.trim()).length;
  const meta = [
    recipe.servings ? `serves ${recipe.servings}` : '',
    stepCount ? `${stepCount} ${stepCount === 1 ? 'step' : 'steps'}` : '',
    recipe.last_cooked ? `last cooked ${shortDate(recipe.last_cooked)}` : 'never cooked',
  ]
    .filter(Boolean)
    .join(' · ');
  const left = recipe.lines.filter((l) => missing.has(l.line_id));
  const unrated = recipe.unrated_cook_id ? cooks.find((c) => c.id === recipe.unrated_cook_id) : undefined;
  const rateCook = rateFor ?? (unrated && !skipped.includes(unrated.id) ? unrated : null);

  return (
    <>
      <Sheet title={recipe.name} onClose={onClose} tall testId="nutrition-sheet">
        <div class="recipe-title-block">
          {recipe.source_site && <p class="site-label">{recipe.source_site}</p>}
          <p class="hint" data-testid="recipe-sheet-meta">
            {busyCook ? 'Updating…' : <Stars rating={recipe.rating} />}
            {` · ${meta}`}
          </p>
        </div>
        {rateCook && (
          <RateCard
            key={rateCook.id}
            cook={rateCook}
            onSave={async (fields) => {
              setRateFor(rateCook);
              await saveCook(rateCook, fields);
            }}
            onNotNow={() => {
              skipRating(rateCook.id);
              setSkipped(readRateSkips());
              setRateFor(null);
            }}
          />
        )}
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
          {per.kcal !== null && (
            <MoreNutrition
              values={per}
              fat={per.fat_g}
              carbs={per.carbs_g}
              rounding="whole"
              unknown={n.per_serving_unknown}
              atLeastNote="At least: some ingredients don't have this one."
              noneText="None of the ingredients has sodium, fiber or the rest yet."
            />
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

        <div class="cook-cta">
          <button
            type="button"
            class="btn btn-primary btn-block"
            onClick={() => setChoosing(true)}
            data-autofocus={focusCook ? true : undefined}
            data-testid="cook-btn"
          >
            Cook
          </button>
          <p class="hint">
            {!recipe.has_walkthrough
              ? "No walkthrough yet. Cook it in log mode: the source's steps as a checklist."
              : recipe.walkthrough_ok === false
                ? 'The walkthrough needs an update. Log mode still works.'
                : 'A walkthrough is ready.'}
          </p>
        </div>

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

        <StepsSection steps={recipe.steps} />
        <HistorySection
          cooks={cooks}
          busy={busyCook}
          onRate={(c, r) => void rateFromHistory(c, r)}
          onRemove={(c) => void removeCook(c)}
        />
      </Sheet>

      {choosing && <CookChoice recipe={recipe} onClose={() => setChoosing(false)} />}

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
