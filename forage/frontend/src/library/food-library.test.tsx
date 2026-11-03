// #707 in the app: the Foods list, the three add routes, the food form's
// per-serving arithmetic and Open Food Facts check, the food sheet's delete,
// the recipe Nutrition sheet and "Set a weight", starter foods in the chooser,
// the demo layer, and the stylesheet's 44px and 375px rules.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import App from '../App';
import { ApiError, type ForageApi } from '../api/client';
import type { BarcodeLookup, Food, FoodDetail, RecipeDetail } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { createDemoApi } from '../demo/demo-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { FoodChooser } from '../import/food-chooser';
import { review, savedNotice } from '../import/review-state';
import { readGlobalCss, rule } from '../test-css';
import { fakeApi } from '../test-api';
import { BarcodeSheet } from './barcode-sheet';
import { FoodForm } from './food-form';
import { parseWeight, per100, perServing } from './food-math';
import { FoodSheet } from './food-sheet';
import { _resetFoods, libraryFoods } from './foods-store';
import { NutritionSheet } from './nutrition-sheet';
import { _resetRecipes } from './recipes-store';

const env = import.meta.env as Record<string, string | undefined>;

async function settle() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

function food(over: Partial<Food>): Food {
  return {
    id: 'fd_1',
    name: 'Food',
    kind: 'ingredient',
    brand: '',
    category: '',
    kcal_100g: null,
    protein_100g: null,
    carbs_100g: null,
    fat_100g: null,
    servings_json: null,
    source: 'manual',
    created: '2026-11-01T00:00:00Z',
    updated: '2026-11-01T00:00:00Z',
    ...over,
  };
}

/** A ForageApi whose every method is a mock; a test fills in the ones it uses. */
function stubApi(over: Partial<ForageApi> = {}): ForageApi {
  const missing = () => Promise.reject(new Error('not stubbed'));
  const base = Object.fromEntries(
    [
      'getRecipes',
      'getFoods',
      'createFood',
      'deleteRecipe',
      'previewImport',
      'saveImport',
      'getFood',
      'saveFood',
      'deleteFood',
      'setFoodWeight',
      'lookupBarcode',
      'getStarterFoods',
      'addStarterFoods',
      'getRecipe',
      'setLineFood',
      'getCooks',
      'saveCook',
      'deleteCook',
      'logFood',
    ].map((k) => [k, vi.fn(missing)]),
  );
  return { ...base, ...over } as unknown as ForageApi;
}

beforeEach(() => {
  localStorage.clear();
  signIn();
  review.value = null;
  savedNotice.value = null;
  _resetRecipes();
  _resetFoods();
  _resetDemoApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete env.VITE_DEMO_MODE;
  _resetDemoModeCache();
  window.history.replaceState(null, '', '/');
});

describe('the arithmetic', () => {
  it('5 g protein in a 30 g serving stores 16.67 and shows 5 again', () => {
    expect(per100(5, 30)).toBe(16.67);
    expect(perServing(16.67, 30)).toBe(5);
  });

  it('"Set a weight" takes 425, 425 g or 15 oz, above 0 and up to 5,000 g', () => {
    expect(parseWeight('425')).toBe(425);
    expect(parseWeight('425 g')).toBe(425);
    expect(parseWeight('15 oz')).toBe(425.2);
    expect(parseWeight('15oz')).toBe(425.2);
    for (const bad of ['', '0', '-3', '6000', 'lots', '15 lb']) expect(parseWeight(bad), bad).toBeNull();
  });
});

