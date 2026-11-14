import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { BarcodeLookup, Food, RecipeSort, RecipeSummary } from '../api/types';
import { Stars } from '../cook/stars';
import { savedNotice } from '../import/review-state';
import { ConfirmSheet, Sheet } from '../ui/sheet';
import { BarcodeSheet } from './barcode-sheet';
import { FoodForm, type FoodFormOrigin } from './food-form';
import { displayName } from './food-math';
import { FoodSheet } from './food-sheet';
import { FoodsList } from './foods-list';
import {
  addFoodRequested,
  scanRequested,
  foodsKind,
  foodsState,
  keepFood,
  libraryFoods,
  librarySection,
  loadFoods,
  refreshFoods,
  showFoodsNotice,
} from './foods-store';
import { NutritionSheet } from './nutrition-sheet';
import {
  cookedText,
  deleteRecipe,
  kcalText,
  loadRecipes,
  patchRecipe,
  refreshRecipes,
  recipeQuery,
  recipeSort,
  recipeTotal,
  recipes,
  recipesNotice,
  recipesSearching,
  recipesState,
  reopenRecipe,
} from './recipes-store';
import { StarterSheet, starterNotice } from './starter-sheet';
import { UsualEditor } from './usual-editor';
import { UsualsList } from './usuals-list';
import {
  createUsual,
  freshUsualId,
  keepUsual,
  loadUsuals,
  newUsualRequested,
  usuals,
  usualsState,
} from './usuals-store';
import { ComboSheet } from './combo-sheet';
import { CombosSection } from './combos-section';
import { dropCombo, loadCombos } from './combos-store';
import { localDate } from '../cook/format';
import type { Combo } from '../api/types';
import { showToast } from '../ui/toast';

interface Props {
  api: ForageApi;
  /** #704's empty state, kept until a recipe exists. */
  empty: ComponentChildren;
  /** #704's Library icon, for the Foods empty state. */
  icon: () => ComponentChildren;
}

