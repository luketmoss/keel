// #706 In the app: Library's Import, the three routes to the review screen,
// the read failures, review and save, Library's list and delete, and demo mode.
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import App from '../App';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetRecipes } from '../library/recipes-store';
import { fakeApi, previewOf, READ_PREVIEW } from '../test-api';
import { review, savedNotice } from './review-state';

const here = dirname(fileURLToPath(import.meta.url));
const SAVED_PAGE = readFileSync(resolve(here, 'fixtures/saved-page.html'), 'utf-8');
const env = import.meta.env as Record<string, string | undefined>;

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

/** Let fetch, its json() and the state updates after them all run. */
async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

async function openLibrary() {
  window.history.replaceState(null, '', '/#/library');
  render(<App />);
  await settle();
}

async function openSheet() {
  await openLibrary();
  fireEvent.click(screen.getByTestId('import-btn'));
  return screen.getByTestId('import-sheet');
}

async function readLink(url = 'https://example.com/weeknight-lentil-soup') {
  const sheet = await openSheet();
  fireEvent.input(within(sheet).getByLabelText('Recipe link'), { target: { value: url } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Read recipe' }));
  await settle();
}

async function pasteText(text: string) {
  const sheet = await openSheet();
  fireEvent.input(within(sheet).getByLabelText(/Or paste the copied recipe/), { target: { value: text } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Read pasted recipe' }));
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  signIn();
  review.value = null;
  savedNotice.value = null;
  _resetRecipes();
});

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  review.value = null;
  delete env.VITE_FORAGE_API_URL;
});

describe('AC: Library has an Import button, and each route reaches the review screen', () => {
  it('Import is in the Library header only', async () => {
    fakeApi();
    await openLibrary();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Import' })).toBeDefined();
    act(() => {
      window.location.hash = '#/plan';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.queryByTestId('import-btn')).toBeNull();
  });

  it('a link: importRecipe is a dry run POSTed with the token and no hand-set headers', async () => {
    const api = fakeApi();
    await readLink();
    expect(screen.getByTestId('review-screen')).toBeDefined();
    const [call] = api.calls('importRecipe');
    expect(call).toMatchObject({
      method: 'POST',
      access_token: 'tok',
      payload: { url: 'https://example.com/weeknight-lentil-soup', dry_run: true },
      headers: undefined,
    });
  });

  it('a pasted bookmarklet payload and a saved .html file both send what the jsonld route sends', async () => {
    const api = fakeApi();
    const page = new DOMParser().parseFromString(SAVED_PAGE, 'text/html');
    const block = Array.from(page.querySelectorAll('script[type="application/ld+json"]'))[1].textContent!;
    const jsonldRoute = { jsonld: [block], url: 'https://example.com/weeknight-lentil-soup', dry_run: true };

    await pasteText(JSON.stringify({ forage: 1, url: 'https://example.com/weeknight-lentil-soup', blocks: [block] }));
    expect(screen.getByTestId('review-screen')).toBeDefined();
    const fromPaste = screen.getAllByTestId('review-line').map((l) => l.textContent);

    review.value = null;
    await settle();
    fireEvent.click(screen.getByTestId('import-btn'));
    const file = new File([SAVED_PAGE], 'soup.html', { type: 'text/html' });
    fireEvent.change(screen.getByTestId('import-file'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('review-screen')).toBeDefined());
    const fromFile = screen.getAllByTestId('review-line').map((l) => l.textContent);

    const [paste, saved] = api.calls('importRecipe').map((c) => c.payload);
    expect(paste).toEqual(jsonldRoute);
    expect(saved).toEqual(jsonldRoute);
    expect(fromFile).toEqual(fromPaste);
  });

  it('plain text pasted is sent as text', async () => {
    const api = fakeApi();
    await pasteText('Toast\nServes 1\nIngredients\n1 slice bread');
    expect(api.calls('importRecipe')[0].payload).toEqual({
      text: 'Toast\nServes 1\nIngredients\n1 slice bread',
      dry_run: true,
    });
    expect(screen.getByTestId('review-screen')).toBeDefined();
  });
});

describe('AC: read failures', () => {
  const failWith = (code: string) => {
    const api = fakeApi();
    api.answer('importRecipe', () => ({ success: false, error: 'raw API text', code }));
    return api;
  };

  it('blocked shows the open-page route with the bookmarklet', async () => {
    failWith('blocked');
    await readLink();
    expect(screen.getByTestId('import-message').textContent).toContain("That site won't let Forage read the page.");
    expect(screen.getByTestId('bookmarklet').querySelector('a')!.getAttribute('href')).toMatch(/^javascript:/);
    expect(screen.getByRole('button', { name: 'From the open page' }).getAttribute('aria-expanded')).toBe('true');
    expect(document.body.textContent).not.toContain('raw API text');
  });

  it('unreachable offers Try again and the open-page route', async () => {
    const api = failWith('unreachable');
    await readLink();
    expect(screen.getByTestId('import-message').textContent).toContain("Couldn't reach that page.");
    expect(screen.getByRole('button', { name: 'From the open page' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle();
    expect(api.calls('importRecipe')).toHaveLength(2);
  });

  it('no_recipe says so and offers the file and paste route', async () => {
    failWith('no_recipe');
    await readLink();
    expect(screen.getByTestId('import-message').textContent).toBe(
      'No recipe found on that page. Try the saved page, or paste the recipe as text.',
    );
    expect(screen.getByRole('button', { name: 'Choose a file' })).toBeDefined();
    expect(document.activeElement).toBe(screen.getByLabelText(/Or paste the copied recipe/));
  });

  it('bad_url shows under the field', async () => {
    failWith('bad_url');
    await readLink('http://localhost/a');
    expect(screen.getByText("That doesn't look like a web link.")).toBeDefined();
  });

  it('Read recipe is disabled until the field holds an http(s) link', async () => {
    fakeApi();
    const sheet = await openSheet();
    const button = within(sheet).getByRole('button', { name: 'Read recipe' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.input(within(sheet).getByLabelText('Recipe link'), { target: { value: 'ftp://x' } });
    expect(button.disabled).toBe(true);
    fireEvent.input(within(sheet).getByLabelText('Recipe link'), { target: { value: 'https://example.com/r' } });
    expect(button.disabled).toBe(false);
  });
});

describe('AC: the review screen', () => {
  it('lists every line; an unmatched one asks Which food is this?, a to-taste one is not counted', async () => {
    fakeApi();
    await readLink();
    const lines = screen.getAllByTestId('review-line');
    expect(lines).toHaveLength(3);
    expect(lines[0].textContent).toContain('1.5 cup · red lentils');
    expect(within(lines[0]).getByRole('button', { name: 'Which food is this?' })).toBeDefined();
    expect(lines[2].textContent).toContain('To taste, not counted');
    expect(screen.getByRole('region', { name: 'For the pot' })).toBeDefined();
    expect(screen.getByText('2 lines still need a food')).toBeDefined();
  });

  it('a line is matched only by a choice: New food creates one and matches it', async () => {
    const api = fakeApi();
    await readLink();
    fireEvent.click(
      within(screen.getAllByTestId('review-line')[1]).getByRole('button', { name: 'Which food is this?' }),
    );
    const chooser = screen.getByTestId('food-chooser');
    expect(chooser.textContent).toContain('Your library is empty.');
    fireEvent.click(within(chooser).getByRole('button', { name: 'New food: onion' }));
    await settle();
    expect(api.calls('upsertFood').map((c) => c.payload)).toEqual([
      { name: 'onion', kind: 'ingredient', source: 'manual' },
    ]);
    expect(screen.getAllByTestId('review-line')[1].textContent).toContain('✓ onion');
    expect(screen.getByText('1 line still needs a food')).toBeDefined();
  });

  it('Add N new foods creates one food per distinct unmatched name, with only a name', async () => {
    const api = fakeApi();
    api.answer('importRecipe', (p) => {
      if (p.recipe) return { success: true, data: previewOf(p.recipe) };
      const data = JSON.parse(JSON.stringify(READ_PREVIEW));
      data.lines.push({ ...data.lines[1], line_id: 'L4', text: '1 small onion', unit: 'small' });
      return { success: true, data };
    });
    await readLink();
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 new foods' }));
    await settle();
    expect(api.calls('upsertFood').map((c) => c.payload)).toEqual([
      { name: 'red lentils', kind: 'ingredient', source: 'manual' },
      { name: 'onion', kind: 'ingredient', source: 'manual' },
    ]);
    expect(screen.queryByRole('button', { name: /new food/ })).toBeNull();
    expect(screen.queryByText(/still need/)).toBeNull();
    const refresh = api.calls('importRecipe').at(-1)!.payload;
    expect(refresh.dry_run).toBe(true);
    expect(refresh.recipe.lines.map((l: { food_id: string }) => l.food_id)).toEqual(['fd_1', 'fd_2', '', 'fd_2']);
  });

  it('it saves with unmatched lines, and Library lists it as partial', async () => {
    const api = fakeApi();
    await readLink();
    expect(screen.getByTestId('review-nutrition').textContent).toBe(
      'No nutrition yet. Foods get theirs from the library.',
    );
    fireEvent.click(screen.getByTestId('save-recipe'));
    await settle();
    const save = api.calls('importRecipe').at(-1)!.payload;
    expect(save).toMatchObject({
      dry_run: false,
      allow_duplicate: false,
      recipe: { name: 'Weeknight Lentil Soup', servings: 4 },
    });
    expect(save.recipe.lines.map((l: { text: string }) => l.text)).toEqual(READ_PREVIEW.lines.map((l) => l.text));
    await waitFor(() => expect(screen.getAllByTestId('recipe-row')).toHaveLength(1));
    expect(screen.getByTestId('recipe-row').textContent).toContain('Weeknight Lentil Soup');
    expect(screen.getByTestId('recipe-row').textContent).toContain('serves 4 · example.com · partial');
    expect(screen.getByText('Saved Weeknight Lentil Soup')).toBeDefined();
  });

  it('it cannot be saved without servings, nor with every line removed', async () => {
    fakeApi();
    await readLink();
    const save = screen.getByTestId('save-recipe') as HTMLButtonElement;
    fireEvent.input(screen.getByLabelText('Servings'), { target: { value: '' } });
    expect(save.disabled).toBe(true);
    expect(screen.getByText('How many does it serve?')).toBeDefined();
    fireEvent.input(screen.getByLabelText('Servings'), { target: { value: '4' } });
    expect(save.disabled).toBe(false);
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getAllByRole('button', { name: /^Edit / })[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Remove line' }));
      await settle();
    }
    expect(save.disabled).toBe(true);
    expect(screen.getByText('A recipe needs at least one ingredient')).toBeDefined();
  });

  it('a URL already saved shows Already in your library, and saves only after Import again', async () => {
    const api = fakeApi();
    api.answer('importRecipe', (p) => {
      if (p.dry_run === false) {
        return p.allow_duplicate
          ? { success: true, data: { id: 'rc_2', name: 'Weeknight Lentil Soup', lines: [], steps: [] } }
          : { success: false, error: 'x', code: 'duplicate', duplicate_of: { id: 'rc_1', name: 'Lentil Soup' } };
      }
      if (p.recipe) return { success: true, data: previewOf(p.recipe) };
      return { success: true, data: { ...READ_PREVIEW, duplicate_of: { id: 'rc_1', name: 'Lentil Soup' } } };
    });
    await readLink();
    const notice = screen.getByTestId('duplicate-notice');
    expect(notice.textContent).toContain('Already in your library');
    expect(notice.textContent).toContain('Lentil Soup');
    const save = screen.getByTestId('save-recipe') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(within(notice).getByRole('button', { name: 'Import again' }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await settle();
    expect(api.calls('importRecipe').at(-1)!.payload).toMatchObject({ dry_run: false, allow_duplicate: true });
    expect(screen.queryByTestId('review-screen')).toBeNull();
  });

  it('Back after an edit asks before discarding', async () => {
    fakeApi();
    await readLink();
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Soup' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Discard this import?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByTestId('review-screen')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByTestId('review-screen')).toBeNull();
  });
});

describe('AC: Library lists saved recipes and deletes with a confirm', () => {
  function seed(api: ReturnType<typeof fakeApi>) {
    api.recipes.push({
      id: 'rc_1',
      name: 'Beef Stew',
      source_url: 'https://www.example.com/stew',
      source_site: 'example.com',
      servings: 6,
      total_min: 120,
      notes: '',
      created: '2026-10-01T00:00:00Z',
      updated: '',
      nutrition: { per_serving: { kcal: 520.4, protein_g: 30, carbs_g: 20, fat_g: 25 }, missing: [], partial: false },
      partial: false,
      rating: null,
      last_cooked: null,
      has_walkthrough: false,
    });
  }

  it('a recipe shows serves, site and its kcal', async () => {
    const api = fakeApi();
    seed(api);
    await openLibrary();
    expect(screen.getByTestId('recipe-row').textContent).toContain('serves 6 · example.com · 520 kcal');
  });

  it('delete asks, then removes it', async () => {
    const api = fakeApi();
    seed(api);
    await openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'More for Beef Stew' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete recipe' }));
    expect(screen.getByText('Delete Beef Stew?')).toBeDefined();
    expect(screen.getByText('Its ingredients and steps go with it.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    expect(api.calls('deleteRecipe')[0].payload).toEqual({ id: 'rc_1' });
    expect(screen.queryByTestId('recipe-row')).toBeNull();
  });

  it('a recipe used by planned meals is not deleted, and the answer says why', async () => {
    const api = fakeApi();
    seed(api);
    api.answer('deleteRecipe', () => ({
      success: false,
      error: 'x',
      code: 'in_use',
      uses: { plan: ['pl_1', 'pl_2'], log: [] },
    }));
    await openLibrary();
    fireEvent.click(screen.getByRole('button', { name: 'More for Beef Stew' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete recipe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    expect(screen.getByText('Used by 2 planned meals. Remove those first.')).toBeDefined();
    expect(screen.getAllByTestId('recipe-row')).toHaveLength(1);
  });
});

describe('AC: demo mode', () => {
  beforeEach(() => {
    _resetDemoModeCache();
    _resetDemoApi();
    env.VITE_DEMO_MODE = 'true';
  });
  afterEach(() => {
    delete env.VITE_DEMO_MODE;
    _resetDemoModeCache();
    _resetDemoApi();
  });

  it('a URL import shows the bundled sample, saves into memory, and makes no request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    window.history.replaceState(null, '', '/?demo=true#/library');
    render(<App />);
    await settle();
    fireEvent.click(screen.getByTestId('import-btn'));
    fireEvent.input(screen.getByLabelText('Recipe link'), { target: { value: 'https://example.com/anything' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read recipe' }));
    await settle();
    expect(screen.getByTestId('review-screen')).toBeDefined();
    expect(screen.getByTestId('demo-banner')).toBeDefined();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Weeknight Lentil Soup');
    fireEvent.click(screen.getByRole('button', { name: /^Add \d+ new foods$/ }));
    await settle();
    fireEvent.click(screen.getByTestId('save-recipe'));
    await settle();
    await waitFor(() => expect(screen.getAllByTestId('recipe-row')).toHaveLength(1));
    expect(screen.getByTestId('recipe-row').textContent).toContain('Weeknight Lentil Soup');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
