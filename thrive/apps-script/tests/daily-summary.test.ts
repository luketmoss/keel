// #131 — the DailySummary rollup. One row per local calendar day, derived
// from Workouts + DailyHealth, rebuildable over any range.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { loadApi, callDoGet, workoutRow, healthRow, bodyRow, type CellValue } from './apps-script-sandbox';

const AT = '2026-09-20T12:00:00.000Z';

/** Column letters -> index, so assertions read like the spec's table. */
const COL = {
  date: 0, activity_count: 1, activity_types: 2, total_moving_s: 3,
  total_elapsed_s: 4, total_distance_m: 5, total_ascent_m: 6,
  cardio_activity_count: 7, distance_withdata: 8, ascent_withdata: 9,
  max_effort: 10, effort_counts: 11, steps: 12, resting_hr: 13, hrv: 14,
  sleep_total_s: 15, training_load: 16, computed_at: 17,
  moving_withdata: 18, elapsed_withdata: 19,
  weight_kg: 20, fat_ratio_pct: 21, systolic_mmhg: 22, diastolic_mmhg: 23, bp_count: 24,
  water_ml: 25, alcohol_drinks: 26, coffee_cups: 27, unwind_mg: 28,
};

function rebuild(
  fixtures: {
    workouts?: CellValue[][]; dailySummary?: CellValue[][]; dailyHealth?: CellValue[][];
    bodyMeasurements?: CellValue[][]; drinks?: CellValue[][];
  },
  from: string,
  to: string,
  computedAt: string | undefined = AT,
) {
  const api = loadApi(fixtures);
  const res = callDoGet<any>(api.sandbox, {
    action: 'rebuildDailySummary',
    payload: JSON.stringify({ from, to, computed_at: computedAt }),
  });
  return { ...api, res };
}

describe('AC1: the rebuild is idempotent over an arbitrary range', () => {
  const workouts = () => [
    workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight', effort: 'Hard', elapsed_seconds: '3600' }),
    workoutRow({ id: 'w_2', date: '2026-09-16', type: 'bike', sub_type: 'gravel', distance_m: '19956', ascent_m: '457', elapsed_seconds: '5400' }),
  ];

  it('produces byte-identical rows on a second run', () => {
    const first = rebuild({ workouts: workouts() }, '2026-09-15', '2026-09-16');
    const after = JSON.parse(JSON.stringify(first.summaryRows));

    // Re-run over the same range against the rows the first run produced.
    const second = rebuild(
      { workouts: workouts(), dailySummary: after },
      '2026-09-15', '2026-09-16',
    );
    expect(second.res.success).toBe(true);
    expect(second.summaryRows).toEqual(after);
  });

  it('updates in place rather than duplicating', () => {
    const first = rebuild({ workouts: workouts() }, '2026-09-15', '2026-09-16');
    expect(first.summaryRows).toHaveLength(2);

    const second = rebuild(
      { workouts: workouts(), dailySummary: JSON.parse(JSON.stringify(first.summaryRows)) },
      '2026-09-15', '2026-09-16',
    );
    expect(second.summaryRows).toHaveLength(2);
    expect(second.res.data.updated).toBe(2);
    expect(second.res.data.written).toBe(0);
  });

  it('takes the range as a parameter, so any window works', () => {
    const wide = rebuild({ workouts: workouts() }, '2026-09-01', '2026-09-30');
    expect(wide.res.data.days).toBe(30);
    expect(wide.summaryRows).toHaveLength(2); // only the days with something

    const narrow = rebuild({ workouts: workouts() }, '2026-09-16', '2026-09-16');
    expect(narrow.res.data.days).toBe(1);
    expect(narrow.summaryRows).toHaveLength(1);
  });

  // A day nobody trained is not a day of zeros.
  it('writes no row for a day with no activities and no health data', () => {
    const { res, summaryRows } = rebuild({ workouts: workouts() }, '2026-09-17', '2026-09-19');
    expect(res.success).toBe(true);
    expect(summaryRows).toHaveLength(0);
    expect(res.data.skipped).toBe(3);
  });

  it('stamps one computed_at for the whole run, not one per day', () => {
    const { summaryRows } = rebuild({ workouts: workouts() }, '2026-09-15', '2026-09-16');
    const stamps = new Set(summaryRows.map((r) => r[COL.computed_at]));
    expect(stamps.size).toBe(1);
    expect([...stamps][0]).toBe(AT);
  });

  it('refuses a reversed or malformed range', () => {
    expect(rebuild({ workouts: [] }, '2026-09-16', '2026-09-15').res.error)
      .toMatch(/from must not be after to/);
    expect(rebuild({ workouts: [] }, '16 Sept', '2026-09-16').res.error)
      .toMatch(/Expected YYYY-MM-DD/);
  });

  // A derived tab may not keep a row its sources no longer imply. Found in
  // review: the rebuild skipped empty days without clearing what was there.
  it('removes a row for a day that no longer earns one', () => {
    const first = rebuild({ workouts: workouts() }, '2026-09-15', '2026-09-16');
    expect(first.summaryRows).toHaveLength(2);

    // The 15th's only workout is deleted; the 16th's remains.
    const second = rebuild({
      workouts: [workouts()[1]],
      dailySummary: JSON.parse(JSON.stringify(first.summaryRows)),
    }, '2026-09-15', '2026-09-16');

    expect(second.res.data.removed).toBe(1);
    expect(second.summaryRows).toHaveLength(1);
    expect(second.summaryRows[0][COL.date]).toBe('2026-09-16');
  });

  it('removes several stale rows without corrupting the ones that stay', () => {
    const three = () => [
      workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight', effort: 'Hard' }),
      workoutRow({ id: 'w_2', date: '2026-09-16', type: 'bike', distance_m: '19956' }),
      workoutRow({ id: 'w_3', date: '2026-09-17', type: 'run', distance_m: '5000' }),
    ];
    const first = rebuild({ workouts: three() }, '2026-09-15', '2026-09-17');
    expect(first.summaryRows).toHaveLength(3);

    // The first and last days lose their workouts; the middle one survives.
    const second = rebuild({
      workouts: [three()[1]],
      dailySummary: JSON.parse(JSON.stringify(first.summaryRows)),
    }, '2026-09-15', '2026-09-17');

    expect(second.res.data.removed).toBe(2);
    expect(second.summaryRows).toHaveLength(1);
    expect(second.summaryRows[0][COL.date]).toBe('2026-09-16');
    expect(second.summaryRows[0][COL.total_distance_m]).toBe('19956');
  });

  it('leaves rows outside the rebuilt range alone', () => {
    const first = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight' }),
        workoutRow({ id: 'w_2', date: '2026-09-20', type: 'bike' }),
      ],
    }, '2026-09-15', '2026-09-20');
    expect(first.summaryRows).toHaveLength(2);

    // Rebuild only the 15th, with its workout gone. The 20th is out of range
    // and must survive even though its source is absent from this call.
    const second = rebuild({
      workouts: [],
      dailySummary: JSON.parse(JSON.stringify(first.summaryRows)),
    }, '2026-09-15', '2026-09-15');

    expect(second.res.data.removed).toBe(1);
    expect(second.summaryRows.map((r) => r[COL.date])).toEqual(['2026-09-20']);
  });

  it('excludes planned workouts — a plan is not a thing that happened', () => {
    const { summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_p', date: '2026-09-15', status: 'planned', type: 'weight' })],
    }, '2026-09-15', '2026-09-15');
    expect(summaryRows).toHaveLength(0);
  });
});

