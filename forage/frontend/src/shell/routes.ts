// The current tab lives in the URL hash (`#/plan`), so reload and back work.
// Only the hash is ever written: the query, and so `?demo=true`, is kept.
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

export const currentTab = signal<TabId>(parseHash(window.location.hash) ?? DEFAULT_TAB);

/**
 * Follow the hash. An unknown or missing one opens Plan and is rewritten in
 * place, adding no history entry.
 */
export function syncFromHash(): void {
  const id = parseHash(window.location.hash);
  if (id) {
    currentTab.value = id;
    return;
  }
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search}${tabHash(DEFAULT_TAB)}`);
  currentTab.value = DEFAULT_TAB;
}
