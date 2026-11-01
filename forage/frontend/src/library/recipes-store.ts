// Library's recipes (#706), loaded through the API. Components read the
// signals; this file owns the fetching.
import { signal } from '@preact/signals';
import { ApiError, type ForageApi } from '../api/client';
import type { RecipeSummary } from '../api/types';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export const recipes = signal<RecipeSummary[]>([]);
export const recipesState = signal<LoadState>('idle');

/** Newest first. */
function newestFirst(list: RecipeSummary[]): RecipeSummary[] {
  return list.slice().sort((a, b) => b.created.localeCompare(a.created));
}

export async function loadRecipes(api: ForageApi): Promise<void> {
  if (recipesState.value === 'idle' || recipesState.value === 'error') recipesState.value = 'loading';
  try {
    recipes.value = newestFirst(await api.getRecipes());
    recipesState.value = 'ready';
  } catch {
    recipesState.value = 'error';
  }
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
  return null;
}

/** Forget what was loaded (tests and sign-out). */
export function _resetRecipes(): void {
  recipes.value = [];
  recipesState.value = 'idle';
}

/** `serves 6 · example.com · 520 kcal`: partial replaces the figure, and nothing shows when none is known. */
export function recipeMeta(r: RecipeSummary): string {
  const parts: string[] = [];
  if (r.servings) parts.push(`serves ${r.servings}`);
  if (r.source_site) parts.push(r.source_site);
  if (r.partial) parts.push('partial');
  else if (r.nutrition.per_serving.kcal !== null) parts.push(`${Math.round(r.nutrition.per_serving.kcal)} kcal`);
  return parts.join(' · ');
}
