// A Thrive Spin ride's streams (#771): the `thrive-spin-streams` v1 file #765's `getWorkoutStreams`
// returns, checked at the boundary and reduced to what the ride detail draws. Pure functions; the
// call and the session cache are in `spin/streams-cache.ts`.
//
// The file is 1 Hz with paused seconds left out: `power_w`, `target_w`, `hr_bpm` and `cadence_rpm`
// are arrays of one length n, each entry a whole number or null (blank is not zero), and
// `steps[]` and `pauses[]` index into them.

import { ZONE_COUNT, zoneOf } from '../spin/zones';

export const STREAMS_FORMAT = 'thrive-spin-streams';
/** The most samples a file may hold: 12 hours. */
export const MAX_SAMPLES = 43200;
/** The most buckets the chart draws. */
export const MAX_BUCKETS = 300;

export type Sample = number | null;

export interface StreamStep {
  start_s: number;
  end_s: number;
  label: string;
  mode: string;
}

export interface StreamPause {
  at_s: number;
  duration_s: number;
}

/** The file, once it has passed the boundary check. */
export interface RideStreams {
  n: number;
  power: Sample[];
  target: Sample[];
  hr: Sample[];
  cadence: Sample[];
  steps: StreamStep[];
  pauses: StreamPause[];
  ftp_w: number | null;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function isSampleArray(v: unknown): v is Sample[] {
  return Array.isArray(v) && v.every((s) => s === null || isInt(s));
}

/**
 * The boundary check: the streams, or null when the response is not a v1 file this screen can draw.
 * A failure is an error state, never a partial draw.
 */
export function parseStreams(raw: unknown): RideStreams | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (f.format !== STREAMS_FORMAT || f.v !== 1) return null;
  const { power_w, target_w, hr_bpm, cadence_rpm } = f;
  if (!isSampleArray(power_w) || !isSampleArray(target_w) || !isSampleArray(hr_bpm) || !isSampleArray(cadence_rpm)) {
    return null;
  }
  const n = power_w.length;
  if (n < 1 || n > MAX_SAMPLES) return null;
  if (target_w.length !== n || hr_bpm.length !== n || cadence_rpm.length !== n) return null;

  if (!Array.isArray(f.steps)) return null;
  const steps: StreamStep[] = [];
  for (const s of f.steps as unknown[]) {
    const step = s as Partial<StreamStep> | null;
    if (!step || !isInt(step.start_s) || !isInt(step.end_s)) return null;
    if (step.start_s < 0 || step.start_s > step.end_s || step.end_s > n) return null;
    if (typeof step.label !== 'string' || typeof step.mode !== 'string') return null;
    steps.push({ start_s: step.start_s, end_s: step.end_s, label: step.label, mode: step.mode });
  }

  if (!Array.isArray(f.pauses)) return null;
  const pauses: StreamPause[] = [];
  for (const p of f.pauses as unknown[]) {
    const pause = p as Partial<StreamPause> | null;
    if (!pause || !isInt(pause.at_s) || !isInt(pause.duration_s)) return null;
    if (pause.at_s < 0 || pause.at_s > n || pause.duration_s < 0) return null;
    pauses.push({ at_s: pause.at_s, duration_s: pause.duration_s });
  }

  let ftp: number | null = null;
  if (f.ftp_w !== undefined && f.ftp_w !== null) {
    if (!isInt(f.ftp_w) || f.ftp_w <= 0) return null;
    ftp = f.ftp_w;
  }
  return { n, power: power_w, target: target_w, hr: hr_bpm, cadence: cadence_rpm, steps, pauses, ftp_w: ftp };
}

// --- Derivation -----------------------------------------------------------

/** The mean of the non-null samples in [from, to), unrounded, or null when there are none. */
export function meanOf(values: readonly Sample[], from = 0, to = values.length): number | null {
  let sum = 0;
  let count = 0;
  for (let i = from; i < to; i++) {
    const v = values[i];
    if (v !== null) {
      sum += v;
      count += 1;
    }
  }
  return count > 0 ? sum / count : null;
}

/** Half up to a whole number. */
export const roundHalfUp = (x: number): number => Math.floor(x + 0.5);

export interface Bucket {
  /** The middle second of the bucket: its place on the time axis. */
  x: number;
  power: number | null;
  hr: number | null;
  target: number | null;
}

/**
 * The chart's buckets: min(n, 300) of them, bucket k covering samples floor(k·n/B) to floor((k+1)·n/B) − 1.
 * Each series is the mean of its non-null samples in the bucket; a bucket with none is null for that series,
 * which breaks a line and draws no block, and is never 0.
 */
export function bucketize(s: Pick<RideStreams, 'n' | 'power' | 'hr' | 'target'>): Bucket[] {
  const b = Math.min(s.n, MAX_BUCKETS);
  const out: Bucket[] = [];
  for (let k = 0; k < b; k++) {
    const from = Math.floor((k * s.n) / b);
    const to = Math.floor(((k + 1) * s.n) / b);
    out.push({
      x: (from + to) / 2,
      power: meanOf(s.power, from, to),
      hr: meanOf(s.hr, from, to),
      target: meanOf(s.target, from, to),
    });
  }
  return out;
}

