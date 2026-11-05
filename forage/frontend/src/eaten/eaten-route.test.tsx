// #825: `#/eaten/<date>` opens Eaten on that day, and the hash follows the day on screen.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import App from '../App';
import type { FoodLogEntry } from '../api/types';
import { _resetDemoApi } from '../api/use-api';
import { _resetDemoModeCache } from '../demo/is-demo-mode';
import { _resetFoods } from '../library/foods-store';
import { _resetRecipes } from '../library/recipes-store';
import { _resetPlan } from '../plan/plan-store';
import { eatenHash, parseEatenHash, parseHash } from '../shell/routes';
import { fakeApi } from '../test-api';
import { _resetEaten } from './eaten-store';

const env = import.meta.env as Record<string, string | undefined>;
// Monday 2 November 2026, 10:00 on the device.
const NOW = new Date(2026, 10, 2, 10, 0);
const TODAY = '2026-11-02';
const YESTERDAY = '2026-11-01';
const D2 = '2026-10-31';
const D3 = '2026-10-30';

function signIn() {
  localStorage.setItem('forage_user', JSON.stringify({ email: 'luke@example.com', name: 'Luke', picture: '' }));
  localStorage.setItem('forage_token', 'tok');
  localStorage.setItem('forage_token_expiry', String(Date.now() + 3_600_000));
}

async function settle() {
  for (let i = 0; i < 8; i++) await act(async () => {});
}

async function openAt(url: string) {
  window.history.replaceState(null, '', url);
  render(<App />);
  await settle();
}

async function go(hash: string) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await settle();
}

function logEntry(over: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: 'lg_1',
    date: TODAY,
    slot: 'Lunch',
    food_id: '',
    recipe_id: '',
    qty: 1,
    unit: 'g',
    grams: null,
    kcal: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    partial: false,
    source: 'app',
    logged_at: '2026-11-02T15:00:00Z',
    created: 'x',
    updated: 'x',
    ...over,
  };
}

