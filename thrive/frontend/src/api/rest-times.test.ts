// #576 - rest times: the defaults mirror apps-script/src/types.js, and the
// resolution of rest_target_s follows the issue's rules (and sets.js's copy).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const callAction = vi.fn();
vi.mock('./thrive-api', () => ({ callAction: (...a: unknown[]) => callAction(...a) }));

const {
  DEFAULT_REST_SETTINGS,
  REST_SETTING_KEYS,
  REST_RANGE,
  SWITCH_RANGE,
  formatMSS,
  getRestSettings,
  resolveRestTargets,
  sectionRestOf,
  withRestTargets,
} = await import('./rest-times');

const __dirname = dirname(fileURLToPath(import.meta.url));
const typesJs = readFileSync(resolve(__dirname, '../../../apps-script/src/types.js'), 'utf-8');

describe('mirrors REST_SETTINGS in apps-script/src/types.js', () => {
  it('has the same keys, defaults and ranges, in order', () => {
    const block = typesJs.match(/var REST_SETTINGS = \[([\s\S]*?)\];/)![1];
    const rows = Array.from(
      block.matchAll(/key: '([a-z_]+)', def: (\d+), min: (\d+), max: (\d+)/g),
      (m) => [m[1], Number(m[2]), Number(m[3]), Number(m[4])] as const,
    );
    expect(rows.map((r) => r[0])).toEqual([...REST_SETTING_KEYS]);
    for (const [key, def, min, max] of rows) {
      expect(DEFAULT_REST_SETTINGS[key as keyof typeof DEFAULT_REST_SETTINGS], key).toBe(def);
      const range = key.startsWith('switch_') ? SWITCH_RANGE : REST_RANGE;
      expect([range.min, range.max], key).toEqual([min, max]);
    }
  });

  it('defaults to 1:30, 0:45 and 0:15, 0:45 and 0:10', () => {
    expect(REST_SETTING_KEYS.map((k) => formatMSS(DEFAULT_REST_SETTINGS[k]))).toEqual([
      '1:30',
      '0:45',
      '0:15',
      '0:45',
      '0:10',
    ]);
  });
});

describe('formatMSS', () => {
  it('reads whole seconds as m:ss', () => {
    expect([0, 10, 15, 60, 90, 125, 600].map(formatMSS)).toEqual([
      '0:00',
      '0:10',
      '0:15',
      '1:00',
      '1:30',
      '2:05',
      '10:00',
    ]);
  });
});

type S = { section: string; exercise_order: number; set_number: number; name: string };

/** Upper Push B, as the issue's resolution criterion describes it. */
function upperPushB(): S[] {
  const out: S[] = [];
  const add = (name: string, section: string, order: number, sets: number) => {
    for (let n = 1; n <= sets; n++) out.push({ name, section, exercise_order: order, set_number: n });
  };
  add('Shoulder CARs', 'warmup', 1, 1);
  add('OH Press', 'warmup', 2, 1);
  add('OH Press', 'primary', 3, 4);
  add('Arnold Press', 'SS1', 4, 3);
  add('Lateral Raise', 'SS1', 5, 3);
  add('Close Grip Push Ups', 'SS2', 6, 3);
  add('Tricep Pushdown', 'SS2', 7, 3);
  add('Ab Wheel', 'burnout', 8, 2);
  add('Wrist Extensor', 'burnout', 9, 2);
  add('Wrist Flexor', 'burnout', 10, 2);
  return out;
}

const byName = (sets: S[], targets: string[]) => {
  const out: Record<string, string[]> = {};
  sets.forEach((s, i) => (out[`${s.name} ${s.section}`] ??= []).push(targets[i]));
  return out;
};

