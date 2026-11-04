// #765 - the RideWorkouts and FtpHistory row mappings mirror apps-script/src/types.js, and the
// Workouts mirror agrees with the API's WORKOUT_FIELDS on all 40 columns.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  RIDE_WORKOUT_FIELDS,
  FTP_HISTORY_FIELDS,
  RIDE_WORKOUT_CATEGORIES,
  FTP_SOURCES,
  rowToRideWorkout,
  rideWorkoutToRow,
  rowToFtpHistory,
  ftpHistoryToRow,
  currentFtp,
  type RideWorkoutRow,
  type FtpHistoryRow,
} from './spin-rows';
import { workoutToRow, rowToWorkout } from './workouts-api';
import type { Workout } from './types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const typesJs = readFileSync(resolve(__dirname, '../../../apps-script/src/types.js'), 'utf-8');

const fieldsOf = (name: string): string[] => {
  const block = typesJs.match(new RegExp(`var ${name} = \\[([\\s\\S]*?)\\];`))?.[1];
  expect(block, `${name} not found in types.js`).toBeTruthy();
  return Array.from(block!.matchAll(/'([a-z_0-9]+)'/g), (m) => m[1]);
};
const numberOf = (name: string): number => Number(typesJs.match(new RegExp(`var ${name} = (\\d+);`))?.[1]);

describe('the three field lists mirror types.js', () => {
  it('WORKOUT_FIELDS: workoutToRow emits all 40, in order, and rowToWorkout reads them back', () => {
    const fields = fieldsOf('WORKOUT_FIELDS');
    expect(fields).toHaveLength(40);
    expect(numberOf('WORKOUT_COLUMN_COUNT')).toBe(40);
    const named = Object.fromEntries(fields.map((f) => [f, f])) as unknown as Workout;
    expect(workoutToRow(named)).toEqual(fields);
    const w = rowToWorkout(fields, 2) as unknown as Record<string, unknown>;
    for (const f of fields) expect(w[f], f).toBe(f);
  });

  it('RIDE_WORKOUT_FIELDS matches name for name and in order (A:H)', () => {
    expect([...RIDE_WORKOUT_FIELDS]).toEqual(fieldsOf('RIDE_WORKOUT_FIELDS'));
    expect(RIDE_WORKOUT_FIELDS).toHaveLength(8);
    expect(numberOf('RIDE_WORKOUT_COLUMN_COUNT')).toBe(8);
  });

  it('FTP_HISTORY_FIELDS matches name for name and in order (A:F)', () => {
    expect([...FTP_HISTORY_FIELDS]).toEqual(fieldsOf('FTP_HISTORY_FIELDS'));
    expect(FTP_HISTORY_FIELDS).toHaveLength(6);
    expect(numberOf('FTP_HISTORY_COLUMN_COUNT')).toBe(6);
  });

  it('the vocabularies and limits agree', () => {
    const list = (name: string): string[] => {
      const block = typesJs.match(new RegExp('var ' + name + ' = \\[([^\\]]*)\\]'))?.[1];
      expect(block, name).toBeTruthy();
      return Array.from(block!.matchAll(/'([^']+)'/g), (m) => m[1]);
    };
    expect([...RIDE_WORKOUT_CATEGORIES]).toEqual(list('RIDE_WORKOUT_CATEGORIES'));
    expect([...FTP_SOURCES]).toEqual(list('FTP_SOURCES'));
    expect(RIDE_WORKOUT_CATEGORIES).toEqual(['Endurance', 'Sweet spot', 'Threshold', 'VO2', 'Recovery']);
  });
});

describe('the row mappers round-trip every column', () => {
  it('RideWorkouts', () => {
    const named = Object.fromEntries(RIDE_WORKOUT_FIELDS.map((f) => [f, f])) as unknown as RideWorkoutRow;
    expect(rideWorkoutToRow(named)).toEqual([...RIDE_WORKOUT_FIELDS]);
    const w = rowToRideWorkout([...RIDE_WORKOUT_FIELDS]) as unknown as Record<string, string>;
    for (const f of RIDE_WORKOUT_FIELDS) expect(w[f], f).toBe(f);
  });

  it('FtpHistory', () => {
    const named = Object.fromEntries(FTP_HISTORY_FIELDS.map((f) => [f, f])) as unknown as FtpHistoryRow;
    expect(ftpHistoryToRow(named)).toEqual([...FTP_HISTORY_FIELDS]);
    const f = rowToFtpHistory([...FTP_HISTORY_FIELDS]) as unknown as Record<string, string>;
    for (const k of FTP_HISTORY_FIELDS) expect(f[k], k).toBe(k);
  });

  it('a short row, as the Sheets API returns one, reads every missing cell as ""', () => {
    expect(rowToRideWorkout(['rw_1', 'Name'])).toEqual({
      id: 'rw_1',
      name: 'Name',
      category: '',
      description: '',
      steps: '',
      duration_s: '',
      created: '',
      updated: '',
    });
    expect(rowToFtpHistory(['f1', '2026-11-07', '250', 'manual'])).toEqual({
      id: 'f1',
      date: '2026-11-07',
      ftp_w: '250',
      source: 'manual',
      ride_id: '',
      created: '',
    });
    expect(rowToRideWorkout([])).toEqual(rowToRideWorkout(['', '']));
  });
});

describe('currentFtp is the newest row by date and then created', () => {
  const row = (id: string, date: string, created: string): FtpHistoryRow => ({
    id,
    date,
    ftp_w: '250',
    source: 'manual',
    ride_id: '',
    created,
  });

  it('is null on no rows, and ignores a blank row', () => {
    expect(currentFtp([])).toBeNull();
    expect(currentFtp([row('', '2030-01-01', 'x')])).toBeNull();
  });

  it('picks by date first, then created, then the later row', () => {
    const rows = [
      row('a', '2026-09-01', '2026-09-01T12:00:00Z'),
      row('b', '2026-11-01', '2026-11-01T08:00:00Z'),
      row('c', '2026-11-01', '2026-11-01T09:00:00Z'),
      row('d', '2026-10-01', '2026-11-05T09:00:00Z'),
    ];
    expect(currentFtp(rows)?.id).toBe('c');
    expect(currentFtp([row('x', '2026-11-01', 't'), row('y', '2026-11-01', 't')])?.id).toBe('y');
  });
});
