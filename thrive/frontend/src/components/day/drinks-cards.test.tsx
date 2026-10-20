// #520 - the Water and Alcohol cards and the state under them: the optimistic
// add, rollback, time edit, delete behind the in-app confirm, the past-day and
// future-day rules, loading and failure, rapid taps, the goal, and demo mode.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/preact';

const api = vi.hoisted(() => ({
  logDrink: vi.fn(),
  getDrinks: vi.fn(),
  getDrinkTotals: vi.fn(),
  updateDrinkTime: vi.fn(),
  deleteDrink: vi.fn(),
  updateSetting: vi.fn(),
}));
vi.mock('../../api/drinks', async (orig) => ({ ...(await orig<typeof import('../../api/drinks')>()), ...api }));
const demo = vi.hoisted(() => ({ on: false }));
vi.mock('../../api/demo-data', async (orig) => ({
  ...(await orig<typeof import('../../api/demo-data')>()),
  isDemo: () => demo.on,
}));

import { AuthContext, type AuthState } from '../../auth/auth-context';
import type { Drink } from '../../api/drinks';
import { DrinkCards } from './drinks-cards';
import { SLOTS, slotsFor } from './slots';
import { confirmText, mountConfirmHost, openedConfirm } from '../shared/confirm-test-utils';
import {
  addDrink,
  drinkDays,
  formatOz,
  loadDrinks,
  ozToGoalMl,
  resetDrinks,
  saveWaterGoal,
  waterGoalMl,
} from '../../state/drinks';

const AUTH: AuthState = { token: 'tok', user: null, isAuthenticated: true, login: () => {}, logout: () => {} };
const TODAY = '2026-10-20';
const YESTERDAY = '2026-10-19';
/** 12:00 in Denver (MDT, UTC-6). */
const NOW = new Date('2026-10-20T18:00:00.000Z');

function drink(id: string, kind: 'water' | 'alcohol', date: string, time: string, amount?: number): Drink {
  return {
    id,
    kind,
    amount: amount ?? (kind === 'water' ? 118 : 1),
    date,
    time,
    logged_at_utc: `${date}T${time}Z`,
    source: 'app',
    created: 'c',
    updated: 'u',
  };
}

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

async function mount(date = TODAY, state: 'today' | 'past' = 'today') {
  const view = render(
    <AuthContext.Provider value={AUTH}>
      <DrinkCards date={date} state={state} today={TODAY} />
    </AuthContext.Provider>,
  );
  await flush();
  return view;
}

const card = (c: Element, title: string) =>
  [...c.querySelectorAll('section.day-panel')].find((s) => s.querySelector('h2')!.textContent === title)!;
