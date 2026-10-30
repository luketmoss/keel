// #655: filtering and grouping for the Completed Items dialog. Pure, so the date
// boundaries are testable: `today` is passed in rather than read from the clock.
import type { ItemWithRow } from '../api/types';
import { addLocalDays, localYmdOf, toLocalYmd } from './completed-date';

export type CompletedRange = 'any' | '7d' | '30d' | 'year' | 'custom';

export interface CompletedFilter {
  text: string;
  range: CompletedRange;
  /** Custom range bounds, YYYY-MM-DD, '' when blank. Only read when range is 'custom'. */
  from: string;
  to: string;
  /** The one label kept, or null for every label. */
  label: string | null;
}

export interface MonthGroup {
  /** YYYY-MM, or 'none' for items with no completion date. */
  key: string;
  heading: string;
  items: ItemWithRow[];
}

export const NO_FILTER: CompletedFilter = { text: '', range: 'any', from: '', to: '', label: null };

/** The labels on an item, trimmed, in the order stored. */
export function itemLabels(item: ItemWithRow): string[] {
  return item.labels
    ? item.labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
}

/** True when a custom range has both bounds and To is before From. */
export function isRangeInverted(f: Pick<CompletedFilter, 'range' | 'from' | 'to'>): boolean {
  return f.range === 'custom' && !!f.from && !!f.to && f.to < f.from;
}

/** True when any of search, date or label narrows the list. */
export function isFilterOn(f: CompletedFilter): boolean {
  return f.text.trim() !== '' || f.range !== 'any' || f.label !== null;
}

function passesDate(ymd: string, f: CompletedFilter, todayYmd: string): boolean {
  switch (f.range) {
    case 'any':
      return true;
    case '7d':
      return ymd !== '' && ymd >= addLocalDays(todayYmd, -6);
    case '30d':
      return ymd !== '' && ymd >= addLocalDays(todayYmd, -29);
    case 'year':
      return ymd !== '' && ymd >= `${todayYmd.slice(0, 4)}-01-01`;
    case 'custom': {
      if (isRangeInverted(f)) return true; // ignored until fixed
      if (!f.from && !f.to) return true;
      if (ymd === '') return false;
      if (f.from && ymd < f.from) return false;
      if (f.to && ymd > f.to) return false;
      return true;
    }
  }
}

const byCompletedDesc = (a: ItemWithRow, b: ItemWithRow) => {
  const at = a.completed_at ? new Date(a.completed_at).getTime() : 0;
  const bt = b.completed_at ? new Date(b.completed_at).getTime() : 0;
  return bt - at;
};

/** The items that pass search, date and label, newest completed first. */
export function filterCompleted(items: ItemWithRow[], f: CompletedFilter, today: Date): ItemWithRow[] {
  const todayYmd = toLocalYmd(today);
  const text = f.text.trim().toLowerCase();
  return items
    .filter((item) => {
      if (text && !item.title.toLowerCase().includes(text) && !(item.description ?? '').toLowerCase().includes(text)) {
        return false;
      }
      if (f.label !== null && !itemLabels(item).includes(f.label)) return false;
      return passesDate(localYmdOf(item.completed_at), f, todayYmd);
    })
    .sort(byCompletedDesc);
}

function monthHeading(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Month groups of already-sorted items, newest month first; undated items in a last group. */
export function groupByMonth(items: ItemWithRow[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const undated: ItemWithRow[] = [];
  for (const item of items) {
    const ymd = localYmdOf(item.completed_at);
    if (!ymd) {
      undated.push(item);
      continue;
    }
    const key = ymd.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, heading: monthHeading(key), items: [item] });
  }
  if (undated.length > 0) groups.push({ key: 'none', heading: 'No completion date', items: undated });
  return groups;
}

/** "Oct 14", or "Oct 14, 2025" outside the current year; '' when there is no date. */
export function formatCompletedDate(iso: string, today: Date): string {
  if (!localYmdOf(iso)) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(
    'en-US',
    sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' },
  );
}

/**
 * Labels carried by at least one of `items`, in `order` (the board's label order);
 * a label no longer on the board follows, in first-seen order.
 */
export function labelsUsed(items: ItemWithRow[], order: string[]): string[] {
  const used = new Set<string>();
  for (const item of items) for (const l of itemLabels(item)) used.add(l);
  const known = order.filter((l) => used.has(l));
  const unknown = [...used].filter((l) => !order.includes(l));
  return [...known, ...unknown];
}
