// #771 — a Spin ride's streams: the boundary check and everything the screen draws from them, as pure functions.

import { describe, expect, it } from 'vitest';
import {
  averageCadence,
  bucketize,
  deriveRide,
  intervalRows,
  MAX_BUCKETS,
  parseStreams,
  showIntervals,
  zoneSeconds,
  type RideStreams,
  type Sample,
} from './spin-streams';

/** A valid file body of n samples; every array is filled from the function given (default null). */
function file(n: number, over: Record<string, unknown> = {}) {
  const fill = (v: Sample) => new Array<Sample>(n).fill(v);
  return {
    format: 'thrive-spin-streams',
    v: 1,
    ride_id: 'r1',
    started_at_utc: '2025-01-13T13:30:00Z',
    interval_s: 1,
    ftp_w: 250,
    intensity_pct: 100,
    power_w: fill(200),
    target_w: fill(null),
    hr_bpm: fill(null),
    cadence_rpm: fill(90),
    steps: [{ start_s: 0, end_s: n, label: 'Ride', mode: 'free' }],
    pauses: [],
    ...over,
  };
}

function streams(n: number, over: Partial<RideStreams> = {}): RideStreams {
  const s = parseStreams(file(n));
  if (!s) throw new Error('fixture');
  return { ...s, ...over };
}

describe('parseStreams: the boundary check', () => {
  it('accepts a v1 file', () => {
    const s = parseStreams(file(120));
    expect(s?.n).toBe(120);
    expect(s?.ftp_w).toBe(250);
  });

  it('takes an absent or null ftp_w as none', () => {
    expect(parseStreams(file(5, { ftp_w: null }))?.ftp_w).toBeNull();
    const { ftp_w: _gone, ...rest } = file(5);
    expect(parseStreams(rest)?.ftp_w).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['a wrong format', file(5, { format: 'thrive-track' })],
    ['a wrong version', file(5, { v: 2 })],
    ['arrays of different lengths', file(5, { hr_bpm: [1, 2, 3] })],
    ['an empty file', file(0)],
    ['over 12 hours', file(43201)],
    ['a non-integer sample', file(5, { power_w: [1, 2.5, 3, 4, 5] })],
    ['a string sample', file(5, { power_w: [1, '2', 3, 4, 5] })],
    ['a step past the arrays', file(5, { steps: [{ start_s: 0, end_s: 6, label: 'x', mode: 'erg' }] })],
    ['a step that ends before it starts', file(5, { steps: [{ start_s: 3, end_s: 2, label: 'x', mode: 'erg' }] })],
    ['a step with no label', file(5, { steps: [{ start_s: 0, end_s: 2, mode: 'erg' }] })],
    ['steps not an array', file(5, { steps: {} })],
    ['a pause past the arrays', file(5, { pauses: [{ at_s: 6, duration_s: 4 }] })],
    ['a negative pause', file(5, { pauses: [{ at_s: 1, duration_s: -4 }] })],
    ['a zero ftp', file(5, { ftp_w: 0 })],
    ['a fractional ftp', file(5, { ftp_w: 250.5 })],
  ])('refuses %s', (_name, body) => {
    expect(parseStreams(body)).toBeNull();
  });

  it('accepts 43200 samples, the limit', () => {
    expect(parseStreams(file(43200))?.n).toBe(43200);
  });
});

describe('bucketize', () => {
  it.each([
    [1, 1],
    [2, 2],
    [120, 120],
    [300, 300],
    [3600, 300],
    [43200, 300],
  ])('n = %i draws %i buckets', (n, expected) => {
    expect(bucketize(streams(n))).toHaveLength(expected);
    expect(expected).toBe(Math.min(n, MAX_BUCKETS));
  });

  it('takes the mean of each bucket, from the samples it covers, at its middle second', () => {
    const power: Sample[] = Array.from({ length: 3600 }, (_, i) => i % 3600);
    const b = bucketize(streams(3600, { power }));
    // 12 samples per bucket: bucket 0 is 0..11, mean 5.5, middle second 6.
    expect(b[0].power).toBe(5.5);
    expect(b[0].x).toBe(6);
    expect(b[299].power).toBe((3588 + 3599) / 2);
  });

  it('uses only the non-null samples of a bucket', () => {
    const power: Sample[] = [100, null, 300, null, null, null];
    const b = bucketize(streams(6, { power }));
    expect(b.map((x) => x.power)).toEqual([100, null, 300, null, null, null]);
  });

  it('leaves a bucket with no sample null, never 0', () => {
    const power: Sample[] = new Array<Sample>(3600).fill(150);
    // A run of nulls that empties whole buckets (36 buckets of 12 seconds).
    for (let i = 600; i < 1032; i++) power[i] = null;
    const b = bucketize(streams(3600, { power }));
    const empty = b.filter((x) => x.power === null);
    expect(empty.length).toBe(36);
    expect(b.some((x) => x.power === 0)).toBe(false);
    // A bucket that is only partly empty still has a mean of what it has.
    const partial: Sample[] = new Array<Sample>(3600).fill(100);
    for (let i = 0; i < 6; i++) partial[i] = null;
    expect(bucketize(streams(3600, { power: partial }))[0].power).toBe(100);
  });

  it('keeps targets and heart rate as their own series', () => {
    const b = bucketize(streams(2, { target: [200, null], hr: [null, 140] }));
    expect(b[0]).toMatchObject({ target: 200, hr: null });
    expect(b[1]).toMatchObject({ target: null, hr: 140 });
  });
});