describe('AC2: a pre-COROS day is partial, not zeroed', () => {
  // Every day before the watch. DailyHealth does not exist at all.
  const { summaryRows } = rebuild({
    workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight', effort: 'Hard', elapsed_seconds: '3600' })],
  }, '2026-09-15', '2026-09-15');
  const row = summaryRows[0];

  it('populates the activity columns', () => {
    expect(row[COL.activity_count]).toBe('1');
    expect(row[COL.total_elapsed_s]).toBe('3600');
    expect(row[COL.max_effort]).toBe('Hard');
  });

  it('leaves every health column blank', () => {
    for (const f of ['steps', 'resting_hr', 'hrv', 'sleep_total_s', 'training_load'] as const) {
      expect(row[COL[f]], f).toBe('');
    }
  });

  // A day before the watch existed is not a day with no steps.
  it('never writes 0 into a health column', () => {
    for (const f of ['steps', 'resting_hr', 'hrv', 'sleep_total_s', 'training_load'] as const) {
      expect(row[COL[f]], f).not.toBe('0');
      expect(row[COL[f]], f).not.toBe(0);
    }
  });

  it('fills the health columns once DailyHealth has the day', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight' })],
      dailyHealth: [healthRow({
        date: '2026-09-15', steps: '8432', resting_hr: '48', hrv: '62',
        sleep_total_s: '27000', training_load: '340',
      })],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.steps]).toBe('8432');
    expect(rows[0][COL.resting_hr]).toBe('48');
    expect(rows[0][COL.hrv]).toBe('62');
    expect(rows[0][COL.sleep_total_s]).toBe('27000');
    expect(rows[0][COL.training_load]).toBe('340');
  });

  // #165 AC1: sync plan §5's layout, read by column letter. #131's placeholder
  // read B as steps and C as resting HR; every column here holds a distinct
  // value, so a read from the wrong column cannot pass by coincidence.
  it('reads steps from D, resting_hr from B, hrv from C, sleep from F and load from N', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [],
      dailyHealth: [[
        '2026-09-15', // A date
        '48',         // B resting_hr
        '62',         // C hrv
        '8432',       // D steps
        '2100',       // E calories
        '27000',      // F sleep_total_s
        '3600',       // G sleep_deep_s
        '5400',       // H sleep_rem_s
        '15000',      // I sleep_light_s
        '900',        // J sleep_awake_s
        '84',         // K sleep_score
        '51',         // L vo2max
        '87',         // M recovery
        '340',        // N training_load
        '22:51',      // O bed_time
        '06:06',      // P wake_time
        'file-1',     // Q raw_ref
        '2026-09-15T13:00:00.000Z', // R synced_at
      ]],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.steps]).toBe('8432');
    expect(rows[0][COL.resting_hr]).toBe('48');
    expect(rows[0][COL.hrv]).toBe('62');
    expect(rows[0][COL.sleep_total_s]).toBe('27000');
    expect(rows[0][COL.training_load]).toBe('340');
  });

  it('writes a row for a health-only day, with the activity columns blank', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [],
      dailyHealth: [healthRow({
        date: '2026-09-15', steps: '8432', resting_hr: '48', hrv: '62',
        sleep_total_s: '27000', training_load: '340',
      })],
    }, '2026-09-15', '2026-09-15');
    expect(rows).toHaveLength(1);
    expect(rows[0][COL.steps]).toBe('8432');
    expect(rows[0][COL.activity_count]).toBe('');
    expect(rows[0][COL.total_distance_m]).toBe('');
  });
});

describe('AC3: total_distance_m excludes indoor activities', () => {
  const day = () => [
    workoutRow({ id: 'w_out', date: '2026-09-15', type: 'bike', sub_type: 'gravel', distance_m: '19956', ascent_m: '457' }),
    workoutRow({ id: 'w_in', date: '2026-09-15', type: 'bike', sub_type: 'indoor', distance_m: '15000', ascent_m: '300' }),
  ];

  const { summaryRows } = rebuild({ workouts: day() }, '2026-09-15', '2026-09-15');
  const row = summaryRows[0];

  it('counts only the outdoor distance', () => {
    expect(row[COL.total_distance_m]).toBe('19956');
  });

  it('counts only the outdoor ascent', () => {
    expect(row[COL.total_ascent_m]).toBe('457');
  });

  it('counts only outdoor activities in cardio_activity_count', () => {
    expect(row[COL.cardio_activity_count]).toBe('1');
  });

  // The whole day still happened, indoors included.
  it('counts both in activity_count', () => {
    expect(row[COL.activity_count]).toBe('2');
  });

  it('names both in activity_types', () => {
    expect(row[COL.activity_types]).toBe('bike:gravel,bike:indoor');
  });

  it('excludes indoor runs and walks too, not just rides', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'run', sub_type: 'indoor', distance_m: '5000' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'walk', sub_type: 'indoor', distance_m: '3000' }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.total_distance_m]).toBe('');
    expect(rows[0][COL.cardio_activity_count]).toBe('');
    expect(rows[0][COL.activity_count]).toBe('2');
  });

  it('treats a blank sub_type as outdoor, as every pre-#129 row is', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', sub_type: '', distance_m: '12000' })],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.total_distance_m]).toBe('12000');
  });

  it('excludes a weight session from cardio counts entirely', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'hike', distance_m: '8000', ascent_m: '600' }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.cardio_activity_count]).toBe('1');
    expect(rows[0][COL.activity_count]).toBe('2');
  });
});

