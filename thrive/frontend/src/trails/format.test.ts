// #682 — how a trail pass and its comparison are written.

import { describe, it, expect } from 'vitest';
import {
  NO_EARLIER_PASS,
  climbDiffText,
  comparisonLine,
  formatClimb,
  formatMiles,
  formatPassTime,
  formatPosition,
  formatShortDate,
  formatTrailDate,
  passLine,
  showsUnmatched,
  timeDiffText,
} from './format';
import type { GroupPass, TrailPass } from './types';

const pass: TrailPass = {
  trail: 'Juniper Ridge',
  metres: 3200,
  durationS: 872,
  climbM: 128,
  startPct: 0,
  endPct: 100,
  direction: 'forward',
  entryOffsetS: 42,
};

const prev = (date: string): GroupPass => ({ activityId: 'p', date, time: '08:00', variant: 'X', pass });

describe('formats', () => {
  it('writes position, time, climb and distance', () => {
    expect(formatPosition(0, 100)).toBe('0 → 100%');
    expect(formatPosition(100, 0)).toBe('100 → 0%');
    expect(formatPosition(40.4, 99.6)).toBe('40 → 100%');
    expect(formatPassTime(872)).toBe('14:32');
    expect(formatPassTime(3730)).toBe('1:02:10');
    expect(formatClimb(128)).toBe('↑ 420 ft');
    expect(formatClimb(378)).toBe('↑ 1,240 ft');
    expect(formatMiles(1931)).toBe('1.2 mi');
  });

  it('shows the unmatched distance from 0.1 mi', () => {
    expect(showsUnmatched(161)).toBe(true);
    expect(showsUnmatched(160)).toBe(false);
    expect(showsUnmatched(0)).toBe(false);
    expect(showsUnmatched(null)).toBe(false);
  });

  it('adds the year to a date only when it is not this year', () => {
    expect(formatTrailDate('2026-10-22', '2026-10-30')).toBe('Thu, Oct 22');
    expect(formatTrailDate('2025-10-23', '2026-10-30')).toBe('Thu, Oct 23, 2025');
    expect(formatShortDate('2026-10-03', '2026-10-30')).toBe('Oct 3');
    expect(formatShortDate('2025-10-03', '2026-10-30')).toBe('Oct 3, 2025');
  });

  it('writes the differences in words, with no colour needed', () => {
    expect(timeDiffText(-72)).toBe('1:12 faster');
    expect(timeDiffText(40)).toBe('0:40 slower');
    expect(timeDiffText(4)).toBe('Same time');
    expect(timeDiffText(-4)).toBe('Same time');
    expect(climbDiffText(6)).toBe('↑ 20 ft more');
    expect(climbDiffText(-6)).toBe('↑ 20 ft less');
    expect(climbDiffText(2)).toBeNull();
  });
});

describe('the pass row lines', () => {
  it('line 1 has the entry offset only when asked, and leaves unknown parts out', () => {
    expect(passLine(pass, true)).toBe('0:42 in · 0 → 100% · 14:32 · ↑ 420 ft');
    expect(passLine(pass, false)).toBe('0 → 100% · 14:32 · ↑ 420 ft');
    expect(passLine({ ...pass, durationS: null, climbM: null }, false)).toBe('0 → 100%');
  });

  it('line 2 compares, or says there is nothing to compare with', () => {
    const today = '2026-10-30';
    expect(comparisonLine({ previous: prev('2026-10-03'), timeDiffS: -72, climbDiffM: -6 }, today)).toBe(
      '1:12 faster · ↑ 20 ft less than Oct 3',
    );
    expect(comparisonLine({ previous: prev('2026-10-03'), timeDiffS: null, climbDiffM: 6 }, today)).toBe(
      '↑ 20 ft more than Oct 3',
    );
    expect(comparisonLine({ previous: prev('2026-10-03'), timeDiffS: 2, climbDiffM: 1 }, today)).toBe(
      'Same time as Oct 3',
    );
    expect(comparisonLine({ previous: prev('2026-10-03'), timeDiffS: null, climbDiffM: 1 }, today)).toBe(
      'Same climb as Oct 3',
    );
    expect(comparisonLine({ previous: null, timeDiffS: null, climbDiffM: null }, today)).toBe(NO_EARLIER_PASS);
    expect(comparisonLine({ previous: prev('2026-10-03'), timeDiffS: null, climbDiffM: null }, today)).toBe(
      NO_EARLIER_PASS,
    );
  });
});
