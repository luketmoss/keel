import type { Board } from '../api/types';

// #656: a person's own board order, kept in this browser's localStorage. Pure helpers
// here; board-store.ts holds the signal that makes it reactive.

export function boardOrderKey(email: string): string {
  return `hive-board-order:${email.toLowerCase()}`;
}

/** Saved order for a person, or [] when none, malformed, or localStorage throws. */
export function loadBoardOrder(email: string): string[] {
  if (!email) return [];
  try {
    const raw = localStorage.getItem(boardOrderKey(email));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Best-effort save. Returns false when localStorage is unavailable; the caller keeps the order in memory. */
export function saveBoardOrder(email: string, ids: string[]): boolean {
  if (!email) return false;
  try {
    localStorage.setItem(boardOrderKey(email), JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

/** Boards in the saved order; boards not in it follow in their original (sheet) order. Unknown ids are ignored. */
export function applyBoardOrder(boards: Board[], saved: string[]): Board[] {
  if (saved.length === 0) return boards;
  const rank = new Map<string, number>();
  saved.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const listed = boards.filter((b) => rank.has(b.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  const unlisted = boards.filter((b) => !rank.has(b.id));
  return [...listed, ...unlisted];
}

/** Move `id` so it sits at `toIndex` in the result. Returns the same array if nothing changes. */
export function moveId(ids: string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const to = Math.max(0, Math.min(ids.length - 1, toIndex));
  if (to === from) return ids;
  const next = ids.filter((x) => x !== id);
  next.splice(to, 0, id);
  return next;
}

/**
 * The index `dragId` ends up at when dropped before/after `targetId`, in a list of `ids`.
 * Null when the drop is not a valid target (itself, or an unknown id).
 */
export function dropIndex(ids: string[], dragId: string, targetId: string, where: 'before' | 'after'): number | null {
  if (dragId === targetId || !ids.includes(dragId) || !ids.includes(targetId)) return null;
  const rest = ids.filter((x) => x !== dragId);
  const t = rest.indexOf(targetId);
  return where === 'before' ? t : t + 1;
}
