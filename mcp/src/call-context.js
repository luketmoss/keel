// State that belongs to one tool call.
//
// A Worker isolate serves several requests at once, so nothing about a call may
// live in a module variable: two calls interleaving would see each other's. The
// store follows the call through its awaits instead (AsyncLocalStorage, enabled
// by the `nodejs_als` compatibility flag in wrangler.toml).

import { AsyncLocalStorage } from 'node:async_hooks';

import { WriteLimitError, limitMessage } from './budget.js';

const storage = new AsyncLocalStorage();

/**
 * Run `fn` as one tool call, with a fresh state. Returns `fn`'s result and the
 * state it left behind, so the caller can read what the call did.
 */
export async function runToolCall(fn) {
  // The id the apps group this call's log rows under (#412). One per tool call, held
  // here with the rest of the call's state, never in a module variable.
  const state = { wrote: false, reserved: false, rows: undefined, callId: globalThis.crypto.randomUUID() };
  const result = await storage.run(state, fn);
  return { result, state };
}

/**
 * Say how many rows this call will write, once the tool has planned it. The
 * hourly budget counts this; without it the first request's own size is used.
 */
export function declareRows(rows) {
  const state = storage.getStore();
  if (state) state.rows = rows;
}

/**
 * Admit this tool call to the hourly write budget (#410), once, at its first
 * write request. Later requests of the same call ride on that admission. A call
 * that never sends a request (a validation refusal, a cap preview) never gets
 * here, so it is not counted; one whose request then fails is, because it may
 * have landed. A no-op outside a tool call or with no budget configured.
 *
 * @param {{reserve(rows: number): Promise<{allowed: boolean}>} | undefined} budget
 * @param {'Thrive' | 'Hive'} app
 * @param {number} fallbackRows - the first request's own row count
 */
export async function reserveWrite(budget, app, fallbackRows) {
  const state = storage.getStore();
  if (!state || state.reserved || !budget) return;
  const verdict = await budget.reserve(state.rows ?? fallbackRows);
  if (!verdict.allowed) throw new WriteLimitError(limitMessage(app, verdict));
  state.reserved = true;
}

/** This tool call's id, or undefined outside one. Sent as `call_id` on every write request. */
export function currentCallId() {
  return storage.getStore()?.callId;
}

/** Record that this call changed data. A no-op outside a tool call. */
export function markWrote() {
  const state = storage.getStore();
  if (state) state.wrote = true;
}
