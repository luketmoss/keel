// #577 — the stored run and the clock arithmetic.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  FRESH_RUN,
  alertSlot,
  clearRun,
  loadRun,
  restView,
  runKey,
  saveRun,
  secondsSince,
  wholeSeconds,
} from './lift-run';

beforeEach(() => window.localStorage.clear());

describe('the stored run', () => {
  it('round-trips under thrive.lift.<id>', () => {
    const run = { ...FRESH_RUN, phase: 'rest' as const, stepIndex: 4, restStartedAt: 1000, restTarget: 90, restFor: 3 };
    saveRun('w1', run);
    expect(window.localStorage.getItem('thrive.lift.w1')).not.toBeNull();
    expect(runKey('w1')).toBe('thrive.lift.w1');
    expect(loadRun('w1')).toEqual(run);
    clearRun('w1');
    expect(loadRun('w1')).toBeNull();
  });

  it('reads nothing from garbage, and never throws', () => {
    window.localStorage.setItem(runKey('w1'), '{nope');
    expect(loadRun('w1')).toBeNull();
    window.localStorage.setItem(runKey('w1'), JSON.stringify({ phase: 'dancing', stepIndex: 1 }));
    expect(loadRun('w1')).toBeNull();
    window.localStorage.setItem(runKey('w1'), JSON.stringify({ phase: 'set', stepIndex: -2 }));
    expect(loadRun('w1')).toBeNull();
  });

  it('survives storage that throws', () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('full');
    };
    try {
      expect(() => saveRun('w1', FRESH_RUN)).not.toThrow();
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});

describe('the clocks', () => {
  it('count from the stored time, so 2 minutes away in a 1:30 rest reads about 3:30', () => {
    const started = 1_000_000;
    expect(secondsSince(started, started + 210_000)).toBe(210);
    expect(secondsSince(null, started)).toBe(0);
    expect(secondsSince(started, started - 5000)).toBe(0);
  });

  it('writes whole seconds, rounded', () => {
    expect(wholeSeconds(0, 41_400)).toBe(41);
    expect(wholeSeconds(0, 41_600)).toBe(42);
  });

  it('restView: up at the target, overtime after, never with no target', () => {
    expect(restView(89, 90)).toMatchObject({ up: false, over: 0 });
    expect(restView(90, 90)).toMatchObject({ up: true, over: 0, fraction: 1 });
    expect(restView(211, 90)).toMatchObject({ up: true, over: 121 });
    expect(restView(500, 0)).toEqual({ up: false, over: 0, fraction: 0 });
  });

  it('alertSlot: -1 before, 0 at the target, then every 30 s; none without a target', () => {
    expect(alertSlot(89, 90)).toBe(-1);
    expect(alertSlot(90, 90)).toBe(0);
    expect(alertSlot(119, 90)).toBe(0);
    expect(alertSlot(120, 90)).toBe(1);
    expect(alertSlot(300, 90)).toBe(7);
    expect(alertSlot(300, 0)).toBe(-1);
  });
});
