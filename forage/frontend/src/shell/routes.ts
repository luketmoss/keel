// The current tab lives in the URL hash (`#/plan`), so reload and back work.
// Only the hash is ever written: the query, and so `?demo=true`, is kept.
// #708 adds one full-screen route outside the tabs: log mode,
// `#/cook/<recipe id>[?plan=<plan id>]`, which #709 and #711 reuse.
import { signal } from '@preact/signals';

export const TAB_IDS = ['plan', 'shop', 'eaten', 'library'] as const;
export type TabId = (typeof TAB_IDS)[number];

export const DEFAULT_TAB: TabId = 'plan';

/** The tab a hash names, or null for anything else. */
export function parseHash(hash: string): TabId | null {
  const id = hash.replace(/^#\/?/, '');
  return (TAB_IDS as readonly string[]).includes(id) ? (id as TabId) : null;
}

export function tabHash(id: TabId): string {
  return `#/${id}`;
}

export interface CookRoute {
  recipeId: string;
  /** The plan entry the cook is, or ''. */
  planId: string;
}

/** `#/cook/rc_1a2b3c4d?plan=pl_9` as a route, or null. */
export function parseCookHash(hash: string): CookRoute | null {
  const m = /^#\/cook\/([A-Za-z0-9_-]{1,64})(?:\?(.*))?$/.exec(hash);
  if (!m) return null;
  const plan = new URLSearchParams(m[2] ?? '').get('plan') ?? '';
  return { recipeId: m[1], planId: /^[A-Za-z0-9_-]{1,64}$/.test(plan) ? plan : '' };
}

export function cookHash(recipeId: string, planId = ''): string {
  return `#/cook/${recipeId}${planId ? `?plan=${encodeURIComponent(planId)}` : ''}`;
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
    window.history.pushState(window.history.state, '', `${pathname}${search}${cookHash(open.recipeId, open.planId)}`);
    return;
  }
  cookRoute.value = null;
  const id = parseHash(hash);
  if (id) {
    currentTab.value = id;
    return;
  }
  window.history.replaceState(window.history.state, '', `${pathname}${search}${tabHash(DEFAULT_TAB)}`);
  currentTab.value = DEFAULT_TAB;
}
