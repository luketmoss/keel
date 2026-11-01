import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ForageApi } from '../api/client';
import type { RecipeSummary } from '../api/types';
import { savedNotice } from '../import/review-state';
import { ConfirmSheet } from '../ui/sheet';
import { deleteRecipe, loadRecipes, recipeMeta, recipes, recipesState } from './recipes-store';

interface Props {
  api: ForageApi;
  /** #704's empty state, kept until a recipe exists. */
  empty: ComponentChildren;
}

function RecipeRow({ recipe, onDelete }: { recipe: RecipeSummary; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const meta = recipeMeta(recipe);
  return (
    <li class="recipe-row" data-testid="recipe-row">
      <div class="recipe-text">
        <span class="recipe-name">{recipe.name}</span>
        {meta && <span class="recipe-meta">{meta}</span>}
      </div>
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

/** Library (#706): the saved recipes, newest first, each with a delete. Opening one is #708. */
export function LibraryScreen({ api, empty }: Props) {
  const [doomed, setDoomed] = useState<RecipeSummary | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void loadRecipes(api);
  }, [api]);

  const list = recipes.value;
  const notice = savedNotice.value ?? status;

  async function confirmDelete() {
    const r = doomed!;
    setDoomed(null);
    setStatus(await deleteRecipe(api, r.id));
  }

  return (
    <>
      {list.length === 0 ? (
        empty
      ) : (
        <ul class="card recipe-list" aria-label="Recipes">
          {list.map((r) => (
            <RecipeRow key={r.id} recipe={r} onDelete={() => setDoomed(r)} />
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
    </>
  );
}
