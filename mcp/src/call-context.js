// State that belongs to one tool call.
//
// A Worker isolate serves several requests at once, so nothing about a call may
// live in a module variable: two calls interleaving would see each other's. The
// store follows the call through its awaits instead (AsyncLocalStorage, enabled
// by the `nodejs_als` compatibility flag in wrangler.toml).

import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/**
 * Run `fn` as one tool call, with a fresh state. Returns `fn`'s result and the
 * state it left behind, so the caller can read what the call did.
 */
export async function runToolCall(fn) {
  const state = { wrote: false };
  const result = await storage.run(state, fn);
  return { result, state };
}

/** Record that this call changed data. A no-op outside a tool call. */
export function markWrote() {
  const state = storage.getStore();
  if (state) state.wrote = true;
}
