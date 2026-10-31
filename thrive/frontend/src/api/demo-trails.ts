// Demo trail data (#682): passes for some of the demo bike rides and hikes, in
// the per-pass shape #681's matcher produces, and the Routes like this pairs.
//
// Every trail name here is invented, and the fixture holds no date or
// coordinate: passes hang off demo workout ids, whose dates `demo-data.ts`
// already shifts to sit around today. It copies the real data's mess on
// purpose: names with and without "Trail", a section ("Lower Juniper"), two
// names in one tag (`;` and ` / `), laps, an out-and-back, a partial pass.

import type { TrailPass } from '../trails/types';

export interface DemoTrailActivity {
  /** A `DEMO_WORKOUTS` id. */
  id: string;
  passes: TrailPass[];
  unmatchedM: number;
}

function pass(
  trail: string,
  startPct: number,
  endPct: number,
  durationS: number | null,
  climbM: number | null,
  entryOffsetS: number,
  metres: number,
): TrailPass {
  return {
    trail,
    metres,
    durationS,
    climbM,
    startPct,
    endPct,
    direction: endPct >= startPct ? 'forward' : 'reverse',
    entryOffsetS,
  };
}

export const DEMO_TRAIL_ACTIVITIES: DemoTrailActivity[] = [
  // Canyon Road Ride, the tracked ride (demo-track-ride): the newest Juniper Ridge pass, a full one
  // with a like-for-like pass before it (Gravel Loop's second lap), so the goal question has an answer.
  {
    id: 'w_demo011',
    passes: [
      pass('Lower Juniper', 0, 100, 251, 38, 610, 905),
      pass('Juniper Ridge', 0, 100, 872, 128, 842, 3210),
      pass('Aspen Draw;Kestrel Connector', 0, 100, 41, 4, 1755, 164),
    ],
    unmatchedM: 1931,
  },
  // Gravel Loop: two laps of Juniper Ridge Trail, which never compare with each other, and Heron Loop.
  {
    id: 'w_demo012',
    passes: [
      pass('Juniper Ridge Trail', 0, 100, 951, 134, 312, 3205),
      pass('Heron Loop', 0, 100, 488, 41, 1290, 2140),
      pass('Juniper Ridge Trail', 0, 100, 944, 134, 2405, 3212),
    ],
    unmatchedM: 4820,
  },
  // Evening Ride (history): an out-and-back, out forward and back in reverse; no reverse pass before it.
  {
    id: 'w_demo022',
    passes: [
      pass('Juniper Ridge', 0, 100, 990, 131, 420, 3208),
      pass('Juniper Ridge', 100, 0, 612, 6, 1462, 3204),
      pass('Fox Hollow / Kestrel Connector', 0, 100, 44, 4, 2210, 170),
      pass('Heron Loop Trail', 0, 100, 515, 43, 2690, 2136),
    ],
    unmatchedM: 905,
  },
  // River Path Ride (history): a partial pass, joining Juniper Ridge part way (about 40 → 100%).
  {
    id: 'w_demo028',
    passes: [
      pass('Lower Juniper', 0, 100, 266, 37, 598, 902),
      pass('Juniper Ridge', 41, 100, 561, 80, 905, 1890),
      pass('Heron Loop', 0, 100, 530, null, 1720, 2142),
    ],
    unmatchedM: 2410,
  },
  // Climb Repeats (history): the oldest Juniper Ridge pass, a full one.
  {
    id: 'w_demo034',
    passes: [
      pass('Juniper Ridge Trail', 0, 100, 1012, 129, 505, 3211),
      pass('Aspen Draw;Kestrel Connector', 0, 100, 47, 4, 1580, 161),
    ],
    unmatchedM: 3040,
  },
  // The demo hike "Ridge Trail" (the one with the bundled track), all on its trail.
  {
    id: 'w_demo008',
    passes: [pass('Ridge Trail', 0, 100, 2105, 212, 610, 2930)],
    unmatchedM: 0,
  },
  // Ridge Hike and Creek Hike (history): earlier hikes on Ridge Trail.
  {
    id: 'w_demo025',
    passes: [pass('Ridge Trail', 0, 100, 2230, 209, 540, 2925)],
    unmatchedM: 0,
  },
  {
    id: 'w_demo031',
    passes: [pass('Ridge Trail', 0, 100, 2318, 215, 720, 2934)],
    unmatchedM: 120,
  },
];

/** Routes like this: activities paired with each other, either way round. */
export const DEMO_ROUTE_PAIRS: readonly (readonly [string, string])[] = [
  ['w_demo011', 'w_demo012'],
  ['w_demo011', 'w_demo034'],
  ['w_demo008', 'w_demo025'],
  ['w_demo008', 'w_demo031'],
];
