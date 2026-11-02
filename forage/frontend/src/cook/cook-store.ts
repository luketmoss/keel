// The cook in progress (#708), kept in localStorage under `forage_cook` so a
// reload, a closed tab or a sleeping phone returns to it exactly. Storage that
// throws or is missing falls back to memory: the cook works for the session and
// nothing says so. Also the two small per-device memories of #708: the last
// cook mode chosen and the "How was it?" cards dismissed.

export const COOK_KEY = 'forage_cook';
export const MODE_KEY = 'forage_cook_mode';
export const RATE_SKIP_KEY = 'forage_rate_skip';

export interface CookTimer {
  id: string;
  minutes: number;
  /** When it reaches zero, as epoch ms: the countdown is to this, so it is right after the tab slept. */
  ends_at: number;
}

export interface ActiveCook {
  recipe_id: string;
  recipe_name: string;
  /** Epoch ms. */
  started_at: number;
  /** `L1`… for ingredient lines, `S1`… for steps by position. */
  checked: string[];
  timers: CookTimer[];
  plan_id: string;
  /** Made when the cook starts, so a retried Finish upserts the one row. */
  cook_id: string;
}

let memory: Record<string, string> = {};

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory[key] ?? null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    if (value === null) delete memory[key];
    else memory[key] = value;
  }
}

export function readCook(): ActiveCook | null {
  const raw = read(COOK_KEY);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as ActiveCook;
    if (!c || typeof c.recipe_id !== 'string' || typeof c.started_at !== 'number') return null;
    return { ...c, checked: c.checked ?? [], timers: c.timers ?? [], plan_id: c.plan_id ?? '' };
  } catch {
    return null;
  }
}

export function writeCook(cook: ActiveCook): void {
  write(COOK_KEY, JSON.stringify(cook));
}

export function clearCook(): void {
  write(COOK_KEY, null);
}

export type CookMode = 'walkthrough' | 'log';

export function readMode(): CookMode | null {
  const v = read(MODE_KEY);
  return v === 'walkthrough' || v === 'log' ? v : null;
}

export function writeMode(mode: CookMode): void {
  write(MODE_KEY, mode);
}

/** The cook ids whose "How was it?" card was dismissed on this device. */
export function readRateSkips(): string[] {
  try {
    const list = JSON.parse(read(RATE_SKIP_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function skipRating(cookId: string): void {
  const list = readRateSkips().filter((id) => id !== cookId);
  list.push(cookId);
  write(RATE_SKIP_KEY, JSON.stringify(list.slice(-50)));
}

/** Tests only. */
export function _resetCookMemory(): void {
  memory = {};
}