const entries = (c: Element, title: string) => [...card(c, title).querySelectorAll('li.drink-entry')];
const total = (c: Element, title: string) => card(c, title).querySelector('.drink-total')!.textContent;
const button = (c: Element, label: string) => c.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  for (const f of Object.values(api)) f.mockReset();
  demo.on = false;
  resetDrinks();
  api.getDrinks.mockResolvedValue({ ok: true, data: { drinks: [], water_goal_ml: 1893 } });
  api.logDrink.mockImplementation(async (input) => ({
    ok: true,
    data: { ...drink(input.id, input.kind, TODAY, '12:00:00', input.amount), logged_at_utc: input.logged_at_utc },
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('slot', () => {
  it('is the drinks slot, between sleep and the tiles, and never mounts on a future day', () => {
    expect(SLOTS.drinks).toBe(DrinkCards);
    expect(slotsFor('today').indexOf('drinks')).toBe(slotsFor('today').indexOf('sleep') + 1);
    expect(slotsFor('today').indexOf('vitals')).toBe(slotsFor('today').indexOf('drinks') + 1);
    expect(slotsFor('future')).not.toContain('drinks');
  });
});

describe('display', () => {
  it('formats ounces to one decimal and drops a trailing .0', () => {
    expect(formatOz(118)).toBe('4');
    expect(formatOz(590)).toBe('20');
    expect(formatOz(1893)).toBe('64');
    expect(formatOz(0)).toBe('0');
    expect(formatOz(100)).toBe('3.4');
  });

  it('shows 0 oz / 0 drinks and a one-line empty state on a quiet day', async () => {
    const { container } = await mount();
    expect(total(container, 'Water')).toBe('0oz');
    expect(card(container, 'Water').textContent).toContain('of 64 oz');
    expect(total(container, 'Alcohol')).toBe('0drinks');
    expect(card(container, 'Water').textContent).toContain('Nothing logged yet.');
    expect(card(container, 'Alcohol').textContent).toContain('Nothing logged yet.');
    expect(card(container, 'Water').querySelector('.drink-bar-fill')!.getAttribute('style')).toContain('width: 0%');
  });

  it('lists entries newest first with their times and amounts', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [
          drink('a', 'water', TODAY, '13:10:00'),
          drink('b', 'water', TODAY, '15:42:00'),
          drink('c', 'alcohol', TODAY, '21:05:00'),
        ],
        water_goal_ml: 1893,
      },
    });
    const { container } = await mount();
    expect(entries(container, 'Water').map((e) => e.textContent)).toEqual(['3:42 PM4 oz⋯', '1:10 PM4 oz⋯']);
    expect(total(container, 'Water')).toBe('8oz');
    expect(entries(container, 'Alcohol')[0].textContent).toContain('9:05 PM1 drink');
    expect(total(container, 'Alcohol')).toBe('1drink');
  });

  it('fills the bar to total / goal, capped at 100%, while the figure keeps counting', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('a', 'water', TODAY, '08:00:00', 2129)], water_goal_ml: 1893 },
    });
    const { container } = await mount();
    const bar = card(container, 'Water').querySelector('.drink-bar')!;
    expect(total(container, 'Water')).toBe('72oz');
    expect(card(container, 'Water').textContent).toContain('of 64 oz');
    expect(bar.querySelector('.drink-bar-fill')!.getAttribute('style')).toContain('width: 100%');
    expect(bar.getAttribute('aria-valuenow')).toBe('64');
    expect(bar.getAttribute('aria-valuemax')).toBe('64');
    expect(bar.getAttribute('aria-valuetext')).toBe('Water 72 ounces of 64');
    expect(card(container, 'Water').querySelector('.drink-total-reached')).not.toBeNull();
  });

  it('names each total and button for a screen reader', async () => {
    const { container } = await mount();
    expect(card(container, 'Water').querySelector('p.sr-only[role="status"]')!.textContent).toBe(
      'Water 0 ounces of 64',
    );
    expect(card(container, 'Alcohol').querySelector('p.sr-only[role="status"]')!.textContent).toBe('Alcohol 0 drinks');
    expect(button(container, 'Add 4 ounces of water').textContent).toBe('+ 4 oz');
    expect(button(container, 'Add one alcoholic drink').textContent).toBe('+ 1 drink');
  });

  it('uses the goal the API returned', async () => {
    api.getDrinks.mockResolvedValue({ ok: true, data: { drinks: [], water_goal_ml: 2957 } });
    const { container } = await mount();
    expect(card(container, 'Water').textContent).toContain('of 100 oz');
  });
});

