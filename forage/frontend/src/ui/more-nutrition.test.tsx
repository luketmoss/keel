// #756: the More nutrition block on every surface, the food form's More from the label section, and the demo data
// that shows each state. The API's rules (#755) are in apps-script/tests; here they are checked on the field.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { ForageApi } from '../api/client';
import type { Food, FoodDetail } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { FoodForm } from '../library/food-form';
import { FoodSheet } from '../library/food-sheet';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetEaten } from '../eaten/eaten-store';
import { _resetPlan } from '../plan/plan-store';
import { readGlobalCss, rule } from '../test-css';
import { MORE_KEY, MoreNutrition, loadMoreOpen, moreOpen } from './more-nutrition';

const env = import.meta.env as Record<string, string | undefined>;

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => {});
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
    created: '',
    updated: '',
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
  loadMoreOpen();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ALL = {
  satfat_g: 15,
  transfat_g: 0,
  cholesterol_mg: 210,
  sodium_mg: 1840,
  fiber_g: 22.46,
  sugars_g: 48,
  added_sugars_g: 20,
};

const NONE_TEXT = "None of today's entries has sodium, fiber or the rest yet.";

function block(over: Partial<Parameters<typeof MoreNutrition>[0]> = {}) {
  return <MoreNutrition values={ALL} fat={48.2} carbs={140} rounding="whole" noneText={NONE_TEXT} {...over} />;
}

const toggles = () => screen.getAllByRole('button', { name: /More nutrition/ });

describe('the More nutrition block', () => {
  it('is a collapsed button with aria-expanded, and opening it lists the nine rows in label order', () => {
    render(block());
    const button = toggles()[0];
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Sodium')).toBeNull();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBeTruthy();
    const dl = document.querySelector('dl')!;
    expect([...dl.querySelectorAll('dt')].map((d) => d.textContent)).toEqual([
      'Fat',
      'Saturated fat',
      'Trans fat',
      'Cholesterol',
      'Sodium',
      'Carbs',
      'Fiber',
      'Sugars',
      'Added sugars',
    ]);
    expect([...dl.querySelectorAll('dd')].map((d) => d.textContent)).toEqual([
      '48 g',
      '15 g',
      '0 g',
      '210 mg',
      '1,840 mg',
      '140 g',
      '22 g',
      '48 g',
      '20 g',
    ]);
  });

  it('rounds grams to 0.1 on the food and amount sheets, dropping a trailing .0', () => {
    render(block({ rounding: 'tenth', values: { ...ALL, fiber_g: 22.46, transfat_g: 0.5 } }));
    fireEvent.click(toggles()[0]);
    const text = document.querySelector('dl')!.textContent!;
    expect(text).toContain('Fiber22.5 g');
    expect(text).toContain('Trans fat0.5 g');
    expect(text).toContain('Saturated fat15 g');
  });

  it('is open on every surface once opened on one, and after a reload', () => {
    render(
      <>
        {block()}
        {block()}
      </>,
    );
    fireEvent.click(toggles()[0]);
    expect(toggles().map((b) => b.getAttribute('aria-expanded'))).toEqual(['true', 'true']);
    expect(localStorage.getItem(MORE_KEY)).toBe('1');
    moreOpen.value = false;
    loadMoreOpen();
    expect(moreOpen.value).toBe(true);
  });

  it('starts collapsed and still toggles when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    loadMoreOpen();
    render(block());
    const button = toggles()[0];
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows a dash named "not known" for an unknown value, never 0, and 0 g for a known 0', () => {
    render(block({ values: { ...ALL, transfat_g: null, sodium_mg: undefined, satfat_g: 0 } }));
    fireEvent.click(toggles()[0]);
    const trans = screen.getByTestId('more-transfat_g');
    expect(within(trans).getByLabelText('not known').textContent).toBe('—');
    expect(trans.textContent).not.toContain('0 g');
    expect(within(screen.getByTestId('more-sodium_mg')).getByLabelText('not known')).toBeDefined();
    expect(screen.getByTestId('more-satfat_g').textContent).toContain('0 g');
  });

  it('reads "at least" where a count is above 0, with the note, and neither when every count is 0', () => {
    const note = "At least: some entries don't have this one.";
    const { unmount } = render(block({ unknown: { sodium_mg: 2, satfat_g: 0 }, atLeastNote: note }));
    fireEvent.click(toggles()[0]);
    expect(screen.getByTestId('more-sodium_mg').textContent).toContain('at least 1,840 mg');
    expect(screen.getByTestId('more-satfat_g').textContent).not.toContain('at least');
    expect(screen.getByTestId('more-at-least').textContent).toBe(note);
    unmount();

    render(block({ unknown: { sodium_mg: 0, satfat_g: 0, transfat_g: 0 }, atLeastNote: note }));
    expect(document.body.textContent).not.toContain('at least');
    expect(screen.queryByTestId('more-at-least')).toBeNull();
  });

  it('does not say "at least" for an unknown value', () => {
    render(block({ values: { ...ALL, sodium_mg: null }, unknown: { sodium_mg: 3 }, atLeastNote: 'At least: x' }));
    fireEvent.click(toggles()[0]);
    expect(document.body.textContent).not.toContain('at least');
    expect(screen.queryByTestId('more-at-least')).toBeNull();
  });

  it('replaces the list with the surface line when all seven are null', () => {
    const empty = {
      satfat_g: null,
      transfat_g: null,
      cholesterol_mg: null,
      sodium_mg: null,
      fiber_g: null,
      sugars_g: null,
      added_sugars_g: null,
    };
    render(block({ values: empty }));
    fireEvent.click(toggles()[0]);
    expect(screen.getByTestId('more-none').textContent).toBe(NONE_TEXT);
    expect(document.querySelector('dl')).toBeNull();
  });
});

