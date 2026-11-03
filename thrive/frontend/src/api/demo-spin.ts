// Demo mode's Thrive Spin rides (#771): two bundled `thrive-spin-streams` v1 files and the library row
// the first one links to. Made by a seeded generator, so they are fixed, not random: tests assert
// numbers, and the screen looks the same on every visit.
//
// 1. "Sweet Spot 3×12": FTP 250, one hour of ride time. Warm-up 10:00 ramping 125 to 175 W, three passes
//    of Sweet spot 12:00 at 225 W and Recover 4:00 at 138 W, Cool-down 2:00 free. Heart rate throughout
//    with a 20 s dropout in the second recovery, and one 45 s pause at 30:00.
// 2. "Free ride": 40:00 at FTP 250, one step with no targets, no heart rate, cadence present.

import type { RideWorkoutRow } from './spin-rows';
import type { Sample } from './spin-streams';

export const DEMO_SPIN_FTP = 250;
export const DEMO_SWEET_SPOT_ID = 'w_demo_spin1';
export const DEMO_FREE_RIDE_ID = 'w_demo_spin2';
export const DEMO_SWEET_SPOT_LIBRARY_ID = 'rw_demo001';

/** A small deterministic generator (mulberry32): the same numbers on every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Streams {
  format: 'thrive-spin-streams';
  v: 1;
  ride_id: string;
  started_at_utc: string;
  interval_s: 1;
  ftp_w: number;
  intensity_pct: number;
  power_w: Sample[];
  target_w: Sample[];
  hr_bpm: Sample[];
  cadence_rpm: Sample[];
  steps: { start_s: number; end_s: number; label: string; mode: string }[];
  pauses: { at_s: number; duration_s: number }[];
}

function sweetSpot(): Streams {
  const rand = seeded(771);
  const power: Sample[] = [];
  const target: Sample[] = [];
  const hr: Sample[] = [];
  const cadence: Sample[] = [];
  const steps: Streams['steps'] = [];

  let hrNow = 96;
  const push = (t: number | null, cad: number) => {
    const base = t ?? 120 + Math.round(rand() * 40);
    const p = Math.max(0, Math.round(base + (rand() - 0.5) * 16));
    power.push(p);
    target.push(t);
    // Heart rate lags power: a slow drift toward a level the power sets.
    const level = 92 + p * 0.3;
    hrNow += (level - hrNow) * 0.04 + (rand() - 0.5) * 1.2;
    hr.push(Math.round(hrNow));
    cadence.push(Math.max(0, Math.round(cad + (rand() - 0.5) * 8)));
  };
  const step = (label: string, mode: string, seconds: number, at: (i: number) => number | null, cad: number) => {
    const start = power.length;
    for (let i = 0; i < seconds; i++) push(at(i), cad);
    steps.push({ start_s: start, end_s: power.length, label, mode });
  };

  step('Warm-up', 'erg', 600, (i) => Math.round(125 + (50 * i) / 599), 85);
  for (let pass = 0; pass < 3; pass++) {
    step('Sweet spot', 'erg', 720, () => 225, 90);
    step('Recover', 'erg', 240, () => 138, 80);
  }
  step('Cool-down', 'free', 120, () => null, 75);

  // A 20 s dropout of the strap in the second recovery (1560 + 720 + 240 = 2520 is its end).
  for (let i = 2380; i < 2400; i++) hr[i] = null;

  return {
    format: 'thrive-spin-streams',
    v: 1,
    ride_id: 'ride-demo-sweet-spot',
    started_at_utc: '2025-01-13T13:30:00Z',
    interval_s: 1,
    ftp_w: DEMO_SPIN_FTP,
    intensity_pct: 100,
    power_w: power,
    target_w: target,
    hr_bpm: hr,
    cadence_rpm: cadence,
    steps,
    pauses: [{ at_s: 1800, duration_s: 45 }],
  };
}

function freeRide(): Streams {
  const rand = seeded(7710);
  const n = 2400;
  const power: Sample[] = [];
  for (let i = 0; i < n; i++) {
    // A slow wave between easy and hard, with noise.
    const wave = 150 + 70 * Math.sin((2 * Math.PI * i) / 600);
    power.push(Math.max(0, Math.round(wave + (rand() - 0.5) * 30)));
  }
  return {
    format: 'thrive-spin-streams',
    v: 1,
    ride_id: 'ride-demo-free',
    started_at_utc: '2025-01-11T01:00:00Z',
    interval_s: 1,
    ftp_w: DEMO_SPIN_FTP,
    intensity_pct: 100,
    power_w: power,
    target_w: new Array<Sample>(n).fill(null),
    hr_bpm: new Array<Sample>(n).fill(null),
    cadence_rpm: power.map(() => 82 + Math.round(rand() * 14)),
    steps: [{ start_s: 0, end_s: n, label: 'Free ride', mode: 'free' }],
    pauses: [],
  };
}

/** The bundled streams by workout id. Not parsed: the screen checks them like any response. */
export const DEMO_SWEET_SPOT_STREAMS = sweetSpot();
export const DEMO_FREE_RIDE_STREAMS = freeRide();
export const DEMO_SPIN_STREAMS: Record<string, unknown> = {
  [DEMO_SWEET_SPOT_ID]: DEMO_SWEET_SPOT_STREAMS,
  [DEMO_FREE_RIDE_ID]: DEMO_FREE_RIDE_STREAMS,
};

