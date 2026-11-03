// Library's foods (#707), loaded through the API. Components read the
// signals; this file owns the fetching. Which half of Library shows (Recipes |
// Foods) is remembered for the session here too, so the shell's header button
// can follow it.
import { signal } from '@preact/signals';
import { ApiError, type ForageApi } from '../api/client';
import type { Food } from '../api/types';
import type { LoadState } from './recipes-store';

export type LibrarySection = 'recipes' | 'foods';

export const librarySection = signal<LibrarySection>('recipes');
export const libraryFoods = signal<Food[]>([]);
export const foodsState = signal<LoadState>('idle');
/** "Added 12 foods", "Deleted Garlic": the Foods list's status line, four seconds. */
export const foodsNotice = signal<string | null>(null);
/** The header's "Add food" was tapped: Library opens the Add a food sheet. */
export const addFoodRequested = signal(false);

let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export function showFoodsNotice(text: string): void {
  foodsNotice.value = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (foodsNotice.value = null), 4000);
}

/**
 * `quiet` is the refresh after a save (#785): a failure leaves the list as it is, and the state is left alone.
 */
export async function loadFoods(api: ForageApi, quiet = false): Promise<void> {
  if (!quiet && foodsState.value !== 'ready') foodsState.value = 'loading';
  try {
    libraryFoods.value = await api.getFoods();
    foodsState.value = 'ready';
  } catch {
    if (!quiet) foodsState.value = 'error';
  }
}

/** Put a saved food into the list, replacing the old copy. */
export function keepFood(food: Food): void {
  const rest = libraryFoods.value.filter((f) => f.id !== food.id);
  libraryFoods.value = [...rest, food];
}

/**
 * Delete a food. Answers null when deleted, or the sentence to show: a food a
 * recipe uses is refused with the recipes named, at most three.
 */
export async function deleteFood(api: ForageApi, id: string): Promise<string | null> {
  try {
    await api.deleteFood(id);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'in_use') {
      const uses = (err.details.uses ?? {}) as { recipes?: { name: string }[]; trips?: string[] };
      const names = (uses.recipes ?? []).map((r) => r.name);
      if (!names.length) return 'It is on a shopping list. Remove it from the list first.';
      return `Used by ${namesList(names)}. Remove it from those first.`;
    }
    return "Couldn't delete it. Try again.";
  }
  libraryFoods.value = libraryFoods.value.filter((f) => f.id !== id);
  return null;
}

/** `Beef Stew`, `Beef Stew and Chili`, `A, B, C and 2 more`. */
export function namesList(names: string[]): string {
  if (names.length <= 3) {
    return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

/** Forget what was loaded (tests and sign-out). */
export function _resetFoods(): void {
  libraryFoods.value = [];
  foodsState.value = 'idle';
  foodsNotice.value = null;
  librarySection.value = 'recipes';
}