describe('adding', () => {
  it('+ 4 oz raises the total at once and stamps the current time; five taps read 20 oz', async () => {
    const { container } = await mount();
    const add = button(container, 'Add 4 ounces of water');
    for (let i = 0; i < 5; i++) fireEvent.click(add);
    // Before the API answers: five pending entries, already counted.
    expect(total(container, 'Water')).toBe('20oz');
    expect(entries(container, 'Water')).toHaveLength(5);
    expect(entries(container, 'Water')[0].textContent).toContain('12:00 PM');
    expect(entries(container, 'Water')[0].textContent).toContain('Saving…');
    await flush();
    expect(total(container, 'Water')).toBe('20oz');
    expect(card(container, 'Water').textContent).not.toContain('Saving…');
  });

  it('sends one call per tap, each with its own id, 118 ml and the instant of the tap', async () => {
    const { container } = await mount();
    const add = button(container, 'Add 4 ounces of water');
    for (let i = 0; i < 5; i++) fireEvent.click(add);
    await flush();
    expect(api.logDrink).toHaveBeenCalledTimes(5);
    const sent = api.logDrink.mock.calls.map((c) => c[0]);
    expect(new Set(sent.map((s) => s.id)).size).toBe(5);
    for (const s of sent) {
      expect(s).toMatchObject({ kind: 'water', amount: 118, logged_at_utc: NOW.toISOString(), source: 'app' });
    }
    expect(api.logDrink.mock.calls[0][1]).toBe('tok');
  });

  it('+ 1 drink raises the alcohol count by 1', async () => {
    const { container } = await mount();
    fireEvent.click(button(container, 'Add one alcoholic drink'));
    expect(total(container, 'Alcohol')).toBe('1drink');
    await flush();
    expect(api.logDrink.mock.calls[0][0]).toMatchObject({ kind: 'alcohol', amount: 1 });
    expect(entries(container, 'Alcohol')).toHaveLength(1);
    expect(total(container, 'Water')).toBe('0oz');
  });

  it('a double-send of one id is counted once', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('same', 'water', TODAY, '09:00:00')], water_goal_ml: 1893 },
    });
    await mount();
    // The same row arrives again from a later read.
    await act(async () => {
      await loadDrinks(TODAY, 'tok');
    });
    expect(drinkDays.value[TODAY].entries).toHaveLength(1);
  });

  it('rolls back and says so when the log fails', async () => {
    api.logDrink.mockResolvedValue({ ok: false, kind: 'network' });
    const { container } = await mount();
    fireEvent.click(button(container, 'Add 4 ounces of water'));
    expect(total(container, 'Water')).toBe('4oz');
    await flush();
    expect(total(container, 'Water')).toBe('0oz');
    expect(entries(container, 'Water')).toHaveLength(0);
    expect(card(container, 'Water').querySelector('[role="alert"]')!.textContent).toBe(
      "Couldn't save that drink. Try again.",
    );
    // The next tap clears the message.
    api.logDrink.mockResolvedValue({ ok: true, data: drink('x', 'water', TODAY, '12:00:00') });
    fireEvent.click(button(container, 'Add 4 ounces of water'));
    expect(card(container, 'Water').querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps a pending entry through a read that began before it settled', async () => {
    let release!: (v: unknown) => void;
    api.logDrink.mockReturnValue(new Promise((r) => (release = r)));
    const { container } = await mount();
    fireEvent.click(button(container, 'Add 4 ounces of water'));
    await act(async () => {
      await loadDrinks(TODAY, 'tok');
    });
    expect(entries(container, 'Water')).toHaveLength(1);
    release({ ok: false, kind: 'network' });
    await flush();
    expect(entries(container, 'Water')).toHaveLength(0);
  });
});

describe('past and future days', () => {
  it('a past day has entries, totals and actions, and no add buttons', async () => {
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: { drinks: [drink('p1', 'water', YESTERDAY, '08:00:00')], water_goal_ml: 1893 },
    });
    const { container } = await mount(YESTERDAY, 'past');
    expect(api.getDrinks).toHaveBeenCalledWith({ from: YESTERDAY, to: YESTERDAY }, 'tok');
    expect(container.querySelector('.drink-add')).toBeNull();
    expect(card(container, 'Water').textContent).toContain('Drinks can only be added today.');
    expect(card(container, 'Water').textContent).toContain('Monday');
    expect(total(container, 'Water')).toBe('4oz');
    expect(entries(container, 'Water')[0].querySelector('.drink-more')).not.toBeNull();
  });

  it('today is labelled "today"', async () => {
    const { container } = await mount();
    expect(card(container, 'Water').querySelector('.day-panel-meta')!.textContent).toBe('today');
  });
});

