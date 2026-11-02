// #714 - the Day screen's Food card: the figures Forage reports, every empty and partial state, the
// seven-day strip, one read for the window, failure that stays inside the card, the slot rules and demo mode.
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
import type { FoodDay } from '../../api/forage-food';
import { FoodCard } from './food-card';
import { SLOTS, slotsFor } from './slots';
import { readGlobalCss } from '../../test-css';
import { demoFoodDays, foodWindows, loadFood, refreshFood, resetFood } from '../../state/food';

const AUTH: AuthState = { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} };
const TODAY = '2026-11-02'; // a Monday
const PAST = '2026-10-26'; // a Monday

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

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
    ...over,
  };
}
const NONE: Partial<FoodDay> = {
  kcal: null,
  protein_g: null,
  carbs_g: null,
  fat_g: null,
  partial: true,
  unknown_entries: 4,
};

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

beforeEach(() => {
  demo.on = false;
  resetFood();
  api.getFoodLogTotals.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('the figures', () => {
  it('shows calories, macros and the item count in whole numbers, "kcal so far" on today', async () => {
    ok([day(TODAY)]);
    const { container } = await mount();
    const card = container.querySelector('.food')!;
    expect(card.querySelector('h2')!.textContent).toBe('Food · from Forage');
    expect(card.querySelector('.food-kcal')!.textContent).toBe('1,240');
    expect(card.querySelector('.food-unit')!.textContent).toBe('kcal so far');
    expect(text(card.querySelector('.food-macros')!)).toBe('Protein 62 g Carbs 140 g Fat 48 g');
    expect(text(card.querySelector('.day-panel-meta')!)).toBe('4 items');
    expect(card.querySelector('.food-low')).toBeNull();
    expect(card.querySelector('.food-note')).toBeNull();
  });

  it('says "kcal" on a past day and "1 item" for one', async () => {
    ok([day(PAST, { entries: 1 })]);
    const { container } = await mount(PAST, 'past');
    expect(container.querySelector('.food-unit')!.textContent).toBe('kcal');
    expect(text(container.querySelector('.day-panel-meta')!)).toBe('1 item');
  });

  it('shows "—" for one macro that is null while calories are present', async () => {
    ok([day(TODAY, { fat_g: null })]);
    const { container } = await mount();
    expect(text(container.querySelector('.food-macros')!)).toBe('Protein 62 g Carbs 140 g Fat —');
    expect(container.querySelector('.food-kcal')!.textContent).toBe('1,240');
  });

  it("is one link to Forage's Eaten tab, and offers no way to add, edit or delete food", async () => {
    ok([day(TODAY)]);
    const { container } = await mount();
    const link = container.querySelector('a.food-link')!;
    expect(link.getAttribute('href')).toBe('https://luketmoss.github.io/keel/forage/#/eaten');
    expect(link.getAttribute('rel')).toBe('noopener');
    expect(link.getAttribute('target')).toBeNull();
    expect(container.querySelectorAll('button, input, textarea, select')).toHaveLength(0);
  });
});

describe('nothing logged and partial days', () => {
  it('shows "—" and "Nothing logged today.", never 0', async () => {
    ok([day('2026-11-01')]);
    const { container } = await mount();
    expect(container.querySelector('.food-kcal')!.textContent).toBe('—');
    expect(text(container.querySelector('.food-macros')!)).toBe('Protein — Carbs — Fat —');
    expect(text(container.querySelector('.food-note')!)).toBe('Nothing logged today.');
    expect(container.querySelector('.day-panel-meta')).toBeNull();
    expect(text(container.querySelector('.food')!)).not.toMatch(/(^|\s)0(\s|$)/);
    // The strip still shows the other days.
    expect(container.querySelectorAll('.food-week-bar')).toHaveLength(1);
  });

  it('names the weekday on a past day', async () => {
    ok([]);
    const { container } = await mount(PAST, 'past');
    expect(text(container.querySelector('.food-note')!)).toBe('Nothing logged on Monday.');
  });

  it('says none of the items has nutrition yet, today and past', async () => {
    ok([day(TODAY, NONE)]);
    const today = await mount();
    expect(today.container.querySelector('.food-kcal')!.textContent).toBe('—');
    expect(text(today.container.querySelector('.food-note')!)).toBe("None of today's items has nutrition yet.");
    expect(today.container.querySelector('.food-low')).toBeNull();
    expect(text(today.container.querySelector('.day-panel-meta')!)).toBe('4 items');
    cleanup();
    resetFood();
    ok([day(PAST, NONE)]);
    const past = await mount(PAST, 'past');
    expect(text(past.container.querySelector('.food-note')!)).toBe("None of Monday's items has nutrition yet.");
  });

  it('marks a partial day with a Low chip and its line, as text', async () => {
    ok([day(TODAY, { partial: true, unknown_entries: 1 })]);
    const { container } = await mount();
    expect(container.querySelector('.food-low')!.textContent).toBe('Low');
    expect(text(container.querySelector('.food-note')!)).toBe('Some items have no nutrition, so this total is low.');
    expect(container.querySelector('.food-kcal')!.textContent).toBe('1,240');
  });
});

describe('the seven-day strip', () => {
  it('has seven named days ending on the viewed day, with gaps and a hatched low day', async () => {
    ok([
      day('2026-10-28', { kcal: 1000 }),
      day('2026-10-29', { kcal: 980, partial: true }),
      day('2026-10-31', { kcal: 2000 }),
      day(TODAY, { kcal: 1500 }),
    ]);
    const { container } = await mount();
    const items = [...container.querySelectorAll('.food-week > li')];
    expect(items).toHaveLength(7);
    expect(items.map((li) => li.querySelector('.sr-only')!.textContent)).toEqual([
      'Tuesday, nothing logged',
      'Wednesday, 1,000 kcal',
      'Thursday, 980 kcal, low',
      'Friday, nothing logged',
      'Saturday, 2,000 kcal',
      'Sunday, nothing logged',
      'Monday, 1,500 kcal',
    ]);
    expect(container.querySelectorAll('.food-week-gap')).toHaveLength(3);
    expect(container.querySelectorAll('.food-week-bar')).toHaveLength(4);
    expect(container.querySelectorAll('.food-week-bar-partial')).toHaveLength(1);
    expect(items[6].querySelector('.food-week-bar-viewed')).not.toBeNull();
    expect(container.querySelectorAll('.food-week-bar-viewed')).toHaveLength(1);
    const heights = [...container.querySelectorAll('.food-week-bar')].map((b) => b.getAttribute('style'));
    expect(heights).toEqual(['height: 50%;', 'height: 49%;', 'height: 100%;', 'height: 75%;']);
    // The bars are drawn, the names carry the data.
    expect(container.querySelector('.food-week-slot')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.food-week-caption')!.textContent).toBe(
      'Last 7 days, kcal. A day with nothing logged is a gap.',
    );
  });

  it('is seven gap marks when nothing is logged all week', async () => {
    ok([]);
    const { container } = await mount();
    expect(container.querySelectorAll('.food-week-gap')).toHaveLength(7);
    expect(container.querySelectorAll('.food-week-bar')).toHaveLength(0);
  });
});

describe('reading', () => {
  it("makes one call for the viewed day's window and shows a skeleton until it answers", async () => {
    let release!: (v: unknown) => void;
    api.getFoodLogTotals.mockReturnValue(new Promise((r) => (release = r)));
    const { container } = await mount();
    expect(container.querySelector('.food-skeleton')).not.toBeNull();
    expect(api.getFoodLogTotals).toHaveBeenCalledTimes(1);
    expect(api.getFoodLogTotals).toHaveBeenCalledWith('tok', '2026-10-27', TODAY);
    release({ ok: true, days: [day(TODAY)] });
    await flush();
    expect(container.querySelector('.food-skeleton')).toBeNull();
    expect(container.querySelector('.food-kcal')!.textContent).toBe('1,240');
    expect(api.getFoodLogTotals).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the page becomes visible, at most once a minute', async () => {
    ok([day(TODAY)]);
    await mount();
    expect(api.getFoodLogTotals).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(api.getFoodLogTotals).toHaveBeenCalledTimes(1); // inside the minute
    vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ['Date'] });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.useRealTimers();
    await flush();
    expect(api.getFoodLogTotals).toHaveBeenCalledTimes(2);
  });

  it('shows a window already read at once and re-reads behind it', async () => {
    ok([day(TODAY)]);
    await mount();
    cleanup();
    api.getFoodLogTotals.mockReturnValue(new Promise(() => {}));
    const { container } = render(
      <AuthContext.Provider value={AUTH}>
        <FoodCard date={TODAY} state="today" today={TODAY} />
      </AuthContext.Provider>,
    );
    expect(container.querySelector('.food-kcal')!.textContent).toBe('1,240');
    expect(container.querySelector('.food-skeleton')).toBeNull();
    expect(api.getFoodLogTotals).toHaveBeenCalledTimes(2);
  });

  it('announces a refresh that changes the figures, and not the first read', async () => {
    ok([day(TODAY)]);
    const { container } = await mount();
    const live = () => container.querySelector('p.sr-only[role="status"]')!.textContent;
    expect(live()).toBe('');
    ok([day(TODAY, { kcal: 1500 })]);
    await act(async () => {
      await loadFood(TODAY, 'tok');
    });
    expect(live()).toBe('Food updated: 1,500 kcal');
  });
});