describe('Library → Foods', () => {
  async function openFoods(api = fakeApi()) {
    window.history.replaceState(null, '', '/#/library');
    render(<App />);
    await settle();
    fireEvent.click(screen.getByTestId('foods-tab'));
    await settle();
    return api;
  }

  it('the switch is pressed state, and the header button follows it', async () => {
    await openFoods();
    expect(screen.getByTestId('foods-tab').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByTestId('import-btn')).toBeNull();
    expect(screen.getByTestId('add-food-btn').textContent).toBe('Add food');
  });

  it('empty: offers the starter list and a food', async () => {
    await openFoods();
    const screenEl = screen.getByTestId('screen-library');
    expect(screenEl.textContent).toContain('No foods yet');
    expect(within(screenEl).getByRole('button', { name: 'Add the starter list' })).toBeDefined();
    expect(within(screenEl).getByRole('button', { name: 'Add a food' })).toBeDefined();
  });

  it('groups Packaged and Ingredients, sorted by name, with kcal lines and chips', async () => {
    const api = fakeApi();
    api.foods.push(
      food({
        id: 'a',
        name: 'Onion',
        kcal_100g: 40,
        protein_100g: 1.1,
        carbs_100g: 9.3,
        fat_100g: 0.1,
        usual_store: 'ks',
        usually_have: true,
      }),
      food({
        id: 'b',
        name: 'Dark Chocolate bar',
        brand: 'KIND',
        kind: 'packaged',
        kcal_100g: 450,
        protein_100g: 10,
        carbs_100g: 50,
        fat_100g: 20,
        servings_json: [{ name: 'bar', g: 40 }],
        source: 'off',
      }),
      food({ id: 'c', name: 'Herbes de Provence' }),
    );
    await openFoods(api);
    const packaged = screen.getByRole('region', { name: 'Packaged' });
    expect(packaged.textContent).toContain('Packaged (1)');
    expect(packaged.textContent).toContain('KIND Dark Chocolate bar');
    expect(packaged.textContent).toContain('180 kcal a bar');
    expect(packaged.textContent).toContain('Not checked');
    const ingredients = screen.getByRole('region', { name: 'Ingredients' });
    const rows = within(ingredients)
      .getAllByTestId('food-row')
      .map((r) => r.textContent);
    expect(rows[0]).toContain('Herbes de Provence');
    expect(rows[0]).toContain('No nutrition yet');
    expect(rows[1]).toContain('40 kcal / 100 g · usually have');
    expect(rows[1]).toContain('King Soopers');
  });

  it('types a packaged food from the label per serving and stores per 100 g', async () => {
    const api = await openFoods();
    fireEvent.click(screen.getByTestId('add-food-btn'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Type from a label/ }));
    const form = screen.getByTestId('food-form');
    fireEvent.input(within(form).getByTestId('food-name'), { target: { value: 'Protein bar' } });
    fireEvent.input(within(form).getByTestId('serving-name'), { target: { value: 'bar' } });
    fireEvent.input(within(form).getByTestId('serving-g'), { target: { value: '30' } });
    const save = within(form).getByTestId('food-save') as HTMLButtonElement;
    fireEvent.input(within(form).getByTestId('n-kcal'), { target: { value: '120' } });
    // Partly filled: Save waits, and the missing fields say so.
    expect(save.disabled).toBe(true);
    expect(form.textContent).toContain('Needed if you enter any');
    fireEvent.input(within(form).getByTestId('n-protein'), { target: { value: '5' } });
    fireEvent.input(within(form).getByTestId('n-carbs'), { target: { value: '15' } });
    fireEvent.input(within(form).getByTestId('n-fat'), { target: { value: '4' } });
    expect(within(form).getByTestId('per-100').textContent).toBe("That's 400 kcal per 100 g.");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await settle();
    expect(api.calls('upsertFood')[0].payload).toMatchObject({
      name: 'Protein bar',
      kind: 'packaged',
      kcal_100g: 400,
      protein_100g: 16.67,
      carbs_100g: 50,
      fat_100g: 13.33,
      servings_json: [{ name: 'bar', g: 30 }],
      source: 'label',
    });
    expect(screen.queryByTestId('food-form')).toBeNull();
  });
});

