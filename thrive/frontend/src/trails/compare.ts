// Like-for-like comparison (#682): a full descent and half a climb are not the
// same effort, so a pass compares only with a pass over the same stretch in the
// same direction, on an earlier activity. Pure, no view library.

import type { GroupPass, PassComparison, TrailGroup, TrailPass } from './types';

/** How far apart two passes' start and end positions may be and still compare, in points, inclusive. */
export const LIKE_FOR_LIKE_POINTS = 10;

/** Two passes in one trail group are like-for-like: same direction, start and end each within 10 points. */
export function isLikeForLike(a: TrailPass, b: TrailPass): boolean {
  return (
    a.direction === b.direction &&
    Math.abs(a.startPct - b.startPct) <= LIKE_FOR_LIKE_POINTS &&
    Math.abs(a.endPct - b.endPct) <= LIKE_FOR_LIKE_POINTS
  );
}

/**
 * What `gp` compares with: the last like-for-like pass on the most recent earlier
 * activity that has one. Laps within one activity never compare with each other.
 */
export function compareWithEarlier(group: TrailGroup, gp: GroupPass): PassComparison {
  const at = group.visits.findIndex((v) => v.activityId === gp.activityId);
  let previous: GroupPass | null = null;
  for (let i = at - 1; i >= 0 && !previous; i--) {
    const matches = group.visits[i].passes.filter((p) => isLikeForLike(p.pass, gp.pass));
    previous = matches.length > 0 ? matches[matches.length - 1] : null;
  }
  if (!previous) return { previous: null, timeDiffS: null, climbDiffM: null };
  const diff = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);
  return {
    previous,
    timeDiffS: diff(gp.pass.durationS, previous.pass.durationS),
    climbDiffM: diff(gp.pass.climbM, previous.pass.climbM),
  };
}
