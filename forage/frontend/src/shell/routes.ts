// The current tab lives in the URL hash (`#/plan`), so reload and back work.
// Only the hash is ever written: the query, and so `?demo=true`, is kept.
// #708 adds one full-screen route outside the tabs: log mode,
// `#/cook/<recipe id>[?plan=<plan id>]`, which #709 and #711 reuse; #711 adds
// `mode=walkthrough` for walkthrough mode inside the same frame.
import { signal } from '@preact/signals';
import { localDate } from '../cook/format';
import { eatenDate } from '../eaten/eaten-store';
import { addDays } from '../plan/dates';

export const TAB_IDS = ['plan', 'shop', 'eaten', 'library'] as const;
export type TabId = (typeof TAB_IDS)[number];

export const DEFAULT_TAB: TabId = 'plan';

/** The tab a hash names, or null for anything else. */
export function parseHash(hash: string): TabId | null {
  const id = hash.replace(/^#\/?/, '');
  // #825: anything under `#/eaten/` is Eaten, whatever follows.
  if (id.startsWith('eaten/')) return 'eaten';
  return (TAB_IDS as readonly string[]).includes(id) ? (id as TabId) : null;
}

export function tabHash(id: TabId): string {
  return `#/${id}`;
}

/**
 * #825: the day a `#/eaten/<date>` hash names. `null` for a hash that is not under `#/eaten/`, and for the bare
 * `#/eaten`, which keeps the day last shown. A date that is not `YYYY-MM-DD`, not a calendar date, today or after
 * it opens today; `rewrite` says the hash should then be put back to `#/eaten`.
 */
export function parseEatenHash(hash: string, today = localDate()): { date: string; rewrite: boolean } | null {
  const m = /^#\/eaten\/(.*)$/.exec(hash);
  if (!m) return null;
  const given = m[1];
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(given) && addDays(given, 0) === given && given < today;
  return valid ? { date: given, rewrite: false } : { date: today, rewrite: true };
}

/** The hash that follows the day Eaten shows: dated before today, plain on it. */
export function eatenHash(date: string, today: string): string {
  return date < today ? `#/eaten/${date}` : tabHash('eaten');
}

export interface CookRoute {
  recipeId: string;
  /** The plan entry the cook is, or ''. */
  planId: string;
  /** #711: `walkthrough` when the Cook choice sheet chose it, else `log`. */
  mode: 'walkthrough' | 'log';
}

/** `#/cook/rc_1a2b3c4d?plan=pl_9` as a route, or null. */
export function parseCookHash(hash: string): CookRoute | null {
  const m = /^#\/cook\/([A-Za-z0-9_-]{1,64})(?:\?(.*))?$/.exec(hash);
  if (!m) return null;
  const query = new URLSearchParams(m[2] ?? '');
  const plan = query.get('plan') ?? '';
  return {
    recipeId: m[1],
    planId: /^[A-Za-z0-9_-]{1,64}$/.test(plan) ? plan : '',
    mode: query.get('mode') === 'walkthrough' ? 'walkthrough' : 'log',
  };
}

export function cookHash(recipeId: string, planId = '', mode: 'walkthrough' | 'log' = 'log'): string {
  const query = new URLSearchParams();
  if (planId) query.set('plan', planId);
  if (mode === 'walkthrough') query.set('mode', 'walkthrough');
  const q = query.toString();
  return `#/cook/${recipeId}${q ? `?${q}` : ''}`;
}

export const currentTab = signal<TabId>(parseHash(window.location.hash) ?? DEFAULT_TAB);
export const cookRoute = signal<CookRoute | null>(parseCookHash(window.location.hash));

/**
 * While log mode is open it may hold the browser's Back: the guard answers
 * true to keep the cook on screen (it then asks "Leave this cook?").
 */
let leaveGuard: (() => boolean) | null = null;

export function setLeaveGuard(guard: (() => boolean) | null): void {
  leaveGuard = guard;
}

/**
 * Follow the hash. An unknown or missing one opens Plan and is rewritten in
 * place, adding no history entry.
 */
export function syncFromHash(): void {
  const { pathname, search, hash } = window.location;
  const cook = parseCookHash(hash);
  if (cook) {
    cookRoute.value = cook;
    return;
  }
  const open = cookRoute.value;
  if (open && leaveGuard && leaveGuard()) {
    // Back was pressed mid-cook: put the cook's entry back and let it ask.
    window.history.pushState(
      window.history.state,
      '',
      `${pathname}${search}${cookHash(open.recipeId, open.planId, open.mode)}`,
    );
    return;
  }
  cookRoute.value = null;
  const id = parseHash(hash);
  if (id) {
    const eaten = parseEatenHash(hash);
    if (eaten) {
      if (eatenDate.value !== eaten.date) eatenDate.value = eaten.date;
      if (eaten.rewrite)
        window.history.replaceState(window.history.state, '', `${pathname}${search}${tabHash('eaten')}`);
    }
    currentTab.value = id;
    return;
  }
  window.history.replaceState(window.history.state, '', `${pathname}${search}${tabHash(DEFAULT_TAB)}`);
  currentTab.value = DEFAULT_TAB;
}
