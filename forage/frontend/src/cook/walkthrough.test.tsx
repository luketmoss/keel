// #711 in the app: walkthrough mode's three stages inside #708's cook frame,
// amounts scaled with servings, timers that never move the cook, the Cook
// choice sheet's stale and missing states, and the stylesheet's rules.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/preact';
import App from '../App';
import type { RecipeDetail, RecipeSummary } from '../api/types';
import { DEMO_RECIPES } from '../demo/demo-data';
import { DEMO_STEW_WALKTHROUGH } from '../demo/demo-walkthrough';
import { _resetRecipes } from '../library/recipes-store';
import { syncFromHash } from '../shell/routes';
import { fakeApi } from '../test-api';
import { _resetCookMemory, readCook } from './cook-store';
import { lineName, quantityText, shownAmount, minutesText } from './amounts';
import { planText } from './walkthrough-mode';

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => {});
}

async function go(hash: string) {
  window.history.replaceState(null, '', `/${hash}`);
  render(<App />);
  await settle();
}

const DOC = { ...DEMO_STEW_WALKTHROUGH, recipe: 'rc_stew' };
const DEMO_STEW = DEMO_RECIPES.find((r) => r.id === 'rc_demo_stew')!;

function summary(over: Partial<RecipeSummary> = {}): RecipeSummary {
  return {
    id: 'rc_stew',
    name: 'Beef Stew',
    source_url: '',
    source_site: 'tasteofhome.com',
    servings: 6,
    total_min: null,
    notes: '',
    created: '2026-10-01T00:00:00Z',
    updated: '',
    nutrition: {
      per_serving: { kcal: null, protein_g: null, carbs_g: null, fat_g: null },
      missing: [],
      partial: false,
    },
    partial: false,
    rating: null,
    last_cooked: null,
    has_walkthrough: true,
    walkthrough_ok: true,
    cook_count: 0,
    unrated_cook_id: null,
    ...over,
  };
}

/** The fixture recipe, its 19 lines, with its walkthrough. */
const STEW: RecipeDetail = {
  ...summary(),
  lines: DEMO_STEW.lines.map((l, i) => ({
    recipe_id: 'rc_stew',
    line_id: `L${i + 1}`,
    position: i + 1,
    section: l.section ?? '',
    text: l.text,
    qty: l.qty ?? null,
    unit: l.unit ?? '',
    food_id: '',
    grams: null,
    optional: !!l.optional,
    resolved_grams: null,
    reason: '',
  })),
  steps: [{ recipe_id: 'rc_stew', position: 1, section: '', name: '', text: 'Cook it.' }],
  walkthrough: DOC,
  walkthrough_check: { ok: true, problems: [] },
};

function stewApi(detail: RecipeDetail = STEW) {
  const api = fakeApi();
  api.recipes.push(summary({ walkthrough_ok: detail.walkthrough_check?.ok !== false }));
  api.answer('getRecipe', () => ({ success: true, data: detail }));
  return api;
}

const primary = () => screen.getByTestId('walk-primary');
const amounts = () => screen.getAllByTestId('uses-amount').map((a) => a.textContent);
const openStep = () => screen.getByTestId('step-body');

