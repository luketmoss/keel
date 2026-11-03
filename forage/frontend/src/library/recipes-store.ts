// Library's recipes (#706), loaded through the API. Components read the
// signals; this file owns the fetching. #708 adds the search and the sort,
// both done by the API (`getRecipes` `q` and `sort`) and remembered for the session.
import { signal } from '@preact/signals';
import { ApiError, type ForageApi } from '../api/client';
import { quietGate } from '../api/quiet-gate';
import type { RecipeDetail, RecipeSort, RecipeSummary } from '../api/types';
import { shortDate, starsText } from '../cook/format';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const recipes = signal<RecipeSummary[]>([]);
export const recipesState = signal<LoadState>('idle');
/** The search as typed, and the sort chip. */
export const recipeQuery = signal('');
export const recipeSort = signal<RecipeSort>('newest');
/** How many recipes the library holds, from the last load with no search: it decides whether search and sort show. */
export const recipeTotal = signal(0);
/** A search is in flight: the field's helper says "Searching…". */
export const recipesSearching = signal(false);
/** A status line for Library to show, from outside it: log mode's "That recipe isn't in your library." */
export const recipesNotice = signal<string | null>(null);
/** Open this recipe's sheet when Library next shows (log mode's Leave and Close return there). */
export const reopenRecipe = signal<{ id: string; focusCook: boolean } | null>(null);

/** Newest first. */
function newestFirst(list: RecipeSummary[]): RecipeSummary[] {
  return list.slice().sort((a, b) => b.created.localeCompare(a.created));
}

let latest = 0;

/** Counts the rows patched in from a reply, so a refresh that began before one can't undo it (#785). */
let patches = 0;
const gate = quietGate();

/**
 * Load with the current search and sort. A slower, older answer never replaces a newer one. `quiet` is the refresh
 * after a save (#785): the list stays as it is under a failure, and an answer that began before a patch is dropped.
 */
export async function loadRecipes(api: ForageApi, quiet = false): Promise<void> {
  const seq = ++latest;
  const before = patches;
  if (!quiet) gate.cancel();
  const q = recipeQuery.value.trim();
  const sort = recipeSort.value;
  if (!quiet && (recipesState.value === 'idle' || recipesState.value === 'error')) recipesState.value = 'loading';
  if (q) recipesSearching.value = true;
  try {
    const list = await api.getRecipes(q ? { q, sort } : { sort });
    if (seq !== latest) return;
    if (quiet && patches !== before) return;
    recipes.value = sort === 'newest' ? newestFirst(list) : list;
    if (!q) recipeTotal.value = list.length;
    recipesState.value = 'ready';
  } catch {
    if (seq !== latest || quiet) return;
    recipesState.value = 'error';
  } finally {
    if (seq === latest) recipesSearching.value = false;
  }
}

/** Refresh the list after a save, one at a time (#790), without a failure showing: its rating and last cooked are derived (#785). */
export function refreshRecipes(api: ForageApi): Promise<void> {
  return gate.request(() => loadRecipes(api, true));
}

/** Put a recipe as a write answered it into its row, when the list shows it (a search or sort may not). */
export function patchRecipe(detail: RecipeDetail): void {
  // The summary is the detail without its lines, steps and walkthrough.
  const { lines: _lines, steps: _steps, walkthrough: _walkthrough, walkthrough_check: _check, ...summary } = detail;
  if (!recipes.value.some((r) => r.id === summary.id)) return;
  recipes.value = recipes.value.map((r) => (r.id === summary.id ? summary : r));
  patches++;
}

/**
 * Delete a recipe. Answers null when deleted, or the sentence to show: a
 * recipe used by planned or logged meals is not deleted.
 */
export async function deleteRecipe(api: ForageApi, id: string): Promise<string | null> {
  try {
    await api.deleteRecipe(id);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'in_use') {
      const uses = (err.details.uses ?? {}) as { plan?: string[]; log?: string[] };
      const parts: string[] = [];
      const plan = uses.plan?.length ?? 0;
      const log = uses.log?.length ?? 0;
      if (plan) parts.push(`${plan} planned ${plan === 1 ? 'meal' : 'meals'}`);
      if (log) parts.push(`${log} logged ${log === 1 ? 'meal' : 'meals'}`);
      return `Used by ${parts.join(' and ')}. Remove those first.`;
    }
    return "Couldn't delete it. Try again.";
  }
  recipes.value = recipes.value.filter((r) => r.id !== id);
  recipeTotal.value = Math.max(0, recipeTotal.value - 1);
  return null;
}

/** Forget what was loaded (tests and sign-out). */
export function _resetRecipes(): void {
  gate.reset();
  patches = 0;
  recipes.value = [];
  recipesState.value = 'idle';
  recipeQuery.value = '';
  recipeSort.value = 'newest';
  recipeTotal.value = 0;
  recipesSearching.value = false;
  recipesNotice.value = null;
  reopenRecipe.value = null;
}

/** `serves 6 · example.com · 520 kcal`: partial replaces the figure, and nothing shows when none is known. */
export function recipeMeta(r: RecipeSummary): string {
  const parts: string[] = [];
  if (r.servings) parts.push(`serves ${r.servings}`);
  if (r.source_site) parts.push(r.source_site);
  const kcal = kcalText(r);
  if (kcal) parts.push(kcal);
  return parts.join(' · ');
}

/** `520 kcal`, `partial`, or '' when no food has nutrition. */
export function kcalText(r: RecipeSummary): string {
  if (r.partial) return 'partial';
  if (r.nutrition.per_serving.kcal !== null) return `${Math.round(r.nutrition.per_serving.kcal)} kcal`;
  return '';
}

/** A Library row's second line after the stars (#708): ` · cooked Oct 28 · 520 kcal`. */
export function cookedText(r: RecipeSummary): string {
  return r.last_cooked ? `cooked ${shortDate(r.last_cooked)}` : 'never cooked';
}

/** The stars as text with their label, or null for "Not rated". */
export function ratingParts(rating: number | null): { text: string; label: string } | null {
  return rating === null ? null : { text: starsText(rating), label: `${rating} of 5 stars` };
}