describe('the food form on Edit', () => {
  it('shows a stored 16.67 g per 100 g as 5 g in a 30 g serving', () => {
    const bar = food({
      kind: 'packaged',
      name: 'Bar',
      kcal_100g: 400,
      protein_100g: 16.67,
      carbs_100g: 50,
      fat_100g: 13.33,
      servings_json: [{ name: 'bar', g: 30 }],
    });
    render(<FoodForm api={stubApi()} food={bar} onSaved={() => {}} onCancel={() => {}} />);
    expect((screen.getByTestId('n-protein') as HTMLInputElement).value).toBe('5');
    expect((screen.getByTestId('n-kcal') as HTMLInputElement).value).toBe('120');
  });

  it('an API refusal is shown with its text, and the form stays', async () => {
    const api = stubApi({
      saveFood: vi.fn(() => Promise.reject(new ApiError('a food named Bar already exists', 'duplicate'))),
    });
    render(<FoodForm api={api} food={food({ name: 'Bar' })} onSaved={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByTestId('food-save'));
    await settle();
    expect(screen.getByRole('status').textContent).toBe("Couldn't save: a food named Bar already exists");
    expect(screen.getByTestId('food-form')).toBeDefined();
  });
});

describe('a barcode', () => {
  const OFF = food({
    id: '',
    name: 'Crunch Bar',
    brand: 'Acme',
    kind: 'packaged',
    kcal_100g: 250,
    protein_100g: 10,
    carbs_100g: 60,
    fat_100g: 20,
    servings_json: [{ name: 'bar', g: 40 }],
    source: 'off',
    source_ref: '0123456789012',
    barcode: '0123456789012',
    verified: false,
  });

  async function lookUp(answer: BarcodeLookup | (() => never)) {
    const api = fakeApi();
    api.answer('lookupBarcode', () => (typeof answer === 'function' ? answer() : { success: true, data: answer }));
    window.history.replaceState(null, '', '/#/library');
    render(<App />);
    await settle();
    fireEvent.click(screen.getByTestId('foods-tab'));
    fireEvent.click(screen.getByTestId('add-food-btn'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Scan or enter a barcode/ }));
    const sheet = screen.getByTestId('barcode-sheet');
    const lookup = within(sheet).getByTestId('barcode-lookup') as HTMLButtonElement;
    fireEvent.input(within(sheet).getByTestId('barcode-field'), { target: { value: '12345' } });
    expect(lookup.disabled).toBe(true);
    fireEvent.input(within(sheet).getByTestId('barcode-field'), { target: { value: '0123 4567 89012' } });
    expect(lookup.disabled).toBe(false);
    fireEvent.click(lookup);
    await settle();
    return api;
  }

  it('opens the form with the banner, refuses to save until checked, and stores verified', async () => {
    const api = await lookUp({
      found: true,
      reason: '',
      food: OFF,
      warnings: ['energy_mismatch'],
      already_in_library: null,
    });
    expect(api.calls('lookupBarcode')).toHaveLength(1);
    const form = screen.getByTestId('food-form');
    expect(within(form).getByTestId('off-banner').textContent).toContain('Found on Open Food Facts (0123456789012)');
    expect(within(form).getByTestId('energy-warning').textContent).toBe(
      "The calories don't match the macros: protein, carbs and fat add up to about 184 kcal, and this says 100. Check the label.",
    );
    const save = within(form).getByTestId('food-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(within(within(form).getByTestId('off-check')).getByRole('checkbox'));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await settle();
    expect(api.calls('upsertFood')[0].payload).toMatchObject({
      source: 'off',
      source_ref: '0123456789012',
      verified: true,
    });
  });

  it('a barcode Open Food Facts does not have offers to type it from the label', async () => {
    await lookUp({ found: false, reason: 'not_found', food: null, warnings: [], already_in_library: null });
    const sheet = screen.getByTestId('barcode-sheet');
    expect(sheet.textContent).toContain("Open Food Facts doesn't have this barcode.");
    fireEvent.click(within(sheet).getByRole('button', { name: 'Type it from the label' }));
    expect(screen.getByTestId('food-form')).toBeDefined();
  });

  it.each([
    ['busy', 'Open Food Facts is busy. Try again in a minute.'],
    ['unreachable', "Couldn't reach Open Food Facts. Try again, or type it from the label."],
  ])('%s answers its own sentence', async (code, said) => {
    const api = stubApi({ lookupBarcode: vi.fn(() => Promise.reject(new ApiError('x', code))) });
    render(<BarcodeSheet api={api} onFound={() => {}} onTypeIt={() => {}} onOpen={() => {}} onClose={() => {}} />);
    fireEvent.input(screen.getByTestId('barcode-field'), { target: { value: '01234567' } });
    fireEvent.click(screen.getByTestId('barcode-lookup'));
    await settle();
    expect(screen.getByTestId('barcode-sheet').textContent).toContain(said);
  });

  it('a code already in the library opens that food instead', async () => {
    const onOpen = vi.fn();
    const api = stubApi({
      lookupBarcode: vi.fn(() =>
        Promise.resolve({
          found: true,
          reason: '',
          food: null,
          warnings: [],
          already_in_library: { id: 'fd_9', name: 'Acme Crunch' },
        } as BarcodeLookup),
      ),
    });
    render(<BarcodeSheet api={api} onFound={() => {}} onTypeIt={() => {}} onOpen={onOpen} onClose={() => {}} />);
    fireEvent.input(screen.getByTestId('barcode-field'), { target: { value: '01234567' } });
    fireEvent.click(screen.getByTestId('barcode-lookup'));
    await settle();
    expect(screen.getByTestId('barcode-sheet').textContent).toContain("That's already in your library as Acme Crunch.");
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    expect(onOpen).toHaveBeenCalledWith('fd_9');
  });

  describe('the camera button (#779)', () => {
    const open = () =>
      render(
        <BarcodeSheet api={stubApi()} onFound={() => {}} onTypeIt={() => {}} onOpen={() => {}} onClose={() => {}} />,
      );
    const withDetector = (formats?: string[]) => {
      vi.stubGlobal(
        'BarcodeDetector',
        Object.assign(function () {}, { getSupportedFormats: () => Promise.resolve(formats) }),
      );
    };
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('is not drawn and the field is focused where there is no BarcodeDetector', async () => {
      open();
      expect(screen.queryByRole('button', { name: 'Scan with the camera' })).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId('barcode-field'));
    });

    it('leads, above the field, and takes focus where ean_13 and upc_a are supported', async () => {
      withDetector(['ean_13', 'upc_a', 'ean_8']);
      open();
      const scan = await screen.findByRole('button', { name: 'Scan with the camera' });
      const field = screen.getByTestId('barcode-field');
      await waitFor(() => expect(document.activeElement).toBe(scan));
      expect(scan.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(
        field.compareDocumentPosition(screen.getByTestId('barcode-lookup')) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(document.activeElement?.tagName).not.toBe('INPUT');
    });

    it('is not drawn and no field is focused where the formats are missing', async () => {
      withDetector(['qr_code']);
      open();
      await new Promise((r) => setTimeout(r, 0));
      expect(screen.queryByRole('button', { name: 'Scan with the camera' })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('dialog'));
    });

    it('still lets the owner type and look up, and gives focus back after Cancel', async () => {
      withDetector(['ean_13', 'upc_a']);
      const getUserMedia = vi.fn(() => Promise.reject(new Error('no')));
      vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
      open();
      const scan = await screen.findByRole('button', { name: 'Scan with the camera' });
      fireEvent.input(screen.getByTestId('barcode-field'), { target: { value: '01234567' } });
      expect((screen.getByTestId('barcode-lookup') as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(scan);
      await screen.findByText(/Couldn't use the camera/);
      await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('barcode-scan')));
    });

    it('returns to the sheet with the camera button focused when the camera view is cancelled', async () => {
      vi.stubGlobal(
        'BarcodeDetector',
        Object.assign(
          function () {
            return { detect: () => Promise.resolve([]) };
          },
          { getSupportedFormats: () => Promise.resolve(['ean_13', 'upc_a']) },
        ),
      );
      const track = { stop: vi.fn() };
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [track] }) },
      });
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Scan with the camera' }));
      const cancel = await screen.findByRole('button', { name: 'Cancel' });
      fireEvent.click(cancel);
      const scan = await screen.findByRole('button', { name: 'Scan with the camera' });
      await waitFor(() => expect(document.activeElement).toBe(scan));
      expect(track.stop).toHaveBeenCalled();
    });
  });
});

