// Trail search (#682): a substring of any name a trail is mapped under. Pure.

import type { TrailGroup } from './types';

/** The query as searched: trimmed. Blank is not a search. */
export function searchTerm(query: string): string | null {
  const term = query.trim();
  return term === '' ? null : term;
}

/** The latest visit's date and time, for newest-first order. */
function lastWhen(group: TrailGroup): string {
  const last = group.visits[group.visits.length - 1];
  return last ? `${last.date}T${last.time}` : '';
}

/**
 * The groups with a variant containing the query, ignoring case, newest last
 * time first; null when the query is blank.
 */
export function searchTrails(groups: Iterable<TrailGroup>, query: string): TrailGroup[] | null {
  const term = searchTerm(query);
  if (term === null) return null;
  const needle = term.toLowerCase();
  return [...groups]
    .filter((g) => [g.name, ...g.otherNames].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => lastWhen(b).localeCompare(lastWhen(a)) || a.name.localeCompare(b.name));
}