describe('AC4: effort is session effort, counted per workout', () => {
  const { summaryRows } = rebuild({
    workouts: [
      workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight', effort: 'Hard' }),
      workoutRow({ id: 'w_2', date: '2026-09-15', type: 'bike', effort: 'Medium' }),
      workoutRow({ id: 'w_3', date: '2026-09-15', type: 'stretch', effort: '' }),
    ],
  }, '2026-09-15', '2026-09-15');
  const row = summaryRows[0];

  it('takes the hardest as max_effort', () => {
    expect(row[COL.max_effort]).toBe('Hard');
  });

  it('counts each effort, and the blank one in neither', () => {
    expect(row[COL.effort_counts]).toBe('Hard:1,Medium:1');
  });

  it('still counts the effortless workout as an activity', () => {
    expect(row[COL.activity_count]).toBe('3');
  });

  it('leaves both blank when no workout recorded an effort', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight', effort: '' })],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.max_effort]).toBe('');
    expect(rows[0][COL.effort_counts]).toBe('');
  });

  it('orders effort_counts hardest first, so a rebuild is deterministic', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight', effort: 'Easy' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'bike', effort: 'Hard' }),
        workoutRow({ id: 'w_3', date: '2026-09-15', type: 'run', effort: 'Medium' }),
        workoutRow({ id: 'w_4', date: '2026-09-15', type: 'walk', effort: 'Easy' }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.effort_counts]).toBe('Hard:1,Medium:1,Easy:2');
    expect(rows[0][COL.max_effort]).toBe('Hard');
  });

  // A hard set does not make a hard session (#113).
  it('reads Workouts!M and never derives effort from set rows', () => {
    const api = loadApi({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight', effort: '' })],
      // Sets full of Hard effort. The day must still report no session effort.
      sets: [
        ['w_1', 'ex_1', 'Bench', 'primary', 1, 1, '6', '185', '6', 'Hard'],
        ['w_1', 'ex_1', 'Bench', 'primary', 1, 2, '6', '185', '5', 'Hard'],
      ],
    });
    callDoGet(api.sandbox, {
      action: 'rebuildDailySummary',
      payload: JSON.stringify({ from: '2026-09-15', to: '2026-09-15', computed_at: AT }),
    });
    expect(api.summaryRows[0][COL.max_effort]).toBe('');
    expect(api.summaryRows[0][COL.effort_counts]).toBe('');
  });
});

describe('AC6: totals carry their coverage', () => {
  // Three outdoor rides: one recorded distance, two recorded ascent.
  const { summaryRows } = rebuild({
    workouts: [
      workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', distance_m: '19956', ascent_m: '457' }),
      workoutRow({ id: 'w_2', date: '2026-09-15', type: 'bike', distance_m: '', ascent_m: '300' }),
      workoutRow({ id: 'w_3', date: '2026-09-15', type: 'bike', distance_m: '', ascent_m: '' }),
    ],
  }, '2026-09-15', '2026-09-15');
  const row = summaryRows[0];

  it('reports the of, and each coverage independently', () => {
    expect(row[COL.cardio_activity_count]).toBe('3');
    expect(row[COL.distance_withdata]).toBe('1');
    expect(row[COL.ascent_withdata]).toBe('2');
  });

  it('sums only what was recorded', () => {
    expect(row[COL.total_distance_m]).toBe('19956');
    expect(row[COL.total_ascent_m]).toBe('757');
  });

  // "Complete" must be distinguishable from "not computed".
  it('still populates the counts at full coverage', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', distance_m: '10000', ascent_m: '100' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'bike', distance_m: '20000', ascent_m: '200' }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.cardio_activity_count]).toBe('2');
    expect(rows[0][COL.distance_withdata]).toBe('2');
    expect(rows[0][COL.ascent_withdata]).toBe('2');
  });

  it('keeps a deliberate zero distinct from unrecorded', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', distance_m: '10000', ascent_m: '0' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'bike', distance_m: '10000', ascent_m: '' }),
      ],
    }, '2026-09-15', '2026-09-15');
    // A flat ride recorded 0 ascent; the other recorded nothing.
    expect(rows[0][COL.total_ascent_m]).toBe('0');
    expect(rows[0][COL.ascent_withdata]).toBe('1');
    expect(rows[0][COL.cardio_activity_count]).toBe('2');
  });
});

describe('the tab is readable, and history bounds are discoverable', () => {
  it('reads summaries back, filtered by range', () => {
    const first = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight' }),
        workoutRow({ id: 'w_2', date: '2026-09-20', type: 'bike' }),
      ],
    }, '2026-09-15', '2026-09-20');

    const res = callDoGet<any[]>(first.sandbox, {
      action: 'getDailySummary', from: '2026-09-18', to: '2026-09-30',
    });
    expect(res.data.map((s) => s.date)).toEqual(['2026-09-20']);
  });

  it('reports the span the history actually covers', () => {
    const api = loadApi({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-03-04', type: 'weight' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'bike' }),
        workoutRow({ id: 'w_3', date: '2026-12-01', type: 'weight', status: 'planned' }),
      ],
    });
    const res = callDoGet<any>(api.sandbox, { action: 'getHistoryDateRange' });
    // The planned workout in December is not history.
    expect(res.data).toEqual({ from: '2026-03-04', to: '2026-09-15' });
  });

  it('returns every column on a read', () => {
    const first = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight' })],
    }, '2026-09-15', '2026-09-15');
    const res = callDoGet<any[]>(first.sandbox, { action: 'getDailySummary' });
    const fields: string[] = [...first.sandbox.DAILY_SUMMARY_FIELDS];
    expect(Object.keys(res.data[0])).toEqual([...fields, 'sheetRow']);
    expect(first.summaryRows[0]).toHaveLength(fields.length);
  });
});

describe('#181 AC1: a duration nobody recorded is blank, never 0', () => {
  // A hand-logged weight session and a stretch: neither has moving time,
  // neither has elapsed time. This is the day #158's QA saw as "moving 0 min".
  const { summaryRows } = rebuild({
    workouts: [
      workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight' }),
      workoutRow({ id: 'w_2', date: '2026-09-15', type: 'stretch' }),
    ],
  }, '2026-09-15', '2026-09-15');
  const row = summaryRows[0];

  it('leaves total_moving_s blank and reports 0 of B contributing', () => {
    expect(row[COL.activity_count]).toBe('2');
    expect(row[COL.total_moving_s]).toBe('');
    expect(row[COL.moving_withdata]).toBe('0');
  });

  it('does the same for elapsed', () => {
    expect(row[COL.total_elapsed_s]).toBe('');
    expect(row[COL.elapsed_withdata]).toBe('0');
  });

  it('counts moving and elapsed independently', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight', elapsed_seconds: '3600' })],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.total_elapsed_s]).toBe('3600');
    expect(rows[0][COL.elapsed_withdata]).toBe('1');
    expect(rows[0][COL.total_moving_s]).toBe('');
    expect(rows[0][COL.moving_withdata]).toBe('0');
  });

  it('keeps a recorded 0 as data: it counts, and the total is 0', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', moving_seconds: '0' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'weight' }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.total_moving_s]).toBe('0');
    expect(rows[0][COL.moving_withdata]).toBe('1');
  });
});