describe('editing a time', () => {
  const seed = () =>
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [drink('a', 'water', TODAY, '10:00:00'), drink('b', 'water', TODAY, '11:00:00')],
        water_goal_ml: 1893,
      },
    });

  it('moves the entry to its new place and changes nothing else', async () => {
    seed();
    api.updateDrinkTime.mockResolvedValue({ ok: true, data: drink('a', 'water', TODAY, '12:30:00') });
    const { container } = await mount();
    expect(entries(container, 'Water').map((e) => e.getAttribute('data-entry-id'))).toEqual(['b', 'a']);
    fireEvent.click(button(container, 'More actions for the 10:00 AM water entry'));
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Edit time')!);
    const input = container.querySelector<HTMLInputElement>('input[type="time"]')!;
    expect(input.value).toBe('10:00');
    fireEvent.input(input, { target: { value: '12:30' } });
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await flush();
    expect(api.updateDrinkTime).toHaveBeenCalledWith('a', '12:30:00', 'tok');
    expect(entries(container, 'Water').map((e) => e.getAttribute('data-entry-id'))).toEqual(['a', 'b']);
    expect(entries(container, 'Water')[0].textContent).toContain('12:30 PM');
    expect(entries(container, 'Water')[0].textContent).toContain('4 oz');
    expect(total(container, 'Water')).toBe('8oz');
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it('saving the same time sends nothing', async () => {
    seed();
    const { container } = await mount();
    fireEvent.click(button(container, 'More actions for the 10:00 AM water entry'));
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Edit time')!);
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await flush();
    expect(api.updateDrinkTime).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="time"]')).toBeNull();
  });

  it('says so and keeps the field open when the save fails', async () => {
    seed();
    api.updateDrinkTime.mockResolvedValue({ ok: false, kind: 'network' });
    const { container } = await mount();
    fireEvent.click(button(container, 'More actions for the 10:00 AM water entry'));
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Edit time')!);
    fireEvent.input(container.querySelector('input[type="time"]')!, { target: { value: '09:00' } });
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await flush();
    expect(card(container, 'Water').querySelector('[role="alert"]')!.textContent).toBe("Couldn't save that time.");
    expect(container.querySelector('input[type="time"]')).not.toBeNull();
    expect(entries(container, 'Water')[1].textContent).toContain('10:00 AM');
  });
});