export interface IntervalRow {
  label: string;
  durationS: number;
  /** "225 W", "125–175 W", or the mode word when the step has no target. */
  targetText: string;
  /** The zone of the step's mean target, or null with no target or no FTP. */
  zone: number | null;
  hasTarget: boolean;
  avgPower: number | null;
  avgHr: number | null;
}

const MODE_WORDS: Record<string, string> = { resistance: 'Resistance', slope: 'Slope', free: 'Free' };

/** One row per step that lasts at least a second, in file order. */
export function intervalRows(s: RideStreams, ftp: number | null): IntervalRow[] {
  const rows: IntervalRow[] = [];
  for (const step of s.steps) {
    if (step.end_s - step.start_s < 1) continue;
    const targets: number[] = [];
    for (let i = step.start_s; i < step.end_s; i++) {
      const t = s.target[i];
      if (t !== null) targets.push(t);
    }
    const hasTarget = targets.length > 0;
    let targetText: string;
    if (!hasTarget) targetText = MODE_WORDS[step.mode] ?? 'Free';
    else if (targets.every((t) => t === targets[0])) targetText = `${targets[0]} W`;
    else targetText = `${targets[0]}–${targets[targets.length - 1]} W`;
    const meanTarget = hasTarget ? targets.reduce((a, b) => a + b, 0) / targets.length : null;
    const avgPower = meanOf(s.power, step.start_s, step.end_s);
    const avgHr = meanOf(s.hr, step.start_s, step.end_s);
    rows.push({
      label: step.label,
      durationS: step.end_s - step.start_s,
      targetText,
      zone: meanTarget !== null && ftp ? zoneOf(meanTarget, ftp) : null,
      hasTarget,
      avgPower: avgPower === null ? null : roundHalfUp(avgPower),
      avgHr: avgHr === null ? null : Math.round(avgHr),
    });
  }
  return rows;
}

/** Seconds in each of Z1 to Z6 (index 0 is Z1), counting every second with a power reading. */
export function zoneSeconds(power: readonly Sample[], ftp: number): number[] {
  const out = new Array<number>(ZONE_COUNT).fill(0);
  for (const p of power) {
    if (p !== null) out[zoneOf(p, ftp) - 1] += 1;
  }
  return out;
}

/** The mean of the non-null, non-zero cadence samples, rounded half up: 0 rpm is coasting, not a cadence. */
export function averageCadence(cadence: readonly Sample[]): number | null {
  let sum = 0;
  let count = 0;
  for (const c of cadence) {
    if (c !== null && c > 0) {
      sum += c;
      count += 1;
    }
  }
  return count > 0 ? roundHalfUp(sum / count) : null;
}

/** What the ride detail draws, held for the session. The raw arrays are not kept. */
export interface RideDerived {
  seconds: number;
  buckets: Bucket[];
  ftp: number | null;
  hasHr: boolean;
  hasPower: boolean;
  /** The lowest and highest bucket heart rate, rounded, or null with no heart rate. */
  hrRange: { low: number; high: number } | null;
  avgCadence: number | null;
  pauses: StreamPause[];
  pauseTotalS: number;
  intervals: IntervalRow[];
  /** Seconds per zone, Z1 first, or null with no FTP. */
  zones: number[] | null;
  /** Seconds with a power reading. */
  powerSeconds: number;
}

/** The streams reduced to the screen. `rowFtp` is the row's `ftp_w` (a positive number or null); it wins over the file's. */
export function deriveRide(s: RideStreams, rowFtp: number | null): RideDerived {
  const ftp = rowFtp !== null && rowFtp > 0 ? rowFtp : s.ftp_w;
  const buckets = bucketize(s);
  const hrs = buckets.flatMap((b) => (b.hr === null ? [] : [b.hr]));
  const powerSeconds = s.power.reduce<number>((n, p) => (p === null ? n : n + 1), 0);
  return {
    seconds: s.n,
    buckets,
    ftp,
    hasHr: s.hr.some((h) => h !== null),
    hasPower: powerSeconds > 0,
    hrRange: hrs.length > 0 ? { low: Math.round(Math.min(...hrs)), high: Math.round(Math.max(...hrs)) } : null,
    avgCadence: averageCadence(s.cadence),
    pauses: s.pauses,
    pauseTotalS: s.pauses.reduce((n, p) => n + p.duration_s, 0),
    intervals: intervalRows(s, ftp),
    zones: ftp ? zoneSeconds(s.power, ftp) : null,
    powerSeconds,
  };
}

/** Whether the Intervals card is worth showing: two rows, or any target. */
export function showIntervals(rows: readonly IntervalRow[]): boolean {
  return rows.length >= 2 || rows.some((r) => r.hasTarget);
}