describe('#181 AC2: duration totals carry coverage against every activity', () => {
  it('sums what was recorded and says how many of B contributed', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', moving_seconds: '2520', elapsed_seconds: '3000' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'weight' }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.total_moving_s]).toBe('2520');
    expect(rows[0][COL.moving_withdata]).toBe('1');
    expect(rows[0][COL.total_elapsed_s]).toBe('3000');
    expect(rows[0][COL.elapsed_withdata]).toBe('1');
    expect(rows[0][COL.activity_count]).toBe('2');
  });

  // The `of` is B, not H: an indoor ride and a weight session are not
  // outdoor cardio, but both have a duration.
  it('counts indoor and non-cardio sessions, which H does not', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', sub_type: 'indoor', moving_seconds: '1800' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'weight', moving_seconds: '2400' }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.cardio_activity_count]).toBe('');
    expect(rows[0][COL.total_moving_s]).toBe('4200');
    expect(rows[0][COL.moving_withdata]).toBe('2');
  });

  it('leaves D, E, S and T blank on a health-only day', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [],
      dailyHealth: [healthRow({ date: '2026-09-15', steps: '8400' })],
    }, '2026-09-15', '2026-09-15');
    expect(rows).toHaveLength(1);
    for (const col of ['total_moving_s', 'total_elapsed_s', 'moving_withdata', 'elapsed_withdata'] as const) {
      expect(rows[0][COL[col]], col).toBe('');
    }
  });

  it('stays idempotent with the new columns', () => {
    const workouts = () => [
      workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', moving_seconds: '2520' }),
      workoutRow({ id: 'w_2', date: '2026-09-15', type: 'weight' }),
    ];
    const first = rebuild({ workouts: workouts() }, '2026-09-15', '2026-09-15');
    const after = JSON.parse(JSON.stringify(first.summaryRows));
    const second = rebuild({ workouts: workouts(), dailySummary: after }, '2026-09-15', '2026-09-15');
    expect(second.summaryRows).toEqual(after);
  });

  // Rows written before #181 carry 0 in D and E and nothing in S or T. A
  // rebuild corrects them in place rather than appending a second row.
  it('heals a pre-#181 row in place', () => {
    const old = ['2026-09-15', '2', 'bike,weight', '0', '0', '', '', '', '', '', '', '', '', '', '', '', '', '2026-09-20T00:00:00.000Z'];
    const { summaryRows: rows, res } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'weight' }),
      ],
      dailySummary: [old],
    }, '2026-09-15', '2026-09-15');
    expect(res.data.updated).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0][COL.total_moving_s]).toBe('');
    expect(rows[0][COL.moving_withdata]).toBe('0');
  });
});

describe('#181 AC3: S and T are appended, and the migration matches', () => {
  const headersIn = (name: string) => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const script = readFileSync(path.resolve(here, '..', '..', 'scripts', name), 'utf8');
    const list = script.match(/const HEADERS = \[([\s\S]*?)\];/);
    expect(list, `HEADERS array in ${name}`).not.toBeNull();
    return [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  it('keeps A:R exactly as #131 created them, so no column almanac reads moves', () => {
    const { sandbox } = loadApi();
    expect([...sandbox.DAILY_SUMMARY_FIELDS].slice(0, 18)).toEqual(headersIn('migrate-131-daily-summary-tab.mjs'));
    expect(sandbox.DAILY_SUMMARY_FIELDS[18]).toBe('moving_withdata');
    expect(sandbox.DAILY_SUMMARY_FIELDS[19]).toBe('elapsed_withdata');
  });

  it('matches the headers the #181 migration writes, as a prefix of the current field list', () => {
    const { sandbox } = loadApi();
    expect(headersIn('migrate-181-daily-summary-coverage.mjs')).toEqual([...sandbox.DAILY_SUMMARY_FIELDS].slice(0, 20));
  });
});

describe('#203 AC1: U:Y are appended, and the migration matches', () => {
  const headersIn = (name: string) => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const script = readFileSync(path.resolve(here, '..', '..', 'scripts', name), 'utf8');
    const list = script.match(/const HEADERS = \[([\s\S]*?)\];/);
    expect(list, `HEADERS array in ${name}`).not.toBeNull();
    return [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  it('keeps A:T exactly as #181 left them, so no column almanac reads moves', () => {
    const { sandbox } = loadApi();
    expect([...sandbox.DAILY_SUMMARY_FIELDS].slice(20, 25)).toEqual(['weight_kg', 'fat_ratio_pct', 'systolic_mmhg', 'diastolic_mmhg', 'bp_count']);
  });

  it('matches the headers the #203 migration writes, as a prefix of the current field list', () => {
    const { sandbox } = loadApi();
    expect(headersIn('migrate-203-daily-summary-body.mjs')).toEqual([...sandbox.DAILY_SUMMARY_FIELDS].slice(0, 25));
  });
});

describe('#190 AC1: an outdoor total nobody measured is blank, never 0', () => {
  it('leaves distance and ascent blank when no outdoor session measured them', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'hike' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'bike', sub_type: 'gravel' }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.total_distance_m]).toBe('');
    expect(rows[0][COL.total_ascent_m]).toBe('');
    expect(rows[0][COL.distance_withdata]).toBe('0');
    expect(rows[0][COL.ascent_withdata]).toBe('0');
    expect(rows[0][COL.cardio_activity_count]).toBe('2');
  });

  it('decides distance and ascent independently', () => {
    const { summaryRows: distanceOnly } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', distance_m: '12000' })],
    }, '2026-09-15', '2026-09-15');
    expect(distanceOnly[0][COL.total_distance_m]).toBe('12000');
    expect(distanceOnly[0][COL.total_ascent_m]).toBe('');
    expect(distanceOnly[0][COL.ascent_withdata]).toBe('0');

    const { summaryRows: ascentOnly } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'hike', ascent_m: '600' })],
    }, '2026-09-15', '2026-09-15');
    expect(ascentOnly[0][COL.total_distance_m]).toBe('');
    expect(ascentOnly[0][COL.distance_withdata]).toBe('0');
    expect(ascentOnly[0][COL.total_ascent_m]).toBe('600');
  });

  // Rows written before #190 carry 0 in F and G with 0 in I and J. A rebuild
  // corrects them in place rather than appending a second row.
  it('heals a pre-#190 row in place', () => {
    const old = ['2026-09-15', '1', 'hike', '', '3600', '0', '0', '1', '0', '0', '', '', '', '', '', '', '', '2026-09-20T00:00:00.000Z', '0', '1'];
    const { summaryRows: rows, res } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'hike', elapsed_seconds: '3600' })],
      dailySummary: [old],
    }, '2026-09-15', '2026-09-15');
    expect(res.data.updated).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0][COL.total_distance_m]).toBe('');
    expect(rows[0][COL.total_ascent_m]).toBe('');
    expect(rows[0][COL.distance_withdata]).toBe('0');
  });
});

