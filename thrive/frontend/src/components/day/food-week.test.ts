// #714 - the Food card's seven-day strip: the window, the gaps, the heights and the spoken names.
import { describe, it, expect } from 'vitest';
import type { FoodDay } from '../../api/forage-food';
import { foodWeek, wholeNumber } from './food-week';

const D = '2026-11-02'; // a Monday

function day(date: string, over: Partial<FoodDay> = {}): FoodDay {
  return {
    date,
    entries: 3,
    unknown_entries: 0,
    kcal: 1000,
    protein_g: 50,
    carbs_g: 100,
    fat_g: 40,
    partial: false,
    ...over,
  };
}

describe('wholeNumber', () => {
  it('rounds to whole numbers with a thousands separator', () => {
    expect(wholeNumber(1240.4)).toBe('1,240');
    expect(wholeNumber(62.5)).toBe('63');
    expect(wholeNumber(48)).toBe('48');
  });
});

describe('foodWeek', () => {
  it('is the viewed day and the six before it, oldest first', () => {
    const week = foodWeek(D, []);
    expect(week.map((d) => d.date)).toEqual([
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    expect(week.map((d) => d.letter)).toEqual(['T', 'W', 'T', 'F', 'S', 'S', 'M']);
  });

  it('draws a day Forage did not report as a gap, never a zero-height bar, and names it', () => {
    const week = foodWeek(D, [day('2026-11-02', { kcal: 2000 }), day('2026-11-01', { kcal: 1000 })]);
    expect(week[6].height).toBe(1);
    expect(week[5].height).toBe(0.5);
    expect(week[4]).toMatchObject({ height: null, name: 'Saturday, nothing logged' });
    expect(week.filter((d) => d.height === 0)).toEqual([]);
  });

  it('is seven gaps when nothing is reported', () => {
    const week = foodWeek(D, []);
    expect(week.every((d) => d.height === null)).toBe(true);
  });

  it('names a day by its kcal, and low when it is partial', () => {
    const week = foodWeek(D, [day('2026-11-02', { kcal: 1240.4 }), day('2026-11-01', { kcal: 980, partial: true })]);
    expect(week[6].name).toBe('Monday, 1,240 kcal');
    expect(week[5]).toMatchObject({ name: 'Sunday, 980 kcal, low', partial: true });
  });

  it('draws a day whose entries all lack nutrition as a gap that says so', () => {
    const week = foodWeek(D, [
      day('2026-11-02', { kcal: null, protein_g: null, carbs_g: null, fat_g: null, unknown_entries: 3, partial: true }),
    ]);
    expect(week[6]).toMatchObject({ height: null, name: 'Monday, no nutrition yet' });
  });

  it('scales bars to the highest day of the window', () => {
    const week = foodWeek(D, [day('2026-10-30', { kcal: 3000 }), day('2026-11-02', { kcal: 1500 })]);
    expect(week[3].height).toBe(1);
    expect(week[6].height).toBe(0.5);
  });
});