describe('the food sheet', () => {
  it('a food a recipe uses is refused, with the recipes named', async () => {
    const detail: FoodDetail = {
      ...food({ id: 'fd_r', name: 'Ricotta' }),
      used_by: [{ id: 'rc_1', name: 'Beef Stew' }],
    };
    const api = stubApi({
      getFood: vi.fn(() => Promise.resolve(detail)),
      deleteFood: vi.fn(() =>
        Promise.reject(
          new ApiError('in use', 'in_use', {
            uses: {
              recipes: [
                { id: 'rc_1', name: 'Beef Stew' },
                { id: 'rc_2', name: 'Chili' },
              ],
              trips: [],
            },
          }),
        ),
      ),
    });
    render(<FoodSheet api={api} id="fd_r" onEdit={() => {}} onDeleted={() => {}} onClose={() => {}} />);
    await settle();
    expect(screen.getByTestId('food-sheet').textContent).toContain('Beef Stew');
    fireEvent.click(screen.getByRole('button', { name: 'Delete food' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    expect(screen.getByTestId('food-delete').textContent).toContain(
      'Used by Beef Stew and Chili. Remove it from those first.',
    );
  });

  it('a store chip saves on tap', async () => {
    const detail: FoodDetail = { ...food({ id: 'fd_o', name: 'Onion' }), used_by: [] };
    const saveFood = vi.fn((f: Partial<Food>) => Promise.resolve({ ...detail, ...f } as Food));
    render(
      <FoodSheet
        api={stubApi({ getFood: vi.fn(() => Promise.resolve(detail)), saveFood })}
        id="fd_o"
        onEdit={() => {}}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Costco' }));
    await settle();
    expect(saveFood).toHaveBeenCalledWith({ id: 'fd_o', usual_store: 'costco' });
    expect(screen.getByRole('button', { name: 'Costco' }).getAttribute('aria-pressed')).toBe('true');
  });
});

function recipe(over: Partial<RecipeDetail['nutrition']>): RecipeDetail {
  const line = (n: number, text: string, food_id: string, unit = '') => ({
    recipe_id: 'rc_1',
    line_id: `L${n}`,
    position: n,
    section: '',
    text,
    qty: 1,
    unit,
    food_id,
    grams: null,
    optional: false,
    resolved_grams: null,
    reason: '' as const,
  });
  return {
    id: 'rc_1',
    name: 'Lasagna',
    source_url: '',
    source_site: 'example.com',
    servings: 6,
    total_min: null,
    notes: '',
    created: '',
    updated: '',
    partial: false,
    rating: null,
    last_cooked: null,
    has_walkthrough: false,
    cook_count: 0,
    unrated_cook_id: null,
    steps: [],
    lines: [
      line(1, '1 lb ground beef', '', 'lb'),
      line(2, '1 15 oz carton ricotta', 'fd_r', 'carton'),
      line(3, '1 tsp herbes de Provence', 'fd_h', 'tsp'),
      line(4, '2 cups flour', 'fd_f', 'cup'),
    ],
    nutrition: {
      per_serving: { kcal: 520, protein_g: 32, carbs_g: 40, fat_g: 22 },
      missing: [
        { line_id: 'L1', reason: 'no_food' },
        { line_id: 'L2', reason: 'no_weight' },
        { line_id: 'L3', reason: 'no_nutrition' },
      ],
      partial: true,
      by_line: [
        { line_id: 'L1', grams: null, kcal: null },
        { line_id: 'L2', grams: null, kcal: null },
        { line_id: 'L3', grams: 2, kcal: null },
        { line_id: 'L4', grams: 250, kcal: 151.7 },
      ],
      ...over,
    },
  };
}

describe('the Nutrition sheet', () => {
  beforeEach(() => {
    libraryFoods.value = [
      food({ id: 'fd_r', name: 'Ricotta' }),
      food({ id: 'fd_h', name: 'Herbes de Provence' }),
      food({ id: 'fd_f', name: 'Flour' }),
    ];
  });

  it('a partial recipe says partial and names every left-out line with its action', async () => {
    render(
      <NutritionSheet
        api={stubApi({ getRecipe: vi.fn(() => Promise.resolve(recipe({}))) })}
        recipeId="rc_1"
        onChanged={() => {}}
        onClose={() => {}}
      />,
    );
    await settle();
    expect(screen.getByTestId('nutrition-card').textContent).toContain(
      '520 kcal a serving, partialProtein 32 g · Carbs 40 g · Fat 22 g',
    );
    const banner = screen.getByTestId('missing-banner');
    expect(banner.className).toContain('is-warning');
    expect(banner.textContent).toContain('1 lb ground beef has no food yet.');
    expect(banner.textContent).toContain("1 15 oz carton ricotta has no weight yet, so it's left out.");
    expect(banner.textContent).toContain('Herbes de Provence is left out: it has no nutrition yet.');
    expect(
      within(banner)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Choose a food', 'Set a weight', 'Add nutrition']);
    const lines = screen.getAllByTestId('nutrition-line').map((l) => l.textContent);
    expect(lines[3]).toBe('2 cups flourFlour · 250 g152');
    expect(lines[0]).toContain('—');
  });

  it('a recipe whose lines all resolve shows no banner', async () => {
    render(
      <NutritionSheet
        api={stubApi({ getRecipe: vi.fn(() => Promise.resolve(recipe({ missing: [], partial: false }))) })}
        recipeId="rc_1"
        onChanged={() => {}}
        onClose={() => {}}
      />,
    );
    await settle();
    expect(screen.queryByTestId('missing-banner')).toBeNull();
    expect(screen.getByTestId('nutrition-card').textContent).not.toContain('partial');
  });

  it('Set a weight saves 15 oz as a 425.2 g carton on the food, then refetches', async () => {
    const ricotta: FoodDetail = {
      ...food({ id: 'fd_r', name: 'Ricotta' }),
      used_by: [
        { id: 'rc_1', name: 'Lasagna' },
        { id: 'rc_2', name: 'Calzone' },
      ],
    };
    const getRecipe = vi.fn(() => Promise.resolve(recipe({})));
    const setFoodWeight = vi.fn(() => Promise.resolve(ricotta as Food));
    const onChanged = vi.fn();
    render(
      <NutritionSheet
        api={stubApi({ getRecipe, setFoodWeight, getFood: vi.fn(() => Promise.resolve(ricotta)) })}
        recipeId="rc_1"
        onChanged={onChanged}
        onClose={() => {}}
      />,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Set a weight' }));
    await settle();
    const sheet = screen.getByTestId('set-weight');
    expect(sheet.textContent).toContain('How much does 1 carton of ricotta weigh?');
    expect(sheet.textContent).toContain('Also used in Calzone.');
    fireEvent.input(within(sheet).getByTestId('weight-field'), { target: { value: '15 oz' } });
    expect(within(sheet).getByTestId('weight-understood').textContent).toBe('= 425.2 g');
    fireEvent.click(within(sheet).getByTestId('weight-save'));
    await settle();
    expect(setFoodWeight).toHaveBeenCalledWith('fd_r', 'carton', 425.2);
    expect(getRecipe).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalled();
  });

  it('a bare count asks about one of the food, stored as each', async () => {
    const chicken: FoodDetail = { ...food({ id: 'fd_r', name: 'Chicken breasts' }), used_by: [] };
    const r = recipe({});
    r.lines[1] = { ...r.lines[1], text: '4 chicken breasts', unit: '' };
    const setFoodWeight = vi.fn(() => Promise.resolve(chicken as Food));
    render(
      <NutritionSheet
        api={stubApi({
          getRecipe: vi.fn(() => Promise.resolve(r)),
          setFoodWeight,
          getFood: vi.fn(() => Promise.resolve(chicken)),
        })}
        recipeId="rc_1"
        onChanged={() => {}}
        onClose={() => {}}
      />,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Set a weight' }));
    await settle();
    expect(screen.getByTestId('set-weight').textContent).toContain('How much does 1 chicken breast weigh?');
    fireEvent.input(screen.getByTestId('weight-field'), { target: { value: '0' } });
    expect(screen.getByTestId('set-weight').textContent).toContain('Enter a weight above 0, up to 5,000 g.');
    fireEvent.input(screen.getByTestId('weight-field'), { target: { value: '170' } });
    fireEvent.click(screen.getByTestId('weight-save'));
    await settle();
    expect(setFoodWeight).toHaveBeenCalledWith('fd_r', 'each', 170);
  });

  it('Choose a food matches the saved line and refetches', async () => {
    const getRecipe = vi.fn(() => Promise.resolve(recipe({})));
    const setLineFood = vi.fn(() => Promise.resolve(recipe({})));
    libraryFoods.value = [...libraryFoods.value, food({ id: 'fd_b', name: 'Ground beef' })];
    render(
      <NutritionSheet
        api={stubApi({ getRecipe, setLineFood })}
        recipeId="rc_1"
        onChanged={() => {}}
        onClose={() => {}}
      />,
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Choose a food' }));
    const chooser = screen.getByTestId('food-chooser');
    expect((within(chooser).getByRole('searchbox') as HTMLInputElement).value).toBe('ground beef');
    fireEvent.click(within(chooser).getByRole('button', { name: 'Ground beef' }));
    await settle();
    expect(setLineFood).toHaveBeenCalledWith('rc_1', 'L1', 'fd_b');
    expect(getRecipe).toHaveBeenCalledTimes(2);
  });
});

describe("starter foods in #706's chooser", () => {
  it('library foods come first; a starter row adds and matches only when chosen', async () => {
    const onChooseStarter = vi.fn(() => Promise.resolve(true));
    const onChoose = vi.fn();
    render(
      <FoodChooser
        line={{
          name: 'sugar',
          text: '1 cup sugar',
          suggestions: [
            { food_id: 'fd_b', name: 'Brown sugar' },
            { starter_id: 'sugar-granulated', name: 'Sugar, granulated' },
          ],
        }}
        library={[food({ id: 'fd_b', name: 'Brown sugar' })]}
        onChoose={onChoose}
        onChooseStarter={onChooseStarter}
        onCreate={() => {}}
        onLeave={() => {}}
        onClose={() => {}}
      />,
    );
    const starter = screen.getByTestId('starter-suggestion');
    expect(starter.textContent).toBe('+Sugar, granulatedFrom the starter list');
    expect(onChooseStarter).not.toHaveBeenCalled();
    fireEvent.click(starter);
    await settle();
    expect(onChooseStarter).toHaveBeenCalledWith('sugar-granulated');
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('a failed add keeps the sheet and says so', async () => {
    render(
      <FoodChooser
        line={{
          name: 'flour',
          text: '2 cups flour',
          suggestions: [{ starter_id: 'flour-all-purpose', name: 'Flour, all-purpose' }],
        }}
        library={[]}
        onChoose={() => {}}
        onChooseStarter={() => Promise.resolve(false)}
        onCreate={() => {}}
        onLeave={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('starter-suggestion'));
    await settle();
    expect(screen.getByRole('status').textContent).toBe("Couldn't add it. Try again.");
  });
});

describe('the demo layer', () => {
  it('starts with 10 foods (#719 added Milk, Eggs and Paper towels, #712 Granola), a starter sample of 8, and the two barcodes', async () => {
    const api = createDemoApi();
    expect(await api.getFoods()).toHaveLength(10);
    expect(await api.getStarterFoods()).toHaveLength(8);
    expect((await api.lookupBarcode('0000000000000')).reason).toBe('not_found');
    const found = await api.lookupBarcode('0123456789012');
    expect(found).toMatchObject({ found: true, warnings: ['energy_mismatch'] });
    const added = await api.addStarterFoods(['garlic']);
    expect(added.added).toHaveLength(1);
    expect((await api.addStarterFoods(['garlic'])).existing).toHaveLength(1);
  });

  it('a weight set on a food changes the recipe that uses it', async () => {
    const api = createDemoApi();
    const saved = await api.saveImport(
      {
        name: 'Soup',
        servings: 2,
        lines: [{ text: '2 onions', qty: 2, unit: 'large', food_id: 'fd_demo_onion' }],
        steps: [],
      },
      false,
    );
    expect((await api.getRecipe(saved.id)).nutrition.missing).toEqual([{ line_id: 'L1', reason: 'no_weight' }]);
    await api.setFoodWeight('fd_demo_onion', 'large', 150);
    const after = await api.getRecipe(saved.id);
    expect(after.nutrition.per_serving.kcal).toBe(60);
    expect(after.nutrition.by_line).toEqual([{ line_id: 'L1', grams: 300, kcal: 60 }]);
  });

  it('opens Library → Foods with the samples in demo mode', async () => {
    env.VITE_DEMO_MODE = 'true';
    _resetDemoModeCache();
    window.history.replaceState(null, '', '/?demo=true#/library');
    render(<App />);
    await settle();
    fireEvent.click(screen.getByTestId('foods-tab'));
    await waitFor(() => expect(screen.getAllByTestId('food-row')).toHaveLength(10));
    expect(screen.getByTestId('demo-banner')).toBeDefined();
  });
});

describe('the stylesheet', () => {
  const css = readGlobalCss();

  it.each(['.segment', '.food-row', '.recipe-open', '.chip', '.starter-row', '.starter-row input'])(
    '%s is at least 44px',
    (sel) => {
      expect(rule(css, sel)).toMatch(/(min-)?height: var\(--touch-target\)/);
    },
  );

  it('the add routes are 56px or more', () => {
    expect(rule(css, '.add-route')).toContain('min-height: 56px');
  });

  it('nothing scrolls sideways at 375px', () => {
    expect(rule(css, '.food-row')).toContain('flex-wrap: wrap');
    expect(rule(css, '.food-text')).toContain('min-width: 0');
    expect(rule(css, '.food-meta')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.table-scroll')).toContain('overflow-x: auto');
    expect(rule(css, '.nutrient-grid,\n.unit-grid')).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  });
});