describe('#190 AC2: a measured value, including a measured 0, is still summed', () => {
  it('shows a measured 0 as 0, with coverage 1', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'walk', distance_m: '0', ascent_m: '0' }),
        workoutRow({ id: 'w_2', date: '2026-09-15', type: 'walk' }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(rows[0][COL.total_distance_m]).toBe('0');
    expect(rows[0][COL.distance_withdata]).toBe('1');
    expect(rows[0][COL.total_ascent_m]).toBe('0');
    expect(rows[0][COL.ascent_withdata]).toBe('1');
    expect(rows[0][COL.cardio_activity_count]).toBe('2');
  });

  it('leaves F through J blank on indoor-only and weight-only days', () => {
    const { summaryRows: rows } = rebuild({
      workouts: [
        workoutRow({ id: 'w_1', date: '2026-09-15', type: 'bike', sub_type: 'indoor', distance_m: '15000' }),
        workoutRow({ id: 'w_2', date: '2026-09-16', type: 'weight' }),
      ],
    }, '2026-09-15', '2026-09-16');
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      for (const col of ['total_distance_m', 'total_ascent_m', 'cardio_activity_count', 'distance_withdata', 'ascent_withdata'] as const) {
        expect(row[COL[col]], `${row[COL.date]} ${col}`).toBe('');
      }
    }
  });

  it('stays idempotent with blank outdoor totals', () => {
    const workouts = () => [
      workoutRow({ id: 'w_1', date: '2026-09-15', type: 'hike' }),
      workoutRow({ id: 'w_2', date: '2026-09-16', type: 'bike', distance_m: '19956' }),
    ];
    const first = rebuild({ workouts: workouts() }, '2026-09-15', '2026-09-16');
    const after = JSON.parse(JSON.stringify(first.summaryRows));
    const second = rebuild({ workouts: workouts(), dailySummary: after }, '2026-09-15', '2026-09-16');
    expect(second.summaryRows).toEqual(after);
  });
});

describe('#203 AC2: weight and fat ratio come from the day\'s first weigh-in', () => {
  it('takes weight and fat ratio from the earliest scale reading by measured_at_utc, not sheet order', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      bodyMeasurements: [
        // Sheet order is scrambled: the 19:10 reading is written first.
        bodyRow({
          grpid: '2', date: '2026-09-15', time: '19:10', measured_at_utc: '2026-09-15T19:10:00-06:00',
          kind: 'scale', weight_kg: '73.1',
        }),
        bodyRow({
          grpid: '1', date: '2026-09-15', time: '06:40', measured_at_utc: '2026-09-15T06:40:00-06:00',
          kind: 'scale', weight_kg: '72.3', fat_ratio_pct: '21.4',
        }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(summaryRows[0][COL.weight_kg]).toBe('72.3');
    expect(summaryRows[0][COL.fat_ratio_pct]).toBe('21.4');
  });

  it('leaves fat_ratio_pct blank when the first weigh-in had none, even though a later one does', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      bodyMeasurements: [
        bodyRow({
          grpid: '1', date: '2026-09-15', time: '06:40', measured_at_utc: '2026-09-15T06:40:00-06:00',
          kind: 'scale', weight_kg: '72.3',
        }),
        bodyRow({
          grpid: '2', date: '2026-09-15', time: '19:10', measured_at_utc: '2026-09-15T19:10:00-06:00',
          kind: 'scale', weight_kg: '73.1', fat_ratio_pct: '22.0',
        }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(summaryRows[0][COL.weight_kg]).toBe('72.3');
    expect(summaryRows[0][COL.fat_ratio_pct]).toBe('');
  });

  it('skips a first reading with no weight in favor of the next one that has it', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      bodyMeasurements: [
        // A reading with no weight at all (an unusual group) — not the "first weigh-in".
        bodyRow({
          grpid: '1', date: '2026-09-15', time: '06:00', measured_at_utc: '2026-09-15T06:00:00-06:00',
          kind: 'scale', fat_ratio_pct: '20.0',
        }),
        bodyRow({
          grpid: '2', date: '2026-09-15', time: '06:40', measured_at_utc: '2026-09-15T06:40:00-06:00',
          kind: 'scale', weight_kg: '72.3', fat_ratio_pct: '21.4',
        }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(summaryRows[0][COL.weight_kg]).toBe('72.3');
    expect(summaryRows[0][COL.fat_ratio_pct]).toBe('21.4');
  });
});

describe('#203 AC3: blood pressure is the mean, with its count', () => {
  it('means systolic and diastolic separately, rounded half up, with the count of readings', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      bodyMeasurements: [
        bodyRow({
          grpid: '1', date: '2026-09-15', time: '08:00', measured_at_utc: '2026-09-15T08:00:00-06:00',
          kind: 'bp', systolic_mmhg: '121', diastolic_mmhg: '79',
        }),
        bodyRow({
          grpid: '2', date: '2026-09-15', time: '08:05', measured_at_utc: '2026-09-15T08:05:00-06:00',
          kind: 'bp', systolic_mmhg: '118', diastolic_mmhg: '76',
        }),
        bodyRow({
          grpid: '3', date: '2026-09-15', time: '08:10', measured_at_utc: '2026-09-15T08:10:00-06:00',
          kind: 'bp', systolic_mmhg: '116', diastolic_mmhg: '77',
        }),
      ],
    }, '2026-09-15', '2026-09-15');
    // mean systolic (121+118+116)/3 = 118.33 -> 118; mean diastolic (79+76+77)/3 = 77.33 -> 77
    expect(summaryRows[0][COL.systolic_mmhg]).toBe('118');
    expect(summaryRows[0][COL.diastolic_mmhg]).toBe('77');
    expect(summaryRows[0][COL.bp_count]).toBe('3');
  });

  it('rounds a mean exactly at the half up, not to even', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      bodyMeasurements: [
        bodyRow({
          grpid: '1', date: '2026-09-15', time: '08:00', measured_at_utc: '2026-09-15T08:00:00-06:00',
          kind: 'bp', systolic_mmhg: '120', diastolic_mmhg: '80',
        }),
        bodyRow({
          grpid: '2', date: '2026-09-15', time: '08:05', measured_at_utc: '2026-09-15T08:05:00-06:00',
          kind: 'bp', systolic_mmhg: '121', diastolic_mmhg: '81',
        }),
      ],
    }, '2026-09-15', '2026-09-15');
    // (120+121)/2 = 120.5 -> 121 (half up); (80+81)/2 = 80.5 -> 81
    expect(summaryRows[0][COL.systolic_mmhg]).toBe('121');
    expect(summaryRows[0][COL.diastolic_mmhg]).toBe('81');
  });

  it('a reading missing one value contributes only to the mean it has, but still counts in bp_count', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      bodyMeasurements: [
        bodyRow({
          grpid: '1', date: '2026-09-15', time: '08:00', measured_at_utc: '2026-09-15T08:00:00-06:00',
          kind: 'bp', systolic_mmhg: '120', diastolic_mmhg: '80',
        }),
        // Diastolic missing on this one reading.
        bodyRow({
          grpid: '2', date: '2026-09-15', time: '08:05', measured_at_utc: '2026-09-15T08:05:00-06:00',
          kind: 'bp', systolic_mmhg: '100',
        }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(summaryRows[0][COL.systolic_mmhg]).toBe('110'); // (120+100)/2
    expect(summaryRows[0][COL.diastolic_mmhg]).toBe('80'); // only the one value
    expect(summaryRows[0][COL.bp_count]).toBe('2');
  });
});