describe('resolveRestTargets', () => {
  it('Upper Push B with Superset 1 at 1:00 and every other section at Default', () => {
    const sets = upperPushB();
    const targets = resolveRestTargets(sets, { SS1: { rest_s: '60', switch_s: '' } }, DEFAULT_REST_SETTINGS);
    expect(byName(sets, targets)).toEqual({
      'Shoulder CARs warmup': [''],
      'OH Press warmup': [''],
      'OH Press primary': ['90', '90', '90', '90'],
      'Arnold Press SS1': ['15', '15', '15'],
      'Lateral Raise SS1': ['60', '60', '60'],
      'Close Grip Push Ups SS2': ['15', '15', '15'],
      'Tricep Pushdown SS2': ['45', '45', '45'],
      'Ab Wheel burnout': ['10', '10'],
      'Wrist Extensor burnout': ['10', '10'],
      'Wrist Flexor burnout': ['45', '45'],
    });
  });

  it('uneven rounds: A has 3 sets and B has 2, so A set 3 gets the round rest', () => {
    const sets = [1, 2, 3]
      .map((n) => ({ section: 'SS2', exercise_order: 1, set_number: n }))
      .concat([1, 2].map((n) => ({ section: 'SS2', exercise_order: 2, set_number: n })));
    expect(resolveRestTargets(sets, {}, DEFAULT_REST_SETTINGS)).toEqual(['15', '15', '45', '45', '45']);
  });

  it('a section switch of 0 is a value, not Default', () => {
    const sets = [1, 2].map((o) => ({ section: 'burnout', exercise_order: o, set_number: 1 }));
    expect(resolveRestTargets(sets, { burnout: { rest_s: '', switch_s: '0' } }, DEFAULT_REST_SETTINGS)).toEqual([
      '0',
      '45',
    ]);
  });

  it('takes the defaults it is given, and blanks warm-up and cool-down', () => {
    const sets = [
      { section: 'primary', exercise_order: 1, set_number: 1 },
      { section: 'cooldown', exercise_order: 2, set_number: 1 },
      { section: '', exercise_order: 3, set_number: 1 },
    ];
    expect(resolveRestTargets(sets, {}, { ...DEFAULT_REST_SETTINGS, rest_primary_s: 120 })).toEqual(['120', '', '']);
  });

  it('withRestTargets copies each set with its value', () => {
    const set = {
      workout_id: 'w',
      exercise_id: 'e',
      exercise_name: 'E',
      section: 'primary',
      exercise_order: 1,
      set_number: 1,
      planned_reps: '5',
      weight: '',
      reps: '',
      effort: '' as const,
    };
    expect(withRestTargets([set], {}, DEFAULT_REST_SETTINGS)).toEqual([{ ...set, rest_target_s: '90' }]);
  });

  it('sectionRestOf takes each section first row', () => {
    expect(
      sectionRestOf([
        { section: 'SS1', rest_s: '60', switch_s: '20' },
        { section: 'SS1', rest_s: '60', switch_s: '20' },
        { section: 'primary' },
      ]),
    ).toEqual({ SS1: { rest_s: '60', switch_s: '20' }, primary: { rest_s: '', switch_s: '' } });
  });
});

describe('getRestSettings', () => {
  afterEach(() => callAction.mockReset());

  it('reads the five keys from getSettings', async () => {
    callAction.mockResolvedValue({
      ok: true,
      data: { ...DEFAULT_REST_SETTINGS, rest_primary_s: 120, water_goal_ml: 1893 },
    });
    expect(await getRestSettings('tok')).toEqual({ ok: true, data: { ...DEFAULT_REST_SETTINGS, rest_primary_s: 120 } });
    expect(callAction).toHaveBeenCalledWith('getSettings', 'tok');
  });

  it('passes a failure through, and calls a malformed answer bad_response', async () => {
    callAction.mockResolvedValue({ ok: false, kind: 'network' });
    expect(await getRestSettings('tok')).toEqual({ ok: false, kind: 'network' });
    callAction.mockResolvedValue({ ok: true, data: { rest_primary_s: '90' } });
    expect(await getRestSettings('tok')).toEqual({ ok: false, kind: 'bad_response' });
  });
});
