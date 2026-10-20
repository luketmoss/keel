// #489 — whether a set row has been performed. A copy of the MCP server's
// `isSetLogged` (`mcp/src/thrive/domain.js`): change both together.
import type { WorkoutSet } from './types';

/**
 * A planned workout's weight may be a load prescribed at schedule time, so
 * there only reps or effort count; a done or active workout counts reps or
 * weight.
 */
export function isSetLogged(set: Pick<WorkoutSet, 'reps' | 'weight' | 'effort'>, planned: boolean): boolean {
  return Boolean(planned ? set.reps || set.effort : set.reps || set.weight);
}
