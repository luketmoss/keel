// #864: the macro share arithmetic, without rendering.
import { describe, expect, it } from 'vitest';
import { largestRemainder, macroLabel, macroShares, partShare, partsScale } from './macro-math';

const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);

describe('macroShares', () => {
  it('weighs grams by 4, 4 and 9 kcal', () => {
    const s = macroShares({ protein: 10, carbs: 10, fat: 10 });
    expect(s.state).toBe('shares');
    if (s.state !== 'shares') return;
    expect(s.kcal).toEqual({ protein: 40, carbs: 40, fat: 90 });
    expect(s.pct).toEqual({ protein: 24, carbs: 23, fat: 53 });
  });

  it('always adds to exactly 100, by the largest remainder', () => {
    for (const g of [
      { protein: 62, carbs: 140, fat: 48 },
      { protein: 1, carbs: 1, fat: 1 },
      { protein: 33, carbs: 33, fat: 33 },
      { protein: 7, carbs: 3, fat: 11 },
    ]) {
      const s = macroShares(g);
      if (s.state !== 'shares') throw new Error('expected shares');
      expect(sum(Object.values(s.pct))).toBe(100);
    }
    expect(largestRemainder([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('reads <1% for a share above 0 that rounds to 0, and 0% for a macro of 0', () => {
    const s = macroShares({ protein: 100, carbs: 100, fat: 0.01 });
    if (s.state !== 'shares') throw new Error('expected shares');
    expect(s.text).toEqual({ protein: '50%', carbs: '50%', fat: '<1%' });
    expect(s.kcal.fat).toBeGreaterThan(0);
    const z = macroShares({ protein: 10, carbs: 10, fat: 0 });
    if (z.state !== 'shares') throw new Error('expected shares');
    expect(z.text).toEqual({ protein: '50%', carbs: '50%', fat: '0%' });
  });

  it('has no share when a macro is null, or when all three are 0', () => {
    expect(macroShares({ protein: null, carbs: null, fat: null }).state).toBe('unknown');
    expect(macroShares({ protein: 5, carbs: null, fat: 3 }).state).toBe('unknown');
    expect(macroShares({ protein: 0, carbs: 0, fat: 0 }).state).toBe('empty');
  });

  it('labels the bar with every macro and its percentage', () => {
    expect(macroLabel({ protein: 62, carbs: 140, fat: 48 })).toBe(
      'Calories by macro: protein 20%, carbs 45%, fat 35%.',
    );
    expect(macroLabel({ protein: null, carbs: null, fat: null })).toBe('Calories by macro: not known.');
  });
});

describe('parts', () => {
  it('a part over its parent, whole, <1% below one, nothing without a parent', () => {
    expect(partShare(48, 140)).toBe('34%');
    expect(partShare(0.1, 140)).toBe('<1%');
    expect(partShare(0, 140)).toBe('0%');
    expect(partShare(5, 0)).toBeNull();
    expect(partShare(null, 140)).toBeNull();
    expect(partShare(5, null)).toBeNull();
  });

  it('scales to the parent, or to the parts when they come to more', () => {
    expect(partsScale(140, [48, 22])).toBe(140);
    expect(partsScale(50, [48, 22])).toBe(70);
    expect(partsScale(null, [null, 10])).toBe(10);
  });
});
