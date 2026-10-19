// Client-side business rule helpers.
// applyStatusSideEffects, statusTransitionAuditAction, isBoardArchived and normalizeCompletedAt are duplicated in
// apps-script/src/rules.js — keep in sync.

import type { Item, ItemStatus } from '../api/types';

/**
 * #252: `isTerminal` is required, and the second branch is a plain `else if`.
 *
 * Both are deliberate. The parameter arrived in #219 as an optional bolted onto
 * a two-argument signature, and `isTerminal === false` was the scaffolding that
 * let the not-yet-updated callers through — so a missing argument meant "leave
 * completed_at alone" here while the Apps Script copy read it as non-terminal
 * and cleared the field. Two doors into one sheet, disagreeing about a move.
 *
 * Every caller now passes an explicit boolean, so the scaffolding is gone: the
 * argument is required, and anything falsy means non-terminal on both copies —
 * which is what the sibling rule below has always done. Do not re-tighten this
 * to `=== false`; `apps-script/tests/rules-parity.test.ts` fails if you do.
 */
export function applyStatusSideEffects(item: Item, newStatus: ItemStatus, isTerminal: boolean): Item {
  const now = new Date().toISOString();

  let completed_at = item.completed_at;
  if (isTerminal) {
    // Moving to a terminal column — set completed_at
    completed_at = now;
  } else if (item.completed_at) {
    // Moving away from a terminal column — clear completed_at
    completed_at = '';
  }

  return {
    ...item,
    status: newStatus,
    updated_at: now,
    completed_at,
  };
}

/**
 * #239: The durable completion event for a status change, or null if the move
 * is neither a completion nor a reopening.
 *
 * The branches mirror applyStatusSideEffects exactly — that is the point.
 * `completed_at` records whether an item is *currently* done and is cleared on
 * the way out; the Audit Log records that it *was* done on a given day and
 * never changes. Emitting the verdict as its own action keeps it self-describing:
 * an audit row stores a status name, and `is_terminal` is a mutable per-board
 * flag, so a consumer inferring completion from a historical status name would
 * silently reinterpret history whenever a column is reconfigured.
 *
 * MUST be called with the item as it was *before* applyStatusSideEffects, which
 * clears completed_at.
 */
export function statusTransitionAuditAction(
  item: Pick<Item, 'completed_at'>,
  isTerminal: boolean
): 'completed' | 'reopened' | null {
  if (isTerminal) return 'completed';
  if (item.completed_at) return 'reopened';
  return null;
}

/**
 * #288: A board is archived when its `archived_at` cell holds anything.
 * Duplicated in apps-script/src/rules.js — keep in sync. Everything on an
 * archived board is hidden from both doors whatever its status, and an empty
 * or missing cell (older sheets have no column G) means active.
 */
export function isBoardArchived(board: { archived_at?: string } | null | undefined): boolean {
  return !!(board && String(board.archived_at || '').trim());
}

/**
 * #458: validate and normalise an explicit `completed_at`. Duplicated in
 * apps-script/src/rules.js — keep in sync (rules-parity.test.ts runs both).
 * No UI uses it yet: luketmoss/hive#280 consumes this helper.
 *
 * Accepts a date `YYYY-MM-DD` (stored as 12:00:00.000Z on that date: noon UTC
 * keeps the calendar date in every zone from UTC-11 to UTC+11) or a full ISO
 * 8601 timestamp with `Z` or a `+-hh:mm` offset, and returns it as
 * `YYYY-MM-DDTHH:mm:ss.sssZ`. Returns null for anything else: a non-string or
 * empty value, a timestamp with no zone, an impossible date such as
 * 2026-02-30, or an instant more than 24 hours after `now`. No lower bound.
 */
export function normalizeCompletedAt(value: unknown, now: Date | number | string): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;

  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const full = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(v);
  const parts = date || full;
  if (!parts) return null;

  // V8 rolls 2026-02-30 over to March 2 instead of refusing it, so the calendar
  // date is checked on its own.
  const y = Number(parts[1]);
  const m = Number(parts[2]);
  const d = Number(parts[3]);
  const calendar = new Date(Date.UTC(y, m - 1, d));
  if (calendar.getUTCFullYear() !== y || calendar.getUTCMonth() !== m - 1 || calendar.getUTCDate() !== d) {
    return null;
  }

  const instant = date ? new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0)) : new Date(v);
  if (isNaN(instant.getTime())) return null;

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (instant.getTime() > nowMs + 24 * 60 * 60 * 1000) return null;
  return instant.toISOString();
}
