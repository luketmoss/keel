// #667 — what the Logbook draws, derived from the tracker's list.
import { describe, it, expect } from 'vitest';
import type { TrackerExercise } from './exercise-row';
import type { TrackerSet } from './set-row';
import {
  addToSection,
  moveToSectionEnd,
  progressOf,
  reassignOrders,
  stepField,
  tileLabel,
  tileValue,
  trackerCards,
} from './tracker-model';

const set = (n: number, over: Partial<TrackerSet> = {}): TrackerSet => ({
  set_number: n,
  planned_reps: '',
  weight: '',
  reps: '',
  effort: '',
  saved: false,
  sheetRow: -1,
  ...over,
});

const ex = (key: string, section: string, order: number, sets: TrackerSet[] = [set(1)]): TrackerExercise => ({
  exercise_id: `id_${key}`,
  exercise_name: key,
  section,
  exercise_order: order,
  sets: section === 'warmup' ? [] : sets,
  quickFillWeight: '',
  quickFillReps: '',
  quickFillEffort: '',
  rowKey: key,
});

const keys = (list: readonly TrackerExercise[]) => list.map((e) => e.rowKey);
const orders = (list: readonly TrackerExercise[]) => Object.fromEntries(list.map((e) => [e.rowKey, e.exercise_order]));

describe('trackerCards', () => {
  it('makes a card per section, in order of first appearance, each in order', () => {
    const list = [
      ex('d', 'SS1', 4),
      ex('a', 'warmup', 1),
      ex('c', 'primary', 3),
      ex('b', 'primary', 2),
      ex('e', 'primary', 5),
    ];
    const cards = trackerCards(list);
    expect(cards.map((c) => [c.section, c.title, keys(c.exercises)])).toEqual([
      ['warmup', 'Warm-up', ['a']],
      ['primary', 'Primary', ['b', 'c', 'e']],
      ['SS1', 'Superset 1', ['d']],
    ]);
  });

  it('groups an interleaved section into the card where it first appears', () => {
    const cards = trackerCards([ex('a', 'primary', 1), ex('b', 'SS1', 2), ex('c', 'primary', 3)]);
    expect(cards.map((c) => keys(c.exercises))).toEqual([['a', 'c'], ['b']]);
  });
});

describe('reassignOrders', () => {
  it('hands the orders the list holds to the new sequence, in order', () => {
    const list = [ex('a', 'primary', 2), ex('b', 'primary', 5), ex('c', 'primary', 9)];
    const out = reassignOrders(list, [list[2], list[0], list[1]]);
    expect(keys(out)).toEqual(['c', 'a', 'b']);
    expect(orders(out)).toEqual({ c: 2, a: 5, b: 9 });
  });

  it('gives an exercise new to the list the orders above the highest', () => {
    const list = [ex('a', 'primary', 1), ex('b', 'primary', 2)];
    const added = [ex('x', 'primary', 0), ex('y', 'primary', 0)];
    const out = reassignOrders(list, [list[0], added[0], added[1], list[1]]);
    expect(orders(out)).toEqual({ a: 1, x: 2, y: 3, b: 4 });
  });
});

describe('moveToSectionEnd', () => {
  it('puts an exercise at the end of its (already changed) section, renumbering from the drawn order', () => {
    const list = [ex('a', 'primary', 1), ex('b', 'SS1', 2), ex('c', 'primary', 3), ex('d', 'SS1', 4)];
    // a joins SS1: cards were primary(a, c), SS1(b, d); without a they are primary(c), SS1(b, d).
    const changed = list.map((e) => (e.rowKey === 'a' ? { ...e, section: 'SS1' } : e));
    const out = moveToSectionEnd(changed, 'a');
    expect(keys(trackerCards(out).flatMap((c) => c.exercises))).toEqual(['b', 'd', 'a', 'c']);
    expect(trackerCards(out).map((c) => c.section)).toEqual(['SS1', 'primary']);
  });

  it('makes a card at the end of the list when the section is new, and takes the later orders', () => {
    const list = [ex('a', 'primary', 1), ex('b', 'primary', 2), ex('c', 'burnout', 3)];
    const out = moveToSectionEnd(
      list.map((e) => (e.rowKey === 'a' ? { ...e, section: 'SS2' } : e)),
      'a',
    );
    expect(orders(out)).toEqual({ b: 1, c: 2, a: 3 });
    expect(trackerCards(out).map((c) => c.section)).toEqual(['primary', 'burnout', 'SS2']);
  });

  it('leaves orders alone when the exercise is already last', () => {
    const list = [ex('a', 'primary', 1), ex('b', 'burnout', 2)];
    const out = moveToSectionEnd(
      list.map((e) => (e.rowKey === 'b' ? { ...e, section: 'SS1' } : e)),
      'b',
    );
    expect(orders(out)).toEqual({ a: 1, b: 2 });
  });
});

