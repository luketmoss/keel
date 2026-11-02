// #757 - the Food card's More nutrition block: the seven label values under the macro line.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/preact';

const api = vi.hoisted(() => ({ getFoodLogTotals: vi.fn() }));
vi.mock('../../api/forage-food', async (orig) => ({
  ...(await orig<typeof import('../../api/forage-food')>()),
  ...api,
}));
const demo = vi.hoisted(() => ({ on: false }));
vi.mock('../../api/demo-data', async (orig) => ({
  ...(await orig<typeof import('../../api/demo-data')>()),
  isDemo: () => demo.on,
}));

import { AuthContext, type AuthState } from '../../auth/auth-context';
import type { FoodDay, FoodLabel } from '../../api/forage-food';
import { FoodCard } from './food-card';
import { readGlobalCss } from '../../test-css';
import { resetFood } from '../../state/food';

const AUTH: AuthState = { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} };
const TODAY = '2026-11-02'; // a Monday
const PAST = '2026-10-26'; // a Monday

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

const SEVEN: FoodLabel = {
  values: {
    satfat_g: 15.2,
    transfat_g: 0,
    cholesterol_mg: 210,
    sodium_mg: 1840,
    fiber_g: 22.4,
    sugars_g: 48.3,
    added_sugars_g: 20,
  },
  unknown: { satfat_g: 0, transfat_g: 0, cholesterol_mg: 0, sodium_mg: 0, fiber_g: 0, sugars_g: 0, added_sugars_g: 0 },
};

function day(date: string, over: Partial<FoodDay> = {}): FoodDay {
  return {
    date,
    entries: 4,
    unknown_entries: 0,
    kcal: 1240.4,
    protein_g: 62.2,
    carbs_g: 140.4,
    fat_g: 48.1,
    partial: false,
    label: SEVEN,
    ...over,
  };
}
const withValues = (v: Partial<FoodLabel['values']>, u: Partial<FoodLabel['unknown']> = {}): FoodLabel => ({
  values: { ...SEVEN.values, ...v },
  unknown: { ...SEVEN.unknown, ...u },
});

const ok = (days: FoodDay[]) => api.getFoodLogTotals.mockResolvedValue({ ok: true, days });

async function mount(date = TODAY, state: 'today' | 'past' = 'today') {
  const view = render(
    <AuthContext.Provider value={AUTH}>
      <FoodCard date={date} state={state} today={TODAY} />
    </AuthContext.Provider>,
  );
  await flush();
  return view;
}

const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const rowsOf = (c: Element) =>
  [...c.querySelectorAll('.food-more-list .food-more-row')].map(
    (r) => `${text(r.querySelector('dt')!)} ${text(r.querySelector('dd')!)}`,
  );
const toggle = (c: Element) => c.querySelector('button.food-more-btn') as HTMLButtonElement | null;
const press = (c: Element) => fireEvent.click(toggle(c)!);

