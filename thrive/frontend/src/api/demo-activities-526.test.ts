// #526 — demo mode holds every case the Activities redesign (#525) draws, so
// each child can be seen and checked at 375px without a real account.

import { describe, it, expect } from 'vitest';
import { todayInDenver } from '../day/dates';
import { DEMO_EXERCISES, DEMO_SETS, DEMO_WORKOUTS, shiftDemoWorkouts } from './demo-data';
import { DEMO_TRACKS } from './demo-track';

// Noon UTC is the same Denver calendar day in both MST and MDT.
const at = (ymd: string) => new Date(`${ymd}T19:00:00.000Z`);
const month = (ymd: string) => ymd.slice(0, 7);
const monthsBefore = (ymd: string, n: number) => {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
};

const done = (w: { status: string }) => w.status === '';

describe('#526 AC3: three months of completed activities', () => {
  // The current month can only hold as many days as have passed; from the 4th it holds four or more.
  for (const today of ['2026-03-31', '2026-05-04', '2026-09-30', '2026-10-20', '2026-12-15', '2027-01-31']) {
    it(`holds completed activities in the month and the two before it (${today})`, () => {
      const rows = shiftDemoWorkouts(at(today)).filter(done);
      for (const n of [0, 1, 2]) {
        const m = monthsBefore(today, n);
        expect(rows.filter((w) => month(w.date) === m).length, m).toBeGreaterThanOrEqual(4);
      }
    });
  }
});

describe('#526 AC4: the four figure cases', () => {
  const rows = DEMO_WORKOUTS.filter(done);
  const hasDuration = (w: { elapsed_seconds: string; moving_seconds: string }) =>
    Boolean(w.elapsed_seconds || w.moving_seconds);

  it('a bike ride with a track', () => {
    const w = rows.find((x) => x.type === 'bike' && x.track_ref)!;
    expect(w).toBeTruthy();
    expect(w.id in DEMO_TRACKS).toBe(true);
    expect(hasDuration(w)).toBe(true);
  });

  it('a hike with a track', () => {
    const w = rows.find((x) => x.type === 'hike' && x.track_ref)!;
    expect(w.name).toBe('Ridge Trail');
    expect(w.id in DEMO_TRACKS).toBe(true);
    expect(hasDuration(w)).toBe(true);
  });

  it('a bike ride with a distance and no track', () => {
    const w = rows.find((x) => x.type === 'bike' && !x.track_ref && x.distance_m)!;
    expect(w).toBeTruthy();
    expect(hasDuration(w)).toBe(true);
  });

  it('a walk with no distance and no track', () => {
    const w = rows.find((x) => x.type === 'walk' && !x.distance_m && !x.track_ref)!;
    expect(w).toBeTruthy();
    expect(hasDuration(w)).toBe(true);
  });

  it('a stretch with a note and an effort, and one with neither', () => {
    const stretches = rows.filter((x) => x.type === 'stretch');
    expect(stretches.some((x) => x.notes && x.effort)).toBe(true);
    expect(stretches.some((x) => !x.notes && !x.effort)).toBe(true);
  });
});

describe('#526 AC5: muscle tags', () => {
  const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core'];
  const tagsOf = new Map(DEMO_EXERCISES.map((e) => [e.id, e.tags.split(',').map((t) => t.trim())]));
  const weightIds = DEMO_WORKOUTS.filter((w) => w.type === 'weight').map((w) => w.id);

  /** The muscle tags of a workout's exercises, warm-ups left out. */
  const muscles = (id: string) => {
    const found = new Set<string>();
    for (const s of DEMO_SETS.filter((x) => x.workout_id === id && x.section !== 'warmup')) {
      for (const t of tagsOf.get(s.exercise_id) ?? []) if (MUSCLES.includes(t)) found.add(t);
    }
    return found;
  };

  it('carry each of the six between them', () => {
    const all = new Set(weightIds.flatMap((id) => [...muscles(id)]));
    expect([...all].sort()).toEqual([...MUSCLES].sort());
  });

  it('one weight workout with sets carries none of them', () => {
    expect(weightIds.some((id) => DEMO_SETS.some((s) => s.workout_id === id) && muscles(id).size === 0)).toBe(true);
  });

  it('one weight workout has Back only on a warm-up exercise', () => {
    const found = weightIds.some((id) => {
      const sets = DEMO_SETS.filter((s) => s.workout_id === id);
      const backOn = (warm: boolean) =>
        sets.some((s) => (s.section === 'warmup') === warm && tagsOf.get(s.exercise_id)?.includes('Back'));
      return backOn(true) && !backOn(false);
    });
    expect(found).toBe(true);
  });

  it('every set points at a demo exercise', () => {
    const ids = new Set(DEMO_EXERCISES.map((e) => e.id));
    for (const s of DEMO_SETS) expect(ids.has(s.exercise_id), s.exercise_id).toBe(true);
  });
});

describe('#526 AC6: plans', () => {
  it('has at least three after today, one today and one overdue', () => {
    const now = at('2026-09-30');
    const planned = shiftDemoWorkouts(now).filter((w) => w.status === 'planned');
    const today = todayInDenver(now);
    expect(planned.filter((w) => w.date > today).length).toBeGreaterThanOrEqual(3);
    expect(planned.filter((w) => w.date === today).length).toBe(1);
    expect(planned.filter((w) => w.date < today).length).toBe(1);
  });
});

describe('#526 AC7: demo tracks stay invented', () => {
  it('each track is a made-up line in the middle of nowhere, not a real route', () => {
    for (const t of Object.values(DEMO_TRACKS)) {
      for (const [lon, lat] of t.geometry.coordinates) {
        expect(lat).toBeGreaterThan(44);
        expect(lat).toBeLessThan(45.1);
        expect(lon).toBeGreaterThan(-100.2);
        expect(lon).toBeLessThan(-99.3);
      }
    }
  });

  it('the ride is about 12 km with a 300 m climb and a gap of 5 in its elevation', () => {
    const t = DEMO_TRACKS.w_demo011;
    const cs = t.geometry.coordinates;
    const km = cs.slice(1).reduce((sum, [lon, lat], i) => {
      const [lon0, lat0] = cs[i];
      const dx = (lon - lon0) * 111.32 * Math.cos((lat * Math.PI) / 180);
      const dy = (lat - lat0) * 110.57;
      return sum + Math.hypot(dx, dy);
    }, 0);
    expect(km).toBeGreaterThan(11);
    expect(km).toBeLessThan(14);
    const ele = t.properties.ele;
    expect(ele.length).toBe(cs.length);
    const known = ele.filter((e): e is number => e !== null);
    const climb = Math.max(...known) - Math.min(...known);
    expect(climb).toBeGreaterThan(280);
    expect(climb).toBeLessThan(340);
    const gaps = ele.map((e, i) => (e === null ? i : -1)).filter((i) => i >= 0);
    expect(gaps.length).toBe(5);
    expect(gaps[4] - gaps[0]).toBe(4);
    expect(gaps[0]).toBeGreaterThan(ele.length / 3);
    expect(gaps[4]).toBeLessThan((2 * ele.length) / 3);
  });
});
