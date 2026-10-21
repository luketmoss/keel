// #551 - the seven bars under the Water and Alcohol tiles: which days are empty
// slots, which are zero-height bars, how tall a bar is, and what it says aloud.
import { describe, it, expect } from 'vitest';
import type { Drink } from '../../api/drinks';
import type { DayDrinks } from '../../state/drinks';
import { ALCOHOL_FULL, barHeight, drinkWeek, weekLabel } from './drink-week';

const D = '2026-10-20';

function drink(id: string, kind: 'water' | 'alcohol', date: string, amount: number): Drink {
  return {
    id,
    kind,
    amount,
    date,
    time: '09:00:00',
    logged_at_utc: `${date}T09:00:00Z`,
    source: 'app',
    created: '',
    updated: '',
  };
}

const loaded = (rows: Drink[]) => ({ state: 'loaded' as const, rows });
const day = (entries: Drink[]): DayDrinks => ({ status: 'loaded', entries });

describe('drinkWeek', () => {
  it('is the 7 days ending on the viewed day, oldest first', () => {
    const rows = [drink('a', 'water', '2026-10-14', 118), drink('b', 'water', '2026-10-17', 236)];
    expect(drinkWeek('water', D, loaded(rows), day([drink('c', 'water', D, 118)]))).toEqual([
      118, 0, 0, 236, 0, 0, 118,
    ]);
  });

  it('leaves days before the first drink ever logged as empty slots, and later quiet days at zero', () => {
    const rows = [drink('a', 'alcohol', '2026-10-17', 1)];
    expect(drinkWeek('water', D, loaded(rows), day([]))).toEqual([null, null, null, 0, 0, 0, 0]);
    expect(drinkWeek('alcohol', D, loaded(rows), day([]))).toEqual([null, null, null, 1, 0, 0, 0]);
  });

  it('is all empty when nothing has ever been logged', () => {
    expect(drinkWeek('water', D, loaded([]), day([]))).toEqual(Array(7).fill(null));
  });

  it('reads the viewed day from its own entries, so an unsaved tap counts', () => {
    const rows = [drink('a', 'water', '2026-10-19', 118)];
    const viewed = day([{ ...drink('p', 'water', D, 118), pending: true } as Drink]);
    expect(drinkWeek('water', D, loaded(rows), viewed).slice(-1)[0]).toBe(118);
  });

  it('sums a kind only', () => {
    const rows = [drink('a', 'water', '2026-10-19', 118), drink('b', 'alcohol', '2026-10-19', 2)];
    expect(drinkWeek('alcohol', D, loaded(rows), day([])).slice(-2)[0]).toBe(2);
    expect(drinkWeek('water', D, loaded(rows), day([])).slice(-2)[0]).toBe(118);
  });

  it('shows only the viewed day while the history has not loaded', () => {
    const viewed = day([drink('c', 'water', D, 118)]);
    expect(drinkWeek('water', D, { state: 'loading' }, viewed)).toEqual([null, null, null, null, null, null, 118]);
    expect(drinkWeek('water', D, { state: 'error' }, viewed).slice(-1)[0]).toBe(118);
  });

  it('draws nothing for the viewed day until its own read has landed', () => {
    const rows = [drink('a', 'water', '2026-10-19', 118)];
    expect(drinkWeek('water', D, loaded(rows), { status: 'loading', entries: [] }).slice(-1)[0]).toBeNull();
    expect(drinkWeek('water', D, loaded(rows), undefined).slice(-1)[0]).toBeNull();
  });
});

describe('barHeight', () => {
  it('is water against the goal, capped at full', () => {
    expect(barHeight('water', 946, 1893)).toBeCloseTo(0.4997, 3);
    expect(barHeight('water', 1893, 1893)).toBe(1);
    expect(barHeight('water', 2500, 1893)).toBe(1);
  });

  it('is alcohol against four drinks, capped at full', () => {
    expect(ALCOHOL_FULL).toBe(4);
    expect(barHeight('alcohol', 1, 1893)).toBe(0.25);
    expect(barHeight('alcohol', 9, 1893)).toBe(1);
  });

  it('is zero for nothing, and for a goal that is not there', () => {
    expect(barHeight('water', 0, 1893)).toBe(0);
    expect(barHeight('water', 118, 0)).toBe(0);
  });
});

describe('weekLabel', () => {
  it('lists water in ounces and says "no data" for an empty slot', () => {
    expect(weekLabel('water', [946, 1419, 1893, 590, null, 1182, 236])).toBe(
      'Water, last 7 days: 32, 48, 64, 20, no data, 40, 8 ounces',
    );
  });

  it('lists alcohol as a count of drinks', () => {
    expect(weekLabel('alcohol', [null, 0, 2, 1, 0, 0, 1])).toBe(
      'Alcohol, last 7 days: no data, 0, 2, 1, 0, 0, 1 drinks',
    );
  });
});