/** From Before you start to the first cooking step. */
async function toCooking() {
  fireEvent.click(primary()); // Start prep
  fireEvent.click(primary()); // Start cooking anyway
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  _resetCookMemory();
  signIn();
  _resetRecipes();
  document.title = 'Forage';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('amounts', () => {
  it('rounds to ⅛ below 4 with thirds, ½ from 4 to 10, whole from 10', () => {
    expect([0.5, 1.5, 0.3333, 0.6667, 1.0001, 0.37, 3.95, 4.2, 4.3, 9.9, 12.4].map(quantityText)).toEqual([
      '½',
      '1½',
      '⅓',
      '⅔',
      '1',
      '⅜',
      '4',
      '4',
      '4½',
      '10',
      '12',
    ]);
  });

  it('names a line without its amount, up to the first comma or parenthesis', () => {
    expect(lineName({ text: '1/2 teaspoon salt, divided', unit: 'tsp' })).toBe('salt');
    expect(lineName({ text: '1-1/2 pounds beef stew meat, cut into 1-inch cubes', unit: 'lb' })).toBe('beef stew meat');
    expect(lineName({ text: '2 garlic cloves, minced', unit: 'clove' })).toBe('garlic');
    expect(lineName({ text: '3 cups coarsely chopped onions (about 2 large)', unit: 'cup' })).toBe(
      'coarsely chopped onions',
    );
    expect(lineName({ text: 'Additional fresh rosemary, optional', unit: '' })).toBe('Additional fresh rosemary');
  });

  it('scales, pluralises, says Some with no qty and A little under ⅛', () => {
    const broth = STEW.lines[9];
    expect(shownAmount(broth, 1, 6, 6)).toEqual({ amount: '2 cups', name: 'beef broth' });
    expect(shownAmount(broth, 1, 3, 6)).toEqual({ amount: '1 cup', name: 'beef broth' });
    expect(shownAmount(STEW.lines[5], 1, 3, 6).amount).toBe('1½ tbsp');
    expect(shownAmount(STEW.lines[11], 1, 6, 6)).toEqual({ amount: '2', name: 'bay leaves' });
    expect(shownAmount(STEW.lines[18], 1, 6, 6)).toEqual({
      amount: 'Some',
      name: 'Additional fresh rosemary (optional)',
    });
    expect(shownAmount(STEW.lines[1], 0.5, 1, 6).amount).toBe('A little');
    expect(shownAmount(undefined, 1, 6, 6).amount).toBe('Some');
  });

  it('the plan line, with durations over an hour in hours', () => {
    expect(minutesText(19)).toBe('19 min');
    expect(minutesText(90)).toBe('1 h 30 min');
    expect(planText(DOC)).toBe(
      '4 prep groups first, then 7 cooking steps: about 19 min at the stove and 2 h of waiting. ' +
        '2 more prep groups (cut the vegetables, mix the thickener) happen during the waiting.',
    );
  });
});

describe('walking Beef Stew', () => {
  it('Before you start → Prep → Cooking step by step to Finish', async () => {
    const api = stewApi();
    await go('#/cook/rc_stew?mode=walkthrough');
    expect(screen.getByTestId('walk-start').textContent).toContain('Before you start');
    expect(screen.getByTestId('walk-servings').textContent).toBe('6');
    expect(screen.getByTestId('walk-equipment').textContent).toBe(
      'Dutch oven with lid · Large bowl · 2 small bowls · Liquid measuring cup',
    );
    expect(primary().textContent).toBe('Start prep');
    expect(readCook()).toMatchObject({ mode: 'walkthrough', servings: 6, stage: 'start' });

    fireEvent.click(primary());
    expect(screen.getByTestId('prep-label').textContent).toBe('Prep · 0 of 9 done');
    expect(['beef', 'base', 'wine', 'broth'].map((id) => !!screen.queryByTestId(`prep-${id}`))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(primary().textContent).toBe('Start cooking anyway');

    fireEvent.click(primary());
    const titles = DOC.cook.map((c) => c.title);
    for (let i = 0; i < titles.length - 1; i++) {
      expect(screen.getByTestId('cook-label').textContent).toBe(`Cooking · step ${i + 1} of 7`);
      expect(primary().textContent).toBe(`Next: ${titles[i + 1]}`);
      fireEvent.click(primary());
    }
    expect(screen.getByTestId('cook-label').textContent).toBe('Cooking · step 7 of 7');
    const finish = screen.getByTestId('finish');
    expect(finish.textContent).toBe('Finish');
    fireEvent.click(finish);
    await settle();
    expect(screen.getByTestId('cook-done').textContent).toContain('Walkthrough');
    expect(api.sent.filter((s) => s.action === 'upsertCook')).toHaveLength(1);
  });

  it('servings 6 → 3 halves every amount in Prep and Cooking, and no time changes', async () => {
    stewApi();
    await go('#/cook/rc_stew?mode=walkthrough');
    const prepAt = async (n: number) => {
      while (Number(screen.getByTestId('walk-servings').textContent) > n) {
        fireEvent.click(screen.getByRole('button', { name: 'One fewer serving' }));
      }
      fireEvent.click(primary());
      const out = amounts();
      fireEvent.click(primary());
      const brown = amounts();
      const chips = screen.getAllByTestId('step-head').map((h) => h.textContent);
      // Through to veg-in's Meanwhile (thicken, with the broth's share of rosemary).
      for (let i = 0; i < 4; i++) fireEvent.click(primary());
      const meanwhile = within(screen.getByTestId('meanwhile'))
        .getAllByTestId('uses-amount')
        .map((a) => a.textContent);
      fireEvent.click(screen.getByTestId('walk-back'));
      fireEvent.click(screen.getByTestId('walk-back'));
      fireEvent.click(screen.getByTestId('walk-back'));
      fireEvent.click(screen.getByTestId('walk-back'));
      fireEvent.click(screen.getByTestId('walk-back')); // Prep
      fireEvent.click(screen.getByTestId('walk-back')); // Before you start
      return { out, brown, chips, meanwhile };
    };
    const six = await prepAt(6);
    const three = await prepAt(3);
    expect(six.out).toContain('2 cups'); // the broth
    expect(three.out).toContain('1 cup');
    expect(six.out).toContain('3 tbsp'); // the tomato paste
    expect(three.out).toContain('1½ tbsp');
    expect(six.out).toEqual([
      '1½ lb',
      '¼ tsp',
      '4 tbsp',
      '½ tsp',
      '3 tbsp',
      '2 tsp',
      '2 cloves',
      '2 cups',
      '2 cups',
      '1 tsp',
      '2',
    ]);
    expect(three.out).toEqual([
      '¾ lb',
      '⅛ tsp',
      '2 tbsp',
      '¼ tsp',
      '1½ tbsp',
      '1 tsp',
      '1 clove',
      '1 cup',
      '1 cup',
      '½ tsp',
      '1',
    ]);
    expect(six.brown).toEqual(['1 tbsp']); // the oil; the beef is From prep
    expect(three.brown).toEqual(['½ tbsp']);
    expect(three.meanwhile).toEqual(['¼ tsp', '⅛ tsp', '1 tbsp', '1 tbsp', '1 tbsp', '½ cup']);
    expect(six.meanwhile).toEqual(['½ tsp', '¼ tsp', '2 tbsp', '2 tbsp', '2 tbsp', '1 cup']);
    expect(three.chips).toEqual(six.chips); // 10 min, 2 min, 5 min, 90 min…
    expect(six.chips[3]).toContain('90 min');
  });
});

describe('timers never move the cook', () => {
  it('a step timer keeps running across steps, and at zero changes its chip and is announced', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stewApi();
    await go('#/cook/rc_stew?mode=walkthrough');
    await toCooking();
    fireEvent.click(screen.getByTestId('step-timer'));
    expect(screen.getByTestId('timer-running').textContent).toBe(
      "Timer running above. It doesn't move you on; tap Next when it's ready.",
    );
    expect(screen.getByTestId('timer-chip').firstChild!.textContent).toBe('Browning');
    await act(async () => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    fireEvent.click(primary()); // to bloom
    expect(within(openStep()).getByTestId('step-timer').textContent).toBe('Start 2 min timer');
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    fireEvent.click(screen.getByTestId('walk-back'));
    expect(screen.getByTestId('timer-left').textContent).toBe('6:00');
    expect(screen.getByTestId('timer-running')).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(6 * 60_000 + 1000);
    });
    expect(screen.getByTestId('timer-left').textContent).toBe('Done');
    expect(screen.getByTestId('timer-chip').className).toContain('is-done');
    const status = screen.getByTestId('timer-announce');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('Browning timer is up');
    expect(screen.getByTestId('cook-label').textContent).toBe('Cooking · step 1 of 7');

    // Two timers of one step cannot exist; removing it brings the button back.
    fireEvent.click(screen.getByRole('button', { name: 'Remove the Browning timer' }));
    expect(screen.queryByTestId('timer-chip')).toBeNull();
    fireEvent.click(screen.getByTestId('step-timer'));
    expect(screen.queryByTestId('step-timer')).toBeNull();
    expect(screen.getAllByTestId('timer-chip')).toHaveLength(1);
  });

  it('a wait step offers a wait, and its Meanwhile group appears only there, never in Prep', async () => {
    stewApi();
    await go('#/cook/rc_stew?mode=walkthrough');
    fireEvent.click(primary());
    expect(screen.queryByTestId('prep-veg')).toBeNull();
    expect(screen.queryByTestId('prep-thicken')).toBeNull();
    fireEvent.click(primary());
    expect(screen.queryByTestId('meanwhile')).toBeNull();
    fireEvent.click(screen.getAllByTestId('step-head')[3]); // simmer
    expect(within(openStep()).getByTestId('step-timer').textContent).toBe('Start 90 min wait');
    const mw = within(openStep()).getAllByTestId('meanwhile');
    expect(mw).toHaveLength(1);
    expect(within(mw[0]).getByTestId('prep-veg')).toBeDefined();
    fireEvent.click(within(openStep()).getByTestId('step-timer'));
    expect(screen.getByTestId('timer-running').textContent).toMatch(/^Wait running above/);
  });

  it('a completed Prep or a ticked Meanwhile group never moves on; Next is always enabled', async () => {
    stewApi();
    await go('#/cook/rc_stew?mode=walkthrough');
    fireEvent.click(primary());
    for (const t of screen.getAllByTestId('task-row')) fireEvent.click(t);
    expect(screen.getByTestId('prep-label').textContent).toBe('Prep · 9 of 9 done');
    expect(screen.getAllByTestId('task-row').every((t) => t.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(screen.getByTestId('walk-prep')).toBeDefined();
    expect(primary().textContent).toBe('Start cooking');
    fireEvent.click(primary());
    fireEvent.click(screen.getAllByTestId('step-head')[3]);
    for (const t of within(screen.getByTestId('meanwhile')).getAllByTestId('task-row')) fireEvent.click(t);
    expect(screen.getByTestId('cook-label').textContent).toBe('Cooking · step 4 of 7');
    expect(primary().hasAttribute('disabled')).toBe(false);
  });

  it('a step using a prep group with unticked tasks says how many are left, and Next still works', async () => {
    stewApi();
    await go('#/cook/rc_stew?mode=walkthrough');
    fireEvent.click(primary());
    fireEvent.click(screen.getAllByTestId('task-row')[0]); // one of beef's four
    fireEvent.click(primary());
    expect(within(openStep()).getByTestId('tasks-left').textContent).toBe('3 of 4 tasks not ticked');
    fireEvent.click(primary());
    expect(screen.getByTestId('cook-label').textContent).toBe('Cooking · step 2 of 7');
  });

  it('step headers are buttons with aria-expanded, one open, and the current number is aria-current', async () => {
    stewApi();
    await go('#/cook/rc_stew?mode=walkthrough');
    await toCooking();
    const heads = screen.getAllByTestId('step-head');
    expect(heads.map((h) => h.getAttribute('aria-expanded'))).toEqual(['true', ...Array(6).fill('false')]);
    fireEvent.click(heads[5]);
    expect(screen.getAllByTestId('step-head').map((h) => h.getAttribute('aria-expanded'))).toEqual([
      ...Array(5).fill('false'),
      'true',
      'false',
    ]);
    expect(screen.getAllByTestId('step-body')).toHaveLength(1);
    expect(document.querySelector('[aria-current="step"]')!.textContent).toBe('6');
    expect(heads[0].querySelector('.step-num')!.textContent).toBe('✓');
  });

  it('Back on step 1 returns to Prep, and the cook comes back after a reload where it was', async () => {
    stewApi();
    await go('#/cook/rc_stew?mode=walkthrough');
    await toCooking();
    fireEvent.click(primary());
    expect(readCook()).toMatchObject({ stage: 'cook', step: 1 });
    document.body.innerHTML = '';
    await go('#/cook/rc_stew?mode=walkthrough');
    expect(screen.getByTestId('cook-label').textContent).toBe('Cooking · step 2 of 7');
    fireEvent.click(screen.getByTestId('walk-back'));
    expect(screen.getByTestId('walk-back').textContent).toBe('Prep');
    fireEvent.click(screen.getByTestId('walk-back'));
    expect(screen.getByTestId('walk-prep')).toBeDefined();
  });
});

describe('the Cook choice sheet', () => {
  async function openChoice(detail: RecipeDetail) {
    stewApi(detail);
    await go('#/library');
    fireEvent.click(screen.getByText('Beef Stew'));
    await settle();
    fireEvent.click(screen.getByTestId('cook-btn'));
    return screen.getByTestId('cook-choice');
  }

  it('Walkthrough opens walkthrough mode', async () => {
    const sheet = await openChoice(STEW);
    expect(within(sheet).getByTestId('mode-walkthrough').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continue' }));
    await act(async () => syncFromHash());
    await settle();
    expect(window.location.hash).toBe('#/cook/rc_stew?mode=walkthrough');
    expect(screen.getByTestId('walk-start')).toBeDefined();
  });

  it('a stale walkthrough is unavailable with the message, and Log mode still works', async () => {
    const stale: RecipeDetail = {
      ...STEW,
      walkthrough_ok: false,
      walkthrough_check: { ok: false, problems: ['cook brown: no ingredient line L5'] },
    };
    const sheet = await openChoice(stale);
    const walk = within(sheet).getByTestId('mode-walkthrough');
    expect(walk.hasAttribute('disabled')).toBe(true);
    expect(walk.textContent).toContain('Needs an update. Ask Claude to fix it with the Forage connector.');
    expect(within(sheet).getByTestId('mode-log').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Continue' }));
    await act(async () => syncFromHash());
    await settle();
    expect(window.location.hash).toBe('#/cook/rc_stew');
    expect(screen.getAllByTestId('check-line').length).toBeGreaterThan(0);
  });

  it('a walkthrough route for a stale walkthrough opens log mode instead', async () => {
    stewApi({ ...STEW, walkthrough_ok: false, walkthrough_check: { ok: false, problems: ['x'] } });
    await go('#/cook/rc_stew?mode=walkthrough');
    expect(screen.queryByTestId('walk-start')).toBeNull();
    expect(screen.getAllByTestId('check-line').length).toBeGreaterThan(0);
  });
});

describe('the stylesheet (#711)', () => {
  it('controls are 44px or more, task rows 56px, and long text wraps', async () => {
    const { readGlobalCss, rule } = await import('../test-css');
    const css = readGlobalCss();
    expect(rule(css, '.step-head')).toContain('min-height: var(--touch-target)');
    expect(rule(css, '.step-timer')).toContain('min-height: 52px');
    expect(rule(css, '.step-title')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.uses-name')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.step-do')).toContain('overflow-wrap: anywhere');
    expect(rule(css, '.meanwhile')).toContain('dashed');
  });
});
