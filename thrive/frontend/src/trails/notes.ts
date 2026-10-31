// The notes that keep an absence from reading as "never" (#690): activities not
// tagged yet, and cells that could not be read. Pure; the wording is the design
// note's, in full.

import { whenCompare, unreadableSentence, type ActivityWhen } from './source';

const join = (...parts: (string | null)[]) => parts.filter((p) => p !== null).join(' ');

/** Under search results and the no-match line: the count is of untagged activities across all months. */
export function searchNote(untagged: number, unreadable: number): string | null {
  const untaggedSentence =
    untagged === 0
      ? null
      : untagged === 1
        ? "1 activity not tagged yet. Its trails aren't listed."
        : `${untagged} activities not tagged yet. Their trails aren't listed.`;
  return join(untaggedSentence, unreadableSentence(unreadable)) || null;
}

/**
 * On the Trail screen, under Last time: the most relevant of two, never both. Untagged activities newer than
 * the last time may hide a later visit; otherwise any untagged one may have been on the trail.
 */
export function trailScreenNote(
  untagged: readonly ActivityWhen[],
  unreadable: number,
  last: ActivityWhen,
): string | null {
  const newer = untagged.filter((u) => whenCompare(u, last) > 0).length;
  let note: string | null = null;
  if (newer > 0) {
    note =
      newer === 1
        ? '1 newer activity not tagged yet, so this may not be the last time.'
        : `${newer} newer activities not tagged yet, so this may not be the last time.`;
  } else if (untagged.length > 0) {
    note =
      untagged.length === 1
        ? '1 activity not tagged yet. It may have been on this trail.'
        : `${untagged.length} activities not tagged yet. They may have been on this trail.`;
  }
  return join(note, unreadableSentence(unreadable)) || null;
}

/** Under "Trail not found": when untagged activities may hold the trail. The unreadable sentence is appended. */
export function notFoundNote(untagged: number, unreadable: number): string | null {
  const note =
    untagged === 0
      ? null
      : untagged === 1
        ? '1 activity not tagged yet, so it may be in there.'
        : `${untagged} activities not tagged yet, so it may be in one of them.`;
  return join(note, unreadableSentence(unreadable)) || null;
}