describe('intervalRows', () => {
  const steps = [
    { start_s: 0, end_s: 4, label: 'Warm-up', mode: 'erg' },
    { start_s: 4, end_s: 8, label: 'Hold', mode: 'erg' },
    { start_s: 8, end_s: 8, label: 'Skipped', mode: 'erg' },
    { start_s: 8, end_s: 12, label: 'Climb', mode: 'slope' },
  ];
  const s = streams(12, {
    steps,
    target: [100, 120, 140, 160, 200, 200, 200, 200, null, null, null, null],
    power: [100, 100, 100, 100, 210, 190, null, null, 150, 150, 150, 151],
    hr: [null, null, null, null, 120, 124, null, null, null, null, null, null],
  });

  it('is one row per step that lasts at least a second', () => {
    expect(intervalRows(s, 250).map((r) => r.label)).toEqual(['Warm-up', 'Hold', 'Climb']);
  });

  it('shows a constant target as one number and a changing one as first to last', () => {
    const rows = intervalRows(s, 250);
    expect(rows[0].targetText).toBe('100–160 W');
    expect(rows[1].targetText).toBe('200 W');
  });

  it('names the mode for a step with no target', () => {
    expect(intervalRows(s, 250)[2].targetText).toBe('Slope');
    const free = intervalRows(streams(3, { steps: [{ start_s: 0, end_s: 3, label: 'x', mode: 'free' }] }), 250);
    expect(free[0].targetText).toBe('Free');
    const resistance = intervalRows(
      streams(3, { steps: [{ start_s: 0, end_s: 3, label: 'x', mode: 'resistance' }] }),
      250,
    );
    expect(resistance[0].targetText).toBe('Resistance');
  });

  it('averages the non-null readings, half up, and shows none as null', () => {
    const rows = intervalRows(s, 250);
    expect(rows[1].avgPower).toBe(200);
    expect(rows[2].avgPower).toBe(150); // 150.25
    expect(rows[1].avgHr).toBe(122);
    expect(rows[0].avgHr).toBeNull();
  });

  it('puts a step in the zone of its mean target ÷ FTP', () => {
    const rows = intervalRows(s, 250);
    // 200 of 250 = 80%: Z3 (76 to under 91).
    expect(rows[1].zone).toBe(3);
    expect(rows[2].zone).toBeNull();
    expect(intervalRows(s, null)[1].zone).toBeNull();
  });
});

describe('showIntervals', () => {
  const row = (hasTarget: boolean) => ({
    label: '',
    durationS: 1,
    targetText: '',
    zone: null,
    hasTarget,
    avgPower: null,
    avgHr: null,
  });
  it('hides a single step with no target and shows anything else', () => {
    expect(showIntervals([row(false)])).toBe(false);
    expect(showIntervals([])).toBe(false);
    expect(showIntervals([row(true)])).toBe(true);
    expect(showIntervals([row(false), row(false)])).toBe(true);
  });
});

describe('zoneSeconds', () => {
  it('counts a 0 W second in Z1 and a null second nowhere', () => {
    const z = zoneSeconds([0, null, 100, 139, 140, 189, 190, 227, 228, 264, 265, 302, 303, 900], 250);
    expect(z).toEqual([3, 2, 2, 2, 2, 2]);
    expect(z.reduce((a, b) => a + b, 0)).toBe(13);
  });
});

describe('averageCadence', () => {
  it('leaves out null and zero, and rounds half up', () => {
    expect(averageCadence([90, 0, null, 91, 0])).toBe(91); // 90.5
    expect(averageCadence([0, 0, null])).toBeNull();
    expect(averageCadence([])).toBeNull();
  });
});

describe('deriveRide', () => {
  it('prefers the row FTP over the file FTP, and falls back to the file', () => {
    expect(deriveRide(streams(10), 300).ftp).toBe(300);
    expect(deriveRide(streams(10), null).ftp).toBe(250);
    expect(deriveRide(streams(10, { ftp_w: null }), null).ftp).toBeNull();
    expect(deriveRide(streams(10, { ftp_w: null }), null).zones).toBeNull();
  });

  it('reports heart rate, power, the heart-rate range and the pauses', () => {
    const r = deriveRide(
      streams(4, {
        hr: [100, 120, null, 160],
        power: [null, null, null, null],
        pauses: [
          { at_s: 2, duration_s: 45 },
          { at_s: 3, duration_s: 15 },
        ],
      }),
      null,
    );
    expect(r.hasHr).toBe(true);
    expect(r.hasPower).toBe(false);
    expect(r.hrRange).toEqual({ low: 100, high: 160 });
    expect(r.pauseTotalS).toBe(60);
    expect(r.powerSeconds).toBe(0);
  });

  it('has no heart rate range with no heart rate', () => {
    const r = deriveRide(streams(4), null);
    expect(r.hasHr).toBe(false);
    expect(r.hrRange).toBeNull();
  });

  it('is cheap for a 12 hour ride', () => {
    const r = deriveRide(streams(43200), null);
    expect(r.buckets).toHaveLength(300);
    expect(r.seconds).toBe(43200);
  });
});