const day = () => screen.getByTestId('eaten-day').textContent;
const click = async (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  await settle();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  signIn();
  _resetEaten();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('parsing the dated hash', () => {
  it('reads a valid past date as itself', () => {
    expect(parseEatenHash(`#/eaten/${D3}`, TODAY)).toEqual({ date: D3, rewrite: false });
    expect(parseHash(`#/eaten/${D3}`)).toBe('eaten');
  });

  it.each(['yesterday', '2026-3-4', '20260304', '2026-02-30', '2026-13-01', '2026-11-03', TODAY, ''])(
    'opens today and rewrites for #/eaten/%s',
    (given) => {
      expect(parseEatenHash(`#/eaten/${given}`, TODAY)).toEqual({ date: TODAY, rewrite: true });
      expect(parseHash(`#/eaten/${given}`)).toBe('eaten');
    },
  );

  it('leaves the bare route and other routes alone', () => {
    expect(parseEatenHash('#/eaten', TODAY)).toBeNull();
    expect(parseEatenHash('#/plan', TODAY)).toBeNull();
    expect(parseHash('#/eatenx')).toBeNull();
  });

  it('writes a dated hash before today and a plain one on it', () => {
    expect(eatenHash(YESTERDAY, TODAY)).toBe(`#/eaten/${YESTERDAY}`);
    expect(eatenHash(TODAY, TODAY)).toBe('#/eaten');
  });
});

describe('opening on a date', () => {
  it('opens Eaten on that day with its entries and the tab current', async () => {
    const api = fakeApi();
    api.log.push(logEntry({ id: 'lg_old', date: D3, kcal: 300, protein_g: 10, carbs_g: 20, fat_g: 5 }));
    await openAt(`/#/eaten/${D3}`);
    expect(day()).toBe('Fri 30 Oct');
    expect(screen.getByRole('group', { name: 'Totals for Friday 30 October 2026' })).toBeDefined();
    expect(screen.getByTestId('day-kcal').textContent).toBe('300');
    expect(screen.getByTestId('tab-eaten').getAttribute('aria-current')).toBe('page');
    expect(api.calls('getFoodLogTotals')[0].params.get('from')).toBe(D3);
    expect(window.location.hash).toBe(`#/eaten/${D3}`);
  });

  it('signed out shows sign-in, and the day opens after signing in', async () => {
    localStorage.clear();
    fakeApi();
    await openAt(`/#/eaten/${D3}`);
    expect(screen.queryByTestId('eaten-day')).toBeNull();
    cleanup();
    signIn();
    render(<App />);
    await settle();
    expect(day()).toBe('Fri 30 Oct');
  });

  it.each(['yesterday', '2026-3-4', '2026-02-30', '2026-11-03', TODAY, ''])(
    'a bad or plain date (%s) opens today and rewrites the hash in place',
    async (given) => {
      fakeApi();
      const before = window.history.length;
      await openAt(`/#/eaten/${given}`);
      expect(day()).toBe('Today');
      expect(screen.getByTestId('tab-eaten').getAttribute('aria-current')).toBe('page');
      expect(window.location.hash).toBe('#/eaten');
      expect(window.history.length).toBe(before);
    },
  );

  it('a fresh #/eaten opens today', async () => {
    fakeApi();
    await openAt('/#/eaten');
    expect(day()).toBe('Today');
    expect(window.location.hash).toBe('#/eaten');
  });
});

describe('the hash follows the day on screen', () => {
  it('rewrites in place through the day arrows without adding history', async () => {
    fakeApi();
    await openAt(`/#/eaten/${D3}`);
    const len = window.history.length;
    await click('Next day');
    expect(window.location.hash).toBe(`#/eaten/${D2}`);
    await click('Next day');
    expect(window.location.hash).toBe(`#/eaten/${YESTERDAY}`);
    await click('Next day');
    expect(window.location.hash).toBe('#/eaten');
    await click('Previous day');
    expect(window.location.hash).toBe(`#/eaten/${YESTERDAY}`);
    expect(window.history.length).toBe(len);
  });

  it('a reload on a dated hash reopens that day', async () => {
    fakeApi();
    await openAt(`/#/eaten/${D3}`);
    cleanup();
    _resetEaten();
    render(<App />);
    await settle();
    expect(day()).toBe('Fri 30 Oct');
  });

  it('switching to Plan and back returns to the same day with its dated hash', async () => {
    fakeApi();
    await openAt(`/#/eaten/${D3}`);
    await go('#/plan');
    expect(screen.queryByTestId('eaten-day')).toBeNull();
    await go('#/eaten');
    expect(day()).toBe('Fri 30 Oct');
    expect(window.location.hash).toBe(`#/eaten/${D3}`);
  });

  it('a hash change to another date moves there, and a late answer for the first day does not win', async () => {
    const api = fakeApi();
    api.log.push(logEntry({ id: 'lg_a', date: D3, kcal: 111 }), logEntry({ id: 'lg_b', date: D2, kcal: 222 }));
    await openAt(`/#/eaten/${D3}`);
    expect(screen.getByTestId('day-kcal').textContent).toBe('111');
    await go(`#/eaten/${D2}`);
    expect(day()).toBe('Sat 31 Oct');
    expect(screen.getByTestId('day-kcal').textContent).toBe('222');

    // The first day's totals answer lands after the second's.
    let release: (() => void) | undefined;
    const held = new Promise<void>((r) => (release = r));
    let first = true;
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (...args: Parameters<typeof fetch>) => {
      const url = String(args[0]);
      if (first && url.includes('action=getFoodLogTotals') && url.includes(`from=${D3}`)) {
        first = false;
        await held;
      }
      return realFetch(...args);
    });
    await go(`#/eaten/${D3}`);
    await go(`#/eaten/${D2}`);
    release?.();
    await settle();
    expect(day()).toBe('Sat 31 Oct');
    expect(screen.getByTestId('day-kcal').textContent).toBe('222');
  });
});

describe('demo mode', () => {
  beforeEach(() => {
    env.VITE_DEMO_MODE = 'true';
    _resetDemoModeCache();
    _resetDemoApi();
  });
  afterEach(() => {
    delete env.VITE_DEMO_MODE;
    _resetDemoModeCache();
    _resetDemoApi();
  });

  it('opens on yesterday with the two sample entries and keeps ?demo=true', async () => {
    await openAt(`/?demo=true#/eaten/${YESTERDAY}`);
    expect(day()).toBe('Yesterday');
    expect(screen.getAllByTestId('entry-row')).toHaveLength(2);
    expect(window.location.search).toBe('?demo=true');
    expect(window.location.hash).toBe(`#/eaten/${YESTERDAY}`);
  });
});
