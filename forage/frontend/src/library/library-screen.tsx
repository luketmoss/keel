import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { BarcodeLookup, Food, RecipeSummary } from '../api/types';
import { savedNotice } from '../import/review-state';
import { ConfirmSheet, Sheet } from '../ui/sheet';
import { BarcodeSheet } from './barcode-sheet';
import { FoodForm, type FoodFormOrigin } from './food-form';
import { displayName } from './food-math';
import { FoodSheet } from './food-sheet';
import { FoodsList } from './foods-list';
import {
  addFoodRequested,
  foodsState,
  keepFood,
  libraryFoods,
  librarySection,
  loadFoods,
  showFoodsNotice,
} from './foods-store';
import { NutritionSheet } from './nutrition-sheet';
import { deleteRecipe, loadRecipes, recipeMeta, recipes, recipesState } from './recipes-store';
import { StarterSheet, starterNotice } from './starter-sheet';

interface Props {
  api: ForageApi;
  /** #704's empty state, kept until a recipe exists. */
  empty: ComponentChildren;
  /** #704's Library icon, for the Foods empty state. */
  icon: () => ComponentChildren;
}

function RecipeRow({ recipe, onOpen, onDelete }: { recipe: RecipeSummary; onOpen: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const meta = recipeMeta(recipe);
  return (
    <li class="recipe-row" data-testid="recipe-row">
      <button type="button" class="recipe-text recipe-open" onClick={onOpen}>
        <span class="recipe-name">{recipe.name}</span>
        {meta && <span class="recipe-meta">{meta}</span>}
      </button>
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

type Overlay =
  | { kind: 'add' }
  | { kind: 'barcode' }
  | { kind: 'starter'; all: boolean }
  | { kind: 'form'; food: Partial<Food>; origin: FoodFormOrigin }
  | { kind: 'food'; id: string }
  | { kind: 'nutrition'; recipeId: string };

/** The "Add a food" sheet's three routes. */
function AddFoodSheet({ onPick, onClose }: { onPick: (o: Overlay) => void; onClose: () => void }) {
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
  const section = librarySection.value;

  useEffect(() => {
    void loadRecipes(api);
    void loadFoods(api);
  }, [api]);

  useEffect(() => {
    if (addFoodRequested.value) {
      addFoodRequested.value = false;
      setOverlay({ kind: 'add' });
    }
  }, [addFoodRequested.value]);

  const list = recipes.value;
  const notice = savedNotice.value ?? status;

  async function confirmDelete() {
    const r = doomed!;
    setDoomed(null);
    setStatus(await deleteRecipe(api, r.id));
  }

  function saved(food: Food) {
    keepFood(food);
    setOverlay(null);
    showFoodsNotice(`Saved ${displayName(food)}`);
  }

  return (
    <>
      <div class="segmented" role="group" aria-label="Library">
        <button
          type="button"
          class="segment"
          aria-pressed={section === 'recipes'}
          onClick={() => (librarySection.value = 'recipes')}
        >
          Recipes ({list.length})
        </button>
        <button
          type="button"
          class="segment"
          aria-pressed={section === 'foods'}
          onClick={() => (librarySection.value = 'foods')}
          data-testid="foods-tab"
        >
          Foods ({libraryFoods.value.length})
        </button>
      </div>

      {section === 'recipes' ? (
        <>
          {list.length === 0 ? (
            empty
          ) : (
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
          )}
          {notice && (
            <p class="library-status" role="status">
              {notice}
            </p>
          )}
          {recipesState.value === 'error' && list.length === 0 && (
            <p class="library-status" role="status">
              Couldn't load your recipes.
            </p>
          )}
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

      {doomed && (
        <ConfirmSheet
          title={`Delete ${doomed.name}?`}
          message="Its ingredients and steps go with it."
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
            showFoodsNotice(starterNotice(result));
            void loadFoods(api);
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
          onEdit={(food, focusNutrition) => setOverlay({ kind: 'form', food, origin: { focusNutrition } })}
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
          onChanged={() => void loadRecipes(api)}
          onClose={() => setOverlay(null)}
        />
      )}
    </>
  );
}