describe('addToSection', () => {
  it('inserts after the last exercise of the section and renumbers', () => {
    const list = [ex('a', 'primary', 1), ex('b', 'primary', 2), ex('c', 'burnout', 3)];
    const out = addToSection(list, [ex('x', 'primary', 0), ex('y', 'primary', 0)], 'primary');
    expect(orders(out)).toEqual({ a: 1, b: 2, x: 3, y: 4, c: 5 });
  });

  it('starts a new card at the end for a section that is not there', () => {
    const list = [ex('a', 'primary', 1)];
    const out = addToSection(list, [ex('x', 'cooldown', 0)], 'cooldown');
    expect(trackerCards(out).map((c) => c.section)).toEqual(['primary', 'cooldown']);
    expect(orders(out)).toEqual({ a: 1, x: 2 });
  });
});

describe('progressOf', () => {
  it('counts logged working sets of the total, exercises done, and logged sets with no effort', () => {
    const list = [
      ex('w', 'warmup', 1),
      ex('a', 'primary', 2, [set(1, { weight: '135', reps: '8', effort: 'Hard' }), set(2, { reps: '8' })]),
      ex('b', 'primary', 3, [set(1, { weight: '95' })]),
      ex('c', 'SS1', 4, [set(1), set(2)]),
    ];
    expect(progressOf(list)).toEqual({ logged: 3, total: 5, exercisesDone: 2, exercisesTotal: 3, needEffort: 2 });
  });

  it('is all zero for a workout with only warm-ups', () => {
    expect(progressOf([ex('w', 'warmup', 1)])).toEqual({
      logged: 0,
      total: 0,
      exercisesDone: 0,
      exercisesTotal: 0,
      needEffort: 0,
    });
  });
});

describe('tile words', () => {
  it('tileValue', () => {
    expect(tileValue({ weight: '135', reps: '8' })).toBe('135×8');
    expect(tileValue({ weight: '', reps: '7' })).toBe('BW×7');
    expect(tileValue({ weight: '135', reps: '' })).toBe('135 lb');
  });

  it('tileLabel speaks the set', () => {
    expect(tileLabel(set(2, { weight: '135', reps: '8', effort: 'Hard' }))).toBe('Set 2: 135 pounds by 8, hard');
    expect(tileLabel(set(1, { reps: '7' }))).toBe('Set 1: bodyweight by 7, no effort');
    expect(tileLabel(set(3, { planned_reps: '8' }))).toBe('Set 3: not logged, target 8');
  });
});

describe('stepField', () => {
  it('steps weight by 5 from 20 up, by 1 below, and reps by 1', () => {
    expect(stepField('weight', '20', 1)).toBe('25');
    expect(stepField('weight', '20', -1)).toBe('15');
    expect(stepField('weight', '19', 1)).toBe('20');
    expect(stepField('weight', '', 1)).toBe('1');
    expect(stepField('reps', '8', 1)).toBe('9');
    expect(stepField('reps', '', 1)).toBe('1');
  });

  it('never goes below 0, and 0 leaves the field blank', () => {
    expect(stepField('weight', '1', -1)).toBe('');
    expect(stepField('weight', '', -1)).toBe('');
    expect(stepField('reps', '1', -1)).toBe('');
  });

  it('keeps a half-pound weight tidy', () => {
    expect(stepField('weight', '137.5', 1)).toBe('142.5');
  });
});