describe('failure stays in the card', () => {
  it.each([['token_forbidden'], ['timeout'], ['network'], ['bad_response']])(
    '%s is "Couldn\'t load your food."',
    async (kind) => {
      api.getFoodLogTotals.mockResolvedValue({ ok: false, kind });
      const { container } = await mount();
      expect(text(container.querySelector('.panel-status')!)).toContain("Couldn't load your food.");
      expect(container.querySelector('.panel-retry')!.textContent).toBe('Try again');
      expect(container.querySelector('.food-kcal')).toBeNull();
    },
  );

  it('Try again reads again and recovers', async () => {
    api.getFoodLogTotals.mockResolvedValueOnce({ ok: false, kind: 'timeout' });
    const { container } = await mount();
    ok([day(TODAY)]);
    await act(async () => {
      fireEvent.click(container.querySelector('.panel-retry')!);
    });
    await flush();
    expect(container.querySelector('.food-kcal')!.textContent).toBe('1,240');
    expect(api.getFoodLogTotals).toHaveBeenCalledTimes(2);
  });

  it('keeps what was shown when a re-read behind it fails', async () => {
    ok([day(TODAY)]);
    await mount();
    api.getFoodLogTotals.mockResolvedValue({ ok: false, kind: 'network' });
    await act(async () => {
      await loadFood(TODAY, 'tok');
    });
    expect(foodWindows.value[TODAY].status).toBe('loaded');
  });

  it('never throws on a failed read', async () => {
    api.getFoodLogTotals.mockResolvedValue({ ok: false, kind: 'failed' });
    await expect(loadFood(TODAY, 'tok')).resolves.toBeUndefined();
    expect(foodWindows.value[TODAY].status).toBe('error');
  });
});