describe('#203 AC4: blank, never 0, and body-only days get a row', () => {
  it('leaves the weight columns blank on a day with no scale reading', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      bodyMeasurements: [
        bodyRow({
          grpid: '1', date: '2026-09-15', time: '08:00', measured_at_utc: '2026-09-15T08:00:00-06:00',
          kind: 'bp', systolic_mmhg: '120', diastolic_mmhg: '80',
        }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(summaryRows[0][COL.weight_kg]).toBe('');
    expect(summaryRows[0][COL.fat_ratio_pct]).toBe('');
  });

  it('leaves the BP columns and bp_count blank (never 0) on a day with no BP reading', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      bodyMeasurements: [
        bodyRow({
          grpid: '1', date: '2026-09-15', time: '06:40', measured_at_utc: '2026-09-15T06:40:00-06:00',
          kind: 'scale', weight_kg: '72.3',
        }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(summaryRows[0][COL.systolic_mmhg]).toBe('');
    expect(summaryRows[0][COL.diastolic_mmhg]).toBe('');
    expect(summaryRows[0][COL.bp_count]).toBe('');
    expect(summaryRows[0][COL.bp_count]).not.toBe(0);
    expect(summaryRows[0][COL.bp_count]).not.toBe('0');
  });

  it('gives a body-only day a row, with the other columns blank and B as \'\' rather than 0', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      bodyMeasurements: [
        bodyRow({
          grpid: '1', date: '2026-09-15', time: '06:40', measured_at_utc: '2026-09-15T06:40:00-06:00',
          kind: 'scale', weight_kg: '72.3', fat_ratio_pct: '21.4',
        }),
      ],
    }, '2026-09-15', '2026-09-15');
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0][COL.weight_kg]).toBe('72.3');
    expect(summaryRows[0][COL.activity_count]).toBe('');
    expect(summaryRows[0][COL.activity_count]).not.toBe(0);
    expect(summaryRows[0][COL.steps]).toBe('');
  });

  it('gives no row to a day with nothing at all', () => {
    const { summaryRows } = rebuild({ workouts: [] }, '2026-09-15', '2026-09-15');
    expect(summaryRows).toHaveLength(0);
  });

  it('leaves U:Y blank everywhere when the BodyMeasurements tab does not exist, and fails nothing', () => {
    const { res, summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight' })],
    }, '2026-09-15', '2026-09-15');
    expect(res.success).toBe(true);
    expect(summaryRows[0][COL.weight_kg]).toBe('');
    expect(summaryRows[0][COL.systolic_mmhg]).toBe('');
    expect(summaryRows[0][COL.bp_count]).toBe('');
  });
});

describe('#203 AC5: the rollup stays idempotent with the body columns', () => {
  it('produces byte-identical rows on a second run', () => {
    const bodyMeasurements = () => [
      bodyRow({
        grpid: '1', date: '2026-09-15', time: '06:40', measured_at_utc: '2026-09-15T06:40:00-06:00',
        kind: 'scale', weight_kg: '72.3', fat_ratio_pct: '21.4',
      }),
      bodyRow({
        grpid: '2', date: '2026-09-15', time: '08:00', measured_at_utc: '2026-09-15T08:00:00-06:00',
        kind: 'bp', systolic_mmhg: '120', diastolic_mmhg: '80',
      }),
    ];
    const workouts = () => [workoutRow({ id: 'w_1', date: '2026-09-15', type: 'weight' })];
    const first = rebuild({ workouts: workouts(), bodyMeasurements: bodyMeasurements() }, '2026-09-15', '2026-09-15');
    const after = JSON.parse(JSON.stringify(first.summaryRows));
    const second = rebuild({
      workouts: workouts(), bodyMeasurements: bodyMeasurements(), dailySummary: after,
    }, '2026-09-15', '2026-09-15');
    expect(second.summaryRows).toEqual(after);
  });
});

// --- #522: water and alcohol, rolled up from Drinks -------------------------

/** One Drinks row, A:I, as the API writes it (DRINK_FIELDS). */
function drinkRow(id: string, kind: 'water' | 'alcohol' | 'coffee' | 'unwind', amount: string, date: string, time = '08:00:00'): CellValue[] {
  return [id, kind, amount, date, time, `${date}T14:00:00.000Z`, 'app', `${date}T14:00:01.000Z`, `${date}T14:00:01.000Z`];
}