/** The ride figures a row holds (AE:AK), worked out from the bundled streams the way Spin works them. */
export interface DemoRideFigures {
  avg_power_w: string;
  np_w: string;
  intensity_factor: string;
  tss: string;
  work_kj: string;
}

export function demoRideFigures(streams: Streams): DemoRideFigures {
  const p = streams.power_w.map((x) => x ?? 0);
  const n = p.length;
  const sum = p.reduce((a, b) => a + b, 0);
  // Normalized power: the fourth-power mean of the 30 s rolling average.
  let acc = 0;
  let rolling = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    rolling += p[i];
    if (i >= 30) rolling -= p[i - 30];
    if (i >= 29) {
      acc += Math.pow(rolling / 30, 4);
      count += 1;
    }
  }
  const np = count > 0 ? Math.pow(acc / count, 0.25) : sum / n;
  const ifactor = np / streams.ftp_w;
  const tss = ((n * np * ifactor) / (streams.ftp_w * 3600)) * 100;
  return {
    avg_power_w: String(Math.round(sum / n)),
    np_w: String(Math.round(np)),
    intensity_factor: ifactor.toFixed(2),
    tss: String(Math.round(tss)),
    work_kj: String(Math.round(sum / 1000)),
  };
}

/**
 * The demo library (#772): four workouts. "Sweet Spot 3×12" is the one the Sweet Spot ride (#771) and the
 * planned Tempo Ride link to.
 */
const demoWorkout = (
  id: string,
  name: string,
  category: string,
  description: string,
  seconds: number,
  day: string,
) => ({
  id,
  name,
  category,
  description,
  steps: '',
  duration_s: String(seconds),
  created: `2025-01-${day}T00:00:00.000Z`,
  updated: `2025-01-${day}T00:00:00.000Z`,
});

export const DEMO_RIDE_WORKOUTS: RideWorkoutRow[] = [
  demoWorkout(
    DEMO_SWEET_SPOT_LIBRARY_ID,
    'Sweet Spot 3×12',
    'Sweet spot',
    'Three twelve-minute blocks at 90% of FTP.',
    3480,
    '02',
  ),
  demoWorkout('rw_demo002', 'Endurance 75', 'Endurance', 'Seventy-five minutes steady at 65% of FTP.', 4500, '03'),
  demoWorkout('rw_demo003', 'VO2 Max 5×3', 'VO2', 'Five three-minute efforts at 120% of FTP.', 3300, '04'),
  demoWorkout('rw_demo004', 'Recovery Spin 30', 'Recovery', 'Thirty easy minutes at 50% of FTP.', 1800, '05'),
];