describe('where the card mounts', () => {
  it("is after Sleep and before Drinks, never on a future day, when Forage's URL is set", () => {
    vi.stubEnv('VITE_FORAGE_API_URL', 'https://script.google.com/macros/s/forage/exec');
    for (const state of ['today', 'past'] as const) {
      const slots = slotsFor(state);
      expect(slots.indexOf('food')).toBe(slots.indexOf('sleep') + 1);
      expect(slots.indexOf('drinks')).toBe(slots.indexOf('food') + 1);
    }
    expect(slotsFor('future')).not.toContain('food');
    expect(SLOTS.food).toBe(FoodCard);
  });

  it('is not mounted at all in a build without it, and no request is made', () => {
    vi.stubEnv('VITE_FORAGE_API_URL', '');
    expect(slotsFor('today')).not.toContain('food');
    expect(slotsFor('past')).not.toContain('food');
    expect(slotsFor('today').indexOf('drinks')).toBe(slotsFor('today').indexOf('sleep') + 1);
    expect(api.getFoodLogTotals).not.toHaveBeenCalled();
  });

  it('is mounted in demo mode without a URL', () => {
    vi.stubEnv('VITE_FORAGE_API_URL', '');
    demo.on = true;
    expect(slotsFor('today')).toContain('food');
    expect(slotsFor('future')).not.toContain('food');
  });
});

describe('demo mode', () => {
  it('shows built-in data with one gap and one low day, and makes no request', async () => {
    demo.on = true;
    const { container } = await mount();
    expect(api.getFoodLogTotals).not.toHaveBeenCalled();
    expect(container.querySelector('.food-kcal')!.textContent).toBe('1,240');
    expect(container.querySelectorAll('.food-week-gap')).toHaveLength(1);
    expect(container.querySelectorAll('.food-week-bar-partial')).toHaveLength(1);
    expect(demoFoodDays(TODAY)).toHaveLength(6);
  });
});

describe('refreshFood', () => {
  it('does not read a window it read under a minute ago', async () => {
    ok([day(TODAY)]);
    await loadFood(TODAY, 'tok');
    await refreshFood(TODAY, 'tok');
    expect(api.getFoodLogTotals).toHaveBeenCalledTimes(1);
  });
});

describe('--metric-food', () => {
  const css = readGlobalCss().replace(/\/\*[\s\S]*?\*\//g, '');
  it('is declared in both themes', () => {
    for (const theme of ['light', 'dark']) {
      const block = css.match(new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))?.[1] ?? '';
      expect(block).toMatch(/--metric-food:\s*#[0-9a-fA-F]{6};/);
    }
  });
});
