// #790: at most one quiet refresh in flight per store, a log save's refresh reads only the log and its totals, and
// the Library's foods carry the same guards as the other stores. The stores are driven directly, with every read
// held until the test releases it, so the calls are counted.
import { beforeEach, describe, expect, it } from 'vitest';
import type { ForageApi } from './client';
import type { Food, FoodLogEntry, PlanEntry, RecipeSummary } from './types';
import { quietGate } from './quiet-gate';
import {
  _resetEaten,
  dayEntries,
  dayState,
  dayTotals,
  eatenDate,
  loadDay,
  moveDay,
  refreshDay,
  upsertEntry,
} from '../eaten/eaten-store';
import { _resetFoods, keepFood, libraryFoods, loadFoods, refreshFoods } from '../library/foods-store';
import { _resetRecipes, loadRecipes, recipes, refreshRecipes } from '../library/recipes-store';
import { _resetPlan, loadPlan, planEntries, refreshPlan, upsertMeal } from '../plan/plan-store';
import { localDate } from '../cook/format';

/** A fake API whose every read waits to be released, oldest first, with the answer the test gives it. */
function heldApi() {
  const calls: string[] = [];
  const held = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }[]>();
  let log: FoodLogEntry[] = [];
  let foods: Food[] = [];
  let plan: PlanEntry[] = [];
  const hold = (name: string, answer: () => unknown) => () => {
    calls.push(name);
    // The answer is what the sheet holds when the read is sent, as a real read's would be.
    const snapshot = answer();
    return new Promise((resolve, reject) => {
      const q = held.get(name) ?? [];
      q.push({ resolve: () => resolve(snapshot), reject });
      held.set(name, q);
    });
  };
  const api = {
    getFoodLog: hold('getFoodLog', () => log),
    getFoodLogTotals: hold('getFoodLogTotals', () => ({
      days: log.length ? [{ date: localDate(), kcal: log.length * 100 }] : [],
    })),
    getPlan: hold('getPlan', () => ({ entries: plan, not_on_trip: 0, late_meals: [] })),
    getTrip: hold('getTrip', () => null),
    getFoods: hold('getFoods', () => foods),
    getRecipes: hold('getRecipes', () => [] as RecipeSummary[]),
  } as unknown as ForageApi;
  return {
    api,
    calls,
    count: (name: string) => calls.filter((c) => c === name).length,
    pending: () => [...held.values()].reduce((n, q) => n + q.length, 0),
    setLog(next: FoodLogEntry[]) {
      log = next;
    },
    setPlan(next: PlanEntry[]) {
      plan = next;
    },
    setFoods(next: Food[]) {
      foods = next;
    },
    /** Answer every held read, in order, until none is left. */
    async release() {
      for (let i = 0; i < 50; i++) {
        const next = [...held.entries()].find(([, q]) => q.length);
        if (!next) return;
        next[1].shift()!.resolve(undefined);
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
      }
    },
    /** Answer the held read of this name at `i`, out of order. */
    async resolveAt(name: string, i: number) {
      held.get(name)!.splice(i, 1)[0].resolve(undefined);
      await tick();
    },
    /** Fail the next held read of this name. */
    fail(name: string) {
      held.get(name)?.shift()?.reject(new Error('boom'));
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const today = () => localDate();

function logEntry(id: string, at: string): FoodLogEntry {
  return {
    id,
    date: today(),
    slot: 'Dinner',
    food_id: 'fd_a',
    recipe_id: '',
    qty: 1,
    unit: 'g',
    grams: 100,
    kcal: 100,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    partial: false,
    source: 'app',
    logged_at: at,
    created: 'x',
    updated: 'x',
  } as FoodLogEntry;
}

function food(id: string): Food {
  return { id, name: id, kind: 'ingredient', brand: '', category: '', source: 'manual' } as unknown as Food;
}

beforeEach(() => {
  _resetEaten();
  _resetPlan();
  _resetRecipes();
  _resetFoods();
});

describe('the quiet gate', () => {
  it('runs one now, and one more after it settles however many ask meanwhile', async () => {
    const gate = quietGate();
    let runs = 0;
    let release!: () => void;
    const run = () => {
      runs++;
      return new Promise<void>((r) => (release = r));
    };
    const done = gate.request(run);
    gate.request(run);
    gate.request(run);
    gate.request(run);
    expect(runs).toBe(1);
    release();
    await tick();
    expect(runs).toBe(2);
    release();
    await done;
    expect(runs).toBe(2);
  });

  it('cancel drops the queued one', async () => {
    const gate = quietGate();
    let runs = 0;
    let release!: () => void;
    const run = () => {
      runs++;
      return new Promise<void>((r) => (release = r));
    };
    const done = gate.request(run);
    gate.request(run);
    gate.cancel();
    release();
    await done;
    expect(runs).toBe(1);
  });
});

describe('Eaten', () => {
  it('five saves while the first refresh is out cause at most two refreshes, and the last lands with every entry', async () => {
    const h = heldApi();
    await Promise.all([
      (async () => {
        const full = loadDay(h.api);
        await h.release();
        await full;
      })(),
    ]);
    h.calls.length = 0;
    h.setLog([]);
    const logged: FoodLogEntry[] = [];
    for (let i = 1; i <= 5; i++) {
      const e = logEntry(`lg_${i}`, `2026-11-02T1${i}:00:00Z`);
      logged.push(e);
      h.setLog([...logged]);
      upsertEntry(e);
      void refreshDay(h.api);
      await tick();
    }
    // One refresh is out, and each of its two reads was asked for once.
    expect(h.count('getFoodLog')).toBe(1);
    await h.release();
    await tick();
    expect(h.count('getFoodLog')).toBe(2);
    expect(h.count('getFoodLogTotals')).toBe(2);
    expect(dayEntries.value.map((e) => e.id)).toEqual(['lg_1', 'lg_2', 'lg_3', 'lg_4', 'lg_5']);
    expect(dayTotals.value?.kcal).toBe(500);
  });

  it('a quiet refresh reads only the log and the totals; a full load reads all five', async () => {
    const h = heldApi();
    const full = loadDay(h.api);
    await h.release();
    await full;
    expect(h.calls.sort()).toEqual(['getFoodLog', 'getFoodLogTotals', 'getFoods', 'getPlan', 'getRecipes']);
    h.calls.length = 0;
    const quiet = refreshDay(h.api);
    await h.release();
    await quiet;
    expect(h.calls.sort()).toEqual(['getFoodLog', 'getFoodLogTotals']);
  });

  it('a refresh after a recipe changed also reads the recipes, even when it is the queued one', async () => {
    const h = heldApi();
    const full = loadDay(h.api);
    await h.release();
    await full;
    h.calls.length = 0;
    void refreshDay(h.api);
    await tick();
    void refreshDay(h.api, true);
    await h.release();
    await tick();
    expect(h.count('getRecipes')).toBe(1);
    expect(h.count('getPlan')).toBe(0);
    expect(h.count('getFoodLog')).toBe(2);
  });

  it('a quiet refresh that supersedes a full load still reads everything', async () => {
    const h = heldApi();
    const full = loadDay(h.api);
    await tick();
    void refreshDay(h.api);
    await h.release();
    await full;
    expect(h.count('getPlan')).toBe(2);
    expect(h.count('getFoods')).toBe(2);
    expect(dayState.value).toBe('ready');
  });

  it('a failed quiet refresh shows nothing, and the queued one still runs', async () => {
    const h = heldApi();
    const full = loadDay(h.api);
    await h.release();
    await full;
    h.calls.length = 0;
    void refreshDay(h.api);
    await tick();
    void refreshDay(h.api);
    h.fail('getFoodLog');
    await tick();
    await tick();
    expect(dayState.value).toBe('ready');
    await h.release();
    await tick();
    expect(h.count('getFoodLog')).toBe(2);
  });

  it('moving the day while a refresh is queued means the queued one never runs', async () => {
    const h = heldApi();
    const full = loadDay(h.api);
    await h.release();
    await full;
    h.calls.length = 0;
    void refreshDay(h.api);
    await tick();
    void refreshDay(h.api);
    moveDay(h.api, -1);
    expect(eatenDate.value).not.toBe(today());
    await h.release();
    await tick();
    // The first quiet read, then the move's five; the queued refresh was cancelled.
    expect(h.count('getFoodLog')).toBe(2);
    expect(h.count('getPlan')).toBe(1);
  });
});

describe('Plan and the Library recipe list', () => {
  it('Plan: five saves while a refresh is out cause at most two refreshes', async () => {
    const h = heldApi();
    const first = loadPlan(h.api);
    await h.release();
    await first;
    h.calls.length = 0;
    const saved: PlanEntry[] = [];
    for (let i = 0; i < 5; i++) {
      const meal = { id: `pl_${i}`, date: today(), slot: 'Dinner', created: String(i) } as PlanEntry;
      saved.push(meal);
      h.setPlan([...saved]);
      upsertMeal(meal);
      void refreshPlan(h.api);
      await tick();
    }
    await h.release();
    await tick();
    expect(h.count('getPlan')).toBe(2);
    expect(planEntries.value).toHaveLength(5);
  });

  it('Recipes: five saves while a refresh is out cause at most two refreshes', async () => {
    const h = heldApi();
    const first = loadRecipes(h.api);
    await h.release();
    await first;
    h.calls.length = 0;
    for (let i = 0; i < 5; i++) {
      void refreshRecipes(h.api);
      await tick();
    }
    await h.release();
    await tick();
    expect(h.count('getRecipes')).toBe(2);
    expect(recipes.value).toEqual([]);
  });
});

describe('Library foods', () => {
  it('five refreshes while one is out cause at most two reads', async () => {
    const h = heldApi();
    for (let i = 0; i < 5; i++) {
      void refreshFoods(h.api);
      await tick();
    }
    await h.release();
    await tick();
    expect(h.count('getFoods')).toBe(2);
  });

  it('an answer that began before a save does not replace the list', async () => {
    const h = heldApi();
    h.setFoods([food('fd_old')]);
    void refreshFoods(h.api);
    await tick();
    keepFood(food('fd_new'));
    await h.release();
    await tick();
    expect(libraryFoods.value.map((f) => f.id)).toContain('fd_new');
    // The trailing refresh began after the save, and what it answers lands.
    expect(h.count('getFoods')).toBe(1);
  });

  it('an older answer never replaces a newer load', async () => {
    const h = heldApi();
    h.setFoods([food('fd_old')]);
    const older = loadFoods(h.api);
    await tick();
    h.setFoods([food('fd_newer')]);
    const newer = loadFoods(h.api);
    await tick();
    // Answer the newer one first, then the older.
    await h.resolveAt('getFoods', 1);
    await h.resolveAt('getFoods', 0);
    await Promise.all([older, newer]);
    expect(libraryFoods.value.map((f) => f.id)).toEqual(['fd_newer']);
  });

  it('a failed quiet refresh leaves the list and the state alone', async () => {
    const h = heldApi();
    h.setFoods([food('fd_a')]);
    const first = loadFoods(h.api);
    await h.release();
    await first;
    void refreshFoods(h.api);
    await tick();
    h.fail('getFoods');
    await tick();
    expect(libraryFoods.value.map((f) => f.id)).toEqual(['fd_a']);
  });
});
