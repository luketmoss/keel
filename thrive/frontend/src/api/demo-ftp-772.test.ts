// #772 — demo mode shows FTP history over a year (ramp tests and hand-set, most on a day with a weight),
// a Spin library of four workouts, and one planned bike linked to one of them. Checked at several `now`s,
// because which days carry a weight moves with today.

import { describe, it, expect } from 'vitest';
import { addDays, dayNumber, todayInDenver } from '../day/dates';
import { DEMO_WORKOUTS, demoBodyMeasurements, demoFtpHistory } from './demo-data';
import { DEMO_RIDE_WORKOUTS } from './demo-spin';
import { currentFtp, FTP_SOURCES } from './spin-rows';

const NOWS = [
  new Date('2026-09-30T18:05:00Z'),
  new Date('2026-11-02T13:00:00Z'),
  new Date('2027-03-15T02:10:00Z'),
  new Date('2027-01-01T23:59:00Z'),
  new Date('2026-12-20T15:00:00Z'),
];

describe('demoFtpHistory', () => {
  it.each(NOWS)('has seven settings over a year, none after today, one to a date (%s)', (now) => {
    const rows = demoFtpHistory(now, 'ok');
    const today = todayInDenver(now);
    expect(rows).toHaveLength(7);
    expect(new Set(rows.map((r) => r.date)).size).toBe(7);
    expect(rows.every((r) => r.date <= today && FTP_SOURCES.includes(r.source as never))).toBe(true);
    const dates = rows.map((r) => r.date).sort();
    expect(dayNumber(dates[dates.length - 1]) - dayNumber(dates[0])).toBeGreaterThanOrEqual(365 - 5);
    expect(new Set(rows.map((r) => r.source))).toEqual(new Set(['ramp_test', 'manual']));
    expect(rows.every((r) => Number(r.ftp_w) > 0 && r.id && r.created)).toBe(true);
    // The newest is the 250 W the demo Spin rides were ridden at.
    expect(currentFtp(rows)!.ftp_w).toBe('250');
  });

  it.each(NOWS)('puts most settings on a day with a scale weight, and some on none (%s)', (now) => {
    const rows = demoFtpHistory(now, 'ok');
    const weighed = new Set(
      demoBodyMeasurements(now, 'ok')
        .filter((m) => m.kind === 'scale' && m.weight_kg !== '')
        .map((m) => m.date),
    );
    const withWeight = rows.filter((r) => weighed.has(r.date));
    expect(withWeight.length).toBeGreaterThanOrEqual(5);
    expect(withWeight.length).toBeLessThan(rows.length);
  });

  it('is empty for health=empty and fails for health=error, like the other health tabs', () => {
    expect(demoFtpHistory(NOWS[0], 'empty')).toEqual([]);
    expect(() => demoFtpHistory(NOWS[0], 'error')).toThrow();
    expect(addDays('2026-01-01', 1)).toBe('2026-01-02');
  });
});

describe('the demo library and plan', () => {
  it('has four Spin workouts, each with a name, category and duration', () => {
    expect(DEMO_RIDE_WORKOUTS).toHaveLength(4);
    for (const w of DEMO_RIDE_WORKOUTS) expect(w.name && w.category && Number(w.duration_s) > 0).toBeTruthy();
  });

  it('has one planned bike linked to a workout in the library', () => {
    const linked = DEMO_WORKOUTS.filter((w) => w.status === 'planned' && w.type === 'bike' && w.ride_workout_id);
    expect(linked).toHaveLength(1);
    expect(DEMO_RIDE_WORKOUTS.map((w) => w.id)).toContain(linked[0].ride_workout_id);
  });
});
