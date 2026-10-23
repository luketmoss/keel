// #577 — today's rest for a section: read from the sets, and the writes a change makes.
import { describe, it, expect } from 'vitest';
import { DEFAULT_REST_SETTINGS } from '../../../api/rest-times';
import type { SetWithRow } from '../../../api/types';
import { retargetSection, sectionValues } from './lift-rest';

let row = 2;
const mk = (section: string, order: number, name: string, n: number, target: string): SetWithRow => ({
  workout_id: 'w1',
  exercise_id: `ex_${name}`,
  exercise_name: name,
  section,
  exercise_order: order,
  set_number: n,
  planned_reps: '8',
  weight: '',
  reps: '',
  effort: '',
  rest_target_s: target,
  set_s: '',
  rest_s: '',
  sheetRow: row++,
});

// Superset 1 as #576 writes it: Arnold switches (15), Lateral rests (45); a primary rests 90.
const ROWS = [
  mk('primary', 1, 'OH Press', 1, '90'),
  mk('primary', 1, 'OH Press', 2, '90'),
  ...[1, 2, 3].flatMap((n) => [mk('SS1', 2, 'Arnold', n, '15'), mk('SS1', 3, 'Lateral', n, '45')]),
];

describe('sectionValues', () => {
  it('reads the round rest and switch of a superset from its sets', () => {
    expect(sectionValues(ROWS, 'SS1', DEFAULT_REST_SETTINGS)).toEqual({ rest: 45, switch: 15 });
  });
  it('reads a primary rest, with no switch', () => {
    expect(sectionValues(ROWS, 'primary', DEFAULT_REST_SETTINGS)).toEqual({ rest: 90, switch: null });
  });
  it('falls back to the Settings defaults for blank targets', () => {
    const blank = ROWS.map((r) => ({ ...r, rest_target_s: '' }));
    expect(sectionValues(blank, 'SS1', DEFAULT_REST_SETTINGS)).toEqual({ rest: 45, switch: 15 });
  });
});

describe('retargetSection', () => {
  it('changing Superset 1 rest to 1:00 rewrites the three Lateral Raise sets and nothing else', () => {
    const writes = retargetSection(ROWS, 'SS1', { rest: 60, switch: 15 }, DEFAULT_REST_SETTINGS);
    const lateral = ROWS.filter((r) => r.exercise_name === 'Lateral').map((r) => r.sheetRow);
    expect(writes.map((w) => w.sheetRow)).toEqual(lateral);
    expect(writes.every((w) => w.patch.rest_target_s === '60')).toBe(true);
    // Arnold keeps its switch time: no write touches it.
    const arnold = ROWS.filter((r) => r.exercise_name === 'Arnold').map((r) => r.sheetRow);
    expect(writes.some((w) => arnold.includes(w.sheetRow))).toBe(false);
  });

  it('changing the switch rewrites the first exercise of each round', () => {
    const writes = retargetSection(ROWS, 'SS1', { rest: 45, switch: 30 }, DEFAULT_REST_SETTINGS);
    expect(writes).toHaveLength(3);
    expect(writes.every((w) => w.patch.rest_target_s === '30')).toBe(true);
  });

  it('never writes to another section, or when nothing changes', () => {
    const writes = retargetSection(ROWS, 'primary', { rest: 120, switch: null }, DEFAULT_REST_SETTINGS);
    expect(writes.map((w) => w.sheetRow)).toEqual([2, 3]);
    expect(retargetSection(ROWS, 'primary', { rest: 90, switch: null }, DEFAULT_REST_SETTINGS)).toEqual([]);
  });
});
