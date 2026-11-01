// The Forage API client (#706): the first, as #704 left it out. Every call is a
// POST with a URLSearchParams body and no hand-set headers, so the browser
// sends no preflight (Apps Script has no doOptions), and carries the user's
// Google access token, never the API key.
import type { Food, ImportInput, ImportPreview, RecipeDetail, RecipeSummary, StructuredRecipe } from './types';

/** A failed call. `code` is the API's (`blocked`, `duplicate`, `in_use`…), or `network` / `unconfigured`. */
export class ApiError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(message: string, code = '', details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/** What the app asks of the API. The demo layer is another implementation of it. */
export interface ForageApi {
  getRecipes(): Promise<RecipeSummary[]>;
  getFoods(): Promise<Food[]>;
  createFood(name: string): Promise<Food>;
  deleteRecipe(id: string): Promise<void>;
  /** A dry run: the preview, nothing written. */
  previewImport(input: ImportInput, signal?: AbortSignal): Promise<ImportPreview>;
  saveImport(recipe: StructuredRecipe, allowDuplicate: boolean): Promise<RecipeDetail>;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

export function createLiveApi(token: string, url = import.meta.env.VITE_FORAGE_API_URL): ForageApi {
  async function call<T>(action: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
    if (!url) throw new ApiError('The Forage API is not configured', 'unconfigured');
    const body = new URLSearchParams({ action, access_token: token });
    if (payload !== undefined) body.set('payload', JSON.stringify(payload));
    let envelope: Envelope<T>;
    try {
      const res = await fetch(url, { method: 'POST', body, signal });
      envelope = await res.json();
    } catch (err) {
      if (signal?.aborted) throw err;
      throw new ApiError('Network error', 'network');
    }
    if (!envelope.success) {
      const details: Record<string, unknown> = { ...envelope };
      delete details.success;
      throw new ApiError(envelope.error ?? 'Request failed', envelope.code ?? '', details);
    }
    return envelope.data as T;
  }

  return {
    getRecipes: () => call<RecipeSummary[]>('getRecipes'),
    getFoods: () => call<Food[]>('getFoods'),
    createFood: (name) => call<Food>('upsertFood', { name, kind: 'ingredient', source: 'manual' }),
    deleteRecipe: async (id) => {
      await call('deleteRecipe', { id });
    },
    previewImport: (input, signal) => call<ImportPreview>('importRecipe', { ...input, dry_run: true }, signal),
    saveImport: (recipe, allowDuplicate) =>
      call<RecipeDetail>('importRecipe', { recipe, dry_run: false, allow_duplicate: allowDuplicate }),
  };
}
