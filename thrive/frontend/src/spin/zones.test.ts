// #771 — the power zones: #767's whole-number bands and the watt ranges the zones card prints.

import { describe, expect, it } from 'vitest';
import { zoneOf, zoneRange } from './zones';

describe('zoneOf', () => {
  it.each([
    [0, 1],
    [55, 1],
    [56, 2],
    [75, 2],
    [76, 3],
    [90, 3],
    [91, 4],
    [105, 4],
    [106, 5],
    [120, 5],
    [121, 6],
    [200, 6],
  ])('%i%% of FTP is Z%i', (pct, zone) => {
    expect(zoneOf(pct, 100)).toBe(zone);
  });

  it('puts a fractional percentage where the same bound puts a whole one', () => {
    expect(zoneOf(55.9, 100)).toBe(1);
    expect(zoneOf(139.9, 250)).toBe(1);
    expect(zoneOf(140, 250)).toBe(2);
  });

  it('is exact at an FTP where a bound is not a whole number of watts', () => {
    // 91% of 250 is 227.5: 227 is Z3, 228 is Z4.
    expect(zoneOf(227, 250)).toBe(3);
    expect(zoneOf(228, 250)).toBe(4);
  });
});

describe('zoneRange', () => {
  it('at FTP 250 reads as the issue says', () => {
    expect([1, 2, 3, 4, 5, 6].map((z) => zoneRange(z, 250))).toEqual([
      '< 140 W',
      '140–189 W',
      '190–227 W',
      '228–264 W',
      '265–302 W',
      '≥ 303 W',
    ]);
  });

  it('agrees with zoneOf at every whole watt', () => {
    const ftp = 233;
    for (let w = 0; w <= 400; w++) {
      const range = zoneRange(zoneOf(w, ftp), ftp);
      const nums = range.match(/\d+/g)!.map(Number);
      if (range.startsWith('<')) expect(w).toBeLessThan(nums[0]);
      else if (range.startsWith('≥')) expect(w).toBeGreaterThanOrEqual(nums[0]);
      else {
        expect(w).toBeGreaterThanOrEqual(nums[0]);
        expect(w).toBeLessThanOrEqual(nums[1]);
      }
    }
  });
});