describe('#522 AC1: Z and AA are appended, and the migration matches', () => {
  const headersIn = (name: string) => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const script = readFileSync(path.resolve(here, '..', '..', 'scripts', name), 'utf8');
    const list = script.match(/const HEADERS = \[([\s\S]*?)\];/);
    expect(list, `HEADERS array in ${name}`).not.toBeNull();
    return [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  it('appends water_ml and alcohol_drinks after bp_count, moving nothing', () => {
    const { sandbox } = loadApi();
    const fields = [...sandbox.DAILY_SUMMARY_FIELDS];
    expect(fields.slice(0, 25)).toEqual(headersIn('migrate-203-daily-summary-body.mjs'));
    expect(fields.slice(25, 27)).toEqual(['water_ml', 'alcohol_drinks']);
  });

  it('matches the headers the #522 migration writes', () => {
    const { sandbox } = loadApi();
    expect(headersIn('migrate-522-daily-summary-drinks.mjs')).toEqual([...sandbox.DAILY_SUMMARY_FIELDS].slice(0, 27));
  });
});

describe('#522 AC2: the day sums its water ml and its alcohol drinks', () => {
  it('gives 354 ml and 2 drinks for 3 x 118 ml of water and 2 alcohol entries', () => {
    const { res, summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-10-19', type: 'weight' })],
      drinks: [
        drinkRow('d1', 'water', '118', '2026-10-19', '07:00:00'),
        drinkRow('d2', 'alcohol', '1', '2026-10-19', '19:00:00'),
        drinkRow('d3', 'water', '118', '2026-10-19', '10:00:00'),
        drinkRow('d4', 'water', '118', '2026-10-19', '13:00:00'),
        drinkRow('d5', 'alcohol', '1', '2026-10-19', '20:00:00'),
        // Another day's drinks never leak in.
        drinkRow('d6', 'water', '500', '2026-10-20'),
      ],
    }, '2026-10-19', '2026-10-19');
    expect(res.success, res.error).toBe(true);
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0][COL.water_ml]).toBe('354');
    expect(summaryRows[0][COL.alcohol_drinks]).toBe('2');
  });

  it('stays idempotent with the drinks columns', () => {
    const drinks = () => [drinkRow('d1', 'water', '250', '2026-10-19'), drinkRow('d2', 'alcohol', '1', '2026-10-19')];
    const first = rebuild({ workouts: [], drinks: drinks() }, '2026-10-19', '2026-10-19');
    const after = JSON.parse(JSON.stringify(first.summaryRows));
    const second = rebuild({ workouts: [], drinks: drinks(), dailySummary: after }, '2026-10-19', '2026-10-19');
    expect(second.res.data.updated).toBe(1);
    expect(second.summaryRows).toEqual(after);
  });
});

describe('#522 AC3: blank, never 0, for a kind not logged', () => {
  it('leaves alcohol_drinks blank on a water-only day', () => {
    const { summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-10-19', type: 'weight' })],
      drinks: [drinkRow('d1', 'water', '250', '2026-10-19')],
    }, '2026-10-19', '2026-10-19');
    expect(summaryRows[0][COL.water_ml]).toBe('250');
    expect(summaryRows[0][COL.alcohol_drinks]).toBe('');
  });

  it('leaves water_ml blank on an alcohol-only day', () => {
    const { summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-10-19', type: 'weight' })],
      drinks: [drinkRow('d1', 'alcohol', '1', '2026-10-19')],
    }, '2026-10-19', '2026-10-19');
    expect(summaryRows[0][COL.water_ml]).toBe('');
    expect(summaryRows[0][COL.alcohol_drinks]).toBe('1');
  });

  it('leaves both blank on a day with no drinks, even when the tab has other days', () => {
    const { summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-10-19', type: 'weight' })],
      drinks: [drinkRow('d1', 'water', '250', '2026-10-18')],
    }, '2026-10-19', '2026-10-19');
    expect(summaryRows[0][COL.water_ml]).toBe('');
    expect(summaryRows[0][COL.alcohol_drinks]).toBe('');
  });

  it('rebuilds without error, both blank, when there is no Drinks tab', () => {
    const { res, drinkRows, summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-10-19', type: 'weight' })],
    }, '2026-10-19', '2026-10-19');
    expect(res.success, res.error).toBe(true);
    expect(drinkRows).toBeUndefined(); // the tab does not exist
    expect(summaryRows[0][COL.water_ml]).toBe('');
    expect(summaryRows[0][COL.alcohol_drinks]).toBe('');
  });

  it('gives a drinks-only day a row, with every other column blank', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      drinks: [drinkRow('d1', 'water', '500', '2026-10-19')],
    }, '2026-10-19', '2026-10-19');
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0][COL.water_ml]).toBe('500');
    expect(summaryRows[0][COL.activity_count]).toBe('');
    expect(summaryRows[0][COL.steps]).toBe('');
    expect(summaryRows[0][COL.weight_kg]).toBe('');
  });

  it('removes a drinks-only row once its last drink is deleted', () => {
    const first = rebuild({ workouts: [], drinks: [drinkRow('d1', 'water', '500', '2026-10-19')] }, '2026-10-19', '2026-10-19');
    const second = rebuild({
      workouts: [], drinks: [], dailySummary: JSON.parse(JSON.stringify(first.summaryRows)),
    }, '2026-10-19', '2026-10-19');
    expect(second.res.data.removed).toBe(1);
    expect(second.summaryRows).toHaveLength(0);
  });
});

describe('#522 AC4: getDailySummary returns the two fields', () => {
  it('reads water_ml and alcohol_drinks back by name', () => {
    const first = rebuild({
      workouts: [],
      drinks: [drinkRow('d1', 'water', '354', '2026-10-19'), drinkRow('d2', 'alcohol', '1', '2026-10-19')],
    }, '2026-10-19', '2026-10-19');
    const res = callDoGet<any[]>(first.sandbox, { action: 'getDailySummary', from: '2026-10-19', to: '2026-10-19' });
    expect(res.data[0].water_ml).toBe('354');
    expect(res.data[0].alcohol_drinks).toBe('1');
  });
});

// --- #562: coffee, rolled up from Drinks ------------------------------------

describe('#562 AC3: AB is appended, and the migration matches', () => {
  it('appends coffee_cups after alcohol_drinks, moving nothing', () => {
    const { sandbox } = loadApi();
    const fields = [...sandbox.DAILY_SUMMARY_FIELDS];
    expect(fields.slice(25, 28)).toEqual(['water_ml', 'alcohol_drinks', 'coffee_cups']);
  });
});