function RecipeRow({ recipe, onOpen, onDelete }: { recipe: RecipeSummary; onOpen: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const kcal = kcalText(recipe);
  return (
    <li class="recipe-row" data-testid="recipe-row">
      <button type="button" class="recipe-text recipe-open" onClick={onOpen}>
        <span class="recipe-name">{recipe.name}</span>
        <span class="recipe-meta" data-testid="recipe-meta">
          <Stars rating={recipe.rating} />
          {` · ${cookedText(recipe)}`}
          {kcal && ` · ${kcal}`}
        </span>
        {recipe.matched_line && (
          <span class="recipe-meta status-muted" data-testid="matched-line">
            has {recipe.matched_line}
          </span>
        )}
      </button>
      {recipe.unrated_cook_id && (
        <span class="rate-chip" data-testid="rate-chip">
          Rate it
        </span>
      )}
      <div class="account">
        <button
          type="button"
          class="icon-btn"
          aria-label={`More for ${recipe.name}`}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          …
        </button>
        {menu && (
          <div class="account-menu" role="menu">
            <button
              type="button"
              class="account-signout danger-text"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onDelete();
              }}
            >
              Delete recipe
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** The search field shows once the library holds this many recipes; the sort chips from SORT_FROM. */
const SEARCH_FROM = 8;
const SORT_FROM = 2;
const SORTS: { id: RecipeSort; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'name', label: 'Name' },
  { id: 'rating', label: 'Rating' },
  { id: 'last_cooked', label: 'Last cooked' },
];

export type LibraryOverlay = Overlay;
type Overlay =
  | { kind: 'add' }
  | { kind: 'barcode'; camera?: boolean }
  | { kind: 'starter'; all: boolean }
  | { kind: 'form'; food: Partial<Food>; origin: FoodFormOrigin }
  | { kind: 'food'; id: string }
  | { kind: 'nutrition'; recipeId: string; focusCook?: boolean };

/** The "Add a food" sheet's three routes. */
export function AddFoodSheet({ onPick, onClose }: { onPick: (o: Overlay) => void; onClose: () => void }) {
  const routes: { title: string; line: string; icon: string; to: Overlay }[] = [
    { title: 'Scan or enter a barcode', line: 'Looks it up on Open Food Facts.', icon: '▥', to: { kind: 'barcode' } },
    {
      title: 'Type from a label',
      line: 'For packaged foods, or anything you know the numbers for.',
      icon: '✎',
      to: { kind: 'form', food: { kind: 'packaged' }, origin: { fromLabel: true } },
    },
    {
      title: 'Choose from the starter list',
      line: 'About 75 pantry staples, with nutrition and weights.',
      icon: '☰',
      to: { kind: 'starter', all: false },
    },
  ];
  return (
    <Sheet title="Add a food" onClose={onClose} testId="add-food">
      <ul class="choice-list">
        {routes.map((r) => (
          <li key={r.title}>
            <button type="button" class="add-route" onClick={() => onPick(r.to)}>
              <span class="add-route-icon" aria-hidden="true">
                {r.icon}
              </span>
              <span class="recipe-text">
                <span class="recipe-name">{r.title}</span>
                <span class="recipe-meta">{r.line}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** Library (#706, #707): Recipes | Foods. A recipe row opens its Nutrition sheet; a food row its food sheet. */
export function LibraryScreen({ api, empty, icon }: Props) {
  const [doomed, setDoomed] = useState<RecipeSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  /** #887: the usual open in the editor, and whether it opens with the food search up (a new one). */
  const [editing, setEditing] = useState<{ id: string; search: boolean } | null>(null);
  /** #888: the combo open in its sheet. */
  const [combo, setCombo] = useState<Combo | null>(null);
  const section = librarySection.value;

  useEffect(() => {
    freshUsualId.value = null;
    void loadRecipes(api);
    void loadFoods(api);
    void loadUsuals(api);
    void loadCombos(api);
  }, [api]);

  // #887: the header's ＋ New usual.
  useEffect(() => {
    if (!newUsualRequested.value) return;
    newUsualRequested.value = false;
    createUsual(api).then(
      (u) => setEditing({ id: u.id, search: true }),
      () => showToast("Couldn't start a new usual. Try again."),
    );
  }, [newUsualRequested.value]);

  // #708: log mode's Leave and Close come back to the recipe's sheet.
  useEffect(() => {
    const again = reopenRecipe.value;
    if (again) {
      reopenRecipe.value = null;
      librarySection.value = 'recipes';
      setOverlay({ kind: 'nutrition', recipeId: again.id, focusCook: again.focusCook });
    }
  }, [reopenRecipe.value]);

  // The search runs 250 ms after the last keystroke.
  const [typed, setTyped] = useState(recipeQuery.value);
  useEffect(() => {
    if (typed.trim() === recipeQuery.value.trim()) {
      recipeQuery.value = typed;
      return;
    }
    const t = setTimeout(() => {
      recipeQuery.value = typed;
      void loadRecipes(api);
    }, 250);
    return () => clearTimeout(t);
  }, [typed]);

  function chooseSort(sort: RecipeSort) {
    if (sort === recipeSort.value) return;
    recipeSort.value = sort;
    void loadRecipes(api);
  }

  function clearSearch() {
    setTyped('');
    recipeQuery.value = '';
    void loadRecipes(api);
  }

  useEffect(() => {
    if (addFoodRequested.value) {
      addFoodRequested.value = false;
      setOverlay({ kind: 'add' });
    }
  }, [addFoodRequested.value]);

  useEffect(() => {
    if (scanRequested.value) {
      scanRequested.value = false;
      setOverlay({ kind: 'barcode', camera: true });
    }
  }, [scanRequested.value]);

  const list = recipes.value;
  const notice = savedNotice.value ?? status ?? recipesNotice.value;
  const total = recipeTotal.value;
  const q = recipeQuery.value.trim();

  async function confirmDelete() {
    const r = doomed!;
    setDoomed(null);
    setStatus(await deleteRecipe(api, r.id));
  }

  function saved(food: Food) {
    keepFood(food);
    foodsKind.value = food.kind === 'packaged' ? 'packaged' : 'ingredient';
    setOverlay(null);
    showFoodsNotice(`Saved ${displayName(food)}`);
  }

  return (
    <>
      {editing && section === 'usuals' ? (
        <UsualEditor
          key={editing.id}
          api={api}
          id={editing.id}
          openSearch={editing.search}
          onBack={() => setEditing(null)}
          onDeleted={() => setEditing(null)}
        />
      ) : (
        <>
          <div class="segmented" role="group" aria-label="Library">
            <button
              type="button"
              class="segment"
              aria-pressed={section === 'foods'}
              onClick={() => (librarySection.value = 'foods')}
              data-testid="foods-tab"
            >
              Foods ({libraryFoods.value.length})
            </button>
            <button
              type="button"
              class="segment"
              aria-pressed={section === 'usuals'}
              onClick={() => (librarySection.value = 'usuals')}
              data-testid="usuals-tab"
            >
              Usuals{usualsState.value === 'ready' ? ` (${usuals.value.length})` : ''}
            </button>
            <button
              type="button"
              class="segment"
              aria-pressed={section === 'recipes'}
              onClick={() => (librarySection.value = 'recipes')}
            >
              Recipes ({total})
            </button>
          </div>

          {section === 'recipes' ? (
            <>
              {total >= SEARCH_FROM && (
                <div class="list-search">
                  <label class="visually-hidden" for="recipe-search">
                    Search recipes
                  </label>
                  <input
                    id="recipe-search"
                    class="field"
                    type="search"
                    placeholder="Search recipes"
                    value={typed}
                    onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
                    data-testid="recipe-search"
                  />
                  <span class="hint" role="status">
                    {recipesSearching.value ? 'Searching…' : ''}
                  </span>
                </div>
              )}
              {total >= SORT_FROM && (
                <div class="chip-row sort-chips" role="group" aria-label="Sort recipes">
                  {SORTS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      class="chip"
                      aria-pressed={recipeSort.value === o.id}
                      onClick={() => chooseSort(o.id)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {list.length > 0 ? (
                <ul class="card recipe-list" aria-label="Recipes">
                  {list.map((r) => (
                    <RecipeRow
                      key={r.id}
                      recipe={r}
                      onOpen={() => setOverlay({ kind: 'nutrition', recipeId: r.id })}
                      onDelete={() => setDoomed(r)}
                    />
                  ))}
                </ul>
              ) : q && recipesState.value === 'ready' ? (
                <div class="library-status" data-testid="no-match">
                  <p>No recipe matches "{q}".</p>
                  <button type="button" class="text-btn" onClick={clearSearch}>
                    Clear search
                  </button>
                </div>
              ) : recipesState.value === 'error' ? null : (
                empty
              )}
              {notice && (
                <p class="library-status" role="status">
                  {notice}
                </p>
              )}
              {recipesState.value === 'error' && (
                <div class="library-status danger-text" role="status">
                  <p>Couldn't load your recipes.</p>
                  <button type="button" class="text-btn" onClick={() => void loadRecipes(api)}>
                    Try again
                  </button>
                </div>
              )}
            </>
          ) : section === 'usuals' ? (
            <>
              <UsualsList
                onOpen={(id) => setEditing({ id, search: false })}
                onRetry={() => {
                  usualsState.value = 'loading';
                  void loadUsuals(api);
                }}
              />
              <CombosSection
                onOpen={setCombo}
                onRetry={() => void loadCombos(api)}
                onShowHidden={() => {
                  api.unhideCombos().then(
                    () => void loadCombos(api),
                    () => showToast("Couldn't show them. Try again."),
                  );
                }}
              />
            </>
          ) : (
            <FoodsList
              icon={icon}
              onOpen={(id) => setOverlay({ kind: 'food', id })}
              onAddNamed={(name) =>
                setOverlay({ kind: 'form', food: { kind: 'ingredient', name }, origin: { fromLabel: true } })
              }
              onAddStarter={() => setOverlay({ kind: 'starter', all: true })}
              onAddFood={() => setOverlay({ kind: 'add' })}
              onRetry={() => {
                foodsState.value = 'loading';
                void loadFoods(api);
              }}
            />
          )}
        </>
      )}

      {combo && (
        <ComboSheet
          api={api}
          combo={combo}
          foods={new Map(libraryFoods.value.map((f) => [f.id, f]))}
          today={localDate()}
          onSaved={(usual) => {
            keepUsual(usual);
            freshUsualId.value = usual.id;
            dropCombo(combo.key);
            setCombo(null);
            void loadCombos(api);
            showToast(`Saved ${usual.name} to your usuals`);
          }}
          onHidden={(c) => {
            dropCombo(c.key);
            setCombo(null);
            void loadCombos(api);
            showToast("Hidden. It won't be suggested again.", {
              label: 'Undo',
              run: () => {
                api.unhideCombos([c.key]).then(
                  () => void loadCombos(api),
                  () => showToast("Couldn't undo. Try again."),
                );
              },
            });
          }}
          onClose={() => setCombo(null)}
        />
      )}
      {doomed && (
        <ConfirmSheet
          title={`Delete ${doomed.name}?`}
          message="Its ingredients, steps and cook history go with it."
          confirm="Delete"
          cancel="Cancel"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDoomed(null)}
        />
      )}
      {overlay?.kind === 'add' && <AddFoodSheet onPick={setOverlay} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'barcode' && (
        <BarcodeSheet
          api={api}
          startCamera={overlay.camera}
          onFound={(food: Partial<Food>, lookup: BarcodeLookup) =>
            setOverlay({ kind: 'form', food: { ...food, id: undefined }, origin: { lookup } })
          }
          onTypeIt={(barcode) =>
            setOverlay({ kind: 'form', food: { kind: 'packaged', barcode }, origin: { fromLabel: true } })
          }
          onOpen={(id) => setOverlay({ kind: 'food', id })}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'starter' && (
        <StarterSheet
          api={api}
          selectAll={overlay.all}
          onAdded={(result) => {
            setOverlay(null);
            foodsKind.value = 'ingredient';
            showFoodsNotice(starterNotice(result));
            void refreshFoods(api);
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'form' && (
        <FoodForm
          api={api}
          food={overlay.food}
          origin={overlay.origin}
          onSaved={saved}
          onCancel={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'food' && (
        <FoodSheet
          api={api}
          id={overlay.id}
          onEdit={(food, focusNutrition, focusExtras) =>
            setOverlay({ kind: 'form', food, origin: { focusNutrition, focusExtras } })
          }
          onDeleted={(name) => {
            setOverlay(null);
            showFoodsNotice(`Deleted ${name}`);
          }}
          onClose={() => setOverlay(null)}
        />
      )}
      {overlay?.kind === 'nutrition' && (
        <NutritionSheet
          api={api}
          recipeId={overlay.recipeId}
          focusCook={overlay.focusCook}
          onChanged={(recipe) => {
            if (recipe) patchRecipe(recipe);
            void refreshRecipes(api);
          }}
          onClose={() => setOverlay(null)}
        />
      )}
    </>
  );
}