describe('the food form: More from the label', () => {
  const noop = () => {};
  const apiWith = (saveFood = vi.fn((f: Partial<Food>) => Promise.resolve(food({ ...f })))) =>
    ({ saveFood }) as unknown as ForageApi;
  const type = (id: string, value: string) => fireEvent.input(screen.getByTestId(id), { target: { value } });
  const saveDisabled = () => (screen.getByTestId('food-save') as HTMLButtonElement).disabled;
  // Per 40 g serving: fat 8 g, carbs 20 g.
  const bar = food({
    name: 'Bar',
    kind: 'packaged',
    kcal_100g: 400,
    protein_100g: 10,
    carbs_100g: 50,
    fat_100g: 20,
    servings_json: [{ name: 'bar', g: 40 }],
  });
  const form = (f: Partial<Food>, origin = {}) =>
    render(<FoodForm api={apiWith()} food={f} origin={origin} onSaved={noop} onCancel={noop} />);

  it('is closed when the food has none of the seven, open when it has any', () => {
    const { unmount } = form(bar);
    expect(screen.getByTestId('more-label-toggle').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('x-sodium_mg')).toBeNull();
    unmount();
    form({ ...bar, sodium_mg_100g: 500 });
    expect(screen.getByTestId('more-label-toggle').getAttribute('aria-expanded')).toBe('true');
    expect((screen.getByTestId('x-sodium_mg') as HTMLInputElement).value).toBe('200');
  });

  it('has the seven fields with the label names, per serving for a packaged food and per 100 g otherwise', () => {
    const { unmount } = form({ ...bar, fiber_100g: 1 });
    const section = screen.getByTestId('more-label-toggle').parentElement!;
    expect(section.textContent).toContain("Leave any blank that the label doesn't list.");
    expect(section.textContent).toContain('Per serving');
    for (const label of [
      'Saturated fat g',
      'Trans fat g',
      'Cholesterol mg',
      'Sodium mg',
      'Fiber g',
      'Sugars g',
      'Added sugars g',
    ]) {
      expect(within(section).getByText(label)).toBeDefined();
    }
    unmount();
    form(food({ name: 'Rice', fiber_100g: 1 }));
    expect(screen.getByTestId('more-label-toggle').parentElement!.textContent).toContain('Per 100 g');
  });

  it('saves 200 mg in a 40 g serving as sodium_mg_100g 500, and reopening shows 200', async () => {
    const saveFood = vi.fn((f: Partial<Food>) => Promise.resolve(food({ ...f })));
    const { unmount } = render(<FoodForm api={apiWith(saveFood)} food={bar} onSaved={noop} onCancel={noop} />);
    fireEvent.click(screen.getByTestId('more-label-toggle'));
    type('x-sodium_mg', '200');
    expect(saveDisabled()).toBe(false);
    fireEvent.click(screen.getByTestId('food-save'));
    await settle();
    const saved = saveFood.mock.calls[0][0];
    expect(saved.sodium_mg_100g).toBe(500);
    expect(saved.satfat_100g).toBeNull();
    unmount();
    form({ ...bar, ...saved });
    expect((screen.getByTestId('x-sodium_mg') as HTMLInputElement).value).toBe('200');
  });

  it('leaving the seven blank saves them blank, as before', async () => {
    const saveFood = vi.fn((f: Partial<Food>) => Promise.resolve(food({ ...f })));
    render(<FoodForm api={apiWith(saveFood)} food={bar} onSaved={noop} onCancel={noop} />);
    expect(saveDisabled()).toBe(false);
    fireEvent.click(screen.getByTestId('food-save'));
    await settle();
    const saved = saveFood.mock.calls[0][0];
    expect(saved.kcal_100g).toBe(400);
    for (const k of [
      'satfat_100g',
      'transfat_100g',
      'cholesterol_mg_100g',
      'sodium_mg_100g',
      'fiber_100g',
      'sugars_100g',
      'added_sugars_100g',
    ] as const) {
      expect(saved[k]).toBeNull();
    }
  });

  it.each([
    ['a negative', 'x-sodium_mg', '-1', 'Enter a number, 0 or more.'],
    ['not a number', 'x-fiber_g', 'abc', 'Enter a number, 0 or more.'],
    ['saturated over fat', 'x-satfat_g', '9', 'Saturated and trans fat add up to more than fat.'],
    ['fiber over carbs', 'x-fiber_g', '21', 'Fiber is more than carbs.'],
    ['sugars over carbs', 'x-sugars_g', '21', 'Sugars are more than carbs.'],
    ['cholesterol over 100,000 per 100 g', 'x-cholesterol_mg', '40001', "That's more than 100,000 mg per 100 g."],
    ['sodium over 100,000 per 100 g', 'x-sodium_mg', '40001', "That's more than 100,000 mg per 100 g."],
  ])('%s disables Save and says so on its field, and fixing it re-enables Save', (_n, id, value, message) => {
    form({ ...bar, fiber_100g: 0 });
    type(id, value);
    expect(saveDisabled()).toBe(true);
    const input = screen.getByTestId(id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const error = document.getElementById(input.getAttribute('aria-describedby')!)!;
    expect(error.textContent).toBe(message);
    type(id, '1');
    expect(saveDisabled()).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('refuses saturated plus trans over fat across the two fields, and added sugars over sugars', () => {
    form({ ...bar, sugars_100g: 50 });
    type('x-satfat_g', '5');
    type('x-transfat_g', '4');
    expect(saveDisabled()).toBe(true);
    expect(document.getElementById('x-satfat_g-error')!.textContent).toContain('add up to more than fat');
    type('x-transfat_g', '3');
    expect(saveDisabled()).toBe(false);
    type('x-added_sugars_g', '21');
    expect(document.getElementById('x-added_sugars_g-error')!.textContent).toBe('Added sugars are more than sugars.');
    type('x-added_sugars_g', '20');
    expect(saveDisabled()).toBe(false);
  });

  it('refuses the seven without the core four, on the first one set', () => {
    form(food({ name: 'Rice' }));
    fireEvent.click(screen.getByTestId('more-label-toggle'));
    type('x-sodium_mg', '5');
    type('x-fiber_g', '1');
    expect(saveDisabled()).toBe(true);
    expect(document.getElementById('x-sodium_mg-error')!.textContent).toBe('Needs the calories and macros too.');
    expect(document.getElementById('x-fiber_g-error')).toBeNull();
  });

  it('editing any of the seven on a verified Open Food Facts food unticks the check', () => {
    form({ ...bar, id: 'fd_off', source: 'off', verified: true });
    const check = () => within(screen.getByTestId('off-check')).getByRole('checkbox') as HTMLInputElement;
    expect(check().checked).toBe(true);
    fireEvent.click(screen.getByTestId('more-label-toggle'));
    type('x-sodium_mg', '200');
    expect(check().checked).toBe(false);
  });

  it('opens with More from the label open and focus in Saturated fat for Add them', async () => {
    form(bar, { focusExtras: true });
    await settle();
    expect(screen.getByTestId('more-label-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByTestId('x-satfat_g'));
  });
});

describe('the food sheet', () => {
  const detail = (over: Partial<Food>): FoodDetail => ({ ...food(over), used_by: [] });
  const sheet = async (f: FoodDetail) => {
    const onEdit = vi.fn();
    const getFood = vi.fn(() => Promise.resolve(f));
    render(
      <FoodSheet
        api={{ getFood } as unknown as ForageApi}
        id={f.id}
        onEdit={onEdit}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    );
    await settle();
    return onEdit;
  };
  const nutritious = { kcal_100g: 400, protein_100g: 10, carbs_100g: 50, fat_100g: 20 };

  it("captions the block with the default weight and shows that weight's values, the Per table staying at four columns", async () => {
    await sheet(
      detail({
        ...nutritious,
        name: 'Bar',
        kind: 'packaged',
        servings_json: [{ name: 'bar', g: 40 }],
        sodium_mg_100g: 1000,
        satfat_100g: 5,
      }),
    );
    fireEvent.click(toggles()[0]);
    const el = screen.getByTestId('food-sheet');
    expect(el.textContent).toContain('Per 1 bar (40 g)');
    expect(screen.getByTestId('more-sodium_mg').textContent).toContain('400 mg');
    expect(screen.getByTestId('more-satfat_g').textContent).toContain('2 g');
    // Per, kcal, P, C, F: the same four value columns as before.
    expect(el.querySelectorAll('.per-table thead th')).toHaveLength(5);
  });

  it('captions Per 100 g when the food has no weight', async () => {
    await sheet(detail({ ...nutritious, fiber_100g: 2 }));
    fireEvent.click(toggles()[0]);
    expect(screen.getByTestId('food-sheet').textContent).toContain('Per 100 g');
  });

  it('offers Add them for a food with nutrition and none of the seven', async () => {
    const onEdit = await sheet(detail(nutritious));
    expect(screen.getByTestId('food-sheet').textContent).toContain("Sodium, fiber and the rest aren't filled in.");
    expect(screen.queryByRole('button', { name: /More nutrition/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add them' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'fd_1' }), false, true);
  });

  it('shows no block for a food without nutrition', async () => {
    await sheet(detail({}));
    expect(screen.queryByRole('button', { name: /More nutrition/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add them' })).toBeNull();
  });
});

describe('demo mode', () => {
  beforeEach(() => {
    env.VITE_DEMO_MODE = 'true';
    _resetDemoModeCache();
    _resetDemoApi();
    _resetEaten();
    _resetPlan();
    _resetRecipes();
    _resetFoods();
  });
  afterEach(() => {
    delete env.VITE_DEMO_MODE;
    _resetDemoModeCache();
    _resetDemoApi();
  });

  const open = async (hash: string) => {
    window.history.replaceState(null, '', `/?demo=true#/${hash}`);
    render(<App />);
    await settle();
  };

  it('has a day showing an at-least value, and the day card has no block when nothing is logged', async () => {
    await open('eaten');
    const card = screen.getByTestId('day-card');
    fireEvent.click(within(card).getByRole('button', { name: /More nutrition/ }));
    expect(card.textContent).toMatch(/Trans fatat least [\d.]+ g/);
    expect(card.textContent).toContain("At least: some entries don't have this one.");
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await settle();
    expect(within(screen.getByTestId('day-card')).queryByRole('button', { name: /More nutrition/ })).toBeNull();
  });

  it('has an amount sheet showing all seven for a logged food', async () => {
    await open('eaten');
    fireEvent.click(screen.getAllByTestId('entry-row')[0]);
    await settle();
    const sheet = screen.getByTestId('amount-sheet');
    fireEvent.click(within(sheet).getByRole('button', { name: /More nutrition/ }));
    expect(within(sheet).getByTestId('more-sodium_mg').textContent).toBe('Sodium113 mg');
    expect(within(sheet).queryByTestId('more-at-least')).toBeNull();
  });

  it('has a recipe Nutrition sheet showing all seven per serving', async () => {
    await open('library');
    fireEvent.click(document.querySelector('.recipe-open')!);
    await settle();
    const sheet = screen.getByTestId('nutrition-sheet');
    fireEvent.click(within(sheet).getByRole('button', { name: /More nutrition/ }));
    expect(
      within(sheet)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toContain('Added sugars');
    expect(within(sheet).getByTestId('more-sodium_mg').textContent).toMatch(/Sodium[\d,]+ mg/);
  });

  it('has a food showing Add them, which opens the form on Saturated fat', async () => {
    await open('library');
    fireEvent.click(screen.getByTestId('foods-tab'));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Flour, all-purpose/ }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Add them' }));
    await settle();
    expect(screen.getByTestId('food-form')).toBeDefined();
    expect(document.activeElement).toBe(screen.getByTestId('x-satfat_g'));
  });
});

describe('the stylesheet', () => {
  const css = readGlobalCss();
  it('the toggle is a 44px text button and a row keeps its value on one line while the name wraps', () => {
    expect(rule(css, '.text-btn')).toContain('min-height: var(--touch-target)');
    expect(rule(css, '.mn-row dt')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.mn-row dd')).toContain('flex: none');
  });
});