describe('#562 AC2: the day sums its coffee cups', () => {
  it('writes 2 for two coffees, and leaves water and alcohol as they were', () => {
    const { res, summaryRows } = rebuild({
      workouts: [],
      drinks: [
        drinkRow('d1', 'water', '354', '2026-10-19', '07:00:00'),
        drinkRow('c1', 'coffee', '1', '2026-10-19', '07:10:00'),
        drinkRow('d2', 'alcohol', '1', '2026-10-19', '19:00:00'),
        drinkRow('c2', 'coffee', '1', '2026-10-19', '13:00:00'),
        // Another day's coffee never leaks in.
        drinkRow('c3', 'coffee', '1', '2026-10-20'),
      ],
    }, '2026-10-19', '2026-10-19');
    expect(res.success, res.error).toBe(true);
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0][COL.coffee_cups]).toBe('2');
    expect(summaryRows[0][COL.water_ml]).toBe('354');
    expect(summaryRows[0][COL.alcohol_drinks]).toBe('1');
  });

  it('leaves coffee_cups blank, not 0, on a day with no coffee', () => {
    const { summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-10-19', type: 'weight' })],
      drinks: [drinkRow('d1', 'water', '250', '2026-10-19'), drinkRow('c1', 'coffee', '1', '2026-10-18')],
    }, '2026-10-19', '2026-10-19');
    expect(summaryRows[0][COL.coffee_cups]).toBe('');
    expect(summaryRows[0][COL.water_ml]).toBe('250');
  });

  it('gives a coffee-only day a row, with water and alcohol blank', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      drinks: [drinkRow('c1', 'coffee', '1', '2026-10-19')],
    }, '2026-10-19', '2026-10-19');
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0][COL.coffee_cups]).toBe('1');
    expect(summaryRows[0][COL.water_ml]).toBe('');
    expect(summaryRows[0][COL.alcohol_drinks]).toBe('');
  });

  it('leaves Z:AB blank, without error, when there is no Drinks tab', () => {
    const { res, drinkRows, summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-10-19', type: 'weight' })],
    }, '2026-10-19', '2026-10-19');
    expect(res.success, res.error).toBe(true);
    expect(drinkRows).toBeUndefined();
    expect(summaryRows[0].slice(COL.water_ml, COL.coffee_cups + 1)).toEqual(['', '', '']);
  });

  it('reads coffee_cups back by name', () => {
    const first = rebuild({
      workouts: [],
      drinks: [drinkRow('c1', 'coffee', '1', '2026-10-19'), drinkRow('c2', 'coffee', '1', '2026-10-19')],
    }, '2026-10-19', '2026-10-19');
    const res = callDoGet<any[]>(first.sandbox, { action: 'getDailySummary', from: '2026-10-19', to: '2026-10-19' });
    expect(res.data[0].coffee_cups).toBe('2');
  });
});

// --- #592: unwind, rolled up from Drinks ------------------------------------

describe('#592 AC3: AC is appended, and the migration matches', () => {
  it('appends unwind_mg after coffee_cups, moving nothing', () => {
    const { sandbox } = loadApi();
    const fields = [...sandbox.DAILY_SUMMARY_FIELDS];
    expect(fields.slice(25, 29)).toEqual(['water_ml', 'alcohol_drinks', 'coffee_cups', 'unwind_mg']);
    expect(sandbox.DAILY_SUMMARY_COLUMN_COUNT).toBe(fields.length);
  });
});

describe('#592 AC2: the day sums its unwind mg', () => {
  it('writes 10 for two entries of 5, and leaves water, alcohol and coffee as they were', () => {
    const { res, summaryRows } = rebuild({
      workouts: [],
      drinks: [
        drinkRow('d1', 'water', '354', '2026-10-19', '07:00:00'),
        drinkRow('c1', 'coffee', '1', '2026-10-19', '07:10:00'),
        drinkRow('u1', 'unwind', '5', '2026-10-19', '21:00:00'),
        drinkRow('d2', 'alcohol', '1', '2026-10-19', '19:00:00'),
        drinkRow('u2', 'unwind', '5', '2026-10-19', '22:10:00'),
        // Another day's unwind never leaks in.
        drinkRow('u3', 'unwind', '5', '2026-10-20'),
      ],
    }, '2026-10-19', '2026-10-19');
    expect(res.success, res.error).toBe(true);
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0][COL.unwind_mg]).toBe('10');
    expect(summaryRows[0][COL.water_ml]).toBe('354');
    expect(summaryRows[0][COL.alcohol_drinks]).toBe('1');
    expect(summaryRows[0][COL.coffee_cups]).toBe('1');
  });

  it('leaves unwind_mg blank, not 0, on a day with none', () => {
    const { summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-10-19', type: 'weight' })],
      drinks: [drinkRow('d1', 'water', '250', '2026-10-19'), drinkRow('u1', 'unwind', '5', '2026-10-18')],
    }, '2026-10-19', '2026-10-19');
    expect(summaryRows[0][COL.unwind_mg]).toBe('');
    expect(summaryRows[0][COL.water_ml]).toBe('250');
  });

  it('gives an unwind-only day a row, with the other drinks blank', () => {
    const { summaryRows } = rebuild({
      workouts: [],
      drinks: [drinkRow('u1', 'unwind', '5', '2026-10-19')],
    }, '2026-10-19', '2026-10-19');
    expect(summaryRows).toHaveLength(1);
    expect(summaryRows[0][COL.unwind_mg]).toBe('5');
    expect(summaryRows[0].slice(COL.water_ml, COL.unwind_mg)).toEqual(['', '', '']);
  });

  it('leaves Z:AC blank, without error, when there is no Drinks tab', () => {
    const { res, drinkRows, summaryRows } = rebuild({
      workouts: [workoutRow({ id: 'w_1', date: '2026-10-19', type: 'weight' })],
    }, '2026-10-19', '2026-10-19');
    expect(res.success, res.error).toBe(true);
    expect(drinkRows).toBeUndefined();
    expect(summaryRows[0].slice(COL.water_ml, COL.unwind_mg + 1)).toEqual(['', '', '', '']);
  });

  it('reads unwind_mg back by name', () => {
    const first = rebuild({
      workouts: [],
      drinks: [drinkRow('u1', 'unwind', '5', '2026-10-19'), drinkRow('u2', 'unwind', '5', '2026-10-19')],
    }, '2026-10-19', '2026-10-19');
    const res = callDoGet<any[]>(first.sandbox, { action: 'getDailySummary', from: '2026-10-19', to: '2026-10-19' });
    expect(res.data[0].unwind_mg).toBe('10');
  });
});