beforeEach(() => {
  demo.on = false;
  resetFood();
  api.getFoodLogTotals.mockReset();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('More nutrition', () => {
  it('is a collapsed toggle under the macro line, with aria wiring, in the card button family', async () => {
    ok([day(TODAY)]);
    const { container } = await mount();
    const btn = toggle(container)!;
    expect(btn.textContent).toBe('More nutrition');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    const list = container.querySelector(`#${btn.getAttribute('aria-controls')}`)!;
    expect(list.hasAttribute('hidden')).toBe(true);
    expect(btn.classList.contains('food-link')).toBe(true);
    expect(container.querySelector('.food-macros')!.nextElementSibling).toBe(btn.parentElement);
  });

  it('opens a dl in label order, whole numbers, with the macro figures on Fat and Carbs', async () => {
    ok([day(TODAY)]);
    const { container } = await mount();
    press(container);
    expect(toggle(container)!.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('dl.food-more-list')).not.toBeNull();
    expect(rowsOf(container)).toEqual([
      'Fat 48 g',
      'Saturated fat 15 g',
      'Trans fat 0 g',
      'Cholesterol 210 mg',
      'Sodium 1,840 mg',
      'Carbs 140 g',
      'Fiber 22 g',
      'Sugars 48 g',
      'Added sugars 20 g',
    ]);
    expect(container.querySelector('.food-more-atleast')).toBeNull();
    expect(container.querySelector('.food-more-row-2 dt')!.textContent).toBe('Added sugars');
  });

  it('shows a dash named "not known" for null, never 0, and a real 0 as 0 g', async () => {
    ok([day(TODAY, { label: withValues({ sodium_mg: null, fiber_g: null }) })]);
    const { container } = await mount();
    press(container);
    const rows = rowsOf(container);
    expect(rows).toContain('Sodium —');
    expect(rows).toContain('Fiber —');
    expect(rows).toContain('Trans fat 0 g');
    const dashes = container.querySelectorAll('.food-more-unknown');
    expect(dashes).toHaveLength(2);
    expect(dashes[0].getAttribute('aria-label')).toBe('not known');
  });

  it('reads "at least" where unknown is above 0, with its line', async () => {
    ok([day(TODAY, { label: withValues({}, { sodium_mg: 2, added_sugars_g: 1 }) })]);
    const { container } = await mount();
    press(container);
    const rows = rowsOf(container);
    expect(rows).toContain('Sodium at least 1,840 mg');
    expect(rows).toContain('Added sugars at least 20 g');
    expect(text(container.querySelector('.food-more-atleast')!)).toBe("At least: some items don't have this one.");
  });

  it.each([
    ['today', TODAY, "None of today's items has sodium, fiber or the rest yet."],
    ['past', PAST, "None of Monday's items has sodium, fiber or the rest yet."],
  ] as const)('replaces the list with the none-known line on a %s day', async (state, date, line) => {
    const all = withValues({
      satfat_g: null,
      transfat_g: null,
      cholesterol_mg: null,
      sodium_mg: null,
      fiber_g: null,
      sugars_g: null,
      added_sugars_g: null,
    });
    ok([day(date, { label: all })]);
    const { container } = await mount(date, state);
    expect(toggle(container)).not.toBeNull();
    expect(text(container.querySelector('.food-more-none')!)).toBe(line);
    expect(container.querySelector('dl')).toBeNull();
  });

  it('remembers open across a reload and another day', async () => {
    ok([day(TODAY), day(PAST)]);
    const first = await mount();
    press(first.container);
    expect(localStorage.getItem('thrive.foodMore')).toBe('1');
    cleanup();
    resetFood();
    const second = await mount(PAST, 'past');
    expect(toggle(second.container)!.getAttribute('aria-expanded')).toBe('true');
    press(second.container);
    expect(localStorage.getItem('thrive.foodMore')).toBe('0');
  });

  it('starts collapsed and still works when localStorage throws', async () => {
    localStorage.setItem('thrive.foodMore', '1');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    ok([day(TODAY)]);
    const { container } = await mount();
    expect(toggle(container)!.getAttribute('aria-expanded')).toBe('false');
    press(container);
    expect(toggle(container)!.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.food-kcal')!.textContent).toBe('1,240');
  });

  it('keeps the Low chip and its line on a partial day', async () => {
    ok([day(TODAY, { partial: true, unknown_entries: 1 })]);
    const { container } = await mount();
    expect(toggle(container)).not.toBeNull();
    expect(container.querySelector('.food-low')!.textContent).toBe('Low');
    expect(text(container.querySelector('.food-note')!)).toBe('Some items have no nutrition, so this total is low.');
  });

  it('is not shown with nothing logged, no nutrition, loading, or a failed read', async () => {
    ok([day('2026-11-01')]);
    expect(toggle((await mount()).container)).toBeNull();
    cleanup();
    resetFood();
    ok([day(TODAY, { kcal: null, protein_g: null, carbs_g: null, fat_g: null, partial: true })]);
    expect(toggle((await mount()).container)).toBeNull();
    cleanup();
    resetFood();
    api.getFoodLogTotals.mockReturnValue(new Promise(() => {}));
    expect(toggle((await mount()).container)).toBeNull();
    cleanup();
    resetFood();
    api.getFoodLogTotals.mockResolvedValue({ ok: false, kind: 'network' });
    const failed = await mount();
    expect(toggle(failed.container)).toBeNull();
    expect(failed.container.querySelector('.panel-status')).not.toBeNull();
  });

  it('is exactly the old card when Forage sends no seven', async () => {
    ok([day(TODAY, { label: undefined })]);
    const { container } = await mount();
    expect(container.querySelector('.food-more')).toBeNull();
    expect(container.querySelector('.panel-status')).toBeNull();
    expect(container.querySelector('.food-kcal')!.textContent).toBe('1,240');
  });

  it('keeps a 12,400 mg sodium on one line: the value column is nowrap and the toggle is 44px', async () => {
    ok([day(TODAY, { label: withValues({ sodium_mg: 12400 }) })]);
    const { container } = await mount();
    press(container);
    expect(rowsOf(container)).toContain('Sodium 12,400 mg');
    const css = readGlobalCss().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.food-more-row dd\s*\{[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\.food-link\s*\{[^}]*min-height:\s*44px/);
  });

  it('shows in demo mode on today with an "at least" value and line, and none-known on yesterday', async () => {
    demo.on = true;
    vi.useFakeTimers({ now: new Date('2026-11-02T19:00:00Z'), toFake: ['Date'] });
    const { container } = await mount();
    expect(api.getFoodLogTotals).not.toHaveBeenCalled();
    press(container);
    expect(rowsOf(container)).toContain('Added sugars at least 20 g');
    expect(container.querySelector('.food-more-atleast')).not.toBeNull();
    cleanup();
    resetFood();
    const past = await mount('2026-11-01', 'past');
    expect(text(past.container.querySelector('.food-more-none')!)).toBe(
      "None of Sunday's items has sodium, fiber or the rest yet.",
    );
  });
});