describe('deleting', () => {
  const seed = () =>
    api.getDrinks.mockResolvedValue({
      ok: true,
      data: {
        drinks: [drink('a', 'water', TODAY, '10:00:00'), drink('b', 'water', TODAY, '11:00:00')],
        water_goal_ml: 1893,
      },
    });
  const openDelete = (c: Element) => {
    fireEvent.click(button(c, 'More actions for the 10:00 AM water entry'));
    fireEvent.click([...c.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!);
  };

  it('asks first, then removes the entry and lowers the total', async () => {
    seed();
    api.deleteDrink.mockResolvedValue({ ok: true, data: drink('a', 'water', TODAY, '10:00:00') });
    mountConfirmHost();
    const { container } = await mount();
    openDelete(container);
    await openedConfirm();
    expect(confirmText()).toMatchObject({ title: 'Delete this drink?', confirm: 'Delete', cancel: 'Cancel' });
    expect(api.deleteDrink).not.toHaveBeenCalled();
    fireEvent.click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Delete')!);
    await flush();
    expect(api.deleteDrink).toHaveBeenCalledWith('a', 'tok');
    expect(entries(container, 'Water')).toHaveLength(1);
    expect(total(container, 'Water')).toBe('4oz');
  });

  it('cancelling changes nothing', async () => {
    seed();
    mountConfirmHost();
    const { container } = await mount();
    openDelete(container);
    await openedConfirm();
    fireEvent.click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Cancel')!);
    await flush();
    expect(api.deleteDrink).not.toHaveBeenCalled();
    expect(total(container, 'Water')).toBe('8oz');
  });

  it('keeps the entry and says so when the delete fails', async () => {
    seed();
    api.deleteDrink.mockResolvedValue({ ok: false, kind: 'network' });
    mountConfirmHost();
    const { container } = await mount();
    openDelete(container);
    await openedConfirm();
    fireEvent.click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Delete')!);
    await flush();
    expect(total(container, 'Water')).toBe('8oz');
    expect(card(container, 'Water').querySelector('[role="alert"]')!.textContent).toBe("Couldn't delete that drink.");
  });
});

describe('loading and failure', () => {
  it('shows a loading state with the add buttons disabled while the first read runs', async () => {
    let release!: (v: unknown) => void;
    api.getDrinks.mockReturnValue(new Promise((r) => (release = r)));
    const { container } = await mount();
    expect(card(container, 'Water').textContent).toContain('Loading…');
    expect(card(container, 'Alcohol').textContent).toContain('Loading…');
    expect(button(container, 'Add 4 ounces of water').disabled).toBe(true);
    expect(button(container, 'Add one alcoholic drink').disabled).toBe(true);
    release({ ok: true, data: { drinks: [], water_goal_ml: 1893 } });
    await flush();
    expect(button(container, 'Add 4 ounces of water').disabled).toBe(false);
  });

  it('shows the standard panel error with a retry, buttons disabled, when the read fails', async () => {
    api.getDrinks.mockResolvedValueOnce({ ok: false, kind: 'network' });
    const { container } = await mount();
    expect(card(container, 'Water').textContent).toContain("Couldn't load your drinks.");
    expect(button(container, 'Add 4 ounces of water').disabled).toBe(true);
    expect(button(container, 'Add one alcoholic drink').disabled).toBe(true);
    const retry = [...card(container, 'Water').querySelectorAll('button')].find((b) => b.textContent === 'Try again')!;
    fireEvent.click(retry);
    await flush();
    expect(api.getDrinks).toHaveBeenCalledTimes(2);
    expect(card(container, 'Water').textContent).not.toContain("Couldn't load");
    expect(button(container, 'Add 4 ounces of water').disabled).toBe(false);
  });
});

describe('the goal', () => {
  it('converts whole ounces to ml and refuses what the API would', () => {
    expect(ozToGoalMl('64')).toBe(1893);
    expect(ozToGoalMl('9')).toBe(266);
    expect(ozToGoalMl('8')).toBeNull();
    expect(ozToGoalMl('338')).toBe(9996);
    expect(ozToGoalMl('339')).toBeNull();
    expect(ozToGoalMl('6.5')).toBeNull();
    expect(ozToGoalMl('')).toBeNull();
    expect(ozToGoalMl('abc')).toBeNull();
  });

  it('saves through updateSetting and the Water card follows it without a reload', async () => {
    api.updateSetting.mockResolvedValue({ ok: true, data: { key: 'water_goal_ml', value: '2957', updated: 'u' } });
    const { container } = await mount();
    expect(card(container, 'Water').textContent).toContain('of 64 oz');
    let ok = false;
    await act(async () => {
      ok = await saveWaterGoal(2957, 'tok');
    });
    expect(ok).toBe(true);
    expect(api.updateSetting).toHaveBeenCalledWith('water_goal_ml', 2957, 'tok');
    expect(waterGoalMl.value).toBe(2957);
    expect(card(container, 'Water').textContent).toContain('of 100 oz');
  });

  it('keeps the old goal when the save fails', async () => {
    api.updateSetting.mockResolvedValue({ ok: false, kind: 'network' });
    expect(await saveWaterGoal(2957, 'tok')).toBe(false);
    expect(waterGoalMl.value).toBe(1893);
  });
});

describe('demo mode', () => {
  beforeEach(() => {
    demo.on = true;
  });

  it('shows cards populated from memory, makes no API call, and can add, edit and delete', async () => {
    mountConfirmHost();
    const { container } = await mount();
    expect(api.getDrinks).not.toHaveBeenCalled();
    expect(entries(container, 'Water').length).toBeGreaterThan(0);
    const before = Number(total(container, 'Water')!.replace('oz', ''));

    fireEvent.click(button(container, 'Add 4 ounces of water'));
    await flush();
    expect(Number(total(container, 'Water')!.replace('oz', ''))).toBe(before + 4);
    expect(api.logDrink).not.toHaveBeenCalled();

    const first = entries(container, 'Water')[0];
    const label = first.querySelector('.drink-more')!.getAttribute('aria-label')!;
    fireEvent.click(button(container, label));
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Edit time')!);
    fireEvent.input(container.querySelector('input[type="time"]')!, { target: { value: '03:15' } });
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    await flush();
    const last = (() => {
      const l = entries(container, 'Water');
      return l[l.length - 1];
    })();
    expect(last.textContent).toContain('3:15 AM');

    fireEvent.click(last.querySelector('.drink-more')!);
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!);
    await openedConfirm();
    fireEvent.click([...document.querySelectorAll('[role="dialog"] button')].find((b) => b.textContent === 'Delete')!);
    await flush();
    expect(Number(total(container, 'Water')!.replace('oz', ''))).toBe(before);
    expect(api.deleteDrink).not.toHaveBeenCalled();
  });

  it('adds through the state function without a token call', async () => {
    await addDrink('alcohol', 'tok');
    expect(drinkDays.value[TODAY].entries).toHaveLength(1);
    expect(api.logDrink).not.toHaveBeenCalled();
  });
});
