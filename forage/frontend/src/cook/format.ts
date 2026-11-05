// Small, pure helpers for recipes and cooking (#708): stars, dates, the clock.
import type { Slot } from '../api/types';

/** `★★★★☆` for 4. */
export function starsText(rating: number): string {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** `4 of 5 stars`. */
export function starsLabel(rating: number): string {
  return `${rating} of 5 stars`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `Oct 28` for a date this year, `Oct 28, 2025` for another. `now` is for tests. */
export function shortDate(iso: string, now = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const label = `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
  return Number(m[1]) === now.getFullYear() ? label : `${label}, ${m[1]}`;
}

/** The device's date as YYYY-MM-DD. */
export function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `m:ss` under an hour, `h:mm:ss` from one hour. Negative counts as zero. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** `1 hr 5 min`, `12 min`, `45 sec`, for a screen reader or the done screen's caption. */
export function durationWords(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (!h && !m) return `${total} sec`;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

/** A timer's label: `5 min`, `1 hr`, `90 min`. */
export function timerLabel(minutes: number): string {
  return minutes === 60 ? '1 hr' : `${minutes} min`;
}

/** The meal slot by the time of day: before 11:00 Breakfast, before 15:00 Lunch, before 21:00 Dinner, else After dinner. */
export function slotForTime(now = new Date()): Slot {
  const h = now.getHours();
  if (h < 11) return 'Breakfast';
  if (h < 15) return 'Lunch';
  if (h < 21) return 'Dinner';
  return 'After dinner';
}

/** A cook id made on the device, so a retried save upserts the same row: `ck_` + 8 hex. */
export function newCookId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `ck_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** `1 serving`, `2 servings`. */
export function servingsText(n: number): string {
  return `${n} ${n === 1 ? 'serving' : 'servings'}`;
}
